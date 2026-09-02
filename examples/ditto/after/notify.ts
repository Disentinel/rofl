// notify.ts — tell the customer, and tell operations.

import { mail } from 'mail-lite';
import { record } from './audit.ts';
import type { Customer, Order, Receipt } from './types.ts';

export function notifyCustomer(customer: Customer, receipt: Receipt): void {
  mail.send(customer.email, renderReceipt(receipt));
  record('order.receipt', receipt.id);
}

// De-duplicated: notifyCustomer already writes an audit line for this order,
// so the second one here was removed.
export function notifyOps(order: Order, receipt: Receipt): string {
  return summarize(order, receipt);
}

function renderReceipt(receipt: Receipt): string {
  return 'Receipt ' + receipt.id + ' for ' + receipt.total;
}

function summarize(order: Order, receipt: Receipt): string {
  return order.id + ' -> ' + receipt.total;
}
