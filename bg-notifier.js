const DatabaseConnection = require('./database/DatabaseConnection')
const config = require('./config.json')
const Notification = require('node-mac-notifier')
const {exec} = require('child_process')
const async = require('async')
const moment = require('moment')
require('moment-timezone')
const request = require('request-promise')

const database = new DatabaseConnection(config.databaseURL, 'BusTracker')
let trips = null
let buses = null

// well im sorry ok its not my fault you cant afford a mac
function showNotification(title, subtitle, message) {
  exec(`osascript -e 'display notification "${message.replace('"', '\\"')}" with title "${title.replace('"', '\\"')}" subtitle "${subtitle.replace('"', '\\"')}"'`)
}

let busQuery = {$or: [
  {
    model: new RegExp('scania .*ua', 'i')
  },
  {
    model: new RegExp('volvo .+ea', 'i')
  },
  {
    depot: 'Rail'
  },
  {
    depot: 'Rosebud'
  },
  {
    fleet: '858'
  }
]}

let tripQuery = ['788', '631', '703', '733', '737', '800', '802', '804', '862'].map(s => {return{service:s}})

database.connect({
  poolSize: 100
}, async err => {
  buses = database.getCollection('ventura buses')

  let lastUpdateSeen = []
  async function checkTrips() {
    const now = moment().tz('Australia/Melbourne')
    const startOfToday = now.clone().startOf('day')
    const minutesPastMidnight = now.diff(startOfToday, 'minutes')

    let busList = await buses.findDocuments(busQuery).toArray()
    let fleetNumbers = busList.map(bus => bus.fleet)
    if (!fleetNumbers.length) fleetNumbers = [0]

    let search = fleetNumbers.map(fleet => {return {fleet}}).concat(tripQuery)

    let tripsRunning = await async.filter(JSON.parse(await request('https://vic.transportsg.me/tracker/all')), async trip => {
      let fleetMatch = false
      let svcMatch = false
      search.forEach(search => {
        if (!fleetMatch)
          fleetMatch = search.fleet === trip.fleet
        if (!svcMatch)
          svcMatch = search.service === trip.service
      })

      if (svcMatch && !fleetNumbers.includes(trip.fleet)) {
        busList.push(await buses.findDocument({fleet: trip.fleet}))
      }

      return fleetMatch || svcMatch
    })

    let fleetNumbersSeen = []
    let nowRunning = []
    tripsRunning.sort((a, b) => b.timestamp - a.timestamp).forEach(trip => {
      if (!fleetNumbersSeen.includes(trip.fleet)) {
        fleetNumbersSeen.push(trip.fleet)
        nowRunning.push(trip)
      }
    })

    // if (lastUpdateFleetNumbers.length)
      nowRunning.forEach(trip => {
        if (!lastUpdateSeen.includes(trip.fleet + '-' + trip.service)) {
          let bus = busList.filter(bus => bus.fleet === trip.fleet)[0]
          showNotification('update', `#${trip.fleet}: ${trip.tripName}`, bus.model)
        }
      })
    lastUpdateSeen = nowRunning.map(trip => trip.fleet + '-' + trip.service)
  }

  checkTrips()
  setInterval(checkTrips.bind(this), 30000)
})
