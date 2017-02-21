#!/usr/bin/env node
'use strict'

process.env.UGLIFY = 'true'

const App = require('./App')
const StaticWebsite = require('in-memory-website').StaticWebsite
const validate = require('in-memory-website').validate

App.build_output_from_scratch((err, output) => {
  if (err) throw err

  const website = StaticWebsite.merge(output.assets, output.pages)
  const validationError = validate.headersAreUseful(website)
  if (validationError) throw validationError

  process.stdout.write(website.toBuffer())
  process.exitCode = 0
})
