#!/usr/bin/env node

'use strict'

const App = require('./App')
const AWS = require('./AWS')

function exit(err) {
  if (err) throw err
}

App.build_output_from_scratch((err, output) => {
  if (!err && output.error) err = output.error // TODO clean this up in App
  if (err) return exit(err)

  AWS.uploadWebsite(output.assets, err => {
    if (err) return exit(err)

    AWS.uploadWebsite(output.pages, exit)
  })
})
