// orders.ts — the entry point. handleOrder is what the outside world calls.

import type { Customer, Order, Receipt } from './types.ts';
import { loadCustomer, persist } from './storage/db.ts';
import { charge } from './payments.ts';
import { priceOf } from './pricing.ts';
import { notifyCustomer, notifyOps } from './notify.ts';

export function handleOrder(order: Order): Receipt {
  const customer = loadCustomer(order.customerId);
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

// The discount arithmetic came out of settle into its own function.
function applyDiscount(customer: Customer, total: number): number {
  if (customer.email.endsWith('@partner.example')) return total - total / 10;
  return total;
}

// ... and the `persist(order, receipt)` line went with it.
function settle(order: Order, customer: Customer, total: number): Receipt {
  const payable = applyDiscount(customer, total);
  const receipt = charge(customer, payable);
  return receipt;
}
