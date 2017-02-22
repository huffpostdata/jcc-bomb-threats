const child_process = require('child_process')
const fs = require('fs')
const sass = require('node-sass')
const csv_parse = require('csv-parse/lib/sync')

const filename = `${__dirname}/../data/jcc-threat-map.svg`

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
              place: row['JCC NAME']
            })
          }
        }
      }
    }

    const city = {
      id: id,
      city: cityRows[0].CITY,
      stateAbbreviation: cityRows[0].STATE, // TODO convert to abbreviation
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
      '-svg-style', 'r=20',
      '-o', '-', 'format=svg', 'precision=1', 'width=2000', 'margin=5', 'id-field=id'
    ],
    {
      maxBuffer: 8*1024*1024,
      encoding: 'utf-8'
    }
  )
}

function formatCities(svg, cities) {
  const idToCity = {}
  for (const city of loadThreatenedCities()) {
    idToCity[city.id] = city
  }

  const idRegex = / id="([^"]+)"/
  const xRegex = / cx="([^"]+)"/
  const yRegex = / cy="([^"]+)"/

  return svg.replace(/<circle([^>]*)\/>/g, (_, attributes) => {
    const idMatch = idRegex.exec(attributes)
    if (!idMatch) throw new Error(`Circle '${_}' is missing an 'id' attribute`)
    const x = parseFloat(xRegex.exec(attributes)[1])
    const y = parseFloat(yRegex.exec(attributes)[1])
    const city = idToCity[idMatch[1]]
    if (!city) throw new Error(`Could not match city ${idMatch[1]}`)

    const circle = `<circle cx="${x}" cy="${y}" r="20"/>`
    const text = city.threats.length === 1 ? '' : `<text x="${x}" y="${y}">${city.threats.length}</text>`
    const desc = `<desc>${JSON.stringify(city)}</desc>`
    return `<g>${circle}${text}${desc}`
  })
}

function loadSvg() {
  const svg = runMapshaper()

  const css = loadCss(`${__dirname}/../data/svg-styles.scss`)

  const withCities = formatCities(svg, loadCities())

  const withStyle = withCities.replace('baseProfile="tiny"', 'baseProfile="basic"')
    .replace('<g', `<defs><style>${css}</style></defs><g`)

  const withClasses = withStyle.replace(/ id="/g, ' class="')

  return withClasses
}

function svgToAspectRatio(svg) {
  const viewBoxM = /\sviewBox="0 0 (\d+) (\d+)"/.exec(svg)
  if (!viewBoxM) {
    throw new Error(`Could not read viewBox from SVG in ${filename}`)
  }
  const width = +viewBoxM[1]
  const height = +viewBoxM[2]
}

function wrapSvgWithHtml(svg) {
  const css = loadCss(`${__dirname}/../data/html-styles.scss`)
  return `<style>${css}</style><div class="svg-container">${svg}</div>`
}

const svg = loadSvg()

module.exports = {
  aspectRatio: svgToAspectRatio(svg),
  svg: svg,
  html: wrapSvgWithHtml(svg)
}
