'use strict'

const AssetPipeline = require('hpd-asset-pipeline')
const PageCompiler = require('./PageCompiler')
const StaticEndpoint = require('in-memory-website').StaticEndpoint
const StaticWebsite = require('in-memory-website').StaticWebsite
const read_config = require('./read_config')

const BaseUrl = process.env.BASE_URL || 'http://localhost:3000'
if (!/^https?:/.test(BaseUrl)) {
  throw new Error(`You set BASE_URL to ${BaseUrl}. Change it to start with "http://" or "https://" because Facebook/Twitter can't use any other URL schema`)
}

// Seeing this symbol somewhere? You should edit config/app.yml to
// create a helper class.
class ThereAreNoHelpers_EditConfigAppYmlToDefineThem {
  constructor() {}
}

class App {
  constructor(config) {
    this.config = config
  }

  _build_with_asset_bucket(asset_bucket) {
    const database = this.load_database()

    let helpers_ctor
    if (this.config.helpers) {
      helpers_ctor = require(`../${this.config.helpers}`)
    } else {
      helpers_ctor = ThereAreNoHelpers_EditConfigAppYmlToDefineThem
    }

    const page_config = read_config('pages')
    const page_compiler = new PageCompiler(
      page_config,
      this.config.base_path,
      BaseUrl,
      asset_bucket,
      database,
      helpers_ctor
    )
    const pages = page_compiler.render_all()

    return {
      assets: asset_bucket.toWebsite(),
      pages: new StaticWebsite(pages)
    }
  }

  build(callback) {
    AssetPipeline.render({
      host: BaseUrl,
      baseHref: this.config.base_path,
      basePath: `${__dirname}/../assets`,
      assets: read_config('assets')
    }, (err, bucket) => {
      if (err) return callback(err)
      let websites
      try {
        websites = this._build_with_asset_bucket(bucket)
      } catch (e) {
        return callback(e)
      }

      return callback(null, websites)
    })
  }

  load_database() {
    return require('../app/database')
  }
}

// calls callback(error, { assets: <StaticWebsite>, pages: <StaticWebsite> })
App.build_output_from_scratch = function(callback) {
  const app_config = read_config('app')
  const app = new App(app_config)

  try { // build() still has synchronous code
    app.build(callback)
  } catch (err) {
    return callback(err)
  }
}

module.exports = App
