const pixel = require('./pixelhosting')
const images = require('@memeit.lol/images')
const links = require('../modules/links')
const delegators = require('../modules/delegators')
const steem = require('../modules/steem')
const db = require('../db/index')
const jwt = require('jwt-simple')
const config = require('../config')
const moment = require('moment')

async function upload (params, id) {
  let imageData = params.imageData
  pixel.upload(imageData).then(function (res) {
    return {'jsonrpc': '2.0', 'result': {imageURL: res.secure_url}, 'id': id}
  }).catch(function (err) {
    console.log(err)
    return {'jsonrpc': '2.0', 'error': {'code': -32000, 'message': 'Image Could Not Upload'}, 'id': id}
  })
}

async function memeList (params, id) {
  let imageList = images.list()
  return {'jsonrpc': '2.0', 'result': {imageList}, 'id': id}
}

async function getFeed (params, id) {
  let posts = await db.Post.find({hidden: false}).sort({time: -1}).skip(params.number > 0 ? 10 * params.number : 0).limit(10)
  posts = await Promise.all(posts.map(async function (post) {
    post.payout = await delegators.payoutCalculator(post.author, post.permlink)
    return post
  }))
  return {'jsonrpc': '2.0', 'result': {posts}, 'id': id}
}

async function getModFeed (params, id) {
  let posts = await db.Post.find({time: {$gt: Date.now() - 86400000}, votes: {$not: {$elemMatch: {mod: params.sc.name}}}, author: {$ne: params.sc.name}})
  posts = posts.sort(function (a, b) { return 0.5 - Math.random() })
  return {'jsonrpc': '2.0', 'result': {posts}, 'id': id}
}

async function getUser (params, id) {
  let user = await delegators.getAccountInfo(params.username)
  let posts = await db.Post.find({author: params.username, hidden: false}).sort({time: -1}).limit(10)
  posts = await Promise.all(posts.map(async function (post) {
    post.payout = await delegators.payoutCalculator(post.author, post.permlink)
    return post
  }))
  return {'jsonrpc': '2.0', 'result': {posts, user}, 'id': id}
}

async function getDelegators (params, id) {
  let delegating = await delegators.loadDelegationsAsync('memeit.lol')
  return {'jsonrpc': '2.0', 'result': {delegating}, 'id': id}
}

async function getPost (params, id) {
  return new Promise(function (resolve, reject) {
    delegators.getPost(params.username, params.permlink).then(async function (i) {
      i.img = await delegators.getImg(params.username)
      return i
    }).then(async function (i) {
      i.comments = await delegators.getComments(params.username, params.permlink)
      return i
    }).then(async function (i) {
      i.payout = await delegators.payoutCalculator(params.username, params.permlink)
      resolve({'jsonrpc': '2.0', 'result': {post: i}, 'id': id})
    })
  })
}

async function votePost (params, id) {
  let author = params.author
  let permlink = params.permlink
  let voter = params.sc.name
  let weight = params.weight * 100

  steem.vote(voter, author, permlink, weight, function (err, steemResponse) {
    if (err) {
      console.log(err)
      return {'jsonrpc': '2.0', 'error': {'code': -32004, 'message': 'Could Not Upvote Post'}, 'id': id}
    } else return {'jsonrpc': '2.0', 'result': {}, 'id': id}
  })
}

async function comment (params, id) {
  let author = params.sc.name
  let permlink = links('')
  let title = 'RE: ' + params.permlink
  let body = params.image
  let parentAuthor = params.author
  let parentPermlink = params.permlink
  steem.broadcast([['comment', {'parent_author': parentAuthor, 'parent_permlink': parentPermlink, 'author': author, 'permlink': permlink, 'title': title, 'body': `<img src="${body}" />`, 'json_metadata': JSON.stringify({app: 'memeit.lol/0.0.1', image: [body]})}]], function (err, response) {
    if (err) {
      console.log(err)
      return {'jsonrpc': '2.0', 'error': {'code': -32005, 'message': 'Could Not Memeply To Post'}, 'id': id}
    } else return {'jsonrpc': '2.0', 'result': {}, 'id': id}
  })
}

async function modVote (params, id) {
  let post = params.post
  let author = post.split('/')[0]
  let permlink = post.split('/')[1]
  let vote = params.value
  let Post = await db.Post.findOne({author, permlink})
  let hidden
  if (Post.score === undefined) {
    hidden = !(vote > 0)
  } else {
    hidden = 1(Post.score + vote > 0)
  }
  switch (vote) {
    case 0:
      db.Post.findOneAndUpdate({author, permlink}, {hidden, $push: {votes: {mod: params.sc.name, approved: vote}}}).exec()
      break
    default:
      db.Post.findOneAndUpdate({author, permlink}, {hidden, $inc: {score: vote}, $push: {votes: {mod: params.sc.name, approved: vote}}}).exec()
      break
  }
  let mods = await db.Mod.find({steem: params.sc.name})
  if (mods.length > 0) db.Mod.findOneAndUpdate({steem: params.sc.name}, {$inc: {votes: 1}}).exec()
  else new db.Mod({steem: params.sc.name, votes: 0}).save()
  return {'jsonrpc': '2.0', 'result': {}, 'id': id}
}

function createPost (params, id) {
  let author = params.author
  let title = params.title
  let permlink = links(title)
  let image = params.image
  let tags = params.tags.split(/(,\s)+/).map(function (item) {
    if (item !== '') return item.trim()
  })
  let primaryTag = 'memeitlol'
  let otherTags = tags.slice(0, 4)
  let done = false
  delegators.getWeights('memeit.lol', function (data) {
    if (!done) {
      let ben = []
      for (let key in data) {
        ben.push({'account': key, 'weight': data[key]})
      }
      steem.broadcast([['comment', {'parent_author': '', 'parent_permlink': primaryTag, 'author': author, 'permlink': permlink, 'title': title, 'body': `<img src="${image}" />`, 'json_metadata': JSON.stringify({app: 'memeit.lol/0.0.1', tags: [primaryTag, ...otherTags], image: [image]})}], ['comment_options', {'author': author, 'permlink': permlink, 'max_accepted_payout': '1000000.000 SBD', 'percent_steem_dollars': 10000, 'allow_votes': true, 'allow_curation_rewards': true, 'extensions': [[0, {'beneficiaries': ben}]]}]], function (err, response) {
        if (err) {
          console.log(err)
          return {'jsonrpc': '2.0', 'error': {'code': -32001, 'message': 'Post Did Not Go Through'}, 'id': id}
        } else {
          new db.Post({
            title,
            author,
            permlink,
            img: image
          }).save()
          return {'jsonrpc': '2.0', 'result': {returnURL: `/@${author}/${permlink}`}, 'id': id}
        }
      })
      done = true
    }
  })
}

function createToken (req, params, id) {
  let token = jwt.encode({
    iss: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    exp: moment().add(7, 'days').valueOf(),
    data: params
  }, config.jwt)
  return {'jsonrpc': '2.0', 'result': {token}, 'id': id}
}

async function rpcMiddleWare (req, res, next) {
  let jsonrpc = req.body.jsonrpc
  let method = req.body.method
  let params = req.body.params
  let id = req.body.id
  if (jsonrpc !== undefined && method !== undefined && params !== undefined && id !== undefined) {
    if (params.token) {
      var decoded = jwt.decode(params.token, config.jwt)
      var iss = req.headers['x-forwarded-for'] || req.connection.remoteAddress
      if (decoded.exp <= Date.now() && decoded.iss !== iss) {
        res.json({'jsonrpc': '2.0', 'error': {'code': -32003, 'message': 'Token Invalid'}, 'id': id})
      } else {
        steem.setAccessToken([decoded.data.token])
        params.sc = decoded.data.sc
        switch (method) {
          case 'uploadImage':
            res.json(await upload(params, id))
            break
          case 'requestModFeed':
            res.json(await getModFeed(params, id))
            break
          case 'createPost':
            res.json(await createPost(params, id))
            break
          case 'createModVote':
            res.json(await modVote(params, id))
            break
          case 'votePost':
            res.json(await votePost(params, id))
            break
          case 'createComment':
            res.json(await comment(params, id))
            break
          case 'requestMemesList':
            res.json(await memeList(params, id))
            break
          case 'requestFeed':
            res.json(await getFeed(params, id))
            break
          case 'requestUser':
            res.json(await getUser(params, id))
            break
          case 'requestDelegators':
            res.json(await getDelegators(params, id))
            break
          case 'requestPost':
            res.json(await getPost(params, id))
            break
        }
      }
    } else {
      switch (method) {
        case 'createToken':
          res.json(await createToken(req, params, id))
          break
        case 'requestMemesList':
          res.json(await memeList(params, id))
          break
        case 'requestFeed':
          res.json(await getFeed(params, id))
          break
        case 'requestUser':
          res.json(await getUser(params, id))
          break
        case 'requestDelegators':
          res.json(await getDelegators(params, id))
          break
        case 'requestPost':
          res.json(await getPost(params, id))
          break
      }
    }
  } else {
    res.json({'jsonrpc': '2.0', 'error': {'code': -32601, 'message': 'Method Not Found'}, 'id': id})
  }
}

module.exports = {
  rpcMiddleWare
}
