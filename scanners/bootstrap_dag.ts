// scanners/bootstrap_dag.ts — is "before phase A" ONE cut, or a chain of tiers?
//
// `scanners/engine_split.ts` reports 107 code lines of policy needed BEFORE the
// evaluation that would compute it. That was presented as one cut-off point.
// It is six separate blocks, and they have dependencies among themselves that
// the split never measured. If those six form a DAG there is no single "point
// A": there is a LADDER, and each rung is expressible as rules over the rung
// below — the same shape as `conclusion_tense`, where a loop that is acyclic in
// time read as a cycle in the graph.
//
// THE GRAPH IS BUILT FROM THE CODE, NOT FROM THE BLOCK DESCRIPTIONS. The `what`
// strings in engine_split.ts are one reader's paraphrase; a graph built from
// them would measure that reader's confidence. This parses src/engine.ts and
// follows DATA:
//
//   this.<field>     class state: written by assignment or by a mutator call
//   local            a variable declared in one block and read in another. Reads
//                    resolve LEXICALLY, to the innermost declaration whose scope
//                    contains the read: `prepare` declares `const r` in two
//                    different for-loops, and matching by name alone reported a
//                    cycle between the two blocks that hold them
//   rule.<field>     the ERule record — the currency between classify, the
//                    demand pass and the phase driver. Field names are read off
//                    the `interface ERule` declaration, not typed in here
//   store:<rel>      this.store.<reader> vs this.store.<writer>. A writer whose
//                    relation is a runtime value is recorded as `store:*`
//   call             a block calling a method whose body is another block
//
// An edge B -> A means B READS WHAT A WRITES: B is downstream, A is the rung
// below it.
//
// POSITIVE CONTROL, checked by the prober itself and by the test: the graph
// MUST contain the edge from block 498-523 (readStrata, the MAX over stratum/2)
// to the block that writes derived facts (conclude). That edge is known to
// exist — the stratum table is produced by phase A and read by the scheduler —
// and a probe that cannot see it is not following data flow. It comes through
// `store:*`, because the kernel writes the table dynamically: `conclude` writes
// whatever relation the firing rule concludes, and nothing in the evaluator
// names `stratum` as a write. That is the finding, not a wart of the probe.
//
//   node --experimental-strip-types scanners/bootstrap_dag.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from '@babel/parser';
import { BLOCKS, type Block } from './engine_split.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TARGET = 'src/engine.ts';

/** The blocks engine_split.ts marks `before-A`, in line order. Six when this
 *  was written; seven since another agent added `stratumCone` — the count is
 *  read off the classification rather than typed here, so the ladder grows
 *  with the kernel instead of quietly describing an older one. */
export const BEFORE_A: Block[] = BLOCKS.filter((b) => b.when === 'before-A');

export type Medium = 'this' | 'local' | 'rule' | 'store' | 'call';
export interface Access { key: string; medium: Medium; line: number; write: boolean; }
/** A local declaration and the lines its scope spans. */
interface Decl { name: string; line: number; from: number; to: number; }
export interface Edge { from: Block; to: Block; medium: Medium; key: string; where: number; }

// --- store surface, by method name. Reading and writing are different sets. --
const STORE_READ = new Set(['relAll', 'get', 'allFacts', 'allFactKeys', 'allWitnesses',
  'relCount', 'perspectivesOf', 'relPersp', 'has', 'canonicalState']);
const STORE_WRITE = new Set(['add', 'support', 'clearDerived', 'remove', 'restore', 'advanceTick']);
const MUTATORS = new Set(['set', 'add', 'push', 'clear', 'delete', 'pop', 'shift', 'unshift', 'sort']);

// ---------------------------------------------------------------------------

interface Ctx { fn: string; parent: any; scope: { from: number; to: number }; }

const SCOPE_NODES = new Set(['FunctionDeclaration', 'FunctionExpression',
  'ArrowFunctionExpression', 'ClassMethod', 'ObjectMethod', 'BlockStatement',
  'ForStatement', 'ForOfStatement', 'ForInStatement', 'CatchClause', 'Program']);

/** Every `this.x`, local, rule field, store call and self-call in the file,
 *  with its line and whether it writes. One pass, parent-aware. */
export function accesses(src: string, ruleFields: Set<string>): Access[] {
  const ast = parse(src, { sourceType: 'module', plugins: ['typescript'], ranges: false });
  const out: Access[] = [];
  const decls: Decl[] = [];
  const reads: { name: string; line: number; write: boolean }[] = [];
  const seen = new Set<any>();

  const walk = (node: any, ctx: Ctx): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    if (Array.isArray(node)) { for (const n of node) walk(n, ctx); return; }
    if (!node.type) return;
    seen.add(node);
    const line: number = node.loc?.start?.line ?? 0;
    let fn = ctx.fn;
    let scope = ctx.scope;
    if (SCOPE_NODES.has(node.type) && node.loc) {
      scope = { from: node.loc.start.line, to: node.loc.end.line };
    }
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'
        || node.type === 'ArrowFunctionExpression' || node.type === 'ClassMethod'
        || node.type === 'ObjectMethod') {
      // a nested arrow shares its parent's scope for our purpose (closures are
      // how `closeRel` and `hashOf` read the enclosing block's locals)
      if (node.type !== 'ArrowFunctionExpression') fn = `fn@${line}`;
    }

    // this.<field>
    if (node.type === 'MemberExpression' && node.object?.type === 'ThisExpression'
        && node.property?.type === 'Identifier') {
      const name = node.property.name;
      const p = ctx.parent;
      let write = false;
      if (p?.type === 'AssignmentExpression' && p.left === node) write = true;
      if (p?.type === 'UpdateExpression' && p.argument === node) write = true;
      if (p?.type === 'MemberExpression' && p.object === node
          && p.property?.type === 'Identifier' && MUTATORS.has(p.property.name)) write = true;
      if (name === 'store') {
        // this.store.<method>(...) — the medium is the store, not the field
        const call = p?.type === 'MemberExpression' && p.property?.type === 'Identifier'
          ? p.property.name : null;
        if (call && STORE_READ.has(call)) out.push({ key: storeKey(ctx, 'read'), medium: 'store', line, write: false });
        else if (call && STORE_WRITE.has(call)) out.push({ key: storeKey(ctx, 'write'), medium: 'store', line, write: true });
        else out.push({ key: 'store:*', medium: 'store', line, write: false });
      } else {
        out.push({ key: `this.${name}`, medium: 'this', line, write });
      }
    }

    // this.<method>(...) — a call edge to wherever that method is defined
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression'
        && node.callee.object?.type === 'ThisExpression'
        && node.callee.property?.type === 'Identifier'
        && node.callee.property.name !== 'store') {
      out.push({ key: `method:${node.callee.property.name}`, medium: 'call', line, write: false });
    }

    // rule.<field>, on anything that is not `this`
    if (node.type === 'MemberExpression' && node.object?.type !== 'ThisExpression'
        && node.property?.type === 'Identifier' && ruleFields.has(node.property.name)) {
      const p = ctx.parent;
      const write = p?.type === 'AssignmentExpression' && p.left === node;
      out.push({ key: `rule.${node.property.name}`, medium: 'rule', line, write });
    }
    // { ...r, safe, hasNeg, ... } — the record classify RETURNS
    if ((node.type === 'ObjectProperty' || node.type === 'ObjectMethod')
        && node.key?.type === 'Identifier' && ruleFields.has(node.key.name)) {
      out.push({ key: `rule.${node.key.name}`, medium: 'rule', line, write: true });
    }

    // locals: a declaration carries the scope it lives in, so a read can be
    // resolved to the RIGHT one of two same-named variables
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
      decls.push({ name: node.id.name, line, from: scope.from, to: scope.to });
    }
    if (node.type === 'Identifier' && ctx.parent?.type !== 'VariableDeclarator'
        && !(ctx.parent?.type === 'MemberExpression' && ctx.parent.property === node)
        && !(ctx.parent?.type === 'ObjectProperty' && ctx.parent.key === node)) {
      const p = ctx.parent;
      reads.push({ name: node.name, line, write: p?.type === 'AssignmentExpression' && p.left === node });
    }

    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'type' || k === 'leadingComments' || k === 'trailingComments') continue;
      walk(node[k], { fn, parent: node, scope });
    }
  };
  const storeKey = (_c: Ctx, _kind: string) => 'store:*';
  walk(ast.program, { fn: 'top', parent: null, scope: { from: 1, to: Number.MAX_SAFE_INTEGER } });

  // resolve each mention to the INNERMOST declaration whose scope contains it.
  // A mention with no such declaration is not a local of this file (an import,
  // a type name, a global) and is dropped rather than guessed at.
  for (const d of decls) out.push({ key: `decl@${d.line}:${d.name}`, medium: 'local', line: d.line, write: true });
  for (const r of reads) {
    let best: Decl | null = null;
    for (const d of decls) {
      if (d.name !== r.name || r.line < d.from || r.line > d.to) continue;
      if (!best || (d.to - d.from) < (best.to - best.from)) best = d;
    }
    if (best) out.push({ key: `decl@${best.line}:${best.name}`, medium: 'local', line: r.line, write: r.write });
  }
  return out;
}

/** The ERule fields, read off the interface rather than typed in. */
export function ruleFieldNames(src: string): Set<string> {
  const ast = parse(src, { sourceType: 'module', plugins: ['typescript'] });
  const out = new Set<string>();
  for (const st of ast.program.body as any[]) {
    const decl = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
    if (decl?.type !== 'TSInterfaceDeclaration' || decl.id?.name !== 'ERule') continue;
    for (const m of decl.body.body) if (m.key?.type === 'Identifier') out.add(m.key.name);
  }
  return out;
}

// ---------------------------------------------------------------------------

export interface Graph {
  edges: Edge[];
  /** store:* edges, kept apart: a dynamic write is an over-approximation and
   *  connects almost everything to the one block that writes derived facts. */
  wildcard: Edge[];
  accesses: number;
  methodBlock: Map<string, Block>;
}

const at = (blocks: Block[], line: number): Block | null =>
  blocks.find((b) => line >= b.from && line <= b.to) ?? null;

export function graph(blocks: Block[] = BLOCKS): Graph {
  const blockAt = (line: number) => at(blocks, line);
  const src = fs.readFileSync(path.join(ROOT, TARGET), 'utf8');
  const fields = ruleFieldNames(src);
  const acc = accesses(src, fields);

  // where each method body starts, so a call becomes an edge to its block
  const methodBlock = new Map<string, Block>();
  for (const m of src.matchAll(/^  (?:private |readonly |static )?([a-zA-Z_][A-Za-z0-9_]*)\(/gm)) {
    const line = src.slice(0, m.index!).split('\n').length;
    const b = blockAt(line);
    if (b) methodBlock.set(m[1], b);
  }

  const writers = new Map<string, Set<Block>>();
  for (const a of acc) {
    if (!a.write) continue;
    const b = blockAt(a.line);
    if (!b) continue;
    let s = writers.get(a.key);
    if (!s) { s = new Set(); writers.set(a.key, s); }
    s.add(b);
  }

  const edges: Edge[] = [];
  const wildcard: Edge[] = [];
  const push = (e: Edge) => (e.key === 'store:*' ? wildcard : edges).push(e);
  for (const a of acc) {
    const from = blockAt(a.line);
    if (!from) continue;
    if (a.medium === 'call') {
      const to = methodBlock.get(a.key.slice('method:'.length));
      if (to && to !== from) push({ from, to, medium: 'call', key: a.key, where: a.line });
      continue;
    }
    if (a.write) continue;
    for (const to of writers.get(a.key) ?? []) {
      if (to !== from) push({ from, to, medium: a.medium, key: a.key, where: a.line });
    }
  }
  // store:* — every store read may be reading what any store writer wrote
  const storeWriters = new Set<Block>();
  for (const a of acc) if (a.medium === 'store' && a.write) { const b = blockAt(a.line); if (b) storeWriters.add(b); }
  for (const a of acc) {
    if (a.medium !== 'store' || a.write) continue;
    const from = blockAt(a.line);
    if (!from) continue;
    for (const to of storeWriters) if (to !== from) wildcard.push({ from, to, medium: 'store', key: 'store:*', where: a.line });
  }
  return { edges, wildcard, accesses: acc.length, methodBlock };
}

// ---------------------------------------------------------------------------
// the question: is the induced subgraph on the six before-A blocks acyclic?

export interface Cycle { members: Block[]; edges: Edge[]; }

export function inducedEdges(g: Graph, set: Block[]): Edge[] {
  const inSet = new Set(set);
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const e of g.edges) {
    if (!inSet.has(e.from) || !inSet.has(e.to)) continue;
    const k = `${e.from.from}->${e.to.from}|${e.medium}|${e.key}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/** Tarjan, so a cycle is reported member by member rather than as a verdict. */
export function sccs(nodes: Block[], edges: Edge[]): Block[][] {
  const idx = new Map<Block, number>(); const low = new Map<Block, number>();
  const on = new Set<Block>(); const stack: Block[] = []; const out: Block[][] = [];
  const adj = new Map<Block, Block[]>();
  for (const n of nodes) adj.set(n, []);
  for (const e of edges) adj.get(e.from)?.push(e.to);
  let counter = 0;
  const strong = (v: Block): void => {
    idx.set(v, counter); low.set(v, counter); counter++;
    stack.push(v); on.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: Block[] = [];
      for (;;) { const w = stack.pop()!; on.delete(w); comp.push(w); if (w === v) break; }
      out.push(comp);
    }
  };
  for (const n of nodes) if (!idx.has(n)) strong(n);
  return out;
}

/** Tiers, bottom first: a block sits above everything it reads. */
export function tiers(nodes: Block[], edges: Edge[]): Block[][] {
  const depth = new Map<Block, number>();
  const adj = new Map<Block, Block[]>();
  for (const n of nodes) adj.set(n, []);
  for (const e of edges) adj.get(e.from)!.push(e.to);
  const visit = (v: Block, seen: Set<Block>): number => {
    if (depth.has(v)) return depth.get(v)!;
    if (seen.has(v)) return 0;             // cycle: reported separately
    seen.add(v);
    let d = 0;
    for (const w of adj.get(v) ?? []) d = Math.max(d, visit(w, seen) + 1);
    depth.set(v, d);
    return d;
  };
  for (const n of nodes) visit(n, new Set());
  const max = Math.max(0, ...[...depth.values()]);
  const out: Block[][] = [];
  for (let i = 0; i <= max; i++) out.push(nodes.filter((n) => depth.get(n) === i));
  return out;
}

const name = (b: Block): string => `${b.from}-${b.to}`;

// ---------------------------------------------------------------------------
// what each rung would cost in REFLECTION
//
// A rung is expressible as rules only over facts the kernel EMITS. The emitted
// surface is read out of the source rather than typed here: any
// `{ rel: V.x, args: [...] }` or `store.add(V.x, persp, [...])` in src/ is an
// emission, and its arity is the length of that argument list. Checking the
// table against the extraction is the control on my own memory — a name I
// believe is emitted and is not shows up as a false claim, not as a footnote.

/** Every relation src/ writes, with the arities it writes them at. -1 means
 *  the argument list is a runtime value, so the arity is not statically known. */
export function emitted(): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  const note = (rel: string, arity: number) => {
    if (!out.has(rel)) out.set(rel, new Set());
    out.get(rel)!.add(arity);
  };
  const V_NAMES = new Map<string, string>();
  const src = new Map<string, string>();
  for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((x) => x.endsWith('.ts'))) {
    src.set(f, fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'));
  }
  // V.x / IFACE.x -> the relation name they stand for
  for (const text of src.values()) {
    for (const m of text.matchAll(/^\s{2}([a-z_]+):\s*'([a-z_]+)',/gm)) V_NAMES.set(m[1], m[2]);
    for (const m of text.matchAll(/([a-z_]+):\s*'([a-z_]+)',\s*([a-z_]+):\s*'([a-z_]+)'/g)) {
      V_NAMES.set(m[1], m[2]); V_NAMES.set(m[3], m[4]);
    }
  }
  const resolve = (tok: string): string | null => V_NAMES.get(tok) ?? null;
  for (const text of src.values()) {
    // { rel: V.x, args: [ ... ] }
    for (const m of text.matchAll(/\{\s*rel:\s*V\.([a-z_]+),\s*args:\s*\[([^\]]*)\]/g)) {
      const rel = resolve(m[1]);
      if (rel) note(rel, m[2].trim() === '' ? 0 : splitTop(m[2]).length);
    }
    // store.add(V.x, persp, [ ... ]) and store.add(IFACE.x, persp, args)
    for (const m of text.matchAll(/\.add\((?:V|IFACE)\.([a-z_]+),\s*[^,]+,\s*(\[[^\]]*\]|[A-Za-z_][A-Za-z0-9_]*)/g)) {
      const rel = resolve(m[1]);
      if (!rel) continue;
      if (m[2].startsWith('[')) {
        const inner = m[2].slice(1, -1).trim();
        note(rel, inner === '' ? 0 : splitTop(inner).length);
      } else note(rel, -1);
    }
  }
  return out;
}

/** Split an argument list on top-level commas. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export interface Need {
  rel: string; arity: number; why: string;
  /** `kernel` — the kernel must WRITE it; `program` — the program writes it and
   *  the kernel only reads it, so a rule can already see it. The distinction is
   *  load-bearing: `semantics/1` is nowhere in the emitted surface and is still
   *  available to rules, because it is an input like `imports` or `collects`. */
  source?: 'kernel' | 'program';
}
export interface TierCost {
  tier: number;
  /** The block's ANCHOR, not its line range: a hand-typed range goes stale the
   *  moment the file moves, and this table printed `632-647` for a block that
   *  had become 666-681. The range is looked up from BLOCKS at report time. */
  anchor: string;
  label: string;
  needs: Need[];
}

/** What each rung reads. Names only — whether each is emitted is looked up. */
export const TIER_COST: TierCost[] = [
  { tier: 0, anchor: 'private classify(r: DRule): ERule {', label: 'range restriction', needs: [
    { rel: 'has_premise', arity: 2, why: 'the premise INDEX: safety is a fold in written order' },
    { rel: 'premise_kind', arity: 3, why: 'pos | neg | bi AT an index — premise_pos/2 carries no index' },
    { rel: 'premise_var', arity: 4, why: '(rule, index, argument position, variable) — which variable stands where' },
    { rel: 'head_var', arity: 3, why: 'the same for the head, including its perspective slot' },
    { rel: 'builtin_at', arity: 3, why: 'the operator AT an index — uses_builtin/2 carries neither index nor operands' },
    { rel: 'builtin_operand', arity: 4, why: '(rule, index, side, variable): `=` binds either way, `is` binds left from right' },
  ] },
  { tier: 1, anchor: 'prepare(): void {', label: 'refuse a reserved head', needs: [
    { rel: 'rule', arity: 1, why: 'the rules to consider' },
    { rel: 'concludes', arity: 2, why: 'the head relation' },
    { rel: 'reserved', arity: 1, why: 'the write-protected table, queryable by §2' },
  ] },
  { tier: 2, anchor: 'this.rules = kept;', label: 'the demand-backed set', needs: [
    { rel: 'concludes', arity: 2, why: 'which rules define a relation' },
    { rel: 'conclusion_tense', arity: 2, why: '@next heads never unfold' },
    { rel: 'premise_pos', arity: 2, why: 'the positive-premise closure' },
  ] },
  { tier: 3, anchor: '// A relation served from the previous evaluation', label: 'what runs at all', needs: [
    { rel: 'premise_neg', arity: 2, why: 'hasNeg: does this rule negate anything' },
  ] },
  { tier: 3, anchor: 'private runWellFounded(): void {', label: 'well-founded admissibility', needs: [
    { rel: 'semantics', arity: 1, source: 'program',
      why: 'the declaration that selects the alternation — an INPUT, read by wellFoundedDeclared' },
  ] },
];

/** A relation the kernel READS from the store but never writes — an input the
 *  program supplies. Read out of src/ the same way the emitted surface is. */
export function readOnlyInputs(): Set<string> {
  const out = new Set<string>();
  for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((x) => x.endsWith('.ts'))) {
    const text = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
    const names = new Map<string, string>();
    for (const m of text.matchAll(/([a-z_]+):\s*'([a-z_]+)'/g)) names.set(m[1], m[2]);
    for (const m of text.matchAll(/relAll\((?:V|IFACE)\.([a-z_]+)\)/g)) {
      const rel = names.get(m[1]);
      if (rel) out.add(rel);
    }
  }
  const em = emitted();
  for (const r of [...out]) if (em.has(r)) out.delete(r);
  return out;
}

export function tierCost(): { tier: number; block: string; have: string[];
                              input: string[]; missing: string[] }[] {
  const em = emitted();
  const inputs = readOnlyInputs();
  return TIER_COST.map((t) => {
    const b = BLOCKS.find((x) => x.anchor === t.anchor);
    if (!b) throw new Error(`tier cost names an anchor no block carries: ${t.anchor}`);
    const have: string[] = []; const input: string[] = []; const missing: string[] = [];
    for (const n of t.needs) {
      const line = `${n.rel}/${n.arity} — ${n.why}`;
      const ar = em.get(n.rel);
      if (ar !== undefined && (ar.has(n.arity) || ar.has(-1))) have.push(line);
      else if (n.source === 'program' && inputs.has(n.rel)) input.push(line);
      else missing.push(line);
    }
    return { tier: t.tier, block: `${b.from}-${b.to} ${t.label}`, have, input, missing };
  });
}

// ---------------------------------------------------------------------------
// the minimal tier 0: the dumbest thing that can run boot.rofl's monotone half

/** Method spans, from the AST: a call at line L belongs to the method whose
 *  body contains L. */
export function methods(src: string): { name: string; from: number; to: number }[] {
  const ast = parse(src, { sourceType: 'module', plugins: ['typescript'] });
  const out: { name: string; from: number; to: number }[] = [];
  const walk = (n: any): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const x of n) walk(x); return; }
    if ((n.type === 'ClassMethod' || n.type === 'FunctionDeclaration')
        && (n.key?.name || n.id?.name)) {
      const name = n.key?.name ?? n.id?.name;
      if (name && n.loc) out.push({ name, from: n.loc.start.line, to: n.loc.end.line });
    }
    for (const k of Object.keys(n)) if (k !== 'loc') walk(n[k]);
  };
  walk(ast.program);
  return out;
}

/** Reachability over the call graph, from the monotone driver. Branch-blind:
 *  `matchPremise` calls `negHolds` and `solveDemandRule` on branches a monotone
 *  core never takes, so those are named and subtracted rather than silently
 *  dropped — the over-approximation and the judgement are both visible. */
export const NOT_MONOTONE = new Map<string, string>([
  ['negHolds', 'negation: a monotone core has none'],
  ['solveDemandRule', 'top-down unfolding at a call site: excluded by assumption'],
  ['assumptionOf', 'the alternation only'],
  ['wfsRound', 'the alternation only'],
  ['runWellFounded', 'the alternation only'],
  ['planReuse', 'reuse only'],
  ['reused', 'reuse only'],
  ['readStrata', 'orders negation phases; there are none'],
  ['negPhase', 'orders negation phases; there are none'],
  ['negLevel', 'orders negation phases; there are none'],
  ['checkUnstratified', 'the rejection path: a refusal, not the fixpoint'],
  ['whyText', 'renders the rejection demonstration'],
  ['strataPlan', 'test accessor'],
  ['readsProvenance', 'reuse and retention only'],
]);

export function minimalCore(): { all: Set<string>; kept: Set<string>; codeAll: number; codeKept: number;
                                 blocks: { block: Block; code: number; methods: string[] }[] } {
  const src = fs.readFileSync(path.join(ROOT, TARGET), 'utf8');
  const ms = methods(src);
  const acc = accesses(src, ruleFieldNames(src));
  const owner = (line: number) => ms.filter((m) => line >= m.from && line <= m.to)
    .sort((a, b) => (a.to - a.from) - (b.to - b.from))[0]?.name ?? null;
  const calls = new Map<string, Set<string>>();
  for (const a of acc) {
    if (a.medium !== 'call') continue;
    const from = owner(a.line);
    if (!from) continue;
    if (!calls.has(from)) calls.set(from, new Set());
    calls.get(from)!.add(a.key.slice('method:'.length));
  }
  const reach = (seeds: string[], skip: Set<string>): Set<string> => {
    const seen = new Set<string>(); const q = [...seeds];
    while (q.length) {
      const m = q.pop()!;
      if (seen.has(m) || skip.has(m)) continue;
      seen.add(m);
      for (const c of calls.get(m) ?? []) q.push(c);
    }
    return seen;
  };
  const all = reach(['activate'], new Set());
  const kept = reach(['activate'], new Set(NOT_MONOTONE.keys()));
  const lines = new Map<string, number>();
  const srcLines = src.split('\n');
  const isCode = (l: string) => l.trim() !== '' && !/^\s*(\/\/|\*|\/\*)/.test(l);
  for (const m of ms) {
    const seg = srcLines.slice(m.from - 1, m.to);
    lines.set(m.name, Math.max(lines.get(m.name) ?? 0, seg.filter(isCode).length));
  }
  const sum = (set: Set<string>) => [...set].reduce((a, m) => a + (lines.get(m) ?? 0), 0);
  const blocks: { block: Block; code: number; methods: string[] }[] = [];
  for (const b of BLOCKS) {
    const inB = [...kept].filter((m) => { const d = ms.find((x) => x.name === m); return d && d.from >= b.from && d.from <= b.to; });
    if (inB.length === 0) continue;
    const seg = srcLines.slice(b.from - 1, b.to);
    blocks.push({ block: b, code: seg.filter(isCode).length, methods: inB.sort() });
  }
  return { all, kept, codeAll: sum(all), codeKept: sum(kept), blocks };
}

export function report(): string[] {
  const out: string[] = [];
  const say = (s = '') => out.push(s);
  const g = graph();
  say(`${g.accesses} accesses parsed from ${TARGET}; ` +
    `${g.edges.length} precise edges, ${g.wildcard.length} through store:*`);
  if (g.edges.length === 0) throw new Error('empty graph: the prober is not following data flow');

  // POSITIVE CONTROL, inside the probe
  const readStrata = BLOCKS.find((b) => b.anchor.startsWith('readStrata'))!;
  const conclude = BLOCKS.find((b) => b.anchor.startsWith('private conclude'))!;
  const known = g.wildcard.some((e) => e.from === readStrata && e.to === conclude);
  say(`positive control — ${name(readStrata)} (MAX over stratum/2) reads what ` +
    `${name(conclude)} (phase A writes derived facts) produces: ${known ? 'PRESENT' : 'ABSENT'}`);
  if (!known) throw new Error('positive control absent: the graph is not a measurement');
  say('');

  const ind = inducedEdges(g, BEFORE_A);
  say(`-- edges among the ${BEFORE_A.length} before-A blocks (${ind.length}) ----------------`);
  for (const e of ind) {
    say(`  ${name(e.from).padEnd(9)} -> ${name(e.to).padEnd(9)} reads ${e.key} (${e.medium}) at line ${e.where}`);
  }
  const comps = sccs(BEFORE_A, ind).filter((c) => c.length > 1);
  say('');
  if (comps.length === 0) {
    say('ACYCLIC: no strongly connected component larger than one block.');
    const t = tiers(BEFORE_A, ind);
    t.forEach((layer, i) => {
      say(`  tier ${i}: ${layer.map(name).join(', ') || '(empty)'}`);
      for (const b of layer) say(`      ${name(b)} ${b.cat.padEnd(5)} ${b.what.split('.')[0]}`);
    });
  } else {
    for (const c of comps) {
      say(`CYCLE among ${c.map(name).join(', ')}:`);
      for (const e of ind) if (c.includes(e.from) && c.includes(e.to)) {
        say(`    ${name(e.from)} -> ${name(e.to)} via ${e.key} at line ${e.where}`);
      }
    }
  }

  say('');
  say('-- SENSITIVITY: the one line that sits on a boundary ------------------');
  say('  119 is `this.rules = kept;` — the decode step\'s last act, at the demand');
  say('  block\'s first line. Whichever side it falls on decides whether 214-224');
  say('  reads the decode block or the demand block, so the cut is measured, not');
  say('  argued: the same graph is rebuilt with the boundary moved by one line.');
  const moved = BLOCKS.map((b) => (b.from === 107 ? { ...b, to: 119 }
    : b.from === 119 ? { ...b, from: 120 } : b));
  const g2 = graph(moved);
  const six2 = moved.filter((b) => b.when === 'before-A');
  const ind2 = inducedEdges(g2, six2);
  const comps2 = sccs(six2, ind2).filter((c) => c.length > 1);
  say(`  with 119 in the decode block: ${ind2.length} induced edges, ` +
    `${comps2.length === 0 ? 'still ACYCLIC' : 'CYCLIC'}`);
  tiers(six2, ind2).forEach((layer, i) => say(`    tier ${i}: ${layer.map(name).join(', ')}`));

  say('');
  say(`-- what the ${BEFORE_A.length} read from OUTSIDE them -------------------------------`);
  const inSet = new Set<Block>(BEFORE_A);
  const outward = [...g.edges, ...g.wildcard].filter((e) => inSet.has(e.from) && !inSet.has(e.to));
  const grouped = new Map<string, Set<string>>();
  for (const e of outward) {
    const k = `${name(e.from)} -> ${name(e.to)}`;
    if (!grouped.has(k)) grouped.set(k, new Set());
    grouped.get(k)!.add(e.key);
  }
  for (const [k, keys] of [...grouped].sort()) say(`  ${k.padEnd(26)} ${[...keys].sort().join(', ')}`);

  say('');
  say('-- WHAT EACH RUNG COSTS IN REFLECTION ---------------------------------');
  const em = emitted();
  say(`  emitted surface, read from src/: ${em.size} relations ` +
    `(${[...em.keys()].sort().join(' ')})`);
  for (const t of tierCost()) {
    say(`  tier ${t.tier}  ${t.block}`);
    for (const h of t.have) say(`      emitted today     ${h}`);
    for (const i of t.input) say(`      program input     ${i}`);
    for (const m of t.missing) say(`      NOT AVAILABLE     ${m}`);
  }
  say('');
  say('-- THE MINIMAL TIER 0 -------------------------------------------------');
  const mc = minimalCore();
  say(`  call-graph reachability from activate(): ${mc.all.size} methods, ${mc.codeAll} code lines`);
  say(`  minus the branches a monotone core never takes: ${mc.kept.size} methods, ${mc.codeKept} code lines`);
  say(`  kept: ${[...mc.kept].sort().join(' ')}`);
  const dropped = [...mc.all].filter((m) => !mc.kept.has(m)).sort();
  for (const m of dropped) say(`    dropped ${m.padEnd(18)} ${NOT_MONOTONE.get(m) ?? '(not reached once its caller went)'}`);
  return out;
}

function main(): void { for (const l of report()) console.log(l); }

if (process.argv[1] && fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(path.resolve(new URL(import.meta.url).pathname))) {
  main();
}
