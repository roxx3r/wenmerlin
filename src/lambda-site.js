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
  let currentFees = parseInt(recentRecord.amount.N)
  currentFees = currentFees < 0 ? 0 : currentFees
  const currentUsd = format.formatUsd(currentFees)
  output = output.replace(/{{currentFees}}/g, currentUsd)

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

  const collectionArr = distributions.map(record => {
    const tx = record.tx.S
    const date = record.sk.N
    const mspell = record.mspell.N
    const sspell = record.sspell.N

    return { tx, date, type: 'collection', mspell, sspell}
  })

  const sSpellDistribution = buybacks.map(record => {
    const tx = record.tx.S
    const date = record.sk.N
    const sspell = record.amount.N

    return { tx, date, type: 'buyback', sspell}
  })

  const allRecords = [...collectionArr, ...sSpellDistribution]
    .sort((a, b) => a.date - b.date)
    .splice(-8)

  allRecords.forEach(record => {
    const tx = record.tx
    const type = record.type
    const date = format.formatDate(record.date)
    const mspell = record.mspell
      ? format.formatUsd(record.mspell)
      : ''
    const sspell = record.sspell
      ? format.formatUsd(record.sspell)
      : ''

    tableRows += `<tr class="${type}">` +
      `<td><a href="https://etherscan.io/tx/${tx}" target="_blank">${date}</a></td>` +
      `<td>${type}</td>` +
      `<td>${mspell}</td><td>${sspell}</td>` +
      `</tr>`
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
