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
// THE CONTRACT (v2), all into the [code] ledger:
//
//   ast_node[code](Id, Kind, File)                one per babel node
//   ast_line[code](Id, Line)                      the line it starts on
//   ast_child[code](Parent, Field, Index, Child)  the tree, ordered
//   ast_attr[code](Id, Key, Value)                every scalar own property
//   ast_file[code](RootId, File)                  one per parsed file
//
// `Index` is 0 for a singular field and 0..n-1 for array members, counted over
// the RAW array so that a hole in `[1, , 3]` keeps `3` at index 2.
//
// `Id` is the file's prefix and a hash of the parent's id and the child's
// step, so it names a place in the tree, not a place in the walk: a node keeps
// its id when code is added above it (w_stable_node_ids). The step of a named
// child (function, class, method, property, declarator, a declaration whose
// declarators are all named) is its name; of an element of an array field, its
// kind and a shallow hash of its tree down to the first block, function or
// class; of a single child, its field. Equal steps under one parent count #n.
// The line is its own fact for the same reason: a blank line moves ast_line
// below it and nothing else.

import * as crypto from 'node:crypto';
import { parse } from '@babel/parser';

export interface ScanOpts {
  /** the path this source came from; part of every fact and of every id */
  file?: string;
  /** the ledger to write into; the old JS model reads [code] by the names ast_node, ast_child, ...; any other
   *  ledger is named by its book, so its relations are node, child, attr, line, file, parse_error */
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

/** The relation names this scanner is allowed to emit. Anything else is
 *  a judgement wearing a relation's clothes. */
export const AST_RELATIONS = ['ast_node', 'ast_line', 'ast_child', 'ast_attr', 'ast_file'] as const;

/** The relation a REFUSAL emits, and it is deliberately NOT in the list above.
 *  The contract is two disjoint sets rather than one of five: a scan emits the
 *  five, or it emits this one, and never both. Keeping them apart is what lets
 *  `the scanner emits EXACTLY the contract relations` stay the assertion
 *  it was — another relation on the success path really would be a judgement
 *  wearing a relation name. */
export const AST_REFUSAL = 'ast_parse_error' as const;

/** Position and identity properties: recorded elsewhere in the contract, or
 *  not recorded at all. `type` is the Kind argument of ast_node, `loc`/`start`/
 *  `end`/`range` are collapsed to ast_line, and the *Comments back-references
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

/** THE SCALARS, IN ONE PLACE. Two branches below asked the question separately
 *  and both spelled the same three types, so a fourth was a two-site edit and
 *  the second site is the one nobody looks at. `bigint` is the fourth. */
const isScalar = (v: unknown): v is string | number | boolean | bigint =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
  || typeof v === 'bigint';

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
const atoms = new Map<string, string>();
export const atomise = (k: string): string => {
  let a = atoms.get(k);
  if (a === undefined) { a = k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase(); atoms.set(k, a); }
  return a;
};

/** A scalar property value as a ROFL term. Strings quoted; booleans and
 *  integers bare, because `computed`, `async`, `static` and `optional` are
 *  what a later rule reads to tell `o.m()` from `o[k]()`. A number the
 *  grammar cannot spell — 1.5, 1e21, NaN — becomes its decimal STRING rather
 *  than being dropped: the tokenizer only knows `[0-9]+`, and losing the value
 *  entirely would be a judgement about which numbers matter.
 *
 *  A BIGINT IS THE FIFTH SCALAR AND IT WAS BEING DROPPED, 2026-09-08
 *  (w_update_and_literals). `BigIntLiteral.value` is a native `bigint` — not a
 *  string, not a number — so it matched NONE of the four branches in `emit`
 *  below and fell through them all: `1n` reached the store as an `ast_node`
 *  with ZERO attributes, the only literal in JavaScript whose value the
 *  scanner did not record. `extra.raw` holds `"1n"` and `extra` is declared
 *  out above, so nothing else carried it either.
 *
 *  Measured, not assumed: `typeof (parse('1n')…value)` is `bigint`, and a
 *  three-line scan of `const b = 1n` emitted one `ast_node` fact and no
 *  `ast_attr`. The contract line at the top of this file says `every scalar
 *  own property`, so the omission contradicted the file's own statement of
 *  what it does.
 *
 *  ITS TERM IS THE DECIMAL STRING, by the rule already written for a number
 *  the grammar cannot spell — `Number.isSafeInteger` is false for every
 *  bigint, so this function needs no new branch, only permission to be
 *  called. The collision that buys is stated rather than hidden: `1n` and the
 *  string `"1"` become the same term, exactly as `1e21` and its decimal
 *  spelling already do. The alternative — a bare integer — would collide with
 *  the NUMBER `1` instead, and `1n !== 1` is the distinction JavaScript
 *  actually enforces. */
function scalarTerm(v: string | number | boolean | bigint): string {
  if (typeof v === 'string') return q(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return Number.isSafeInteger(v) ? String(v) : q(String(v));
}

/** Per-file id prefix: 16 hex digits (64 bits) of a sha256 of the path. Eight digits were 32 bits, a collision
 *  between two files of a corpus about 1% likely at 10 000 files and 25% at 50 000, and two files that share a prefix
 *  share node ids: their trees merge (and a world that declares `function ast_node` refuses them). 64 bits make it
 *  about 7e-11 at 50 000, and `claim` refuses the one that happens. Leading `n` keeps the id a lower-case identifier
 *  whatever the hash starts with. */
export const idPrefix = (file: string): string =>
  'n' + crypto.createHash('sha256').update(file).digest('hex').slice(0, 16) + '_';

const owners = new Map<string, string>();

/** One prefix, one file, in this process: a second label that hashes to a taken prefix is refused with both names. */
export function claim(prefix: string, file: string): void {
  const had = owners.get(prefix);
  if (had !== undefined && had !== file) {
    throw new Error(`scanner: the files "${had}" and "${file}" share the node id prefix ${prefix}; their nodes would merge. Scan one under another label.`);
  }
  owners.set(prefix, file);
}

/** The scans that go into ONE world. The same label scanned twice into a world gives it the same node ids twice (the
 *  scans agree, or the world's `function ast_node` refuses them deep in the engine): a changed file is scanned again
 *  only after its first scan's facts are retracted and `forget` is called. */
export class ScanSet {
  private labels = new Set<string>();
  scan(src: string, opts: ScanOpts = {}): AstFacts {
    const file = opts.file ?? '<anonymous>';
    if (this.labels.has(file)) {
      throw new Error(`scanner: "${file}" is scanned twice into one world; retract its first scan and forget it before scanning it again`);
    }
    const r = scan(src, opts);
    this.labels.add(file);
    return r;
  }
  forget(file: string): void { this.labels.delete(file); }
}

/** THE PARSER CONFIGURATION, EXPORTED because a test that re-parses the corpus
 *  must not carry a SECOND copy of it. Measured 2026-09-08: two assertions in
 *  test/js-controlflow.test.ts had their own `plugins: ['typescript']` and both
 *  went red the day this list gained a member — not because their claim moved
 *  but because their copy had. A list duplicated in a test is a gate that goes
 *  red on an honest tree, which CLAUDE.md records as the state in which a gate
 *  gets switched off. */
export const PARSER_PLUGINS = ['typescript', 'decorators', 'decoratorAutoAccessors'] as const;
/** The second try, for a file the first refuses: TypeScript's experimental decorators, which put a decorator on a
 *  parameter (`constructor(@IFileService private readonly files: IFileService)`, the dependency injection of vscode:
 *  893 of its 5,210 files). Babel refuses `decorators` and `decorators-legacy` together, so a file is parsed under
 *  the second only when the first refuses it, and every file that parses today keeps its facts. */
export const LEGACY_PLUGINS = ['typescript', 'decorators-legacy', 'decoratorAutoAccessors'] as const;

const parseModule = (src: string, file: string, plugins: readonly string[]) =>
  parse(src, { sourceType: 'module', plugins: (/\.[jt]sx$/.test(file) ? [...plugins, 'jsx'] : [...plugins]) as never });

type Node = Record<string, unknown>;

const unique = (hs: Float64Array): boolean => {
  const s = Float64Array.from(hs).sort();
  for (let i = 1; i < s.length; i++) if (s[i] === s[i - 1]) return false;
  return true;
};

/** Two 32-bit lanes of multiply-xor (cyrb53), fed whole words, 53 bits out. No key: a collision costs a refusal,
 *  never a wrong answer. */
let h1 = 0, h2 = 0;
const start = (seed: number): void => { h1 = 0xdeadbeef ^ seed; h2 = 0x41c6ce57 ^ seed; };
const feed = (x: number): void => { h1 = Math.imul(h1 ^ x, 2654435761); h2 = Math.imul(h2 ^ x, 1597334677); };
const feed52 = (x: number): void => { feed(x >>> 0); feed((x / 4294967296) >>> 0); };
const done = (): number => {
  const a = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  const b = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return 4294967296 * (2097151 & b) + (a >>> 0);
};
const strHash = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const words = new Map<string, number>();
const word = (s: string): number => { let h = words.get(s); if (h === undefined) { h = strHash(s); words.set(s, h); } return h; };

/** The kinds a shallow hash stops at: an edit inside a body leaves the ids of the statements around it alone. */
const BODY = new Set(['BlockStatement', 'StaticBlock', 'ClassBody', 'TSModuleBlock', 'FunctionDeclaration',
  'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod',
  'ClassDeclaration', 'ClassExpression']);

const identName = (v: unknown): string | undefined =>
  isNode(v) && typeof (v as Node).name === 'string' ? (v as Node).name as string : undefined;

/** The name a node is known by in its parent, if it has one. */
const nameOf = (c: Node): string | undefined => {
  if (c.type === 'VariableDeclaration') {
    const ns = (c.declarations as Node[]).map((d) => identName(d.id));
    return ns.length > 0 && ns.every((x) => x !== undefined) ? ns.join(',') : undefined;
  }
  if (c.computed === true) return undefined;
  return identName(c.id) ?? identName(c.key);
};

/** Kinds whose name a shallow hash leaves out: a statement keeps its id when a name it mentions is renamed. */
const IDENT = new Set(['Identifier', 'JSXIdentifier']);

/** Each node's kind, scalars and children, the children cut at a BODY to their kind: one pass, bottom-up, the
 *  hashes in the order `emit` meets the nodes. */
function shallowHashes(root: Node): Float64Array {
  let out = new Float64Array(1024);
  const parts: number[] = [];
  let n = 0;
  const visit = (node: Node): number => {
    const at = n++;
    const base = parts.length;
    parts.push(word(node.type as string));
    for (const k of Object.keys(node)) {
      if (skipKey(k) || (k === 'name' && IDENT.has(node.type as string))) continue;
      const v = node[k];
      if (v === null || v === undefined) continue;
      if (Array.isArray(v)) {
        for (const c of v) {
          if (isNode(c)) { const h = visit(c as Node); parts.push(word(k), BODY.has((c as Node).type as string) ? word((c as Node).type as string) : h); }
          else if (isScalar(c)) parts.push(word(k), typeof c === 'string' ? strHash(c) : word(String(c)));
        }
      } else if (isNode(v)) { const h = visit(v as Node); parts.push(word(k), BODY.has((v as Node).type as string) ? word((v as Node).type as string) : h); }
      else if (isScalar(v)) parts.push(word(k), typeof v === 'string' ? strHash(v) : word(String(v)));
    }
    start(0);
    for (let i = base; i < parts.length; i++) feed52(parts[i]);
    parts.length = base;
    const h = done();
    if (at >= out.length) { const o = new Float64Array(out.length * 2); o.set(out); out = o; }
    out[at] = h;
    return h;
  };
  visit(root);
  return out.subarray(0, n);
}

const DIGITS = '0123456789abcdefghijklmnopqrstuv';
/** 53 bits in base 32, low digits first. */
const b32 = (x: number): string => {
  let lo = x >>> 0, hi = (x / 4294967296) >>> 0, s = '';
  for (let i = 0; i < 6; i++) { s += DIGITS[lo & 31]; lo >>>= 5; }
  s += DIGITS[lo | ((hi & 7) << 2)]; hi >>>= 3;
  while (hi > 0) { s += DIGITS[hi & 31]; hi >>>= 5; }
  return s;
};

export function scan(src: string, opts: ScanOpts = {}): AstFacts {
  const file = opts.file ?? '<anonymous>';
  const persp = opts.persp ?? 'code';
  const raw = persp === 'code' ? 'ast_' : '';
  const prefix = idPrefix(file);
  claim(prefix, file);
  lostSurrogates = 0;

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
    // JSX only where the file says so: in a .ts file `<T>x` is a type assertion, and jsx would read it as an element
    try { ast = parseModule(src, file, PARSER_PLUGINS); } catch (e) {
      try { ast = parseModule(src, file, LEGACY_PLUGINS); } catch { throw e; }
    }
  } catch (e) {
    const msg = (e as Error).message.slice(0, 120);
    return {
      facts: [`${raw}parse_error[${persp}](${q(file)}, ${q(msg)}).`],
      nodes: 0, kinds: new Set<string>(), root: '', prefix,
    };
  }

  const facts: string[] = [];
  const kinds = new Set<string>();
  const qFile = q(file);
  const shallow = shallowHashes(ast as unknown as Node);
  let n = 0;
  let salt = 0;
  const hashes = new Float64Array(shallow.length);

  const emit = (node: Node, me: string, hash: number): void => {
    hashes[n++] = hash;
    const kind = atomise(node.type as string);
    kinds.add(kind);
    const loc = node.loc as { start?: { line?: number } } | null | undefined;
    facts.push(`${raw}node[${persp}](${me}, ${kind}, ${qFile}).`);
    facts.push(`${raw}line[${persp}](${me}, ${loc?.start?.line ?? 0}).`);
    let equal: Map<number, number> | undefined;
    let ch = 0;
    const child = (field: string, c: Node, listed: boolean): string => {
      const nm = nameOf(c);
      const f = word(field);
      let disc = 0, k = 0;
      if (nm !== undefined || listed) {
        disc = nm !== undefined ? strHash(nm) : shallow[n];
        start(0); feed(f); feed(nm !== undefined ? 1 : 2); feed52(disc);
        const key = done();
        equal ??= new Map();
        k = (equal.get(key) ?? 0) + 1;
        equal.set(key, k);
      }
      start(salt); feed52(hash); feed(f); feed(nm !== undefined ? 1 : listed ? 2 : 0); feed52(disc); feed(k);
      ch = done();
      return prefix + b32(ch);
    };

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
          const id = child(field, v[i] as Node, true);
          emit(v[i] as Node, id, ch);
          facts.push(`${raw}child[${persp}](${me}, ${field}, ${i}, ${id}).`);
        }
      } else if (isNode(v)) {
        const id = child(field, v as Node, false);
        emit(v as Node, id, ch);
        facts.push(`${raw}child[${persp}](${me}, ${field}, 0, ${id}).`);
      } else if (isScalar(v)) {
        facts.push(`${raw}attr[${persp}](${me}, ${field}, ${scalarTerm(v)}).`);
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
        const flat = keys.every((ik) => isScalar(inner[ik]));
        if (flat) {
          for (const ik of keys) {
            facts.push(`${raw}attr[${persp}](${me}, ${field}_${atomise(ik)}, `
              + `${scalarTerm(inner[ik] as string | number | boolean | bigint)}).`);
          }
        }
      }
    }
  };

  // A collision in this file is refused and the file scanned again under the next salt; every id moves with it.
  let root: string;
  for (;;) {
    start(salt);
    const rh = done();
    root = prefix + b32(rh);
    emit(ast as unknown as Node, root, rh);
    if (unique(hashes)) break;
    facts.length = 0; kinds.clear(); n = 0; lostSurrogates = 0; salt++;
  }
  facts.push(`${raw}file[${persp}](${root}, ${qFile}).`);
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
