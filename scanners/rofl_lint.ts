// scanners/rofl_lint.ts — WHAT A RULE FILE IS MADE OF, as facts, so that
// "can this be shorter" is a query and not an opinion.
//
// The question that paid for this: two rule files written by a model,
// rules/js-effects.rofl and rules/js-callgraph.rofl, are two thirds comment by
// line and carry several hundred clauses each. Reading them one can SEE things
// to cut — a comment block whose rules moved to another file and left the
// prose behind, two rules with the same body under two names, a relation that
// renames another, a premise another premise already implies, a section number
// used twice. The point of this scanner is that none of those needs eyes: each
// is a property of the parsed clause list or of the comment lines beside it,
// and each is emitted here as a row for rules/rofl-lint.rofl to judge.
//
// THE SCANNER DECIDES NOTHING. It emits, per clause, what the clause reads and
// concludes and an alpha-normalised rendering of its body; per comment block,
// where it sits, what follows it and what it names in backticks; per file,
// the line census. The criteria — "orphan", "twin", "alias", "implied",
// "unread" — are rule bodies, so the next reader argues with a rule.
//
// TWO PLACES THIS INSTRUMENT CANNOT LOOK, stated up front rather than found
// later (CLAUDE.md, "ask where the check cannot look"):
//
//   1. A comment that names a relation WITHOUT backticks is invisible to the
//      mention census. `block_mentions` reads `` `name` ``, `` `name[book]` ``
//      and `` `name(...)` `` and nothing else — so "tier 2" in prose is not a
//      dangling reference here although it is one in the file.
//   2. A reader that reaches a relation through a string it builds at run
//      time. `named_in_ts` is a textual census of `name(` and `name[` over the
//      TypeScript tree; a test that asks `r.query(rel + '(X)')` is a reader it
//      cannot see, and the `unread` verdict is therefore an over-report in
//      exactly that case. Safe direction for a "delete me" list is the other
//      one, so the rule side treats `unread` as a candidate and never a gate.
//
// One piece of judgement DOES live here, because it is a computation and not
// a criterion: `premise_implied(R, P, Q)` says that in rule R the positive
// premise on P is entailed by the positive premise on Q, because EVERY arm
// defining Q carries a P premise whose arguments, after unifying that arm's
// head with R's Q literal, coincide with R's P literal wherever R's P literal
// is not a wildcard. Unification is mechanism; whether an implied premise
// should be removed (it may be a cheap seed, see `planBody`) is the rule's
// call and the reader's.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseProgram } from '../src/parser.ts';
import { tokenize } from '../src/tokens.ts';
import type { BodyElem, Clause, Lit, Term } from '../src/unify.ts';

const ROOT = join(import.meta.dirname, '..');
const q = (s: string) => JSON.stringify(s);

export interface Source { file: string; text: string }

/** Every .rofl this census covers: the kernel programs, the rule packs, the
 *  fact packs. Facts files are in so that `defined`/`atom_seen` see the ids a
 *  comment may cite; examples are OUT because a demo's prose is its own. */
export function treeSources(): Source[] {
  const out: Source[] = [];
  const add = (p: string) => out.push({ file: relative(ROOT, p), text: readFileSync(p, 'utf8') });
  for (const f of ['boot.rofl', 'safety.rofl', 'policy.rofl']) add(join(ROOT, f));
  const walk = (dir: string) => {
    for (const e of readdirSync(dir).sort()) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      // its own output is in facts/ and must not be its own input: measured,
      // the second run counted 181 803 clauses where the first counted 50 448
      else if (e.endsWith('.rofl') && e !== 'rofl-lint.rofl') add(p);
    }
  };
  walk(join(ROOT, 'rules'));
  walk(join(ROOT, 'facts'));
  return out;
}

/** Relation names a TypeScript file reaches by NAME — `rel(` or `rel[` in its
 *  text. A census and not a parse; see the header for what it cannot see. */
export function tsNames(dirs = ['test', 'scanners', 'runtime', 'scripts', 'src', 'examples']): Set<string> {
  const seen = new Set<string>();
  const walk = (dir: string) => {
    if (!statSync(dir, { throwIfNoEntry: false })) return;
    for (const e of readdirSync(dir).sort()) {
      const p = join(dir, e);
      if (e === 'node_modules') continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith('.ts')) {
        for (const m of readFileSync(p, 'utf8').matchAll(/\b([a-z][a-z0-9_]*)[\[(]/g)) seen.add(m[1]);
      }
    }
  };
  for (const d of dirs) walk(join(ROOT, d));
  return seen;
}

// ------------------------------------------------------------- rendering ---
function termStr(t: Term, ren?: (v: string) => string): string {
  switch (t.k) {
    case 'v': return t.name.startsWith('_') ? '_' : (ren ? ren(t.name) : t.name);
    case 'i': return String(t.v);
    case 's': return JSON.stringify(t.v);
    case 'a': return t.name;
    case 'f': return `${t.name}(${t.args.map((a) => termStr(a, ren)).join(',')})`;
  }
}
const bookOf = (l: Lit) => (l.persp.k === 'a' ? l.persp.name : '$var');
const pat = (l: Lit, ren?: (v: string) => string) => l.args.map((a) => termStr(a, ren)).join(',');

/** Alpha-normalised body: variables renamed V0, V1, ... by first occurrence in
 *  the body, wildcards kept as `_`. With `rels` the relation names are renamed
 *  the same way, which turns "same body" into "same SHAPE". */
function sig(body: BodyElem[], rels: boolean): string {
  const vmap = new Map<string, string>();
  const rmap = new Map<string, string>();
  const ren = (v: string) => { if (!vmap.has(v)) vmap.set(v, `V${vmap.size}`); return vmap.get(v)!; };
  const rel = (r: string) => {
    if (!rels) return r;
    if (!rmap.has(r)) rmap.set(r, `R${rmap.size}`);
    return rmap.get(r)!;
  };
  return body.map((b) => {
    if (b.t === 'bi') return `${termStr(b.l, ren)} ${b.op} ${termStr(b.r, ren)}`;
    return `${b.t === 'neg' ? 'not ' : ''}${rel(b.lit.rel)}[${bookOf(b.lit)}](${pat(b.lit, ren)})`;
  }).join(', ');
}

// ----------------------------------------------------------- unification ---
type Subst = Map<string, Term>;
function deref(t: Term, s: Subst): Term {
  while (t.k === 'v' && s.has(t.name)) t = s.get(t.name)!;
  return t;
}
function unify(a: Term, b: Term, s: Subst): boolean {
  a = deref(a, s); b = deref(b, s);
  if (a.k === 'v') { if (b.k === 'v' && a.name === b.name) return true; s.set(a.name, b); return true; }
  if (b.k === 'v') { s.set(b.name, a); return true; }
  if (a.k !== b.k) return false;
  if (a.k === 'i') return a.v === (b as { v: number }).v;
  if (a.k === 's') return a.v === (b as { v: string }).v;
  if (a.k === 'a') return a.name === (b as { name: string }).name;
  const fb = b as { name: string; args: Term[] };
  if (a.name !== fb.name || a.args.length !== fb.args.length) return false;
  return a.args.every((x, i) => unify(x, fb.args[i], s));
}
function rename(t: Term, pre: string): Term {
  switch (t.k) {
    case 'v': return { k: 'v', name: pre + t.name };
    case 'f': return { k: 'f', name: t.name, args: t.args.map((a) => rename(a, pre)) };
    default: return t;
  }
}
const same = (a: Term, b: Term) => {
  if (a.k !== b.k) return false;
  if (a.k === 'v') return a.name === (b as { name: string }).name;
  return termStr(a) === termStr(b);
};

// ------------------------------------------------------------ the census ---
export interface Analysis { facts: string[]; clauses: number; blocks: number }

const isCommentLine = (l: string) => /^\s*--/.test(l);
const isRuleLine = (l: string) => /^\s*--\s*[=-]{12,}/.test(l);

export function analyse(sources: Source[] = treeSources(), ts: Set<string> = tsNames()): Analysis {
  const facts: string[] = [];
  const F = (s: string) => facts.push(s);
  let nclauses = 0, nblocks = 0;

  // every clause in every source, with its file and start line
  interface Cl { id: string; file: string; line: number; c: Clause }
  const all: Cl[] = [];
  const defined = new Map<string, Set<string>>();      // rel -> files that conclude/assert it
  const edb = new Set<string>();
  const readByRule = new Set<string>();
  const atomSeen = new Set<string>();
  const mentioned = new Set<string>();
  const snake = new Set<string>();

  for (const src of sources) {
    let clauses: Clause[];
    let toks;
    try { clauses = parseProgram(src.text); toks = tokenize(src.text); } catch { continue; }
    // clause start lines: the first token after each top-level '.'
    const starts: number[] = [];
    let depth = 0, expect = true;
    for (const t of toks) {
      if (t.t === 'eof') break;
      if (expect) { starts.push(t.line); expect = false; }
      if (t.t === '(' || t.t === '[') depth++;
      else if (t.t === ')' || t.t === ']') depth--;
      else if (t.t === '.' && depth === 0) expect = true;
    }
    const lines = src.text.split('\n');
    let code = 0, comment = 0, blank = 0;
    for (const l of lines) { if (/^\s*$/.test(l)) blank++; else if (isCommentLine(l)) comment++; else code++; }
    F(`lint_file(${q(src.file)}, ${code}, ${comment}, ${blank}).`);
    F(`file_clauses(${q(src.file)}, ${clauses.filter((c) => c.body.length > 0).length}, ${clauses.filter((c) => c.body.length === 0).length}).`);

    clauses.forEach((c, i) => {
      const line = starts[i] ?? 0;
      const id = `${src.file}:${line}`;
      all.push({ id, file: src.file, line, c });
      nclauses++;
      const rel = c.head.rel;
      if (rel === 'edb' && c.head.args[0]?.k === 'a') edb.add(c.head.args[0].name);
      if (!defined.has(rel)) defined.set(rel, new Set());
      defined.get(rel)!.add(src.file);
      // every atom a FACT carries, at any position: a verdict, a node kind, a
      // finding id. Measured with the first argument alone: 228 "dangling"
      // names, most of them `not_modelled` and `import_declaration`.
      // ...and every atom a RULE carries, head or body: `not_modelled` is a
      // verdict no fact spells because it is derived.
      const walkAtoms = (t: Term) => { if (t.k === 'a') atomSeen.add(t.name); else if (t.k === 'f') t.args.forEach(walkAtoms); };
      c.head.args.forEach(walkAtoms);
      for (const b of c.body) { if (b.t === 'bi') { walkAtoms(b.l); walkAtoms(b.r); } else b.lit.args.forEach(walkAtoms); }
      for (const b of c.body) if (b.t !== 'bi') readByRule.add(b.lit.rel);
    });

    // comment blocks: maximal runs of consecutive comment lines
    let i = 0;
    while (i < lines.length) {
      if (!isCommentLine(lines[i])) { i++; continue; }
      const start = i;
      while (i < lines.length && isCommentLine(lines[i])) i++;
      const n = i - start;
      const bid = `${src.file}:${start + 1}`;
      nblocks++;
      let j = i;
      while (j < lines.length && /^\s*$/.test(lines[j])) j++;
      const next = j >= lines.length ? 'eof' : isCommentLine(lines[j]) ? 'comment' : 'clause';
      F(`block(${q(bid)}, ${q(src.file)}, ${start + 1}, ${n}).`);
      F(`block_next(${q(bid)}, ${next}).`);
      if (next === 'clause') {
        const cl = all.find((x) => x.file === src.file && x.line === j + 1);
        if (cl && cl.c.body.length > 0) F(`block_before(${q(bid)}, ${q(cl.id)}).`);
      }
      const text = lines.slice(start, i);
      if (text.some(isRuleLine)) F(`block_banner(${q(bid)}).`);
      const dated = text.filter((l) => /\b20\d\d-\d\d-\d\d\b/.test(l)).length;
      if (dated > 0) F(`block_dated(${q(bid)}, ${dated}).`);
      const measured = text.filter((l) => /\bMEASURED\b/.test(l)).length;
      if (measured > 0) F(`block_measured(${q(bid)}, ${measured}).`);
      const mentions = new Map<string, string>();
      for (const l of text) {
        // CALLED means written as a ROFL literal — `name[book]` or `name(` with
        // a variable or wildcard first — so that `f(x)`, `o[k]()`, `next()` and
        // `import('./m')` quoted from JavaScript stay BARE. Measured: without
        // the guard eleven of thirteen "dangling" names in js-callgraph were JS.
        for (const m of l.matchAll(/`([a-z][a-z0-9_]{2,})(\[[a-z$_]+\]|\((?=[A-Z_]))?[^`]*`/g)) {
          const kind = m[2] ? 'called' : 'bare';
          if (mentions.get(m[1]) !== 'called') mentions.set(m[1], kind);
        }
      }
      for (const [name, kind] of mentions) {
        F(`block_mentions(${q(bid)}, ${name}, ${kind}).`);
        if (name.includes('_') && !snake.has(name)) { snake.add(name); F(`mention_snake(${name}).`); }
        mentioned.add(name);
      }
      // numbered lines: a banner section when it follows a rule line or
      // another section line, a list item otherwise
      let prevSection = false;
      text.forEach((l, k) => {
        const m = /^\s*--\s+(\d+)\.\s+(.+?)\s*$/.exec(l);
        if (!m) { prevSection = false; return; }
        const afterRule = k > 0 && isRuleLine(text[k - 1]);
        if (afterRule || prevSection) {
          F(`section(${q(src.file)}, ${start + k + 1}, ${Number(m[1])}, ${q(m[2])}).`);
          prevSection = true;
        } else {
          F(`list_item(${q(bid)}, ${start + k + 1}, ${Number(m[1])}).`);
          prevSection = false;
        }
      });
    }
  }

  // per clause
  const armsOf = new Map<string, Cl[]>();
  for (const x of all) {
    const key = `${x.c.head.rel}/${x.c.head.args.length}`;
    if (!armsOf.has(key)) armsOf.set(key, []);
    armsOf.get(key)!.push(x);
  }
  for (const x of all) {
    const { id, file, line, c } = x;
    // fact clauses are counted per file and otherwise left alone: fifty
    // thousand of them in facts/ and not one question below is about a fact
    if (c.body.length === 0) continue;
    F(`clause(${q(id)}, ${q(file)}, ${line}, ${c.head.rel}, ${bookOf(c.head)}, ${c.head.args.length}).`);
    F(`head_pat(${q(id)}, ${q(pat(c.head))}).`);
    let np = 0, nn = 0, nb = 0;
    c.body.forEach((b, i) => {
      if (b.t === 'bi') { nb++; return; }
      if (b.t === 'pos') np++; else nn++;
      F(`premise(${q(id)}, ${i}, ${b.lit.rel}, ${bookOf(b.lit)}, ${b.t}, ${q(pat(b.lit))}).`);
    });
    F(`clause_npos(${q(id)}, ${np}).`);
    F(`clause_nneg(${q(id)}, ${nn}).`);
    F(`clause_nbi(${q(id)}, ${nb}).`);
    F(`body_sig(${q(id)}, ${q(sig(c.body, false))}).`);
    F(`shape_sig(${q(id)}, ${q(sig(c.body, true))}).`);

    // implied premises: P entailed by Q through every arm of Q
    const pos = c.body.filter((b): b is { t: 'pos'; lit: Lit } => b.t === 'pos');
    const varCount = new Map<string, number>();
    const countVars = (t: Term) => {
      if (t.k === 'v') varCount.set(t.name, (varCount.get(t.name) ?? 0) + 1);
      else if (t.k === 'f') t.args.forEach(countVars);
    };
    c.head.args.forEach(countVars);
    for (const b of c.body) { if (b.t === 'bi') { countVars(b.l); countVars(b.r); } else b.lit.args.forEach(countVars); }
    const wildcard = (t: Term) => t.k === 'v' && (t.name.startsWith('_') || varCount.get(t.name) === 1);
    const reported = new Set<string>();
    for (const qlit of pos) {
      const key = `${qlit.lit.rel}/${qlit.lit.args.length}`;
      if (edb.has(qlit.lit.rel)) continue;
      const arms = armsOf.get(key) ?? [];
      if (arms.length === 0 || arms.some((a) => a.c.body.length === 0)) continue;
      for (const plit of pos) {
        if (plit === qlit || plit.lit.rel === qlit.lit.rel) continue;
        const tag = `${plit.lit.rel}<${qlit.lit.rel}`;
        if (reported.has(tag)) continue;
        const everyArm = arms.every((arm) => {
          const s: Subst = new Map();
          const h = arm.c.head;
          if (h.args.length !== qlit.lit.args.length) return false;
          if (!h.args.every((t, i) => unify(rename(t, 'D$'), qlit.lit.args[i], s))) return false;
          return arm.c.body.some((b) => {
            if (b.t !== 'pos' || b.lit.rel !== plit.lit.rel || b.lit.args.length !== plit.lit.args.length) return false;
            if (bookOf(b.lit) !== bookOf(plit.lit)) return false;
            return b.lit.args.every((t, i) => {
              const mine = plit.lit.args[i];
              if (wildcard(mine)) return true;
              const theirs = deref(rename(t, 'D$'), s);
              return same(theirs, deref(mine, s));
            });
          });
        });
        if (everyArm) { reported.add(tag); F(`premise_implied(${q(id)}, ${plit.lit.rel}, ${qlit.lit.rel}).`); }
      }
    }
  }

  for (const [key, arms] of armsOf) {
    const rules = arms.filter((a) => a.c.body.length > 0);
    if (rules.length > 0) F(`head_arms(${key.split('/')[0]}, ${key.split('/')[1]}, ${rules.length}).`);
  }
  for (const [rel, files] of defined) for (const f of files) F(`defined(${rel}, ${q(f)}).`);
  for (const rel of edb) F(`declared_edb(${rel}).`);
  for (const rel of readByRule) F(`read_by_rule(${rel}).`);
  // `named_in_ts` is emitted for the names a question can be asked about —
  // every relation some .rofl defines and every name a comment mentions — and
  // not for every identifier the TypeScript tree calls, which would be the
  // whole of JavaScript. A scanner-emitted relation such as `ast_child` is
  // defined by no .rofl and reaches this row only through a mention.
  for (const rel of new Set([...defined.keys(), ...mentioned])) if (ts.has(rel)) F(`named_in_ts(${rel}).`);
  for (const a of atomSeen) F(`atom_seen(${a}).`);

  return { facts, clauses: nclauses, blocks: nblocks };
}

const RELS = ['lint_file', 'file_clauses', 'block', 'block_next', 'block_before', 'block_banner',
  'block_dated', 'block_measured', 'block_mentions', 'mention_snake', 'section', 'list_item', 'clause',
  'head_pat', 'premise', 'clause_npos', 'clause_nneg', 'clause_nbi', 'body_sig', 'shape_sig',
  'premise_implied', 'head_arms', 'defined', 'declared_edb', 'read_by_rule', 'named_in_ts', 'atom_seen'];

export function render(a: Analysis): string {
  return [
    '-- facts/rofl-lint.rofl — GENERATED by scanners/rofl_lint.ts.',
    '-- Do not edit. `npm run rofllint` rebuilds it; the judgement is rules/rofl-lint.rofl.',
    '--',
    '-- lint_file(File, Code, Comment, Blank)      line census',
    '-- file_clauses(File, Rules, Facts)           clauses parsed, by kind',
    '-- clause(Id, File, Line, Rel, Book, Arity)   every RULE clause; Id is "file:line"',
    '-- head_pat(Id, Pat)                          the head\'s arguments, rendered',
    '-- premise(Id, I, Rel, Book, pos|neg, Pat)    one premise, in written order',
    '-- clause_npos/nneg/nbi(Id, N)                how many of each',
    '-- body_sig(Id, Sig)                          alpha-normalised body, relations kept',
    '-- shape_sig(Id, Sig)                         the same with relations renamed too',
    '-- premise_implied(Id, P, Q)                  the P premise follows from the Q premise',
    '-- head_arms(Rel, Arity, N)                   how many RULE clauses conclude Rel/Arity',
    '-- block(BId, File, Line, N)                  a run of N comment lines',
    '-- block_next(BId, comment|clause|eof)        what follows it, blank lines skipped',
    '-- block_before(BId, ClauseId)                the clause it introduces',
    '-- block_banner(BId)                          it carries a ===== or ----- line',
    '-- block_dated(BId, N)  block_measured(BId, N) lines carrying a date / MEASURED',
    '-- block_mentions(BId, Name, called|bare)     a backticked name; called = with ( or [',
    '-- mention_snake(Name)                        a mentioned name that carries an underscore',
    '-- section(File, Line, Num, Title)            a numbered banner section',
    '-- list_item(BId, Line, Num)                  a numbered line that is not one',
    '-- defined(Rel, File)  declared_edb(Rel)      who concludes or asserts a relation',
    '-- read_by_rule(Rel)   named_in_ts(Rel)       who reads it: a rule body, a .ts file',
    '-- atom_seen(Atom)                            an atom some clause carries, anywhere',
    '',
    ...RELS.map((r) => `edb(${r}).`),
    '',
    ...a.facts,
    '',
  ].join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('rofl_lint.ts')) {
  const a = analyse();
  writeFileSync(join(ROOT, 'facts/rofl-lint.rofl'), render(a));
  console.log(`facts/rofl-lint.rofl: ${a.clauses} clauses, ${a.blocks} comment blocks, ${a.facts.length} facts`);
}
