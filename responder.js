// imports
const fs = require('fs')
const fetch = require('node-fetch')

// constants
const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY
const MERLIN_ADDRESS = '0xb2c3a9c577068479b1e5119f6b7da98d25ba48f4'
const EXCHANGE_ADDRESS = '0x27239549dd40e1d60f5b80b0c4196923745b1fd2'
const MIM_ADDRESS = '0x99d8a9c45b2eca8864373a26d1459e3dff1e17f3'

module.exports.handler = async event => {
  // request data
  const [
    { result: mimTxs },
    { result: mimBalance }
  ] = await Promise.all([
    getTokenTxs(),
    getTokenSupply()
  ])

  // respond to request
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: generateHtml(mimBalance, mimTxs)
  }
}

function generateHtml (mimBalance, mimTxs) {
  // interpolate balance
  const formattedMimBalance = formatUsd(mimBalance)
  let html = fs.readFileSync('./index.html', 'utf8')
  html = html.replace(/{{nextBuyback}}/g, formattedMimBalance)

  // interpolate buybacks
  const buybacks = mimTxs.filter(tx => tx.to === EXCHANGE_ADDRESS)
  const buybackSlice = buybacks.slice(-5)
  buybackSlice.forEach(({ timeStamp, value }) => {
    const barDate = formatDate(timeStamp)
    const barPercent = formatPercent(value)
    const barTitle = formatNumber(value)
    html = html.replace('{{barPercent}}', barPercent)
    html = html.replace('{{barDate}}', barDate)
    html = html.replace('{{barTitle}}', barTitle)
  })

  // get rid of missing tags
  html = html.replace(/{{barPercent}}/g, '0%')
  html = html.replace(/{{barDate}}/g, '')
  html = html.replace(/{{barTitle}}/g, '')

  // debug
  html = html.replace(/{{cacheTime}}/g, Date.now())

  return html
}

async function getTokenTxs () {
  const response = await fetch(
    'https://api.etherscan.io/api' +
      '?module=account' +
      '&action=tokentx' +
      `&address=${MERLIN_ADDRESS}` +
      `&contractaddress=${MIM_ADDRESS}` +
      '&startblock=0' +
      '&endblock=999999999' +
      '&sort=asc' +
      `&apikey=${ETHERSCAN_KEY}`
  )

  return response.json()
}

async function getTokenSupply () {
  const response = await fetch(
    'https://api.etherscan.io/api' +
      '?module=account' +
      '&action=tokenbalance' +
      `&address=${MERLIN_ADDRESS}` +
      `&contractaddress=${MIM_ADDRESS}` +
      '&tag=latest' +
      `&apikey=${ETHERSCAN_KEY}`
  )

  return response.json()
}

function formatUsd (number) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  })
  const amount = number / 1000000000000000000

  return formatter.format(amount).split('.')[0]
}

function formatDate (number) {
  const date = new Date(number * 1000)
  const month = date.getMonth() + 1
  const monthLabel = month < 10 ? '0' + month : month
  const day = date.getDate()
  const dayLabel = day < 10 ? '0' + day : day

  return monthLabel + '.' + dayLabel
}

function formatPercent (number) {
  const amount = number / 1000000000000000000

  return 100 * (amount / 10_000_000) + '%'
}

function formatNumber (number) {
  const amount = number / 1000000000000000000

  // Nine Zeroes for Billions
  return Math.abs(Number(amount)) >= 1.0e9
    ? (Math.abs(Number(amount)) / 1.0e9).toFixed(2) + 'B'
    : // Six Zeroes for Millions
    Math.abs(Number(amount)) >= 1.0e6
    ? (Math.abs(Number(amount)) / 1.0e6).toFixed(2) + 'M'
    : // Three Zeroes for Thousands
    Math.abs(Number(amount)) >= 1.0e3
    ? (Math.abs(Number(amount)) / 1.0e3).toFixed(2) + 'K'
    : Math.abs(Number(amount))
}
