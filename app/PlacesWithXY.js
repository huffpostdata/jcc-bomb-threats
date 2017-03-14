const fs = require('fs')
const csv_parse = require('csv-parse/lib/sync')
const proj = require('./projection').projectFromWGS84
const StateAbbreviations = require('./StateAbbreviations.json')

// Returns [ { name: ..., cityId: ..., city: ..., stateAbbreviation: ..., threatDates: [ '2017-01-20', ... ] x: ..., y: ... }, ... ]
function loadThreatenedPlaces() {
  const tsv = fs.readFileSync(`${__dirname}/google-sheets/threats.tsv`)
  const rows = csv_parse(tsv, { delimiter: '\t', columns: true })

  function rowToCityId(row) {
    if (row.City === 'Newton Centre' && row.State === 'MA') {
      return 'Newton MA'
    } else {
      return `${row.City} ${row.State}`
    }
  }

  return rows.map(row => {
    const threatDates = []
    for (const header of Object.keys(rows[0]).sort()) {
      if (/^\d\d\d\d-\d\d-\d\d$/.test(header) && row[header].trim().length) {
        threatDates.push(header)
      }
    }
    if (threatDates.length === 0) throw new Error(`Found no threats for ${row.Place}`)
    if (!StateAbbreviations.hasOwnProperty(row.State)) throw new Error(`Spreadsheet mentions State ${row.State}, but there is no such state`)

    return {
      name: row.Place,
      city: row.City,
      cityId: rowToCityId(row),
      purpose: row.Purpose, // "community center" or "school"
      stateAbbreviation: StateAbbreviations[row.State],
      threatDates: threatDates
    }
  })
}

// Returns GeoJSON for all cities we care about.
//
// This GeoJSON will be projected using mapshaper's dynamically-generated
// projection. Then we'll parse mapshaper's output and use the city coordinates.
function addXYToPlaces(places) {
  // 1. Find all the city IDs we want
  // 2. Load our existing GeoJSON and filter for only the IDs we want
  // 3. Write the result
  const wantedIds = {}
  for (const place of places) {
    wantedIds[place.cityId] = null
  }

  const usGeos = JSON.parse(fs.readFileSync(`${__dirname}/../data/cities.geojson`)).features
  const caGeos = [
    {
      "type": "Feature",
      "properties": { "id": "London Ontario" },
      "geometry": { "type": "Point", "coordinates": [ -81.2453, 42.9849 ] }
    },
    {
      "type": "Feature",
      "properties": { "id": "Toronto Ontario" },
      "geometry": { "type": "Point", "coordinates": [ -79.3832, 43.6532 ] }
    },
    {
      "type": "Feature",
      "properties": { "id": "Vancouver British Columbia" },
      "geometry": { "type": "Point", "coordinates": [ -123.1207, 49.2827 ] }
    }
  ]
  const cityGeos = usGeos.concat(caGeos)

  const geos = cityGeos.filter(geo => wantedIds.hasOwnProperty(geo.properties.id))

  const idToXY = {}
  for (const geo of cityGeos) {
    if (wantedIds.hasOwnProperty(geo.properties.id)) {
      idToXY[geo.properties.id] = proj({ x: geo.geometry.coordinates[0], y: geo.geometry.coordinates[1] })
    }
  }

  places.forEach(place => {
    Object.assign(place, idToXY[place.cityId])
  })
}

const places = loadThreatenedPlaces()
addXYToPlaces(places)

module.exports = places
