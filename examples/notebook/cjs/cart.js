function price(item) {
  return item.price * item.qty;
}

exports.total = function total(items) {
  let sum = 0;
  for (const item of items) sum += price(item);
  return sum;
};

exports.size = function size(items) {
  return items.length;
};
