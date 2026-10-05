// structure.ts — DECLARED DATA STRUCTURES (docs/data-structures.md); the
// TypeScript side of rust/rofl/src/structure.rs. A declaration changes no
// fact: it is a promise about one relation's data, checked after every
// evaluation, and a licence the Rust engine may use. `function ast_name(N, to
// Name).` promises one Name for each N, in each book. TypeScript stores no
// structure; it parses, reflects and checks.

import { type Term, type Clause, mka, mki, canonTerm } from './unify.ts';
import { type FactStore } from './store.ts';
import { V, KERNEL_PERSP, RESERVED } from './reflect.ts';
import { Rejected } from './aggeval.ts';

const srcTerm = (t: Term): string => (t.k === 'v' ? (t.name.startsWith('_$') ? '_' : t.name) : canonTerm(t));

/** `function ast_name(N, to Name)` as a reader wrote it. */
export function structureText(c: Clause): string {
  const s = c.structure!;
  return `${s.kind} ${c.head.rel}(${c.head.args.map((t, k) => (s.roles[k] ? `${s.roles[k]} ` : '') + srcTerm(t)).join(', ')})`;
}

/** A STRUCTURE DECLARATION AT THE DOOR (`check_structure_decl`, rust/rofl/src/program.rs). */
export function checkStructureDecl(c: Clause, arityOf: (rel: string) => number | undefined, declared: ReadonlySet<string>): string | null {
  const rel = c.head.rel, what = structureText(c), s = c.structure!;
  if (RESERVED.has(rel) || rel.startsWith('$') || arityOf(rel) !== undefined) return `${what}: '${rel}' is a kernel relation and cannot be declared ${s.kind}`;
  const seen: string[] = [];
  for (const a of c.head.args) {
    if (a.k !== 'v') return `${what}: a declaration's arguments are variables, each a key or marked with its role`;
    if (seen.includes(a.name)) return `${what}: '${a.name}' is written twice; a declaration names each argument once`;
    seen.push(a.name);
  }
  if (s.kind === 'function') {
    const first = s.roles.findIndex((r) => r);
    if (first < 0) return `${what}: a function names the value its key determines, marked \`to\`: function ${rel}(N, to V)`;
    if (s.roles.slice(first).some((r) => !r)) return `${what}: the values a key determines come last, after the key: function ${rel}(N, to V)`;
  }
  if (declared.has(rel)) return `${what}: '${rel}' is declared a structure twice`;
  return null;
}

/** The rows a declaration is in the kernel's book: `structure_decl(Rel, Arity, Kind)` and a `structure_role(Rel, Pos, Role)` per marked argument, Pos from 1. */
export function structureRows(c: Clause): [string, Term[]][] {
  const s = c.structure!, rel = c.head.rel;
  const rows: [string, Term[]][] = [[V.structure_decl, [mka(rel), mki(c.head.args.length), mka(s.kind)]]];
  s.roles.forEach((r, i) => { if (r) rows.push([V.structure_role, [mka(rel), mki(i + 1), mka(r)]]); });
  return rows;
}

/** The relations the program declares a structure of. */
export function declaredStructures(store: FactStore): Set<string> {
  const out = new Set<string>();
  for (const f of store.relPersp(V.structure_decl, KERNEL_PERSP)) if (f.args[0].k === 'a') out.add(f.args[0].name);
  return out;
}

/** The functions the program declares: relation, arity, and the key and value positions (from 0). */
export function readFunctions(store: FactStore): { rel: string; key: number[]; to: number[] }[] {
  const out: { rel: string; key: number[]; to: number[] }[] = [];
  const roles = new Map<string, Map<number, string>>();
  for (const f of store.relPersp(V.structure_role, KERNEL_PERSP)) {
    const [r, p, role] = f.args;
    if (r.k !== 'a' || p.k !== 'i' || role.k !== 'a') continue;
    if (!roles.has(r.name)) roles.set(r.name, new Map());
    roles.get(r.name)!.set(Number(p.v) - 1, role.name);
  }
  for (const f of store.relPersp(V.structure_decl, KERNEL_PERSP)) {
    const [r, n, kind] = f.args;
    if (r.k !== 'a' || n.k !== 'i' || kind.k !== 'a' || kind.name !== 'function') continue;
    const m = roles.get(r.name) ?? new Map<number, string>(), key: number[] = [], to: number[] = [];
    for (let i = 0; i < Number(n.v); i++) (m.get(i) === 'to' ? to : key).push(i);
    out.push({ rel: r.name, key, to });
  }
  return out;
}

/** THE PROMISE OF EVERY DECLARED FUNCTION, checked over the facts an evaluation left, one book at a time (a hypothetical book is judged like any other, and refuses the whole run): two facts with one key and different values refuse, naming the relation, the book, the key and both values. The smallest key and the two smallest values by their canonical text, so both engines name the same ones. */
export function checkFunctions(store: FactStore): void {
  for (const { rel, key, to } of readFunctions(store).sort((a, b) => (a.rel < b.rel ? -1 : 1))) {
    for (const persp of store.perspectivesOf(rel).sort()) {
      const byKey = new Map<string, Set<string>>();
      for (const f of store.relPersp(rel, persp)) {
        if (f.args.length !== key.length + to.length) continue;
        const k = key.map((i) => canonTerm(f.args[i])).join(', '), v = to.map((i) => canonTerm(f.args[i])).join(', ');
        const vs = byKey.get(k);
        if (vs) vs.add(v); else byKey.set(k, new Set([v]));
      }
      const bad = [...byKey].filter(([, vs]) => vs.size > 1).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      if (bad.length === 0) continue;
      const [k, vs] = bad[0], [v1, v2] = [...vs].sort();
      const more = bad.length > 1 ? `; ${bad.length - 1} more key${bad.length > 2 ? 's break' : ' breaks'} it too` : '';
      throw new Rejected(`program rejected: function ${rel}: key (${k}) has two values in the book ${persp}: (${v1}) and (${v2})${more}`);
    }
  }
}
