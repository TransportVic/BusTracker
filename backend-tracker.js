const AJAXTracker = require('./trackers/AJAXTracker')
const WebsocketTracker = require('./trackers/WebsocketTracker')
const urlData = require('./url_data.json')
const moment = require('moment')
require('moment-timezone')

let periodicalTrackers = []

function createTracker(service) {
  if (urlData[service].includes('/live/'))
    return new WebsocketTracker(service)
  else
    return new AJAXTracker(service)
}

let specialTrackers = ['V/Line: Cowes - Dandenong', 'Point Nepean Shuttle']
Object.keys(urlData).forEach(service => {
  let url = urlData[service]
  if (service <= 929 || service.includes('Telebus') || specialTrackers.includes(service)) {
    createTracker(service).start()
  } else {
    if (service <= 982) { // nightbus
      periodicalTrackers.push({
        operationalDays: ['Fri', 'Sat', 'Sun'],
        service,
        tracker: createTracker(service),
        running: false
      })
    } else { // school runs
      if (!url.includes('ventura.busminder.com.au')) // can't track those (for now??)
        periodicalTrackers.push({
          operationalDays: ['Mon', 'Tues', 'Wed', 'Thur', 'Fri'],
          service,
          tracker: createTracker(service),
          running: false
        })
    }
  }
})

const daysOfWeek = ['Sun', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat']

function checkPeriodicalTrackerStates() {
  const now = moment().tz('Australia/Melbourne')
  const today = daysOfWeek[now.day()]

  periodicalTrackers.forEach(tracker => {
    if (tracker.operationalDays.includes(today)) {
      if (!tracker.running) {
        console.log('activated periodical tracker for ' + tracker.service)
        tracker.tracker.start()
        tracker.running = true
      }
    } else {
      if (tracker.running) {
        console.log('deactivated periodical tracker for' + tracker.service)
        tracker.tracker.stop()
        tracker.running = false
      }
    }
  })
}

checkPeriodicalTrackerStates()
setInterval(checkPeriodicalTrackerStates, 1000 * 60 * 10)
