// imports
const { CryptoStatsSDK } = require('@cryptostats/sdk')
const ethers = require('ethers')
const api = require('./api')
const db = require('./db')

// consatnts
const IPFS_CID_ABRACADABRA_ADAPTER = 'QmV3vkgMJ12FXjCHjHABrUQ6kRpUzZ8WwGmzEbCGv7VxgY'
const GELATO_CONTRACT = '0x3caca7b48d0573d793d3b0279b5f0029180e83b6'
const MIM_TOKEN = '0x99d8a9c45b2eca8864373a26d1459e3dff1e17f3'
const SPELL_TOKEN = '0x090185f2135308bad17527004364ebcc2d37e5f6'
const FEE_WIDTHDRAW_CONTRACT = '0xb2c3a9c577068479b1e5119f6b7da98d25ba48f4'
const TRIAGE_CONTRACT = '0x90218033ce26b3d41c45795e903c7989817f0dd7'
const MSPELL_CONTRACT = '0xbD2fBaf2dc95bD78Cf1cD3c5235B33D1165E6797'
const SPELL_BUYBACK_WALLET = '0xfddfE525054efaAD204600d00CA86ADb1Cc2ea8a'
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
  const [ distributionRecord, ] = await Promise.all([
    handleDistributionRecords(),
    handleBuybackRecords(),
  ])

  const lastDistributionTs = parseInt(distributionRecord[0].sk)
  await handleCurrentFeeRecord(lastDistributionTs)
}

/**
* Scrape the gelato network contract for
* fee ditribution transactions which contain
* the transfer method hex and triage contract hex
*
* Handle generating and storing of records
* for fees distributed to mspell and sspell
**/
async function handleDistributionRecords() {
  const gelatoTxArr = await api.getTxList(GELATO_CONTRACT)
  const recordPromises = gelatoTxArr
    .filter(filterDistributionTxs)
    .slice(0, 10)
    .map(generateDistributionRecord)
  const distributionRecordsAll = await Promise.all(recordPromises)
  const distributionRecords = distributionRecordsAll
    .filter(e => e.sspell > 0 || e.mspell > 0)

  await db.batchWriteDistribution(distributionRecords)

  return distributionRecords
}

/**
* Handle generating and storing buyback records
* of spell distributed to stakers
**/
async function handleBuybackRecords() {
  const ratioTxArr = await db.getRatioUpdates()
  const buybackRecordPromises = ratioTxArr.slice(-5).map(generateBuybackRecord)
  const buybackRecords = await Promise.all(buybackRecordPromises)

  await db.batchWriteBuyback(buybackRecords)

  return buybackRecords
}

/**
* Handle generating and storing of current accrueed fees
*
* @param {Number} ts - starting timestamp
**/
async function handleCurrentFeeRecord(ts) {
  const accruedFeeRecord = await generateCurrentFeeRecord(ts)
  const accruedFeeRecords = [accruedFeeRecord]

  await db.batchWriteFees(accruedFeeRecords)

  return accruedFeeRecords
}

/**
* Generate distribution record from transaction
* by parsing logs from transaction receipts
* The first two logs in the distribution receipt
* correspond to sSpell and mSpell fee distributions
*
* @param {Object} txReceipt - transaction receipt for ratio update
* @return {Object} - distribution record object
**/
async function generateDistributionRecord({ hash, timeStamp }) {
  // get mim fee log amount
  const receipt = await ethersProvider.getTransactionReceipt(hash)
  const mSpellFeesInt = parseInt(receipt.logs[2].data)
  const sSpellFeesInt = parseInt(receipt.logs[3].data)
  const mSpellAmount = Math.round(mSpellFeesInt / 1e18)
  const sSpellAmount = Math.round(sSpellFeesInt / 1e18)

  // return record object
  return {
    pk: 'distribution',
    sk: timeStamp,
    mspell: mSpellAmount,
    sspell: sSpellAmount,
    tx: hash
  }
}

/**
* Request transaction receipts from ratio update transactions,
* search receipt for log that trades MIM for Spell,
* decode the input and pull out MIM sell amount
*
* Generate buyback record from ratio update entity
*
* @param {Object} ratioObj - ratio entity from subgraph
* @return {Object} - buyback record object
**/
async function generateBuybackRecord({ tx, timestamp }) {
  // get mim to spell trade log
  const ratioReceipt = await ethersProvider.getTransactionReceipt(tx)
  // WARNING - this will fail if merlin doesn't trade through cow
  const tradeLog = getTradeLog(ratioReceipt)

  // decode log
  const [, , sellAmount] = ethers.utils.defaultAbiCoder.decode(
    ['address', 'address', 'uint256', 'uint256', 'uint256', 'bytes'],
    tradeLog.data
  )

  // calculate amount
  const mimSoldAmountInt = parseInt(sellAmount._hex)
  const amount = Math.round(mimSoldAmountInt / 1e18)

  // return record object
  return {
    pk: 'spell-buyback',
    sk: timestamp,
    amount,
    tx
  }
}

/**
* Get fees accrued since target timestamp using
* fees subgraph across supported networks
*
* Generate curent fee record from subgraph
*
* @param {Number} ts - beginning timestamp for fee accumulation
* @return {Number} - amount of current accrued fees
**/
async function generateCurrentFeeRecord(timestamp) {
  const feesList = cryptostats.getList('fees')

  try {
    await feesList.fetchAdapterFromIPFS(IPFS_CID_ABRACADABRA_ADAPTER)
  } catch (e) {}

  const startDate = new Date(1000 * timestamp)
  const endDate = new Date()
  endDate.setMinutes(endDate.getMinutes() - 100)
  let feeArr

  try {
    feeArr = await feesList.executeQuery('dateRangeProtocolFees', startDate, endDate)
  } catch (e) {
    try {
      feeArr = await feesList.executeQuery('dateRangeTotalFees', startDate, endDate)
    } catch (e) { return }
  }

  const totalFees = feeArr.reduce((prev, { result }) => prev + result, 0)
  const stakerRevenue = 0.75
  const amount = Math.round(totalFees * stakerRevenue)

  return {
    pk: 'fees',
    sk: '9999999999',
    amount
  }
}

/**
* Get log for mim to spell trade
*
* @param {Object} - transaction receipt
* @return {Object} - trade log
**/
function getTradeLog(receipt) {
  for (let i = 0; i < receipt.logs.length; i++) {
    // decode log
    const [ sellToken, buyToken, sellAmount ] = ethers.utils.defaultAbiCoder.decode(
      [ 'address', 'address', 'uint256', 'uint256', 'uint256', 'bytes' ],
      receipt.logs[i].data
    )

    // verify log is mim for spell trade
    const isMimTrade = sellToken.toLowerCase() === MIM_TOKEN
    const isSpellTrade = buyToken.toLowerCase() === SPELL_TOKEN
    const isMimForSpellTrade = isMimTrade && isSpellTrade
    if (!isMimForSpellTrade) continue

    // return trade log
    return receipt.logs[i]
  }
}

/**
* Filter transaction as distribution based on
* addresses included in input
*
* @param {Object} tx - etherscan transaction record
* @return {Boolean} is transaction a distribution
**/
function filterDistributionTxs(tx) {
  const usesTransferMethod = tx.input.includes('b3f55')
  const usesTriageWallet = tx.input.includes('902180')
  return usesTransferMethod && usesTriageWallet
}
