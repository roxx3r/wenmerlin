module.exports.formatUsd = (number) => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  })

  return formatter.format(number).split('.')[0]
}

module.exports.formatDate = (number) => {
  const date = new Date(1000 * number)
  const month = date.getMonth() + 1
  const monthLabel = month < 10 ? '0' + month : month
  const day = date.getDate()
  const dayLabel = day < 10 ? '0' + day : day

  return monthLabel + '.' + dayLabel
}

module.exports.formatPercent = (number) => {
  return 100 * (+number / 10_000_000) + '%'
}

module.exports.formatNumber = (number) => {
  // Nine Zeroes for Billions
  return Math.abs(Number(+number)) >= 1.0e9
    ? (Math.abs(Number(+number)) / 1.0e9).toFixed(2) + 'B'
    : // Six Zeroes for Millions
    Math.abs(Number(+number)) >= 1.0e6
    ? (Math.abs(Number(+number)) / 1.0e6).toFixed(2) + 'M'
    : // Three Zeroes for Thousands
    Math.abs(Number(+number)) >= 1.0e3
    ? (Math.abs(Number(+number)) / 1.0e3).toFixed(2) + 'K'
    : Math.abs(Number(+number))
}
