// payments.ts — the payment gateway, over HTTP.

import { http } from 'http-lite';
import type { Customer, Receipt } from './types.ts';

export function charge(customer: Customer, total: number): Receipt {
  const response = http.post('/charges', { customer: customer.id, total });
  return toReceipt(response);
}

function toReceipt(response: { id: string; amount: number }): Receipt {
  return { id: response.id, total: response.amount };
}
