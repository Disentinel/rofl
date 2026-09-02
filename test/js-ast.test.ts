// js-ast.test.ts — the scanner's completeness gate.
//
// THE ORACLE IS A SECOND WALKER. `independentWalk` below re-implements the
// traversal from babel's AST — its own recursion, its own skip set, its own
// snake-casing — and produces three multisets of SIGNATURES that name nothing
// the scanner minted: a node is `kind|file|line`, an edge is
// `parentKind|field|index|childKind`, an attribute is `kind|key|term`. The
// scanner's facts are then decoded back into the same shape and the two are
// compared with deepEqual on sorted arrays, which is a count identity AND a
// content identity on each of the four relations.
//
// Why signatures rather than ids: an id-level comparison would have to
// re-derive the scanner's id scheme, which would make the oracle a copy of
// the thing it checks. Signatures are blind to ids, so id CHOICES are checked
// separately — uniqueness, tree shape, and the cross-file disjointness that
// is the whole point of the per-file prefix.
//
// Every count this file measures is PRINTED. A completeness identity between
// two empty multisets is a true statement about nothing, so the floors below
// (and the printed numbers) are what separate "the walkers agree" from "the
// walkers both did nothing".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from '@babel/parser';
import { Rofl } from '../src/api.ts';
import { parseProgram } from '../src/parser.ts';
import { type Term } from '../src/unify.ts';
import { scan, AST_RELATIONS } from '../scanners/js_ast.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIX = path.join(ROOT, 'test', 'fixtures', 'js');

// The fixtures carry a `.txt` tail because tsconfig.json includes `test/**/*.ts`
// and a fixture is source to be PARSED, not source to be typechecked: as `.ts`
// it produced nine TS2304 errors for names it deliberately never declares.
const ORDER_SRC = fs.readFileSync(path.join(FIX, 'order.ts.txt'), 'utf8');
const FLOW_SRC = fs.readFileSync(path.join(FIX, 'flow.js.txt'), 'utf8');
const ORDER_FILE = 'test/fixtures/js/order.ts';
const FLOW_FILE = 'test/fixtures/js/flow.js';

// ---------------------------------------------------------------------------
// reading the scanner's output back, through the language's own parser (which
// makes every assertion below rest on the facts being SYNTACTICALLY VALID)

interface Row { rel: string; persp: string; args: Term[] }

function rows(facts: string[]): Row[] {
  return parseProgram(facts.join('\n')).map((c) => {
    assert.equal(c.body.length, 0, 'a scanner emits facts, never rules');
    assert.equal(c.head.persp.k, 'a', 'the ledger must be a literal atom');
    return {
      rel: c.head.rel,
      persp: (c.head.persp as { k: 'a'; name: string }).name,
      args: c.head.args,
    };
  });
}

const atomArg = (t: Term): string => {
  assert.equal(t.k, 'a', `expected an atom, got ${JSON.stringify(t)}`);
  return (t as { k: 'a'; name: string }).name;
};
const strArg = (t: Term): string => {
  assert.equal(t.k, 's', `expected a string, got ${JSON.stringify(t)}`);
  return (t as { k: 's'; v: string }).v;
};
const intArg = (t: Term): number => {
  assert.equal(t.k, 'i', `expected an integer, got ${JSON.stringify(t)}`);
  return (t as { k: 'i'; v: number }).v;
};
/** a value term as `<kind>:<text>`, the shape the oracle also speaks */
const termSig = (t: Term): string =>
  t.k === 's' ? 's:' + t.v : t.k === 'a' ? 'a:' + t.name : t.k === 'i' ? 'i:' + String(t.v)
    : assert.fail(`ast_attr value must be a string, atom or integer, got ${JSON.stringify(t)}`);

// ---------------------------------------------------------------------------
// THE ORACLE: an independent traversal of the same AST

interface Sig { nodes: string[]; children: string[]; attrs: string[] }

/** this test's own copy of the naming convention, so the oracle shares no
 *  code with the scanner beyond `scan` itself */
const snake = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

function independentWalk(src: string, file: string): Sig {
  const ast = parse(src, { sourceType: 'module', plugins: ['typescript'] }) as unknown as Record<string, unknown>;
  const nodes: string[] = [], children: string[] = [], attrs: string[] = [];

  const positional = ['loc', 'start', 'end', 'range', 'type'];
  const carried = (k: string): boolean => !positional.includes(k) && !/Comments$/.test(k);
  const nodeish = (x: unknown): boolean =>
    !!x && typeof x === 'object' && !Array.isArray(x) &&
    typeof (x as { type?: unknown }).type === 'string';
  const kindOf = (x: unknown): string => snake((x as { type: string }).type);
  const lineOf = (x: unknown): number =>
    ((x as { loc?: { start?: { line?: number } } }).loc?.start?.line) ?? 0;
  const value = (v: string | number | boolean): string =>
    typeof v === 'string' ? 's:' + v
      : typeof v === 'boolean' ? 'a:' + String(v)
        : Number.isSafeInteger(v) ? 'i:' + String(v) : 's:' + String(v);

  const recur = (x: Record<string, unknown>): void => {
    nodes.push(`${kindOf(x)}|${file}|${lineOf(x)}`);
    for (const k of Object.keys(x).filter(carried)) {
      const v = x[k];
      if (v === null || v === undefined) continue;
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
          if (!nodeish(v[i])) continue;
          children.push(`${kindOf(x)}|${snake(k)}|${i}|${kindOf(v[i])}`);
          recur(v[i] as Record<string, unknown>);
        }
      } else if (nodeish(v)) {
        children.push(`${kindOf(x)}|${snake(k)}|0|${kindOf(v)}`);
        recur(v as Record<string, unknown>);
      } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        attrs.push(`${kindOf(x)}|${snake(k)}|${value(v)}`);
      }
    }
  };
  recur(ast);
  return { nodes: nodes.sort(), children: children.sort(), attrs: attrs.sort() };
}

/** the same three multisets, decoded out of the scanner's facts */
function scannedSig(facts: string[]): Sig {
  const rs = rows(facts);
  const kind = new Map<string, string>();
  const line = new Map<string, number>();
  const file = new Map<string, string>();
  for (const r of rs) {
    if (r.rel !== 'ast_node') continue;
    assert.equal(r.args.length, 4, 'ast_node/4');
    const id = atomArg(r.args[0]);
    assert.ok(!kind.has(id), `id ${id} emitted twice as a node`);
    kind.set(id, atomArg(r.args[1]));
    file.set(id, strArg(r.args[2]));
    line.set(id, intArg(r.args[3]));
  }
  const nodes: string[] = [], children: string[] = [], attrs: string[] = [];
  for (const r of rs) {
    if (r.rel === 'ast_node') {
      const id = atomArg(r.args[0]);
      nodes.push(`${kind.get(id)}|${file.get(id)}|${line.get(id)}`);
    } else if (r.rel === 'ast_child') {
      assert.equal(r.args.length, 4, 'ast_child/4');
      const p = atomArg(r.args[0]), c = atomArg(r.args[3]);
      assert.ok(kind.has(p), `ast_child parent ${p} has no ast_node`);
      assert.ok(kind.has(c), `ast_child child ${c} has no ast_node`);
      children.push(`${kind.get(p)}|${atomArg(r.args[1])}|${intArg(r.args[2])}|${kind.get(c)}`);
    } else if (r.rel === 'ast_attr') {
      assert.equal(r.args.length, 3, 'ast_attr/3');
      const id = atomArg(r.args[0]);
      assert.ok(kind.has(id), `ast_attr subject ${id} has no ast_node`);
      attrs.push(`${kind.get(id)}|${atomArg(r.args[1])}|${termSig(r.args[2])}`);
    }
  }
  return { nodes: nodes.sort(), children: children.sort(), attrs: attrs.sort() };
}

// ---------------------------------------------------------------------------
// small readers used by the spot checks

interface Index {
  rs: Row[];
  kind: (id: string) => string;
  kids: (id: string) => { field: string; index: number; child: string }[];
  attr: (id: string, key: string) => Term | undefined;
  ofKind: (k: string) => string[];
}

function index(facts: string[]): Index {
  const rs = rows(facts);
  const kind = new Map<string, string>();
  const kids = new Map<string, { field: string; index: number; child: string }[]>();
  const attr = new Map<string, Term>();
  for (const r of rs) {
    if (r.rel === 'ast_node') kind.set(atomArg(r.args[0]), atomArg(r.args[1]));
    else if (r.rel === 'ast_child') {
      const p = atomArg(r.args[0]);
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p)!.push({ field: atomArg(r.args[1]), index: intArg(r.args[2]), child: atomArg(r.args[3]) });
    } else if (r.rel === 'ast_attr') attr.set(atomArg(r.args[0]) + '|' + atomArg(r.args[1]), r.args[2]);
  }
  return {
    rs,
    kind: (id) => kind.get(id) ?? '<none>',
    kids: (id) => (kids.get(id) ?? []).slice().sort((a, b) => a.field < b.field ? -1 : a.field > b.field ? 1 : a.index - b.index),
    attr: (id, key) => attr.get(id + '|' + key),
    ofKind: (k) => [...kind.entries()].filter(([, v]) => v === k).map(([id]) => id),
  };
}

// ===========================================================================

test('the scanner emits EXACTLY the four contract relations, into [code]', () => {
  const out = scan(ORDER_SRC, { file: ORDER_FILE });
  const seen = [...new Set(rows(out.facts).map((r) => r.rel))].sort();
  console.log(`relations emitted: ${JSON.stringify(seen)} over ${out.facts.length} facts`);

  assert.deepEqual(seen, ['ast_attr', 'ast_child', 'ast_file', 'ast_node'],
    'a fifth relation here is a judgement wearing a relation name');
  assert.deepEqual([...AST_RELATIONS].sort(), seen, 'the exported list and the output must agree');

  // POSITIVE CONTROL for the assertion above: a set of four is only meaningful
  // because all four are actually populated.
  for (const rel of seen) {
    const n = rows(out.facts).filter((r) => r.rel === rel).length;
    console.log(`  ${rel}: ${n}`);
    assert.ok(n > 0, `${rel} emitted nothing`);
  }

  assert.deepEqual([...new Set(rows(out.facts).map((r) => r.persp))], ['code']);
  const other = scan(ORDER_SRC, { file: ORDER_FILE, persp: 'other' });
  assert.deepEqual([...new Set(rows(other.facts).map((r) => r.persp))], ['other'],
    'and the ledger is an option, not a constant');

  // No conclusion smuggled in as an ATOM. The relation-set assertion above is
  // the strong form for relation NAMES; a judgement can still hide in a Kind,
  // a Field or a Key, which are atoms too. String VALUES are exempt on
  // purpose: they are the scanned program's own text, and a variable named
  // `policy` is the subject talking, not the scanner.
  const atoms = new Set<string>();
  for (const r of rows(out.facts)) for (const t of r.args) if (t.k === 'a') atoms.add(t.name);
  console.log(`distinct atoms in argument position: ${atoms.size}`);
  assert.ok(atoms.has('file') && atoms.has('identifier'), 'positive control: kinds are atoms');
  for (const banned of ['dataflow', 'mech', 'handled', 'policy', 'covered']) {
    assert.ok(!atoms.has(banned), `the scanner judged something: the atom ${banned}`);
  }
});

test('COMPLETENESS: an independent walk of the AST finds nothing the facts miss', () => {
  const want = independentWalk(ORDER_SRC, ORDER_FILE);
  const got = scannedSig(scan(ORDER_SRC, { file: ORDER_FILE }).facts);

  console.log(`oracle:  ${want.nodes.length} nodes, ${want.children.length} edges, ${want.attrs.length} attrs`);
  console.log(`scanner: ${got.nodes.length} nodes, ${got.children.length} edges, ${got.attrs.length} attrs`);

  // Floors first: without them two empty walks would "agree".
  // measured on this fixture: 75 / 74 / 55. The floors sit well under those
  // and well over zero, which is all they are for.
  assert.ok(want.nodes.length > 50, `oracle saw only ${want.nodes.length} nodes`);
  assert.ok(want.children.length > 50, `oracle saw only ${want.children.length} edges`);
  assert.ok(want.attrs.length > 30, `oracle saw only ${want.attrs.length} attrs`);

  assert.deepEqual(got.nodes, want.nodes, 'ast_node is not the set of babel nodes');
  assert.deepEqual(got.children, want.children, 'ast_child is not the parent/field/index tree');
  assert.deepEqual(got.attrs, want.attrs, 'ast_attr is not the set of scalar own properties');
});

test('COMPLETENESS holds on the second fixture too', () => {
  const want = independentWalk(FLOW_SRC, FLOW_FILE);
  const got = scannedSig(scan(FLOW_SRC, { file: FLOW_FILE }).facts);
  console.log(`flow.js: ${want.nodes.length} nodes, ${want.children.length} edges, ${want.attrs.length} attrs`);
  assert.ok(want.nodes.length > 10);
  assert.deepEqual(got.nodes, want.nodes);
  assert.deepEqual(got.children, want.children);
  assert.deepEqual(got.attrs, want.attrs);
});

test('ast_file names the root, and the root is the File node', () => {
  const out = scan(ORDER_SRC, { file: ORDER_FILE });
  const fileRows = rows(out.facts).filter((r) => r.rel === 'ast_file');
  assert.equal(fileRows.length, 1, 'one ast_file per parsed file');
  assert.equal(atomArg(fileRows[0].args[0]), out.root);
  assert.equal(strArg(fileRows[0].args[1]), ORDER_FILE);

  const ix = index(out.facts);
  assert.equal(ix.kind(out.root), 'file');
  assert.deepEqual(ix.ofKind('file'), [out.root], 'exactly one File node');
});

test('the facts are a TREE: one parent each, root excepted, no orphans', () => {
  const out = scan(ORDER_SRC, { file: ORDER_FILE });
  const rs = rows(out.facts);
  const ids = rs.filter((r) => r.rel === 'ast_node').map((r) => atomArg(r.args[0]));
  assert.equal(new Set(ids).size, ids.length, 'ids are unique within a file');

  const parents = new Map<string, number>();
  for (const r of rs.filter((x) => x.rel === 'ast_child')) {
    const c = atomArg(r.args[3]);
    parents.set(c, (parents.get(c) ?? 0) + 1);
  }
  const rootless = ids.filter((id) => !parents.has(id));
  assert.deepEqual(rootless, [out.root], `exactly the File node has no parent, got ${JSON.stringify(rootless)}`);
  for (const [c, n] of parents) assert.equal(n, 1, `${c} has ${n} parents`);
  console.log(`tree: ${ids.length} nodes, ${parents.size} parented`);
});

test('the fact list is DETERMINISTIC and in pre-order', () => {
  // Neither property is in the four-relation contract, and both were found by
  // mutants that the completeness identity SLEPT THROUGH: the oracle sorts, so
  // it is blind to the order facts arrive in, and its signatures are id-blind,
  // so it is blind to which ids a second scan hands out.
  //
  // They matter anyway. materialize.ts caches fact files by content hash, so a
  // scanner whose second scan of an unchanged file differs by one byte churns
  // every fact file and moves every golden; and a fact file whose parents come
  // after their children is unreadable as a tree by a human diffing it.
  const a = scan(ORDER_SRC, { file: ORDER_FILE });
  const b = scan(ORDER_SRC, { file: ORDER_FILE });
  assert.ok(a.facts.length > 100, `only ${a.facts.length} facts — identity would prove little`);
  assert.deepEqual(a.facts, b.facts, 'a second scan of the same file must be byte-identical');

  const rs = rows(a.facts);
  assert.equal(rs[0].rel, 'ast_node', 'the first fact is a node');
  assert.equal(atomArg(rs[0].args[0]), a.root, 'and it is the root');
  assert.equal(rs[rs.length - 1].rel, 'ast_file', 'ast_file closes the file');

  const seen = new Set<string>();
  for (const r of rs) {
    if (r.rel === 'ast_node') { seen.add(atomArg(r.args[0])); continue; }
    if (r.rel === 'ast_child') {
      assert.ok(seen.has(atomArg(r.args[0])), 'an edge names a parent not yet declared');
      assert.ok(seen.has(atomArg(r.args[3])), 'an edge names a child not yet declared');
    } else {
      assert.ok(seen.has(atomArg(r.args[0])), `${r.rel} names a node not yet declared`);
    }
  }
  console.log(`pre-order: ${rs.length} facts, ${seen.size} nodes declared before use`);
});

test('IDS ARE UNIQUE ACROSS FILES: the same source under two names cannot collide', () => {
  // The sharpest input available: identical text, so without a per-file
  // prefix the two id sequences would be character-for-character equal.
  const a = scan(ORDER_SRC, { file: 'a/order.ts' });
  const b = scan(ORDER_SRC, { file: 'b/order.ts' });
  const idsOf = (f: string[]): Set<string> =>
    new Set(rows(f).filter((r) => r.rel === 'ast_node').map((r) => atomArg(r.args[0])));
  const A = idsOf(a.facts), B = idsOf(b.facts);

  // POSITIVE CONTROL: both scans produced the same number of ids, so an empty
  // intersection cannot be an empty scan.
  console.log(`cross-file: ${A.size} ids vs ${B.size} ids, prefixes ${a.prefix} / ${b.prefix}`);
  assert.equal(A.size, B.size);
  assert.ok(A.size > 50, `only ${A.size} ids — an empty intersection would prove nothing`);
  assert.notEqual(a.prefix, b.prefix);

  const shared = [...A].filter((id) => B.has(id));
  assert.deepEqual(shared, [], `${shared.length} ids collide across files`);

  // ...and the File column follows the option, so a fact can be pointed at.
  const fileCol = (f: string[]): string[] =>
    [...new Set(rows(f).filter((r) => r.rel === 'ast_node').map((r) => strArg(r.args[2])))];
  assert.deepEqual(fileCol(a.facts), ['a/order.ts']);
  assert.deepEqual(fileCol(b.facts), ['b/order.ts']);

  // the same path twice is the same prefix — the scheme is a function of the path
  assert.equal(scan(FLOW_SRC, { file: 'a/order.ts' }).prefix, a.prefix);
});

test('ORDER SURVIVES: call arguments keep their positions', () => {
  const ix = index(scan(ORDER_SRC, { file: ORDER_FILE }).facts);
  const name = (id: string): string | undefined => {
    const t = ix.attr(id, 'name');
    return t === undefined ? undefined : strArg(t);
  };
  const calls = ix.ofKind('call_expression').filter((id) =>
    ix.kids(id).some((k) => k.field === 'callee' && name(k.child) === 'pick'));
  assert.equal(calls.length, 1, 'the fixture has exactly one pick(...) call');

  const argEdges = ix.kids(calls[0]).filter((k) => k.field === 'arguments');
  console.log(`pick(...) arguments: ${JSON.stringify(argEdges.map((k) => [k.index, name(k.child)]))}`);
  assert.deepEqual(argEdges.map((k) => k.index), [0, 1, 2], 'positions must be 0,1,2');
  assert.deepEqual(argEdges.map((k) => name(k.child)), ['alpha', 'beta', 'gamma']);
});

test('ORDER SURVIVES: an array hole consumes its position', () => {
  const ix = index(scan(ORDER_SRC, { file: ORDER_FILE }).facts);
  const arrays = ix.ofKind('array_expression');
  assert.equal(arrays.length, 1, 'the fixture has exactly one array literal');
  const els = ix.kids(arrays[0]).filter((k) => k.field === 'elements');
  console.log(`[1, , 3] element indices: ${JSON.stringify(els.map((k) => k.index))}`);
  assert.deepEqual(els.map((k) => k.index), [0, 2],
    'the hole emits no child and still costs index 1');
});

test('BOOLEANS AND NUMBERS SURVIVE, as bare terms', () => {
  const ix = index(scan(ORDER_SRC, { file: ORDER_FILE }).facts);
  const bare = (id: string, key: string): string => {
    const t = ix.attr(id, key);
    assert.ok(t, `${ix.kind(id)} has no ${key}`);
    return termSig(t!);
  };
  const name = (id: string): string | undefined => {
    const t = ix.attr(id, 'name');
    return t === undefined ? undefined : strArg(t);
  };

  // `o.m()` vs `o[k]()` — the discrimination the contract names explicitly
  const members = ix.ofKind('member_expression');
  const objName = (id: string): string | undefined => {
    const o = ix.kids(id).find((k) => k.field === 'object');
    return o ? name(o.child) : undefined;
  };
  const dotted = members.find((id) => objName(id) === 'dotted');
  const bracket = members.find((id) => objName(id) === 'bracket');
  assert.ok(dotted && bracket, 'both member forms must be present');
  assert.equal(bare(dotted!, 'computed'), 'a:false', 'dotted.member is not computed');
  assert.equal(bare(bracket!, 'computed'), 'a:true', 'bracket[key] IS computed');

  // optional chaining
  const optional = ix.ofKind('optional_member_expression');
  assert.ok(optional.length >= 1, 'the fixture has an optional member');
  assert.equal(bare(optional[0], 'optional'), 'a:true');

  // async / generator on the function, static on the class member
  const fn = ix.ofKind('function_declaration');
  assert.equal(fn.length, 1);
  assert.equal(bare(fn[0], 'async'), 'a:true');
  assert.equal(bare(fn[0], 'generator'), 'a:true');
  const prop = ix.ofKind('class_property');
  assert.equal(prop.length, 1);
  assert.equal(bare(prop[0], 'static'), 'a:true');

  // numbers: an integer is an integer term; a number the grammar cannot spell
  // keeps its value as a string rather than vanishing
  const nums = ix.ofKind('numeric_literal').map((id) => bare(id, 'value')).sort();
  console.log(`numeric_literal values: ${JSON.stringify(nums)}`);
  assert.ok(nums.includes('i:17'), 'an integer stays an integer');
  assert.ok(nums.includes('s:1.5'), 'a fraction is kept as its decimal string');

  // a string with an embedded quote round-trips through the fact syntax
  const strs = ix.ofKind('string_literal').map((id) => strArg(ix.attr(id, 'value')!));
  assert.ok(strs.includes('he said "hi"'), `escaping lost the quote: ${JSON.stringify(strs)}`);
});

test('COMMENTS are captured once, through File.comments', () => {
  const ix = index(scan(ORDER_SRC, { file: ORDER_FILE }).facts);
  const comments = ix.ofKind('comment_line');
  assert.equal(comments.length, 1, 'one comment node, not one per back-reference');
  assert.ok(strArg(ix.attr(comments[0], 'value')!).includes('line comment'));
  // the duplicate views babel hangs off the commented node are NOT walked
  const edges = ix.rs.filter((r) => r.rel === 'ast_child').map((r) => atomArg(r.args[1]));
  assert.ok(!edges.some((f) => f.endsWith('_comments')), `back-reference edge emitted: ${JSON.stringify([...new Set(edges)])}`);
});

test('an empty source still emits a File and a Program — the walker demonstrably ran', () => {
  const out = scan('', { file: 'empty.js' });
  console.log(`empty source: ${out.facts.length} facts, kinds ${JSON.stringify([...out.kinds].sort())}`);
  assert.ok(out.nodes >= 2, 'File and Program at minimum');
  assert.deepEqual(scannedSig(out.facts), independentWalk('', 'empty.js'));
});

// ===========================================================================
// THE FACTS ARE A PROGRAM: they load, and the structure rules run over them.

const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
const STRUCTURE = fs.readFileSync(path.join(ROOT, 'rules', 'js-structure.rofl'), 'utf8');
const DATAFLOW = fs.readFileSync(path.join(ROOT, 'rules', 'js-dataflow.rofl'), 'utf8');

function loaded(...programs: string[]): Rofl {
  const r = new Rofl();
  for (const p of programs) {
    const res = r.load(p);
    assert.equal(res.ok, true, res.diagnostics.join('\n'));
  }
  return r;
}

test('rules/js-structure.rofl derives the tree, its closure, and the two names', () => {
  const out = scan(FLOW_SRC, { file: FLOW_FILE });
  const r = loaded(BOOT, 'authority(code, scanner).', STRUCTURE, out.facts.join('\n'));

  const inRows = r.query('ast_in[code](P, C)').rows.length;
  const withinRows = r.query('ast_within[code](P, C)').rows.length;
  const names = r.query('ast_name[code](N, V)').rows.map((x) => x.bindings['V']).sort();
  console.log(`ast_in ${inRows}, ast_within ${withinRows}, ast_name ${names.length}`);

  assert.ok(inRows > 0, 'ast_in derived nothing');
  assert.ok(withinRows > inRows, 'a transitive closure must be strictly larger than one hop here');
  assert.ok(!r.holds(`ast_within[code](${out.root}, ${out.root})`), 'the closure is not reflexive');

  // the root reaches every other node
  const nodeIds = rows(out.facts).filter((x) => x.rel === 'ast_node').map((x) => atomArg(x.args[0]));
  for (const id of nodeIds) {
    if (id === out.root) continue;
    assert.ok(r.holds(`ast_within[code](${out.root}, ${id})`), `root does not reach ${id}`);
  }
  // query bindings come back as the fact syntax renders them, quotes included
  assert.deepEqual([...new Set(names)].sort(), ['"middle"', '"sink"', '"source"', '"unrelated"']);
});

test('rules/js-dataflow.rofl still runs at the new arity', () => {
  const out = scan(FLOW_SRC, { file: FLOW_FILE });
  const r = loaded(BOOT, 'authority(code, scanner).', STRUCTURE, DATAFLOW, out.facts.join('\n'));
  const flows = r.query('var_flow[code](A, B)').rows
    .map((x) => `${x.bindings['A']} -> ${x.bindings['B']}`).sort();
  console.log(`var_flow: ${JSON.stringify(flows)}`);
  assert.deepEqual(flows, ['"middle" -> "sink"', '"source" -> "middle"']);
  assert.ok(r.holds('var_reaches[code]("source", "sink")'), 'the closure carries the chain');
  assert.ok(!r.holds('var_reaches[code]("unrelated", "sink")'), 'and the gate can say no');
});
