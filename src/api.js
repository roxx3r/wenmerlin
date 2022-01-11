// imports
const { CryptoStatsSDK } = require('@cryptostats/sdk')

// services
const cryptostats = new CryptoStatsSDK();

// consatnts
const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY
const MERLIN_ADDRESS = '0xb2c3a9c577068479b1e5119f6b7da98d25ba48f4'
const MIM_ADDRESS = '0x99d8a9c45b2eca8864373a26d1459e3dff1e17f3'
const NETWORKS = {
    ethereum: {
        subgraph: 'ap0calyp/abracadabra-mainnet-fees',
        blockchain: 'Ethereum',
        protocolLaunch: '2021-05-27',
    },
    fantom: {
        subgraph: 'ap0calyp/abracadabra-fantom-fees',
        blockchain: 'Fantom',
        protocolLaunch: '2021-05-27',
    },
    avalanche: {
        subgraph: 'ap0calyp/abracadabra-avalanche-fees',
        blockchain: 'Avalanche',
        protocolLaunch: '2021-09-06',
    },
    bsc: {
        subgraph: 'ap0calyp/abracadabra-binancesmartchain-fees',
        blockchain: 'Binance',
        protocolLaunch: '2021-11-17',
    },
    'arbitrum-one': {
        subgraph: 'ap0calyp/abracadabra-arbitrum-fees',
        blockchain: 'Arbitrum One',
        protocolLaunch: '2021-09-15',
    }
}
const FEE_QUERY = `query fees($startBlock: Int!) {
  startValue: cauldronFees(block: { number: $startBlock }) {
    accrueInfoFeesEarned
    accrueInfoFeesWithdrawn
  }
  endValue: cauldronFees(limit: 1000) {
    accrueInfoFeesEarned
    accrueInfoFeesWithdrawn
  }
}`

module.exports.getFees = async (startDate) => {
  // query all networks
  const promiseArr = []

  for (const network in NETWORKS) {
    const { subgraph } = NETWORKS[network]
    const blockNumber = await cryptostats.chainData.getBlockNumber(startDate, network)
    const params = { variables: { startBlock: blockNumber } }
    const promise = cryptostats.graph.query(subgraph, FEE_QUERY, params)
    promiseArr.push(promise)
  }

  // aggregate fees
  let totalFees = 0;
  const networkQueries = await Promise.all(promiseArr)

  networkQueries.forEach(({ startValue, endValue }) => {
    const startFees = startValue.reduce((prev, curr) =>
        prev + Number(curr.accrueInfoFeesEarned) + Number(curr.accrueInfoFeesWithdrawn), 0)
    const endFees = endValue.reduce((prev, curr) =>
        prev + Number(curr.accrueInfoFeesEarned) + Number(curr.accrueInfoFeesWithdrawn), 0)
    const fees = endFees - startFees

    totalFees += fees;
  })

  return totalFees
}

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

module.exports.getTokenSupply = async () => {
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
