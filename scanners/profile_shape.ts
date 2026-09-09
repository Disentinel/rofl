// scanners/profile_shape.ts — THE STORE'S OWN SHAPE, AS FACTS.
//
// Three profiling questions, asked of the data rather than of a schema. Every
// one of them is a statement a model can be wrong about and nothing here was
// checking:
//
//   FD   is a column CONSTANT within the group its row belongs to — that is,
//        one fact about the whole, repeated once per part
//   UCC  does a column IDENTIFY its row, making it a key nobody declared
//   IND  is every value of one column a value of another — a foreign key, and
//        the integrity check most models never make
//
// THE OUTPUT IS ONE FACT PER ANSWER, NEVER ONE PER ROW. A profiler that emitted
// a fact per fact would reproduce exactly the duplication it exists to find,
// and would be the largest thing in the world it was measuring. The enumeration
// is the host's; the judgement is `rules/profile.rofl`'s.
//
// WHY THE HOST ENUMERATES AND THE RULES DECIDE: "no two rows disagree" cannot
// be said positively — a rule would have to enumerate the agreements — so what
// crosses the boundary is the WITNESS OF VIOLATION, `disagrees/3`, and the rule
// says `not disagrees`. That is the only shape in which "none" is checkable.
//
//   node --experimental-strip-types scanners/profile_shape.ts <boot+program...>
//     > facts/profile-shape.rofl
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { canonTerm } from '../src/unify.ts';
import type { Term } from '../src/unify.ts';

/** A fact's group, read off the key the scanner minted.
 *
 *  THE MODEL MUST NOT MENTION VOLUMES (docs/volumes-and-residency.md): all 64
 *  volumes agreed byte for byte while no rule knew volumes existed, and a rule
 *  that named one would stop being about the domain and start being about
 *  storage. So residency is read HERE, from the id, and reaches the rules only
 *  as `in_group` — host data, like `imports` and `collects`. */
const VOLUME = /^n[0-9a-f]{8}_/;
export const groupOf = (t: string): string | null => VOLUME.exec(t)?.[0] ?? null;

export interface Shape {
  /** (rel, pos) whose value differs between two facts of one group. */
  disagrees: [string, number][];
  /** (rel, pos) where the group holds more than one fact — the group groups. */
  grouped: [string, number][];
  /** (rel, pos) whose values are distinct across every row: a key. */
  unique: [string, number][];
  /** (rel, pos, rel, pos) where every value on the left occurs on the right. */
  included: [string, number, string, number][];
  /** (rel, pos, rows, distinct) — the census, kept because it is what a reader
   *  reaches for first and it must be visible that it does NOT decide. */
  census: [string, number, number, number][];
}

export function profile(r: Rofl, prefix = 'ast_'): Shape {
  const rows = new Map<string, string[][]>();
  const group = new Map<string, string[]>();          // rel -> per-row group
  for (const f of r.store.allFacts()) {
    if (!f.rel.startsWith(prefix)) continue;
    const cols = f.args.map((a: Term) => canonTerm(a));
    let a = rows.get(f.rel); if (!a) { a = []; rows.set(f.rel, a); }
    a.push(cols);
    let g = group.get(f.rel); if (!g) { g = []; group.set(f.rel, g); }
    g.push(groupOf(cols[0] ?? '') ?? '');
  }

  const out: Shape = { disagrees: [], grouped: [], unique: [], included: [], census: [] };
  const values = new Map<string, Set<string>>();

  for (const [rel, rs] of rows) {
    const gs = group.get(rel)!;
    const width = Math.max(...rs.map((x) => x.length));
    for (let i = 0; i < width; i++) {
      const distinct = new Set<string>();
      const perGroup = new Map<string, string>();
      let disagrees = false;
      let grouped = false;
      for (let k = 0; k < rs.length; k++) {
        const v = rs[k][i];
        if (v === undefined) continue;
        distinct.add(v);
        const g = gs[k];
        if (g === '') continue;
        const prev = perGroup.get(g);
        if (prev === undefined) perGroup.set(g, v);
        else {
          grouped = true;                    // two facts share a group
          if (prev !== v) disagrees = true;
        }
      }
      values.set(`${rel}|${i}`, distinct);
      out.census.push([rel, i, rs.length, distinct.size]);
      if (grouped) out.grouped.push([rel, i]);
      if (disagrees) out.disagrees.push([rel, i]);
      if (distinct.size === rs.length && rs.length > 1) out.unique.push([rel, i]);
    }
  }

  // INCLUSION is asked only against columns that are KEYS. Every pair of
  // columns would be quadratic and would report coincidences: two unrelated
  // columns of small alphabets are "included" in each other by accident, and
  // the answer is only interesting when the right-hand side identifies a row.
  const keys = out.unique.map(([r, p]) => `${r}|${p}`);
  for (const [lhs, lv] of values) {
    for (const k of keys) {
      if (k === lhs || lv.size === 0) continue;
      const kv = values.get(k)!;
      if (kv.size < lv.size) continue;
      let all = true;
      for (const v of lv) if (!kv.has(v)) { all = false; break; }
      if (!all) continue;
      const [lr, lp] = lhs.split('|');
      const [kr, kp] = k.split('|');
      out.included.push([lr, Number(lp), kr, Number(kp)]);
    }
  }
  return out;
}

const q = (s: string): string => JSON.stringify(s);

export function render(s: Shape): string {
  const L: string[] = [
    '-- facts/profile-shape.rofl — GENERATED by scanners/profile_shape.ts.',
    '--',
    '-- The store, profiled: which columns are constant within their group,',
    '-- which identify a row, and which are contained in another. One fact per',
    '-- ANSWER — a profiler that emitted one per row would be the largest thing',
    '-- in the world it was measuring.',
    '--',
    '-- `census` is here because it is what a reader reaches for first, and it',
    '-- must be visible that it does NOT decide: a column of few distinct values',
    '-- may be a repeated whole-level fact or a small alphabet, and only the',
    '-- grouping tells them apart.',
    '',
    'authority(profile, scanner).',
    '',
  ];
  for (const [r, p] of s.grouped) L.push(`grouped[profile](${r}, ${p}).`);
  L.push('');
  for (const [r, p] of s.disagrees) L.push(`disagrees[profile](${r}, ${p}).`);
  L.push('');
  for (const [r, p] of s.unique) L.push(`unique_col[profile](${r}, ${p}).`);
  L.push('');
  for (const [r, p, w, qq] of s.included) L.push(`included[profile](${r}, ${p}, ${w}, ${qq}).`);
  L.push('');
  for (const [r, p, rows, d] of s.census) L.push(`census[profile](${r}, ${p}, ${rows}, ${d}).`);
  L.push('');
  return L.join('\n');
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
  const files = process.argv.slice(2);
  const r = new Rofl();
  r.load(fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8'));
  for (const f of files) {
    const res = r.load(fs.readFileSync(f, 'utf8'));
    if (!res.ok) { console.error(`${f}: ${res.diagnostics.join('; ')}`); process.exit(1); }
  }
  r.evaluate();
  process.stdout.write(render(profile(r)));
}
