const signalR = require('signalr-client')
const polyline = require('@mapbox/polyline')
const urlData = require('../url_data.json')
const tripCodes = require('../trips.json')
const config = require('../config.json')
const moment = require('moment')
require('moment-timezone')
const LoadIntoDB = require('./LoadIntoDB')
LoadIntoDB.init()

const daysOfWeek = ['Sun', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat']

module.exports = class WebsocketTracker {

  constructor (service) {
    this.groupCode = null
    this.service = service
    
    if (urlData[service]) {
      if (urlData[service].includes('/live/')) {
        this.groupCode = urlData[service].slice(-36)
      } else throw Error(`Cannot track service ${service} using WebSockets`)
    } else throw new Error(`Cannot find service ${service}`)

    this.client = new signalR.client('wss://maps.busminder.com.au:5031/signalr', ['broadcastHub'], 3, true)
    this.client.headers['Origin'] = 'http://maps.busminder.com.au';
    this.client.headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0.2 Safari/605.1.15';
    this.client.headers['Referer'] = 'http://maps.busminder.com.au/';
    this.client.headers['Host'] = 'maps.busminder.com.au:5031';
    this.registerHandlers()
  }

  registerHandlers () {
    this.client.serviceHandlers = {
      bound: () => {
        this.client.invoke('broadcastHub', 'Register', this.groupCode)
      },
      messageReceived: this.onMessageRecieved.bind(this),
      connectFailed: () => {},
      connected: () => {},
      onerror: console.log,
      disconnected: () => {},
      reconnecting: () => true
    }
  }

  onMessageRecieved(message) {
    if (message.type === 'utf8') {
      const data = JSON.parse(message.utf8Data)
      if (!(data.M && data.M[0] && data.M[0].A[0])) return

      const bus = JSON.parse(data.M[0].A[0])
      if (!bus.Route || !bus.Reg) return
      const position = polyline.decode(bus.Route).slice(-1)[0]
      let fleetNumber = bus.Reg.match(/BS?(\d+)/)
      if (!fleetNumber) return
      fleetNumber = fleetNumber[1]
      const runNumber = bus.BusId

      let service = tripCodes[bus.TripId]
      if (!service) service = this.service
      if (service.match(/^\d{3}[A-Za-z]? .* (to|-) .*$/)) {
        service = service.match(/^(\d{3}[A-Za-z]?) .* (to|-) .*$/)[1]
      }

      this.updateBusLocation({
        fleet: fleetNumber,
        service: service,
        runNumber,
        position,
        tripName: tripCodes[bus.TripId]
      })
    }
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
    this.client.start()
  }

  stop() {
    this.client.end()
  }
}
