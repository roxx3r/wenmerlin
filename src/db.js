// imports
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

module.exports.blacklist = async () => {
  const params = {
    ExpressionAttributeValues: {
      ':pk': { S: 'blacklist' }
    },
    KeyConditionExpression: 'pk = :pk',
    TableName: 'merlin',
    ScanIndexForward: false,
    Limit: 10
  }
  const { Items } = await dynamodb.query(params).promise()

  return Items
}
