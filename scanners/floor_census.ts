// floor_census.ts — WHAT A STORE IS MADE OF, split by who can read it.
//
// scanners/eval_cost.ts models the JOIN; this models the STORE. The question
// it exists for: `examples/ring1` is a tower of floors — l0.ts reads dense
// facts and promotes an `r/3` row into a rule, L1 is a grammar in dense form,
// L2 is the full grammar in ordinary ROFL source read by L1, and the corpus is
// read by L2. Every floor pays to carry the reflection of the floor below it,
// and `parseFile` FORKS that store once per clause (examples/ring1/demo.ts:309),
// so whatever the reflection weighs is copied per clause of every file parsed.
//
// The split is not cosmetic and the boundaries are not opinions:
//
//   EXECUTABLE   `rule`, `conclusion_lit`, `premise_lit`. Exactly the three
//                relations `decodeRules` reads (src/reflect.ts:810-846), and
//                `src/engine.ts:2` says decodeRules is the evaluator's only
//                rule source. Drop one of these and the program stops.
//
//   ABOUT/RULE   `has_premise`, `premise_pos`, `premise_neg`, `has_conclusion`,
//                `concludes`, `conclusion_tense`, `reads_from`, `writes_to`,
//                `uses_builtin`. A flat, queryable statement of what a rule
//                does. Count scales with the PROGRAM: rules times body length.
//
//   ABOUT/FACT   `in_perspective`, `asserted_by`. Emitted per FACT by
//                `factMetaFacts` (src/reflect.ts:1001). Count scales with the
//                DATA, which is a different decision from the one above and
//                must not be averaged with it.
//
//   PROVENANCE   `derived_by`. Per DERIVATION, so it scales with the fixpoint
//                rather than with either of the two above.
//
//   KERNEL TBL   `reserved`, `edb`, `mode`, `authority`, `hole` — what
//                `bootstrapKernel` installs into every store plus what the
//                program declares. Kept apart from `world` deliberately: they
//                are neither the program's subject matter nor about its rules,
//                and folding them into either would flatter that bucket.
//
//   WORLD        everything else: the program's own relations, base and
//                derived. What the program is ABOUT.
//
// BYTES ARE THE FACT KEY'S BYTES. `factKey` (src/store.ts:47) is the store's
// only notion of a fact's identity and its comment says the key is paid for
// per fact several times over; `key.length` is therefore a real cost and a
// LOAD-IMMUNE one, which the machine note for this session asks for. It is not
// the snapshot's byte count and does not claim to be.
//
// The second half is a READER CENSUS, and it is a query rather than a grep.
// Every `.rofl` file in the tree is parsed and encoded through the kernel's own
// `encodeRule`, so "this rule reads `concludes` in its body" is answered by the
// reflection row the kernel would emit, not by a regex over source text. That
// is the move CLAUDE.md asks for — derive the check once from the rules — and
// it is why a rule reading `concludes[$kernel](R, X)` and one reading a bare
// `concludes(R, X)` count as the same reader: `resolveClauseBooks` has already
// made them the same rule.
//
// Nothing here concludes anything. The reasoning over these rows is
// rules/floor-census.rofl.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { V } from '../src/reflect.ts';
import { encodeRule } from '../src/reflect.ts';
import { parseProgram } from '../src/parser.ts';
import type { FactStore, FactRec } from '../src/store.ts';
import type { Rofl } from '../src/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// --- the buckets ----------------------------------------------------------

export const EXECUTABLE = [V.rule, V.conclusion_lit, V.premise_lit];
export const ABOUT_RULE = [V.has_premise, V.premise_pos, V.premise_neg,
  V.has_conclusion, V.concludes, V.conclusion_tense, V.reads_from,
  V.writes_to, V.uses_builtin];
export const ABOUT_FACT = [V.asserted_by];
export const PROVENANCE = [V.derived_by];
export const KERNEL_TABLE = [V.reserved, V.edb, V.mode, V.authority, V.hole];

const BUCKET = new Map<string, string>();
for (const r of EXECUTABLE) BUCKET.set(r, 'executable');
for (const r of ABOUT_RULE) BUCKET.set(r, 'about_rule');
for (const r of ABOUT_FACT) BUCKET.set(r, 'about_fact');
for (const r of PROVENANCE) BUCKET.set(r, 'provenance');
for (const r of KERNEL_TABLE) BUCKET.set(r, 'kernel_table');
BUCKET.set(V.bridge_decl, 'about_rule');   // reserved, nothing emits it
export const BUCKETS = ['world', 'executable', 'about_rule', 'about_fact',
  'provenance', 'kernel_table'];

export interface Census {
  facts: Map<string, number>;   // bucket -> facts
  bytes: Map<string, number>;   // bucket -> key bytes
  rel: Map<string, { n: number; b: number }>;  // relation -> facts, key bytes
  total: number; totalBytes: number;
}

export function censusOf(store: FactStore): Census {
  const c: Census = { facts: new Map(), bytes: new Map(), rel: new Map(), total: 0, totalBytes: 0 };
  for (const b of BUCKETS) { c.facts.set(b, 0); c.bytes.set(b, 0); }
  for (const f of store.allFacts() as FactRec[]) {
    const b = BUCKET.get(f.rel) ?? 'world';
    const n = f.key.length;
    c.facts.set(b, c.facts.get(b)! + 1);
    c.bytes.set(b, c.bytes.get(b)! + n);
    let r = c.rel.get(f.rel);
    if (!r) { r = { n: 0, b: 0 }; c.rel.set(f.rel, r); }
    r.n++; r.b += n;
    c.total++; c.totalBytes += n;
  }
  return c;
}

// --- the worlds -----------------------------------------------------------
//
// Each is built the way its own demo builds it, by importing that demo's
// `world()`. A world assembled here by hand would be a world nothing runs, and
// this repository has already recorded what an unexercised path is worth.

interface World { name: string; note: string; build: () => Promise<FactStore>; }

const st = (r: Rofl): FactStore => (r as unknown as { store: FactStore }).store;

/** THE UNSEALED TWIN. `examples/ring1/ring1.rofl` carries `sealed(rules).`, so
 *  the shipped image no longer holds the four rows this instrument is about --
 *  and an ablation over it would report them `not_live` and prove nothing. The
 *  twin is the same grammar with that one clause struck out, which is the only
 *  honest control for what the declaration costs and what it buys. */
async function unsealedRing1(): Promise<Rofl> {
  const { Rofl: R } = await import('../src/api.ts');
  const r = new R({ reuse: false });
  for (const f of ['examples/ring1/charclass.rofl', 'examples/ring1/ring1.rofl']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^sealed\(rules\)\.$/m, '');
    const res = r.load(src, { budget: 200_000_000 });
    if (!res.ok) throw new Error(f + ': ' + res.diagnostics.join('; '));
  }
  return r;
}

const WORLDS: World[] = [
  { name: 'ring1_unsealed', note: 'the same grammar with its sealed(rules) clause struck out',
    build: async () => st(await unsealedRing1()) },
  { name: 'ring1_image', note: 'charclass + ring1 AS SHIPPED (sealed), what parseFile forks per clause',
    build: async () => {
      const d = await import('../examples/ring1/demo.ts');
      return st(d.fromImage(d.image()));
    } },
  { name: 'ring1_world', note: 'boot + charclass + ring1, what the tower audits',
    build: async () => {
      const d = await import('../examples/ring1/demo.ts');
      return st(d.world());
    } },
  { name: 'spat', note: 'boot + spat + one week',
    build: async () => {
      const d = await import('../examples/spat/spat.ts');
      return st(d.world(path.join(ROOT, 'examples/spat/week.example.rofl')));
    } },
  { name: 'goof', note: 'boot + goof, nine geometries in nine ledgers',
    build: async () => { const d = await import('../examples/goof/demo.ts'); return st(d.world()); } },
  { name: 'wtf', note: 'boot + wtf',
    build: async () => { const d = await import('../examples/wtf/demo.ts'); return st(d.world()); } },
  { name: 'loot', note: 'boot + loot + the wanderer',
    build: async () => { const d = await import('../examples/loot/demo.ts'); return st(d.world()); } },
  { name: 'cram', note: 'boot + cram + flight_log',
    build: async () => { const d = await import('../examples/cram/demo.ts'); return st(d.head({}, true)); } },
];

// --- the reader census ----------------------------------------------------
//
// WHICH RULES IN THE TREE READ A REFLECTION RELATION IN THEIR BODY. Answered
// off `encodeRule`'s own rows, so the answer is the kernel's, not a grep's.

const WATCHED = new Set<string>([...EXECUTABLE, ...ABOUT_RULE, ...ABOUT_FACT, ...PROVENANCE]);

export interface Reader { file: string; rel: string; head: string; sense: string; }

function roflFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) roflFiles(full, out);
    else if (e.name.endsWith('.rofl')) out.push(full);
  }
  return out;
}

export function readerCensus(): { readers: Reader[]; files: number; unparsed: string[] } {
  const readers: Reader[] = [];
  const unparsed: string[] = [];
  const files = roflFiles(ROOT);
  for (const full of files) {
    const rel = path.relative(ROOT, full);
    let clauses;
    try { clauses = parseProgram(fs.readFileSync(full, 'utf8')); }
    catch { unparsed.push(rel); continue; }
    for (const c of clauses) {
      if (c.body.length === 0) continue;
      let enc;
      try { enc = encodeRule(c); } catch { continue; }
      for (const f of enc.facts) {
        const sense = f.rel === V.premise_pos ? 'pos' : f.rel === V.premise_neg ? 'neg' : '';
        if (!sense) continue;
        const a = f.args[0];
        void a;
        const t = f.args[1];
        if (t.k !== 'a' || !WATCHED.has(t.name)) continue;
        readers.push({ file: rel, rel: t.name, head: c.head.rel, sense });
      }
    }
  }
  return { readers, files: files.length, unparsed };
}

// --- the ablation: WHO ACTUALLY READS A ROW ------------------------------
//
// A census of readers says who MENTIONS a relation. It cannot say whether the
// mention is load-bearing, and the difference decides what a floor may seal.
// So each row is DROPPED and the world asked again.
//
// TWO LIVENESS CONDITIONS, both learned the hard way on this branch.
//
//   COLD. `safetyMemo` is module-level and keyed by a hash of the rule ids
//   (src/engine.ts:251), so a warm process never re-reads the about-rows and a
//   warm ablation reports every one of them droppable. Dropping rows does not
//   change a rule id, so the memo key does not move either -- each arm adds one
//   PROBE RULE of its own to force a miss. Measured with and without: warm says
//   12 of 12 about-relations are droppable, cold says `has_premise` is not.
//
//   THE PROBE MUST NOT LEAK. The probe rule's ID reaches derived facts
//   (`rule_known[main](r...)`), so the digest filters it out by id as well as
//   by name. Before that filter every arm read DIFF, including arms that drop
//   four rows nothing reads.
//
// And the verdict is only meaningful against a violation that was BEING
// REPORTED: `positive` arms plant one first and record whether the audit bit.

const PROBE_BUDGET = 200_000_000;

export interface Ablation { world: string; rel: string; removed: number; verdict: string; }

async function ablate(): Promise<Ablation[]> {
  const out: Ablation[] = [];
  const d = await import('../examples/ring1/demo.ts');
  // over the UNSEALED twin: the shipped grammar withholds four of the rows
  // this measures, and ablating an empty relation reports `not_live`.
  const img = (await unsealedRing1()).save();
  const src = 'wordch(I) :- kind(I, upper).';
  const arms = ['none', ...EXECUTABLE, ...ABOUT_RULE, ...ABOUT_FACT, ...PROVENANCE];
  let ref = '';
  arms.forEach((rel, i) => {
    const w = d.fromImage(img);
    const s = st(w);
    let removed = 0;
    if (rel !== 'none') for (const k of s.relAll(rel).map((f) => f.key)) { s.remove(k); removed++; }
    const probe = `zz${i}(X) :- zz${i}_in(X).`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = (w as any).load(probe + ` edb(zz${i}_in).`, { budget: PROBE_BUDGET });
    let verdict: string;
    if (!res.ok) verdict = 'probe_rejected';
    else {
      try {
        const got = d.canon(d.parse(src, w).clauses);
        if (i === 0) { ref = got; verdict = 'reference'; }
        else verdict = got === ref ? 'identical' : 'diverged';
      } catch { verdict = 'refused'; }
    }
    if (rel !== 'none' && removed === 0) verdict = 'not_live';
    out.push({ world: 'ring1_unsealed', rel: rel === 'none' ? 'nothing' : rel, removed, verdict });
  });
  return out;
}

// --- emit -----------------------------------------------------------------

function emit(rows: { name: string; note: string; c: Census }[],
              rc: { readers: Reader[]; files: number; unparsed: string[] },
              abl: Ablation[]): string {
  const L: string[] = [];
  const q = (s: string) => JSON.stringify(s);
  L.push('-- facts/floor-census.rofl — GENERATED by scanners/floor_census.ts, do not edit.');
  L.push('--');
  L.push('-- What a store is made of, split by WHO CAN READ IT. The reasoning over');
  L.push('-- these rows is rules/floor-census.rofl; nothing here concludes anything.');
  L.push('-- Taken on node ' + process.version + '.');
  L.push('');
  L.push('-- bucket_facts(Program, Bucket, N)   facts of that bucket');
  L.push('-- bucket_bytes(Program, Bucket, N)   sum of their factKey lengths');
  L.push('-- rel_facts(Program, Rel, N)         per reflection relation');
  L.push('-- store_facts(Program, N)            every fact in the store');
  L.push('-- store_bytes(Program, N)');
  L.push('-- refl_reader(File, Rel, Head, Sense)  a rule body in the tree that');
  L.push('--                                      reads a reflection relation');
  L.push('-- corpus_files(N) / corpus_unparsed(File)');
  L.push('');
  for (const { name, note, c } of rows) {
    L.push(`-- ${name}: ${note}`);
    L.push(`program(${name}).  store_facts(${name}, ${c.total}).  store_bytes(${name}, ${c.totalBytes}).`);
    for (const b of BUCKETS) {
      L.push(`  bucket_facts(${name}, ${b}, ${c.facts.get(b)!}).  bucket_bytes(${name}, ${b}, ${c.bytes.get(b)!}).`);
    }
    for (const r of [...WATCHED].sort()) {
      const v = c.rel.get(r);
      if (v) L.push(`  rel_facts(${name}, ${r}, ${v.n}).  rel_bytes(${name}, ${r}, ${v.b}).`);
    }
    L.push('');
  }
  L.push('-- the bucket a relation belongs to, so the rules need no list of their own');
  for (const [rel, b] of [...BUCKET.entries()].sort()) L.push(`in_bucket(${rel}, ${b}).`);
  L.push('');
  L.push('-- ablation(World, Rel, Removed, Verdict): the row dropped and the parse');
  L.push('-- asked again, COLD. `nothing` is the reference arm.');
  for (const a of abl) L.push(`ablation(${a.world}, ${a.rel}, ${a.removed}, ${a.verdict}).`);
  L.push('');
  L.push(`corpus_files(${rc.files}).`);
  for (const f of rc.unparsed) L.push(`corpus_unparsed(${q(f)}).`);
  const seen = new Set<string>();
  for (const r of rc.readers) {
    const k = `${r.file}|${r.rel}|${r.head}|${r.sense}`;
    if (seen.has(k)) continue;
    seen.add(k);
    L.push(`refl_reader(${q(r.file)}, ${r.rel}, ${r.head}, ${r.sense}).`);
  }
  L.push('');
  return L.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('floor_census.ts')) {
  const rows: { name: string; note: string; c: Census }[] = [];
  const only = process.argv[2];
  for (const w of WORLDS) {
    if (only && w.name !== only) continue;
    const store = await w.build();
    rows.push({ name: w.name, note: w.note, c: censusOf(store) });
  }
  const rc = readerCensus();
  const abl = only ? [] : await ablate();
  const out = emit(rows, rc, abl);
  fs.writeFileSync(path.join(ROOT, 'facts/floor-census.rofl'), out);
  console.log(`facts/floor-census.rofl written: ${out.split('\n').length} lines`);
  for (const { name, c } of rows) {
    const pct = (b: string) => ((100 * c.facts.get(b)!) / c.total).toFixed(0).padStart(3) + '%';
    console.log(`${name.padEnd(13)} ${String(c.total).padStart(6)} facts  ` +
      BUCKETS.map((b) => `${b} ${pct(b)}`).join('  '));
  }
  console.log(`reader census: ${rc.readers.length} reads over ${rc.files} .rofl files` +
    (rc.unparsed.length ? `, ${rc.unparsed.length} unparsed` : ''));
  for (const a of abl) {
    if (a.verdict === 'identical' || a.verdict === 'reference') continue;
    console.log(`  LOAD-BEARING: ${a.rel} (${a.removed} rows) -> ${a.verdict}`);
  }
}
