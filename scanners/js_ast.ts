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

/** Position and identity properties: recorded elsewhere in the contract, or
 *  not recorded at all. `type` is the Kind argument of ast_node, `loc`/`start`/
 *  `end`/`range` are collapsed to Line, and the *Comments back-references
 *  (leadingComments / trailingComments / innerComments) are babel's duplicate
 *  view of nodes already reachable through `File.comments`. */
const SKIP_KEYS = new Set(['loc', 'start', 'end', 'range', 'type']);
const skipKey = (k: string): boolean => SKIP_KEYS.has(k) || k.endsWith('Comments');

const isNode = (v: unknown): boolean =>
  v !== null && typeof v === 'object' && !Array.isArray(v) &&
  typeof (v as { type?: unknown }).type === 'string';

/** The ONLY escaping the fact syntax has: `\\` and `\"`, each meaning "the
 *  next character, literally" (src/parser.ts tokenize). There is no `\n`, so a
 *  newline inside a string value is emitted RAW — escaping it would round-trip
 *  as the letter `n`, which is silently wrong where raw is merely ugly. */
/** A ROFL string literal.
 *
 *  UNPAIRED SURROGATES ARE REPLACED, AND THE REPLACEMENT IS RECORDED. A
 *  JavaScript string is UTF-16 and may hold a lone surrogate; a Rust string is
 *  guaranteed UTF-8 and cannot, so one cannot cross into the port at all —
 *  `JSON.stringify` emits `\ud83d` and `serde_json` refuses it with
 *  "unexpected end of hex escape". Nor could it survive a cooled volume: this
 *  repository's own parser decodes five escapes and refuses the rest by name.
 *
 *  Found the expensive way on 2026-09-09: two files of eslint's 1426 carry one
 *  in their AST — `no-misleading-character-class` and `utils/char-source`,
 *  which are the tests FOR surrogate handling, so of course they do — and the
 *  ingest loop hung on them rather than failing, because the client dropped the
 *  engine's parse error in silence.
 *
 *  U+FFFD is the standard replacement and the loss is real, so it is not
 *  silent: `surrogate_replaced` is emitted beside the fact, and a question
 *  about that value can find out it was changed. */
const q = (s: string): string => {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) {
      const n = s.charCodeAt(i + 1);
      if (n >= 0xDC00 && n <= 0xDFFF) { out += s[i] + s[i + 1]; i++; continue; }
      out += '\uFFFD'; lostSurrogates += 1; continue;
    }
    if (c >= 0xDC00 && c <= 0xDFFF) { out += '\uFFFD'; lostSurrogates += 1; continue; }
    out += s[i];
  }
  return '"' + out.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
};

/** How many unpaired surrogates `q` replaced since the last `scan`. */
let lostSurrogates = 0;

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

export function scan(src: string, opts: ScanOpts = {}): AstFacts {
  const file = opts.file ?? '<anonymous>';
  const persp = opts.persp ?? 'code';
  const prefix = idPrefix(file);
  lostSurrogates = 0;
  const ast = parse(src, { sourceType: 'module', plugins: ['typescript'] });

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
      }
      // An object property that is neither a node nor a scalar — `extra`,
      // `TemplateElement.value` — has no place in a four-relation contract of
      // scalars and nodes, and is dropped. That is a KNOWN hole, not an
      // oversight: it costs the raw text of every template chunk.
    }
    return me;
  };

  const root = emit(ast as unknown as Record<string, unknown>);
  facts.push(`ast_file[${persp}](${root}, ${qFile}).`);
  // THE LOSS IS RECORDED BESIDE THE DATA. Replacing a character silently would
  // make a question about that value answerable and wrong; this makes it
  // answerable and honest.
  //
  // AND IT DELIBERATELY CARRIES NO VOLUME PREFIX, so cooling cannot find it and
  // it stays hot when the file's facts go to disk. That is the right way round:
  // a note saying THIS FILE'S DATA WAS ALTERED must remain readable exactly
  // when the altered data is not there to be inspected. It costs one fact per
  // affected file — two, on the whole of eslint.
  //
  // The general shape is worth knowing: a volume is a KEY PREFIX, so a fact
  // that mentions a volume by NAME rather than by ID is outside that volume and
  // will not be cooled with it. Here that is deliberate; elsewhere it would be
  // a leak.
  if (lostSurrogates > 0) {
    facts.push(`surrogate_replaced[${persp}](${qFile}, ${lostSurrogates}).`);
  }
  return { facts, nodes: n, kinds, root, prefix };
}
