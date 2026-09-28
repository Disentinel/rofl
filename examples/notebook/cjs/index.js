const { total } = require('./cart');
const format = require('./format');

function receipt(items) {
  return format(total(items)) + ' for ' + count(items);
}

function count(items) {
  return require('./cart').size(items);
}

module.exports = { receipt };
