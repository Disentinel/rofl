// pricing.ts — what an order costs. A linear scan over a price table.

import type { Line, Order } from './types.ts';

const TABLE = [
  { sku: 'A-1', price: 400 },
  { sku: 'B-7', price: 1250 },
  { sku: 'C-3', price: 90 },
];

export function priceOf(order: Order): number {
  let total = 0;
  for (const line of flattenLines(order.lines)) {
    total = total + scanTable(line.sku) * line.qty;
  }
  return total;
}

function scanTable(sku: string): number {
  for (const row of TABLE) {
    if (row.sku === sku) return row.price;
  }
  return 0;
}

// Recursive: a bundle line carries lines of its own.
function flattenLines(lines: Line[]): Line[] {
  const out: Line[] = [];
  for (const line of lines) {
    if (line.bundle && line.lines) {
      for (const inner of flattenLines(line.lines)) out.push(inner);
    } else {
      out.push(line);
    }
  }
  return out;
}
