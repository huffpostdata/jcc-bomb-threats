const fs = require('fs')
const sass = require('node-sass')

const filename = `${__dirname}/../data/jcc-threat-map.svg`

function loadCss(filePath) {
  return sass.renderSync({
    file: filePath,
    outputStyle: 'compressed'
  }).css.toString('utf-8')
}

function loadSvg() {
  const svg = fs.readFileSync(filename, 'utf-8')
  const css = loadCss(`${__dirname}/../data/svg-styles.scss`)

  const withStyle = svg.replace('baseProfile="tiny"', 'baseProfile="basic"')
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
