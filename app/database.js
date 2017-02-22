const fs = require('fs')

const lastDate = fs.readFileSync(`${__dirname}/google-sheets/threats.tsv`, 'utf-8')
  .split(/\r?\n/, 2)[0] // header row as String
  .split(/\t/)          // headers
  .filter(s => /^\d\d\d\d-\d\d-\d\d$/.test(s)) // dates
  .sort().reverse()[0]

module.exports = {
  'jcc-threats': {
    date: lastDate,
    svg: require('./svg')
  }
}
