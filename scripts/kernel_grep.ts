// kernel_grep.ts — the Phase 3 "kernel grep test", mechanical and in CI.
//
// Contract (START.md §5 Phase 3, §7): no relation name outside the documented
// kernel vocabulary may appear as a string or identifier in kernel source.
// Two checks over every file in src/:
//
//  1. Every identifier-shaped string literal ('foo', "foo") must be in the
//     documented whitelist below (or start with '$', the kernel-internal
//     reification marker, unwritable in ROFL source syntax). A relation name
//     must be identifier-shaped in full to be usable as a store key, so this
//     check is the real protection.
//  2. After stripping comments and string literals, no boot.rofl or appendix
//     program relation name may appear as a code identifier.
//
// The whitelist mirrors the vocabulary table in README.md. Extending it is a
// documented API change, not a convenience.

import * as fs from 'node:fs';
import * as path from 'node:path';

// §2 kernel vocabulary (reserved) + documented reflection-detail extension.
const KERNEL_RELS = [
  'derived_by', 'rule', 'has_premise', 'premise_pos', 'premise_neg',
  'concludes', 'has_conclusion', 'reads_from', 'writes_to', 'mode',
  'reserved', 'authority', 'asserted_by', 'hole', 'edb',
  'bridge_decl', 'in_perspective', 'uses_builtin', 'premise_lit', 'conclusion_lit',
  'conclusion_tense',
];
// Stratification interface: kernel reads, boot writes (documented in README).
// `semantics` is read the same way — the PROGRAM writes it to choose the
// three-valued semantics — and `unknown` is the one relation of the pair the
// kernel WRITES: one row per atom the alternating fixpoint leaves undefined.
const IFACE_RELS = ['stratum', 'unstratified', 'semantics', 'unknown'];
// Language syntax tokens the parser must know (keywords, not relations).
// The last three are the ESCAPE LETTERS of a string literal (2026-09-04), and
// they are here for the same reason `is` and `mod` are: the parser dispatches
// on them by name and they denote no relation, no perspective and no subject
// matter. THE WIDENING IS REAL AND IS NAMED: a one-letter relation called `n`,
// `t` or `r` would now pass this check as a string literal in src/. That is
// accepted because the alternative — assembling the table from character codes
// so no identifier-shaped literal appears — hides the language's own vocabulary
// from the reader of the file that defines it.
const SYNTAX = ['init', 'now', 'next', 'async', 'not', 'is', 'mod', 'main', 'n', 't', 'r'];
// Kernel constants (mode atoms, hole reasons).
const CONSTANTS = ['budget_exhausted', 'space_exhausted', 'arith_type_error', 'arith_zero_divisor', 'any', 'in', 'out',
  'well_founded', 'str_type_error', 'str_index_error', 'str_empty_separator',
  'atom_unwritable'];
// Builtin OPERATION names -- the term-level operations a rule may call, the
// same category as `is` and `mod` in SYNTAX above and NOT relations: no store
// key is ever one of these, and no rule may conclude into one. The five string
// destructors are listed because the kernel dispatches on them by name in
// src/reflect.ts, and that is this check working as designed: extending the
// language's vocabulary is a documented API change (README.md, the builtin
// grammar), so it has to be written down here rather than pass unseen.
//
// They are GENERIC and not domain code. A destructor is an operation on the
// term algebra -- the same standing arithmetic has over `i` terms -- and it
// names no relation, no perspective and no subject matter. What would make a
// name domain code is a relation of boot.rofl or of an appendix program,
// which is exactly what FORBIDDEN below still refuses.
// `str_sub` and `atom_of` joined them on 2026-09-04, and the reason is the
// same one this comment already gives: they are operations on the term
// algebra and they name no relation. `atom_of` is the one that deserves a
// second look, because it PRODUCES an atom and an atom can be a relation
// name - but it produces a TERM, and a term only becomes an executable
// rule through the reflection rows, which `breach[audit]` and the write
// protection on conclusion_lit already watch.
const BUILTINS = ['str_char', 'str_len', 'str_pre', 'str_seg', 'str_segs',
                  'str_sub', 'atom_of'];
// Implementation tokens: tokenizer tags, term/premise kind tags, snapshot
// field names, REPL command words. Not relation names; listed exhaustively.
const IMPL = [
  // tokenizer token types / term kinds / body kinds / premise-ref kinds
  'str', 'int', 'var', 'ident', 'eof', 'v', 'i', 's', 'a', 'f',
  'pos', 'neg', 'bi', 'fact',
  // store scopes & snapshot/canonical-state words
  'tick', 'timeless', 'base', 'drv', 'frozen', 'wit', 'true',
  // REPL command words
  'quit', 'exit', 'run', 'facts', 'ok', 'saved', 'restored', 'load', 'utf8',
  // THE ORDINARY PRINCIPAL. Not a relation and not a ledger: it is the author
  // a load carries when the caller named nobody. It has no `$` on purpose —
  // `$` marks a kernel principal that a caller may NOT spell, and `user` is
  // the one any caller may, because claiming it claims nothing.
  'user',
  // rule id prefix ('r' + content hash)
  'r',
  // WHICH EVALUATOR a `Rofl` runs (src/api.ts `evaluator`). Neither is a
  // relation name — the stratification relation is `stratum`, and it is in
  // IFACE_RELS above, where this check still guards it. Listed because the
  // kernel now has two schedulers and has to be able to name the one it runs.
  'rounds', 'strata',
];
const ALLOWED = new Set([...KERNEL_RELS, ...IFACE_RELS, ...SYNTAX, ...CONSTANTS, ...BUILTINS, ...IMPL]);

// Relation names of boot.rofl and the appendix programs: exactly the names a
// cheating kernel would hardcode. None may appear as a kernel identifier.
const FORBIDDEN = [
  'rule_known', 'perspective', 'sees', 'imports', 'dep', 'dep_neg', 'reach',
  'flow', 'flows_to', 'crossing', 'collects', 'collects_from', 'gathered',
  'collected',
  'malformed', 'breach', 'leak', 'forged', 'unmoded',
  'undefined_premise',
  'reading', 'corroborated', 'outlier', 'close', 'temp',
  'counter', 'emit', 'cfg', 'delta', 'step', 'move',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

interface Violation { file: string; line: number; what: string; }

export function checkKernelVocabulary(rootDir: string): Violation[] {
  const srcDir = path.join(rootDir, 'src');
  const out: Violation[] = [];
  for (const f of fs.readdirSync(srcDir).sort()) {
    if (!f.endsWith('.ts')) continue;
    const full = path.join(srcDir, f);
    const noComments = stripComments(fs.readFileSync(full, 'utf8'));
    const lineOf = (idx: number) => noComments.slice(0, idx).split('\n').length;

    // check 1: identifier-shaped string literals must be whitelisted
    const strRe = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
    let m: RegExpExecArray | null;
    while ((m = strRe.exec(noComments))) {
      const raw = m[1] ?? m[2] ?? m[3] ?? '';
      for (const chunk of raw.split(/\$\{[^}]*\}/)) {
        if (/^[a-z][A-Za-z0-9_]*$/.test(chunk) && !ALLOWED.has(chunk)) {
          out.push({ file: f, line: lineOf(m.index), what: `string '${chunk}' not in kernel vocabulary` });
        }
      }
    }

    // check 2: forbidden boot/appendix relation names as code identifiers
    const codeOnly = noComments.replace(strRe, ' "" ');
    for (const bad of FORBIDDEN) {
      const re = new RegExp(`\\b${bad}\\b`, 'g');
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(codeOnly))) {
        out.push({ file: f, line: lineOf(mm.index), what: `forbidden relation name '${bad}' in kernel source` });
      }
    }
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).includes('kernel_grep');
if (isMain) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const violations = checkKernelVocabulary(root);
  if (violations.length === 0) {
    console.log('kernel vocabulary check: clean');
  } else {
    for (const v of violations) console.error(`${v.file}:${v.line}: ${v.what}`);
    console.error(`${violations.length} violation(s)`);
    process.exit(1);
  }
}
