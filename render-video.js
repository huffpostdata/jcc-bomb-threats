#!/usr/bin/env node
'use strict'

const PlacesWithXY = require('./app/PlacesWithXY')
const child_process = require('child_process')
const Color = require('color')
const svg = require('./app/svg')
const Width = svg.width
const ProgressHeight = 80
const Height = svg.height + ProgressHeight
const T0 = Date.parse(svg.firstDate + 'T00:00Z') - 2 * 86400000
const T1 = Date.parse(svg.lastDate + 'T23:59Z') + 86400000
const Red = '#e34433'
const Gray = '#6d6e71'

const pathD = svg.svg
  .replace(/r?\n/g, '')
  .replace(/^<svg.*<path class="mesh" d="([^"]*)".*$/, (_, d) => d)

const Canvas = require('canvas')
const canvas = new Canvas(Width, Height)
const ctx = canvas.getContext('2d')

function drawSvgPathD(ctx, d) {
  const OpRe = /^[, ]*([mMLlHhVvZ]?)/
  const NumberRe = /^[, ]*(-?(\.\d+|\d+\.\d+|\d+))/
  let lastOp = 'M'
  let pos = 0
  function skipSpace() {
    const m = SpaceRe.exec(d.slice(pos))

  }
  function readOp() {
    const m = OpRe.exec(d.slice(pos))
    if (!m) throw new Error('Expected op in <path> d; found: ' + d.slice(pos, pos + 20))
    pos += m[0].length
    const op = (m[1] === ' ' || m[1] === ',' || m[1] === '') ? lastOp : m[1]
    lastOp = op
    return op
  }
  function readNumber() {
    const m = NumberRe.exec(d.slice(pos))
    if (!m[1]) throw new Error('Expected Number in <path> d; found: ' + d.slice(pos, pos + 20))
    pos += m[0].length
    return parseFloat(m[1])
  }

  let x = 0
  let y = 0

  while (pos < d.length) {
    switch (readOp()) {
      case 'M':
        x = readNumber()
        y = readNumber()
        ctx.moveTo(x, y)
        break
      case 'm':
        x += readNumber()
        y += readNumber()
        ctx.moveTo(x, y)
        break
      case 'L':
        x = readNumber()
        y = readNumber()
        ctx.lineTo(x, y)
        break
      case 'l':
        x += readNumber()
        y += readNumber()
        ctx.lineTo(x, y)
        break
      case 'H':
        x = readNumber()
        ctx.lineTo(x, y)
        break
      case 'h':
        x += readNumber()
        ctx.lineTo(x, y)
        break
      case 'V':
        y = readNumber()
        ctx.lineTo(x, y)
        break
      case 'v':
        y += readNumber()
        ctx.lineTo(x, y)
        break
      case 'Z':
        ctx.closePath()
        break
      case null:
        return
    }
  }
}

ctx.fillStyle = 'white'
ctx.fillRect(0, 0, Width, Height)
ctx.save()
ctx.translate(0, ProgressHeight)
ctx.strokeStyle = Gray
drawSvgPathD(ctx, pathD)
ctx.stroke()
ctx.restore()

const baseImageData = ctx.getImageData(0, 0, Width, Height)

const DateRange = {
  // Returns the fill this dateS should have when t=time
  dateSStyleAtTime(dateS, time) {
    const nDays = (time - Date.parse(dateS + 'T00:00Z')) / 86400000
    const NDesaturationDays = 12

    if (nDays <= 0) {
      return null
    } else if (nDays < 1) {
      return {
        r: nDays,
        fill: Red
      }
    } else if (nDays - 1 < NDesaturationDays) {
      const desaturation = (nDays - 1) / NDesaturationDays;
      return {
        r: 1,
        fill: Color(Red).desaturate(desaturation).fade(desaturation / 2).rgb().string()
      }
    } else {
      return {
        r: 1,
        fill: Color(Red).desaturate(1).fade(0.5).rgb().string()
      }
    }
  },

  tToStyleDictionary(t) {
    const time = t * (T1 - T0) + T0
    const ret = {}
    for (const dateS of svg.dates) {
      ret[dateS] = this.dateSStyleAtTime(dateS, time)
    }
    return ret
  }
}

function drawProgressBar(t) {
  const ProgressTop = 0
  const ProgressMiddle = ProgressTop + ProgressHeight / 2
  const LineHeight = 8
  const CircleR = 16

  const dateFractions = []
  for (const dateS of svg.dates) {
    dateFractions.push((Date.parse(dateS + 'T00:00Z') - T0) / (T1 - T0))
  }

  ctx.fillStyle = Gray
  ctx.beginPath()
  ctx.rect(0, ProgressMiddle - LineHeight / 2, Width, LineHeight)
  for (const dateFraction of dateFractions) {
    ctx.arc(Width * dateFraction, ProgressMiddle, CircleR, 0, Math.PI * 2)
    ctx.closePath()
  }
  ctx.fill()

  ctx.fillStyle = Red
  ctx.beginPath()
  ctx.rect(0, ProgressMiddle - LineHeight / 2, t * Width, LineHeight)
  for (const dateFraction of dateFractions) {
    if (dateFraction <= t) {
      ctx.arc(Width * dateFraction, ProgressMiddle, CircleR, 0, Math.PI * 2)
      ctx.closePath()
    }
  }
  ctx.fill()
}

// From t=0..1, return raw RGBA/ABGR pixel data for a frame of animation
function renderRawFrameData(t) {
  ctx.putImageData(baseImageData, 0, 0)

  const styles = DateRange.tToStyleDictionary(t)

  ctx.save()
  ctx.translate(0, ProgressHeight)
  for (const place of PlacesWithXY) {
    for (const dateS of place.threatDates) {
      const style = styles[dateS]
      if (style !== null) {
        ctx.beginPath()
        ctx.fillStyle = style.fill
        ctx.arc(place.x, place.y, 20 * style.r, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()
      }
    }
  }
  ctx.restore()

  drawProgressBar(t)

  return canvas.toBuffer('raw')
}

const ffmpeg = child_process.spawn('ffmpeg', `-f rawvideo -vcodec rawvideo -s ${Width}x${Height} -pix_fmt bgra -i - -c:v libx264 -r 25 -qp 1 -v debug -y video.mp4`.split(' '), {
  stdio: [ 'pipe', process.stdout, process.stderr ],
  maxBuffer: 2 * Width * Height * 4
})

const NFrames = 120
for (let frame = 0; frame < NFrames; frame++) {
  const buf = renderRawFrameData(frame / NFrames)
  ffmpeg.stdin.write(buf)
}
ffmpeg.stdin.end()
