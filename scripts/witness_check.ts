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
export function world(): any {
  const r = new Rofl();
  for (const f of ['boot.rofl', 'facts/findings.rofl', 'rules/findings.rofl']) {
    const res = r.load(read(f), { budget: 50_000_000 });
    if (!res.ok) { console.error(`world: ${f}: ${res.diagnostics[0]}`); process.exit(1); }
  }
  r.evaluate(50_000_000);
  return r;
}

const str = (t: any) => (typeof t === 'string' ? t.replace(/^"|"$/g, '') : String(t));

export interface W { id: string; q: string; want: number; floor: boolean }

/** every witness the ledger records, in the world it is asked against */
export function witnesses(r: any): W[] {
  const rows = (q: string) => r.query(q).rows;
  return [
    ...rows('witness(F, Q, N)').map((x: any) =>
      ({ id: x.bindings.F, q: str(x.bindings.Q), want: Number(x.bindings.N), floor: false })),
    ...rows('witness_atleast(F, Q, N)').map((x: any) =>
      ({ id: x.bindings.F, q: str(x.bindings.Q), want: Number(x.bindings.N), floor: true })),
  ];
}

export interface Verdict { id: string; q: string; want: number; floor: boolean; got: number; err: string; ok: boolean }

/** ask each witness of the world, and say for each what happened */
export function judge(r: any, ws: W[]): Verdict[] {
  return ws.sort((a, b) => (a.id < b.id ? -1 : 1)).map((w) => {
    let got: number; let err = '';
    try {
      const res = r.query(w.q);
      if (res.error) { got = -1; err = res.error.slice(0, 40); }
      else if (res.unpopulatable) { got = -1; err = 'nothing in this world can populate that literal'; }
      else got = res.rows.length;
    } catch (e: any) { got = -1; err = e.message.slice(0, 40); }
    return { ...w, got, err, ok: err ? false : (w.floor ? got >= w.want : got === w.want) };
  });
}

// A relation nobody concludes and nothing marks `edb` answers every query with
// zero rows and no error - so a witness naming a misspelling reads as SATISFIED,
// which is the very defect this file exists to catch, one level up. boot.rofl
// already decides this for rule premises (`undefined_premise[audit]`); the same
// test applies here. Measured before the guard existed: a witness on
// `zzz_no_such_relation(X)` wanting 0 rows came back `ok`.
//
// THE HAND-WRITTEN COPY IS GONE, 2026-09-07. It read `concludes` and `edb` here
// and compared the LEADING NAME, which is the weaker half of what the kernel
// already knows: it could not see a witness written at the wrong ARITY, nor one
// naming the wrong LEDGER — and this repository's whole idiom is `rel[persp]`.
// `query()` now reports `unpopulatable` and judges all three. That is the
// remedy CLAUDE.md names by name: derive the check once from the rules instead
// of copying it per call site.

// A witness that cannot fail is an assumption with a witness's interface, so a
// BROKEN query — one that does not parse or names nothing — is not a pass.
//
// THE CLI IS A THIN SHELL OVER THE SAME TWO FUNCTIONS, 2026-09-07, and that is
// the whole content of wiring this gate: the check ran only when a human typed
// its name, so a stale witness was caught by remembering rather than by CI.
// test/witness-check.test.ts imports `world`, `witnesses` and `judge`, plants a
// stale one and a broken one, and asserts the tree's own witnesses are clean.
const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1] &&
  real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) {
  const r = world();
  const ws = witnesses(r);
  if (ws.length === 0) { console.log('no witnesses recorded'); process.exit(0); }
  const vs = judge(r, ws);
  console.log(`  ${ws.length} witnesses, asked against boot.rofl + the ledger\n`);
  for (const v of vs) {
    console.log(`${v.err ? 'BROKEN ' : v.ok ? '  ok   ' : ' STALE '} ${v.id}`);
    console.log(`        ${v.q}  ->  ${v.err ? v.err : v.got}`
      + `${v.floor ? ` (want >= ${v.want})` : ` (want ${v.want})`}`);
  }
  const broken = vs.filter((v) => v.err).length;
  const stale = vs.filter((v) => !v.err && !v.ok).length;
  console.log(`\n  ok ${vs.length - stale - broken}   STALE ${stale}   BROKEN ${broken}`);
  process.exit(stale + broken > 0 ? 1 : 0);
}
