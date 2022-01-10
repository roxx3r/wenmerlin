// imports
const fetch = require('node-fetch')
const fs = require('fs')
const format = require('./format')
const api = require('./api')

// constants
const EXCHANGE_ADDRESS = '0x27239549dd40e1d60f5b80b0c4196923745b1fd2'

module.exports.handler = async (event) => {
  // respond to request
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: await generateHtml()
  }
}

async function generateHtml () {
  let html = fs.readFileSync('./src/index.html', 'utf8')

  // interpolate past buybacks
  const { result: mimTxs } = await api.getTokenTxs()
  const buybacks = mimTxs.filter(tx => tx.to === EXCHANGE_ADDRESS)
  const buybackSlice = buybacks.slice(-5)
  buybackSlice.forEach(({ timeStamp, value }) => {
    const barDate = format.formatDate(timeStamp)
    const barPercent = format.formatPercent(value)
    const barTitle = format.formatNumber(value)
    html = html.replace('{{barPercent}}', barPercent)
    html = html.replace('{{barDate}}', barDate)
    html = html.replace('{{barTitle}}', barTitle)
  })

  // interpolate next buyback estimate
  const { timeStamp } = buybacks.slice(-1)[0]
  const lastBuybackDate = new Date(1000 * timeStamp)
  const fees = await api.getFees(lastBuybackDate)
  const formattedFees = format.formatUsd(fees)
  html = html.replace(/{{nextBuyback}}/g, formattedFees)

  // get rid of missing tags
  html = html.replace(/{{barPercent}}/g, '0%')
  html = html.replace(/{{barDate}}/g, '')
  html = html.replace(/{{barTitle}}/g, '')

  // debug
  html = html.replace(/{{cacheTime}}/g, Date.now())

  return html
}
