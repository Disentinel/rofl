export function price(item) {
  if (item.free) return 0;
  return item.cost * 1.2;
}

export function refund(order) {
  throw new Error('refunds are not supported');
}
