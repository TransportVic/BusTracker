const request = require('request')
const cheerio = require('cheerio')
const urlData = require('../url_data.json')
const tripCodes = require('../trips.json')
const polyline = require('@mapbox/polyline')
const moment = require('moment')
require('moment-timezone')
const LoadIntoDB = require('./LoadIntoDB')
LoadIntoDB.init()

const daysOfWeek = ['Sun', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat']

module.exports = class AJAXTracker {

  constructor (service, baseFreq=3.5) {
    this.url = null
    this.service = service
    this.active = false
    this.baseFreq = baseFreq
    this.unsafeEval = urlData[service].includes('ventura.busminder.com.au')
    this.forcedAjax = urlData[service].includes('/live/')

    if (urlData[service]) {
      if (this.forcedAjax) {
        this.url = urlData[service]
        console.log('Forced AJAX on ' + service)
      } else if (urlData[service].includes('/School/RouteMap.aspx') || this.unsafeEval) {
        this.url = urlData[service]
      } else throw Error(`Could not track service ${service} using poller; try websocket`)
    } else throw new Error(`Cannot find service ${service}`)
  }

  performRequest() {
    request(this.url, (err, res, body) => {
      if (!body) return setTimeout(this.performRequest.bind(this), 1000 * 60 * (this.baseFreq + (Math.random()) * .5))

      const $ = cheerio.load(body)
      const scriptTag = $('#form1 > script:nth-child(6)')
      let routeData

      if (!scriptTag.length) { // ajax based for websocket method
        routeData = JSON.parse($('body > script:nth-child(8)').html().trim().slice(26, -2))
      } else {
        const scriptTagData = scriptTag.html().toString().trim().slice(26).replace(/\n/g, '').replace(/;var .+$/, '')
        if (this.unsafeEval) eval('routeData=' + scriptTagData)
        else routeData = JSON.parse(scriptTagData)
      }

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

          let service = this.service
          if (this.forcedAjax) {
            trip.name = tripCodes[trip.id] || routeData.legend.filter(t=>t.id == trip.id)[0].name
            if (!trip.name) return console.log(this.service)
            let position = polyline.decode(bus.position).slice(-1)[0]

            bus.lat = position[0]
            bus.lng = position[1]
          }
          trip.name = trip.name.replace('DEV_', '').trim()

          if (trip.name.match(/^\d{3}\w? .* (to|-) .*$/)) {
            service = trip.name.match(/^(\d{3}\w?) .* (to|-) .*$/)[1]
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
