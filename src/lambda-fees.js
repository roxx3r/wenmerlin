// imports
const { CryptoStatsSDK } = require('@cryptostats/sdk')
const ethers = require('ethers')
const api = require('./api')
const db = require('./db')

// consatnts
const IPFS_CID_ABRACADABRA_ADAPTER = 'QmV3vkgMJ12FXjCHjHABrUQ6kRpUzZ8WwGmzEbCGv7VxgY'
const GELATO_CONTRACT = '0x9cC903e42d3B14981C2109905556207C6527D482'
const TRIAGE_WALLET = '0x9cab9fdb70f4b024b5916d428fc2b83186359439'
const MIM_TOKEN = '0x99d8a9c45b2eca8864373a26d1459e3dff1e17f3'
const SPELL_TOKEN = '0x090185f2135308bad17527004364ebcc2d37e5f6'
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
  await Promise.all([
    handleDistributionRecords(),
    handleBuybackRecords(),
    handleCurrentFeeRecord()
  ])
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
  const gelatoTxArr = await api.getTokenTx(GELATO_CONTRACT, MIM_TOKEN)
  const recordPromises = gelatoTxArr
    .filter(filterDistributionTxs)
    .slice(0, 25)
    .map(generateDistributionRecord)
  const distributionRecordsAll = await Promise.all(recordPromises)
  const distributionRecords = distributionRecordsAll
    .filter(e => !isNaN(e.sspell + e.mspell))
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
  const buybackRecordPromises = ratioTxArr
    .slice(-5)
    .map(generateBuybackRecord)

  let buybackRecords = await Promise.all(buybackRecordPromises)
  buybackRecords = buybackRecords.filter(r => r !== undefined)
  await db.batchWriteBuyback(buybackRecords)

  return buybackRecords
}

/**
* Handle generating and storing of current accrueed fees
*
* @param {Number} ts - starting timestamp
**/
async function handleCurrentFeeRecord() {
  const distributions = await db.getDistributions()
  const { sk: { N: ts }} = distributions[0]
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
  try {
    // get mim to spell trade log
    const ratioReceipt = await ethersProvider.getTransactionReceipt(tx)

    // decode log
    const [sellAmount] = ethers.utils.defaultAbiCoder.decode(
      ['uint256'],
      ratioReceipt.logs[1].data
    )
    const amount = Math.round(Number(sellAmount) / 1e18)

    // return record object
    return {
      pk: 'spell-buyback',
      sk: timestamp,
      amount,
      tx
    }
  } catch {}
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
  } catch {
    try {
      feeArr = await feesList.executeQuery('dateRangeTotalFees', startDate, endDate)
    } catch {}
  }

  const totalFees = feeArr.reduce((prev, { result }) => prev + result, 0)
  const stakerRevenue = 0.5
  const amount = Math.round(totalFees * stakerRevenue)

  return {
    pk: 'fees',
    sk: '9999999999',
    amount
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
  const toDistributionWallet = tx.to === TRIAGE_WALLET
  const isError = tx.isError === '1'
  return toDistributionWallet && !isError
}
