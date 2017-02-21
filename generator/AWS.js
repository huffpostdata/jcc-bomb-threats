'use strict'

const async = require('async')
const S3 = new (require('aws-sdk').S3)()

if (!process.env.S3_BUCKET) {
  throw new Error('You must set the S3_BUCKET environment variable to use AWS')
}
const BucketName = process.env.S3_BUCKET
const NConcurrentUploads = 10

const DefaultParams = {
  Bucket: BucketName,
  ACL: 'public-read',
  ServerSideEncryption: 'AES256'
}

function uploadEndpoint(endpoint, callback) {
  if (endpoint.path.charAt(0) !== '/') {
    return callback(new Error(`Path '${endpoint.path}' does not begin with '/'`))
  }

  const params = Object.assign({}, DefaultParams, {
    Key: endpoint.path.slice(1),
    Body: endpoint.body,
    ContentType: endpoint.headers['Content-Type'] || 'application/octet-stream',
    ContentEncoding: endpoint.headers['Content-Encoding'] || '',
    ContentDisposition: endpoint.headers['Content-Disposition'] || '',
    CacheControl: endpoint.headers['Cache-Control'] || 'public',
    WebsiteRedirectLocation: endpoint.headers['Location'] || null
  })

  console.log(`PUT s3://${params.Bucket}/${params.Key} ${params.ContentType} ${params.CacheControl}`)
  return S3.putObject(params, callback)
}

function uploadWebsite(website, callback) {
  return async.mapLimit(website.endpoints, NConcurrentUploads, uploadEndpoint, callback)
}

module.exports = {
  uploadWebsite: uploadWebsite
}
