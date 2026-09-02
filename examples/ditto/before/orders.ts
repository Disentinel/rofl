// orders.ts — the entry point. handleOrder is what the outside world calls.

import type { Customer, Order, Receipt } from './types.ts';
import { findCustomer, persist } from './db.ts';
import { charge } from './payments.ts';
import { priceOf } from './pricing.ts';
import { notifyCustomer, notifyOps } from './notify.ts';

export function handleOrder(order: Order): Receipt {
  const customer = findCustomer(order.customerId);
  validateOrder(order, customer);
  const total = priceOf(order);
  const receipt = settle(order, customer, total);
  notifyCustomer(customer, receipt);
  notifyOps(order, receipt);
  return receipt;
}

function validateOrder(order: Order, customer: Customer): void {
  if (!customer) throw new Error('unknown customer');
  checkStock(order);
}

function checkStock(order: Order): void {
  for (const line of order.lines) {
    if (line.qty <= 0) throw new Error('bad quantity');
  }
}

// One function: take the money, then write the order down.
function settle(order: Order, customer: Customer, total: number): Receipt {
  const receipt = charge(customer, total);
  persist(order, receipt);
  return receipt;
}
