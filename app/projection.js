'use strict'

const OutputWidth = 2000
const OutputMargin = 12
const Projection = 'albersusa'

const fs = require('fs')
const MapShaper = require('mapshaper').internal
const topojson = JSON.parse(fs.readFileSync(`${__dirname}/../data/shape-we-use-to-calculate-transform.topojson`))

const WGS84 = MapShaper.getProjection('wgs84')
const albersusa = MapShaper.getProjection(Projection)

const dataset = MapShaper.importTopoJSON(topojson)
MapShaper.projectDataset(dataset, WGS84, albersusa, {})
// logic from MapShaper.transformCoordsForSVG
const bounds = MapShaper.getDatasetBounds(dataset)
MapShaper.padViewportBoundsForSVG(bounds, OutputWidth, OutputMargin)
const height = Math.ceil(OutputWidth * bounds.height() / bounds.width())
const bounds2 = new MapShaper.Bounds(0, height, OutputWidth, 0)
const transform = bounds.getTransform(bounds2, true)

const proj = MapShaper.getProjTransform(WGS84, albersusa)
function projectFromWGS84(xy) {
  const projected = proj(xy.x, xy.y)
  const transformed = transform.transform(projected[0], projected[1], projectFromWGS84.scratch)
  return { x: Math.round(transformed[0]), y: Math.round(transformed[1]) }
}
projectFromWGS84.scratch = [ null, null ]

module.exports = {
  outputWidth: OutputWidth,
  outputMargin: OutputMargin,
  projectFromWGS84: projectFromWGS84
}
