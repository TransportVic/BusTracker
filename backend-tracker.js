const AJAXTracker = require('./trackers/AJAXTracker')
const WebsocketTracker = require('./trackers/WebsocketTracker')
const urlData = require('./url_data.json')

Object.keys(urlData).forEach(service => {
  if (service <= 929 || service.includes('Telebus')) {
    let url = urlData[service]
    if (url.includes('/live/'))
      new WebsocketTracker(service).start()
    else
      new AJAXTracker(service).start()
  }
})
