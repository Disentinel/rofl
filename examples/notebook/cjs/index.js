const { total } = require('./cart');
const format = require('./format');
const { version } = require('./package.json');

function receipt(items) {
  return format(total(items)) + ' for ' + count(items) + ' (v' + version + ')';
}

function count(items) {
  return require('./cart').size(items);
}

module.exports = { receipt };
