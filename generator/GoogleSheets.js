'use strict'

const fs = require('fs')
const yaml = require('js-yaml')
const csv_parse = require('csv-parse/lib/sync')

class GoogleSheets {
  constructor(config) {
    this.config = config
    this.cache = new Map()
  }

  slug_to_tsv(slug) {
    const input_path = `${this.config.code_path}/${slug}.tsv`
    const tsv = fs.readFileSync(input_path, 'utf-8')
    return tsv;
  }

  // Returns an Array of Objects for the given slug.
  //
  // You must have called download_all_sync() to get data for this method.
  slug_to_array(slug) {
    if (!this.cache.has(slug)) {
      const tsv = this.slug_to_tsv(slug);
      const array = csv_parse(tsv, { delimiter: '\t', columns: true })
      this.cache.set(slug, array)
    }

    return this.cache.get(slug)
  }

  // Turns a Google Sheets spreadsheet into a JSON object mapping sheet name to
  // an Array of Object values, one per row.
  download_all(callback) {
    const gdcd = require('google-drive-console-download')(null) // only require() in dev: not production

    const todo = this.config.sheets.slice()
    const base_dir = this.config.code_path

    function step() {
      if (todo.length === 0) return callback()

      const sheet = todo.shift()
      process.stderr.write(`GET ${sheet.slug}…`)
      gdcd.download(sheet.googleId, 'text/tab-separated-values', (err, tsv) => {
        if (err) return callback(err)

        const bytes = Buffer.from(tsv, 'utf-8')

        process.stderr.write(` ${bytes.length} bytes…`)
        const output_path = `${base_dir}/${sheet.slug}.tsv`
        fs.writeFile(output_path, bytes, err => {
          if (err) return callback(err)
          process.stderr.write(` ⇒ ${output_path}\n`)
          process.nextTick(step)
        })
      })
    }

    step()
  }
}

module.exports = GoogleSheets

if (require.main === module) {
  const read_config = require('./read_config')
  const config = read_config('google-sheets')
  const google_sheets = new GoogleSheets(config)
  google_sheets.download_all(err => {
    if (err) console.error(err)
  })
}
