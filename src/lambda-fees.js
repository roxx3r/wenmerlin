// imports
const { CryptoStatsSDK } = require('@cryptostats/sdk')
const api = require('./api')
const db = require('./db')

// services
const cryptostats = new CryptoStatsSDK()

// consatnts
const IPFS_CID_ABRACADABRA_ADAPTER = 'QmepmLhtmeFhZcEW2HhCAUg2QwRWbAs9rS3icbXB9JFbPU'
const MERLIN_ADDRESS = '0xb2c3a9c577068479b1e5119f6b7da98d25ba48f4'

module.exports.handler = async () => {
  // fetch adapter
  const feesList = cryptostats.getList('fees')
  try {
    await feesList.fetchAdapterFromIPFS(IPFS_CID_ABRACADABRA_ADAPTER)
  } catch (e) {
    console.error('fetchAdapterFromIPFS', e)
  }


  // get last buybacks
  const { result } = await api.getTokenTxs()
  const buybacks = result.filter(tx => {
    const mimTx = tx.tokenSymbol === 'MIM'
    const fromMerlin = tx.from === MERLIN_ADDRESS
    const teamTx = (tx.value / 1e18) < 1_000_000
    return mimTx && fromMerlin && !teamTx
  })
  const lastFiveBuys = buybacks.slice(-5)
  const feeRecords = lastFiveBuys.map(({ timeStamp: ts, value }) =>
    ({ ts: ts, fees: Math.round(value / 1e18) }))

  // get mim supply at last buyback time
  const { blockNumber, timeStamp } = buybacks.slice(-1)[0]
  const { result: mimSupply } = await api.getTokenSupply(blockNumber)
  const mimSupplyE18 = Math.round(mimSupply / 1e18)

  // get fees since buyback
  const startDate = new Date(1000 * timeStamp - 1000)
  const endDate = new Date()
  endDate.setMinutes(endDate.getMinutes() - 10)
  let feeArr

  try {
    feeArr = await feesList.executeQuery('dateRangeProtocolFees', startDate, endDate)
  } catch (e) {
    console.error('dateRangeProtocolFees', e)
    try {
      feeArr = await feesList.executeQuery('dateRangeTotalFees', startDate, endDate)
    } catch (e) {
      console.error('dateRangeTotalFees', e)
      return
    }
  }

  const totalFees = feeArr.reduce((prev, { result }) => prev + result, 0)

  // add latest fees
  const feesAndSupply = (totalFees + mimSupplyE18) * 0.75
  feeRecords.push({ ts: 9999999999, fees: Math.round(feesAndSupply) })

  // store buybacks
  await db.batchWrite(feeRecords)
}
