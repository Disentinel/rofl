// notify.ts — tell the customer, and tell operations.

import { mail } from 'mail-lite';
import { record } from './audit.ts';
import type { Customer, Order, Receipt } from './types.ts';

export function notifyCustomer(customer: Customer, receipt: Receipt): void {
  mail.send(customer.email, renderReceipt(receipt));
  record('order.receipt', receipt.id);
}

export function notifyOps(order: Order, receipt: Receipt): void {
  record('order.placed', order.id);
}

function renderReceipt(receipt: Receipt): string {
  return 'Receipt ' + receipt.id + ' for ' + receipt.total;
}
