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
    if (trip.tripName.match(/^\w{3,4} .* to .*$/)) {
      trip.service = trip.tripName.match(/^(\w{3,4}) .* to .*$/)[1]
    }
    await trips.updateDocument({_id: trip._id}, {$set: trip})
  })
  process.exit(void console.log('done'))
})
