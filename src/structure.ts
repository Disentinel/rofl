// structure.ts — DECLARED DATA STRUCTURES (docs/data-structures.md); the
// TypeScript side of rust/rofl/src/structure.rs. A declaration changes no
// fact: it is a promise about one relation's data, checked after every
// evaluation, and a licence the Rust engine may use. `function ast_name(N, to
// Name).` promises one Name for each N, in each book. TypeScript stores no
// structure; it parses, reflects and checks.

import { type Term, type Clause, mka, mki, canonTerm } from './unify.ts';
import { type FactStore } from './store.ts';
import { V, KERNEL_PERSP, RESERVED, canonClause } from './reflect.ts';
import { Rejected } from './aggeval.ts';

const srcTerm = (t: Term): string => (t.k === 'v' ? (t.name.startsWith('_$') ? '_' : t.name) : canonTerm(t));

/** `function ast_name(N, to Name)` as a reader wrote it, and a tree's `closure` after it. */
export function structureText(c: Clause): string {
  const s = c.structure!;
  return `${s.kind} ${c.head.rel}(${c.head.args.map((t, k) => (s.roles[k] ? `${s.roles[k]} ` : '') + srcTerm(t)).join(', ')})${s.closure === undefined ? '' : ` closure ${s.closure}`}`;
}

/** A STRUCTURE DECLARATION AT THE DOOR (`check_structure_decl`, rust/rofl/src/program.rs). */
export function checkStructureDecl(c: Clause, arityOf: (rel: string) => number | undefined, declared: ReadonlySet<string>, concluded: (rel: string) => string | null = () => null): string | null {
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
  if (s.kind === 'tree' && c.head.args.length !== 2) return `${what}: a tree has two arguments, the parent and the child: tree ${rel}(P, C)`;
  if (declared.has(rel)) return `${what}: '${rel}' is declared a structure twice`;
  const cl = s.closure;
  if (cl !== undefined) {
    if (s.kind !== 'tree') return `${what}: only a tree has a closure`;
    if (cl === rel) return `${what}: a tree's closure is another relation than its edges`;
    if (RESERVED.has(cl) || cl.startsWith('$') || arityOf(cl) !== undefined) return `${what}: '${cl}' is a kernel relation and cannot be the closure of a tree`;
    if (declared.has(cl)) return `${what}: '${cl}' is declared a structure twice`;
    const other = concluded(cl);
    if (other) return `${what}: '${cl}' is also concluded by ${other}; a closure has no other conclusion`;
  }
  return null;
}

/** THE CLOSURE OF A TREE IS THE DECLARATION'S, and nothing else concludes it: the refusal of a clause that does (`rule` or `fact`), or nothing. */
export function checkClosureHead(c: Clause, closures: ReadonlyMap<string, string>): string | null {
  const tree = closures.get(c.head.rel);
  if (tree === undefined) return null;
  return `${c.body.length === 0 ? 'fact' : 'rule'} rejected: '${c.head.rel}' is the closure of the tree ${tree} and has no other conclusion: ${canonClause(c)}`;
}

/** The closure each declared tree stands for, by the closure's name. */
export function declaredClosures(store: FactStore): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of store.relPersp(V.structure_closure, KERNEL_PERSP)) if (f.args[0].k === 'a' && f.args[1].k === 'a') out.set(f.args[1].name, f.args[0].name);
  return out;
}

/** THE LOWERING OF `closure`: the two rules the author would have written, in every book (`B`), the transitive closure of the tree's edges, strict. TypeScript evaluates them; the Rust engine answers from the tree (rust/rofl/src/structure.rs). */
export function lowerClosure(c: Clause): string[] {
  const rel = c.head.rel, cl = c.structure!.closure!;
  return [`${cl}[B](P, C) :- ${rel}[B](P, C).`, `${cl}[B](P, D) :- ${cl}[B](P, X), ${rel}[B](X, D).`];
}

/** The rows a declaration is in the kernel's book: `structure_decl(Rel, Arity, Kind)` and a `structure_role(Rel, Pos, Role)` per marked argument, Pos from 1. */
export function structureRows(c: Clause): [string, Term[]][] {
  const s = c.structure!, rel = c.head.rel;
  const rows: [string, Term[]][] = [[V.structure_decl, [mka(rel), mki(c.head.args.length), mka(s.kind)]]];
  s.roles.forEach((r, i) => { if (r) rows.push([V.structure_role, [mka(rel), mki(i + 1), mka(r)]]); });
  if (s.closure !== undefined) rows.push([V.structure_closure, [mka(rel), mka(s.closure)]]);
  return rows;
}

/** The relations the program declares a structure of, and the closures of its trees. */
export function declaredStructures(store: FactStore): Set<string> {
  const out = new Set<string>();
  for (const f of store.relPersp(V.structure_decl, KERNEL_PERSP)) if (f.args[0].k === 'a') out.add(f.args[0].name);
  for (const f of store.relPersp(V.structure_closure, KERNEL_PERSP)) if (f.args[1].k === 'a') out.add(f.args[1].name);
  return out;
}

/** What concludes `rel` already, as the words a refusal says: a rule, or a fact; null when nothing does. */
export function concludedBy(store: FactStore, rel: string): string | null {
  for (const f of store.relPersp(V.concludes, KERNEL_PERSP)) if (f.args[1].k === 'a' && f.args[1].name === rel) return 'a rule';
  return store.perspectivesOf(rel).length ? 'a fact' : null;
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

/** The trees the program declares: relation, and the closure it stands for, if any. */
export function readTrees(store: FactStore): { rel: string; closure?: string }[] {
  const closure = new Map<string, string>();
  for (const f of store.relPersp(V.structure_closure, KERNEL_PERSP)) if (f.args[0].k === 'a' && f.args[1].k === 'a') closure.set(f.args[0].name, f.args[1].name);
  const out: { rel: string; closure?: string }[] = [];
  for (const f of store.relPersp(V.structure_decl, KERNEL_PERSP)) {
    const [r, , kind] = f.args;
    if (r.k === 'a' && kind.k === 'a' && kind.name === 'tree') out.push({ rel: r.name, closure: closure.get(r.name) });
  }
  return out;
}

/** THE PROMISE OF EVERY DECLARED TREE, a forest: each child has one parent and no node is its own ancestor, in each book. A child with two parents refuses first (the smallest child by its canonical text, its two smallest parents), then a cycle (the one through the smallest node, each node the parent of the one before it); both engines name the same ones. */
export function checkTrees(store: FactStore): void {
  const by = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  for (const { rel } of readTrees(store).sort((a, b) => by(a.rel, b.rel))) {
    for (const persp of store.perspectivesOf(rel).sort()) {
      const parents = new Map<string, Set<string>>();
      for (const f of store.relPersp(rel, persp)) {
        if (f.args.length !== 2) continue;
        const [p, ch] = [canonTerm(f.args[0]), canonTerm(f.args[1])];
        const ps = parents.get(ch);
        if (ps) ps.add(p); else parents.set(ch, new Set([p]));
      }
      const two = [...parents].filter(([, ps]) => ps.size > 1).sort(([a], [b]) => by(a, b));
      if (two.length > 0) {
        const [ch, ps] = two[0], [p1, p2] = [...ps].sort(by);
        const more = two.length > 1 ? `; ${two.length - 1} more child${two.length > 2 ? 'ren break' : ' breaks'} it too` : '';
        throw new Rejected(`program rejected: tree ${rel}: node (${ch}) has two parents in the book ${persp}: (${p1}) and (${p2})${more}`);
      }
      const up = new Map<string, string>([...parents].map(([ch, ps]) => [ch, [...ps][0]]));
      const mark = new Map<string, number>();
      const cycles: string[][] = [];
      let stamp = 0;
      for (const n of [...up.keys()].sort(by)) {
        if (mark.has(n)) continue;
        stamp++;
        const path: string[] = [];
        let x: string | undefined = n;
        while (x !== undefined && !mark.has(x)) { mark.set(x, stamp); path.push(x); x = up.get(x); }
        if (x !== undefined && mark.get(x) === stamp) cycles.push(path.slice(path.indexOf(x)));
      }
      if (cycles.length === 0) continue;
      const least = (cy: string[]) => [...cy].sort(by)[0];
      cycles.sort((a, b) => by(least(a), least(b)));
      const cy = cycles[0], i = cy.indexOf(least(cy));
      const through = [...cy.slice(i), ...cy.slice(0, i)].map((x) => `(${x})`).join(', ');
      const more = cycles.length > 1 ? `; ${cycles.length - 1} more cycle${cycles.length > 2 ? 's' : ''}` : '';
      throw new Rejected(`program rejected: tree ${rel}: node (${least(cy)}) is its own ancestor in the book ${persp}: through ${through}${more}`);
    }
  }
}
