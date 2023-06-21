// import
const fetch = require('node-fetch')

// consatnts
const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY

module.exports.getTxList = async (address) => {
  const response = await fetch(`https://api.etherscan.io/api` +
    '?module=account' +
    '&action=txlist' +
    `&address=${address}` +
    '&startblock=0' +
    '&endblock=99999999' +
    '&sort=desc' +
    `&apikey=${ETHERSCAN_KEY}`)
  const json = await response.json()

  return json.result
}

module.exports.getTxReceipt = async (txHash) => {
  const response = await fetch(`https://api.etherscan.io/api` +
    '?module=proxy' +
    '&action=eth_getTransactionReceipt' +
    `&txhash=${txHash}` +
    `&apikey=${ETHERSCAN_KEY}`)
  const json = await response.json()

  return json.result
}

module.exports.getTokenTx = async (address, tokenAddress) => {
  const resp = await fetch(`https://api.etherscan.io/api` +
    `?module=account` +
    `&action=tokentx` +
    `&address=${address}` +
    `&contractaddress=${tokenAddress}` +
    `&startblock=0` +
    `&endblock=999999999` +
    `&sort=desc` +
    `&apikey=${ETHERSCAN_KEY}`)
  const json = await resp.json()

  return json.result
}
