const request = require('request-promise')
const data = require('./url_data.json')
const fs = require('fs')
const cheerio = require('cheerio')
const async = require('async')

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

function delay(t) {
   return new Promise(function(resolve) {
       setTimeout(function() {
           resolve();
       }, t);
   });
}

for (let i = 1; i <= 27; i++) {
  promises.push((async () => {
    await delay(i * 10000 - 10000)
    let body = await request(searchURL.format(i))

    const $ = cheerio.load(body)
    const rows = Array.from($('.search__results__item.clear'))
    await async.forEach(rows, async (row, j) => {
      await delay(1000)
      const svcNum = $('.search__results__item__id', row).text().trim()
      const svcName = $('.search__results__item__name', row).text().trim()
      const pageURL = $('.search__results__item__name', row).attr('href')
      if (!pageURL) return
      const id = svcNum || svcName

      try {
        const pageBody = await request({
          url: pageURL,
          headers: {
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:68.0) Gecko/20100101 Firefox/68.0',
            'host': 'www.venturabus.com.au',
            'referer': 'www.venturabus.com.au',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        })

        const $$ = cheerio.load(pageBody)
        const iframes = Array.from($$('.busminder_iframe'))
        const format = id + (iframes.length > 1 ? ' - {0}' : '')

        iframes.forEach((iframe, i) => {
          data[format.format(i + 1)] = iframe.attribs.src
        })
      } catch (e) {
        console.log(e)
        console.log(id, pageURL)
      }
    })

  })())
}

Promise.all(promises).then(() => {
  fs.writeFile('url_data.json', JSON.stringify(data, null, 2), () => {
    console.log('done')
  })
})
