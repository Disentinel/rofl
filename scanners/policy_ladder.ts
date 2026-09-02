// scanners/policy_ladder.ts — the ladder measured in RELATIONS, twice, and
// checked against the kernel's own answers.
//
// `scanners/engine_split.ts` measures the evaluator in LINE-RANGE BLOCKS. That
// is the right unit for its question — a rewrite carries lines — and the wrong
// one for "what stands on what": a block can hold two policies and one policy
// can span two blocks. Here the unit is the RELATION, and the ladder is not
// measured by a scanner at all. `rules/kernel-policy.rofl` states tiers 1-3 as
// rules over reflection the kernel already emits; the kernel then stratifies
// them, and `boot.rofl`'s own `dep/2` gives the dependency graph.
//
// THREE READINGS OF THE SAME ORDER, and they do not measure the same thing:
//
//   A  the block tier from engine_split.ts — data flow between line ranges
//   B  `stratum/2`, read from the store — how deep the NEGATIONS nest
//   C  the depth of the relation in `dep/2`, over the condensation of its
//      strongly connected components — data flow between RELATIONS
//
// B is the kernel's own answer to a different question: strata order negation
// phases, and a positive dependency does not raise a stratum. C is the
// relation-unit analogue of A. Comparing A with C tests the block unit;
// reporting B beside them says what the kernel actually needs to know.
//
// AND AN ANSWER CHECK, because an order that agrees while the answers differ
// is worthless: every relation the pack derives is compared against the value
// the host computed for the same store, over the corpus. `--break` runs the
// same comparison with one rule deliberately wrong, so the count is known to be
// capable of moving.
//
//   node --experimental-strip-types scanners/policy_ladder.ts [--break]

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { peelRounds, type Peel } from '../src/rounds.ts';
import { BLOCKS } from './engine_split.ts';
import { graph, inducedEdges, tiers, BEFORE_A } from './bootstrap_dag.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const BOOT = read('boot.rofl');
export const PACK = read('rules/kernel-policy.rofl');
const BUDGET = 4_000_000;

/** The pack with one rule deliberately wrong: `mono_rule` stops excluding the
 *  rules tier 0 called unsafe. Everything downstream of it — the stratum cone,
 *  the late set — then answers for a different set of rules. */
export const BROKEN = PACK.replace(
  'mono_rule(R)         :- executable(R), not has_neg_rule(R), not unsafe(R).',
  'mono_rule(R)         :- executable(R), not has_neg_rule(R).');

/** Which block of engine_split.ts each policy relation came out of. The line
 *  range is looked up from BLOCKS by anchor, never typed here: this file must
 *  not carry a number that goes stale when the kernel moves. */
export const FROM_BLOCK: Record<string, string> = {
  blocked_head: 'prepare(): void {',
  executable: 'prepare(): void {',
  has_neg_rule: 'private classify(r: DRule): ERule {',
  mono_rule: 'private stratumCone(mono: ERule[]): Set<string> {',
  stratum_cone: 'private stratumCone(mono: ERule[]): Set<string> {',
  late_rule: 'private stratumCone(mono: ERule[]): Set<string> {',
  demand_rel: 'this.rules = kept;',
  safe_rule: '// A relation served from the previous evaluation',
  neg_rule: '// A relation served from the previous evaluation',
  program_negates: '// A relation served from the previous evaluation',
  wf_declared: 'private runWellFounded(): void {',
  wf_inadmissible: 'private runWellFounded(): void {',
};

export const POLICY_RELS = Object.keys(FROM_BLOCK);

export interface World { r: Rofl; ev: Evaluation; }

/** boot + the policy pack + a program, with tier 0's verdict injected as the
 *  input it is. The pack is loaded INTO the store it analyses, so its own rules
 *  are part of the rule set — and the host answer is taken from the same store,
 *  so both sides see exactly the same program. */
export function world(files: string[], pack = PACK, extra = ''): World {
  const r = new Rofl();
  const must = (res: { ok: boolean; diagnostics: string[] }, what: string) => {
    if (!res.ok) throw new Error(`${what}: ${res.diagnostics.slice(0, 2).join('; ')}`);
  };
  must(r.load(BOOT), 'boot.rofl');
  must(r.load(pack), 'rules/kernel-policy.rofl');
  for (const f of files) must(r.load(read(f), { who: 'tester' }), f);
  if (extra) must(r.load(extra, { who: 'tester' }), 'extra');
  // tier 0's answer, which the reflection cannot express: injected once, from
  // the host, before the pack is evaluated
  const pre = new Evaluation(r.store, { budget: BUDGET });
  const unsafe = pre.rules.filter((x) => !x.safe).map((x) => `unsafe(${x.id}).`);
  if (unsafe.length > 0) must(r.load(unsafe.join('\n') + '\n'), 'unsafe facts');
  r.evaluate(BUDGET);
  return { r, ev: new Evaluation(r.store, { budget: BUDGET }) };
}

// ---------------------------------------------------------------------------
// the answer check

const col = (r: Rofl, lit: string, v: string): Set<string> =>
  new Set(r.query(lit).rows.map((x) => x.bindings[v]));

/** An independent reimplementation of src/engine.ts:509-521, from the same
 *  input the kernel hands it. The kernel's own set is private. */
function coneMirror(mono: { id: string; posRels: string[]; clause: { head: { rel: string } } }[]): Set<string> {
  const rels = new Set<string>(['stratum']);
  for (;;) {
    let grew = false;
    for (const r of mono) {
      if (rels.has(r.clause.head.rel)) continue;
      if (r.posRels.some((x) => rels.has(x))) { rels.add(r.clause.head.rel); grew = true; }
    }
    if (!grew) break;
  }
  return new Set(mono.filter((r) => rels.has(r.clause.head.rel)).map((r) => r.id));
}

export interface Check { rel: string; host: number; rules: number; disagree: number; }

export function answerCheck(w: World): Check[] {
  const { r, ev } = w;
  const mono = ev.rules.filter((x) => x.safe && !x.hasNeg);
  const pairs: [string, Set<string>, Set<string>][] = [
    ['executable', new Set(ev.rules.map((x) => x.id)), col(r, 'executable(R)', 'R')],
    ['safe_rule', new Set(ev.rules.filter((x) => x.safe).map((x) => x.id)), col(r, 'safe_rule(R)', 'R')],
    ['neg_rule', new Set(ev.rules.filter((x) => x.safe && x.hasNeg).map((x) => x.id)), col(r, 'neg_rule(R)', 'R')],
    ['mono_rule', new Set(mono.map((x) => x.id)), col(r, 'mono_rule(R)', 'R')],
    ['demand_rel', new Set(ev.demandRels.keys()), col(r, 'demand_rel(Rel)', 'Rel')],
    ['late_rule', coneMirror(mono), col(r, 'late_rule(R)', 'R')],
    ['program_negates', new Set(ev.rules.some((x) => x.safe && x.hasNeg) ? ['yes'] : []),
      col(r, 'program_negates(X)', 'X')],
  ];
  return pairs.map(([rel, host, rules]) => ({
    rel, host: host.size, rules: rules.size,
    disagree: [...host].filter((x) => !rules.has(x)).length
      + [...rules].filter((x) => !host.has(x)).length,
  }));
}

// ---------------------------------------------------------------------------
// the three readings of the order

/** B: the kernel's own answer, read from the store. */
/** The peel this store's rules schedule by — the schedule itself, not a
 *  relation describing it. boot.rofl used to derive `stratum/2`, `dep/2` and
 *  `reach/2` for exactly the two readings below; those ten rules were deleted
 *  when the evaluator started peeling its schedule off the decoded rules, so
 *  both readings now come off the peel. Same graph, same numbers up to the
 *  one shift a wave makes over a negation depth. */
function peelOf(r: Rofl): Peel {
  return peelRounds(new Evaluation(r.store, {}).rules);
}

export function kernelStrata(r: Rofl): Map<string, number> {
  return new Map(peelOf(r).round);
}

/** C: depth in `dep/2`, over the CONDENSATION of its strongly connected
 *  components — mutual recursion inside one rung is legal and must not be
 *  mistaken for a longer ladder. */
export function relationDepth(r: Rofl): { depth: Map<string, number>; cyclic: string[][] } {
  const peel = peelOf(r);
  const edges: (readonly [string, string])[] = [];
  for (const side of [peel.deps.pos, peel.deps.neg]) {
    for (const [a, bs] of side) for (const b of bs) edges.push([a, b] as const);
  }
  const nodes = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const [a, b] of edges) {
    nodes.add(a); nodes.add(b);
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  }
  // Tarjan
  const idx = new Map<string, number>(); const low = new Map<string, number>();
  const on = new Set<string>(); const st: string[] = []; const comps: string[][] = [];
  let c = 0;
  const strong = (v: string): void => {
    idx.set(v, c); low.set(v, c); c++; st.push(v); on.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      for (;;) { const w = st.pop()!; on.delete(w); comp.push(w); if (w === v) break; }
      comps.push(comp);
    }
  };
  for (const n of nodes) if (!idx.has(n)) strong(n);
  const compOf = new Map<string, number>();
  comps.forEach((comp, i) => { for (const n of comp) compOf.set(n, i); });
  const cadj = new Map<number, Set<number>>();
  for (const [a, b] of edges) {
    const ca = compOf.get(a)!; const cb = compOf.get(b)!;
    if (ca === cb) continue;
    if (!cadj.has(ca)) cadj.set(ca, new Set());
    cadj.get(ca)!.add(cb);
  }
  const cdepth = new Map<number, number>();
  const visit = (i: number, seen: Set<number>): number => {
    if (cdepth.has(i)) return cdepth.get(i)!;
    if (seen.has(i)) return 0;
    seen.add(i);
    let d = 0;
    for (const j of cadj.get(i) ?? []) d = Math.max(d, visit(j, seen) + 1);
    cdepth.set(i, d);
    return d;
  };
  const depth = new Map<string, number>();
  for (const n of nodes) depth.set(n, visit(compOf.get(n)!, new Set()));
  return { depth, cyclic: comps.filter((x) => x.length > 1) };
}

/** A: the block tier, from the block data-flow ladder, resolved through the
 *  anchors so no line number is typed here.
 *
 *  The label is the block's NAME (2026-09-01). It used to be `${from}-${to}`,
 *  which put a line range into every caller's assertions and made eleven
 *  inserted comment lines in src/engine.ts a red test. The range is still
 *  printed in the report, where it is an output; it is no longer a key. */
export function blockTier(): Map<string, { block: string; range: string; tier: number }> {
  const layers = tiers(BEFORE_A, inducedEdges(graph(), BEFORE_A));
  const tierOf = new Map<string, number>();
  layers.forEach((layer, i) => { for (const b of layer) tierOf.set(b.anchor, i); });
  const out = new Map<string, { block: string; range: string; tier: number }>();
  for (const [rel, anchor] of Object.entries(FROM_BLOCK)) {
    const b = BLOCKS.find((x) => x.anchor === anchor);
    if (!b) throw new Error(`no block carries the anchor for ${rel}: ${anchor}`);
    out.set(rel, { block: b.id, range: `${b.from}-${b.to}`, tier: tierOf.get(anchor) ?? -1 });
  }
  return out;
}

// ---------------------------------------------------------------------------

const CORPUS = ['examples/sensors.rofl', 'examples/tm.rofl', 'examples/counter.rofl',
  'examples/wtf/wtf.rofl', 'examples/moot/moot.rofl', 'examples/loot/loot.rofl',
  'examples/npc/npc.rofl', 'examples/goof/goof.rofl'];

export function report(broken = false): string[] {
  const out: string[] = [];
  const say = (s = '') => out.push(s);
  const w = world(['examples/sensors.rofl'], broken ? BROKEN : PACK);

  say(`-- THE ORDER, three readings ------------------------------------------`);
  say(`  ${'relation'.padEnd(16)} ${'A block (tier)'.padEnd(22)} ${'B stratum'.padEnd(10)} C relation depth`);
  const blocks = blockTier();
  const strata = kernelStrata(w.r);
  const { depth, cyclic } = relationDepth(w.r);
  for (const rel of POLICY_RELS) {
    const t = blocks.get(rel)!;
    say(`  ${rel.padEnd(16)} ${`${t.block} (tier ${t.tier})`.padEnd(22)} ` +
      `${String(strata.get(rel) ?? '-').padEnd(10)} ${depth.get(rel) ?? '-'}`);
  }
  const inPolicy = cyclic.filter((c) => c.some((x) => POLICY_RELS.includes(x)));
  say(`  mutually recursive components among the policy relations: ` +
    (inPolicy.length === 0 ? 'none' : inPolicy.map((c) => c.join('+')).join(', ')));
  say('');

  say(`-- THE ANSWER, against the host --------------------------------------`);
  let total = 0; let rows = 0;
  const per = new Map<string, number>();
  for (const f of CORPUS) {
    const ww = world([f], broken ? BROKEN : PACK);
    for (const c of answerCheck(ww)) {
      total += c.disagree; rows += 1;
      per.set(c.rel, (per.get(c.rel) ?? 0) + c.disagree);
    }
  }
  const sample = answerCheck(w);
  say(`  ${'relation'.padEnd(16)} host  rules   disagreements over ${CORPUS.length} programs`);
  for (const c of sample) {
    say(`  ${c.rel.padEnd(16)} ${String(c.host).padStart(4)}  ${String(c.rules).padStart(5)}   ${per.get(c.rel) ?? 0}`);
  }
  say(`  ${rows} comparisons, ${total} disagreements${broken ? '  (pack deliberately broken)' : ''}`);
  return out;
}

function main(): void {
  const broken = process.argv.includes('--break');
  for (const l of report(broken)) console.log(l);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(path.resolve(new URL(import.meta.url).pathname))) {
  main();
}
