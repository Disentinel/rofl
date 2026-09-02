// flag_census.ts — every flag of the public API must be EXERCISED by a demo.
//
// WHAT THIS CATCHES, and it was paid for on 2026-08-31. `retainTicks` —
// provenance pruning at the tick boundary — shipped into `src/api.ts` and the
// tree was accepted twice without anyone noticing that nothing ran it. The
// reason is structural rather than inattention: AN OPT-IN FEATURE IS INVISIBLE
// TO EVERY CHECK HERE BY CONSTRUCTION. The goldens move zero bytes because the
// default path is untouched; the suite stays green because no test passes the
// flag; the kernel grep sees nothing new. A flag that nothing exercises cannot
// go red, so its absence of coverage is not observable from any gate we own.
//
// A demo is the one check that can see it, because a demo has to USE the thing
// to have a point.
//
// THREE THINGS THIS FILE REFUSES TO DO, each of which is how the check would
// quietly stop working:
//
//   1. IT DOES NOT HARDCODE THE FLAGS. They are read out of `src/api.ts` — an
//      optional property of an options object taken by a public method IS a
//      flag. A hardcoded list goes stale on the day a flag is added, which is
//      exactly the day it is needed.
//   2. IT COUNTS CODE, NOT TEXT. Measured the same day: a plain text grep
//      credited `retainTicks` to `examples/npc`, where it appears only in a
//      comment explaining that the kernel now offers what that demo's
//      host-side sweep does by hand — the demo's real path never sets it.
//      Mentioned and exercised look identical to grep and are opposites for
//      this rule. So the corpus is PARSED: a hit is an object-literal property
//      key or a member access in the syntax tree. Comments are not in the tree
//      and string literals are not identifiers, so neither can be mistaken for
//      a use. What the text says is kept in a second column — "mentioned but
//      not exercised" is the state the rule exists to name, not a rounding
//      error.
//   3. IT DOES NOT REPORT A BOOLEAN. A flag with one demo is more fragile than
//      a flag with eighteen, and a gate that only says "no hole" cannot tell
//      the two apart. The table prints the count and the demos, and for a flag
//      carried by fewer than three demos it also prints the call sites, which
//      is the evidence a human needs to see whether the one use is real.
//
// Run: npm run flagcheck

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from '@babel/parser';

// ---------------------------------------------------------------------------
// walking

type Node = Record<string, any>;

/** Every node of the tree, parents before children. Babel's AST is plain
 *  objects; anything with a string `type` is a node and anything else is
 *  either an array of nodes or a leaf. */
function* walk(n: any): Generator<Node> {
  if (n === null || typeof n !== 'object') return;
  if (Array.isArray(n)) { for (const x of n) yield* walk(x); return; }
  if (typeof n.type === 'string') yield n as Node;
  for (const k of Object.keys(n)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' ||
        k === 'innerComments' || k === 'extra') continue;
    yield* walk(n[k]);
  }
}

function parseTs(src: string, file: string): Node {
  try {
    return parse(src, { sourceType: 'module', plugins: ['typescript'], ranges: false }) as unknown as Node;
  } catch (e) {
    throw new Error(`flag census: cannot parse ${file}: ${(e as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// the flags themselves, read out of the API

export interface Flag {
  name: string;
  /** The methods that take it, for the report. */
  where: string[];
}

/** A public method's options object is a type literal of optional members, or
 *  a named interface of them (`WhynotOpts`). Both forms are read; a member
 *  that is NOT optional is a required argument rather than a flag, and a
 *  private method is not the public API. */
export function declaredFlags(src: string, file = 'src/api.ts'): Flag[] {
  const ast = parseTs(src, file);

  const ifaces = new Map<string, Node>();
  for (const n of walk(ast)) {
    if (n.type === 'TSInterfaceDeclaration' && n.id?.name) ifaces.set(n.id.name, n);
  }

  const found = new Map<string, Set<string>>();
  const note = (name: string, where: string) => {
    if (!found.has(name)) found.set(name, new Set());
    found.get(name)!.add(where);
  };

  const members = (ann: any): Node[] => {
    const t = ann?.typeAnnotation;
    if (!t) return [];
    if (t.type === 'TSTypeLiteral') return t.members ?? [];
    if (t.type === 'TSTypeReference' && t.typeName?.type === 'Identifier') {
      const iface = ifaces.get(t.typeName.name);
      return iface ? (iface.body?.body ?? []) : [];
    }
    return [];
  };

  for (const n of walk(ast)) {
    const isMethod = n.type === 'ClassMethod' || n.type === 'TSDeclareMethod';
    const isFn = n.type === 'FunctionDeclaration';
    if (!isMethod && !isFn) continue;
    if (isMethod && (n.accessibility === 'private' || n.accessibility === 'protected')) continue;
    const owner = n.type === 'ClassMethod' && n.kind === 'constructor'
      ? 'constructor'
      : (n.key?.name ?? n.id?.name ?? '(anonymous)');
    for (const p of n.params ?? []) {
      // `opts: {...} = {}` parses as an AssignmentPattern around the identifier.
      const id = p.type === 'AssignmentPattern' ? p.left : p;
      for (const m of members(id?.typeAnnotation)) {
        if (m.type !== 'TSPropertySignature' || !m.optional) continue;
        if (m.key?.type !== 'Identifier') continue;
        note(m.key.name, owner);
      }
    }
  }

  return [...found.entries()]
    .map(([name, where]) => ({ name, where: [...where].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// the corpus

export interface Source { demo: string; file: string; src: string }

/** Every TypeScript file under `examples/`, attributed to the example
 *  directory it lives in. A demo is a directory, not a file: `examples/slop`
 *  is four files and one demo. */
export function readCorpus(root: string): Source[] {
  const base = path.join(root, 'examples');
  const out: Source[] = [];
  const walkDir = (dir: string, demo: string | null) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walkDir(p, demo ?? e.name); continue; }
      if (!e.name.endsWith('.ts') || e.name.endsWith('.d.ts')) continue;
      out.push({ demo: demo ?? path.basename(e.name, '.ts'), file: path.relative(root, p), src: fs.readFileSync(p, 'utf8') });
    }
  };
  walkDir(base, null);
  return out;
}

// ---------------------------------------------------------------------------
// what a use is
//
// THREE TIERS, AND THE MIDDLE ONE IS WHY THIS IS NOT A GREP.
//
//   A  HANDED IN — the name is a property of an object literal that is an
//      argument to a call, and either the call is a door that declares it
//      (`new Rofl({ reuse: false })`, `r.load(t, { budget: B })`) or the whole
//      literal is an options object for one door being forwarded through a
//      helper (`runCraft({ reuse: false })`, where every key of the literal is
//      a flag of the same method). This is the only tier that counts as
//      exercise. Forwarding has to be allowed or the census would measure
//      factoring style: every demo here wraps its construction in a helper.
//   B  IN CODE, NOT AT A DOOR — the name is somewhere in the syntax tree but
//      not handed to the API: a field of a domain record, a member read.
//      MEASURED, and this is the whole reason tier A is narrow: `examples/drip`
//      and `examples/nope` both hold `naive` — as `upstream_naive` and
//      `access_naive`, the demos' own domain relations, in result records
//      shaped `{ simple, naive }`. A text grep counts them and the corpus
//      state recorded in CLAUDE.md says "naive 2" because of them. No demo
//      passes `naive` to anything.
//   C  TEXT ONLY — a comment or a string. `examples/npc` names `retainTicks`
//      in a comment explaining that the kernel now does by policy what that
//      demo does by hand; its real path never sets it.
//
// B and C are printed rather than discarded: "mentioned but not exercised" is
// the state this rule exists to name, and a flag that is in the code but not
// at a door is a wrapper away from being exercised, which is worth seeing.

export type Tier = 'A' | 'B' | 'C';

export interface Hit { tier: Tier; site: string }

/** The name a call presents at its door: `new Rofl` for a construction,
 *  the method name for a member call, the function name otherwise. */
function doorOf(n: Node): string | null {
  const c = n.callee;
  if (!c) return null;
  if (n.type === 'NewExpression') {
    return c.type === 'Identifier' ? `new ${c.name}` : null;
  }
  if (c.type === 'Identifier') return c.name;
  if ((c.type === 'MemberExpression' || c.type === 'OptionalMemberExpression') &&
      !c.computed && c.property?.type === 'Identifier') return c.property.name;
  return null;
}

/** Property keys of an object literal, non-computed and identifier-named.
 *  Covers `{ a: 1 }`, the shorthand `{ a }` and `{ a() {} }`. */
function keysOf(obj: Node): string[] {
  const out: string[] = [];
  for (const p of obj.properties ?? []) {
    if ((p.type === 'ObjectProperty' || p.type === 'ObjectMethod') && !p.computed && p.key?.type === 'Identifier') {
      out.push(p.key.name);
    }
  }
  return out;
}

/** Does a call's name match a door that declares this flag? `new Rofl` is the
 *  constructor's door; every other door is a method name. */
function opensFor(door: string, where: Set<string> | undefined): boolean {
  if (where === undefined) return false;
  return where.has(door) || (where.has('constructor') && door === 'new Rofl');
}

/** IS THIS LITERAL AN OPTIONS OBJECT FOR THE KERNEL, whatever it is being
 *  handed to?
 *
 *  WHY THE QUESTION IS NEEDED. Demos wrap their construction — CRAM hands
 *  `{ reuse: false }` to its own `runCraft`, which passes it to `head`, which
 *  passes it to `new Rofl`. Insisting the literal sit at the door would fail
 *  every demo in this corpus that has a helper, which is all of them: the
 *  census would be measuring factoring style rather than exercise.
 *
 *  WHY IT IS NOT SIMPLY "ANY LITERAL HANDED TO ANY CALL". `examples/drip`
 *  returns `{ top, from, simple, naive }` from a `.map`, and `naive` is one of
 *  the kernel's flags. What separates the two is that EVERY key of an options
 *  object is a flag of ONE method: `{ naive, reuse }` is a construction, and
 *  `{ top, from, simple, naive }` is a record that happens to contain a word.
 *  Requiring a common door is what makes the difference mechanical. */
function looksLikeOptionsFor(keys: string[], declaredBy: Map<string, Set<string>>): boolean {
  if (keys.length === 0) return false;
  let common: string[] | null = null;
  for (const k of keys) {
    const w = declaredBy.get(k);
    if (w === undefined) return false;                     // a non-flag key: a record
    common = common === null ? [...w] : common.filter((d) => w.has(d));
    if (common.length === 0) return false;                 // no one method takes them all
  }
  return true;
}

/** May a literal handed to this call be a FORWARD rather than a door?
 *
 *  No, on two counts, and both were mutants of the gate's own test:
 *
 *   - A CONSTRUCTION names its class. `new Evaluation(store, { retainTicks: 2 })`
 *     goes to a class that does not take it, and no forwarding argument can
 *     rescue it: the name of the receiver is right there.
 *   - A CALL WHOSE NAME IS A DOOR is a door. `r.query(t, { retainTicks: 2 })`
 *     hands the flag to a method the API declares, and that method does not
 *     take it. Reading it as "a helper called query that forwards" would let
 *     the census bless a mistake it exists to find.
 *
 *  What is left — a call to something the API does not declare — is where a
 *  demo's own helper lives, and that is what forwarding is for. */
function mayForward(door: string, doors: Set<string>): boolean {
  return !door.startsWith('new ') && !doors.has(door);
}

/** Tier A and tier B hits, by name. `declaredBy` decides which doors count
 *  for which flag, and it comes from `src/api.ts` rather than from here. */
export function codeUses(src: string, file: string, declaredBy: Map<string, Set<string>>): Map<string, Hit[]> {
  const ast = parseTs(src, file);
  const doors = new Set<string>();
  for (const w of declaredBy.values()) for (const d of w) doors.add(d);
  const out = new Map<string, Hit[]>();
  const add = (name: string, hit: Hit) => {
    if (!out.has(name)) out.set(name, []);
    out.get(name)!.push(hit);
  };

  // Tier A first, so a door hit is never demoted by the generic sweep below.
  const seen = new Set<Node>();
  for (const n of walk(ast)) {
    if (n.type !== 'CallExpression' && n.type !== 'NewExpression' && n.type !== 'OptionalCallExpression') continue;
    const door = doorOf(n);
    if (door === null) continue;
    for (const a of n.arguments ?? []) {
      if (a.type !== 'ObjectExpression') continue;
      seen.add(a);
      const keys = keysOf(a);
      const forwarded = mayForward(door, doors) && looksLikeOptionsFor(keys, declaredBy);
      for (const k of keys) {
        const opens = opensFor(door, declaredBy.get(k));
        if (opens) add(k, { tier: 'A', site: `${door}(...)` });
        else if (forwarded) add(k, { tier: 'A', site: `${door}(...) forwarding` });
        else add(k, { tier: 'B', site: `${door}(...)` });
      }
    }
  }

  for (const n of walk(ast)) {
    if (n.type === 'ObjectExpression' && !seen.has(n)) {
      for (const k of keysOf(n)) add(k, { tier: 'B', site: 'object literal' });
    }
    if (n.type === 'ObjectPattern') {
      for (const p of n.properties ?? []) {
        if (p.type === 'ObjectProperty' && !p.computed && p.key?.type === 'Identifier') {
          add(p.key.name, { tier: 'B', site: 'destructuring' });
        }
      }
    }
    if ((n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') &&
        !n.computed && n.property?.type === 'Identifier') {
      add(n.property.name, { tier: 'B', site: 'member read' });
    }
  }
  return out;
}

/** A name that appears in the TEXT but not in the tree: comments and string
 *  literals. This is tier C, and it is the column that caught `examples/npc`. */
export function textMentions(src: string, file: string): Set<string> {
  const ast = parseTs(src, file) as any;
  const out = new Set<string>();
  const eat = (s: string) => {
    for (const m of s.matchAll(/[A-Za-z_$][\w$]*/g)) out.add(m[0]);
  };
  for (const c of ast.comments ?? []) eat(c.value);
  for (const n of walk(ast)) {
    if (n.type === 'StringLiteral') eat(String(n.value));
    if (n.type === 'TemplateElement') eat(String(n.value?.cooked ?? ''));
  }
  return out;
}

// ---------------------------------------------------------------------------
// the census

export interface Row {
  flag: string;
  /** The methods that take it. */
  where: string[];
  /** Demos that hand it in at the API door — the ones that count. */
  exercised: string[];
  /** Demos that hold the name in code but never hand it in. */
  inCodeOnly: string[];
  /** Demos that name it only in a comment or a string. */
  textOnly: string[];
  /** The tier-A sites, for the flags thin enough that the evidence matters. */
  sites: string[];
  /** The tier-B sites, printed when there is no tier A at all: it is the
   *  difference between "nobody wrote this word" and "somebody wrote it and
   *  it never reached the kernel". */
  nearMiss: string[];
}

export interface CensusResult {
  rows: Row[];
  demos: number;
  files: number;
  holes: string[];
}

export function census(apiSrc: string, corpus: Source[], apiFile = 'src/api.ts'): CensusResult {
  const flags = declaredFlags(apiSrc, apiFile);
  if (flags.length === 0) {
    throw new Error(`flag census: no flags found in ${apiFile} — the extractor looked and saw nothing, ` +
      'which is a fact about the extractor until something proves otherwise');
  }
  const declaredBy = new Map(flags.map((f) => [f.name, new Set(f.where)]));

  const A = new Map<string, Map<string, Set<string>>>();  // flag -> demo -> sites
  const B = new Map<string, Map<string, Set<string>>>();
  const C = new Map<string, Set<string>>();
  for (const f of flags) { A.set(f.name, new Map()); B.set(f.name, new Map()); C.set(f.name, new Set()); }

  const put = (m: Map<string, Map<string, Set<string>>>, flag: string, demo: string, site: string) => {
    const per = m.get(flag)!;
    if (!per.has(demo)) per.set(demo, new Set());
    per.get(demo)!.add(site);
  };

  for (const s of corpus) {
    for (const [name, hits] of codeUses(s.src, s.file, declaredBy)) {
      if (!declaredBy.has(name)) continue;
      for (const h of hits) put(h.tier === 'A' ? A : B, name, s.demo, h.site);
    }
    const text = textMentions(s.src, s.file);
    for (const f of flags) if (text.has(f.name)) C.get(f.name)!.add(s.demo);
  }

  const rows: Row[] = flags.map((f) => {
    const a = A.get(f.name)!, b = B.get(f.name)!;
    const exercised = [...a.keys()].sort();
    return {
      flag: f.name,
      where: f.where,
      exercised,
      inCodeOnly: [...b.keys()].filter((d) => !a.has(d)).sort(),
      textOnly: [...C.get(f.name)!].filter((d) => !a.has(d) && !b.has(d)).sort(),
      sites: [...new Set([...a.values()].flatMap((x) => [...x]))].sort(),
      nearMiss: [...new Set([...b.values()].flatMap((x) => [...x]))].sort(),
    };
  });

  return {
    rows,
    demos: new Set(corpus.map((s) => s.demo)).size,
    files: corpus.length,
    holes: rows.filter((r) => r.exercised.length === 0).map((r) => r.flag),
  };
}

export function render(res: CensusResult): string {
  const out: string[] = [];
  const w = Math.max(4, ...res.rows.map((r) => r.flag.length));
  const pad = ' '.repeat(w);
  out.push(`flag census: ${res.rows.length} flags of src/api.ts against ${res.demos} demos (${res.files} files)`);
  out.push('');
  out.push(`  ${'flag'.padEnd(w)}  ${'n'.padStart(2)}  demos that hand it to the kernel`);
  out.push(`  ${'-'.repeat(w)}  --  --------------------------------`);
  const order = [...res.rows].sort((a, b) => a.exercised.length - b.exercised.length || a.flag.localeCompare(b.flag));
  for (const r of order) {
    const n = r.exercised.length;
    out.push(`  ${r.flag.padEnd(w)}  ${String(n).padStart(2)}  ${n === 0 ? '— NOT EXERCISED' : r.exercised.join(' ')}`);
    if (r.inCodeOnly.length > 0) {
      out.push(`  ${pad}      in code, never handed in: ${r.inCodeOnly.join(' ')}  [${r.nearMiss.join(', ')}]`);
    }
    if (r.textOnly.length > 0) {
      out.push(`  ${pad}      comment or string only: ${r.textOnly.join(' ')}`);
    }
    // One or two demos is one deletion away from uncovered, so the evidence is
    // printed rather than summarised.
    if (n > 0 && n < 3) {
      out.push(`  ${pad}      sites: ${r.sites.join(' ')}`);
    }
    if (n === 0) {
      out.push(`  ${pad}      taken by: ${r.where.join(' ')}`);
    }
  }
  return out.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).includes('flag_census');
if (isMain) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const apiFile = path.join(root, 'src', 'api.ts');
  const res = census(fs.readFileSync(apiFile, 'utf8'), readCorpus(root));
  console.log(render(res));
  if (res.holes.length > 0) {
    console.error('');
    console.error(`${res.holes.length} flag(s) exercised by no demo: ${res.holes.join(' ')}`);
    console.error('A flag no example runs cannot go red in any gate we own. Write the demo,');
    console.error('or delete the flag — those are the two ways this line goes away.');
    process.exit(1);
  }
  console.log('');
  console.log(`every flag is exercised by at least one demo (${res.demos} demos scanned).`);
}
