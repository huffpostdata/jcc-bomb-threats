#!/usr/bin/env node
'use strict'

const chokidar = require('chokidar')
const DevServer = require('in-memory-website').DevServer

const server = new DevServer(`${__dirname}/build.js`)

chokidar.watch('app assets config data generator views'.split(' '), {
  ignored: /([\/\\]\.|.*.marko.js$)/
})
  .on('change', () => server.queueBuild())
  .on('add', () => server.queueBuild())
  .on('unlink', () => server.queueBuild())

server.listen(3000, err => {
  if (err) throw err

  console.log('Listening at http://localhost:3000')
  server.listenForLiveReload()
})
