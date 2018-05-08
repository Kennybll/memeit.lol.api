const pixel = require('pixelhosting')
const config = require('../config')

pixel.init({
  api_key: config.pixel.api_key,
  api_key_id: config.pixel.api_key_id
})

module.exports = pixel
