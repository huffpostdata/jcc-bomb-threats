const child_process = require('child_process')
const fs = require('fs')
const sass = require('node-sass')
const svgo = require('svgo')
const csv_parse = require('csv-parse/lib/sync')
const kdbush = require('kdbush')
const xmldoc = require('xmldoc')
const svgoConvertPathData = require('./svgo/convertPathData').fn

const ClusterRadius = 110
const PointRadius = 55
const NPlacesTotal = 350

function loadCss(filePath) {
  return sass.renderSync({
    file: filePath,
    outputStyle: 'compressed'
  }).css.toString('utf-8')
}

// Returns [ { id: ..., city: ..., stateAbbreviation: ..., threats: [ { date: '2017-01-20', place: '...' }, ... ] ]
function loadThreatenedCities() {
  const tsv = fs.readFileSync(`${__dirname}/google-sheets/threats.tsv`)
  const rows = csv_parse(tsv, { delimiter: '\t', columns: true })

  function rowToId(row) {
    if (row.CITY === 'Newton Centre' && row.STATE === 'MA') {
      return 'Newton MA'
    } else {
      return `${row.CITY} ${row.STATE}`
    }
  }

  const citiesSet = {}
  for (const row of rows) {
    const id = rowToId(row)
    if (!citiesSet.hasOwnProperty(id)) citiesSet[id] = []
    citiesSet[id].push(row)
  }

  const cities = []

  for (const id of Object.keys(citiesSet)) {
    const cityRows = citiesSet[id]

    const threats = []
    for (const header of Object.keys(cityRows[0]).sort()) {
      if (/^\d\d\d\d-\d\d-\d\d$/.test(header)) {
        for (const row of cityRows) {
          if (row[header].length > 0) {
            threats.push({
              date: header,
              city: row.CITY,
              stateAbbreviation: row.STATE, // TODO convert to abbreviation
              place: row['JCC NAME']
            })
          }
        }
      }
    }

    const city = {
      id: id,
      threats: threats
    }
    cities.push(city)
  }

  return cities
}

function loadCityGeos() {
  const usGeos = JSON.parse(fs.readFileSync(`${__dirname}/../data/cities.geojson`)).features
}

function loadCities() {
  const usGeos = JSON.parse(fs.readFileSync(`${__dirname}/../data/cities.geojson`)).features
  const caGeos = [
    {
      "type": "Feature",
      "properties": { "id": "London Ontario" },
      "geometry": { "type": "Point", "coordinates": [ -81.2453, 42.9849 ] }
    }
  ]

  const cityGeos = usGeos.concat(caGeos)

  const idToGeo = {}
  for (const cityGeo of cityGeos) {
    idToGeo[cityGeo.properties.id] = cityGeo
  }

  const features = []
  for (const threatenedCity of loadThreatenedCities()) {
    const geo = idToGeo[threatenedCity.id]
    if (!geo) {
      throw new Error(`Could not find city: '${threatenedCity.id}'`)
    } else {
      features.push(Object.assign({}, geo, {
        properties: Object.assign({}, geo.properties, threatenedCity)
      }))
    }
  }

  // Sort by latitude, so when circles overlap the bottom one is always atop
  // the top one
  features.sort((a, b) => {
    return b.geometry.coordinates[1] - a.geometry.coordinates[1]
  })

  return {
    type: 'FeatureCollection',
    features: features
  }
}

function writeCitiesGeojson() {
  const cities = loadCities()

  try {
    fs.mkdirSync(`${__dirname}/../tmp`)
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
  }

  fs.writeFileSync(`${__dirname}/../tmp/threatened-cities.geojson`, JSON.stringify(cities))
}

function runMapshaper() {
  writeCitiesGeojson()

  return child_process.execFileSync(`${__dirname}/../node_modules/.bin/mapshaper`,
    [
      '-i', `${__dirname}/../data/jcc-threat-map.topojson`, `${__dirname}/../tmp/threatened-cities.geojson`, 'combine-files',
      '-rename-layers', 'states,mesh,cities',
      '-proj', 'albersusa',
      '-simplify', 'planar', 'resolution=1990x1990', 'stats',
      '-svg-style', 'r=' + PointRadius,
      '-o', '-', 'format=svg', 'precision=1', 'width=2000', 'margin=5', 'id-field=id'
    ],
    {
      maxBuffer: 8*1024*1024,
      encoding: 'utf-8'
    }
  )
}

function rewriteCities(svg, cities) {
  const idToCity = {}
  for (const city of loadThreatenedCities()) {
    idToCity[city.id] = city
  }

  function circleToThreats(circle) {
    const id = circle.attr.id
    const x = parseFloat(circle.attr.cx)
    const y = parseFloat(circle.attr.cy)

    const city = idToCity[id]
    if (!city) throw new Error(`Could not match city ${id}`)

    return city.threats.map(threat => Object.assign({ x: x, y: y }, threat))
  }

  function clusterPlaces(places) {
    // Simple algo:
    // 1. Sort points by how many points are near them.
    // 2. Go down the list, clustering at each point if applicable.
    //
    // Step 1 should help us avoid the (unlikely?) case in which we pick a point
    // a bit far from a cluster, and that divides up the cluster. It's a step
    // Supercluster and Leaflet Clusterer don't take, because they're optimized
    // for speed.

    // 0. Keep scratchpad; don't write anything into the passed `threats`
    const points = places.map(place => { return { x: place.x, y: place.y, place: place } })

    // 0. Create index, with its fantastic within() method.
    const index = kdbush(points, p => p.x, p => p.y, 10, Int32Array)

    // 1. Sort threats from nearest-a-cluster to farthest-from-a-cluster
    for (const point of points) {
      point.nNear = index.within(point.x, point.y, ClusterRadius).length
    }
    const sortedPoints = points.slice().sort((a, b) => b.nNear - a.nNear)

    // 2. Iterate: build a cluster at each threat that hasn't been seen yet
    const clusters = [] // Array of { xSum, ySum, places }
    for (const point of sortedPoints) {
      if (point.visited) continue
      point.visited = true

      const cluster = { xSum: point.x, ySum: point.y, places: [ point.place ] }

      for (const closePointIndex of index.within(point.x, point.y, ClusterRadius)) {
        const closePoint = points[closePointIndex]
        if (closePoint.visited) continue
        closePoint.visited = true
        cluster.xSum += closePoint.x
        cluster.ySum += closePoint.y
        cluster.places.push(closePoint.place)
      }

      clusters.push(cluster)
    }

    // 3. Calculate the weighted x/y for each cluster
    return clusters.map(cluster => {
      const threats = [].concat(...cluster.places.map(p => p.threats)).sort((a, b) => {
        return (
          a.date.localeCompare(b.date) // ASCII = chronological
          ||
          a.city.localeCompare(b.city)
        )
      })

      return {
        x: Math.round(cluster.xSum / cluster.places.length),
        y: Math.round(cluster.ySum / cluster.places.length),
        nPlaces: cluster.places.length,
        threats: threats
      }
    })
  }

  function clusterToG(cluster) {
    // xmldoc wasn't designed to let us edit the tree. Whatevs -- this isn't complex.
    function XmlElement(name, attr, children) {
      this.name = name
      this.attr = attr || {}
      this.children = children || []
    }
    Object.assign(XmlElement.prototype, xmldoc.XmlDocument.prototype) // toStringWithIndent()

    const children = [
      new XmlElement(
        'circle',
        {
          cx: String(cluster.x),
          cy: String(cluster.y),
          r: String(PointRadius)
        }
      )
    ]

    if (cluster.nPlaces !== 1) {
      children.push(new XmlElement(
        'text',
        {
          x: String(cluster.x),
          y: String(cluster.y)
        },
        [ String(cluster.nPlaces) ]
      ))
    }

    children.push(new XmlElement(
      'desc', {}, [ JSON.stringify(cluster.threats) ]
    ))

    return new XmlElement('g', {}, children)
  }

  const xml = new xmldoc.XmlDocument(svg)
  const cityG = xml.childWithAttribute('id', 'cities')
  const threats = [].concat(...cityG.children.map(circleToThreats))
  const places = []
  const placeThreats = {}
  for (const threat of threats) {
    if (!placeThreats[threat.place]) {
      placeThreats[threat.place] = []
      places.push({
        name: threat.place,
        x: threat.x,
        y: threat.y,
        city: threat.city,
        stateAbbreviation: threat.stateAbbreviation,
        threats: placeThreats[ threat.place ]
      })
    }
    placeThreats[threat.place].push(threat)
  }
  const clusters = clusterPlaces(places)

  cityG.children = clusters.map(clusterToG)
  return xml.toString({ compressed: true })
}

function compressSvg(svg) {
  // SVGO is the bomb, but it's too heavy. This pilfers the nice bit.
  return svg
    .replace(/\s+</g, '<')
    .replace(/ d="([^"]+)"/g, (_, d) => ` d="${svgoConvertPathData(d, {})}"`)
}

function loadSvg() {
  const svg = runMapshaper()

  const compressed = compressSvg(svg)

  const withCities = rewriteCities(compressed, loadCities())

  const css = loadCss(`${__dirname}/../data/svg-styles.scss`)
  const withStyle = withCities.replace('baseProfile="tiny"', 'baseProfile="basic"')
    .replace('<g', `<defs><style>${css}</style></defs><g`)

  const withClasses = withStyle.replace(/ id="/g, ' class="')

  return withClasses
}

function svgToAspectRatio(svg) {
  const viewBoxM = /\sviewBox="0 0 (\d+) (\d+)"/.exec(svg)
  if (!viewBoxM) {
    throw new Error(`Could not read viewBox from SVG`)
  }
  const width = +viewBoxM[1]
  const height = +viewBoxM[2]
}

var Months = [ 'Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.' ];
function formatDateS(dateS) {
  var year = parseFloat(dateS.slice(0, 4));
  var month = parseFloat(dateS.slice(5, 7));
  var day = parseFloat(dateS.slice(8, 10));
  return Months[month - 1] + ' ' + day;
}

function wrapSvgWithHtml(svg) {
  const tsv = fs.readFileSync(`${__dirname}/google-sheets/threats.tsv`, 'utf-8')
  const lastDate = tsv
    .split(/\r?\n/, 2)[0] // header row as String
    .split(/\t/)          // headers
    .filter(s => /^\d\d\d\d-\d\d-\d\d$/.test(s)) // dates
    .sort().reverse()[0]

  const placesWithRepeats = tsv
    .split(/\r?\n/).slice(1) // body rows
    .filter(s => s.length)   // nix empty lines
    .map(s => s.split(',', 2)[0])

  const uniquePlaces = {}
  for (const place of placesWithRepeats) {
    uniquePlaces[place] = null
  }
  const nPlaces = Object.keys(uniquePlaces).length

  const css = loadCss(`${__dirname}/../data/html-styles.scss`)
  const sentence = `As of ${formatDateS(lastDate)}, there have been bomb threats in ${nPlaces} of the ${NPlacesTotal} JCCs in North America.`
  return `<style>${css}</style><h2>Jewish Community Centers Threatened In 2017</h2><p>${sentence}</p><div class="svg-container">${svg}</div>`
}

const svg = loadSvg()

module.exports = {
  aspectRatio: svgToAspectRatio(svg),
  svg: svg,
  html: wrapSvgWithHtml(svg)
}
