'use strict'

const fs = require('fs')

const PageContext = require('../generator/PageContext')
const escape_html = require('../generator/escape_html')

function extend_context(context, locals) {
  const new_locals = Object.assign({ model: context.model }, context.locals, locals)
  return new PageContext(context.compiler, new_locals)
}

class Helpers {
  constructor(context) {
    this.context = context
  }

  partial(name, options) {
    const context = extend_context(this.context, options || {})
    return this.context.render_template(name, context)
  }

  file_contents(path) {
    const buf = fs.readFileSync(`${__dirname}/../${path}`, 'utf-8')
    const s = buf.toString('utf-8')
    return s
  }

  // Renders "1/27/2017" as "2017-01-27"
  sToHtml5DateS(s) {
    const parts = s.split(/\//g)

    return `${parts[2]}-${String(100 + +parts[0]).slice(1)}-${String(100 + +parts[1]).slice(1)}`
  }

  // Renders '1/27/2017" as "January 27, 2017"
  sToFormattedDate(s) {
    const parts = s.split(/\//g).map(s => +s)
    const Months = 'January February March April May June July August September October November December'.split(/ /)

    return `${Months[parts[0] - 1]} ${parts[1]}, ${parts[2]}`
  }
}

module.exports = Helpers
