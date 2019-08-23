const request = require('request')
const urlData = require('./url_data.json')
let data = require('./trips.json')
const fs = require('fs')
const cheerio = require('cheerio')


const promises = []

let i = 0
for (let url of Object.values(urlData)) {
  if (!url.includes('/live/')) continue

  promises.push(new Promise(resolve => {
    setTimeout(() => {
      request(url, (err, res, body) => {
        const $ = cheerio.load(body)
        if (!$('body > script:nth-child(8)').html()) return resolve()

        let script = $('body > script:nth-child(8)').html().trim()
        let tripData = JSON.parse(script.slice(26, -2))

        let trips = tripData.routes
        trips.forEach(trip => {
          data[trip.id] = trip.name.replace('DEV_', '')
        })

        resolve()
      })
    }, 100 * ++i - 100)
  }))
}

Promise.all(promises).then(() => {
  fs.writeFile('trips.json', JSON.stringify(data, null, 2), () => {
    console.log('done')
  })
})
