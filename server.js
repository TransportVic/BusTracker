const DatabaseConnection = require('./database/DatabaseConnection')
const config = require('./config.json')
const express = require('express')
const moment = require('moment')
require('moment-timezone')
const querystring = require('querystring')
const url = require('url')
const async = require('async')
const path = require('path')
const safeRegex = require('safe-regex')

const app = express()

app.use('/static', express.static(path.join(__dirname, 'static')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'pug')
if (process.env['NODE_ENV'] && process.env['NODE_ENV'] === 'prod') { app.set('view cache', true) }
app.set('x-powered-by', false)
app.set('strict routing', false)

const database = new DatabaseConnection(config.databaseURL, 'BusTracker')
let trips = null
let buses = null

database.connect({
  poolSize: 100
}, async err => {
  trips = database.getCollection('ventura bus trips')
  buses = database.getCollection('ventura buses')

  app.get('/', async (req, res) => {
    res.render('index')
  })
  app.get('/view-all', async (req, res) => {
    res.render('view-all')
  })
  app.get('/last-seen-all', async (req, res) => {
    let lastTrips = await trips.aggregate([
      {$sort: {timestamp: -1}},
      {
        $group: {
          _id: {
            $toInt: "$fleet"
          },
          fleet: {$first: "$fleet"},
          tripName: {$first: "$tripName"},
          date: {$first: "$date"},
          time: {$first: "$time"},
          timestamp: {$first: "$timestamp"}
        }
      },
      {$sort: {_id: 1}}
    ]).toArray()

    let lastTripsByFleet = {}
    lastTrips.forEach(trip => {
      trip.timestamp = moment(trip.timestamp).format("YYYYMMDDHHmmss")
      lastTripsByFleet[trip.fleet] = trip
    })

    let allBuses = (await buses.aggregate([
      { $project: {fleet: 1, _id: 0}}
    ]).toArray()).map(bus => bus.fleet)

    let busLastSeen = {}
    allBuses.forEach(fleet => {
      busLastSeen[fleet] = lastTripsByFleet[fleet]
    })

    res.render('last-seen-all', {busLastSeen})
  })
  app.get('/all', async (req, res) => {
    const now = moment().tz('Australia/Melbourne')
    const startOfToday = now.clone().startOf('day')
    const minutesPastMidnight = now.diff(startOfToday, 'minutes')

    let allTrips = await trips.findDocuments({
      date: now.format('YYYY-MM-DD'),
      time: { $gt: minutesPastMidnight - 5 }
    }).toArray()

    let tripsByBus = {}

    allTrips.forEach(trip => {
      if (!tripsByBus[trip.fleet]) {
        tripsByBus[trip.fleet] = trip
      } else {
        if (tripsByBus[trip.fleet].time < trip.time)
          tripsByBus[trip.fleet] = trip
      }
    })

    res.json(Object.values(tripsByBus))
  })
  app.get('/bus/', async (req, res) => {
    let {fleet} = querystring.parse(url.parse(req.url).query)
    if (!fleet) return res.end()
    const now = moment().tz('Australia/Melbourne')
    const startOfToday = now.clone().startOf('day')
    const minutesPastMidnight = now.diff(startOfToday, 'minutes')

    let tripsForBus = await trips.findDocuments({
      fleet
    }).toArray()

    let byDays = {}
    let servicesByDays = {}
    let nowRunning = null
    tripsForBus.sort((a, b) => b.timestamp - a.timestamp).forEach(trip => {
      if (!byDays[trip.date]) {
        byDays[trip.date] = []
        servicesByDays[trip.date] = []
      }

      if (!servicesByDays[trip.date].includes(trip.service)) {
        servicesByDays[trip.date].push(trip.service)
        byDays[trip.date].push(trip)
        byDays[trip.date] = byDays[trip.date].sort((a, b) => a.time - b.time)
      }
    })

    let today = now.format('YYYY-MM-DD')
    if (byDays[today]) {
      nowRunning = byDays[today].slice(-1)[0]
      if (nowRunning.time < minutesPastMidnight - 5) nowRunning = null
    }

    res.render('by-fleet', {byDays, fleet, nowRunning})
  })

  app.get('/service/', async (req, res) => {
    const now = moment().tz('Australia/Melbourne')
    const startOfToday = now.clone().startOf('day')
    const minutesPastMidnight = now.diff(startOfToday, 'minutes')

    let {service} = querystring.parse(url.parse(req.url).query)
    if (!service) return res.end()

    let tripsForBus = await trips.findDocuments({
      service: new RegExp(service, 'i')
    }).toArray()

    let byDays = {}
    let fleetNumbersSeenByDay = {}
    tripsForBus.sort((a, b) => b.timestamp - a.timestamp).forEach(trip => {
      if (!byDays[trip.date]) {
        byDays[trip.date] = []
        fleetNumbersSeenByDay[trip.date] = []
      }

      if (!fleetNumbersSeenByDay[trip.date].includes(trip.fleet)) {
        fleetNumbersSeenByDay[trip.date].push(trip.fleet)
        byDays[trip.date].push(trip)
        byDays[trip.date] = byDays[trip.date].sort((a, b) => a.time - b.time)
      }
    })

    let todayDeployment = byDays[now.format('YYYY-MM-DD')] || []
    let nowRunning = todayDeployment.filter(bus => bus.time > minutesPastMidnight - 5)
    let busList = {}

    await async.forEach(nowRunning, async bus => {
      busList[bus.fleet] = (await buses.findDocument({fleet: bus.fleet})) || {model: "Unknown", bodywork: "Unknown"}
    })

    res.render('by-service', {byDays, service, busList, nowRunning})
  })

  app.get('/model/', async (req, res) => {
    const now = moment().tz('Australia/Melbourne')
    const startOfToday = now.clone().startOf('day')
    const minutesPastMidnight = now.diff(startOfToday, 'minutes')

    let {model} = querystring.parse(url.parse(req.url).query)
    if (!model || !safeRegex(model)) return res.end()

    let busList = await buses.findDocuments({model: new RegExp(model, 'i')}).toArray()
    let fleetNumbers = busList.map(bus => bus.fleet)
    if (!fleetNumbers.length) fleetNumbers = [0]

    let tripsRunning = await trips.findDocuments({
      $or: fleetNumbers.map(fleet => {return {fleet}}),
      date: now.format('YYYY-MM-DD'),
      time: {
        $gt: minutesPastMidnight - 5
      }
    }).toArray()

    let fleetNumbersSeen = []
    let nowRunning = []
    tripsRunning.sort((a, b) => b.timestamp - a.timestamp).forEach(trip => {
      if (!fleetNumbersSeen.includes(trip.fleet)) {
        fleetNumbersSeen.push(trip.fleet)
        nowRunning.push(trip)
      }
    })

    res.render('by-model', {nowRunning, busList, model})
  })
  // app.listen(8080)

})

module.exports = app
