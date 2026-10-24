export function charge(card, amount) {
  if (amount <= 0) throw new Error('nothing to charge');
  return { card, amount };
}
