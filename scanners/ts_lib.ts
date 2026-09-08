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

/** the pack, as text. Deterministic: sorted, and every row carries its source. */
export function emit(members: LibMember[], composition: [string, string][] = COMPOSITION): string {
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
  return head.concat(comp).concat(rows).concat(dep).join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const out = emit(scanLib(path.join(root, 'node_modules', 'typescript', 'lib')));
  const dest = path.join(root, 'facts', 'js-lib-surface.rofl');
  fs.writeFileSync(dest, out);
  console.log(`${dest}: ${out.split('\n').filter((l) => l.startsWith('lib_member')).length} members`);
}
