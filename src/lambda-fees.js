// imports
const { CryptoStatsSDK } = require('@cryptostats/sdk')
const api = require('./api')
const db = require('./db')

// services
const cryptostats = new CryptoStatsSDK()

// consatnts
const IPFS_CID_ABRACADABRA_ADAPTER = 'QmV3vkgMJ12FXjCHjHABrUQ6kRpUzZ8WwGmzEbCGv7VxgY'
const EXCHANGE_ADDRESS = '0x27239549dd40e1d60f5b80b0c4196923745b1fd2'

module.exports.handler = async () => {
  // fetch adapter
  const feesList = cryptostats.getList('fees')
  await feesList.fetchAdapterFromIPFS(IPFS_CID_ABRACADABRA_ADAPTER)

  // get last buybacks
  const { result } = await api.getTokenTxs()
  const buybacks = result.filter(tx => tx.to === EXCHANGE_ADDRESS)
  const lastFiveBuys = buybacks.slice(-5)
  const feeRecords = lastFiveBuys.map(({ timeStamp: ts, value }) =>
    ({ ts: ts, fees: Math.round(value / 1000000000000000000) }))

  // get current fees
  const { timeStamp } = buybacks.slice(-1)[0]
  const startDate = new Date(1000 * timeStamp)
  const endDate = new Date()
  endDate.setMinutes(endDate.getMinutes() - 10)
  const feeArr = await feesList.executeQuery('dateRangeTotalFees', startDate, endDate)
  const totalFees = feeArr.reduce((prev, { result }) => prev + result, 0)
  feeRecords.push({ ts: 9999999999, fees: Math.round(totalFees) })

  // store buybacks
  await db.batchWrite(feeRecords)
}
