'use strict'

const crypto = require('crypto')
const glob = require('glob')
const marko = require('marko')

const PageContext = require('./PageContext')

function md5sum(string) {
  const hash = crypto.createHash('md5')
  hash.update(string)
  return hash.digest('hex')
}

module.exports = class PageCompiler {
  constructor(config, base_path, base_url, assets, database, helpers_ctor) {
    this.base_path = base_path
    this.base_url = base_url
    this.config = config
    this.assets = assets
    this.database = database
    this.helpers_ctor = helpers_ctor
    this.cache = new Map()
  }

  get_template(key) {
    if (!this.cache.has(key)) {
      const path = `views/${key}.marko`
      const template = marko.load(path, { writeToDisk: false })
      this.cache.set(key, template)
    }

    return this.cache.get(key)
  }

  render_template(template_key, context) {
    const template = this.get_template(template_key)
    return template.renderToString(context)
  }

  render(path, object, data) {
    const template_key = object.template || object.path.slice(1) || 'index'

    let body

    if (Buffer.isBuffer(data.model)) {
      body = data.model
    } else if (object.hasOwnProperty('blob') && Buffer.isBuffer(data.model[object.blob])) {
      body = data.model[object.blob]
    } else {
      const context = new PageContext(this, data)
      body = this.render_template(template_key, context)
    }

    return {
      path: path,
      body: body,
      headers: Object.assign({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=600'
      }, object.headers || {})
    }
  }

  render_page(page) {
    if (!page.path || typeof page.path !== 'string') {
      throw new Error(`Page object ${JSON.stringify(page)} is missing a 'path' property, or the 'path' property is not a String. Please add a String 'path' property.`)
    }
    if (page.path.charAt(0) !== '/') {
      throw new Error(`Page path '${page.path}' must start with '/'. Please add a leading '/'.`)
    }

    const out = []

    const path = page.path === '/' ? this.base_path : `${this.base_path}${page.path}`

    if (page.collection) {
      const collection = this.database[page.collection]
      if (!collection) {
        throw new Error(`Page '${page.path}' specifies collection '${page.collection}' which does not exist. Add it to Database.`)
      }
      if (!Array.isArray(collection)) {
        throw new Error(`Page '${page.path}' specifies collection '${page.collection}', but that is not an Array. Please make ${page.collection} an Array in Database.`)
      }

      for (const model of collection) {
        const onePath = path.replace(/:(\w+)/, (_, name) => encodeURIComponent(model[name]))
        out.push(this.render(onePath, page, { model: model }))
      }
    } else if (page.redirect) {
      if (page.redirect.charAt(0) !== '/') {
        throw new Error(`Redirect path '${page.redirect}' must start with '/'. Please add a leading '/'.`)
      }
      out.push({ path: path, headers: { Location: `${this.base_path}${page.redirect}` }, body: Buffer.from([]) })
    } else {
      let model
      if (page.model) {
        if (!this.database.hasOwnProperty(page.model)) {
          throw new Error(`Page '${page.path}' specifies model '${page.model}', but that is undefined. Please set '${page.model}' in Database, or change the page definition.`)
        }
        model = this.database[page.model]
        const onePath = path.replace(/:(\w+)/, (_, name) => encodeURIComponent(model[name]))
        out.push(this.render(onePath, page, { model: model }))
      } else {
        out.push(this.render(path, page, {}))
      }
    }

    return out
  }

  render_all() {
    const out = []

    for (const page of this.config) {
      out.push(this.render_page(page))
    }

    return [].concat(...out)
  }
}
