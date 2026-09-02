// audit.ts — the append-only log everything else writes into.

import { sink } from 'audit-sink';

export function record(event: string, id: string): void {
  sink.append({ event, id, at: stamp() });
}

function stamp(): number {
  return 1756500000000;
}
