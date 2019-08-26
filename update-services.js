const DatabaseConnection = require('./database/DatabaseConnection')
const config = require('./config.json')
const async = require('async')
const database = new DatabaseConnection(config.databaseURL, 'BusTracker')
let trips = null

database.connect({
  poolSize: 100
}, async err => {
  trips = database.getCollection('ventura bus trips')
  let allTrips = await trips.findDocuments({}).toArray()

  await async.forEach(allTrips, async trip => {
    if (trip.tripName.match(/^\d{3}\w? .* (to|-) .*$/)) {
      trip.service = trip.tripName.match(/^(\d{3}\w?) .* (to|-) .*$/)[1]
    }
    await trips.updateDocument({_id: trip._id}, {$set: trip})
  })
  process.exit(void console.log('done'))
})
