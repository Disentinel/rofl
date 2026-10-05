// scripts/whycheck.ts — `why`, `whynot` and `excise` from the Rust engine
// against the reference, byte for byte, over every world `npm test` loads.
//
//   npm run whycheck [-- name ...]
//
// The questions are taken from the world itself: its deepest derivation
// (the longest reference `why` among its derived facts), a few derived facts
// spread over the store, each asked `why` and `whynot` (and `why all` where
// the program has aggregates), the same fact with its last argument changed
// (a `why` refused, a `whynot` that fails), an undefined atom and a fact
// resting on one where the world is three-valued, the target of a shrug row,
// one failing `whynot` under small and out-of-range bounds, and one base fact
// excised. Each is put to `rofl-serve` through runtime/port.ts AND to
// `rofl-load --why/--why-all/--whynot/--excise`, and both must print what
// src/api.ts prints, and refuse what it refuses.
//
// A REFUSAL IS COMPARED TOO. Every question the reference refuses is asked,
// and the Rust engine must refuse it — over the protocol as an error, from
// rofl-load as exit code 4 — with the reference's text. ONE CLASS IS COMPARED
// BY KIND AND NOT BY TEXT: a question the reference's parser rejects
// (`line N: ...`). Two parsers word a syntax error differently, and the
// goldens hold a refused FILE to the same contract (scripts/goldens.ts): that
// it is refused is the part both must agree on. A malformed set is asked of
// the first world for exactly that, and rofl-load is asked each such question
// in a run of its own, which must exit 4. A whynot's `holds` is compared over
// the protocol.
//
// TWO WORLDS ARE WHYCHECK'S OWN (scripts/whycheck-worlds/): a demand that
// unfolds without end, met by `whynot` and not by the evaluation, through
// each of the reference's explainers — no corpus world reaches that wall.
// A few corpus worlds are asked named questions besides (ASKED).
//
// THE WORLDS ARE SPLIT OVER ROFL_JOBS PROCESSES (default: the cores, at most
// 8), each with its own rofl-serve, as `npm test` pools its worlds.

import { Rofl } from '../src/api.ts';
import { storeHasAggregates } from '../src/aggeval.ts';
import { canonTerm } from '../src/unify.ts';
import { RoflPort, type Walls } from '../runtime/port.ts';
import { worlds, placed, togetherWorld, expectedRefusal, treeSealed, treeDeclared, filesText, closureVerdict, type World } from './goldens.ts';
import { belowFiles } from './agg_select.ts';
import { dagProblem } from './why_dag.ts';
import { derivationHeights, type DerivationSource } from '../src/store.ts';
import { unreadOf } from './sentences.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BOOT = path.join(ROOT, 'boot.rofl');
const LOAD = path.join(ROOT, 'rust/target', process.env.ROFL_PROFILE || 'release', 'rofl-load');

type Op = 'why' | 'whyall' | 'whynot' | 'excise';
type Q = { op: Op; query: string; depth?: number; nodes?: number };
/** An answer: refused or not, its text, and for a whynot whether the
 *  literal holds (the protocol's `holds`; rofl-load prints text alone). */
type A = { ok: boolean; text: string; holds?: boolean };

/** The world as `npm test` builds it in the reference: a refused file is
 *  left out, and the world is the rest — the golden already pins that both
 *  engines refuse it. */
function reference(w0: World): { r: Rofl; w: World } {
  const w = placed(w0);
  if (w.together) {
    const keep = w.files.filter((f) => !expectedRefusal(f) && unreadOf(f).length === 0);
    const { r, failed } = togetherWorld(w, keep);
    if (failed !== null) throw new Error(`${w.name} does not evaluate: ${failed}`);
    return { r, w: { ...w, files: keep } };
  }
  const r = new Rofl(w.strata ? { evaluator: 'strata' } : {});
  const opt = w.budget ? { budget: w.budget } : undefined;
  // as scripts/goldens.ts loads it: under the stock evaluator only a fixture is judged alone, any other file waits for its table
  const later = w.strata ? { ...opt, defer: true } : opt;
  r.load(fs.readFileSync(BOOT, 'utf8'), later);
  const files = w.files.filter((f) => unreadOf(f).length === 0 && r.load(fs.readFileSync(f, 'utf8'), expectedRefusal(f) ? opt : later).ok);
  if (w.ticks) for (let i = 0; i < w.ticks; i++) r.tickAdvance();
  else r.evaluate(w.budget);
  return { r, w: { ...w, files } };
}

const askable = (k: string): boolean => !k.includes('$') && !k.includes('?');

/** Inputs the reference's parser refuses, a question no engine may answer
 *  about a different fact (an integer past the range, a character outside
 *  the alphabet), and the refusals that are not the parser's. */
const MALFORMED = ['path(a,', 'not path(a,d)', '1 < 2', 'path', 'path[](a,d)', 'p(1.5)', 'path(a,d)@prev', '',
  'path(a,d)..', 'p(9999999999999999999999)', 'p(18446744073709551616)', 'pä(ü)', 'p(a). q(b).', 'p(a) :- q(a).'];
const NONGROUND = ['edge(X,c)', 'seen[P](a)', 'path(_,_)', 'hole(X)'];

/** Worlds no corpus world stands in for, kept in scripts/whycheck-worlds/ and
 *  asked these questions besides the usual ones: a demand that unfolds
 *  without end, so a `whynot` meets the budget wall while demonstrating —
 *  through each of the reference's two explainers. */
const OWN_DIR = path.join(ROOT, 'scripts/whycheck-worlds');
const OWN: { w: World; qs: Q[]; excise: boolean }[] = [['demand-wall', true], ['demand-wall-agg', false]].map(([stem, excise]) => ({
  w: { name: `whycheck_${(stem as string).replace(/-/g, '_')}`, files: [path.join(OWN_DIR, `${stem}.rofl`)] },
  qs: [{ op: 'whynot', query: 'r(a)' }, { op: 'whynot', query: 'r(b)', depth: 2, nodes: 4 }, { op: 'why', query: 'r(a)' },
    { op: 'whynot', query: 's(a)' }, ...(excise ? [{ op: 'excise', query: 'q(a)' } as Q] : [])],
  // the file says why the aggregate one is asked no excise
  excise: excise as boolean,
}));
const own = new Map(OWN.map((o) => [o.w.name, o]));

/** Questions a corpus world is asked besides the usual ones: a call answered on demand whose unfolding reads what a
 *  hole left unknown, which a question once read as absence (f_an_answer_unfolded_at_a_call_read_a_hole_as_absence). */
const ASKED: Record<string, Q[]> = {
  // a question outside the cone of asks, and one of what the kernel writes of every rule, is refused in the same words
  asks_outside: [...['ot_b(1)', 'ot_a(1,1)', 'unknown(ot_b(1))'].flatMap((q): Q[] => [{ op: 'whynot', query: q }, { op: 'why', query: q }]),
    { op: 'excise', query: 'ot_src(1)' }],
  demand_neg_hole: ['dh_r(c)', 'dh_nr(c)', 'dh_h(c,c)', 'dh_r1(c)'].flatMap((q): Q[] => [{ op: 'whynot', query: q }, { op: 'why', query: q }]),
  demand_pos_hole: ['dp_nr(k)', 'dp_r(k)', 'dp_d(k,k)', 'dp_q2(k)'].map((q): Q => ({ op: 'whynot', query: q })),
  demand_asked_hole: ['da_r(c)', 'da_nr(c)', 'da_q(c,z)', 'da_q(b,z)', 'da_d(k,z)', 'da_ng(b)'].map((q): Q => ({ op: 'whynot', query: q })),
  demand_cycle: ['dy_r(4)', 'dy_n(3)', 'dy_d(9,5)', 'dy_d(4,9)'].flatMap((q): Q[] => [{ op: 'whynot', query: q }, { op: 'why', query: q }]),
  demand_chain: ['dc_r(700)', 'dc_missed(700)'].map((q): Q => ({ op: 'whynot', query: q })),
};

function questions(r: Rofl, budget: number | undefined, first: boolean, excise = true): Q[] {
  const all = r.store.allFacts().filter((f) => askable(f.key));
  const facts = all.map((f) => f.key).sort();
  const derived = facts.filter((k) => r.store.witnessOf(k) || !r.store.get(k)?.base);
  const base = facts.filter((k) => r.store.get(k)?.base && !r.store.witnessOf(k));
  const agg = storeHasAggregates(r.store);
  const spread = (xs: string[], n: number): string[] =>
    xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]);
  // A `why` is a DAG, written once per distinct sub-goal
  // (f_why_writes_a_shared_derivation_out_in_full), so an answer is no larger
  // than the derivation graph; a fact is still asked only once its answer is
  // known to be small, and the scan stops at the first huge one or after
  // twenty seconds.
  const small = new Set<string>();
  // an undefined atom, where the world has any: its `why` names the unfounded set
  const unknown = derived.filter((k) => k.startsWith('unknown[')).slice(0, 2);
  let deepest = ''; let lines = 0;
  // `why all` where the digest held members back: every member of every cell is
  // written, once, so it is bounded by the DAG (f_why_all_is_unbounded_below_the_top)
  const digested = new Set<string>();
  const t0 = Date.now();
  for (const k of new Set([...unknown, ...spread(derived, 4), ...spread(derived, 200)])) {
    if (Date.now() - t0 > 20_000) break;
    const t = r.why(k, { budget }).text;
    if (t.length > 2_000_000) break;
    small.add(k);
    const n = t.split('\n').length;
    if (n > lines) { lines = n; deepest = k; }
    if (agg && t.includes(' more members: why all ') && digested.size < 3 && r.why(k, { budget, all: true }).text.length <= 2_000_000) digested.add(k);
  }
  const qs: Q[] = [];
  // and one that rests on one, through a negation that never settled
  const onUnknown = unknown.length === 0 ? []
    : [...small].filter((k) => r.why(k, { budget }).text.includes('[undefined]')).slice(0, 2);
  // what a shrug row is about: no answer, and why
  const shrugs = r.store.relAll('shrug').map((f) => f.args[0]).filter((t) => t !== undefined && (t.k === 'a' || t.k === 'f'))
    .map((t) => canonTerm(t)).filter(askable).slice(0, 2);
  let failing = '';
  for (const k of new Set([deepest, ...spread(derived, 4).filter((x) => small.has(x)), ...unknown.filter((x) => small.has(x)), ...onUnknown].filter(Boolean))) {
    qs.push({ op: 'why', query: k }, { op: 'whynot', query: k });
    const off = k.includes('"') ? k : k.replace(/([(,])[^,()]+\)$/, '$1zz_nowhere)');
    if (off !== k) { qs.push({ op: 'why', query: off }, { op: 'whynot', query: off }); failing ||= off; }
  }
  for (const k of digested) qs.push({ op: 'whyall', query: k });
  for (const k of shrugs) qs.push({ op: 'why', query: k }, { op: 'whynot', query: k });
  if (failing) {
    for (const [depth, nodes] of [[1, 3], [2, 64], [-3, -1], [0, 0]]) qs.push({ op: 'whynot', query: failing, depth, nodes });
    // a plain world's refusal echoes the question exactly as typed, padding
    // and all; whynot's holds line trims it
    qs.push({ op: 'why', query: ` ${failing}` }, { op: 'why', query: `${failing} ` }, { op: 'whyall', query: `  ${failing}` });
  }
  if (deepest) qs.push({ op: 'whynot', query: ` ${deepest} ` });
  if (excise && base.length) qs.push({ op: 'excise', query: base[Math.floor(base.length / 2)] });
  if (excise && derived.length) qs.push({ op: 'excise', query: derived[0] });
  if (first) {
    for (const m of MALFORMED) for (const op of ['why', 'whynot', 'excise'] as const) qs.push({ op, query: m });
    for (const m of NONGROUND) for (const op of ['why', 'excise'] as const) qs.push({ op, query: m });
  }
  return qs;
}

/** The questions of a Rust-only world, taken from the Rust state alone (the reference is not run on it): a few
 *  derived facts spread over the store, each asked why and whynot, the same with its last argument changed, one base
 *  fact excised. There is no oracle, so the answers are compared rofl-serve against rofl-load only. */
function rustQuestions(w: World, rich = false): Q[] {
  const p = spawnSync(LOAD, [...(w.budget ? ['--budget', String(w.budget)] : []), ...(w.deltaFirst ? ['--delta-first'] : []), ...(w.ticks ? ['--ticks', String(w.ticks)] : []), BOOT, ...w.files],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const keys = (kind: string): string[] => p.stdout.split('\n').flatMap((l) => {
    const m = /^([a-z]\w*)(?:\[(\w+)\])?(\(.*\)) (?:timeless|tick) (\w+) support=\d+$/.exec(l);
    const k = m && m[1] + (m[2] && m[2] !== 'main' ? `[${m[2]}]` : '') + m[3];
    return m && m[4] === kind && askable(k!) ? [k!] : [];
  }).sort();
  const derived = keys('drv'), base = keys('base');
  const n = Math.min(rich ? 12 : 4, derived.length);
  const spread = Array.from({ length: n }, (_, i) => derived[Math.floor((i * derived.length) / n)]);
  const qs: Q[] = [];
  for (const k of spread) {
    qs.push({ op: 'why', query: k }, { op: 'whynot', query: k });
    if (rich) qs.push({ op: 'whyall', query: k });
    const off = k.includes('"') ? k : k.replace(/([(,])[^,()]+\)$/, '$1zz_nowhere)');
    if (off !== k) qs.push({ op: 'why', query: off }, { op: 'whynot', query: off });
  }
  if (base.length) qs.push({ op: 'excise', query: base[Math.floor(base.length / 2)] });
  if (rich) {
    // the edges of each declared tree: taking one out takes rows of the closure with it
    const text = filesText(w.files);
    const edges = [...text.matchAll(/^tree (\w+)\(/gm)].map((m) => m[1]);
    const mine = base.filter((k) => edges.some((e) => k.startsWith(`${e}(`) || k.startsWith(`${e}[`)));
    for (const k of new Set([base[0], base[base.length - 1], mine[0], mine[Math.floor(mine.length / 2)], mine[mine.length - 1]].filter(Boolean))) qs.push({ op: 'excise', query: k });
  }
  return qs;
}

const exciseText = (removed: string[], added: string[]): string => {
  const out = [...removed.map((k) => `- ${k}`), ...added.map((k) => `+ ${k}`)];
  return out.length ? out.join('\n') : '(no change)';
};

function expected(r: Rofl, q: Q, budget?: number): A {
  if (process.env.WHYCHECK_TRACE) process.stderr.write(`whycheck:   ts ${q.op} ${q.query}\n`);
  try {
    // EVERY `[above]` MUST STAND FOR WHAT IT SAYS: the answer expanded by the rule of scripts/why_dag.ts is the tree the
    // engine writes with the DAG off; an answer that does not is made to differ from the other engine's
    const dag = (a: A, tree: () => string): A => { const bad = a.ok ? dagProblem(a.text, tree) : null; return bad === null ? a : { ...a, text: `DAG: ${bad}\n${a.text}` }; };
    if (q.op === 'why' || q.op === 'whyall') {
      const a0 = r.why(q.query, { budget, all: q.op === 'whyall' });
      const cyc = a0.ok && q.op === 'why' ? cycleProblem(r, a0.text) : null;
      const a = cyc === null ? a0 : { ...a0, text: `CYCLE: ${cyc}\n${a0.text}` };
      return dag(a, () => r.why(q.query, { budget, all: q.op === 'whyall', tree: true }).text);
    }
    if (q.op === 'whynot') {
      // the aggregate evaluator's whynot hands back the parser's refusal as its text
      const { holds, text: t } = r.whynot(q.query, { budget, depth: q.depth, nodes: q.nodes });
      return dag({ ok: !/^line \d+: /.test(t), text: t, holds }, () => r.whynot(q.query, { budget, depth: q.depth, nodes: q.nodes, tree: true }).text);
    }
    const x = r.excise(q.query, { budget });
    return x.ok ? { ok: true, text: exciseText(x.removed, x.added) } : { ok: false, text: `error: ${x.error}` };
  } catch (e) { return { ok: false, text: (e as Error).message }; }
}

const heightsOf = new WeakMap<Rofl, Map<string, number>>();

/** NO `[cycle]` OF A PLAIN `why` MAY BE OF A FACT THAT HAS AN ACYCLIC DERIVATION (f_why_can_cite_a_witness_that_rests_on_itself): the
 *  support `why` shows is the firing of least derivation height, which rests only on facts of lower height, so a fact with a height at
 *  at all never closes a cycle. A base fact whose firing rests on itself is shown as its assertion. NOT ASKED: `why all`, which shows the circular firings too; an
 *  answer that walks an undefined atom (`[undefined]`), whose circle runs through a negation and is the answer; a cell's members,
 *  a lattice, subsumption or counting fact (no `<=` line of its own), which list every firing that reaches a value. */
function cycleProblem(r: Rofl, text: string): string | null {
  const memo = heightsOf.get(r) ?? new Map<string, number>();
  heightsOf.set(r, memo);
  const src: DerivationSource = {
    firings: (k) => r.store.witnessesOf(k).map((w): [string, typeof w] => ['', w]),
    base: (k) => r.store.get(k)?.base === true,
    cellHeight: (k) => r.store.cellOf(k)?.height ?? 0,
  };
  if (text.includes('[undefined]')) return null;
  for (const m of text.matchAll(/^ *(\S.*?) \[cycle\]$/gm)) {
    if (!text.includes(`${m[1]}  <= `)) continue;
    derivationHeights(src, [m[1]], memo);
    if (memo.has(m[1])) return `${m[1]} [cycle], and it has a derivation of height ${memo.get(m[1])}`;
  }
  return null;
}

/** THE ORACLE OF A RETRACTION: the world a retraction leaves is the world
 *  without the fact. The same files with the retracted fact's line taken out,
 *  evaluated from nothing (the retraction is no part of it): every question
 *  is answered by it as by the retracted session. A fact that is not a line
 *  of its own in a file is a world this oracle cannot build, and says so. */
function withoutRetracted(w: World): { r: Rofl; w: World } | string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whycheck-fresh-'));
  const gone = new Set<string>();
  const files = w.files.map((f, i) => {
    const text = fs.readFileSync(f, 'utf8').split('\n').filter((l) => {
      const hit = (w.retract ?? []).find((x) => l.trim() === `${x}.`);
      if (hit) gone.add(hit);
      return !hit;
    }).join('\n');
    const out = path.join(dir, `${i}-${path.basename(f)}`);
    fs.writeFileSync(out, text);
    return out;
  });
  const lost = (w.retract ?? []).filter((x) => !gone.has(x));
  if (lost.length) return `no line of its own for ${lost.join(', ')}`;
  const fresh = { ...w, files, retract: [] };
  const { r, failed } = togetherWorld(fresh, files);
  return failed !== null ? `the world without the fact does not evaluate: ${failed}` : { r, w: fresh };
}

/** A refusal by the reference's parser: compared by kind, not by text. */
const parseRefusal = (a: A): boolean => !a.ok && /^(error: )?line \d+: /.test(a.text);

const walls = (w: World): Walls => ({ ...(w.space ? { space: w.space } : {}), ...(w.retain !== undefined ? { retainTicks: w.retain } : {}),
  ...(w.strata ? { mode: 'strata' as const } : {}), ...(w.deltaFirst ? { deltaFirst: true } : {}) });

/** The protocol cannot feed a world below or answer explain requests; such a
 *  world is asked of rofl-load alone. */
const servable = (w: World): boolean => !w.explain && belowFiles(w.files).length === 0;

async function served(port: RoflPort, w: World, qs: Q[]): Promise<A[]> {
  const s = await port.fresh(w.budget, walls(w));
  try {
    for (const f of [BOOT, ...w.files]) await s.loadFile(f);
    if (!w.ticks || w.retract?.length) { await s.evaluate(); for (const f of w.retract ?? []) await s.retract(f); }
    for (let i = 0; i < (w.ticks ?? 0); i++) await s.tick();
    const out: A[] = [];
    for (const q of qs) {
      if (process.env.WHYCHECK_TRACE) process.stderr.write(`whycheck:   serve ${q.op} ${q.query}\n`);
      try {
        if (q.op === 'why' || q.op === 'whyall') out.push({ ok: true, text: await s.why(q.query, q.op === 'whyall' ? { all: true } : {}) });
        else if (q.op === 'whynot') { const x = await s.whynot(q.query, { depth: q.depth, nodes: q.nodes }); out.push({ ok: true, text: x.text, holds: x.holds }); }
        else { const x = await s.excise(q.query); out.push({ ok: true, text: exciseText(x.removed, x.added) }); }
      } catch (e) { out.push({ ok: false, text: q.op === 'excise' ? `error: ${(e as Error).message}` : (e as Error).message }); }
    }
    return out;
  } finally { await s.close(); }
}

/** The set of whynot bounds a question is asked under; rofl-load takes one
 *  per run. */
const boundsOf = (q: Q): string => (q.depth !== undefined || q.nodes !== undefined ? `${q.depth}/${q.nodes}` : '');

/** The rofl-load run a question is asked in: one per set of whynot bounds,
 *  and a run of its own for each question the reference's parser refuses —
 *  its text is compared by kind only, so the run's exit code (4) is the one
 *  thing that says rofl-load refused it rather than answered. */
const groupOf = (qs: Q[], want: A[], i: number): string => (parseRefusal(want[i]) ? `parse#${i}` : boundsOf(qs[i]));

/** The flags that make rofl-load build the world as `npm test` does. */
const loadOpts = (w: World): string[] => [...(w.ticks ? ['--ticks', String(w.ticks)] : []), ...(w.budget ? ['--budget', String(w.budget)] : []),
  ...(w.space ? ['--space', String(w.space)] : []), ...(w.strata ? ['--strata'] : []), ...(w.deltaFirst ? ['--delta-first'] : []),
  ...(w.retain !== undefined ? ['--retain', String(w.retain)] : []), ...(w.retract ?? []).flatMap((f) => ['--retract', f]), ...(w.explain ? ['--explain'] : []),
  ...belowFiles(w.files).flatMap((f) => ['--below', f])];

/** One rofl-load run per group, the flags in question order; the answers
 *  come back in that order, and each run's exit code says whether any of its
 *  questions was refused. */
function cli(w: World, qs: Q[], want: A[], env: Record<string, string> = {}): { texts: (string | undefined)[]; exits: Map<string, number>; problems: string[] } {
  const texts: (string | undefined)[] = new Array(qs.length).fill(undefined);
  const exits = new Map<string, number>(), problems: string[] = [];
  const groups = new Map<string, number[]>();
  qs.forEach((_, i) => { const g = groupOf(qs, want, i); groups.set(g, [...(groups.get(g) ?? []), i]); });
  const opts = loadOpts(w);
  const flag = (op: Op) => (op === 'whyall' ? '--why-all' : `--${op}`);
  for (const [g, idx] of groups) {
    const b = boundsOf(qs[idx[0]]);
    const bounds = b ? ['--depth', b.split('/')[0], '--nodes', b.split('/')[1]] : [];
    const args = [...opts, ...bounds, ...idx.flatMap((i) => [flag(qs[i].op), qs[i].query]), BOOT, ...w.files];
    const p = spawnSync(LOAD, args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, env: { ...process.env, ...env } });
    if (p.status !== 0 && p.status !== 4) { problems.push(`rofl-load exited ${p.status}${g ? ` (run ${g})` : ''}: ${p.stderr.trim().split('\n')[0]}`); continue; }
    exits.set(g, p.status);
    const got = p.stdout.replace(/\n\n$/, '').split('\n\n');
    idx.forEach((i, j) => { texts[i] = got[j]; });
  }
  return { texts, exits, problems };
}

function firstDiff(a: string, b: string): string {
  const x = a.split('\n'); const y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) return `line ${i + 1}: ts ${JSON.stringify(x[i])} / rust ${JSON.stringify(y[i])}`;
  }
  return '';
}

type Report = { asked: number; bad: string[]; loadOnly: string[]; walled: string[] };

/** A world that keeps no witness and declares a tree with a closure: the Rust engine answers the closure from the tree and
 *  stores none of its rows, which the reference does not do and TypeScript cannot be held to. Its oracle is the same world on
 *  Rust with the closure STORED (ROFL_NO_VCLOSURE: the declaration's virtual path off, the kernel's rows as in a world that
 *  keeps provenance): every why, why all, whynot and excise, and the canonical state, must be the stored world's byte for byte,
 *  and rofl-serve must say what rofl-load says. The same files without the seal are asked against the reference. */
const fromTree = (w: World): boolean => treeSealed(placed(w).files);
const declared = (w: World): boolean => treeDeclared(placed(w).files);

/** EVERY WORLD THAT DECLARES A TREE'S CLOSURE, sealed or keeping its witnesses, is held to the same world with the closure stored
 *  (ROFL_NO_VCLOSURE): its canonical state, and each question (twelve derived facts spread over the store, why, why all and whynot
 *  of each and of a fact that does not hold, and the excise of the edges of each declared tree), byte for byte. A world that keeps
 *  its witnesses is asked against the reference besides. */
function storedOracle(rep: Report, kept: World, qs: Q[], texts: (string | undefined)[]): void {
  const a = stateOf(kept, {}), b = stateOf(kept, { ROFL_NO_VCLOSURE: '1' });
  const v = closureVerdict(kept, a, b);
  if (v !== null) { rep.bad.push(`${kept.name}: ${v}`); return; }
  if (kept.closureUnwalled) { rep.walled.push(kept.name); return; }
  const stored = cli(kept, qs, qs.map(() => ({ ok: true, text: '' })), { ROFL_NO_VCLOSURE: '1' });
  for (const pr of stored.problems) rep.bad.push(`${kept.name} stored load: ${pr}`);
  qs.forEach((q, i) => {
    if (texts[i] !== undefined && stored.texts[i] !== undefined && texts[i] !== stored.texts[i])
      rep.bad.push(`${kept.name} from the tree vs stored ${q.op} ${JSON.stringify(q.query)}: ${firstDiff(stored.texts[i]!, texts[i]!)}`);
  });
}

/** The canonical state rofl-load prints for the world, with the closure answered from its tree or stored. */
function stateOf(w: World, env: Record<string, string>): string {
  const p = spawnSync(LOAD, [...loadOpts(w), '--state', BOOT, ...w.files], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, env: { ...process.env, ...env } });
  return p.status === 0 ? p.stdout : `rofl-load exited ${p.status}: ${p.stderr.trim().split('\n')[0]}`;
}

/** WHAT `asks` SAYS OF A WORLD, in both engines' words: each diagnostic about the cone, rofl-load's against the reference's. */
function asksSaid(r: Rofl, w: World): string | null {
  if (!w.files.some((f) => f.endsWith('.rofl') && /^asks\(/m.test(fs.readFileSync(f, 'utf8')))) return null;
  const p = spawnSync(LOAD, [...loadOpts(w), '--state', BOOT, ...w.files], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
  const rust = [...new Set(p.stderr.split('\n').filter((l) => l.startsWith('diag: asks: ')).map((l) => l.slice(6)))].sort();
  const ts = [...new Set(r.diagnostics.filter((d) => d.startsWith('asks: ')))].sort();
  return rust.join('\n') === ts.join('\n') ? null : `asks says ${JSON.stringify(ts)} in the reference and ${JSON.stringify(rust)} in rofl-load`;
}

async function check(ws: World[], firstName: string): Promise<Report> {
  const port = await RoflPort.start();
  const rep: Report = { asked: 0, bad: [], loadOnly: [], walled: [] };
  try {
    for (const w0 of ws) {
      if (process.env.WHYCHECK_TRACE) process.stderr.write(`whycheck: ${w0.name}\n`);
      if (w0.oneEngine === 'rust' || fromTree(w0)) {
        // the reference is not run on a Rust-only world; rofl-serve and rofl-load must still agree
        const w = placed(w0);
        const kept = { ...w, files: w.files.filter((f) => !expectedRefusal(f) && unreadOf(f).length === 0) };
        const qs = rustQuestions(kept, declared(w0));
        const got = servable(kept) ? await served(port, kept, qs) : null;
        if (!got) rep.loadOnly.push(kept.name);
        const { texts, problems } = cli(kept, qs, qs.map(() => ({ ok: true, text: '' })));
        for (const pr of problems) rep.bad.push(`${kept.name} load: ${pr}`);
        qs.forEach((q, i) => {
          if (got && texts[i] !== undefined && texts[i] !== got[i].text) rep.bad.push(`${kept.name} serve vs load ${q.op} ${JSON.stringify(q.query)}: ${firstDiff(got[i].text, texts[i]!)}`);
        });
        if (declared(w0)) storedOracle(rep, kept, qs, texts);
        rep.asked += qs.length;
        continue;
      }
      let built;
      try { built = reference(w0); } catch (e) { rep.bad.push(`${w0.name}: ${(e as Error).message}`); continue; }
      const { r, w } = built;
      // the budget a question may spend is the world's, or rofl-load's default
      // (an excise evaluates its counterfactual world under it)
      const budget = w.budget ?? 200_000_000;
      const o = own.get(w.name);
      const qs = [...questions(r, budget, w.name === firstName, o?.excise ?? true), ...(o?.qs ?? []), ...(ASKED[w.name] ?? [])];
      const want = qs.map((q) => expected(r, q, budget));
      if (w.retract?.length) {
        const f = withoutRetracted(w);
        if (typeof f === 'string') rep.bad.push(`${w.name}: ${f}`);
        else qs.forEach((q, i) => {
          const d = expected(f.r, q, budget);
          if (parseRefusal(want[i])) return;
          if (d.ok !== want[i].ok || d.text !== want[i].text || d.holds !== want[i].holds)
            rep.bad.push(`${w.name} retracted session vs a world without the fact, ${q.op} ${JSON.stringify(q.query)}: ${firstDiff(d.text, want[i].text)}`);
        });
      }
      const same = (q: Q, a: A, b: A | undefined): string | null => {
        if (b === undefined) return 'no answer';
        if (parseRefusal(a)) return b.ok ? `the reference refuses it (${a.text}) and this answered` : null;
        if (a.ok !== b.ok) return `the reference ${a.ok ? 'answers' : 'refuses'} and this ${b.ok ? 'answers' : 'refuses'}: ${firstDiff(a.text, b.text)}`;
        if (a.ok && a.holds !== undefined && b.holds !== undefined && a.holds !== b.holds) return `the reference says holds=${a.holds} and this holds=${b.holds}`;
        return a.text === b.text ? null : firstDiff(a.text, b.text);
      };
      if (servable(w)) {
        const got = await served(port, w, qs);
        qs.forEach((q, i) => { const d = same(q, want[i], got[i]); if (d) rep.bad.push(`${w.name} serve ${q.op} ${JSON.stringify(q.query)}${q.depth !== undefined ? ` depth=${q.depth} nodes=${q.nodes}` : ''}: ${d}`); });
      } else rep.loadOnly.push(w.name);
      const { texts, exits, problems } = cli(w, qs, want);
      for (const p of problems) rep.bad.push(`${w.name} load: ${p}`);
      const said = asksSaid(r, w);
      if (said) rep.bad.push(`${w.name}: ${said}`);
      qs.forEach((q, i) => {
        const at = `${w.name} load ${q.op} ${JSON.stringify(q.query)}${q.depth !== undefined ? ` depth=${q.depth} nodes=${q.nodes}` : ''}`;
        // a run that exited badly is reported once, above; any other missing answer is a fault of its own
        if (texts[i] === undefined) { if (exits.has(groupOf(qs, want, i))) rep.bad.push(`${at}: no answer`); return; }
        if (parseRefusal(want[i])) return;
        if (texts[i] !== want[i].text) rep.bad.push(`${at}: ${firstDiff(want[i].text, texts[i]!)}`);
      });
      // exit 4 exactly when some question in the run was refused; a run of a
      // question the parser refuses must exit 4, or rofl-load answered it
      for (const [g, code] of exits) {
        const refused = qs.some((_, i) => !want[i].ok && groupOf(qs, want, i) === g);
        if ((code === 4) !== refused) rep.bad.push(`${w.name} load exit ${code}${g.startsWith('parse#') ? ` (${JSON.stringify(qs[Number(g.slice(6))].query)} alone)` : g ? ` (bounds ${g})` : ''}, and the reference ${refused ? 'refused a question' : 'refused none'}`);
      }
      rep.asked += qs.length;
      if (declared(w0)) {
        // the reference stores the closure; the same world on Rust with it stored is asked the questions of a tree besides
        const kept = { ...w, files: w.files.filter((f) => !expectedRefusal(f) && unreadOf(f).length === 0) };
        const tq = rustQuestions(kept, true);
        storedOracle(rep, kept, tq, cli(kept, tq, tq.map(() => ({ ok: true, text: '' }))).texts);
        rep.asked += tq.length;
      }
    }
  } finally { await port.stop(); }
  return rep;
}

const argv = process.argv.slice(2);
const shard = argv.indexOf('--shard');
const only = argv.filter((a, i) => !a.startsWith('--') && (shard < 0 || i !== shard + 1));
const all = [...worlds(), ...OWN.map((o) => o.w)].filter((w) => !only.length || only.includes(w.name));
const asked = all.filter((w) => w.oneEngine !== 'ts');
const firstName = asked.find((w) => w.oneEngine !== 'rust')?.name ?? '';

if (shard >= 0) {
  const [i, n] = argv[shard + 1].split('/').map(Number);
  const rep = await check(asked.filter((_, k) => k % n === i), firstName);
  process.stdout.write(JSON.stringify(rep));
  process.exit(0);
}

const t0 = Date.now();
const jobs = Math.max(1, Math.min(asked.length, Number(process.env.ROFL_JOBS) || Math.min(8, os.availableParallelism())));
const self = new URL(import.meta.url).pathname;
const reps = await Promise.all(Array.from({ length: jobs }, (_, i) => new Promise<Report>((ok, no) => {
  const c = spawn(process.execPath, ['--experimental-strip-types', self, '--shard', `${i}/${jobs}`, ...only], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.on('exit', (code) => {
    try { ok(JSON.parse(out)); } catch { ok({ asked: 0, bad: [`shard ${i}/${jobs} died (exit ${code}); WHYCHECK_TRACE=1 names its worlds`], loadOnly: [], walled: [] }); }
  });
  c.on('error', no);
})));
const rustOnly = asked.filter((w) => w.oneEngine === 'rust' || fromTree(w)).map((w) => w.name);
const bad = reps.flatMap((r) => r.bad);
const n = reps.reduce((s, r) => s + r.asked, 0);
const loadOnly = reps.flatMap((r) => r.loadOnly).sort();
const walled = reps.flatMap((r) => r.walled).sort();
for (const b of bad) console.log(`FAIL ${b}`);
console.log(`\n${n} questions over ${asked.length} worlds, each to rofl-serve and rofl-load, ${bad.length} differ from src/api.ts (Rust-only worlds: from each other)`
  + `, ${((Date.now() - t0) / 1000).toFixed(1)} s over ${jobs} processes`
  + `\nasked of rofl-load alone (a world below, or explain requests): ${loadOnly.length}`
  + `\nasked of Rust only, serve against load (no reference run): ${rustOnly.length} ${rustOnly.join(' ') || 'none'}`
  + `\nnot held to the world with its closure stored (it meets a wall stored that the tree does not, declared closure_unwalled): ${walled.join(' ') || 'none'}`
  + `\nnot asked (one engine, TypeScript): ${all.filter((w) => w.oneEngine === 'ts').map((w) => w.name).join(' ') || 'none'}`);
process.exit(bad.length === 0 ? 0 : 1);
