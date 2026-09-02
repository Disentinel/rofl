// demo.ts — DITTO: pin the model, make the edit, prove what the edit promised
// to preserve was preserved. End to end.
//
//   node --experimental-strip-types examples/ditto/demo.ts
//
// Everything printed here is computed by the kernel from examples/ditto/ditto.rofl
// over facts extracted by scanners/js.ts from examples/ditto/{before,after}/,
// except section 11, which is computed WITHOUT the kernel on purpose. Nothing in
// the transcript is composed by hand; README.md and page.html paste this output.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import { extractFacts, SCANNER_PERSP } from '../../scanners/js.ts';
import {
  countingSemiring, provenanceSemiring, provenanceOf, renderProvenance,
  renderCount, tropicalSemiring, unitFiringCost, viterbiSemiring, logProbOf,
  renderLogProb, INFINITE, IMPOSSIBLE, type Count, type LogProb,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
export const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
export const DITTO = fs.readFileSync(path.join(HERE, 'ditto.rofl'), 'utf8');

/** The two ledgers, and the directory each one is read from. */
export const SIDES = [['before', 'before'], ['after', 'after']] as const;

/** THE EXTRACTOR IS A NODE OF THE GRAPH. Its version is the content hash of
 *  the reader itself, so changing the reader changes the version by
 *  construction and a freeze taken with the old one can no longer be compared
 *  — the tool refuses instead of producing a diff of two different parsers. */
export const EXTRACTOR = 'rofl_js_scanner';
export const EXTRACTOR_VERSION: string = crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(ROOT, 'scanners', 'js.ts')))
  .digest('hex')
  .slice(0, 12);

/** Weights for the three evidence tiers behind the "why did it break" guess.
 *  They ride on the FIRING and never enter the store: the strength of an
 *  inference is a property of the inference, and a number in the ledger would
 *  look like something the extractor measured. */
export const TIER_CONFIDENCE: Record<string, number> = {
  edge_gone: 0.40,
  edge_gone_orphan: 0.72,
  edge_gone_effect: 0.88,
};

/** How many rules boot.rofl brings, so the hygiene report can separate the
 *  meta-kernel's from this example's instead of quoting one number for both. */
export const BOOT_RULES: number = (() => {
  const r = new Rofl();
  ok(r.load(BOOT), 'boot.rofl');
  return new Evaluation(r.store, {}).rules.length;
})();

function ok(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what}: ${res.diagnostics.join('; ')}`);
}

// ---------------------------------------------------------------------------
// THE FREEZE — one dumb reader, run twice
//
// scanners/js.ts is the whole extractor except for one thing it deliberately
// does not do: it records an import SPECIFIER and never resolves it to a file,
// because a scanner that resolved imports would be a compiler. `resolves` below
// is that resolution, and it is Node's own rule in three lines — join,
// normalize, and fall back to the specifier itself for anything not in the
// tree. It is part of the extractor and therefore part of its version.

function sources(dir: string, base: string = dir): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(full, base));
    else if (e.name.endsWith('.ts')) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

const resolveSpec = (from: string, spec: string, files: Set<string>): string => {
  if (!spec.startsWith('.')) return spec;
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  return files.has(target) ? target : spec;
};

export interface Freeze { persp: string; dir: string; facts: string[]; files: string[]; }

/** Read one revision into ROFL fact text. The scanner writes into [code]; the
 *  freeze re-files the same text under the ledger for this revision, which is
 *  the one rewrite this function performs and it is anchored at the relation
 *  name so no argument can be caught by it. */
export function freeze(persp: string, dir: string): Freeze {
  const abs = path.join(HERE, dir);
  const files = sources(abs);
  const known = new Set(files);
  const facts: string[] = [];
  for (const rel of files) {
    const code = fs.readFileSync(path.join(abs, rel), 'utf8');
    const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 12);
    for (const f of extractFacts(rel, code, hash)) {
      facts.push(f.replace(new RegExp(`^(\\w+)\\[${SCANNER_PERSP}\\]\\(`), `$1[${persp}](`));
      const m = /^src_import\[\w+\]\("([^"]+)", "([^"]+)"\)\.$/.exec(f);
      if (m) facts.push(`resolves[${persp}](${quoted(m[1])}, ${quoted(m[2])}, ${quoted(resolveSpec(m[1], m[2], known))}).`);
    }
  }
  facts.sort();
  return { persp, dir, facts, files };
}

export const FROZEN: Record<string, Freeze> = Object.fromEntries(
  SIDES.map(([persp, dir]) => [persp, freeze(persp, dir)]));

/** The engineer's declaration. NOT extracted and not extractable: which edits
 *  these are, which identifications were deliberate, and what the front door
 *  is. It loads with who=engineer, and the extractor has no authority here. */
export const CLAIM = `
edit[claim](e_extract_discount, extract_method).
edit[claim](e_rename_customer,  rename).
edit[claim](e_move_storage,     module_move).
edit[claim](e_swap_price_index, data_structure).
edit[claim](e_dedupe_audit,     dedupe).

edit_note[claim](e_extract_discount, "pull the discount arithmetic out of settle()").
edit_note[claim](e_rename_customer,  "findCustomer -> loadCustomer, everywhere").
edit_note[claim](e_move_storage,     "db.ts moves under storage/").
edit_note[claim](e_swap_price_index, "price lookup: linear scan -> Map").
edit_note[claim](e_dedupe_audit,     "notifyOps stops writing a second audit line").

renamed[claim]("findCustomer", "loadCustomer").
moved[claim]("db.ts", "storage/db.ts").

entry_point[claim](fn("orders.ts", "handleOrder")).
`;

export interface WorldOpts {
  claim?: string;            // a different declaration (the mutation tests)
  beforeFacts?: string[];    // a different frozen model
  afterFacts?: string[];     // a different current model
  afterVersion?: string;     // a skewed extractor version
  afterTool?: string;        // a different extractor altogether
}

/** The world: boot's meta-kernel, the rules, the two frozen models under their
 *  own writers, and the engineer's claim under hers. */
export function world(opts: WorldOpts = {}): Rofl {
  const r = new Rofl();
  ok(r.load(BOOT), 'boot.rofl');
  ok(r.load(DITTO), 'ditto.rofl');
  ok(r.load(opts.claim ?? CLAIM, { who: 'engineer' }), 'claim');
  ok(r.load(`extractor[before](${EXTRACTOR}, ${quoted(EXTRACTOR_VERSION)}).`, { who: 'frozen_extract' }), 'before version');
  ok(r.load(`extractor[after](${opts.afterTool ?? EXTRACTOR}, ${quoted(opts.afterVersion ?? EXTRACTOR_VERSION)}).`,
    { who: 'live_extract' }), 'after version');
  ok(r.load((opts.beforeFacts ?? FROZEN.before.facts).join('\n'), { who: 'frozen_extract' }), 'before model');
  ok(r.load((opts.afterFacts ?? FROZEN.after.facts).join('\n'), { who: 'live_extract' }), 'after model');
  return r;
}

export const col = (r: Rofl, q: string, v: string): string[] =>
  r.query(q).rows.map((x) => x.bindings[v]);
export const pairs = (r: Rofl, q: string, a: string, b: string): [string, string][] =>
  r.query(q).rows.map((x) => [x.bindings[a], x.bindings[b]] as [string, string]);

/** Strip the quotes a string term carries, for display only. */
export const bare = (s: string): string => (s.startsWith('"') ? s.slice(1, -1) : s);
export function quoted(s: string): string { return JSON.stringify(s); }
const list = (xs: string[]): string => (xs.length === 0 ? '-' : xs.join(', '));

/** fn("a/b.ts","c") -> a/b.ts:c, and pair(X,Y) -> X -> Y. Display only; the
 *  terms themselves are what the engine compares. */
export function pretty(term: string): string {
  const f = /^fn\("([^"]*)","([^"]*)"\)$/.exec(term);
  if (f) return `${f[1]}:${f[2]}`;
  const p = /^pair\((.*)\)$/.exec(term);
  if (p) {
    const parts = splitTop(p[1]);
    if (parts.length === 2) return `${pretty(parts[0])} -> ${pretty(parts[1])}`;
  }
  return bare(term);
}

/** Split a canonical argument list on top-level commas. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0, inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') inStr = !inStr;
    else if (!inStr && (c === '(')) depth++;
    else if (!inStr && (c === ')')) depth--;
    else if (!inStr && c === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out;
}

// ---------------------------------------------------------------------------
// hygiene: the assertions every semiring fold in this file rests on

export interface Hygiene {
  rules: number; unsafe: string[]; demandRels: number;
  unstratified: string[]; audits: Record<string, number>; holes: number;
}

/** A rule outside range restriction is evaluated top-down instead of being
 *  materialised. The Boolean answers stay correct and the SUPPORT HYPERGRAPH
 *  does not, so every number below would then describe a different fact set
 *  than the verdicts do. Checked, not assumed. */
export function hygiene(r: Rofl): Hygiene {
  const ev = new Evaluation(r.store, {});
  const audits: Record<string, number> = {};
  for (const [name, q] of [
    ['malformed', 'malformed[audit](R)'], ['breach', 'breach[audit](R)'],
    ['leak', 'leak[audit](A, B)'], ['forged', 'forged[audit](F)'],
    ['undefined_premise', 'undefined_premise[audit](R, Rel)'],
  ] as [string, string][]) audits[name] = r.query(q).rows.length;
  return {
    rules: ev.rules.length,
    unsafe: ev.rules.filter((x) => !x.safe).map((x) => x.canon),
    demandRels: ev.demandRels.size,
    unstratified: col(r, 'unstratified(X)', 'X'),
    audits,
    holes: r.query('hole(H, W)').rows.length,
  };
}

// ---------------------------------------------------------------------------
// the declared class, and what mixing edits cost

export interface ClassReport {
  kinds: string[];
  obliged: string[];
  waived: string[];
  weakened: { invariant: string; promisedBy: string[]; waivedBy: string[] }[];
}

export function classReport(r: Rofl): ClassReport {
  const kinds = [...new Set(col(r, 'edit[claim](Id, K)', 'K'))].sort();
  const waived = col(r, 'waived(I)', 'I').sort();
  const weakened = waived.map((i) => ({
    invariant: i,
    promisedBy: [...new Set(col(r, `weakened_by(${i}, K, P)`, 'K'))].sort(),
    waivedBy: [...new Set(col(r, `weakened_by(${i}, K, P)`, 'P'))].sort(),
  })).filter((w) => w.promisedBy.length > 0);
  return { kinds, obliged: col(r, 'obliged(I)', 'I').sort(), waived, weakened };
}

// ---------------------------------------------------------------------------
// the verdict table

export interface InvariantRow {
  invariant: string; before: number; after: number;
  lost: string[]; gained: string[]; verdict: string;
}

/** One row per OBLIGED invariant: how many tuples each revision exhibits, what
 *  went missing, what appeared, and the verdict — which says the declared
 *  tuple set held, never that behaviour held. */
export function verdicts(r: Rofl): InvariantRow[] {
  return col(r, 'obliged(I)', 'I').sort().map((i) => {
    const lost = col(r, `violated(${i}, T, disappeared)`, 'T').sort();
    const gained = col(r, `violated(${i}, T, appeared)`, 'T').sort();
    return {
      invariant: i,
      before: r.query(`obs(before, ${i}, T)`).rows.length,
      after: r.query(`obs(after, ${i}, T)`).rows.length,
      lost, gained,
      verdict: r.holds(`held(${i})`) ? 'HELD' : 'VIOLATED',
    };
  });
}

export interface PermittedRow { invariant: string; removed: number; added: number; }

export function permittedChanges(r: Rofl): PermittedRow[] {
  return col(r, 'waived(I)', 'I').sort().map((i) => ({
    invariant: i,
    removed: r.query(`permitted_change(${i}, T, removed)`).rows.length,
    added: r.query(`permitted_change(${i}, T, added)`).rows.length,
  }));
}

// ---------------------------------------------------------------------------
// the semiring folds

export interface Slack { entry: string; effect: string; before: Count; after: Count; }

/** How many INDEPENDENT ROUTES carry each effect from the entry point, in each
 *  revision. An invariant whose count drops from two to one is not violated —
 *  it has lost its spare, which is a future regression visible today. This is
 *  Counting's fourth domain reading in this set: robustness in NOPE and OOPS,
 *  ambiguity in AKA, fragility in DRIP, and RESERVE here. */
export function slack(r: Rofl): Slack[] {
  const fold = evaluateSemiring(r.store, countingSemiring);
  const out = new Map<string, Slack>();
  for (const x of r.query('obs(S, entry_effect, pair(A, E))').rows) {
    const { S, A, E } = x.bindings;
    const key = `${A}|${E}`;
    const cur = out.get(key) ?? { entry: A, effect: E, before: 0n as Count, after: 0n as Count };
    const v = fold.value.get(`effect_reachable[main](${S},${A},${E})`) ?? (0n as Count);
    if (S === 'before') cur.before = v; else cur.after = v;
    out.set(key, cur);
  }
  return [...out.values()].sort((a, b) => (a.effect < b.effect ? -1 : 1));
}

/** The provenance of one invariant tuple in the frozen model: which base facts
 *  of the extraction actually carried it, and therefore where the loss can be.
 *  Polynomial's row in the spec's semiring table. */
export function carriedBy(r: Rofl, key: string): string {
  const fold = evaluateSemiring(r.store, provenanceSemiring, { base: provenanceOf });
  return renderProvenance(fold.value.get(key) ?? []);
}

/** Firings on the CHEAPEST derivation of each violated tuple in the frozen
 *  model. Tropical's row in the spec's table: with several invariants broken,
 *  the one with the smallest proof is the nearest place to look, because its
 *  proof mentions the fewest extracted facts. */
export function cheapestProof(r: Rofl): { invariant: string; tuple: string; firings: number }[] {
  const fold = evaluateSemiring(r.store, tropicalSemiring, { weight: unitFiringCost });
  return r.query('violated(I, T, disappeared)').rows.map((x) => ({
    invariant: x.bindings.I,
    tuple: x.bindings.T,
    firings: fold.value.get(`obs[main](before,${x.bindings.I},${x.bindings.T})`) ?? Infinity,
  })).sort((a, b) => a.firings - b.firings);
}

export interface Cause { from: string; to: string; best: LogProb; tiers: [string, LogProb][]; }

const logRank = (v: LogProb): number => (v === IMPOSSIBLE ? -Infinity : v);

/** Confidence in the "this is why it broke" guess: the best-supported evidence
 *  tier, in the Viterbi semiring — the strongest evidence available, not the
 *  product of the weakest. */
export function causes(r: Rofl): Cause[] {
  const weight = (key: string): LogProb => {
    const m = /^hint\[main\]\(.*,(\w+)\)$/.exec(key);
    return logProbOf(m ? (TIER_CONFIDENCE[m[1]] ?? 1) : 1);
  };
  const fold = evaluateSemiring(r.store, viterbiSemiring, { weight: (k) => weight(k) });
  return r.query('probable_cause(A, B)').rows.map((x) => {
    const { A, B } = x.bindings;
    const tiers = col(r, `hint(${A}, ${B}, T)`, 'T')
      .map((t) => [t, fold.value.get(`hint[main](${A},${B},${t})`)!] as [string, LogProb])
      .sort((a, b) => logRank(a[1]) - logRank(b[1]));
    return { from: A, to: B, best: fold.value.get(`probable_cause[main](${A},${B})`)!, tiers };
  });
}

// ---------------------------------------------------------------------------
// what a diff sees, against what the declared class sees

export interface RawDiff {
  before: number; after: number; identical: number;
  onlyBefore: number; onlyAfter: number;
  filesIdentical: number; filesTotal: number;
}

/** The comparison every existing tool makes: the two fact sets, side by side,
 *  with no declared identification at all. This is what a golden master, a
 *  snapshot test or `git diff` is looking at. */
export function rawDiff(): RawDiff {
  const strip = (f: string): string => f.replace(/^(\w+)\[\w+\]\(/, '$1(');
  const b = new Set(FROZEN.before.facts.filter((f) => !f.startsWith('resolves')).map(strip));
  const a = new Set(FROZEN.after.facts.filter((f) => !f.startsWith('resolves')).map(strip));
  const same = [...b].filter((f) => a.has(f)).length;
  const hashes = (fr: Freeze): Map<string, string> => new Map(
    fr.facts.flatMap((f) => {
      const m = /^src_file\[\w+\]\("([^"]+)", "([^"]+)"\)\.$/.exec(f);
      return m ? [[m[1], m[2]] as [string, string]] : [];
    }));
  const hb = hashes(FROZEN.before);
  const ha = hashes(FROZEN.after);
  let identicalFiles = 0;
  for (const [p, h] of hb) if (ha.get(p) === h) identicalFiles++;
  return {
    before: b.size, after: a.size, identical: same,
    onlyBefore: b.size - same, onlyAfter: a.size - same,
    filesIdentical: identicalFiles, filesTotal: Math.max(hb.size, ha.size),
  };
}

// ---------------------------------------------------------------------------
// THE FORK — a repair, proposed and then verified in a second fixpoint
//
// store.clone() was measured at a flat 3 microseconds per fact, so comparing
// two fixpoints is affordable and this is where DITTO uses it: take the world
// as it stands, put the missing call back, run the fixpoint again, and see
// whether the violated invariant returns. The proposal is checked rather than
// asserted.

export interface Repair {
  fact: string; facts: number; reflection: number; forkMs: number; evalMs: number;
  violationsBefore: number; violationsAfter: number; held: string[];
}

/** Fork the world, put the missing call back, run the fixpoint again. The fork
 *  is `store.clone()` — the primitive whose cost was measured — and it is timed
 *  separately from the re-evaluation so the two claims stay separable. */
export function repair(r: Rofl, fact: string): Repair {
  const violationsBefore = r.query('violated(I, T, D)').rows.length;
  const t0 = Date.now();
  const forked = new Rofl();
  forked.store = r.store.clone();
  const forkMs = Date.now() - t0;
  const t1 = Date.now();
  ok(forked.assert(fact, { who: 'live_extract' }), 'repair');
  forked.evaluate();
  return {
    fact, facts: r.store.facts.size, reflection: reflectionFacts(r),
    forkMs, evalMs: Date.now() - t1, violationsBefore,
    violationsAfter: forked.query('violated(I, T, D)').rows.length,
    held: col(forked, 'held(I)', 'I').sort(),
  };
}

/** Facts the kernel wrote about the program rather than about the code: rule
 *  reflection and firing provenance. They dominate this store and they are the
 *  reason its per-fact clone cost is nothing like a flat fact table's. */
export function reflectionFacts(r: Rofl): number {
  let n = 0;
  for (const f of r.store.facts.values()) if (r.store.get(f.key)!.frozen || KERNEL_RELS.has(f.rel)) n++;
  return n;
}

const KERNEL_RELS = new Set([
  'derived_by', 'rule', 'has_premise', 'premise_pos', 'premise_neg', 'concludes',
  'has_conclusion', 'reads_from', 'writes_to', 'reserved', 'authority', 'asserted_by',
  'edb', 'bridge_decl', 'in_perspective', 'uses_builtin', 'premise_lit', 'conclusion_lit',
]);

/** POSITIVE CONTROL for the fork measurement. A number with no control is not
 *  a measurement: this clones a store of the same order of magnitude that is
 *  nothing but flat ground facts, so the per-fact figures can be compared and
 *  the difference attributed to what the facts are, not to the machine. */
export function flatControl(n: number): { facts: number; ms: number } {
  const flat = new Rofl();
  const lines: string[] = [];
  for (let i = 0; i < n; i++) lines.push(`ctl(a${i}, b${i % 97}).`);
  ok(flat.load(lines.join('\n')), 'control');
  const t = Date.now();
  flat.store.clone();
  return { facts: flat.store.facts.size, ms: Date.now() - t };
}

// ---------------------------------------------------------------------------
// THE EXCISE ORACLE — the same violation, computed by deletion
//
// Take the FROZEN model, delete the one call site the guess accuses, re-run the
// whole program from scratch, and see which obliged observations disappear. If
// the model is right about what carried the invariant, that set is exactly the
// set the edit lost. Neither computation knows about the other.

export interface Excised { fact: string; removed: string[]; lost: string[]; agree: boolean; }

export function exciseOracle(r: Rofl, fact: string): Excised {
  const obliged = new Set(col(r, 'obliged(I)', 'I'));
  const ex = r.excise(fact);
  if (!ex.ok) throw new Error(ex.error);
  const removed = ex.removed
    .flatMap((k) => {
      const m = /^obs\[main\]\(before,(\w+),(.*)\)$/.exec(k);
      return m && obliged.has(m[1]) ? [`${m[1]} ${m[2]}`] : [];
    }).sort();
  const lost = r.query('lost(I, T)').rows
    .flatMap((x) => (obliged.has(x.bindings.I) ? [`${x.bindings.I} ${x.bindings.T}`] : [])).sort();
  return { fact, removed, lost, agree: JSON.stringify(removed) === JSON.stringify(lost) };
}

// ---------------------------------------------------------------------------
// THE ORACLE — the same question, answered without the engine
//
// Shares only the base facts: it reads the EDB relations back out of the store,
// resolves every call by hand, walks both call graphs with a worklist, applies
// the declared maps, and diffs. Written the way somebody would write it in an
// afternoon, because that is what makes it an independent check rather than a
// second reading of the same program.

export interface Model {
  funcs: Set<string>;                      // "path\nname"
  exports: Set<string>;                    // "path\nname"
  calls: [string, string, string][];       // path, caller, callee-name
  imports: Map<string, Set<string>>;       // path -> resolved module ids
  files: Set<string>;
}

const KEY = (...parts: string[]): string => parts.join('\n');

export function modelOf(r: Rofl, side: string): Model {
  const funcs = new Set(pairs(r, `src_func[${side}](P, F, L)`, 'P', 'F').map(([p, f]) => KEY(bare(p), bare(f))));
  const exps = new Set(pairs(r, `src_export[${side}](P, N)`, 'P', 'N').map(([p, n]) => KEY(bare(p), bare(n))));
  const calls = r.query(`src_call[${side}](P, F, C)`).rows
    .map((x) => [bare(x.bindings.P), bare(x.bindings.F), bare(x.bindings.C)] as [string, string, string]);
  const imports = new Map<string, Set<string>>();
  for (const x of r.query(`resolves[${side}](P, S, Q)`).rows) {
    const p = bare(x.bindings.P);
    imports.set(p, (imports.get(p) ?? new Set()).add(bare(x.bindings.Q)));
  }
  return { funcs, exports: exps, calls, imports, files: new Set(col(r, `src_file[${side}](P, H)`, 'P').map(bare)) };
}

export interface OracleModel {
  effects: Set<string>;         // "effect" reachable from the entry
  reach: Set<string>;           // "path\nname" exported functions reachable
  boundary: Set<string>;        // "path\nname"
  deps: Set<string>;            // "path\nmodule"
  samples: { nodes: number; edges: number; callsites: number; resolved: number };
}

/** Resolve, walk, collect. No rule, no fixpoint engine, no term unification. */
export function oracle(m: Model, effectApi: Map<string, string>, entry: [string, string],
  cname: (n: string) => string, cpath: (p: string) => string): OracleModel {
  const target = (fromPath: string, name: string): string | null => {
    if (m.funcs.has(KEY(fromPath, name))) return fromPath;
    for (const q of m.imports.get(fromPath) ?? []) {
      if (m.funcs.has(KEY(q, name)) && m.exports.has(KEY(q, name))) return q;
    }
    return null;
  };
  const out = new Map<string, Set<string>>();
  const effectsAt = new Map<string, Set<string>>();
  let resolved = 0;
  for (const [p, caller, callee] of m.calls) {
    if (!m.funcs.has(KEY(p, caller))) continue;
    const e = effectApi.get(callee);
    if (e !== undefined) effectsAt.set(KEY(p, caller), (effectsAt.get(KEY(p, caller)) ?? new Set()).add(e));
    const q = target(p, callee);
    if (q === null) continue;
    resolved++;
    out.set(KEY(p, caller), (out.get(KEY(p, caller)) ?? new Set()).add(KEY(q, callee)));
  }
  // reflexive-transitive walk from the entry point, by worklist
  const seen = new Set<string>([KEY(entry[0], entry[1])]);
  const work = [KEY(entry[0], entry[1])];
  while (work.length > 0) {
    const n = work.pop()!;
    for (const next of out.get(n) ?? []) if (!seen.has(next)) { seen.add(next); work.push(next); }
  }
  const effects = new Set<string>();
  for (const n of seen) for (const e of effectsAt.get(n) ?? []) effects.add(e);
  const reach = new Set<string>();
  for (const n of seen) {
    if (n === KEY(entry[0], entry[1])) continue;
    const [p, f] = n.split('\n');
    if (m.exports.has(n)) reach.add(KEY(cpath(p), cname(f)));
  }
  const boundary = new Set<string>();
  for (const e of m.exports) { const [p, n] = e.split('\n'); boundary.add(KEY(cpath(p), cname(n))); }
  const deps = new Set<string>();
  for (const [p, qs] of m.imports) for (const q of qs) deps.add(KEY(cpath(p), cpath(q)));
  return {
    effects, reach, boundary, deps,
    samples: {
      nodes: m.funcs.size,
      edges: [...out.values()].reduce((n, s) => n + s.size, 0),
      callsites: m.calls.length,
      resolved,
    },
  };
}

/** The set difference the oracle reports, in the same shape the engine does. */
export function oracleDiff(before: OracleModel, after: OracleModel): Record<string, string[]> {
  const diff = (b: Set<string>, a: Set<string>): string[] =>
    [...b].filter((x) => !a.has(x)).map((x) => x.replace('\n', ':')).sort();
  return {
    entry_effect: diff(before.effects, after.effects),
    entry_reach: diff(before.reach, after.reach),
    boundary: diff(before.boundary, after.boundary),
    module_dep: diff(before.deps, after.deps),
  };
}

// ---------------------------------------------------------------------------

const rule = (t: string) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 70 - t.length))}`);
const pad = (s: string, n: number) => s.padEnd(n);

const ENTRY = 'fn("orders.ts","handleOrder")';
const SETTLE = 'fn("orders.ts","settle")';
const PERSIST = 'fn("storage/db.ts","persist")';
const LOST_CALL = 'src_call[before]("orders.ts", "settle", "persist").';

/** What each evidence tier of the "why did it break" guess actually saw. */
const TIER_EVIDENCE: Record<string, string> = {
  edge_gone: 'a call that used to exist does not',
  edge_gone_orphan: '... and its target is still exported, now called from nowhere',
  edge_gone_effect: '... and that orphaned target performs an effect',
};

/** The longest prefix of a frozen route that still exists after the edit —
 *  "was: A -> B -> C" against "is: A -> B". The chain is entry-last inside the
 *  term and entry-first on screen, so this walks it in derivation order. */
export function survivingPrefix(r: Rofl, chain: string): string {
  const nodes = chainNodes(chain).map((n) => col(r, `cnode(before, ${n}, C)`, 'C')[0] ?? n);
  const kept = [nodes[0]];
  for (let i = 1; i < nodes.length; i++) {
    if (!r.holds(`cedge(after, ${nodes[i - 1]}, ${nodes[i]})`)) break;
    kept.push(nodes[i]);
  }
  return kept.map(pretty).join(' -> ') + (kept.length < nodes.length ? '   (stops here)' : '');
}

function main(): void {
  const t0 = Date.now();
  console.log('DITTO — the edit says it is a refactoring. Which invariants did it promise,');
  console.log('        and did they survive? Not "behaviour is identical" — that cannot be proved.');

  const r = world();
  const built = Date.now() - t0;

  // -- 0. the two revisions -------------------------------------------------
  rule('0. two revisions, one reader');
  for (const [side] of SIDES) {
    const f = FROZEN[side];
    console.log(`  [${pad(side + ']', 8)} ${pad(f.dir + '/', 8)} ${f.files.length} files, `
      + `${col(r, `src_func[${side}](P, F, L)`, 'P').length} functions, `
      + `${r.query(`src_call[${side}](P, F, C)`).rows.length} call sites, `
      + `${col(r, `src_export[${side}](P, N)`, 'N').length} exports, `
      + `${f.facts.length} facts`);
  }
  console.log(`  extractor: ${EXTRACTOR} @ ${EXTRACTOR_VERSION}  (the content hash of scanners/js.ts)`);
  console.log('  Both models are the output of the same dumb reader. Nothing was judged on');
  console.log('  the way in; the only human input is the declaration below.');

  // -- 1. the declared class ------------------------------------------------
  rule('1. the declared equivalence class — the one manual step');
  const cls = classReport(r);
  for (const [id, k] of pairs(r, 'edit[claim](Id, K)', 'Id', 'K')) {
    console.log(`  ${pad(id, 20)}${pad(k, 17)}${bare(col(r, `edit_note[claim](${id}, N)`, 'N')[0] ?? '')}`);
  }
  console.log(`\n  OBLIGED (must survive) : ${list(cls.obliged)}`);
  console.log(`  WAIVED  (may change)   : ${list(cls.waived)}`);
  console.log('\n  Mixing edits weakens the claim, monotonically: you may promise only what');
  console.log('  ALL of your edits promise. What this change gave up, and to whom:');
  for (const w of cls.weakened) {
    console.log(`    ${pad(w.invariant, 12)} promised by ${list(w.promisedBy)}`);
    console.log(`    ${pad('', 12)} waived   by ${list(w.waivedBy)}`);
  }

  // -- 2. the verdict -------------------------------------------------------
  rule('2. the verdict — over the declared set, not over behaviour');
  const rows = verdicts(r);
  const obligedTuples = rows.reduce((n, x) => n + x.before, 0);
  const broken = rows.reduce((n, x) => n + x.lost.length + x.gained.length, 0);
  console.log(`  ${pad('INVARIANT', 15)}${pad('BEFORE', 8)}${pad('AFTER', 7)}${pad('LOST', 6)}${pad('GAINED', 8)}VERDICT`);
  for (const x of rows) {
    console.log(`  ${pad(x.invariant, 15)}${pad(String(x.before), 8)}${pad(String(x.after), 7)}`
      + `${pad(String(x.lost.length), 6)}${pad(String(x.gained.length), 8)}${x.verdict}`);
  }
  console.log(`\n  ${obligedTuples - broken} of ${obligedTuples} declared tuples survived.`);
  for (const x of rows) {
    for (const t of x.lost) console.log(`    VIOLATED  ${pad(x.invariant, 14)}${pretty(t)}   (disappeared)`);
    for (const t of x.gained) console.log(`    VIOLATED  ${pad(x.invariant, 14)}${pretty(t)}   (appeared)`);
  }
  console.log('\n  and the changes that were licensed, which is most of the edit:');
  for (const p of permittedChanges(r)) {
    console.log(`    ${pad(p.invariant, 14)}${p.removed} removed, ${p.added} added   (waived)`);
  }
  console.log('\n  The wording is the point. What is established is that the DECLARED AND');
  console.log('  EXTRACTABLE tuple set survived. Program equivalence is undecidable and');
  console.log('  this tool never claims it.');

  // -- 3. the chain ---------------------------------------------------------
  rule('3. was / is — the chain that carried it, and the link that is gone');
  const lostEffect = rows.find((x) => x.invariant === 'entry_effect')!.lost[0];
  const effect = splitTop(/^pair\((.*)\)$/.exec(lostEffect)![1])[1];
  console.log(`  $ ditto why ${pretty(lostEffect)}\n`);
  console.log('  WAS — every route in the frozen model that carried it:');
  const routes = r.query(`route(before, ${ENTRY}, B, P)`).rows
    .filter((x) => r.holds(`does(before, ${x.bindings.B}, ${effect})`));
  for (const x of routes) console.log(`    ${renderChain(x.bindings.P)}  [${effect}]`);
  const prov = carriedBy(r, `effect_reachable[main](before,${ENTRY},${effect})`).split(' + ');
  const fromCode = prov.filter((f) => /\[(before|after)\]/.test(f)).length;
  console.log(`\n    and it rested on ${prov.length} base facts — ${fromCode} read out of the source, the rest`);
  console.log('    the effect catalogue and the ledger tag. Remove any one and it is gone:');
  for (const f of prov) console.log(`      ${f}`);

  console.log('\n  IS — the chain stops one link short:');
  for (const x of routes) console.log(`    ${survivingPrefix(r, x.bindings.P)}`);
  console.log('\n    the link itself:');
  for (const l of r.whynot(`edge(after, ${SETTLE}, ${PERSIST})`, { depth: 6, nodes: 40 }).text.split('\n')) {
    console.log(`    ${l}`);
  }
  console.log('\n    and nothing else calls it either — every candidate, checked:');
  for (const l of r.whynot(`creach(after, ${ENTRY}, ${PERSIST})`, { depth: 1, nodes: 60 }).text.split('\n')) {
    console.log(`    ${l}`);
  }
  console.log('\n  With two invariants broken, the cheapest proof in the frozen model is the');
  console.log('  nearest place to look, because it mentions the fewest extracted facts:');
  for (const c of cheapestProof(r)) {
    console.log(`    ${pad(c.invariant, 14)}${pad(pretty(c.tuple), 50)}${c.firings} firings`);
  }

  // -- 4. probable cause ----------------------------------------------------
  rule('4. probable cause — a hypothesis, and the proof it stays one');
  console.log('  Three calls disappeared. Two of them were declared legal and one was not,');
  console.log('  and the tool is not told which: it ranks them by the evidence it can see.\n');
  for (const c of causes(r).sort((a, b) => logRank(b.best) - logRank(a.best))) {
    console.log(`  ${pad(pretty(c.from) + ' -> ' + pretty(c.to), 46)}confidence ${renderLogProb(c.best)}  (HYPOTHESIS)`);
    for (const [t, v] of c.tiers) console.log(`       ${pad(t, 20)}${pad(renderLogProb(v), 9)}${TIER_EVIDENCE[t]}`);
  }
  console.log('\n  Why it cannot quietly harden into a verdict, from the kernel\'s own rule');
  console.log('  dependency graph rather than from a promise in a comment:');
  for (const v of ['violated', 'held', 'obliged', 'lost', 'obs', 'checked']) {
    const leaks = ['probable_cause', 'hint', 'orphan', 'lost_edge', 'carries_effect']
      .filter((g) => r.holds(`reach(${v}, ${g})`));
    console.log(`    reach(${pad(v + ',', 11)} <any guess relation>) -> ${leaks.length === 0 ? 'empty' : 'HOLDS: ' + list(leaks)}`);
  }

  // -- 5. what a diff sees --------------------------------------------------
  rule('5. what a diff sees, and what the declared class sees');
  const d = rawDiff();
  console.log(`  raw extraction, no declared identification at all:`);
  console.log(`    ${pad('facts before / after', 32)}${d.before} / ${d.after}`);
  console.log(`    ${pad('identical', 32)}${d.identical}`);
  console.log(`    ${pad('only in before / only in after', 32)}${d.onlyBefore} / ${d.onlyAfter}`);
  console.log(`    ${pad('files byte-identical', 32)}${d.filesIdentical} of ${d.filesTotal}`);
  console.log(`\n  ${d.onlyBefore + d.onlyAfter} facts moved. A golden master, a snapshot test or a byte diff is`);
  console.log('  looking at exactly this, and can only say "it all changed". Under the');
  console.log(`  declared class the same edit is ${broken} violation${broken === 1 ? '' : 's'} and everything else legal.`);
  console.log('  The rename and the move are what make the raw number useless: they touch');
  console.log('  every tuple that mentions the name or the path, and no tool can tell that');
  console.log('  from a deletion without being told. Being told is the declaration.');

  // -- 6. counting ----------------------------------------------------------
  rule('6. counting — the invariant that held and lost its spare');
  console.log('  independent routes from the entry point to each effect:\n');
  console.log(`  ${pad('EFFECT', 14)}${pad('BEFORE', 8)}${pad('AFTER', 8)}READING`);
  for (const s of slack(r)) {
    const reading = s.after === 0n ? 'VIOLATED — no route left'
      : renderCount(s.before) === renderCount(s.after) ? 'unchanged'
        : 'held, and lost a route: RESERVE GONE';
    console.log(`  ${pad(s.effect, 14)}${pad(renderCount(s.before), 8)}${pad(renderCount(s.after), 8)}${reading}`);
  }
  console.log('\n  audit_write is not a violation and is not nothing: two independent routes');
  console.log('  wrote that line, now one does, and the next edit that touches the survivor');
  console.log('  removes the effect with nothing to notice it. A future regression, visible');
  console.log('  today. Counting means something different in every domain of this set —');
  console.log('  robustness in NOPE, ambiguity in AKA, fragility in DRIP — and RESERVE here.');

  // -- 7. the fork ----------------------------------------------------------
  rule('7. the fork — propose the repair, then verify it in a second fixpoint');
  const rep = repair(r, 'src_call[after]("orders.ts", "settle", "persist").');
  console.log(`  $ ditto propose ${rep.fact.trim()}`);
  console.log(`    violations before the fork : ${rep.violationsBefore}`);
  console.log(`    violations after the fork  : ${rep.violationsAfter}`);
  console.log(`    invariants held            : ${list(rep.held)}`);
  const ctl = flatControl(5000);
  console.log(`    store.clone() of ${rep.facts} facts : ${rep.forkMs} ms `
    + `(${(rep.forkMs * 1000 / rep.facts).toFixed(1)} us/fact)`);
  console.log(`    full re-evaluation         : ${rep.evalMs} ms`);
  console.log(`    control — a FLAT store     : ${ctl.ms} ms for ${ctl.facts} ground facts `
    + `(${(ctl.ms * 1000 / ctl.facts).toFixed(1)} us/fact)`);
  const ratio = (rep.forkMs / rep.facts) / (ctl.ms / ctl.facts);
  console.log('  The proposal is CHECKED, not asserted: the store is cloned, the missing');
  console.log('  call is put back, and the whole program runs again.');
  console.log(`  The control is there because a per-fact cost is not portable: ${rep.reflection} of`);
  console.log(`  this store's ${rep.facts} facts are rule reflection and firing provenance carrying`);
  console.log(`  nested terms, and they copy at about ${ratio.toFixed(1)}x the cost of a flat ground fact.`);
  console.log('  Neither figure reproduces the ~3 us/fact recorded for clone() elsewhere in');
  console.log('  this repository; the flat control here does not either, so most of that gap');
  console.log('  belongs to the measurement and not to this store. Printed rather than');
  console.log('  smoothed over — and the conclusion survives it: comparing two fixpoints');
  console.log('  costs a few hundred milliseconds, which makes it an ordinary operation.');

  // -- 8. the gate says no --------------------------------------------------
  rule('8. the gate that can say no — a skewed extractor refuses the answer');
  const skewed = world({ afterVersion: 'a-different-parser' });
  console.log(`  freeze taken with ${EXTRACTOR_VERSION}, check run with a-different-parser\n`);
  console.log(`    ? refused(R)   -> ${list(col(skewed, 'refused(R)', 'R'))}`);
  console.log(`    ? checked(I)   -> ${list(col(skewed, 'checked(I)', 'I'))}`);
  console.log(`    ? violated(I, T, D) -> ${skewed.query('violated(I, T, D)').rows.length} rows`);
  console.log(`    ? held(I)      -> ${list(col(skewed, 'held(I)', 'I'))}`);
  console.log('\n  Two different parsers produce two different models and their diff is a');
  console.log('  fact about the parsers. A tool that reported that diff as a refactoring');
  console.log('  verdict would be worse than no tool. Note that `held` is empty too: a');
  console.log('  refused comparison must not be able to say yes either.');

  // -- 9. the boundary ------------------------------------------------------
  rule('9. what this does NOT prove');
  console.log(`  undecidable: ${list(col(r, 'undecidable(X)', 'X'))} — so the verdict is about the`);
  console.log('  declared and extractable set and nothing else. The model covers:');
  for (const s of col(r, 'scope_covered(C)', 'C')) console.log(`    + ${s}`);
  console.log('  and is blind to, and does not claim to have ruled out:');
  for (const s of col(r, 'out_of_scope(C)', 'C')) console.log(`    - ${s}`);
  const unres = r.query('unresolved(S, P, F, N)').rows.length;
  const callsites = r.query('src_call[before](P, F, C)').rows.length
    + r.query('src_call[after](P, F, C)').rows.length;
  console.log(`\n  Extraction coverage, measured rather than assumed: ${callsites - unres} of ${callsites} call`);
  console.log('  sites across both revisions resolve to a definition in the tree; the rest');
  console.log(`  are library and host calls the reader cannot place:`);
  for (const x of r.query('unresolved(S, P, F, N)').rows.slice(0, 6)) {
    console.log(`    ${pad(x.bindings.S, 8)}${pad(bare(x.bindings.P), 16)}${bare(x.bindings.F)} -> ${bare(x.bindings.N)}`);
  }
  console.log(`  ambiguous name resolutions: ${r.query('ambiguous(S, P, N)').rows.length}`);

  // -- 10. hygiene ----------------------------------------------------------
  rule('10. hygiene — what every number above rests on');
  const h = hygiene(r);
  console.log(`    ${pad('rules decoded (boot + ditto)', 36)}${h.rules}`);
  console.log(`    ${pad('of which ditto.rofl contributes', 36)}${h.rules - BOOT_RULES}`);
  console.log(`    ${pad('rules not range-restricted', 36)}${h.unsafe.length}`);
  console.log(`    ${pad('relations evaluated by demand', 36)}${h.demandRels}`);
  console.log(`    ${pad('unstratified relations', 36)}${h.unstratified.length}`);
  console.log(`    ${pad('holes (budget exhaustion)', 36)}${h.holes}`);
  for (const [k, v] of Object.entries(h.audits)) console.log(`    ${pad(k + '[audit]', 36)}${v}`);
  console.log('\n  The declaration is the human\'s and the kernel says so. The extractor');
  console.log('  cannot declare its own equivalence class:');
  const scratch = Rofl.fromSnapshot(r.save());
  ok(scratch.assert('renamed[claim]("persist", "store").', { who: 'frozen_extract' }), 'forgery');
  scratch.evaluate();
  console.log('    $ assert renamed[claim]("persist", "store")  who=frozen_extract');
  console.log(`    forged[audit] -> ${list(col(scratch, 'forged[audit](F)', 'F'))}`);
  console.log(`    authority(claim, Who) -> ${list(col(r, 'authority(claim, W)', 'W'))}`);

  // -- 11. the oracles ------------------------------------------------------
  rule('11. two oracles — the same violation, computed twice more');
  const ex = exciseOracle(r, LOST_CALL);
  console.log(`  (a) excise ${ex.fact.trim()}`);
  console.log('      delete that one call from the FROZEN model and re-run the whole');
  console.log('      program. The obliged observations that disappear must be exactly the');
  console.log('      ones the edit lost.');
  for (const k of ex.removed) console.log(`        removed: ${k.split(' ')[0]}  ${pretty(k.split(' ').slice(1).join(' '))}`);
  console.log(`      VERDICT: ${ex.agree ? 'AGREE, tuple for tuple' : 'DISAGREE — this is a finding, see README'}`);

  const effectApi = new Map(pairs(r, 'effect_api(C, E)', 'C', 'E').map(([c, e]) => [bare(c), e] as [string, string]));
  const renameMap = new Map(pairs(r, 'renamed[claim](O, N)', 'O', 'N').map(([o, n]) => [bare(o), bare(n)] as [string, string]));
  const moveMap = new Map(pairs(r, 'moved[claim](O, N)', 'O', 'N').map(([o, n]) => [bare(o), bare(n)] as [string, string]));
  const id = (m: Map<string, string>) => (x: string): string => m.get(x) ?? x;
  const ob = oracle(modelOf(r, 'before'), effectApi, ['orders.ts', 'handleOrder'], id(renameMap), id(moveMap));
  const oa = oracle(modelOf(r, 'after'), effectApi, ['orders.ts', 'handleOrder'], (x) => x, (x) => x);
  const od = oracleDiff(ob, oa);
  console.log('\n  (b) the same question with no engine at all: resolve, walk, diff, in plain');
  console.log('      TypeScript over the EDB facts and nothing derived.');
  console.log(`      sample: ${ob.samples.nodes} + ${oa.samples.nodes} functions, `
    + `${ob.samples.edges} + ${oa.samples.edges} resolved edges, `
    + `${ob.samples.callsites + oa.samples.callsites} call sites re-resolved by hand.\n`);
  let agree = true;
  for (const x of rows) {
    const engine = x.lost.map((t) => pretty(t).replace(/^.* -> /, '')).sort();
    const orc = (od[x.invariant] ?? []).sort();
    const same = JSON.stringify(engine) === JSON.stringify(orc);
    agree = agree && same;
    console.log(`      ${pad(x.invariant, 14)}engine lost ${pad(JSON.stringify(engine), 34)} oracle lost ${JSON.stringify(orc)}  ${same ? 'AGREE' : 'DISAGREE'}`);
  }
  console.log(`\n      VERDICT: ${agree ? 'AGREE on every obliged invariant' : 'DISAGREE — a finding, never something to tune away'}`);

  console.log(`\n(world built in ${built} ms; ${Date.now() - t0} ms total)`);
}

/** cons(C, cons(B, cons(A, nil))) -> [A, B, C]: the route in walking order,
 *  entry point first. The term itself is built head-first by the recursion. */
export function chainNodes(term: string): string[] {
  const items: string[] = [];
  let t = term;
  for (;;) {
    const m = /^cons\((.*)\)$/.exec(t);
    if (!m) break;
    const parts = splitTop(m[1]);
    items.push(parts[0]);
    t = parts.slice(1).join(',');
  }
  return items.reverse();
}

const renderChain = (term: string): string => chainNodes(term).map(pretty).join(' -> ');

const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1]
  && real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) main();
