const AJAXTracker = require('./trackers/AJAXTracker')
const WebsocketTracker = require('./trackers/WebsocketTracker')
const urlData = require('./url_data.json')
const config = require('./config.json')
const moment = require('moment')
require('moment-timezone')

let trackers = []
let {forceAJAX} = config

function createTracker(service, baseFreq) {
  if (urlData[service].includes('/live/') && !forceAJAX)
    return new WebsocketTracker(service)
  else
    return new AJAXTracker(service, baseFreq)
}

let specialTrackers = ['V/Line: Cowes - Dandenong', 'Point Nepean Shuttle', 'Koo Wee Rup - Pakenham']
Object.keys(urlData).forEach(service => {
  let url = urlData[service]
  if (service <= 929 || service.includes('Telebus') || specialTrackers.includes(service)) {
    let baseFreq
    if (url.includes('/live/') && forceAJAX) baseFreq = config.forcedAjaxBaseFreq
    let tracker = {
      service,
      tracker: createTracker(service, baseFreq),
      running: false
    }
    if (!url.includes('/live/')) {
      tracker.hours = {
        gt: 300, // 5.00am-
        lt: 1439, // 11.59pm
        m: 'a'
      }
    } else {
      tracker.hours = {
        gt: 285, // 4.45am-
        lt: 30, // 0.30am
        m: 'o'
      }
    }

    trackers.push(tracker)
  } else {
    if (service <= 982) { // nightbus
      trackers.push({
        operationalDays: ['Fri', 'Sat', 'Sun'],
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
      let tracker = createTracker(service, config.schoolbusFreq)
      let trackerAM = {
        operationalDays: ['Mon', 'Tues', 'Wed', 'Thur', 'Fri'],
        service,
        tracker,
        running: false,
        hours: {
          gt: 405, // 6.45am-
          lt: 525, // 8.45am
          m: 'a'
        }
      }
      let trackerPM = {
        operationalDays: ['Mon', 'Tues', 'Wed', 'Thur', 'Fri'],
        service,
        tracker,
        running: false,
        hours: {
          gt: 900, // 3.00pm-
          lt: 990, // 4.30pm
          m: 'a'
        }
      }
      if (service.endsWith(' - 1')) // AM Tracker only
        trackers.push(trackerAM)
      else if (service.endsWith(' - 2')) // PM Tracker only
        trackers.push(trackerPM)
      else {
        trackers.push(trackerAM) // unified tracker, do both A+PM
        trackers.push(trackerPM)
      }
    }
  }
})

const daysOfWeek = ['Sun', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat']

function checkTrackers() {
  const now = moment().tz('Australia/Melbourne')
  const startOfToday = now.clone().startOf('day')
  const minutesPastMidnight = now.diff(startOfToday, 'minutes')
  const today = daysOfWeek[now.day()]

  trackers.forEach((tracker, i) => {
    let runsToday = true
    let runsNow = true

    if (tracker.operationalDays)
      runsToday = tracker.operationalDays.includes(today)
    if (tracker.hours) {
      let gt = minutesPastMidnight >= tracker.hours.gt;
      let lt = minutesPastMidnight <= tracker.hours.lt;
      runsNow = tracker.hours.m === 'o' ? gt || lt : gt && lt
    }

    let newState = runsToday && runsNow

    if (newState && !tracker.running) {
      const delay = (Math.random() * (5) + 1.5 * i) * 500;
      console.log('delaying tracker for ' + tracker.service + ' by ' + (Math.random() * (5) + 1.5 * i) * 500/1000 + ' seconds')
      setTimeout(() => {
        console.log('activated tracker for ' + tracker.service)
        tracker.tracker.start()
      }, delay);

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
