// runtime/scheduler.ts — bounded best-first selection over candidate
// intents. All candidates are preserved (the frontier is the fact base
// itself — candidate_intent is derived, so it never needs cleanup); only a
// top-K batch is scheduled per tick.
//
// v0 ranking is a deterministic placeholder for the roadmap §9.3 symbolic
// model (impact x cost x discrimination x urgency):
//   1. intents on blocking claims outrank the rest (impact),
//   2. kind order verify < discriminate < clarify < escalate
//      (epistemic movers first; escalate waits on a human anyway),
//   3. target name alphabetically (determinism, nothing more).

import { Rofl } from '../src/api.ts';
import type { IntentRef } from './admission.ts';

const KIND_RANK: Record<string, number> = { verify: 0, discriminate: 1, clarify: 2, escalate: 3 };

export interface Schedule { scheduled: IntentRef[]; deferred: IntentRef[]; }

export function scheduleIntents(r: Rofl, topK: number): Schedule {
  const rows = r.query('candidate_intent(K, I, C)').rows.map((row) => ({
    kind: row.bindings.K, inquiry: row.bindings.I, target: row.bindings.C,
  }));
  const ranked = rows
    .map((it) => ({
      it,
      key: [
        r.holds(`blocks_on(${it.inquiry}, ${it.target})`) ? 0 : 1,
        KIND_RANK[it.kind] ?? 9,
        it.target,
      ] as const,
    }))
    .sort((a, b) =>
      a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2].localeCompare(b.key[2]));
  return {
    scheduled: ranked.slice(0, topK).map((x) => x.it),
    deferred: ranked.slice(topK).map((x) => x.it),
  };
}
