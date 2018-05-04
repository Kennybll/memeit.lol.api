const pixel = require('pixelhosting')
const express = require('express')
const app = express()
const fs = require('fs')
const bodyParser = require('body-parser')
const uuid = require('uuid/v4')
const cors = require('cors')
const config = require('./config')

pixel.init({
  api_key: config.pixel.api_key,
  api_key_id: config.pixel.api_key_id
})

app.use(cors())

app.use(bodyParser.json({ limit: '100mb' }))
app.use(bodyParser.urlencoded({ limit: '100mb', extended: false }))

app.post('/new', async function(req, res) {
  let image = req.body.image
  pixel.upload(image).then(result => {
    res.json({status: "ok", filename: result.secure_url})
  }).catch(err => {
    console.log(err)
    res.sendStatus(500)
  })
})

app.get('/memes', function(req, res) {
  res.json({status: "ok", images: fs.readdirSync('../memes').filter(function(l) {return l.includes('.png') || l.includes('.jpg')})})
})

app.get('/', function(req, res) {
  res.json({status: "ok"})
})

app.listen(3001, function() {
  console.log('Started')
})
