const router = require('express').Router()
const rpcMiddleWare = require('../modules/rpc').rpcMiddleWare

router.use('/v1', rpcMiddleWare)

module.exports = router
