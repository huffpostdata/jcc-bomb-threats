const child_process = require('child_process')
const fs = require('fs')
const sass = require('node-sass')
const svgo = require('svgo')
const csv_parse = require('csv-parse/lib/sync')
const kdbush = require('kdbush')
const xmldoc = require('xmldoc')
const svgoConvertPathData = require('./svgo/convertPathData').fn
const escape_html = require('../generator/escape_html')

const ClusterRadius = 110
const PointRadius = 40
const NPlacesTotal = 199

function loadCss(filePath) {
  return sass.renderSync({
    file: filePath,
    outputStyle: 'compressed'
  }).css.toString('utf-8')
}

// Returns [ { name: ..., cityId: ..., city: ..., stateAbbreviation: ..., threatDates: [ '2017-01-20', ... ] }, ... ]
function loadThreatenedPlaces() {
  const tsv = fs.readFileSync(`${__dirname}/google-sheets/threats.tsv`)
  const rows = csv_parse(tsv, { delimiter: '\t', columns: true })

  function rowToCityId(row) {
    if (row.CITY === 'Newton Centre' && row.STATE === 'MA') {
      return 'Newton MA'
    } else {
      return `${row.CITY} ${row.STATE}`
    }
  }

  return rows.map(row => {
    const threatDates = []
    for (const header of Object.keys(rows[0]).sort()) {
      if (/^\d\d\d\d-\d\d-\d\d$/.test(header) && row[header].trim().length) {
        threatDates.push(header)
      }
    }
    if (threatDates.length === 0) throw new Error(`Found no threats for ${row['JCC NAME']}`)

    return {
      name: row['JCC NAME'],
      city: row.CITY,
      cityId: rowToCityId(row),
      stateAbbreviation: row.STATE, // TODO convert to abbreviation
      threatDates: threatDates
    }
  })
}

function loadCityGeos() {
  const usGeos = JSON.parse(fs.readFileSync(`${__dirname}/../data/cities.geojson`)).features
}

// Returns GeoJSON for all cities we care about.
//
// This GeoJSON will be projected using mapshaper's dynamically-generated
// projection. Then we'll parse mapshaper's output and use the city coordinates.
function loadCitiesGeojson() {
  // 1. Find all the city IDs we want
  // 2. Load our existing GeoJSON and filter for only the IDs we want
  // 3. Write the result
  const wantedIds = {}
  for (const place of loadThreatenedPlaces()) {
    wantedIds[place.cityId] = null
  }

  const usGeos = JSON.parse(fs.readFileSync(`${__dirname}/../data/cities.geojson`)).features
  const caGeos = [
    {
      "type": "Feature",
      "properties": { "id": "London, Canada Ontario" },
      "geometry": { "type": "Point", "coordinates": [ -81.2453, 42.9849 ] }
    }
  ]
  const cityGeos = usGeos.concat(caGeos)

  const features = cityGeos.filter(geo => wantedIds.hasOwnProperty(geo.properties.id))

  return {
    type: 'FeatureCollection',
    features: features
  }
}

function writeCitiesGeojson() {
  const places = loadCitiesGeojson()

  try {
    fs.mkdirSync(`${__dirname}/../tmp`)
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
  }

  fs.writeFileSync(`${__dirname}/../tmp/threatened-cities.geojson`, JSON.stringify(places))
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

function replaceSvgCitiesWithPlaces(svg, places) {
  function circleToCity(circle) {
    return {
      id: circle.attr.id,
      x: parseFloat(circle.attr.cx),
      y: parseFloat(circle.attr.cy)
    }
  }

  function clusterPlaces(places) {
    // Simple algo:
    // 1. Sort points by how many points are near them.
    // 2. Go down the list, building a cluster around each non-clustered point
    //
    // Step 1 should help us avoid the (unlikely?) case like this:
    //
    //                       bcde
    //                 a     fghi     n
    //                       jklm
    //
    // ... we might create a cluster at `a` that pulls in all but `e`, `m` and
    // `n`; then those would also be clustered, and the two clusters would end
    // up positioned nearly atop one another (since they're positioned in their
    // centers of gravity). Step 1 forces us to cluster at `g` or `h`, which
    // means `a` and `n` will be looped in; that's what we want in this case.
    //
    // It's still a dinky algorithm. This is a slower and a teensy bit more
    // ideal than the naive algorithm Leaflet and Mapbox use.

    // 0. Keep scratchpad; don't write anything into the passed `threats`
    const points = places.map(place => { return { place: place } })

    // 0. Create index, with its fantastic within() method.
    const index = kdbush(points, p => p.place.x, p => p.place.y, 10, Int32Array)

    // 1. Sort threats from nearest-a-cluster to farthest-from-a-cluster
    for (const point of points) {
      point.nNear = index.within(point.place.x, point.place.y, ClusterRadius).length
    }
    const sortedPoints = points.slice().sort((a, b) => b.nNear - a.nNear)

    // 2. Iterate: build a cluster at each threat that hasn't been seen yet
    const clusters = [] // Array of { xSum, ySum, places }
    for (const point of sortedPoints) {
      if (point.visited) continue
      point.visited = true

      const cluster = { xSum: point.place.x, ySum: point.place.y, places: [ point.place ] }

      for (const closePointIndex of index.within(point.place.x, point.place.y, ClusterRadius)) {
        const closePoint = points[closePointIndex]
        if (closePoint.visited) continue
        closePoint.visited = true
        cluster.xSum += closePoint.place.x
        cluster.ySum += closePoint.place.y
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
        places: cluster.places
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

    if (cluster.places.length !== 1) {
      children.push(new XmlElement(
        'text',
        {
          x: String(cluster.x),
          y: String(cluster.y)
        },
        [ String(cluster.places.length) ]
      ))
    }

    const svgPlaces = cluster.places.map(place => {
      return {
        city: place.city,
        stateAbbreviation: place.stateAbbreviation,
        name: escape_html(place.name),
        threatDates: place.threatDates
      }
    })

    children.push(new XmlElement(
      'desc', {}, [ JSON.stringify(svgPlaces) ]
    ))

    return new XmlElement('g', {}, children)
  }

  const xml = new xmldoc.XmlDocument(svg)
  const cityG = xml.childWithAttribute('id', 'cities')
  const idToCity = indexArrayBy(cityG.children.map(circleToCity), 'id')
  const placesWithXY = places
    .map(place => {
      city = idToCity[place.cityId]
      if (!city) throw new Error(`We expected the city '${place.cityId}' to be in the SVG but it was not`)
      return Object.assign({ x: city.x, y: city.y }, place)
    })
  const clusters = clusterPlaces(placesWithXY)

  cityG.attr.id = 'places'
  cityG.children = clusters.map(clusterToG)
  return xml.toString({ compressed: true })
}

function indexArrayBy(array, key) {
  const ret = {}
  for (const item of array) {
    ret[item[key]] = item
  }
  return ret
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

  const withCities = replaceSvgCitiesWithPlaces(compressed, loadThreatenedPlaces())

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
  return width / height;
}

var Months = [ 'Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.' ];
function formatDateS(dateS) {
  var year = parseFloat(dateS.slice(0, 4));
  var month = parseFloat(dateS.slice(5, 7));
  var day = parseFloat(dateS.slice(8, 10));
  return Months[month - 1] + ' ' + day;
}
function formatDateWithYear(date) {
  return Months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}

function getWrapperHtml() {
  const tsv = fs.readFileSync(`${__dirname}/google-sheets/threats.tsv`, 'utf-8')
  const lastDate = tsv
    .split(/\r?\n/, 2)[0] // header row as String
    .split(/\t/)          // headers
    .filter(s => /^\d\d\d\d-\d\d-\d\d$/.test(s)) // dates
    .sort().reverse()[0]

  const nPlaces = tsv
    .split(/\r?\n/).slice(1) // body rows
    .filter(s => s.length)   // nix empty lines
    .length

  const css = loadCss(`${__dirname}/../data/html-styles.scss`)
  return [
    `<style>${css}</style>`,
    '<figure>',
      '<figcaption>Jewish Community Centers Threatened In 2017</figcaption>',
      '<div class="summary">',
        '<ul class="summary">',
          '<li class="n-total"><span class="count">166</span><span class="description">JCC Association locations in<br/>the United States and Canada</span></li>',
          `<li class="n-threatened"><span class="count">${nPlaces}</span><span class="description">Locations received bomb threats</span></li>`,
        '</ul>',
      '</div>',
      `<div class="svg-container"></div>`,
      `<div class="last-updated">Data current as of ${formatDateWithYear(new Date())}</div>`,
    '</figure>',
  ].join('')
}

const svg = loadSvg()

module.exports = {
  aspectRatio: svgToAspectRatio(svg),
  svg: svg,
  html: getWrapperHtml()
}
