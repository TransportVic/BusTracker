const request = require('request')
const cheerio = require('cheerio')
const urlData = require('../url_data.json')
const tripCodes = require('../trips.json')
const config = require('../config.json')
const polyline = require('@mapbox/polyline')
const moment = require('moment')
require('moment-timezone')
const LoadIntoDB = require('./LoadIntoDB')
LoadIntoDB.init()

const daysOfWeek = ['Sun', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat']

module.exports = class AJAXTracker {

  constructor (service, baseFreq=config.ajaxBaseFreq) {
    this.url = null
    this.service = service
    this.active = false
    this.baseFreq = baseFreq
    this.venturaBM = urlData[service].includes('ventura.busminder.com.au')
    this.forcedAjax = urlData[service].includes('/live/')

    if (urlData[service]) {
      if (this.forcedAjax) {
        this.url = urlData[service]
        console.log('Forced AJAX on ' + service)
      } else if (urlData[service].includes('/School/RouteMap.aspx') || this.venturaBM) {
        this.url = urlData[service]
      } else throw Error(`Could not track service ${service} using poller; try websocket`)
    } else throw new Error(`Cannot find service ${service}`)
  }

  performRequest() {
    request({
      method: 'GET',
      uri: this.url,
      gzip: true,
      headers: (this.forcedAjax ? {
        'Origin': 'http://maps.busminder.com.au',
        'User-Agent': 'Mozilla/5.0 (Macintosh, Intel Mac OS X 10_14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0.2 Safari/605.1.15',
        'Referer': 'http://maps.busminder.com.au/',
        'Host': 'maps.busminder.com.au:5031'
      } : {
        'User-Agent': 'Mozilla/5.0 (Macintosh, Intel Mac OS X 10_14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0.2 Safari/605.1.15',
        'Host': 'www.busminder.com.au'
      })
    }, (err, res, body) => {
      if (!body) return setTimeout(this.performRequest.bind(this), 1000 * 60 * (this.baseFreq + (Math.random()) * .5))

      const $ = cheerio.load(body)
      let scriptTag = $('#form1 > script:nth-child(6)')
      let routeData

      if (!scriptTag.length) { // ajax based for websocket method
        scriptTag = $('body > script:nth-child(8)')
      }

      let scriptTagData = scriptTag.html().toString().trim().slice(26).replace(/\n/g, '').replace(/;var .+$/, '')
      if (this.forcedAjax) scriptTagData = scriptTagData.slice(0, -2);
      eval('routeData=' + scriptTagData)

      const buses = []
      const busIDs = []

      let trips = routeData.trips || routeData.routes

      if (!trips) return setTimeout(this.performRequest.bind(this), 1000 * 60 * (this.baseFreq + (Math.random()) * .5))
      trips.forEach(trip => {
        if (!trip.buses) return setTimeout(this.performRequest.bind(this), 1000 * 60 * (this.baseFreq + (Math.random()) * .5))
        trip.buses.forEach(bus => {
          if (busIDs.includes(bus.id)) return
          busIDs.push(bus.id)

          if (!bus.registration.match(/BS?(\d+)/)) return

          if (this.forcedAjax) {
            trip.name = tripCodes[trip.id] || routeData.legend.filter(t=>t.id == trip.id)[0].name
            if (!trip.name) return console.log(this.service)
            let position = polyline.decode(bus.position).slice(-1)[0]

            bus.lat = position[0]
            bus.lng = position[1]
          }

          trip.name = trip.name.replace('DEV_', '').trim()
          let service = trip.name

          if (service.match(/^\d{3}[A-Za-z]? .* (to|-) .*$/)) {
            service = service.match(/^(\d{3}[A-Za-z]?) .* (to|-) .*$/)[1]
          }

          this.updateBusLocation({
            fleet: bus.registration.match(/BS?(\d+)/)[1],
            service: service,
            runNumber: bus.id,
            position: [bus.lat, bus.lng],
            tripName: trip.name
          })
        })
      })

      if (this.active)
        setTimeout(this.performRequest.bind(this), 1000 * 60 * (this.baseFreq + (Math.random()) * .5))
    })
  }

  updateBusLocation(bus) {
    const now = moment().tz('Australia/Melbourne')
    const startOfToday = now.clone().startOf('day')
    const minutesPastMidnight = now.diff(startOfToday, 'minutes')
    const today = daysOfWeek[now.day()]

    bus.date = now.format('YYYY-MM-DD')
    bus.time = minutesPastMidnight
    bus.dayOfWeek = today
    bus.timestamp = +now

    LoadIntoDB.process(bus)
  }

  start() {
    this.active = true
    this.performRequest()
  }

  stop() {
    this.active = false
  }
}
