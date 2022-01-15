// imports
const fetch = require('node-fetch')
const format = require('./format')
const db = require('./db')
const fs = require('fs')

module.exports.handler = async (event) => {
  // build html from buybacks
  const buybacks = await db.query()
  const body = await generateHtml(buybacks)

  // respond to request
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body
  }
}

async function generateHtml (buybacks) {
  let html = fs.readFileSync('./src/index.html', 'utf8')

  // interpalate next buyback estimate
  const buybackRev = buybacks.reverse()
  const { amount } = buybackRev.pop()
  const formattedFees = format.formatUsd(amount.N)
  html = html.replace(/{{nextBuyback}}/g, formattedFees)

  // interpolate past buybacks
  buybackRev.forEach(({ sk, amount }) => {
    const barDate = format.formatDate(sk.N)
    const barPercent = format.formatPercent(amount.N)
    const barTitle = format.formatNumber(amount.N)
    html = html.replace('{{barPercent}}', barPercent)
    html = html.replace('{{barDate}}', barDate)
    html = html.replace('{{barTitle}}', barTitle)
  })

  // debug
  html = html.replace(/{{cacheTime}}/g, Date.now())

  return html
}
