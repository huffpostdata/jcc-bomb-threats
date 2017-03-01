const Months = [ 'Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.' ];

module.exports = function(dateS) {
  const month = parseFloat(dateS.slice(5, 7))
  const day = parseFloat(dateS.slice(8, 10))
  return Months[month - 1] + ' ' + day
}
