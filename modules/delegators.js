const steem = require('steem')
let db = require('../db')
const marked = require('marked')

var delegationTransactions = []

async function loadDelegations (account, callback) {
  await getTransactions(account, -1, callback)
}

async function loadDelegationsAsync (account) {
  return new Promise(async function (resolve, reject) {
    await getTransactions(account, -1, function (delegating) {
      resolve(delegating)
    })
  })
}

async function getTransactions (account, start, callback) {
  var lastTrans = start

  await steem.api.getAccountHistory(account, start, (start < 0) ? 10000 : Math.min(start, 10000), async function (err, result) {
    if (err) {
      console.log(err)
      return
    }

    result.reverse()

    for (var i = 0; i < result.length; i++) {
      var trans = result[i]
      var op = trans[1].op

      if (op[0] === 'delegate_vesting_shares' && op[1].delegatee === account) { delegationTransactions.push({ id: trans[0], data: op[1] }) }
      lastTrans = trans[0]
    }

    if (lastTrans > 0 && lastTrans !== start) { getTransactions(account, lastTrans, callback) }

    await processDelegations(callback)
  })
}

function processDelegations (callback) {
  var delegations = []

  delegationTransactions.reverse()

  for (var i = 0; i < delegationTransactions.length; i++) {
    var trans = delegationTransactions[i]
    var delegation = delegations.find(d => d.delegator === trans.data.delegator)

    if (delegation) {
      delegation.vesting_shares = trans.data.vesting_shares
    } else {
      delegations.push({ delegator: trans.data.delegator, vesting_shares: trans.data.vesting_shares })
    }
  }

  delegationTransactions = []

  if (callback) { callback(delegations.filter(function (d) { return parseFloat(d.vesting_shares) > 99888 }).sort(function (a, b) { return parseFloat(b.vesting_shares.replace(' VESTS', '')) - parseFloat(a.vesting_shares.replace(' VESTS', '')) })) }
}

function add (object, name, value) {
  var added = false
  for (let ob in object) {
    if (ob === name) {
      object[ob] += parseInt(value.toFixed())
      added = true
    }
  }
  if (!added) {
    object[name] = parseInt(value.toFixed())
  }
  return object
}

async function getWeights (account, callback) {
  await loadDelegations(account, async function (del) {
    let mods = await db.Mod.find({}).sort({votes: -1}).limit(3)
    mods = mods.map(mod => mod.steem)
    var weights = {}
    mods.forEach(mod => {
      weights = add(weights, mod, 100)
    })
    del = del.filter(function (d) { return d.delegator !== 'spotlight' })
    weights = add(weights, 'lol.pay', 1000)
    var total = 0
    var past = 0
    del.forEach(function (de) {
      total += parseFloat(de.vesting_shares.replace(' VESTS', ''))
    })
    var chance = Math.random()
    var chance2 = Math.random()
    var chance3 = Math.random()
    del.forEach(function (de) {
      var per = parseFloat(de.vesting_shares.replace(' VESTS', '')) / total
      if (chance >= past && chance <= per + past) {
        weights = add(weights, de.delegator, 400)
      }
      if (chance2 >= past && chance2 <= per + past) {
        weights = add(weights, de.delegator, 400)
      }
      if (chance3 >= past && chance3 <= per + past) {
        weights = add(weights, de.delegator, 400)
      }
      past += per
    })
    callback(weights)
  })
}

function parsePayoutAmount (amount) {
  return parseFloat(String(amount).replace(/\s[A-Z]*$/, ''))
}

const calculatePayout = post => {
  const payoutDetails = {}
  const {
    active_votes,
    parent_author,
    cashout_time
  } = post

  const max_payout = parsePayoutAmount(post.max_accepted_payout)
  const pending_payout = parsePayoutAmount(post.pending_payout_value)
  const promoted = parsePayoutAmount(post.promoted)
  const total_author_payout = parsePayoutAmount(post.total_payout_value)
  const total_curator_payout = parsePayoutAmount(post.curator_payout_value)
  const is_comment = parent_author !== ''

  let payout = pending_payout + total_author_payout + total_curator_payout
  if (payout < 0.0) payout = 0.0
  if (payout > max_payout) payout = max_payout
  payoutDetails.payoutLimitHit = payout >= max_payout

  const cashout_active =
    pending_payout > 0 ||
    (cashout_time.indexOf('1969') !== 0 && !(is_comment && active_votes.length === 0))

  if (cashout_active) {
    payoutDetails.potentialPayout = pending_payout
  }

  if (promoted > 0) {
    payoutDetails.promotionCost = promoted
  }

  if (cashout_active) {
    payoutDetails.cashoutInTime = cashout_time
  }

  if (max_payout === 0) {
    payoutDetails.isPayoutDeclined = true
  } else if (max_payout < 1000000) {
    payoutDetails.maxAcceptedPayout = max_payout
  }

  if (total_author_payout > 0) {
    payoutDetails.pastPayouts = total_author_payout + total_curator_payout
    payoutDetails.authorPayouts = total_author_payout
    payoutDetails.curatorPayouts = total_curator_payout
  }

  return payoutDetails
}

function payoutCalculator (author, permlink) {
  return new Promise((resolve, reject) => {
    steem.api.getContent(author, permlink, function (err, result) {
      if (err) reject(err)
      if (result) {
        resolve(calculatePayout(result))
      }
    })
  })
}

let getAccountInfo = (username) => {
  let totalVestingShares, totalVestingFundSteem

  steem.api.getDynamicGlobalProperties((err, result) => {
    if (err) console.log(err)
    totalVestingShares = result.total_vesting_shares
    totalVestingFundSteem = result.total_vesting_fund_steem
  })

  return new Promise((resolve, reject) => {
    steem.api.getAccounts([username], (err, result) => {
      if (err) console.log(err)
      let user = result[0]
      let jsonData = user.json_metadata ? JSON.parse(user.json_metadata).profile : {}
      // steem power calc
      let vestingShares = user.vesting_shares
      let delegatedVestingShares = user.delegated_vesting_shares
      let receivedVestingShares = user.received_vesting_shares
      let steemPower = steem.formatter.vestToSteem(vestingShares, totalVestingShares, totalVestingFundSteem)
      let delegatedSteemPower = steem.formatter.vestToSteem((receivedVestingShares.split(' ')[0]) + ' VESTS', totalVestingShares, totalVestingFundSteem)
      let outgoingSteemPower = steem.formatter.vestToSteem((receivedVestingShares.split(' ')[0] - delegatedVestingShares.split(' ')[0]) + ' VESTS', totalVestingShares, totalVestingFundSteem) - delegatedSteemPower

      // vote power calc
      let lastVoteTime = (new Date() - new Date(user.last_vote_time + 'Z')) / 1000
      let votePower = user.voting_power += (10000 * lastVoteTime / 432000)
      votePower = Math.min(votePower / 100, 100).toFixed(2)
      let data = {
        name: user.name,
        image: jsonData.profile_image ? 'https://steemitimages.com/512x512/' + jsonData.profile_image : '',
        rep: steem.formatter.reputation(user.reputation),
        effectiveSp: parseInt(steemPower + delegatedSteemPower + outgoingSteemPower),
        sp: parseInt(steemPower).toLocaleString(),
        delegatedSpIn: parseInt(delegatedSteemPower).toLocaleString(),
        delegatedSpOut: parseInt(-outgoingSteemPower).toLocaleString(),
        s: parseInt(delegatedSteemPower + outgoingSteemPower),
        vp: votePower,
        steem: user.balance.substring(0, user.balance.length - 5),
        sbd: user.sbd_balance.substring(0, user.sbd_balance.length - 3),
        numOfPosts: user.post_count,
        followerCount: '',
        followingCount: '',
        usdValue: '',
        createdDate: new Date(user.created)
      }
      data.usdValue = steem.formatter.estimateAccountValue(user)
      steem.api.getFollowCount(user.name, function (err, result) {
        if (err) console.log(err)
        data.followerCount = result.follower_count
        data.followingCount = result.following_count
        resolve(data)
      })
    })
  })
}

async function getImg (username) {
  return new Promise((resolve, reject) => {
    steem.api.getAccounts([username], (err, re) => {
      if (err) console.log(err)
      let img = 'https://steemitimages.com/128x128/img/default-user.jpg'
      try {
        img = JSON.parse(re[0].json_metadata).profile.profile_image
      } catch (er) {
        console.log(er)
      }
      resolve(img)
    })
  })
}

async function getComments (username, permlink) {
  return new Promise((resolve, reject) => {
    steem.api.getContentReplies(username, permlink, async function (err, resp) {
      if (err) console.log(err)
      resp.map(r => {
        r.body = marked(r.body)
        return r
      })
      resolve(resp)
    })
  })
}

async function getPost (username, permlink) {
  return new Promise((resolve, reject) => {
    steem.api.getContent(username, permlink, function (err, resp) {
      if (err) console.log(err)
      var json = JSON.parse(resp.json_metadata)
      let i = {
        author: resp.author,
        category: resp.category,
        permlink: resp.permlink,
        title: resp.title,
        image: json.image[0],
        url: 'https://memeit.lol/@' + resp.author + '/' + resp.permlink,
        body: marked(resp.body),
        tags: json.tags.map(t => {
          if (t !== '') return `<span>${t}</span>`
        })
      }
      resolve(i)
    })
  })
}

module.exports = {
  loadDelegations: loadDelegations,
  loadDelegationsAsync: loadDelegationsAsync,
  getWeights: getWeights,
  payoutCalculator: payoutCalculator,
  getAccountInfo: getAccountInfo,
  getPost: getPost,
  getComments: getComments,
  getImg: getImg
}
