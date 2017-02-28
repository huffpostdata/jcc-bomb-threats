const fs = require('fs')
const sass = require('node-sass')
const escape_html = require('../generator/escape_html')
const kdbush = require('kdbush')

const PlacesWithXY = require('./PlacesWithXY')

const ClusterRadius = 80
const PointRadius = 40

function loadCss(filePath) {
  return sass.renderSync({
    file: filePath,
    outputStyle: 'compressed'
  }).css.toString('utf-8')
}

// Changes <g class="mesh"...><path/>... into <path class="mesh">
function simplifySvgMesh(svg) {
  return svg.replace(/<g.*?<\/g>/, g => {
    const paths = []
    const regex = /\bd="([^"]*)"/g
    while (true) {
      const m = regex.exec(g)
      if (!m) return `<path class="mesh" d="${paths.join('')}"/>`

      paths.push(m[1])
    }
  })
}

function compressSvg(svg) {
  const withSimpleMesh = simplifySvgMesh(svg)
  return withSimpleMesh
}

function buildCitiesG() {
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
      cluster.places.sort((a, b) => {
        return (a.stateAbbreviation.localeCompare(b.stateAbbreviation)
                ||
                a.city.localeCompare(b.city)
        )
      })

      return {
        x: Math.round(cluster.xSum / cluster.places.length),
        y: Math.round(cluster.ySum / cluster.places.length),
        places: cluster.places,
        schools: cluster.places.filter(p => p.purpose === 'school'),
        communityCenters: cluster.places.filter(p => p.purpose === 'community center')
      }
    })
  }

  const clusters = clusterPlaces(PlacesWithXY)

  function placeToSvgPlace(place) {
    return {
      city: place.city,
      stateAbbreviation: place.stateAbbreviation,
      name: place.name
    }
  }

  function clusterToG(cluster) {
    const text = cluster.places.length === 1 ? '' : [
      `<text x="${cluster.x}" y="${cluster.y}">${cluster.places.length}</text>`
    ].join('')

    const descXml = escape_html(JSON.stringify({
      schools: cluster.schools.map(placeToSvgPlace),
      communityCenters: cluster.communityCenters.map(placeToSvgPlace)
    }))

    return [
      `<g>`,
        `<circle cx="${cluster.x}" cy="${cluster.y}" r="${PointRadius}"/>`,
        text,
        `<desc>${descXml}</desc>`,
      `</g>`
    ].join('')
  }

  return `<g class="places">${clusters.map(clusterToG).join('')}</g>`
}

function loadSvg() {
  const svg = fs.readFileSync(`${__dirname}/../data/jcc-threat-map.svg`, 'utf-8')

  const compressed = compressSvg(svg)

  const withCities = compressed.replace('</svg>', buildCitiesG() + '</svg>')

  const css = loadCss(`${__dirname}/../data/svg-styles.scss`)
  const withStyle = withCities.replace('baseProfile="tiny"', 'baseProfile="basic"')
    .replace('<path', `<defs><style>${css}</style></defs><path`)

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

const Months = [ 'Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.' ];
function formatDateS(dateS) {
  const month = parseFloat(dateS.slice(5, 7))
  const day = parseFloat(dateS.slice(8, 10))
  return Months[month - 1] + ' ' + day
}
function formatDateSWithYear(dateS) {
  return formatDateS(dateS) + ', ' + dateS.slice(0, 4)
}

function getWrapperHtml() {
  const tsvBlob = fs.readFileSync(`${__dirname}/google-sheets/threats.tsv`)
  const tsv = tsvBlob.toString('utf-8')
  const lastDate = tsv
    .split(/\r?\n/, 2)[0] // header row as String
    .split(/\t/)          // headers
    .filter(s => /^\d\d\d\d-\d\d-\d\d$/.test(s)) // dates
    .sort().reverse()[0]

  const places = PlacesWithXY
  const nThreats = places.reduce(((s, place) => s + place.threatDates.length), 0)
  const nSchools = places.filter(p => p.purpose === 'school').length
  const nCommunityCenters = places.filter(p => p.purpose === 'community center').length

  const css = loadCss(`${__dirname}/../data/html-styles.scss`)
  return [
    `<style>${css}</style>`,
    '<figure>',
      '<figcaption>Jewish Community Centers And Schools Threatened In 2017</figcaption>',
      '<div class="summary">',
        '<ul class="summary">',
          `<li class="n-total"><span class="count">${nThreats}</span><span class="description"> bomb threats</li>`,
          `<li class="n-threatened"><span class="count">${nCommunityCenters}</span><span class="description">Jewish community centers</span></li>`,
          `<li class="n-threatened"><span class="count">${nSchools}</span><span class="description">Jewish schools</span></li>`,
        '</ul>',
      '</div>',
      `<div class="svg-container"></div>`,
      `<div class="last-updated"><a download="bomb-threats.tsv" href="data:text/comma-separated-values;charset=utf-8;base64,${tsvBlob.toString('base64')}">Data</a> current as of ${formatDateSWithYear(lastDate)}</div>`,
      '<div class="credit">Map credit: Adam Hooper and Alissa Scheller</div>',
    '</figure>',
  ].join('')
}

const svg = loadSvg()

module.exports = {
  aspectRatio: svgToAspectRatio(svg),
  svg: svg,
  html: getWrapperHtml()
}
