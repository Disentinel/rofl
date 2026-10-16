// structure.ts — DECLARED DATA STRUCTURES (docs/data-structures.md); the
// TypeScript side of rust/rofl/src/structure.rs. A declaration changes no
// fact: it is a promise about one relation's data, checked after every
// evaluation, and a licence the Rust engine may use. `function ast_name(N, to
// Name).` promises one Name for each N, in each book. TypeScript stores no
// structure; it parses, reflects and checks.

import { type Term, type Lit, type Clause, mka, mki, canonTerm } from './unify.ts';
import { type FactStore } from './store.ts';
import { V, KERNEL_PERSP, RESERVED, canonClause } from './reflect.ts';
import { Rejected } from './aggeval.ts';

const srcTerm = (t: Term): string => (t.k === 'v' ? (t.name.startsWith('_$') ? '_' : t.name) : t.k === 'f' ? `${t.name}(${t.args.map(srcTerm).join(', ')})` : canonTerm(t));
const litSrc = (l: Lit): string => `${l.rel}(${l.args.map(srcTerm).join(', ')})`;

/** `function ast_name(N, to Name)` as a reader wrote it, a tree's `closure` after it, an alias's literal. */
export function structureText(c: Clause): string {
  const s = c.structure!;
  return `${s.kind} ${c.head.rel}(${c.head.args.map((t, k) => (s.roles[k] ? `${s.roles[k]} ` : '') + srcTerm(t)).join(', ')})${s.closure === undefined ? '' : ` closure ${s.closure}`}${s.source ? ` is ${litSrc(s.source)}` : ''}`;
}

/** A STRUCTURE DECLARATION AT THE DOOR (`check_structure_decl`, rust/rofl/src/program.rs). */
export function checkStructureDecl(c: Clause, arityOf: (rel: string) => number | undefined, declared: ReadonlySet<string>, concluded: (rel: string) => string | null = () => null, taken: ReadonlySet<string> = new Set()): string | null {
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
  if (s.kind === 'alias') return checkAlias(c, what, arityOf, concluded, taken);
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

/** AN ALIAS AT THE DOOR (`check_alias`, rust/rofl/src/structure.rs): the relation is new (no rule or fact concludes it, no other alias or closure is `taken` by it), and the literal it reads is another relation's, each argument of the alias in it and nothing else named. */
function checkAlias(c: Clause, what: string, arityOf: (rel: string) => number | undefined, concluded: (rel: string) => string | null, taken: ReadonlySet<string>): string | null {
  const rel = c.head.rel, src = c.structure!.source!;
  if (taken.has(rel)) return `${what}: '${rel}' is declared a structure twice`;
  if (src.rel === rel) return `${what}: an alias reads another relation than itself`;
  if (RESERVED.has(src.rel) || src.rel.startsWith('$') || arityOf(src.rel) !== undefined) return `${what}: '${src.rel}' is a kernel relation and an alias reads the program's relations`;
  const head = c.head.args.flatMap((a) => (a.k === 'v' ? [a.name] : []));
  for (const a of src.args) {
    if (a.k === 'v' && !head.includes(a.name) && !a.name.startsWith('_$')) return `${what}: '${a.name}' is not an argument of the alias; a column it drops is written _`;
    if (a.k === 'f') return `${what}: an alias reads a column, a constant or _, not a compound term`;
  }
  for (const x of head) if (!src.args.some((a) => a.k === 'v' && a.name === x)) return `${what}: '${x}' is not read from ${src.rel}; each argument of the alias is a column of it`;
  const other = concluded(rel);
  if (other) return `${what}: '${rel}' is also concluded by ${other}; an alias has no other conclusion`;
  return null;
}

/** THE CLOSURE OF A TREE IS THE DECLARATION'S, and nothing else concludes it, nor an alias's: the refusal of a clause that does (`rule` or `fact`), or nothing. */
export function checkClosureHead(c: Clause, closures: ReadonlyMap<string, string>, aliases: ReadonlySet<string> = new Set()): string | null {
  if (aliases.has(c.head.rel)) return `${c.body.length === 0 ? 'fact' : 'rule'} rejected: '${c.head.rel}' is declared an alias and has no other conclusion: ${canonClause(c)}`;
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

/** THE LOWERING OF `alias` (`lower_alias`, rust/rofl/src/structure.rs): the rule the author would have written, in every book `B` (a name no argument of the alias takes). TypeScript evaluates it; the Rust engine reads the source in its place where no witness is kept. */
export function lowerAlias(c: Clause): string {
  const src = c.structure!.source!;
  const names = [...c.head.args, ...src.args].flatMap((a) => (a.k === 'v' ? [a.name] : []));
  let b = 'B';
  while (names.includes(b)) b += 'B';
  return `${c.head.rel}[${b}](${c.head.args.map(srcTerm).join(', ')}) :- ${src.rel}[${b}](${src.args.map(srcTerm).join(', ')}).`;
}

/** The relations declared an alias. */
export function declaredAliases(store: FactStore): Set<string> {
  const out = new Set<string>();
  for (const f of store.relPersp(V.structure_decl, KERNEL_PERSP)) if (f.args[0].k === 'a' && f.args[2].k === 'a' && f.args[2].name === 'alias') out.add(f.args[0].name);
  return out;
}

/** The rows a declaration is in the kernel's book: `structure_decl(Rel, Arity, Kind)` and a `structure_role(Rel, Pos, Role)` per marked argument, Pos from 1. */
export function structureRows(c: Clause): [string, Term[]][] {
  const s = c.structure!, rel = c.head.rel;
  const rows: [string, Term[]][] = [[V.structure_decl, [mka(rel), mki(c.head.args.length), mka(s.kind)]]];
  s.roles.forEach((r, i) => { if (r) rows.push([V.structure_role, [mka(rel), mki(i + 1), mka(r)]]); });
  if (s.closure !== undefined) rows.push([V.structure_closure, [mka(rel), mka(s.closure)]]);
  return rows;
}

/** The relations the program declares a structure of, and the closures of its trees; not an alias, of which a promise (a tree, a function) may be declared too. */
export function declaredStructures(store: FactStore): Set<string> {
  const out = new Set<string>();
  for (const f of store.relPersp(V.structure_decl, KERNEL_PERSP)) if (f.args[0].k === 'a' && !(f.args[2].k === 'a' && f.args[2].name === 'alias')) out.add(f.args[0].name);
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
