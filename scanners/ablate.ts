// scanners/ablate.ts — DISABLE each before-A block and run the corpus.
//
// "Acyclic" says an ORDER exists. It does not say any block can move. That is
// a different claim and it is measured by removal, not by reading: turn one
// block's decision into a no-op — the check identically passes, the demand set
// identically empty, the MAX identically absent — and see what the corpus does.
//
// THREE CELLS, and the third is why this is a program and not a paragraph:
//   A  nothing changed, facts and diagnostics alike — the block did nothing here
//   B  only the DIAGNOSTICS moved — a REFUSAL, and a refusal can be deferred
//      to a later tier: tier 0 simply falls over instead of saying no
//   C  the DERIVED FACTS changed, or the run did not finish — needed at tier 0.
//      A configuration killed by the clock is C with the reason "did not
//      terminate", never A and never "crashed": the harness flushes per program,
//      so the last line it printed names the program it stopped on.
//
// TWO POSITIVE CONTROLS, both inside the probe:
//
//   1. THE SWITCH ITSELF. Every anchor is COUNTED BEFORE IT IS REPLACED and the
//      count must be exactly 1. A `String.replace` with a string argument
//      rewrites the FIRST occurrence, so an anchor that also appears in a
//      comment silently patches the comment, the kernel is untouched, and the
//      run comes back byte-identical — which reads exactly like "the block does
//      not matter". Counting first is what tells those two apart.
//   2. REACHABILITY. Each block also bumps a counter when its decision has
//      something to decide. "Nothing changed" then splits into "the block is
//      inert here" and "the corpus never reached it" — two different findings
//      that look the same from the outcome alone.
//      THE COUNTER IS PER SESSION, AND EVERY SESSION LOADS boot.rofl FIRST, so
//      a program that never uses a block still records the hit from the boot
//      pass. Measured: `examples/rip/` runs under `semantics(well_founded)`,
//      where the alternation orders no phases and never calls `readStrata` —
//      and it still shows b5=1, all of it boot. A count of 32/32 therefore
//      means "called in every session", not "used by every program"; the
//      canary rows print the per-program count so the difference is visible.
//
// The kernel is NEVER edited in place: the patch is applied to a COPY under
// os.tmpdir(), and the child process imports the copy.
//
//   node --experimental-strip-types scanners/ablate.ts          # the matrix
//   node --experimental-strip-types scanners/ablate.ts --child  # one config

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

export interface Hook { id: string; anchor: string; replace: string; note: string; }

/** The declarations both the switch and the reachability counters need. */
const PREAMBLE = `/** Ablation switch and reachability counters — a PATCHED COPY of the kernel,
 *  written by scanners/ablate.ts. Never present in src/. */
const ABLATE = process.env.ABLATE ?? '';
const HIT = (k: string): void => {
  const g = globalThis as unknown as { __hit?: Record<string, number> };
  g.__hit ??= {};
  g.__hit[k] = (g.__hit[k] ?? 0) + 1;
};

const MAX_DEPTH = 512;`;

export const HOOKS: Hook[] = [
  { id: 'preamble', note: 'the switch and the counters',
    anchor: 'const MAX_DEPTH = 512;', replace: PREAMBLE },

  { id: 'b1', note: '107-118 refuse a rule concluding into a reserved relation',
    anchor: '      if (RESERVED.has(r.clause.head.rel)) {',
    replace: '      if (RESERVED.has(r.clause.head.rel)) HIT(\'b1\');\n'
      + '      if (RESERVED.has(r.clause.head.rel) && ABLATE !== \'b1\') {' },

  { id: 'b2', note: '119-169 the demand-backed set, identically empty',
    anchor: '    this.demandRels = new Map();\n    for (const rel of [...unfoldable].sort()) {',
    replace: '    if (unfoldable.size > 0) HIT(\'b2\');\n'
      + '    this.demandRels = new Map();\n'
      + '    if (ABLATE !== \'b2\') for (const rel of [...unfoldable].sort()) {' },

  { id: 'b3', note: '170-206 range restriction, identically satisfied',
    anchor: '    if (!h.args.every(groundIn) || !groundIn(h.persp)) safe = false;',
    replace: '    if (!h.args.every(groundIn) || !groundIn(h.persp)) safe = false;\n'
      + '    if (!safe) HIT(\'b3\');\n'
      + '    if (ABLATE === \'b3\') safe = true;' },

  { id: 'b4-skip', note: '214-224 the reuse skip stops skipping',
    anchor: '    const safeRules = this.rules.filter((r) => r.safe && !plan.hits.has(r.clause.head.rel));',
    replace: '    if (plan.hits.size > 0) HIT(\'b4_reuse_skip\');\n'
      + '    const safeRules = this.rules.filter((r) => r.safe\n'
      + '      && (ABLATE === \'b4\' || !plan.hits.has(r.clause.head.rel)));' },

  { id: 'b4-gate', note: '214-224 the rejection gate identically passes',
    anchor: '    const negated = this.rules.some((r) => r.safe && r.hasNeg);',
    replace: '    if (this.rules.some((r) => r.safe && r.hasNeg)) HIT(\'b4_gate\');\n'
      + '    const negated = ABLATE === \'b4\' ? false : this.rules.some((r) => r.safe && r.hasNeg);' },

  { id: 'b5', note: '498-523 the stratum table, identically absent',
    anchor: '  readStrata(): Map<string, number> {\n    const out = new Map<string, number>();',
    replace: '  readStrata(): Map<string, number> {\n    const out = new Map<string, number>();\n'
      + '    if (this.store.relAll(IFACE.stratum).length > 0) HIT(\'b5\');\n'
      + '    if (ABLATE === \'b5\') return out;' },

  { id: 'b6', note: '632-647 well-founded admissibility identically passes',
    anchor: '    if (this.demandRels.size > 0) {\n      const names = [...this.demandRels.keys()].join(\', \');',
    replace: '    if (this.demandRels.size > 0) HIT(\'b6\');\n'
      + '    if (this.demandRels.size > 0 && ABLATE !== \'b6\') {\n'
      + '      const names = [...this.demandRels.keys()].join(\', \');' },
];

export interface PatchResult { text: string; counts: Record<string, number>; }

/** Count every anchor BEFORE replacing any of them, then replace. An anchor
 *  that does not occur exactly once is a defect in this file, not in the
 *  kernel, and it throws rather than producing a copy that looks patched. */
export function patchSource(src: string): PatchResult {
  const counts: Record<string, number> = {};
  for (const h of HOOKS) counts[h.id] = src.split(h.anchor).length - 1;
  const bad = HOOKS.filter((h) => counts[h.id] !== 1);
  if (bad.length > 0) {
    throw new Error('anchor does not occur exactly once: '
      + bad.map((h) => `${h.id}=${counts[h.id]}`).join(', '));
  }
  let text = src;
  for (const h of HOOKS) text = text.replace(h.anchor, h.replace);
  for (const h of HOOKS) {
    if (!text.includes(h.replace)) throw new Error(`hook ${h.id} did not land`);
  }
  return { text, counts };
}

/** A patched copy of the kernel in a fresh temp directory. src/ is read only. */
export function buildKernel(): { dir: string; counts: Record<string, number> } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-ablate-'));
  fs.mkdirSync(path.join(dir, 'src'));
  let counts: Record<string, number> = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'src'))) {
    const text = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
    if (f === 'engine.ts') {
      const r = patchSource(text);
      counts = r.counts;
      fs.writeFileSync(path.join(dir, 'src', f), r.text);
    } else {
      fs.writeFileSync(path.join(dir, 'src', f), text);
    }
  }
  return { dir, counts };
}

// ---------------------------------------------------------------------------
// the corpus, and the tripwires the corpus does not contain

/** Every .rofl in one example directory, plus each appendix program alone. */
export function corpus(): { name: string; files: string[] }[] {
  const ex = path.join(ROOT, 'examples');
  const out: { name: string; files: string[] }[] = [];
  for (const f of fs.readdirSync(ex).sort()) {
    const full = path.join(ex, f);
    if (fs.statSync(full).isDirectory()) {
      const rofl = fs.readdirSync(full).filter((x) => x.endsWith('.rofl')).sort()
        .map((x) => path.join(full, x));
      if (rofl.length > 0) out.push({ name: `examples/${f}/`, files: rofl });
    } else if (f.endsWith('.rofl')) out.push({ name: `examples/${f}`, files: [full] });
  }
  return out;
}

/** The 25 corpus programs are all legal: the baseline rejects nothing and emits
 *  no diagnostic. Ablating a REFUSAL against them alone would come back
 *  "nothing changed" for the wrong reason. Each of these trips one block. */
export const TRIPWIRES: { name: string; text: string; twice?: boolean; loadBudget?: number }[] = [
  { name: 'tw_reserved_head', text: 'seed(a).\nedb(X) :- seed(X).\n' },
  { name: 'tw_unsafe_demand', text:
    'close(A, B) :- D is A - B, D <= 2, D >= -2.\n'
    + 'pair(A, B) :- seed(A), seed(B), close(A, B).\nseed(1). seed(2). seed(9).\n' },
  // ...AND ITS OWN STRATUM TABLE, as four ordinary facts. boot.rofl used to
  // derive one for every program it audited; those ten rules were deleted once
  // the primary evaluator started peeling its schedule off the decoded rules,
  // and with no table in the store the stock evaluator's MAX (block b5) has
  // nothing to read and ablating it proves nothing. `stratum/2` is the kernel's
  // READ INTERFACE, not boot's private relation — any program may write it, and
  // this one does, which is what keeps b5 alive to be ablated. Under rounds the
  // same four facts sit in the store and are never consulted, which is the
  // other half of the measurement.
  { name: 'tw_two_negation_levels', text:
    'a(1). a(2). w(1).\nz(X) :- a(X), not w(X).\ny(X) :- a(X), not z(X).\n'
    + 'stratum(a, 0). stratum(w, 0). stratum(z, 1). stratum(y, 2).\n' },
  // MEASURED while building this, and FIXED since. boot.rofl's own
  // `stratum(Rel,N) :- dep_neg(Rel,Q), stratum(Q,M), N is M+1` has no fixpoint
  // on a negative cycle, so a single-wave phase A only ended when the budget
  // did: 2500 -> 509 ms, 5000 -> 1484 ms, 10000 -> 4874 ms, 20000 -> 23312 ms,
  // and the default 100_000 was minutes. `stratumCone` (src/engine.ts:509) now
  // runs the wave that DECIDES the refusal first and alone. Re-measured on the
  // changed kernel: 26 / 29 / 25 / 50 ms at budgets 2500 / 20k / 100k / 5e6 —
  // flat. The explicit budget below is kept because it is what makes the
  // tripwire's cost independent of that repair.
  { name: 'tw_unstratified', text: 'q(1).\np(X) :- q(X), not p(X).\n', loadBudget: 2500 },
  { name: 'tw_wf_plain', text:
    'semantics(well_founded).\nmove(a, b). move(b, a).\nwin(X) :- move(X, Y), not win(Y).\n' },
  { name: 'tw_wf_with_demand', text:
    'semantics(well_founded).\nmove(a, b). move(b, a).\nwin(X) :- move(X, Y), not win(Y).\n'
    + 'close(A, B) :- D is A - B, D <= 2, D >= -2.\n'
    + 'pair(A, B) :- seed(A), seed(B), close(A, B).\nseed(1). seed(2).\n' },
  // the reuse half of 214-224 exists only on a SECOND evaluation: the first has
  // nothing to reuse, so a single-shot probe cannot see it at all
  { name: 'tw_reuse_second_pass', text:
    'edge(1, 2). edge(2, 3).\npath(X, Y) :- edge(X, Y).\n'
    + 'path(X, Z) :- path(X, Y), edge(Y, Z).\n'
    + 'orphan(X) :- edge(X, _), not path(_, X).\n', twice: true },
];

export interface Rec {
  name: string; ablate: string; facts?: number; factsHash?: string; stateHash?: string;
  diagHash?: string; diagCount?: number; diagText?: string; error?: string; ms?: number;
  hits?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// the child: one configuration, over everything, one JSON line per program

async function child(): Promise<void> {
  const crypto = await import('node:crypto');
  const kernel = process.env.KERNEL!;
  const { Rofl } = await import(path.join(kernel, 'src', 'api.ts')) as typeof import('../src/api.ts');
  const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
  const BUDGET = 4_000_000;
  const sha = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
  const G = globalThis as unknown as { __hit?: Record<string, number> };

  const digest = (name: string, load: (r: InstanceType<typeof Rofl>) => string[],
                  twice = false): void => {
    const t0 = Date.now();
    G.__hit = {};
    const rec: Rec = { name, ablate: process.env.ABLATE ?? '' };
    try {
      // WHICH EVALUATOR the ablation runs against. Rounds are the default now,
      // and they read no stratum table — so a block like b5 (the MAX over
      // stratum/2) is genuinely dead on the default path and ablating it
      // proves nothing there. That is a RESULT, not a broken probe, and it is
      // only legible if the study can still run the path where the block is
      // alive. `EVALUATOR=strata` is that path.
      const r = new Rofl(process.env.EVALUATOR === 'strata' ? { evaluator: 'strata' } : {});
      const diags: string[] = [...r.load(BOOT).diagnostics, ...load(r)];
      r.evaluate(BUDGET);
      if (twice) { diags.push(...r.assert('edge(3, 4).', { who: 'tester' }).diagnostics); r.evaluate(BUDGET); }
      const keys = r.factKeys().sort();
      rec.facts = keys.length;
      rec.factsHash = sha(keys.join('\n'));
      rec.stateHash = sha(r.store.canonicalState());
      rec.diagHash = sha(diags.sort().join('\n'));
      rec.diagCount = diags.length;
      rec.diagText = diags.sort().join(' | ').slice(0, 120);
      rec.hits = { ...(G.__hit ?? {}) };
    } catch (e) {
      rec.error = `${(e as Error).name}: ${String((e as Error).message).split('\n')[0].slice(0, 100)}`;
    }
    rec.ms = Date.now() - t0;
    process.stdout.write(JSON.stringify(rec) + '\n');
  };

  // ONLY=<substring> runs one program: a test needs an end-to-end control on
  // the switch without paying for the whole corpus.
  const only = process.env.ONLY ?? '';
  for (const t of TRIPWIRES) {
    if (only && !t.name.includes(only)) continue;
    digest(t.name, (r) => r.load(t.text,
      t.loadBudget ? { who: 'tester', budget: t.loadBudget } : { who: 'tester' }).diagnostics, t.twice);
  }
  for (const p of corpus()) {
    if (only && !p.name.includes(only)) continue;
    digest(p.name, (r) => p.files.flatMap((f) =>
      r.load(fs.readFileSync(f, 'utf8'), { who: 'tester' }).diagnostics));
  }
}

// ---------------------------------------------------------------------------
// the driver

export function runConfig(kernelDir: string, ablate: string, timeout = 120_000, only = '',
                          evaluator: 'rounds' | 'strata' = 'rounds'):
    { recs: Rec[]; killed: boolean; ms: number } {
  const t0 = Date.now();
  const res = spawnSync(process.execPath,
    ['--experimental-strip-types', path.join(ROOT, 'scanners', 'ablate.ts'), '--child'],
    { env: { ...process.env, ABLATE: ablate, KERNEL: kernelDir, ONLY: only, EVALUATOR: evaluator },
      encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
  const recs: Rec[] = (res.stdout ?? '').split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
  return { recs, killed: res.signal !== null, ms: Date.now() - t0 };
}

const refusal = (r: Rec): string =>
  `${r.error ?? ''}|${(r.diagText ?? '').match(/rejected|not executable/g)?.join(',') ?? ''}|${r.diagCount ?? 0}`;
const factsOf = (r: Rec): string => `${r.factsHash ?? '-'}/${r.stateHash ?? '-'}/${r.facts ?? -1}`;

export type Cell = 'A' | 'B' | 'C';
export function classify(base: Rec | undefined, ab: Rec | undefined): { cell: Cell; why: string } {
  if (!base) return { cell: 'C', why: 'no baseline record' };
  if (!ab) return { cell: 'C', why: 'DID NOT FINISH — the configuration was killed by the clock' };
  const sameFacts = factsOf(ab) === factsOf(base);
  const sameRef = refusal(ab) === refusal(base);
  if (sameFacts && sameRef) return { cell: 'A', why: '' };
  if (sameFacts) return { cell: 'B', why: `refusal only: [${refusal(base)}] -> [${refusal(ab)}]` };
  if (refusal(base) !== '||0' && !sameRef) {
    return { cell: 'B', why: `base refused, ablation did not — facts ${base.facts} -> ${ab.facts}` };
  }
  return { cell: 'C', why: `FACTS CHANGED ${base.facts} -> ${ab.facts} `
    + `(state ${base.stateHash} -> ${ab.stateHash})${ab.error ? ' error=' + ab.error : ''}` };
}

/** The programs worth reading one by one rather than as a count. `wtf` carries
 *  fourteen strata, `rip` is the only program under `semantics(well_founded)`,
 *  and `loot` reads its own provenance in rules — three different ways for a
 *  block to matter, and a count hides which of them fired. */
export const CANARIES = ['examples/wtf/', 'examples/rip/', 'examples/loot/'];

const LABEL: Record<string, string> = {
  b1: '107-118 refuse a reserved head', b2: '119-169 demand set',
  b3: '170-206 range restriction', b4: '214-224 reuse skip + rejection gate',
  b5: '498-523 stratum MAX', b6: '632-647 wf admissibility',
};

export function report(timeout = 120_000): string[] {
  const out: string[] = [];
  const say = (s = '') => out.push(s);
  const { dir, counts } = buildKernel();
  say(`patched kernel at ${dir}`);
  say(`anchor occurrences BEFORE patching (each must be exactly 1): `
    + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));

  const base = runConfig(dir, '', timeout);
  const baseBy = new Map(base.recs.map((r) => [r.name, r]));
  say(`baseline: ${base.recs.length} programs in ${base.ms} ms, killed=${base.killed}`);
  const refused = base.recs.filter((r) => refusal(r) !== '||0').map((r) => r.name);
  say(`baseline refuses ${refused.length}: ${refused.join(', ')}`);

  // REACHABILITY: how often each block had something to decide
  const fired: Record<string, number> = {};
  for (const r of base.recs) for (const k of Object.keys(r.hits ?? {})) fired[k] = (fired[k] ?? 0) + 1;
  say(`blocks that actually fired, per program (of ${base.recs.length}): `
    + ['b1', 'b2', 'b3', 'b4_gate', 'b4_reuse_skip', 'b5', 'b6']
      .map((k) => `${k}=${fired[k] ?? 0}`).join(' '));
  say('');

  let nonA = 0;
  const grid = new Map<string, Record<string, Cell>>();
  for (const id of ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']) {
    const cfg = runConfig(dir, id, timeout);
    const by = new Map(cfg.recs.map((r) => [r.name, r]));
    const cells: Record<Cell, string[]> = { A: [], B: [], C: [] };
    const detail: string[] = [];
    for (const [name, b] of baseBy) {
      const { cell, why } = classify(b, by.get(name));
      cells[cell].push(name);
      if (!grid.has(name)) grid.set(name, {});
      grid.get(name)![id] = cell;
      if (why) detail.push(`    ${name}: ${why}`);
    }
    nonA += cells.B.length + cells.C.length;
    say(`${id}  ${LABEL[id]}   [fired on ${fired[id] ?? fired[id + '_gate'] ?? 0}, ${cfg.ms} ms${cfg.killed ? ', KILLED' : ''}]`);
    say(`    A nothing changed ${cells.A.length}   B refusal only ${cells.B.length}   `
      + `C facts changed / did not finish ${cells.C.length}`);
    for (const d of detail) say(d);
    say('');
  }
  say('-- THE THREE CANARIES, block by block --------------------------------');
  say(`  ${'program'.padEnd(16)} ${['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((x) => x.padEnd(3)).join('')} facts   hits (per SESSION: one is the boot pass)`);
  for (const c of CANARIES) {
    const row = grid.get(c);
    const b = baseBy.get(c);
    if (!row || !b) { say(`  ${c.padEnd(16)} NOT IN THE CORPUS`); continue; }
    say(`  ${c.padEnd(16)} ${['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((x) => (row[x] ?? '?').padEnd(3)).join('')} `
      + `${String(b.facts).padEnd(7)} hits ${JSON.stringify(b.hits ?? {})}`);
  }
  say('');

  // POSITIVE CONTROL on the switch as a whole: if every block came back A on
  // every program, the patch did not apply and the run measured nothing.
  say(nonA > 0 ? `switch confirmed: ${nonA} non-A outcomes across the six`
    : '!! EVERY BLOCK CAME BACK A: the ablation did not apply, this run measures nothing');
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

if (process.argv.includes('--child')) {
  await child();
} else if (process.argv[1] && fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(path.resolve(new URL(import.meta.url).pathname))) {
  for (const l of report()) console.log(l);
}
