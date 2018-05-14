const pixel = require('pixelhosting')
const express = require('express')
const app = express()
const fs = require('fs')
const bodyParser = require('body-parser')
const jimp = require('jimp')
const cors = require('cors')
const config = require('./config')

pixel.init({
  api_key: config.pixel.api_key,
  api_key_id: config.pixel.api_key_id
})

app.use(cors())

app.use(bodyParser.json({ limit: '100mb' }))
app.use(bodyParser.urlencoded({ limit: '100mb', extended: false }))

app.post('/v1/new', async function (req, res) {
  let image = req.body.image
  pixel.upload(image).then(result => {
    res.json({status: 'ok', filename: result.secure_url})
  }).catch(err => {
    console.log(err)
    res.sendStatus(500)
  })
})

app.get('/v1/sticker/:filename', function (req, res) {
  res.setHeader('Content-Type', 'image/png')
  jimp.read('../memes/Stickers/' + req.params.filename, (err, re) => {
    if (!err) {
      let scale = 200 / re.bitmap.height
      re.scale(scale)
        .getBuffer(jimp.MIME_PNG, (err, buff) => {
          if (err) console.log(err)
          res.send(buff)
        })
    }
  })
})

app.get('/v1/meme/:filename', function (req, res) {
  res.setHeader('Content-Type', 'image/png')
  jimp.read('../memes/' + req.params.filename, (err, re) => {
    if (!err) {
      let scale = 500 / re.bitmap.height
      re.scale(scale)
        .getBuffer(jimp.MIME_PNG, (err, buff) => {
          if (err) console.log(err)
          res.send(buff)
        })
    }
  })
})

app.get('/v1/thumbnail/:filename', function (req, res) {
  res.setHeader('Content-Type', 'image/png')
  jimp.read('../memes/' + req.params.filename, (err, re) => {
    if (!err) {
      let scale = 50 / re.bitmap.height
      re.scale(scale)
        .getBuffer(jimp.MIME_PNG, (err, buff) => {
          if (err) console.log(err)
          res.send(buff)
        })
    }
  })
})

app.get('/v1/stickers', function (req, res) {
  let images = []
  fs.readdirSync('../memes/Stickers/Accessories').filter(function (l) { return l.includes('.png') || l.includes('.jpg') }).forEach(function (sticker) {
    images.push(sticker)
  })
  fs.readdirSync('../memes/Stickers/Communities').filter(function (l) { return l.includes('.png') || l.includes('.jpg') }).forEach(function (sticker) {
    images.push(sticker)
  })
  fs.readdirSync('../memes/Stickers/Crypto').filter(function (l) { return l.includes('.png') || l.includes('.jpg') }).forEach(function (sticker) {
    images.push(sticker)
  })
  fs.readdirSync('../memes/Stickers/Faces').filter(function (l) { return l.includes('.png') || l.includes('.jpg') }).forEach(function (sticker) {
    images.push(sticker)
  })
  res.json({status: 'ok', images})
})

app.get('/v1/memes', function (req, res) {
  res.json({status: 'ok', images: fs.readdirSync('../memes').filter(function (l) { return l.includes('.png') || l.includes('.jpg') })})
})

app.get('/v1/', function (req, res) {
  res.json({status: 'ok'})
})

app.listen(3001, function () {
  console.log('Started')
})
