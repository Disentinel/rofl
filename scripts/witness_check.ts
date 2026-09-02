// witness_check.ts — a finding's premise, made runnable.
//
// A finding records what was true when it was written. When the thing it rests
// on moves, the finding goes stale — and until now that was noticed BY HAND,
// after the fact, four times in one day. `measurement_check.ts` already demands
// that a decided finding carry a WHAT WOULD REFUTE THIS line; this is the same
// discipline with the prose made executable.
//
// THE DESIGN CONSTRAINT IS CHEAPNESS. A witness must be cheap to write for a
// new finding and cheap to rewrite when the system changes, or it will not be
// written. So a witness is not a new language: it is an ordinary ROFL QUERY and
// the number of rows it had. Rewriting a witness is rewriting a query.
//
//   witness(F, "stratum(R, N)", 0).          -- exactly this many rows
//   witness_atleast(F, "conclusion_lit(R, K, L)", 1).
//
// AND IT MEASURES A CONSEQUENCE, NEVER THE CODE. A file hash flips on a
// reformat and says nothing; a line number flips on any edit above it — this
// repository is currently paying eleven test failures per kernel edit for
// exactly that mistake. A query over the store flips when the CLAIM becomes
// false, and not before.
//
//   node --experimental-strip-types scripts/witness_check.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The world a witness is asked against: the kernel plus the ledger's own rules. */
function world(): any {
  const r = new Rofl();
  for (const f of ['boot.rofl', 'facts/findings.rofl', 'rules/findings.rofl']) {
    const res = r.load(read(f), { budget: 50_000_000 });
    if (!res.ok) { console.error(`world: ${f}: ${res.diagnostics[0]}`); process.exit(1); }
  }
  r.evaluate(50_000_000);
  return r;
}

const r = world();
const rows = (q: string) => r.query(q).rows;
const str = (t: any) => (typeof t === 'string' ? t.replace(/^"|"$/g, '') : String(t));

interface W { id: string; q: string; want: number; floor: boolean }
const ws: W[] = [
  ...rows('witness(F, Q, N)').map((x: any) =>
    ({ id: x.bindings.F, q: str(x.bindings.Q), want: Number(x.bindings.N), floor: false })),
  ...rows('witness_atleast(F, Q, N)').map((x: any) =>
    ({ id: x.bindings.F, q: str(x.bindings.Q), want: Number(x.bindings.N), floor: true })),
];

if (ws.length === 0) { console.log('no witnesses recorded'); process.exit(0); }

// A relation nobody concludes and nothing marks `edb` answers every query with
// zero rows and no error - so a witness naming a misspelling reads as SATISFIED,
// which is the very defect this file exists to catch, one level up. boot.rofl
// already decides this for rule premises (`undefined_premise[audit]`); the same
// test applies here. Measured before the guard existed: a witness on
// `zzz_no_such_relation(X)` wanting 0 rows came back `ok`.
const known = new Set<string>([
  ...rows('concludes(R, Rel)').map((x: any) => str(x.bindings.Rel)),
  ...rows('edb(Rel)').map((x: any) => str(x.bindings.Rel)),
]);
/** the leading relation name of a query: `breach[audit](R)` -> `breach` */
const relOf = (q: string) => (q.trim().match(/^([a-z_][A-Za-z0-9_]*)/) ?? [])[1] ?? '';

let stale = 0, broken = 0;
console.log(`  ${ws.length} witnesses, asked against boot.rofl + the ledger\n`);
for (const w of ws.sort((a, b) => a.id < b.id ? -1 : 1)) {
  let got: number; let err = '';
  const rel = relOf(w.q);
  if (!known.has(rel)) { got = -1; err = `no relation '${rel}' is concluded or edb`; }
  else try { got = rows(w.q).length; } catch (e: any) { got = -1; err = e.message.slice(0, 40); }
  const ok = err ? false : (w.floor ? got >= w.want : got === w.want);
  if (err) broken++; else if (!ok) stale++;
  const mark = err ? 'BROKEN ' : ok ? '  ok   ' : ' STALE ';
  console.log(`${mark} ${w.id}`);
  console.log(`        ${w.q}  ->  ${err ? err : got}${w.floor ? ` (want >= ${w.want})` : ` (want ${w.want})`}`);
}
console.log(`\n  ok ${ws.length - stale - broken}   STALE ${stale}   BROKEN ${broken}`);
// A witness that cannot fail is an assumption with a witness's interface, so a
// BROKEN query — one that does not parse or names nothing — is not a pass.
process.exit(stale + broken > 0 ? 1 : 0);
