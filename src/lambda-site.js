// imports
const format = require('./format')
const api = require('./api')
const db = require('./db')
const fs = require('fs')

// constants
const STAKED_SPELL_ADDRESS = '0x26fa3fffb6efe8c1e69103acb4044c26b9a106a9'

/**
* Lambda entry point
* Generate html home page for wenmerl.in
* Interpolates distributions and wallet earnings
* when provided
*/
module.exports.handler = async (event) => {
  // store parameters
  const walletAddress = event.queryStringParameters
    ? event.queryStringParameters.wallet
    : null

  // request resources
  const [
    walletObj,
    distributions,
    buybacks,
    currentFees
  ] = await Promise.all([
    getWalletEarnings(walletAddress),
    db.getDistributions(),
    db.getBuybacks(),
    db.getCurrentFees()
  ])


  // interpolate template
  let html = fs.readFileSync('./src/index.html', 'utf8')
  html = interpolateCurrentFees(html, currentFees)
  html = await interpolateBuybackHtml(html, buybacks)
  html = interpolateEarningsHtml(html, walletObj)
  html = interpolateDistributions(html, distributions, buybacks)

  // respond to request
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html
  }
}

/**
* interpolate current fees for hero element
*
* @param {String} html - html template
* @param {Array} currentFeeRecords = spell buyback records
* @return {String} - current fee interpolated html string
**/
function interpolateCurrentFees(html, currentFeeRecords) {
  let output = html

  const recentRecord = currentFeeRecords[0]
  const currentFees = recentRecord.amount.N
  const currentUsd = format.formatUsd(currentFees)
  output = output.replace('{{currentFees}}', currentUsd)

  return output
}

/**
* interpolate past spell buybacks for chart
*
* @param {String} html - html template
* @param {Array} buybacks = spell buyback records
* @return {String} - buyback interpolated html string
**/
async function interpolateBuybackHtml (html, buybacks) {
  let output = html

  buybacks.reverse().forEach(({ sk, amount, tx }) => {
    const barDate = format.formatDate(sk.N)
    const barPercent = format.formatPercent(amount.N)
    const barTitle = format.formatNumber(amount.N)
    output = output.replace('{{barLink}}', tx.S)
    output = output.replace('{{barPercent}}', barPercent)
    output = output.replace('{{barDate}}', barDate)
    output = output.replace('{{barTitle}}', barTitle)
  })

  return output
}

/**
* Interpolate wallet spell earnings
*
* @param {String} html - html template
* @param {Object} walletObj = wallet earnings values
* @return {String} - earnings interpolated html string
**/
function interpolateEarningsHtml(html, walletObj) {
  let output = html

  // verify wallet object provided
  if (!walletObj) return output.replace('{{earnClass}}', 'empty')

  // verify no error was returned
  if (walletObj.error) return output.replace('{{earnClass}}', 'error')

  // process earnings interpolation
  const { walletEarnings, walletAddress, walletName } = walletObj
  output = output.replace('{{earnClass}}', 'results')
  output = output.replace('{{walletEarnings}}', walletEarnings)
  output = output.replace('{{walletAddress}}', walletAddress)
  output = output.replace('{{walletName}}', walletName)

  return output
}

/**
* Interpolate staking distributions
*
* @param {String} html - html template
* @param {Array} distributions = distribution records for sspell and mspell
* @return {String} - distributions interpolated html string
**/
function interpolateDistributions(html, distributions, buybacks) {
  let output = html
  let tableRows = ''
  let lastBuybackPlaced = false
  const lastBuyback = buybacks.pop()
  const lastBuybackTs = lastBuyback.sk.N

  distributions.reverse().forEach((record, index) => {
    const date = format.formatDate(record.sk.N)
    const mspell = format.formatUsd(record.mspell.N)
    const sspell = format.formatUsd(record.sspell.N)
    const tx = record.tx.S
    tableRows += `<tr>` +
      `<td><a href="https://etherscan.io/tx/${tx}" target="_blank">${date}</a></td>` +
      `<td>${mspell}</td><td>${sspell}</td>` +
      `</tr>`

    // if next date is after distribution add divider
    // if last record add divider
    // only place divider once
    const isNewerDistribution = distributions[index + 1]
      && distributions[index + 1].sk.N > lastBuybackTs
      && !lastBuybackPlaced
    const isLastRecord = index === distributions.length - 1
      && !lastBuybackPlaced

    if (isNewerDistribution || isLastRecord) {
      tableRows += `<tr><td colspan="3"><span class="buyback-divider"></span></td></tr>`
      lastBuybackPlaced = true
    }
  })

  output = output.replace('{{distributionRows}}', tableRows)

  return output
}

/**
* Create object of wallet earning properties for
* using to interpolate the html
*
* @param {String} walletAddress - wallet address for user
* @return {Object} - wallet earnings properties
**/
async function getWalletEarnings(walletAddress) {
  // verify wallet provided
  if (!walletAddress) return null

  // request resources
  const [ ratioUpdateArr, walletTxArr ] = await Promise.all([
    db.getRatioUpdates(),
    api.getTokenTx(walletAddress, STAKED_SPELL_ADDRESS)
  ])

  // verify transaction request successfull
  if (!Array.isArray(walletTxArr)) return { error: true }

  // calculate spell earned
  let walletEarnings = 0
  let lastRatio = 1

  while (ratioUpdateArr.length > 0) {
    const ratioUpdate = ratioUpdateArr.shift()
    const ratioTimestamp = parseInt(ratioUpdate.timestamp)
    const sSpellAtTimestamp = getTokensAtTimestamp(walletAddress, walletTxArr, ratioTimestamp)

    if (sSpellAtTimestamp > 0) {
      const ratioDiff = ratioUpdate.ratio - lastRatio
      const spellRatioIncrease = sSpellAtTimestamp * ratioDiff
      walletEarnings = walletEarnings + spellRatioIncrease
    }

    lastRatio = ratioUpdate.ratio
  }

  // generate properties
  const walletPrefix = walletAddress.substring(0, 5)
  const walletSuffix = walletAddress.substring(walletAddress.length - 3)
  const walletName = `${walletPrefix}...${walletSuffix}`
  walletEarnings = Math.round(walletEarnings).toLocaleString('en-US')

  // build and return wallet object
  return {
    walletEarnings,
    walletAddress,
    walletName
  }
}

/**
* Iterate through array of transactionsand total
* the amount of tokens until a target timestamp
*
* @param {String} address - address of target wallet
* @param {Array} txArr - array of transactions for wallet
* @param {Number} targetTs - target time stamp to end at
* @return {Number} balance of tokens summed
**/
function getTokensAtTimestamp (address, txArr, targetTs) {
  let balance = 0

  for (let i = 0; i < txArr.length; i++) {
    const { timeStamp, value, to } = txArr[i]

    // verify wallet tx time is not passed target
    if (timeStamp > targetTs) break

    // update spell banace
    const amount = value / 1e18
    const isAdded = to.toLowerCase() === address.toLowerCase()

    if (isAdded) balance += amount
    else balance -= amount
  }

  return balance
}
