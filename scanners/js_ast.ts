// js_ast.ts — a babel AST becomes facts, COMPLETELY and WITHOUT JUDGEMENT.
//
// The layer's job (CLAUDE.md) is turning code into facts; the semantics is
// rules over those facts. This file emits what the parser saw, in babel's own
// vocabulary, with positions so a fact can be pointed at. It classifies
// nothing: `mech`, `dataflow`, `handled` are conclusions and none of them
// appears below. The test asserts that the SET of relation names emitted is
// exactly the four in the contract, so a fifth relation cannot appear here
// without somebody having decided to add it.
//
// THE CONTRACT (v1), all into the [code] ledger:
//
//   ast_node[code](Id, Kind, File, Line)          one per babel node
//   ast_child[code](Parent, Field, Index, Child)  the tree, ordered
//   ast_attr[code](Id, Key, Value)                every scalar own property
//   ast_file[code](RootId, File)                  one per parsed file
//
// `Index` is what v0 did not have. v0 walked an array field passing the same
// field name to every member and no position, so `f(a, b)` and `f(b, a)`
// produced the SAME fact set: argument order, element order and parameter
// order were all destroyed at the scanner. Index is 0 for a singular field and
// 0..n-1 for array members, counted over the RAW array so that a hole in
// `[1, , 3]` keeps `3` at index 2 rather than sliding it to 1.
//
// `Id` is unique ACROSS FILES: every id carries a per-file prefix derived from
// the file path, so two files scanned into one store cannot collide. Without
// it both files start at n1 and their trees silently graft onto each other.

import * as crypto from 'node:crypto';
import { parse } from '@babel/parser';

export interface ScanOpts {
  /** the path this source came from; part of every fact and of every id */
  file?: string;
  /** the ledger to write into */
  persp?: string;
}

export interface AstFacts {
  facts: string[];
  /** how many babel nodes were emitted */
  nodes: number;
  /** the atomised kinds seen, for a census */
  kinds: Set<string>;
  /** the id of the File node — the first argument of `ast_file` */
  root: string;
  /** the per-file id prefix, exposed so a caller can tell two scans apart */
  prefix: string;
}

/** The four relation names this scanner is allowed to emit. Anything else is
 *  a judgement wearing a relation's clothes. */
export const AST_RELATIONS = ['ast_node', 'ast_child', 'ast_attr', 'ast_file'] as const;

/** The relation a REFUSAL emits, and it is deliberately NOT in the list above.
 *  The contract is two disjoint sets rather than one of five: a scan emits the
 *  four, or it emits this one, and never both. Keeping them apart is what lets
 *  `the scanner emits EXACTLY the four contract relations` stay the assertion
 *  it was — a fifth relation on the success path really would be a judgement
 *  wearing a relation name. */
export const AST_REFUSAL = 'ast_parse_error' as const;

/** Position and identity properties: recorded elsewhere in the contract, or
 *  not recorded at all. `type` is the Kind argument of ast_node, `loc`/`start`/
 *  `end`/`range` are collapsed to Line, and the *Comments back-references
 *  (leadingComments / trailingComments / innerComments) are babel's duplicate
 *  view of nodes already reachable through `File.comments`. */
// `extra` IS DECLARED HERE RATHER THAN DROPPED BY ACCIDENT, 2026-09-08. It was
// already excluded — as an object it fell through to the branch below that
// emits nothing — and that is the wrong reason to exclude the right thing. It
// is babel's own scratch space and not a property of the program: `parenStart`
// is a byte offset, `trailingComma` is a comma, `raw`/`rawValue` are the
// source text of a literal the model already has by value. Measured over the
// fixtures: without this line the rule below would emit `extra_*` attributes
// on 235 nodes, so the declaration is what keeps the contract's extension
// aimed at the language.
const SKIP_KEYS = new Set(['loc', 'start', 'end', 'range', 'type', 'extra']);
const skipKey = (k: string): boolean => SKIP_KEYS.has(k) || k.endsWith('Comments');

const isNode = (v: unknown): boolean =>
  v !== null && typeof v === 'object' && !Array.isArray(v) &&
  typeof (v as { type?: unknown }).type === 'string';

/** The ONLY escaping the fact syntax has: `\\` and `\"`, each meaning "the
 *  next character, literally" (src/parser.ts tokenize). There is no `\n`, so a
 *  newline inside a string value is emitted RAW — escaping it would round-trip
 *  as the letter `n`, which is silently wrong where raw is merely ugly. */
const q = (s: string): string => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

/** babel's CamelCase → the lower_snake this language's atoms use */
export const atomise = (k: string): string =>
  k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** A scalar property value as a ROFL term. Strings quoted; booleans and
 *  integers bare, because `computed`, `async`, `static` and `optional` are
 *  what a later rule reads to tell `o.m()` from `o[k]()`. A number the
 *  grammar cannot spell — 1.5, 1e21, NaN — becomes its decimal STRING rather
 *  than being dropped: the tokenizer only knows `[0-9]+`, and losing the value
 *  entirely would be a judgement about which numbers matter. */
function scalarTerm(v: string | number | boolean): string {
  if (typeof v === 'string') return q(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return Number.isSafeInteger(v) ? String(v) : q(String(v));
}

/** Per-file id prefix. Same construction as materialize.ts's `slug`: a sha256
 *  of the path, truncated. Leading `n` keeps the id a lower-case identifier
 *  whatever the hash starts with. */
export const idPrefix = (file: string): string =>
  'n' + crypto.createHash('sha256').update(file).digest('hex').slice(0, 8) + '_';

/** THE PARSER CONFIGURATION, EXPORTED because a test that re-parses the corpus
 *  must not carry a SECOND copy of it. Measured 2026-09-08: two assertions in
 *  test/js-controlflow.test.ts had their own `plugins: ['typescript']` and both
 *  went red the day this list gained a member — not because their claim moved
 *  but because their copy had. A list duplicated in a test is a gate that goes
 *  red on an honest tree, which CLAUDE.md records as the state in which a gate
 *  gets switched off. */
export const PARSER_PLUGINS = ['typescript', 'decorators', 'decoratorAutoAccessors'] as const;

export function scan(src: string, opts: ScanOpts = {}): AstFacts {
  const file = opts.file ?? '<anonymous>';
  const persp = opts.persp ?? 'code';
  const prefix = idPrefix(file);

  // A REFUSAL IS A FACT, NOT AN EXCEPTION — and the sibling scanner has said so
  // since it was written. scanners/js.ts catches the same error and emits
  // `src_parse_error[code](Path, Message)`, with a test asserting it by name;
  // this one threw, and it is the scanner the whole language model runs on. So
  // the discipline existed, was tested, and was applied to one of the two
  // scanners. See f_the_refusal_was_a_fact_in_the_other_scanner_already.
  //
  // A THROW IS NOT THE SAFE DIRECTION HERE. It is loud for a caller that scans
  // one file and silent for a corpus: whoever catches it per file to keep going
  // loses that file with every count still plausible, which is the whole reason
  // `w_env_scan_failed` was queued. As a fact the file becomes INVALID in every
  // environment rather than absent from all of them.
  let ast;
  try {
    // TWO PLUGINS JOINED `typescript` ON 2026-09-08, on the owner's ask that the
    // model support what people really write. `decorators` is the standard
    // proposal (not `decoratorsLegacy`, which babel 8 no longer recognises under
    // that name — measured) and `decoratorAutoAccessors` is a SEPARATE plugin
    // that `decorators` does not imply: `@dec class A {}` parses without it and
    // `accessor a = 1` does not.
    //
    // THE CONTROL, run before the change and again after: all 29 parseable
    // fixture files in test/fixtures produce a byte-identical AST with and
    // without the two plugins, comparing the whole program with `loc`, `start`,
    // `end`, `range` and `extra` stripped. Nought differ, nought break. A plugin
    // that adds syntax is not automatically a plugin that leaves syntax alone,
    // and this repository has been caught assuming that class of thing before.
    //
    // WHAT IS STILL NOT ENABLED, and each for a measured reason rather than
    // caution: `importAttributes` is unnecessary — `import x from "y" with { type: "json" }`
    // already parses under `typescript` alone — while the KIND stays undeclared
    // because import attributes are ES2025 and the highest environment on the
    // era scale is ts5 at 2022; `exportDefaultFrom` would parse `export v from`,
    // and no environment on the scale claims that Babel proposal either. Both
    // would sit in `feature_unreachable[audit]` for ever. See
    // `w_plugin_gated_kinds` in facts/worklist.rofl.
    ast = parse(src, { sourceType: 'module', plugins: [...PARSER_PLUGINS] });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 120);
    return {
      facts: [`ast_parse_error[${persp}](${q(file)}, ${q(msg)}).`],
      nodes: 0, kinds: new Set<string>(), root: '', prefix,
    };
  }

  const facts: string[] = [];
  const kinds = new Set<string>();
  const qFile = q(file);
  let n = 0;

  const emit = (node: Record<string, unknown>): string => {
    const me = prefix + ++n;
    const kind = atomise(node.type as string);
    kinds.add(kind);
    const loc = node.loc as { start?: { line?: number } } | null | undefined;
    facts.push(`ast_node[${persp}](${me}, ${kind}, ${qFile}, ${loc?.start?.line ?? 0}).`);

    for (const k of Object.keys(node)) {
      if (skipKey(k)) continue;
      const v = node[k];
      if (v === null || v === undefined) continue;
      const field = atomise(k);
      if (Array.isArray(v)) {
        // Index counts over the RAW array: a hole contributes no child and
        // still consumes its position.
        for (let i = 0; i < v.length; i++) {
          if (!isNode(v[i])) continue;
          const child = emit(v[i] as Record<string, unknown>);
          facts.push(`ast_child[${persp}](${me}, ${field}, ${i}, ${child}).`);
        }
      } else if (isNode(v)) {
        const child = emit(v as Record<string, unknown>);
        facts.push(`ast_child[${persp}](${me}, ${field}, 0, ${child}).`);
      } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        facts.push(`ast_attr[${persp}](${me}, ${field}, ${scalarTerm(v)}).`);
      } else if (typeof v === 'object' && !Array.isArray(v)) {
        // A NESTED OBJECT WHOSE MEMBERS ARE ALL SCALARS IS FLATTENED, one key
        // per member, `<field>_<member>`. Added 2026-09-08 after measuring what
        // the scalars-only contract actually excluded rather than believing the
        // sentence that recorded it: over 223 files and 422 482 nodes, with
        // `extra` declared above, the answer is ONE property in the whole of
        // JavaScript as babel presents it — `TemplateElement.value`, which is
        // `{raw, cooked}` and all-scalar.
        //
        // That property was the named cause of FOUR blocked cells, recorded as
        // `cell_blocked(..., scanner_contract)` with the note "it moves when
        // the scanner's contract moves". It moves here, and the rule is general
        // rather than a case for templates: a nested object of scalars is a
        // record of scalars, and the four-relation contract can carry it.
        //
        // A nested object holding anything NON-scalar is still dropped, and
        // nothing in the measured corpus is one — so the hole that remains is
        // declared and empty rather than known and populated.
        const inner = v as Record<string, unknown>;
        const keys = Object.keys(inner).filter((ik) => !skipKey(ik));
        const flat = keys.every((ik) => {
          const iv = inner[ik];
          return typeof iv === 'string' || typeof iv === 'number' || typeof iv === 'boolean';
        });
        if (flat) {
          for (const ik of keys) {
            facts.push(`ast_attr[${persp}](${me}, ${field}_${atomise(ik)}, `
              + `${scalarTerm(inner[ik] as string | number | boolean)}).`);
          }
        }
      }
    }
    return me;
  };

  const root = emit(ast as unknown as Record<string, unknown>);
  facts.push(`ast_file[${persp}](${root}, ${qFile}).`);
  return { facts, nodes: n, kinds, root, prefix };
}
