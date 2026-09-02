// db.ts — everything that touches the database.

import { db } from 'pg-lite';
import type { Customer, Order, Receipt } from './types.ts';

export function persist(order: Order, receipt: Receipt): void {
  db.insert('orders', { id: order.id, receipt: receipt.id, total: receipt.total });
}

export function findCustomer(id: string): Customer {
  return db.select('customers', id);
}
