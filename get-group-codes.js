const request = require('request')
const data = require('./url_data.json')
const fs = require('fs')
const cheerio = require('cheerio')

String.prototype.format = (function (i, safe, arg) {
  function format () {
    var str = this; var len = arguments.length + 1
    for (i = 0; i < len; arg = arguments[i++]) {
      safe = typeof arg === 'object' ? JSON.stringify(arg) : arg
      str = str.replace(RegExp('\\{' + (i - 1) + '\\}', 'g'), safe)
    }
    return str
  }
  format.native = String.prototype.format
  return format
}())

const searchURL = 'https://www.venturabus.com.au/search-results/{0}/?keywords'

const promises = []

for (let i = 1; i <= 27; i++) {
  promises.push(new Promise(resolve => {
    setTimeout(() => {
      request(searchURL.format(i), (err, res, body) => {
        const $ = cheerio.load(body)
        const rows = Array.from($('.search__results__item.clear'))
        rows.forEach(row => {
          const svcNum = $('.search__results__item__id', row).text().trim()
          const svcName = $('.search__results__item__name', row).text().trim()
          const trackerURL = $('.search__results__item__livetracking', row).attr('href')
          const id = svcNum || svcName
          data[id] = trackerURL
        })

        resolve()
      })
    }, 500 * i - 500)
  }))
}

Promise.all(promises).then(() => {
  fs.writeFile('url_data.json', JSON.stringify(data, null, 2), () => {
    console.log('done')
  })
})
