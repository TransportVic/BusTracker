let buses = require('./buses.json')
let fs = require('fs')

let stream = fs.createWriteStream('./buses.csv')
stream.write(Object.keys(buses[0]).join(',') + '\n')
let index = 1

buses.forEach(bus => {
  while (index < bus.fleet) {
    stream.write(Buffer.from(",,,,,,\n"))
    index++
  }
  stream.write(Object.values(bus).join(',') + '\n')
  index++
})

stream.end()
