// consatnts
const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY
const MERLIN_ADDRESS = '0xb2c3a9c577068479b1e5119f6b7da98d25ba48f4'
const MIM_ADDRESS = '0x99d8a9c45b2eca8864373a26d1459e3dff1e17f3'

module.exports.getTokenTxs = async () => {
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

module.exports.getTokenSupply = async (blockNo) => {
  const response = await fetch(
    'https://api.etherscan.io/api' +
      '?module=account' +
      '&action=tokenbalance' +
      `&address=${MERLIN_ADDRESS}` +
      `&contractaddress=${MIM_ADDRESS}` +
      '&tag=latest' +
      `&blockno=${blockNo}` +
      `&apikey=${ETHERSCAN_KEY}`
  )

  return response.json()
}
