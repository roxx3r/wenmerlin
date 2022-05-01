// imports
const fetch = require('node-fetch')
const AWS = require('aws-sdk')

// services
dynamodb = new AWS.DynamoDB()

module.exports.getRatioUpdates = async () => {
  const method = 'POST'
  const url = 'https://api.thegraph.com/subgraphs/name/roxx3r/abracadabra-staked-spell-ratio'
  const headers = { 'Content-type': 'application/json' }
  const body = JSON.stringify({
    query: `
      {
        ratioUpdates {
          timestamp
          ratio
          tx
        }
      }
    `,
    variables: null
  })
  const resp = await fetch(url, { method, headers, body })
  const json = await resp.json()

  return json.data.ratioUpdates
}

module.exports.batchWriteDistribution = async (recordArr) => {
  const params = {
    RequestItems: {
      merlin: recordArr.map(({ pk, sk, sspell, mspell, tx }) => ({
        PutRequest: {
          Item: {
            pk: { S: pk },
            sk: { N: String(sk) },
            sspell: { N: String(sspell) },
            mspell: { N: String(mspell) },
            tx: { S: tx }
          }
        }
      }))
    }
  }

  return dynamodb.batchWriteItem(params).promise()
}

module.exports.getDistributions = async () => {
  const params = {
    ExpressionAttributeValues: {
      ':pk': { S: 'distribution' }
    },
    KeyConditionExpression: 'pk = :pk',
    TableName: 'merlin',
    ScanIndexForward: false,
    Limit: 5
  }
  const { Items } = await dynamodb.query(params).promise()

  return Items
}

module.exports.batchWriteBuyback = async (recordArr) => {
  const params = {
    RequestItems: {
      merlin: recordArr.map(({ pk, sk, amount, tx }) => ({
        PutRequest: {
          Item: {
            pk: { S: pk },
            sk: { N: String(sk) },
            amount: { N: String(amount) },
            tx: { S: tx }
          }
        }
      }))
    }
  }

  return dynamodb.batchWriteItem(params).promise()
}

module.exports.getBuybacks = async () => {
  const params = {
    ExpressionAttributeValues: {
      ':pk': { S: 'spell-buyback' }
    },
    KeyConditionExpression: 'pk = :pk',
    TableName: 'merlin',
    ScanIndexForward: false,
    Limit: 5
  }
  const { Items } = await dynamodb.query(params).promise()

  return Items
}

module.exports.batchWriteFees = async (recordArr) => {
  const params = {
    RequestItems: {
      merlin: recordArr.map(({ pk, sk, amount }) => ({
        PutRequest: {
          Item: {
            pk: { S: pk },
            sk: { N: String(sk) },
            amount: { N: String(amount) }
          }
        }
      }))
    }
  }

  return dynamodb.batchWriteItem(params).promise()
}

module.exports.getCurrentFees = async () => {
  const params = {
    ExpressionAttributeValues: {
      ':pk': { S: 'fees' }
    },
    KeyConditionExpression: 'pk = :pk',
    TableName: 'merlin',
    ScanIndexForward: false,
    Limit: 1
  }
  const { Items } = await dynamodb.query(params).promise()

  return Items
}
