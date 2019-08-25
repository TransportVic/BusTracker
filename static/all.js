mapboxgl.accessToken = 'pk.eyJ1IjoidW5pa2l0dHkiLCJhIjoiY2p6bnVvYWJ4MDdlNjNlbWsxMzJwcjh4OSJ9.qhftGWgQBDdGlaz3jVGvUQ';
var map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v11',
  zoom: 9,
  center: [145.173458, -38.066648]
});

let markers = {}
let previousUpdateFleets = []

function loadBuses() {
  $.ajax({
    method: 'GET',
    url: '/tracker/all'
  }, (err, status, buses) => {
    let geojson = {
      "type": "FeatureCollection",
      "features": buses.filter(bus => {
        if (window.filterKey) return bus[window.filterKey] === window.filterValue ||
          window.filterValue.includes(bus[window.filterKey])

        return true
      }).map(bus => {
        return {
          "type": "Feature",
          "geometry": {
            "type": "Point",
            "coordinates": bus.position.reverse()
          },
          "properties": bus
        }
      })
    }

    geojson.features.forEach(bus => {
      if (!markers[bus.properties.fleet]) {
        let el = document.createElement('div')
        el.className = 'marker'

        let marker = new mapboxgl.Marker(el)
        let popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`<h3> ${bus.properties.fleet} - ${bus.properties.service} </h3><p> ${bus.properties.tripName} </p>`)

        marker.setLngLat(bus.geometry.coordinates)
          .setPopup(popup)
          .addTo(map);
        markers[bus.properties.fleet] = {marker, popup}
      } else {
        markers[bus.properties.fleet].marker.setLngLat(bus.geometry.coordinates)
        markers[bus.properties.fleet].popup
          .setHTML(`<h3> ${bus.properties.fleet} - ${bus.properties.service} </h3><p> ${bus.properties.tripName} </p>`)
      }
    })

    let currentFleet = geojson.features.map(bus => bus.properties.fleet)
    previousUpdateFleets.forEach(fleet => {
      if (!currentFleet.includes(fleet)) {
        markers[fleet].marker.remove()
        markers[fleet] = null
      }
    })

    previousUpdateFleets = currentFleet
  })
}

map.on('load', function () {
  if (window.depots) {
    map.addLayer({
      id: 'depots',
      type: 'fill',
      source: {
        type: 'geojson',
        data: window.depots
      },
      paint: {
        'fill-color': '#58BCAF',
        'fill-outline-color': '#4A6965'
      }
    })
    map.on('click', 'depots', function (e) {
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(e.features[0].properties.Name + " Depot")
        .addTo(map);
    });
  }

  setInterval(loadBuses, 2500)
  loadBuses()
});
