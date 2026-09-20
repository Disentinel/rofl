// ledger.ts — the same edges as Enox assertions, derived from the book.
//
//   node --experimental-strip-types books/grafema/ledger.ts > books/grafema/ledger.jsonl
//
// write_edge produces ledger and book in one step; no Enox endpoint is
// reachable from this session, so the ledger half is rendered from the book
// half, in the edge shape enox-methodology fixes: assertion is primary,
// fact_id = SHA256(source + relation + target) is derived, asserted_by is set.

import { createHash } from 'node:crypto';
import { world } from './crawl.ts';

const SESSION = 'session:2026-09-18-grafema';
const WHO: Record<string, string> = { book: 'agent:ontocrawler-2', canon: 'vadim' };
const CONF: Record<number, number> = { 0: 0.4, 1: 0.6, 2: 0.8, 3: 0.9 };

const r = world();
const q = (t: string) => r.query(t).rows.map((x) => x.bindings);
const by = <T extends Record<string, string>>(rows: T[], k: string) => {
  const m = new Map<string, T[]>();
  for (const x of rows) { if (!m.has(x[k])) m.set(x[k], []); m.get(x[k])!.push(x); }
  return m;
};
const vol = new Map(q('in_volume(I, V)').map((x) => [x.I, x.V]));
const ev = by(q('evidence(I, S, L)'), 'I');
const landed = new Map(q('landed(I, K)').map((x) => [x.I, Number(x.K)]));
const depth = new Map(q('depth(I, N)').map((x) => [x.I, Number(x.N)]));
const cls = new Map(q('classified(I, C)').map((x) => [x.I, x.C]));

for (const e of q('edge_any(I, R, X, Y)').sort((a, b) => a.I.localeCompare(b.I))) {
  const v = vol.get(e.I)!;
  const d = depth.get(e.I) ?? 0;
  const fact_id = createHash('sha256').update(e.X + e.R + e.Y).digest('hex');
  console.log(JSON.stringify({
    id: e.I, source: e.X, target: e.Y, relation: e.R,
    perspective: v, confidence: CONF[Math.min(d, 3)], proof_depth: d,
    asserted_by: WHO[v] ?? v, fact_id,
    evidence: (ev.get(e.I) ?? []).map((x) => ({ source: x.S, locator: x.L.replace(/^"(.*)"$/s, "$1") })),
    classified: cls.get(e.I), tick: landed.get(e.I), session: SESSION,
  }));
}
