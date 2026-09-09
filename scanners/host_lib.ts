// host_lib.ts — THE RUNTIME SURFACE, TAKEN FROM THE TWO HOSTS' OWN RECORDS.
//
// scanners/ts_lib.ts reads TypeScript's `lib.es*.d.ts` and answers what the
// LANGUAGE has: 130 prototype methods of ES built-ins, dated by the edition
// that introduced them. It cannot answer `console.log`, `fs.readFileSync` or
// `fetch`, because none of those is ECMAScript. This file answers those, and
// the first thing it does is refuse to answer them with one relation.
//
// ---------------------------------------------------------------------------
// TWO HOSTS, AND SAYING WHICH IS THE WHOLE POINT.
//
// `lib.dom.d.ts` is the BROWSER. `@types/node` is NODE. They overlap and they
// are not the same surface, and a table that conflated them would be wrong in
// both directions at once. MEASURED HERE, with the ECMAScript baseline factored
// out so that neither host is credited with `JSON` or `Math`:
//
//     lib.esnext alone                     65 globals   (the language)
//     + lib.dom                           +866 globals  (the browser adds)
//     + @types/node                        +73 globals  (node adds)
//     in BOTH hosts                         62
//     in NODE and not the browser           11   Buffer __dirname __filename
//                                                clearImmediate exports gc
//                                                global module process require
//                                                setImmediate
//     in the BROWSER and not node          804
//
// So 804 of the browser's 866 additions are absent from node, and a model that
// read `lib.dom.d.ts` as "the runtime" would tell a node program that
// `document`, `alert` and `XMLHttpRequest` are available to it. `host_global`
// therefore carries the HOST in its first argument and nothing here ever
// projects it away.
//
// ---------------------------------------------------------------------------
// TWO VERSION AXES, AND THEY ARE NOT THE SAME KIND OF SCALE.
//
// The era scale in facts/js-env.rofl is a COMPOSITION: `release(es2022)`,
// `includes(es2022, es2021)`, and the question a rule asks is MEMBERSHIP —
// `reaches[audit](E, R)`, a partial order read from TypeScript's own
// `/// <reference lib=` lines. There is no arithmetic in it anywhere, and
// f_an_era_is_a_composition_of_releases_and_not_a_year is the finding that
// removed the last integer from it.
//
// NODE'S SOURCE IS A LINE, and that is what this SCANNER reads. `@types/node`
// carries `@since v10.0.0` in the JSDoc of a member and nothing else: no
// composition, no named releases, no `/// <reference>` graph — a SEMVER POINT.
// Measured over the surface below: 90% of `node:fs`'s members carry one, 61 of
// 67 of `node:crypto`'s, and NINE OF SEVENTY-THREE GLOBALS DO, which is why the
// version lives on the module member and the globals mostly go undated.
//
// THE MODEL ABOVE IT IS A COMPOSITION, on the owner's design of 2026-09-09: a
// runtime version is a SUBKIND of a runtime family, `runtime_includes(node20,
// node18)` orders them, and `runtime_reaches` walks that order exactly as
// `reaches` walks the ES one. The number this file emits is what the
// composition is BUILT from and is never compared against an era rank — see the
// two-axes block at the head of facts/js-host.rofl, which also carries the
// bridge `provides_release/2`.
//
// AND THE OWNER'S CAVEAT IS ANSWERED FROM DISK RATHER THAN ARGUED WITH.
// `includes` assumes monotone inclusion; runtimes REMOVE things; so the
// inclusion should be derived and not authored. MEASURED 2026-09-09 over the
// whole of `@types/node` 22.20.1, which is one snapshot:
//
//     @since v<x>            718 member rows       ARRIVAL is recorded
//     @deprecated             26 module exports    deprecation is recorded
//                            (137 `@deprecated` tags at every grain in the text)
//     @deprecated Since v<x>  23 of those 26       ...and most are dated
//     removal                  0 rows, no tag      NOT RECORDED, AT ALL
//
// A member removed upstream simply STOPS BEING IN THE FILE, and an absent
// symbol is indistinguishable from one that never existed. So removal is not
// derivable from this source at any effort, and it would take a SECOND snapshot
// (`@types/node@18` beside `@types/node@22`) to see one. What IS derivable is
// the deprecation, which is the visible half of a removal and is emitted below
// as `host_member_deprecated` — and rules/js-host.rofl carries
// `runtime_drops[audit]`, the row that is empty by this construction and that a
// second snapshot would populate.
//
// ---------------------------------------------------------------------------
// PARSED WITH THE TYPESCRIPT TYPE CHECKER, not with the parser and not with a
// regex, and the difference is measurable. Walking `declare module "path"`
// syntactically yields ONE member, because the module is `export = path` over a
// namespace, and `node:process` yields NONE for the same reason. Asking the
// checker for the TYPE of `import * as m from "node:path"` yields sixteen and
// `node:process` eighty-five. The alias, the `export =` and the namespace merge
// are the checker's job and it already does them.

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

/** semver as ONE comparable integer, so a rule asks `<` rather than three
 *  nested comparisons. `10.0.0` -> 10000000. The text is emitted beside it
 *  because a report must be able to print `v10.0.0` without decoding. */
export function vnum(maj: number, min: number, pat: number): number {
  return maj * 1_000_000 + min * 1_000 + pat;
}

export interface Member {
  host: string; spec: string; key: string; since: string | null;
  /** the member carries `@deprecated`, and the version the tag NAMES where it
   *  names one. `@deprecated Since v1.0.0` is node's own convention. */
  deprecated: boolean; deprecatedSince: string | null;
  /** the replacement the deprecation names, and TWO NUMBERS ARE QUOTED BECAUSE
   *  THEY MEASURE DIFFERENT POPULATIONS — the first draft of this comment
   *  quoted only the larger one and it was about a wider set than this scanner
   *  emits, which is the defect HANDOFF records as *a number I reported that
   *  was wrong*.
   *
   *  Over the WHOLE of `@types/node` as text: 137 `@deprecated` tags, 76 of
   *  them naming a replacement. At the grain this scanner works at — a MODULE'S
   *  OWN EXPORTS, not the members of the classes and interfaces they return —
   *  26 deprecations, 23 of them dated, 17 naming a replacement.
   *
   *  Either number answers the question rules/js-env-api.rofl leaves open. That
   *  file records 41 `@deprecated` tags across the ECMAScript libs of which TWO
   *  name a replacement, and says the place the relation would earn its keep is
   *  a RUNTIME's API — `fs.rmdir` for `fs.rm` — "which is a source this
   *  repository does not have". It has it now, and at the same grain the
   *  relation is eight times denser: `fs.exists` -> `stat` is a real row. */
  replacedBy: string | null;
}
export interface Global { host: string; name: string; since: string | null }

const SINCE = /@since\s+v(\d+)\.(\d+)\.(\d+)/;
const DEPR_SINCE = /@deprecated\s+Since\s+v(\d+)\.(\d+)\.(\d+)/;
// TWO SPELLINGS, both in the source and neither a majority. `Use \`fs.rm()\`
// instead` and `Use {@link stat} or {@link access} instead` are the same claim
// in TSDoc's two link forms, and reading only one of them would lose a third of
// the relation while looking complete.
const REPL_TICK = /@deprecated[^@]{0,300}?[Uu]se `([^`]+)`/;
const REPL_LINK = /@deprecated[^@]{0,300}?[Uu]se \{@link ([^}]+)\}/;

function docOf(sym: ts.Symbol): string | null {
  const d = sym.declarations?.[0];
  if (!d) return null;
  const sf = d.getSourceFile();
  return d.getFullText(sf).slice(0, d.getStart(sf) - d.getFullStart());
}

function sinceOf(sym: ts.Symbol): string | null {
  const doc = docOf(sym);
  const m = doc ? SINCE.exec(doc) : null;
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

/** A PROGRAM OVER A SYNTHESISED ENTRY FILE. The entry has to live inside the
 *  repository root so that `node_modules` resolution finds `@types/node` the
 *  way a real source file would; it is written, read and removed in one call. */
function withEntry<T>(root: string, tag: string, body: string,
                      opts: ts.CompilerOptions,
                      use: (p: ts.Program, f: ts.SourceFile, c: ts.TypeChecker) => T): T {
  const entry = path.join(root, `.host_lib_${tag}.ts`);
  fs.writeFileSync(entry, body);
  try {
    const prog = ts.createProgram([entry], {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
      ...opts,
    });
    return use(prog, prog.getSourceFile(entry)!, prog.getTypeChecker());
  } finally {
    fs.unlinkSync(entry);
  }
}

/** every property of `globalThis` under the given libs and types, with the
 *  `@since` the declaration carries where it carries one. */
function globalsUnder(root: string, tag: string, opts: ts.CompilerOptions): Map<string, string | null> {
  return withEntry(root, tag, 'export const g = globalThis;\n', opts, (_p, src, checker) => {
    const st = src.statements[0] as ts.VariableStatement;
    const init = st.declarationList.declarations[0].initializer!;
    const out = new Map<string, string | null>();
    for (const s of checker.getTypeAtLocation(init).getProperties()) out.set(s.name, sinceOf(s));
    return out;
  });
}

/** THE ECMASCRIPT BASELINE, subtracted from both hosts. `JSON`, `Math` and
 *  `Promise` are the LANGUAGE and belong to the era scale; crediting a host
 *  with them would make `host_global` a second, rival copy of a table this
 *  repository already generates from a better source. */
export function esBaseline(root: string): Set<string> {
  return new Set(globalsUnder(root, 'es', { lib: ['lib.esnext.d.ts'], types: [] }).keys());
}

export function nodeGlobals(root: string, base: Set<string>): Global[] {
  const g = globalsUnder(root, 'node', { lib: ['lib.esnext.d.ts'], types: ['node'] });
  return [...g].filter(([k]) => !base.has(k)).map(([name, since]) => ({ host: 'node', name, since }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

export function browserGlobals(root: string, base: Set<string>): Global[] {
  const g = globalsUnder(root, 'dom',
    { lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], types: [] });
  // THE BROWSER HAS NO VERSION AXIS AT ALL in this source: `lib.dom.d.ts`
  // carries no `@since`, no year in its name, and no composition. Emitting a
  // null rather than borrowing node's number is the whole of the honesty here.
  return [...g].filter(([k]) => !base.has(k)).map(([name]) => ({ host: 'browser', name, since: null }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** THE CANONICAL SPECIFIERS ONLY. `@types/node` declares both `"fs"` and
 *  `"node:fs"`, and rules/js-modules.rofl already canonicalises a bare builtin
 *  to the `node:` form through `builtin_canonical[code]` — so keying on the
 *  bare name too would put two rows where the model has one question. */
export function nodeSpecifiers(typesDir: string): string[] {
  const out = new Set<string>();
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.d.ts')) {
        for (const m of fs.readFileSync(p, 'utf8').matchAll(/^declare module "(node:[^"]+)"/gm)) out.add(m[1]);
      }
    }
  };
  walk(typesDir);
  return [...out].sort();
}

export function nodeModuleMembers(root: string, specs: string[]): Member[] {
  const body = specs.map((s, i) =>
    `import * as m${i} from ${JSON.stringify(s)};\nexport const u${i} = m${i};`).join('\n');
  return withEntry(root, 'mods', body, { lib: ['lib.esnext.d.ts'], types: ['node'] },
    (_p, src, checker) => {
      const out: Member[] = [];
      let i = 0;
      for (const st of src.statements) {
        if (!ts.isVariableStatement(st)) continue;
        const init = st.declarationList.declarations[0].initializer!;
        for (const s of checker.getTypeAtLocation(init).getProperties()) {
          const doc = docOf(s) ?? '';
          const ds = DEPR_SINCE.exec(doc);
          const rp = REPL_TICK.exec(doc) ?? REPL_LINK.exec(doc);
          out.push({
            host: 'node', spec: specs[i], key: s.name, since: sinceOf(s),
            deprecated: /@deprecated/.test(doc),
            deprecatedSince: ds ? `${ds[1]}.${ds[2]}.${ds[3]}` : null,
            replacedBy: rp ? rp[1] : null,
          });
        }
        i++;
      }
      return out.sort((a, b) => (a.spec === b.spec ? (a.key < b.key ? -1 : 1) : (a.spec < b.spec ? -1 : 1)));
    });
}

export interface Surface {
  globals: Global[];
  members: Member[];
  specs: string[];
  tsVersion: string;
  typesVersion: string;
}

export function scanHosts(root: string): Surface {
  const typesDir = path.join(root, 'node_modules', '@types', 'node');
  const base = esBaseline(root);
  const specs = nodeSpecifiers(typesDir);
  return {
    globals: [...nodeGlobals(root, base), ...browserGlobals(root, base)],
    members: nodeModuleMembers(root, specs),
    specs,
    tsVersion: ts.version,
    typesVersion: JSON.parse(fs.readFileSync(path.join(typesDir, 'package.json'), 'utf8')).version,
  };
}

const q = (s: string) => JSON.stringify(s);
const vrow = (v: string) => { const [a, b, c] = v.split('.').map(Number); return `${q(v)}, ${vnum(a, b, c)}`; };

export function emit(s: Surface): string {
  const nodeG = s.globals.filter((g) => g.host === 'node');
  const domG = s.globals.filter((g) => g.host === 'browser');
  const both = nodeG.filter((g) => domG.some((d) => d.name === g.name)).length;
  const head = `-- js-host-surface.rofl — GENERATED by scanners/host_lib.ts. Do not hand-edit;
-- test/js-host.test.ts regenerates it and compares, so a hand edit shows up as
-- a failing test rather than as a silent divergence.
--
--   node --experimental-strip-types scanners/host_lib.ts
--
-- THE RUNTIME SURFACE OF TWO HOSTS, READ FROM THEIR OWN DECLARATIONS, with the
-- ECMAScript baseline subtracted from both so that neither host is credited
-- with \`JSON\` or \`Math\` — those are the LANGUAGE and facts/js-lib-surface.rofl
-- is where the language's own record lives.
--
--   sources   typescript ${s.tsVersion} (lib.dom.d.ts)   @types/node ${s.typesVersion}
--   host_global        node ${nodeG.length}   browser ${domG.length}   in both ${both}
--   host_module        ${s.specs.length}
--   host_module_member ${s.members.length}, of which ${s.members.filter((m) => m.since).length} carry a version
--
--   deprecated         ${s.members.filter((m) => m.deprecated).length}, of which ${s.members.filter((m) => m.deprecatedSince).length} carry a version
--   replaced_by        ${s.members.filter((m) => m.replacedBy).length}
--
-- \`host_global_since\` IS NEARLY EMPTY AND THAT IS THE SOURCE SPEAKING, not a
-- gap in the scan: ${nodeG.filter((g) => g.since).length} of node's ${nodeG.length} globals carry \`@since\` and NONE of the
-- browser's do, because \`lib.dom.d.ts\` has no version axis of any kind. The
-- version therefore lives on the MODULE MEMBER, which is where the source
-- actually keeps it.
--
-- \`host_member_replaced_by\` IS THE RELATION THE ECMASCRIPT AXIS COULD NOT
-- SUPPORT. rules/js-env-api.rofl records that 41 \`@deprecated\` tags across the
-- ES libs name TWO replacements, and that the place the relation would earn its
-- keep is a RUNTIME's API — \`fs.rmdir\` for \`fs.rm\` — \"which is a source this
-- repository does not have\". It has it now: ${s.members.filter((m) => m.replacedBy).length} rows.
edb(host).
edb(host_global).
edb(host_global_since).
edb(host_module).
edb(host_module_member).
edb(host_member_since).

-- A VERSION IS A TEXT AND A NUMBER IN ONE ROW. The number is
-- maj*1000000 + min*1000 + patch, so a rule asks \`<\` once instead of nesting
-- three comparisons; the text is beside it so a report can print \`v18.0.0\`
-- without decoding. THE NUMBER IS NOT AN ERA RANK and must never be compared
-- against one — see the two-axes paragraph in scanners/host_lib.ts.
`;
  const rows: string[] = ['', 'host(node).', 'host(browser).', ''];
  for (const g of s.globals) rows.push(`host_global(${g.host}, ${q(g.name)}).`);
  rows.push('');
  for (const g of s.globals) if (g.since) rows.push(`host_global_since(${g.host}, ${q(g.name)}, ${vrow(g.since)}).`);
  rows.push('');
  for (const sp of s.specs) rows.push(`host_module(node, ${q(sp)}).`);
  rows.push('');
  for (const m of s.members) rows.push(`host_module_member(${m.host}, ${q(m.spec)}, ${q(m.key)}).`);
  rows.push('');
  for (const m of s.members) if (m.since) rows.push(`host_member_since(${m.host}, ${q(m.spec)}, ${q(m.key)}, ${vrow(m.since)}).`);
  rows.push('',
    '-- THE DEPRECATION RECORD, which is the visible half of a removal. Node',
    '-- records ARRIVAL and DEPRECATION and never records REMOVAL: a member that',
    '-- goes away simply stops being in the file. `runtime_drops[audit]` in',
    '-- rules/js-host.rofl is the row that would carry a removal and is empty by',
    '-- this construction; these rows are what the source CAN say.',
    'edb(host_member_deprecated).',
    'edb(host_member_deprecated_since).',
    'edb(host_member_replaced_by).',
    '');
  for (const m of s.members) if (m.deprecated) rows.push(`host_member_deprecated(${m.host}, ${q(m.spec)}, ${q(m.key)}).`);
  rows.push('');
  for (const m of s.members) if (m.deprecatedSince) rows.push(`host_member_deprecated_since(${m.host}, ${q(m.spec)}, ${q(m.key)}, ${vrow(m.deprecatedSince)}).`);
  rows.push('');
  for (const m of s.members) if (m.replacedBy) rows.push(`host_member_replaced_by(${m.host}, ${q(m.spec)}, ${q(m.key)}, ${q(m.replacedBy)}).`);
  return head + rows.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const out = emit(scanHosts(root));
  const dest = path.join(root, 'facts', 'js-host-surface.rofl');
  fs.writeFileSync(dest, out);
  const n = (p: string) => out.split('\n').filter((l) => l.startsWith(p)).length;
  console.log(`${dest}: ${n('host_global(')} globals, ${n('host_module(')} modules, ${n('host_module_member(')} members`);
}
