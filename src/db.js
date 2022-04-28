// imports
const fetch = require('node-fetch')
const AWS = require('aws-sdk')

// services
dynamodb = new AWS.DynamoDB()

module.exports.batchWrite = async (buybackArr) => {
  const params = {
    RequestItems: {
      merlin: buybackArr.map(({ ts, fees }) => ({
        PutRequest: {
          Item: {
            pk: { S: 'buyback' },
            sk: { N: String(ts) },
            amount: { N: String(fees) }
          }
        }
      }))
    }
  }

  return dynamodb.batchWriteItem(params).promise()
}

module.exports.query = async () => {
  const params = {
    ExpressionAttributeValues: {
      ':pk': { S: 'buyback' }
    },
    KeyConditionExpression: 'pk = :pk',
    TableName: 'merlin',
    ScanIndexForward: false,
    Limit: 6
  }
  const { Items } = await dynamodb.query(params).promise()

  return Items
}

module.exports.getRatioUpdates = async () => {
  const method = 'POST'
  const url = 'https://api.thegraph.com/subgraphs/name/roxx3r/abracadabra-staked-spell-ratio'
  const headers = { 'Content-type': 'application/json' }
  const body = JSON.stringify({
    query: `
      {
        ratioUpdates {
          id
          timestamp
          ratio
        }
      }
    `,
    variables: null
  })
  const resp = await fetch(url, { method, headers, body })
  const json = await resp.json()

  return json.data.ratioUpdates
}
