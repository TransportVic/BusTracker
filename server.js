const DatabaseConnection = require('./database/DatabaseConnection')
const config = require('./config.json')
const express = require('express')
const moment = require('moment')
require('moment-timezone')
const querystring = require('querystring')
const url = require('url')
const async = require('async')
const path = require('path')

const app = express()

app.use('/static', express.static(path.join(__dirname, 'static')))
app.set('views', './views')
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
  app.get('/all', async (req, res) => {
    const now = moment().tz('Australia/Melbourne')
    const startOfToday = now.clone().startOf('day')
    const minutesPastMidnight = now.diff(startOfToday, 'minutes')

    let allTrips = await trips.findDocuments({
      date: now.format('YYYY-MM-DD'),
      time: { $gt: minutesPastMidnight - 10 }
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

    let tripsForBus = await trips.findDocuments({
      fleet
    }).toArray()

    let byDays = {}
    tripsForBus.forEach(trip => {
      if (!byDays[trip.date]) byDays[trip.date] = []

      if (!byDays[trip.date].includes(trip.service))
      byDays[trip.date].push(trip.service)
      byDays[trip.date] = byDays[trip.date].sort((a,b)=>a-b)
    })
    res.render('by-fleet', {byDays, fleet})
  })
  app.get('/service/', async (req, res) => {
    const now = moment().tz('Australia/Melbourne')

    let {service} = querystring.parse(url.parse(req.url).query)
    if (!service) return res.end()

    let tripsForBus = await trips.findDocuments({
      service: new RegExp(service, 'i')
    }).toArray()

    let byDays = {}
    tripsForBus.forEach(trip => {
      if (!byDays[trip.date]) byDays[trip.date] = []

      if (!byDays[trip.date].includes(trip.fleet))
      byDays[trip.date].push(trip.fleet)
      byDays[trip.date] = byDays[trip.date].sort((a,b)=>a-b)
    })

    let todayDeployment = byDays[now.format('YYYY-MM-DD')] || []
    let busList = {}

    await async.forEach(todayDeployment, async fleet => {
      busList[fleet] = await buses.findDocument({fleet})
    })

    res.render('by-service', {byDays, service, busList, todayDeployment})
  })
  app.listen(8080)

})
