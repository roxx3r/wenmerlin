// imports
const { CryptoStatsSDK } = require('@cryptostats/sdk')
const ethers = require('ethers')
const api = require('./api')
const db = require('./db')

// consatnts
const IPFS_CID_ABRACADABRA_ADAPTER = 'QmV3vkgMJ12FXjCHjHABrUQ6kRpUzZ8WwGmzEbCGv7VxgY'
const GELATO_CONTRACT = '0x3caca7b48d0573d793d3b0279b5f0029180e83b6'
const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY

// services
const cryptostats = new CryptoStatsSDK()
const ethersProvider = new ethers.providers.EtherscanProvider(null, ETHERSCAN_KEY)

/**
* Lambda entry point
* Generate and insert dynamo records for
* past buyback amounts and current fees
**/
module.exports.handler = async () => {
  // generate fee records for previous buybacks
  const txArr = await api.getTxList(GELATO_CONTRACT)
  const distributionTxs = txArr.filter(filterDistributionTxs)
  const distributionTxLastest10 = distributionTxs.slice(0, 10)
  const distribtionReceiptsPromises = distributionTxLastest10.map(getTxReceipt)
  const distribtionReceipts = await Promise.all(distribtionReceiptsPromises)
  const distributionRecords = distribtionReceipts
    .map(generateFeeRecord)
    .filter(({ fees }) => fees > 0)
    .sort((a, b) => Number(a.ts) - Number(b.ts))

  // get current fees pending
  const { ts: lastBuyTs } = distributionRecords.slice(-1)[0]
  const currentFees = await getCurrentFees(lastBuyTs)
  distributionRecords.push({ ts: 9999999999, fees: Math.round(currentFees) })

  // store fees
  await db.batchWrite(distributionRecords)
}

/**
* Get transaction receipt which includes event logs
*
* @param {Object} tx - etherscan transaction record
* @return {Object} ethers transaction receipt
**/
async function getTxReceipt(tx) {
  const receipt = await ethersProvider.getTransactionReceipt(tx.hash)
  receipt.ts = tx.timeStamp
  return receipt
}

/**
* Filter transaction as distribution based on
* addresses included in input
*
* @param {Object} tx - etherscan transaction record
* @return {Boolean} is transaction a distribution
**/
function filterDistributionTxs(tx) {
  const usesTransferService = tx.input.includes('b3f55')
  const usesBuybackWallet = tx.input.includes('902180')
  return usesTransferService && usesBuybackWallet
}

/**
* Create a dynamo record for fees from receipt
*
* @param {Object} receipt - ethers transaction receipts
* @return {Object} dynamo record for fees
**/
function generateFeeRecord({ ts, logs }) {
  const { data: log0 } = logs[0]
  const { data: log1 } = logs[1]
  const sSpelldistribtion = ethers.BigNumber.from(log0)
  const mSpellDistribution = ethers.BigNumber.from(log1)
  const totalDistribution = sSpelldistribtion.add(mSpellDistribution)
  const fees = Math.round(parseInt(totalDistribution) / 1e18)
  return { ts, fees }
}

/**
* Get accrued fees since last distribution
*
* @param {String} ts - last distribution timestamp
* @return {Number} accrued fees since last distribution
**/
async function getCurrentFees(ts) {
  const feesList = cryptostats.getList('fees')
  try {
    await feesList.fetchAdapterFromIPFS(IPFS_CID_ABRACADABRA_ADAPTER)
  } catch (e) {
    console.error('fetchAdapterFromIPFS', e)
  }
  const startDate = new Date(1000 * ts)
  const endDate = new Date()
  endDate.setMinutes(endDate.getMinutes() - 100)
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
  const buybackFees = totalFees * 0.75

  return buybackFees
}
