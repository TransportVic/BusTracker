const request = require('request')
const cheerio = require('cheerio')
const urlData = require('../url_data.json')
const moment = require('moment')
require('moment-timezone')
const LoadIntoDB = require('./LoadIntoDB')
LoadIntoDB.init()

const daysOfWeek = ['Sun', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat']

module.exports = class AJAXTracker {

  constructor (service) {
    this.url = null
    this.service = service
    this.active = false

    if (urlData[service]) {
      if (urlData[service].includes('/School/RouteMap.aspx')) {
        this.url = urlData[service]
      } else throw Error(`Could not track service ${service} using poller; try websocket`)
    } else throw new Error(`Cannot find service ${service}`)
  }

  performRequest() {
    request(this.url, (err, res, body) => {
      if (!body) return setTimeout(this.performRequest.bind(this), 1000 * 60 * (1 + (Math.random()) * .5))
      const $ = cheerio.load(body)
      const scriptTag = $('#form1 > script:nth-child(6)')
      const scriptTagData = scriptTag.html().toString().trim().slice(26).replace(/\n/g, '').replace(/;var .+$/, '')
      const routeData = JSON.parse(scriptTagData)

      const buses = []
      const busIDs = []
      routeData.trips.forEach(trip => {
        trip.buses.forEach(bus => {
          if (busIDs.includes(bus.id)) return
          busIDs.push(bus.id)

          if (!bus.registration.match(/BS?(\d+)/)) return

          let service = this.service
          trip.name = trip.name.replace('DEV_', '').trim()
          
          if (trip.name.match(/^\w{3,4} .* (to|-) .*$/)) {
            service = trip.name.match(/^(\w{3,4}) .* (to|-) .*$/)[1]
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
        setTimeout(this.performRequest.bind(this), 1000 * 60 * (1 + (Math.random()) * .5))
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
