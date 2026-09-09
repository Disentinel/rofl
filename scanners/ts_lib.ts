// ts_lib.ts — THE STANDARD LIBRARY SURFACE, TAKEN FROM TYPESCRIPT'S OWN RECORD.
//
// `stdlib_member[audit]` in rules/js-callgraph.rofl names the residue the call
// graph cannot resolve: a member call whose receiver has a known PROTOTYPE and
// whose method is not a node in this program. `array.join`, `regexp.test`,
// `string.concat`, `bigint.toString`. Naming the residue was
// w_prototype_of_a_value; ATTRIBUTING it — saying which method that is and
// since when it has existed — is w_env_api_surface, and it needs a library the
// model does not have.
//
// IT DOES NOT NEED TO INVENT ONE. `node_modules/typescript/lib` ships 89
// `lib.es*.d.ts` files, and the ERA IS IN THE FILE NAME: `Array.prototype.at`
// is declared in `lib.es2022.array.d.ts` and nowhere earlier, `String.replaceAll`
// in `lib.es2021.string.d.ts`, `Array.prototype.join` in `lib.es5.d.ts`. That is
// TypeScript's own record of when each method landed, maintained by people who
// track the specification, and reading it is cheaper AND more trustworthy than a
// hand-written table this repository would have to keep.
//
// THE CEILING, STATED. This reads DECLARATIONS, not semantics: it says the name
// exists on that prototype from that year, and nothing about what it does. A
// method removed from a later era would not be visible (`feature_since` has no
// `feature_until` twin here for the same reason the era table does not: nothing
// in ECMAScript has been withdrawn). Overloads collapse to one row, which is
// right for a question about NAMES.
//
// PARSED WITH THE TYPESCRIPT COMPILER rather than with a regular expression,
// because the compiler is already a dependency and a regex over a declaration
// file is a model whose ceiling nobody can state.

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

/** the eight prototypes this model can already name a receiver's kind for —
 *  see `kind_prototype` and `builtin_prototype` in rules/js-dataflow.rofl. A
 *  ninth here would be a row no rule reads. */
export const PROTOTYPES = new Map<string, string>([
  ['Array', 'array'], ['String', 'string'], ['Number', 'number'],
  ['Boolean', 'boolean'], ['RegExp', 'regexp'], ['BigInt', 'bigint'],
  ['Object', 'object'], ['Function', 'function'],
]);

/** `lib.es2015.core.d.ts` -> `es2015`, `lib.es5.d.ts` -> `es5`. THE RELEASE AND
 *  NOT THE YEAR, changed 2026-09-08 on the owner's instruction.
 *
 *  A year was the wrong key and this file is where it entered. Three things say
 *  so and the third is right here: `lib.es2022.d.ts` is not a point on an axis,
 *  it is `es2021` PLUS six named parts — an edition is a UNION OF NAMED
 *  RELEASES, and the linearity of pure ecmascript is a consequence rather than
 *  the mechanism. That is why `lib.dom` and `lib.esnext.*` fit the same shape
 *  and no year, and why the model could hold at most ONE ENVIRONMENT PER YEAR
 *  while 2023 alone had node 20, node 21 and four TypeScript releases. */
export function releaseOf(libFile: string): string | null {
  const m = /^lib\.(es5|es\d{4})\b/.exec(libFile);
  return m ? m[1] : null;   // `esnext` and `dom` are excluded: no release to name
}

export interface LibMember {
  proto: string; method: string; since: string; file: string;
  /** the member carries `@deprecated` in its own JSDoc */
  deprecated: boolean;
  /** the replacement the deprecation NAMES, where it names one. Measured
   *  2026-09-08 over the ecmascript lib files: 41 deprecations and TWO name a
   *  replacement (`trimStart`, `trimEnd`). The other 39 read `A legacy feature
   *  for browser compatibility` and name nothing — not because the source is
   *  poor but because there IS no replacement for `blink()` or `substr()`. The
   *  relation is nearly empty in truth, which is worth knowing before anyone
   *  builds a mechanism for it. */
  replacedBy: string | null;
}

/** `includes(Release, Part)` — TypeScript's OWN composition, read from the
 *  `/// <reference lib="..." />` lines. Measured 2026-09-08: every edition file
 *  names exactly one previous EDITION plus between two and nine named parts, so
 *  the chain es5 -> es2015 -> ... -> es2024 is a fact rather than an assumption
 *  about the timeline. */
export function scanComposition(libDir: string): [string, string][] {
  const out: [string, string][] = [];
  for (const f of fs.readdirSync(libDir).sort()) {
    const r = releaseOf(f);
    if (!r || !/^lib\.(es5|es\d{4})\.d\.ts$/.test(f)) continue;
    for (const m of fs.readFileSync(path.join(libDir, f), 'utf8').matchAll(/reference lib="([^"]+)"/g)) {
      if (/^(es5|es\d{4})$/.test(m[1]) && m[1] !== r) out.push([r, m[1]]);
    }
  }
  return out.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : (a[0] < b[0] ? -1 : 1)));
}

/** does `a` come at or before `b` in the composition chain? */
export function before(a: string, b: string, inc = COMPOSITION): boolean {
  if (a === b) return true;
  const seen = new Set<string>(); const todo = [b];
  while (todo.length) {
    const r = todo.pop()!;
    if (r === a) return true;
    if (seen.has(r)) continue;
    seen.add(r);
    for (const [from, to] of inc) if (from === r) todo.push(to);
  }
  return false;
}

const LIB_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname),
                             '..', 'node_modules', 'typescript', 'lib');
const COMPOSITION: [string, string][] = fs.existsSync(LIB_DIR) ? scanComposition(LIB_DIR) : [];

/** every member of the eight prototypes, with the EARLIEST lib file that
 *  declares it — the year it became available. */
export function scanLib(libDir: string): LibMember[] {
  const files = fs.readdirSync(libDir)
    .filter((f) => /^lib\.[a-z0-9.]*\.d\.ts$/.test(f) && releaseOf(f) !== null)
    .sort();
  const earliest = new Map<string, LibMember>();
  for (const f of files) {
    const since = releaseOf(f)!;
    const src = ts.createSourceFile(f, fs.readFileSync(path.join(libDir, f), 'utf8'),
                                    ts.ScriptTarget.Latest, true);
    for (const st of src.statements) {
      if (!ts.isInterfaceDeclaration(st)) continue;
      const proto = PROTOTYPES.get(st.name.text);
      if (!proto) continue;
      for (const mem of st.members) {
        if (!ts.isMethodSignature(mem) && !ts.isPropertySignature(mem)) continue;
        // THE DEPRECATION IS IN THE JSDoc, and the compiler hands the leading
        // comment ranges back rather than parsing the tag for us at this level.
        // Reading the text is the whole of it: `@deprecated` is the flag, and
        // `Use \`X\` instead` is the only structured half of what follows.
        const doc = mem.getFullText(src).slice(0, mem.getStart(src) - mem.getFullStart());
        const deprecated = /@deprecated/.test(doc);
        const rep = /@deprecated[^\n]*?[Uu]se `([^`]+)` instead/.exec(doc);
        // A COMPUTED NAME IS A SYMBOL, and a symbol-keyed member is not a name
        // a member expression in this corpus can spell. `selects[flow]` answers
        // a KEY, so the surface is keyed by names too.
        if (!mem.name || !ts.isIdentifier(mem.name)) continue;
        const key = `${proto}.${mem.name.text}`;
        const prev = earliest.get(key);
        // EARLIEST BY THE COMPOSITION AND NOT BY THE STRING. `es5` sorts after
        // `es2024` alphabetically, so a lexical `<` would date every es5 member
        // to whatever edition it also appears in. The chain below is measured
        // from the `/// <reference lib=` lines, so `before` asks the graph.
        if (!prev || before(since, prev.since)) {
          earliest.set(key, { proto, method: mem.name.text, since, file: f,
                              deprecated, replacedBy: rep ? rep[1] : null });
        }
      }
    }
  }
  return [...earliest.values()]
    .sort((a, b) => (a.proto === b.proto ? (a.method < b.method ? -1 : 1) : (a.proto < b.proto ? -1 : 1)));
}

// ---------------------------------------------------------------------------
// THE MUTATING HALF OF A PROTOTYPE, READ RATHER THAN TYPED.
//
// `w_ambient_prototype_effects` asks whether the array mutators — `push`,
// `pop`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`, `shift`, `unshift`
// — can be READ from a declaration file rather than listed by hand, and its
// note says the honest answer may be no. IT IS YES, AND TYPESCRIPT ALREADY
// WROTE IT DOWN: every mutable collection interface in lib.es*.d.ts has a
// `Readonly` TWIN, and the twin is the same surface WITH THE MUTATING MEMBERS
// REMOVED. So the list is a SET DIFFERENCE over two interfaces in the files
// this scanner already reads, and no part of it is a judgement of ours.
//
// MEASURED 2026-09-09 over the ecmascript lib files, all three twins:
//
//   Array \ ReadonlyArray   copyWithin fill pop push reverse shift sort
//                           splice unshift          <- exactly the nine
//   Map   \ ReadonlyMap     clear delete set
//   Set   \ ReadonlySet     add clear delete
//
// and the REVERSE difference is empty in all three, which is the property the
// subtraction needs: the readonly view declares nothing the mutable interface
// does not, so a member missing from the view is missing because it mutates.
// `viewOnly` carries that direction so it is checked rather than assumed.
//
// ONLY `Array` REACHES A ROW, and that is a fact about THIS model rather than
// about the source. `PROTOTYPES` above is the eight prototypes
// `kind_prototype` can name a receiver for; `Map` and `Set` are not among them
// — their instance surface is what `es_prototype_gap[audit]` already names —
// so rows for them would be rows no rule reads, which this file's own header
// refuses. The measurement is kept and asserted in test/js-lib-surface.test.ts
// off `scanReadonly`'s return value, so the generality of the construction is
// checked without inventing rows for it.
//
// WHAT IT CANNOT SAY, AND IT IS THE OTHER FIVE PROTOTYPES. `String`, `Number`,
// `Boolean`, `RegExp` and `BigInt` have NO readonly twin in any lib file, so
// this source is SILENT about them — not "they have no mutators". The rule
// that reads these rows is guarded on `lib_readonly_view` for exactly that
// reason, and `amb_proto_unsplit[flow]` in rules/js-ambient.rofl is the row
// that says which prototypes are in that state.

export interface LibReadonly {
  /** the lower-case prototype atom, when `PROTOTYPES` has one */
  proto: string | null;
  /** the mutable interface, e.g. `Array` */
  base: string;
  /** the readonly twin, e.g. `ReadonlyArray` */
  view: string;
  /** the members the readonly twin declares */
  readonlyMembers: string[];
  /** base minus twin — the members no readonly view can reach */
  mutators: string[];
  /** twin minus base. Empty for all three twins, and CHECKED rather than
   *  assumed: a member the readonly view declares and the mutable interface
   *  does not would make the subtraction mean something else. */
  viewOnly: string[];
}

/** every `Readonly<X>`/`X` interface pair the ecmascript lib files declare,
 *  with the set difference in both directions. */
export function scanReadonly(libDir: string, sources = libSources(libDir)): LibReadonly[] {
  const members = new Map<string, Set<string>>();
  for (const { src } of sources) {
    for (const st of src.statements) {
      if (!ts.isInterfaceDeclaration(st)) continue;
      for (const mem of st.members) {
        if (!ts.isMethodSignature(mem) && !ts.isPropertySignature(mem)) continue;
        if (!mem.name || !ts.isIdentifier(mem.name)) continue;
        if (!members.has(st.name.text)) members.set(st.name.text, new Set());
        members.get(st.name.text)!.add(mem.name.text);
      }
    }
  }
  const out: LibReadonly[] = [];
  for (const view of [...members.keys()].sort()) {
    if (!/^Readonly./.test(view)) continue;
    const base = view.slice('Readonly'.length);
    const b = members.get(base);
    if (!b) continue;                    // a readonly twin with no mutable one
    const v = members.get(view)!;
    out.push({
      proto: PROTOTYPES.get(base) ?? null, base, view,
      readonlyMembers: [...v].sort(),
      mutators: [...b].filter((m) => !v.has(m)).sort(),
      viewOnly: [...v].filter((m) => !b.has(m)).sort(),
    });
  }
  return out;
}

/** the pack, as text. Deterministic: sorted, and every row carries its source. */
export function emit(members: LibMember[], composition: [string, string][] = COMPOSITION,
                     readonly_: LibReadonly[] = []): string {
  const head = [
    '-- js-lib-surface.rofl — GENERATED by scanners/ts_lib.ts. Do not hand-edit;',
    '-- test/js-lib-surface.test.ts regenerates it and compares, so a hand edit',
    '-- shows up as a failing test rather than as a silent divergence.',
    '--',
    '-- `lib_member(Prototype, Method, Year)` — the name exists on that prototype',
    '-- from that year, read from TypeScript`s own lib.es*.d.ts declarations. The',
    '-- year is the earliest lib file that declares it, which is the record',
    '-- TypeScript keeps of when each method landed.',
    '-- `release(R)` and `includes(R, Part)` are TypeScript`s OWN composition,',
    '-- read from the `/// <reference lib=` lines: an edition is a UNION OF NAMED',
    '-- RELEASES in which the previous edition is one part. The year was the wrong',
    '-- key and this is what replaced it — see',
    '-- f_an_era_is_a_composition_of_releases_and_not_a_year.',
    'edb(lib_member).',
    'edb(release).',
    'edb(includes).',
    '',
  ];
  // THE METHOD IS A QUOTED STRING AND THE PROTOTYPE IS AN ATOM, which is not a
  // style choice: `stdlib_member[audit]` gets its key from `selects[flow]`,
  // which reads an `ast_attr` VALUE, and every attribute value the scanner emits
  // is quoted. The first draft wrote both as atoms, the join produced ZERO rows
  // out of six, and `stdlib_unattributed[audit]` reported all six — the audit
  // written to notice a wrong prototype noticing a wrong TERM TYPE instead,
  // which is the same class of mistake one level down.
  const releases = [...new Set(composition.flat())].sort();
  const comp = [
    ...releases.map((r) => `release(${r}).`), '',
    ...composition.map(([r, p]) => `includes(${r}, ${p}).`), '',
  ];
  const rows = members.map((m) => `lib_member(${m.proto}, ${JSON.stringify(m.method)}, ${m.since}).`);
  const dep = [
    '',
    '-- `lib_deprecated(Prototype, Method)` — the member carries `@deprecated` in',
    '-- TypeScript`s own declaration. `lib_replaced_by` is the half the source can',
    '-- rarely give: MEASURED, 41 deprecations across the ecmascript libs and TWO',
    '-- name a replacement. The other 39 read `A legacy feature for browser',
    '-- compatibility` and name nothing, because there IS no replacement for',
    '-- `blink()` or `substr()`. The relation is nearly empty in truth.',
    'edb(lib_deprecated).',
    'edb(lib_replaced_by).',
    '',
    ...members.filter((m) => m.deprecated)
      .map((m) => `lib_deprecated(${m.proto}, ${JSON.stringify(m.method)}).`),
    '',
    ...members.filter((m) => m.replacedBy)
      .map((m) => `lib_replaced_by(${m.proto}, ${JSON.stringify(m.method)}, ${JSON.stringify(m.replacedBy)}).`),
  ];
  // THE READONLY TWIN, AND THE SUBTRACTION IS NOT DONE HERE. What is emitted is
  // what the declaration SAYS — this interface has a readonly view, and these
  // are the members that view declares — and `lib_mutator` in
  // rules/js-ambient.rofl is the difference. A scanner that emitted the
  // mutators directly would put the one inference in the layer nobody can argue
  // with; as two tables plus a rule, the criterion is a rule body and the check
  // `lib_readonly_only[audit]` can go red.
  const ro = readonly_.filter((r) => r.proto !== null);
  const roBlock = ro.length === 0 ? [] : ['',
    '-- `lib_readonly_view(Prototype, Interface)` — the mutable interface has a',
    '-- `Readonly` TWIN in TypeScript`s own declarations, and',
    '-- `lib_readonly_member` is what that twin declares. THE MUTATING HALF OF A',
    '-- PROTOTYPE IS THE SET DIFFERENCE and it is taken in rules/js-ambient.rofl,',
    '-- not here: `lib_member` minus `lib_readonly_member` over a prototype that',
    '-- HAS a view. Measured over the ecmascript lib files: Array \\ ReadonlyArray',
    '-- is exactly `copyWithin fill pop push reverse shift sort splice unshift`,',
    '-- Map \\ ReadonlyMap is `clear delete set`, Set \\ ReadonlySet is',
    '-- `add clear delete`, and the reverse difference is EMPTY in all three.',
    '-- Only Array reaches a row because only Array is a prototype',
    '-- `kind_prototype` can name a receiver for; the five that have no twin at',
    '-- all are SILENT here rather than mutator-free, which is why the rule is',
    '-- guarded on `lib_readonly_view` having a row.',
    'edb(lib_readonly_view).',
    'edb(lib_readonly_member).',
    '',
    ...ro.map((r) => `lib_readonly_view(${r.proto}, ${JSON.stringify(r.view)}).`),
    '',
    ...ro.flatMap((r) => r.readonlyMembers
      .map((m) => `lib_readonly_member(${r.proto}, ${JSON.stringify(m)}).`)),
  ];
  return head.concat(comp).concat(rows).concat(dep).concat(roBlock).join('\n') + '\n';
}

// ===========================================================================
// THE GLOBALS — the half of the standard library that is not a prototype.
//
// EVERYTHING ABOVE IS A PROTOTYPE METHOD. `lib_member(string, "replaceAll",
// es2021)` answers "which edition added this method to that prototype", and it
// answers nothing about `JSON.parse`, `Promise.all`, `Object.entries` or
// `Math.max` — which are on no prototype and were invisible to the era
// question. That is the hole this section closes, from the SAME files and the
// same `/// <reference lib=` composition.
//
// A GLOBAL HAS THREE SURFACES AND THEY ARE THREE QUESTIONS. TypeScript's own
// declarations keep them apart and so does this scanner:
//
//   the BINDING       `declare var Promise: PromiseConstructor` — the name
//                     exists at all, since es2015.           -> `lib_global`
//   the STATICS       `interface PromiseConstructor { all(...) }` — what hangs
//                     off the NAME.                          -> `lib_static`
//   the PROTOTYPE     `interface Promise<T> { then(...) }` — what hangs off an
//                     INSTANCE.                              -> `lib_member`,
//                     for the eight prototypes `kind_prototype` can reach, with
//                     `lib_global_prototype` as the bridge between the two
//                     keys. A global with no bridge row has an instance surface
//                     this model does not carry, and the bridge being PARTIAL
//                     is how that gap is visible instead of assumed away.
//
// THEY ARE NOT UNIFORM AND THE SCANNER REFUSES TO AVERAGE THEM. Measured over
// the ecmascript lib files, 2026-09-09: FOUR declaration forms, and each is a
// different thing to say about a name.
//
//   constructor_binding 40  `declare var X: XConstructor` — new-able, statics
//                           on `XConstructor`, instances on `X`.
//   namespace_object     3  `declare var X: X` — Math, JSON, Atomics. There is
//                           no constructor interface, `new Math` is not a
//                           thing, and the members ARE the whole surface.
//   namespace_block      2  `declare namespace X` — Reflect, Intl. TypeScript
//                           declares no variable at all; the members are
//                           function and var declarations inside a block.
//   plain_value          2  `declare var NaN: number`, `Infinity`. A global
//                           with NO member surface whatever.
//
// AND `globalThis` IS NOT HERE, which is a measured absence rather than an
// oversight: no `lib.es*.d.ts` declares it — grepped 2026-09-09, the only
// occurrence in the whole lib directory is `globalThis.IteratorObject` inside
// lib.esnext.iterator.d.ts, which is a use and not a declaration. It is a
// compiler intrinsic, so this source cannot date it and the scanner does not
// invent a release for it.
//
// `lib_static_shape` IS THE `Symbol` CASE, TAKEN FROM THE SOURCE. A well-known
// symbol is a KEY and not a call — `Symbol.iterator` exists to be written as a
// computed property name — and TypeScript spells that difference structurally:
// `iterator` is a PropertySignature and `keyFor` is a MethodSignature. So the
// distinction is READ rather than asserted, and `Math.PI` and
// `Number.MAX_SAFE_INTEGER` come out `data` by the same rule and for free.

/** the four shapes a global's declaration takes in the ecmascript lib files */
export type GlobalForm =
  'constructor_binding' | 'namespace_object' | 'namespace_block' | 'plain_value';

export interface LibGlobal {
  name: string; since: string; file: string; form: GlobalForm;
  /** the interface (or namespace) whose members are this global's STATICS.
   *  `null` for `plain_value`, which has none. */
  members: string | null;
}

export interface LibStatic {
  global: string; member: string; since: string; file: string;
  /** `callable` when the declaration is a method or a function — `Math.max`,
   *  `Object.entries`; `data` otherwise — `Math.PI`, `Symbol.iterator`. */
  shape: 'callable' | 'data';
  deprecated: boolean;
}

/** the lib files that name a release, parsed once and shared by both walks */
export function libSources(libDir: string): { file: string; since: string; src: ts.SourceFile }[] {
  return fs.readdirSync(libDir)
    .filter((f) => /^lib\.[a-z0-9.]*\.d\.ts$/.test(f) && releaseOf(f) !== null)
    .sort()
    .map((file) => ({
      file, since: releaseOf(file)!,
      src: ts.createSourceFile(file, fs.readFileSync(path.join(libDir, file), 'utf8'),
                               ts.ScriptTarget.Latest, true),
    }));
}

const hasDeclare = (st: ts.Statement): boolean =>
  (ts.getModifiers(st as ts.HasModifiers) ?? []).some((m) => m.kind === ts.SyntaxKind.DeclareKeyword);

/** the JSDoc immediately above a declaration, as text — the same reading
 *  `scanLib` does, and for the same reason: the compiler hands back leading
 *  comment ranges rather than parsed tags at this level. */
const docOf = (node: ts.Node, src: ts.SourceFile): string =>
  node.getFullText(src).slice(0, node.getStart(src) - node.getFullStart());

/** every global binding the ecmascript lib files declare, with the EARLIEST
 *  release that declares it — by the composition chain, never by the string. */
export function scanGlobals(libDir: string,
                            sources = libSources(libDir),
                            inc: [string, string][] = COMPOSITION): LibGlobal[] {
  const earliest = new Map<string, LibGlobal>();
  const keep = (g: LibGlobal) => {
    const prev = earliest.get(g.name);
    if (!prev || before(g.since, prev.since, inc)) earliest.set(g.name, g);
  };
  for (const { file, since, src } of sources) {
    for (const st of src.statements) {
      // FORMS 1, 2 AND 4 — `declare var X: T`. Which of the three it is comes
      // from the RELATION BETWEEN THE TWO NAMES and nothing else: `Promise:
      // PromiseConstructor` is a constructor, `Math: Math` is a namespace
      // object, `NaN: number` is a value.
      if (ts.isVariableStatement(st) && hasDeclare(st)) {
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name)) continue;
          const name = d.name.text;
          const t = d.type && ts.isTypeReferenceNode(d.type) && ts.isIdentifier(d.type.typeName)
            ? d.type.typeName.text : null;
          if (t === `${name}Constructor`) keep({ name, since, file, form: 'constructor_binding', members: t });
          else if (t === name) keep({ name, since, file, form: 'namespace_object', members: t });
          else keep({ name, since, file, form: 'plain_value', members: null });
        }
      }
      // FORM 3 — `declare namespace X { ... }`.
      if (ts.isModuleDeclaration(st) && ts.isIdentifier(st.name)
          && st.body && ts.isModuleBlock(st.body)) {
        keep({ name: st.name.text, since, file, form: 'namespace_block', members: st.name.text });
      }
    }
  }
  return [...earliest.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** every STATIC member of every global, with the earliest release declaring it */
export function scanStatics(libDir: string,
                            sources = libSources(libDir),
                            globals = scanGlobals(libDir, sources),
                            inc: [string, string][] = COMPOSITION): LibStatic[] {
  // WHICH INTERFACE BELONGS TO WHICH GLOBAL, and the map is what makes this a
  // walk over DECLARED GLOBALS rather than over every interface in the files.
  // `interface Array<T>` is a prototype and `interface ArrayConstructor` is a
  // static surface; only the second is in this map, and `interface Math` is in
  // it only because `declare var Math: Math` put it there.
  const owner = new Map<string, string>();
  for (const g of globals) if (g.members) owner.set(g.members, g.name);
  const declared = new Set(globals.map((g) => g.name));
  const earliest = new Map<string, LibStatic>();
  const keep = (s: LibStatic) => {
    const key = `${s.global}.${s.member}`;
    const prev = earliest.get(key);
    if (!prev || before(s.since, prev.since, inc)) earliest.set(key, s);
  };
  for (const { file, since, src } of sources) {
    for (const st of src.statements) {
      if (ts.isInterfaceDeclaration(st)) {
        const g = owner.get(st.name.text);
        if (!g) continue;
        for (const mem of st.members) {
          // A COMPUTED NAME IS A SYMBOL, and the surface is keyed by names for
          // the same reason `lib_member` is: `selects[flow]` answers a KEY.
          if (!mem.name || !ts.isIdentifier(mem.name)) continue;
          keep({ global: g, member: mem.name.text, since, file,
                 shape: ts.isMethodSignature(mem) ? 'callable' : 'data',
                 deprecated: /@deprecated/.test(docOf(mem, src)) });
        }
      }
      if (ts.isModuleDeclaration(st) && ts.isIdentifier(st.name)
          && st.body && ts.isModuleBlock(st.body) && declared.has(st.name.text)) {
        const g = st.name.text;
        for (const m of st.body.statements) {
          // A NAMESPACE DECLARES VALUES AND TYPES IN ONE BLOCK. `function
          // ownKeys` is a value; `interface NumberFormat` is a TYPE and is not
          // a member anything can select at runtime, so only the value forms
          // are read.
          if (ts.isFunctionDeclaration(m) && m.name) {
            keep({ global: g, member: m.name.text, since, file, shape: 'callable',
                   deprecated: /@deprecated/.test(docOf(m, src)) });
          } else if (ts.isVariableStatement(m)) {
            for (const d of m.declarationList.declarations) {
              if (!ts.isIdentifier(d.name)) continue;
              keep({ global: g, member: d.name.text, since, file, shape: 'data',
                     deprecated: /@deprecated/.test(docOf(m, src)) });
            }
          }
        }
      }
    }
  }
  return [...earliest.values()].sort((a, b) => (a.global === b.global
    ? (a.member < b.member ? -1 : 1) : (a.global < b.global ? -1 : 1)));
}

/** the globals pack, as text. Deterministic: sorted, and generated from the
 *  same files and the same composition as facts/js-lib-surface.rofl. */
export function emitGlobals(globals: LibGlobal[], statics: LibStatic[]): string {
  const forms = [...new Set(globals.map((g) => g.form))].sort();
  const head = [
    '-- js-globals.rofl — GENERATED by scanners/ts_lib.ts. Do not hand-edit;',
    '-- test/js-globals.test.ts regenerates it and compares, so a hand edit',
    '-- shows up as a failing test rather than as a silent divergence.',
    '--',
    '-- THE HALF OF THE STANDARD LIBRARY THAT IS NOT A PROTOTYPE.',
    '-- facts/js-lib-surface.rofl answers `string.replaceAll` and `array.at`; it',
    '-- knows nothing of `JSON.parse`, `Promise.all`, `Object.entries` or',
    '-- `Math.max`, because those hang off a GLOBAL BINDING and not off a',
    '-- prototype. Same source, same `/// <reference lib=` composition, same rule',
    '-- that the earliest release declaring a name is the release it landed in.',
    '--',
    '-- `lib_global(Name, Release, Form)` — THE BINDING. The name exists as a',
    '-- global from that release, in one of four declaration forms. The name is a',
    '-- QUOTED STRING because it is joined against `ast_name`, whose values the',
    '-- scanner quotes; the release and the form are atoms. Writing it as an atom',
    '-- is the mistake MUTANT 5 of test/js-lib-surface.test.ts keeps alive.',
    '-- `lib_static(Name, Member, Release)` — THE STATIC SURFACE: what hangs off',
    '-- the binding. `lib_static_shape(Name, Member, callable|data)` is the same',
    '-- declaration read structurally — a MethodSignature is `callable`, anything',
    '-- else is `data` — which is how `Symbol.iterator` and `Math.PI` come out as',
    '-- KEYS rather than as calls without anybody asserting that they are.',
    '-- `lib_global_prototype(Name, Proto)` — THE BRIDGE to the third surface,',
    '-- the instance one, which facts/js-lib-surface.rofl already carries under a',
    '-- lower-case prototype atom. It is PARTIAL BY CONSTRUCTION: eight globals',
    '-- have a row, because eight is what `kind_prototype` in',
    '-- rules/js-dataflow.rofl can name a receiver for. `Promise`, `Map` and',
    '-- `Set` have an instance surface this model does not carry, and the missing',
    '-- bridge row is where that is visible.',
    '--',
    '-- `globalThis` IS ABSENT AND THAT IS A FACT ABOUT THE SOURCE: no',
    '-- lib.es*.d.ts declares it, so nothing here can date it. It is not omitted',
    '-- by choice, and a row for it would be invented rather than read.',
    'edb(lib_global).',
    'edb(lib_global_form).',
    'edb(lib_static).',
    'edb(lib_static_shape).',
    'edb(lib_global_prototype).',
    '',
    '-- the four forms, so a rule can range over them by name rather than',
    '-- spelling one and silently missing the other three.',
    ...forms.map((f) => `lib_global_form(${f}).`),
    '',
  ];
  const rows = globals.map((g) => `lib_global(${JSON.stringify(g.name)}, ${g.since}, ${g.form}).`);
  const bridge = ['',
    '-- the bridge to the prototype surface, for the eight prototypes',
    '-- `kind_prototype` can name a receiver for.',
    ...globals.filter((g) => PROTOTYPES.has(g.name))
      .map((g) => `lib_global_prototype(${JSON.stringify(g.name)}, ${PROTOTYPES.get(g.name)}).`),
    ''];
  const sts = statics.map((s) =>
    `lib_static(${JSON.stringify(s.global)}, ${JSON.stringify(s.member)}, ${s.since}).`);
  const shapes = ['',
    ...statics.map((s) =>
      `lib_static_shape(${JSON.stringify(s.global)}, ${JSON.stringify(s.member)}, ${s.shape}).`)];
  // NOT ONE DEPRECATED STATIC, MEASURED. `lib_deprecated` has seventeen rows on
  // the eight prototypes and this walk finds ZERO across the static surface, so
  // the number is written into the pack as prose rather than as an empty `edb`
  // no rule could ever read. The branch below exists so that the day a static
  // IS deprecated, the pack grows a relation instead of staying silent.
  const dep = statics.filter((s) => s.deprecated);
  const depBlock = dep.length === 0
    ? ['',
       '-- NO STATIC IN THE ECMASCRIPT LIB FILES CARRIES `@deprecated`, measured',
       `-- over all ${statics.length} of them. \`lib_deprecated\` has seventeen rows on the`,
       '-- eight prototypes; the static surface has none. No relation is declared',
       '-- for a set that is empty in the SOURCE rather than empty here.']
    : ['', 'edb(lib_static_deprecated).',
       ...dep.map((s) => `lib_static_deprecated(${JSON.stringify(s.global)}, ${JSON.stringify(s.member)}).`)];
  return head.concat(rows).concat(bridge).concat(sts).concat(shapes).concat(depBlock).join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const lib = path.join(root, 'node_modules', 'typescript', 'lib');
  const out = emit(scanLib(lib), COMPOSITION, scanReadonly(lib));
  const dest = path.join(root, 'facts', 'js-lib-surface.rofl');
  fs.writeFileSync(dest, out);
  console.log(`${dest}: ${out.split('\n').filter((l) => l.startsWith('lib_member')).length} members`);
  const sources = libSources(lib);
  const globals = scanGlobals(lib, sources);
  const statics = scanStatics(lib, sources, globals);
  const gout = emitGlobals(globals, statics);
  const gdest = path.join(root, 'facts', 'js-globals.rofl');
  fs.writeFileSync(gdest, gout);
  console.log(`${gdest}: ${globals.length} globals, ${statics.length} statics`);
}
