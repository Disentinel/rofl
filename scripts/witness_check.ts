// witness_check.ts — a finding's premise, made runnable, IN A NAMED WORLD.
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
//   witness(F, "stratum(R, N)", 0).                  -- exactly this many rows
//   witness_atleast(F, "conclusion_lit(R, K, L)", 1).
//
// AND IT MEASURES A CONSEQUENCE, NEVER THE CODE. A file hash flips on a
// reformat and says nothing; a line number flips on any edit above it — this
// repository is currently paying eleven test failures per kernel edit for
// exactly that mistake. A query over the store flips when the CLAIM becomes
// false, and not before.
//
// ---------------------------------------------------------------------------
// A WITNESS NOW SAYS WHICH WORLD IT IS ABOUT, 2026-09-09 (w_note_is_not_evidence)
//
// This file used to load `boot.rofl` plus the findings ledger and NOTHING ELSE,
// and every witness was asked of that one store. f_a_witness_has_no_world
// recorded the gap on 2026-09-01 and deliberately left it: naming the world is
// a change to the witness FORMAT, which is a decision rather than a repair.
//
// The decision, along the line that finding itself names — NAME THE WORLD,
// rather than load everything into one store, because merging worlds changes
// what a query MEANS rather than widening it:
//
//   witness_in(Id, World, "ast_node[code](N, K, F, L)", 42).
//   witness_in_atleast(Id, World, Query, 1).
//   witness_absent(Id, World, Query, Control).
//
// `witness/3` and `witness_atleast/3` are unchanged and mean `w_ledger`, so
// every witness written before today is asked of exactly the store it was asked
// of before. The worlds are FACTS (facts/worlds.rofl, rules/worlds.rofl), each
// stating the packs it loads AND the packs it refuses.
//
// WHAT NAMING THE WORLD IMMEDIATELY FOUND, and it was in this ledger:
// `witness(f_the_matrix_collapses_threefold_and_the_tail_does_not, "layer(L)", 0)`
// stands for the sentence "no semantic layer is declared yet". Four layers have
// been declared since. The witness stayed GREEN because `edb(layer)` was added
// to the ledger to make the query populatable at all — so the checker asked a
// store that has no layers in it whether it had any layers. That is a witness
// with the interface of a measurement and the content of a decoration, which is
// the exact thing this file exists to refuse.
//
// AND WHAT `unpopulatable` CANNOT SEE. It catches a misspelt relation, a wrong
// arity and a wrong ledger. It is blind to a misspelt CONSTANT, which is the
// only moving part of an absence witness. Measured in the corpus world:
//
//   ast_name[code](N, "twin")                 5      ast_name[code](N, twin)   0
//   ast_node[code](N, if_statement, F, L)    16      ast_node[code](N, "if_statement", F, L)  0
//
// The two relations want OPPOSITE lexical forms and neither wrong one errors.
// So `witness_absent` carries a CONTROL: a literal of the same shape that must
// return rows. Zero with a live control is a measurement; zero on its own is a
// typo that reads as satisfied.
//
//   node --experimental-strip-types scripts/witness_check.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// A ROFL string comes back QUOTED AND ESCAPED, and a witness query is the first
// thing here that ever needed a quote INSIDE one: `ast_name[code](N, "require")`
// is written `"...\"require\"..."` in the ledger. Stripping the outer pair and
// stopping - which is what this did until 2026-09-09 - hands the parser a
// literal backslash and the witness reads BROKEN for a reason that has nothing
// to do with the claim.
const str = (t: any) => (typeof t === 'string'
  ? t.replace(/^"|"$/g, '').replace(/\\([\\"])/g, '$1')
  : String(t));

/** The packs that carry the map of worlds itself. Loaded to find out what a
 *  world IS; every other pack list comes out of the map. */
export const MAP_PACKS = ['boot.rofl', 'rules/worlds.rofl', 'facts/worlds.rofl'];

export interface WorldSpec {
  name: string;
  /** every .rofl this world loads, `boot.rofl` implicit and first */
  packs: string[];
  /** every pack in the closure this world deliberately does NOT load */
  omits: string[];
  /** logical name -> file on disk, scanned in and asserted after the packs */
  corpus: [string, string][];
}

function rofl(files: string[]): any {
  const r = new Rofl();
  // ONE LOAD, RULES BEFORE FACTS. `r.load()` RE-EVALUATES, so N loads run the
  // fixpoint N times to produce one answer; and with an empty store the rule
  // load is nearly free, which leaves a single real fixpoint at `evaluate`.
  // test/js-corpus-world.ts measured this at 16.9 s -> 10.0 s and compared
  // fifteen relations byte for byte across the change.
  const order = (f: string) => (f === 'boot.rofl' ? 0 : f.startsWith('rules/') ? 1 : 2);
  const sorted = [...files].sort((a, b) => order(a) - order(b) || (a < b ? -1 : 1));
  const res = r.load(sorted.map(read).join('\n'), { budget: 50_000_000 });
  if (!res.ok) { console.error(`world: ${sorted.join(', ')}: ${res.diagnostics[0]}`); process.exit(1); }
  return r;
}

/** the map of worlds, as the ledger declares it */
export function worldMap(): Map<string, WorldSpec> {
  const r = rofl(MAP_PACKS);
  r.evaluate(50_000_000);
  const rows = (q: string) => r.query(q).rows.map((x: any) => x.bindings);
  const out = new Map<string, WorldSpec>();
  for (const b of rows('world(W)'))
    out.set(String(b.W), { name: String(b.W), packs: [], omits: [], corpus: [] });
  for (const b of rows('world_pack(W, F)')) out.get(String(b.W))?.packs.push(str(b.F));
  for (const b of rows('world_omits(W, F)')) out.get(String(b.W))?.omits.push(str(b.F));
  for (const b of rows('world_corpus(W, L, D)'))
    out.get(String(b.W))?.corpus.push([str(b.L), str(b.D)]);
  const one = (q: string, v: string) => {
    const rs = rows(q);
    if (rs.length !== 1) { console.error(`facts/worlds.rofl must declare exactly one ${q}`); process.exit(1); }
    return String(rs[0][v]);
  };
  (out as any).defaultWorld = one('witness_default_world(W)', 'W');
  (out as any).indexWorld = one('witness_index(W)', 'W');
  return out;
}

/** build one named world: its packs, then its corpus scanned in, then evaluate */
export function build(spec: WorldSpec): any {
  const r = rofl(['boot.rofl', ...spec.packs]);
  for (const [logical, disk] of spec.corpus) {
    const res = r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
    if (!res.ok) { console.error(`${spec.name}: ${logical} REJECTED: ${res.diagnostics[0]}`); process.exit(1); }
  }
  r.evaluate(50_000_000);
  return r;
}

/** THE WORLD THE CHECKER READS FROM — kept as `world()` because
 *  test/witness-check.test.ts and anything else importing it wants "the store
 *  the witness list lives in", which is now the index rather than the ledger. */
export function world(): any {
  const map = worldMap();
  const idx = (map as any).indexWorld as string;
  const spec = map.get(idx);
  if (!spec) { console.error(`witness_index names ${idx}, which no world declares`); process.exit(1); }
  return build(spec);
}

export interface W {
  id: string;
  /** the world this premise is about */
  world: string;
  q: string;
  want: number;
  floor: boolean;
  /** a literal of the same SHAPE that must return rows, for an absence claim */
  control?: string;
}

/** every witness the ledger records, in the world it is asked against.
 *
 *  `witness/3` and `witness_atleast/3` carry no world and mean the default,
 *  which facts/worlds.rofl states as a fact rather than this file assuming it. */
export function witnesses(r: any, map?: Map<string, WorldSpec>): W[] {
  const dflt = map ? ((map as any).defaultWorld as string) : 'w_ledger';
  const rows = (q: string) => r.query(q).rows;
  return [
    ...rows('witness(F, Q, N)').map((x: any) =>
      ({ id: x.bindings.F, world: dflt, q: str(x.bindings.Q), want: Number(x.bindings.N), floor: false })),
    ...rows('witness_atleast(F, Q, N)').map((x: any) =>
      ({ id: x.bindings.F, world: dflt, q: str(x.bindings.Q), want: Number(x.bindings.N), floor: true })),
    ...rows('witness_in(F, W, Q, N)').map((x: any) =>
      ({ id: x.bindings.F, world: str(x.bindings.W), q: str(x.bindings.Q), want: Number(x.bindings.N), floor: false })),
    ...rows('witness_in_atleast(F, W, Q, N)').map((x: any) =>
      ({ id: x.bindings.F, world: str(x.bindings.W), q: str(x.bindings.Q), want: Number(x.bindings.N), floor: true })),
    ...rows('witness_absent(F, W, Q, C)').map((x: any) =>
      ({ id: x.bindings.F, world: str(x.bindings.W), q: str(x.bindings.Q), want: 0, floor: false,
         control: str(x.bindings.C) })),
  ];
}

export interface Verdict extends W { got: number; err: string; ok: boolean }

/** A CONTROL THAT SHARES ONLY THE WORLD PROVES ONLY THE WORLD. The first draft
 *  asked the control to return rows and nothing else, and the mutant that
 *  measures the whole point of a control walked straight through it: write the
 *  claim's constant in the wrong lexical form — `ast_node[code](N,
 *  "with_statement", F, L)` — and it answers 0 while a control on a different
 *  constant of the same relation stays live. Both halves green, claim about
 *  nothing.
 *
 *  So the control must be THE CLAIM WITH ONE CONSTANT SWAPPED: identical token
 *  for token except at one position, and quoted at that position if and only if
 *  the claim is. Then a mis-quoted constant cannot have a control at all.
 *
 *  WHERE THIS CANNOT LOOK, and it is not fixable here: a constant MISSPELT in
 *  the right lexical form (`"requre"`) is a well-formed question about a real
 *  relation, and no checker that cannot read the prose can tell it from the
 *  question the note meant. */
const TOKENS = /"[^"]*"|[^\s(),]+|[(),]/g;
export function controlShape(q: string, c: string): string {
  const a = q.match(TOKENS) ?? []; const b = c.match(TOKENS) ?? [];
  if (a.length !== b.length || a.length === 0)
    return 'control must be the query with ONE constant swapped, not a different literal';
  const diff = a.map((t, i) => (t === b[i] ? -1 : i)).filter((i) => i >= 0);
  if (diff.length !== 1) return `control differs from the query in ${diff.length} tokens, want 1`;
  const quoted = (s: string) => s.startsWith('"');
  if (quoted(a[diff[0]]) !== quoted(b[diff[0]]))
    return 'query and control write the constant in different lexical forms';
  return '';
}

/** ask one literal of one store, and say what happened */
function ask(r: any, q: string): { got: number; err: string } {
  try {
    const res = r.query(q);
    if (res.error) return { got: -1, err: res.error.slice(0, 40) };
    if (res.unpopulatable) return { got: -1, err: 'nothing in this world can populate that literal' };
    return { got: res.rows.length, err: '' };
  } catch (e: any) { return { got: -1, err: e.message.slice(0, 40) }; }
}

/** ask each witness of ITS OWN world, and say for each what happened.
 *
 *  `worlds` maps a world name to a built store. A witness naming a world that
 *  is not there is BROKEN rather than asked somewhere else: substituting a
 *  world is how a query about the corpus came to be answered by the ledger. */
export function judge(r: any, ws: W[], worlds?: Map<string, any>): Verdict[] {
  return ws.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : (a.q < b.q ? -1 : 1))).map((w) => {
    const store = worlds ? worlds.get(w.world) : r;
    if (!store) return { ...w, got: -1, err: `no world named ${w.world}`, ok: false };
    const { got, err } = ask(store, w.q);
    if (err) return { ...w, got, err, ok: false };
    // THE CONTROL IS PART OF THE CLAIM, not a nicety. An absence witness is the
    // only kind whose query is expected to return nothing, so a typo in it is
    // indistinguishable from the measurement it is standing for.
    if (w.control !== undefined) {
      const shape = controlShape(w.q, w.control);
      if (shape) return { ...w, got, err: shape.slice(0, 70), ok: false };
      const c = ask(store, w.control);
      if (c.err) return { ...w, got, err: `control: ${c.err}`, ok: false };
      if (c.got < 1) return { ...w, got, err: 'control returned nothing — this world cannot answer', ok: false };
    }
    return { ...w, got, err: '', ok: w.floor ? got >= w.want : got === w.want };
  });
}

/** build every world some witness names, and no others. A world costs a whole
 *  fixpoint — the corpus one about 4 s — so an unused declaration is free. */
export function worldsFor(ws: W[], map: Map<string, WorldSpec>, idx: any): Map<string, any> {
  const out = new Map<string, any>();
  out.set((map as any).indexWorld as string, idx);
  for (const w of new Set(ws.map((x) => x.world))) {
    if (out.has(w)) continue;
    const spec = map.get(w);
    if (spec) out.set(w, build(spec));
  }
  return out;
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
// THE CLI IS A THIN SHELL OVER THE SAME FUNCTIONS, 2026-09-07, and that is
// the whole content of wiring this gate: the check ran only when a human typed
// its name, so a stale witness was caught by remembering rather than by CI.
// test/witness-check.test.ts imports `world`, `witnesses` and `judge`, plants a
// stale one and a broken one, and asserts the tree's own witnesses are clean.
// test/note-witness.test.ts does the same for the world column and the control.
const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1] &&
  real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) {
  const map = worldMap();
  const idx = build(map.get((map as any).indexWorld)!);
  const ws = witnesses(idx, map);
  if (ws.length === 0) { console.log('no witnesses recorded'); process.exit(0); }
  const worlds = worldsFor(ws, map, idx);
  const vs = judge(idx, ws, worlds);
  const used = [...new Set(ws.map((w) => w.world))].sort();
  console.log(`  ${ws.length} witnesses over ${used.length} worlds: ${used.join(', ')}\n`);
  for (const v of vs) {
    console.log(`${v.err ? 'BROKEN ' : v.ok ? '  ok   ' : ' STALE '} ${v.id}  [${v.world}]`);
    console.log(`        ${v.q}  ->  ${v.err ? v.err : v.got}`
      + `${v.control !== undefined ? ' (want 0, control live)'
         : v.floor ? ` (want >= ${v.want})` : ` (want ${v.want})`}`);
  }
  const broken = vs.filter((v) => v.err).length;
  const stale = vs.filter((v) => !v.err && !v.ok).length;
  console.log(`\n  ok ${vs.length - stale - broken}   STALE ${stale}   BROKEN ${broken}`);
  process.exit(stale + broken > 0 ? 1 : 0);
}
