const kebabCase = require('lodash.kebabcase')

module.exports.urlString = (title) => {
  let string = kebabCase(title)
  let allowedChars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (var i = 0; i < 32; i++) {
    string += allowedChars.charAt(Math.floor(Math.random() * allowedChars.length))
  }
  string = string.slice(0, 255)
  return string
}
