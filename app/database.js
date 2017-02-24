const fs = require('fs')

const lastDate = fs.readFileSync(`${__dirname}/google-sheets/threats.tsv`, 'utf-8')
  .split(/\r?\n/, 2)[0] // header row as String
  .split(/\t/)          // headers
  .filter(s => /^\d\d\d\d-\d\d-\d\d$/.test(s)) // dates
  .sort().reverse()[0]

const svg = require('./svg')

module.exports = {
  svg: {
    date: lastDate,
    blob: Buffer.from(svg.svg),
  },

  'jcc-threats': {
    date: lastDate,
    html: svg.html,
    aspectRatio: svg.aspectRatio
  },
}
