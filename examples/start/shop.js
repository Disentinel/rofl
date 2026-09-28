import { tax } from './tax.js';

export function price(item) {
  return item.cost + tax(item);
}
