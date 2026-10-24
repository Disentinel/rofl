import { charge } from './pay.js';
import { log } from './log.js';

export function checkout(cart) {
  log('checkout', cart.id);
  return charge(cart.card, cart.total);
}

export function safeCheckout(cart) {
  try {
    return checkout(cart);
  } catch (e) {
    return null;
  }
}
