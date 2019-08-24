const AJAXTracker = require('./trackers/AJAXTracker')
const WebsocketTracker = require('./trackers/WebsocketTracker')
const urlData = require('./url_data.json')
const moment = require('moment')
require('moment-timezone')

let trackers = []

function createTracker(service) {
  if (urlData[service].includes('/live/'))
    return new WebsocketTracker(service)
  else
    return new AJAXTracker(service)
}

let specialTrackers = ['V/Line: Cowes - Dandenong', 'Point Nepean Shuttle', 'Koo Wee Rup - Pakenham']
Object.keys(urlData).forEach(service => {
  let url = urlData[service]
  if (service <= 929 || service.includes('Telebus') || specialTrackers.includes(service)) {
    let tracker = {
      service,
      tracker: createTracker(service),
      running: false
    }
    if (!url.includes('/live/')) {
      tracker.hours = {
        gt: 300, // 5.00am-
        lt: 1439, // 11.59pm
        m: 'a'
      }
    }

    trackers.push(tracker)
  } else {
    if (service <= 982) { // nightbus
      trackers.push({
        operationalDays: ['Fri', 'Sat', 'Sun', 'Mon'],
        service,
        tracker: createTracker(service),
        running: false,
        hours: {
          gt: 1380, // 11.00pm
          lt: 420, // 6.30am
          m: 'o'
        }
      })
    } else { // school runs
      if (!url.includes('ventura.busminder.com.au')) // can't track those (for now??)
        trackers.push({
          operationalDays: ['Mon', 'Tues', 'Wed', 'Thur', 'Fri'],
          service,
          tracker: createTracker(service),
          running: false,
          hours: {
            gt: 360, // 6.00am-
            lt: 1020, // 5.00pm
            m: 'a'
          }
        })
    }
  }
})

const daysOfWeek = ['Sun', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat']

function checkTrackers() {
  const now = moment().tz('Australia/Melbourne')
  const startOfToday = now.clone().startOf('day')
  const minutesPastMidnight = now.diff(startOfToday, 'minutes')
  const today = daysOfWeek[now.day()]

  trackers.forEach(tracker => {
    let newState = true

    if (tracker.operationalDays)
      newState = tracker.operationalDays.includes(today)
    if (tracker.hours) {
      let gt = minutesPastMidnight >= tracker.hours.gt;
      let lt = minutesPastMidnight <= tracker.hours.lt;
      newState = tracker.hours.m === 'o' ? gt || lt : gt && lt
    }

    if (newState && !tracker.running) {
      console.log('activated tracker for ' + tracker.service)
      tracker.tracker.start()
      tracker.running = true
    } else if (!newState && tracker.running) {
      console.log('deactivated tracker for' + tracker.service)
      tracker.tracker.stop()
      tracker.running = false
    }
  })
}

checkTrackers()
setInterval(checkTrackers, 1000 * 60 * 1)
