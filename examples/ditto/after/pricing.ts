// pricing.ts — what an order costs. The linear scan became a Map lookup.

import type { Line, Order } from './types.ts';

const TABLE = [
  { sku: 'A-1', price: 400 },
  { sku: 'B-7', price: 1250 },
  { sku: 'C-3', price: 90 },
];

export function priceOf(order: Order): number {
  const index = buildIndex();
  let total = 0;
  for (const line of flattenLines(order.lines)) {
    total = total + lookupPrice(index, line.sku) * line.qty;
  }
  return total;
}

function buildIndex(): Map<string, number> {
  const index = new Map<string, number>();
  for (const row of TABLE) index.set(row.sku, row.price);
  return index;
}

function lookupPrice(index: Map<string, number>, sku: string): number {
  return index.get(sku) ?? 0;
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
