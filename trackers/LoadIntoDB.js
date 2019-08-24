const DatabaseConnection = require('../database/DatabaseConnection')
const config = require('../config.json')

const database = new DatabaseConnection(config.databaseURL, 'BusTracker')
let trips = null

module.exports = {
  init: () => {
    if (!trips)
      database.connect({
        poolSize: 100
      }, async err => {
        trips = database.getCollection('ventura bus trips')
      })
  },
  process: async bus => {
    let key = {
      fleet: bus.fleet,
      service: bus.service,
      date: bus.date,
      time: { $gt: bus.time - 10 },
      tripName: bus.tripName
    }

    let trip = await trips.findDocument(key)
    if (!trip) {
      await trips.createDocument(bus)
    } else {
      await trips.updateDocument(key, { $set: bus })
    }
  }
}
