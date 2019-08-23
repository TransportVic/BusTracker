const DatabaseConnection = require('./database/DatabaseConnection')
const config = require('./config.json')
const parseCSV = require('csv-parse/lib/sync')
const fs = require('fs')
const async = require('async')

const database = new DatabaseConnection(config.databaseURL, 'BusTracker')

async function load() {
  await database.connect({
    poolSize: 100
  })
  let buses = database.getCollection('ventura buses')

  let allBuses = fs.readFileSync('buses.csv').toString()
  allBuses = parseCSV(allBuses, {
    columns: true,
    trim: true,
    skip_empty_lines: true
  }).filter(bus => bus.fleet)

  await async.forEach(allBuses, async bus => {
    if (await buses.countDocuments({ vin: bus.vin })) {
      await buses.updateDocument({ vin: bus.vin }, { $set: bus })
    } else await buses.createDocument(bus)
  })

  console.log('loaded ' + allBuses.length + ' buses')
  process.exit()
}

load()
