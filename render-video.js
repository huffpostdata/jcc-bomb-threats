#!/usr/bin/env node
'use strict'

const NFrames = 160
const Title = 'Bomb Threats At Jewish Community Centers And Schools In 2017'
const Red = 'rgba(220, 21, 0, 0.8)'
const Gray = '#86888c'
const SkipDateLabels = { '2017-02-23': null }
const DateFontSize = 40
const TitleFontSize = 75
const NumberFontSize = 40

process.env.FONTCONFIG_PATH = require('path').resolve(__dirname, '../raw-assets/fonts')

const formatDateS = require('./app/formatDateS')
const PlacesWithXY = require('./app/PlacesWithXY')
const child_process = require('child_process')
const Color = require('color')
const svg = require('./app/svg')
const Width = svg.width
const ProgressHeight = 560
const Height = Width
const T0 = Date.parse(svg.firstDate + 'T00:00Z') - 2 * 86400000
const T1 = Date.parse(svg.lastDate + 'T23:59Z') + 86400000

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

ctx.fillStyle = 'black'
ctx._setFont('900', 'normal', TitleFontSize, 'pt', 'Proxima Nova Condensed')
const titleMetrics = ctx.measureText(Title)
ctx.fillText(Title, (Width - titleMetrics.width) / 2, 280)

const baseImageData = ctx.getImageData(0, 0, Width, Height)

const DateRange = {
  // Returns the fill this dateS should have when t=time
  dateSStyleAtTime(dateS, time) {
    const nDays = (time - Date.parse(dateS + 'T00:00Z')) / 86400000
    const NDesaturationDays = 10

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
        fill: Color(Red).desaturate(desaturation).fade(desaturation / 1.4).rgb().string()
      }
    } else {
      return {
        r: 1,
        fill: Color(Red).desaturate(1).fade(1/1.4).rgb().string()
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

function initDateTexts() {
  const ret = []

  for (const dateS of svg.dates) {
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, Width, 100)
    ctx.fillStyle = 'black'
    ctx._setFont('400', 'normal', DateFontSize, 'pt', 'Proxima Nova Regular')
    const text = formatDateS(dateS)
    const metrics = ctx.measureText(text)
    ctx.fillText(text, 0, DateFontSize)

    ctx._setFont('900', 'normal', NumberFontSize, 'pt', 'Proxima Nova Condensed')
    const nThreats = PlacesWithXY.filter(p => p.threatDates.indexOf(dateS) !== -1).length
    const numberMetrics = ctx.measureText(String(nThreats))

    ret.push({
      dateS: dateS,
      t: (Date.parse(dateS + 'T00:00Z') - T0) / (T1 - T0),
      nThreatsText: String(nThreats),
      nThreatsWidth: numberMetrics.width,
      width: metrics.width,
      imageData: ctx.getImageData(0, 0, metrics.width, DateFontSize * 1.2)
    })
  }

  return ret
}

const DateTexts = initDateTexts()
function drawProgressBar(t) {
  const ProgressTop = 280
  const LineTop = 120 + ProgressTop
  const LineMiddle = LineTop + 5
  const LineHeight = 10
  const CircleR = 32

  const dateFractions = []
  for (const dateS of svg.dates) {
    dateFractions.push((Date.parse(dateS + 'T00:00Z') - T0) / (T1 - T0))
  }

  ctx.fillStyle = Gray
  ctx.beginPath()
  ctx.rect(0, LineTop, Width, LineHeight)
  for (const dateFraction of dateFractions) {
    ctx.arc(Width * dateFraction, LineMiddle, CircleR, 0, Math.PI * 2)
    ctx.closePath()
  }
  ctx.fill()

  ctx.fillStyle = Red
  ctx.beginPath()
  ctx.rect(0, LineTop, t * Width, LineHeight)
  for (const dateFraction of dateFractions) {
    if (dateFraction <= t) {
      ctx.arc(Width * dateFraction, LineMiddle, CircleR, 0, Math.PI * 2)
      ctx.closePath()
    }
  }
  ctx.fill()

  ctx.fillStyle = 'black'
  for (const dateText of DateTexts) {
    if (!SkipDateLabels.hasOwnProperty(dateText.dateS)) {
      ctx.putImageData(dateText.imageData, Width * dateText.t - dateText.imageData.width / 2, LineMiddle + 60)
    }
  }

  ctx.fillStyle = 'white'
  ctx._setFont('900', 'normal', NumberFontSize, 'pt', 'Proxima Nova Condensed')
  for (const dateText of DateTexts) {
    ctx.fillText(dateText.nThreatsText, Width * dateText.t - dateText.nThreatsWidth / 2, LineMiddle + 14)
  }
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
        ctx.arc(place.x, place.y, 12 * style.r, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()
      }
    }
  }
  ctx.restore()

  drawProgressBar(t)

  return canvas.toBuffer('raw')
}

const ffmpeg = child_process.spawn('ffmpeg', `-f rawvideo -vcodec rawvideo -s ${Width}x${Height} -pix_fmt bgra -i - -c:v libx264 -tune animation -profile:v baseline -level 3.0 -vf format=yuv420p -r 25 -qp 1 -v debug -y video.mp4`.split(' '), {
  stdio: [ 'pipe', process.stdout, process.stderr ],
  maxBuffer: 2 * Width * Height * 4
})

let buf
for (let frame = 0; frame < NFrames; frame++) {
  buf = renderRawFrameData(frame / NFrames)
  ffmpeg.stdin.write(buf)
}

// Copy last frame a few times
for (let i = 0; i < 50; i++) {
  ffmpeg.stdin.write(buf)
}
ffmpeg.stdin.end()
