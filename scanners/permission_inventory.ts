// scanners/permission_inventory.ts — THE BOOK-AND-PERMISSION FAMILY, AS FACTS.
//
// The question this exists to stop re-answering: what are the permission
// relations, who may write each one, what does each permit, who reads it, and
// what in this repository ever populates it. It was answered in twelve places
// and the answers disagreed, so it is answered once — `docs/books-and-permission.md`
// is the prose half and `test/permission-doc.test.ts` is the gate that keeps
// the two the same set.
//
// WHY A MODEL AND NOT A GREP. A grep says `authority` occurs in 56 files. It
// cannot say `nothing reads this` or `no program in this repository ever
// writes that`, and those two negatives are most of what makes the story
// confusing — `demands_authorship` is declared, documented and audited, and
// written by NO .rofl file in the tree, which reads as coverage and is an
// opt-in gate nobody switched on (finding
// f_i_measured_a_ceiling_with_the_instrument_switched_off).
//
// WHAT THIS SCANNER DECIDES: nothing. It emits structure — the clauses of
// boot.rofl, what the corpus writes and reads, what the hosts do — and
// `rules/permission-model.rofl` derives the family, the roles and the
// negatives from it, so the criterion is a rule body anyone can argue with.
//
// THREE LIMITS, stated because a survey that hides its blind spots is worse
// than one that is red:
//   1. The corpus half reads SOURCE. A program whose rule set grows at
//      runtime is invisible to it (examples/loot installs books from
//      `demo.ts`; f_a_corpus_sweep_that_only_loads_misses_what_a_runtime_load_makes).
//      The `host_call` facts are the coarse second instrument for that.
//   2. The world half LOADS AND EVALUATES each examples/ world once, at tick
//      0. A relation that only populates after a tick reads as unpopulated.
//   3. `host_call` is name-matched over string literals in .ts files with
//      comments stripped. It over-answers on a shared name and cannot see a
//      relation named through a variable.
//
// Run: npm run perminv     (writes facts/permission-inventory.rofl)
//      npm run whyperm     (the derivation over them)

import { readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseProgram } from '../src/parser.ts';
import { resolveBook } from '../src/reflect.ts';
import { Rofl } from '../src/api.ts';
import type { Clause, Lit } from '../src/unify.ts';

const ROOT = join(import.meta.dirname, '..');

/** The effective book of a literal: the bracket the author wrote, or the
 *  default — which `resolveBook` sends to [$kernel] for a KERNEL_BOOK
 *  relation and leaves in [main] for everything else. Reporting the written
 *  bracket instead would say `main` for `asserted_by`, which stopped being
 *  true when the reflection split landed. */
function bookOf(l: Lit): string {
  const r = resolveBook(l);
  return r.persp.k === 'a' ? r.persp.name : 'v_' + (r.persp as { name: string }).name;
}

const bodyLits = (c: Clause): { sign: string; lit: Lit }[] =>
  c.body.flatMap((b) => (b.t === 'pos' || b.t === 'neg' ? [{ sign: b.t, lit: b.lit }] : []));

// ----------------------------------------------------------- boot.rofl half
export interface BootStructure {
  rules: string[];                 // boot_rule / boot_body facts
  edb: string[];                   // relations boot.rofl declares host data
  rels: Set<string>;               // every relation boot.rofl names
  arity: Record<string, number>;
  facts: Map<string, number>;      // ground facts boot.rofl itself writes
  headBook: Record<string, string>; // the book boot.rofl concludes it into
}

/** boot.rofl's own program as facts, with NO judgement applied.
 *
 *  Exported because the GATE must read boot.rofl live: a gate that reads the
 *  generated facts file stays green when boot.rofl grows a relation and the
 *  scanner has not been re-run, which is the stale-check shape this
 *  repository has already paid for twice. */
export function bootStructure(src: string): BootStructure {
  const rules: string[] = [];
  const edb: string[] = [];
  const rels = new Set<string>();
  const arity: Record<string, number> = {};
  const headBook: Record<string, string> = {};
  const facts = new Map<string, number>();
  let n = 0;
  for (const c of parseProgram(src)) {
    const head = c.head;
    rels.add(head.rel);
    arity[head.rel] ??= head.args.length;
    for (const { lit } of bodyLits(c)) { rels.add(lit.rel); arity[lit.rel] ??= lit.args.length; }
    if (c.body.length === 0) {
      // `edb(X).` is boot.rofl declaring host data. Its other ground facts are
      // boot.rofl declaring its OWN crossings, which is a program writing a
      // declaration like any other and is counted with the corpus.
      if (head.rel === 'edb' && head.args[0]?.k === 'a') edb.push(head.args[0].name);
      else facts.set(head.rel, (facts.get(head.rel) ?? 0) + 1);
      continue;
    }
    const rid = `rb_${++n}`;
    headBook[head.rel] ??= bookOf(head);
    rules.push(`boot_rule(${rid}, ${head.rel}, ${bookOf(head)}, ${head.temporal}).`);
    for (const { sign, lit } of bodyLits(c)) {
      rules.push(`boot_body(${rid}, ${lit.rel}, ${bookOf(lit)}, ${sign}).`);
    }
  }
  return { rules, edb, rels, arity, facts, headBook };
}

// ---------------------------------------------------------------- doc half
/** The relation names the document's inventory tables list, one per row.
 *  A row's first cell is the relation in backticks, optionally with its
 *  arity (`` `exports`/2 ``); nothing else in the document is read, so the
 *  prose may be rewritten freely without moving the gate. */
export function docListed(src: string): string[] {
  const out: string[] = [];
  for (const line of src.split('\n')) {
    const m = /^\|\s*`([a-z_]+)`(?:\/\d+)?\s*\|/.exec(line);
    if (m) out.push(m[1]);
  }
  return [...new Set(out)].sort();
}

// ------------------------------------------------------------- corpus half
function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir).sort()) {
    if (e === 'node_modules' || e === '.git') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (e.endsWith(ext)) out.push(p);
  }
  return out;
}

/** Files loaded together share a store, so an examples/ directory is one
 *  program and a loose .rofl file is its own. */
const progOf = (file: string): string => {
  const rel = relative(ROOT, file);
  return rel.startsWith('examples/') && rel.split('/').length > 2
    ? rel.split('/').slice(0, 2).join('/') : rel;
};

const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

function main(): void {
  // THE PERMISSION FAMILY SPANS TWO FILES SINCE 2026-09-09. `forged`,
  // `unattributed` and `widened` moved to rules/self-audit.rofl, which a world
  // loads when its writers are not all its own — they were 100 per cent of the
  // evaluation of an AST index and had never fired on any world here. They are
  // still the same family and this inventory still has to see all of it, so it
  // reads both rather than pretending the kernel is the whole story.
  const boot = readFileSync(join(ROOT, 'boot.rofl'), 'utf8')
    + '\n' + readFileSync(join(ROOT, 'rules/self-audit.rofl'), 'utf8');
  const bs = bootStructure(boot);
  const known = bs.rels;

  // --- what .rofl sources write, conclude and read --------------------------
  const wrote = new Map<string, number>();
  const concl = new Set<string>();
  const read = new Set<string>();
  for (const [rel, n] of bs.facts) if (known.has(rel)) wrote.set(`boot.rofl\t${rel}\tmain`, n);
  let files = 0, unparsed = 0;
  for (const f of walk(ROOT, '.rofl')) {
    if (relative(ROOT, f) === 'boot.rofl') continue;
    let prog: Clause[];
    try { prog = parseProgram(readFileSync(f, 'utf8')); } catch { unparsed++; continue; }
    files++;
    const p = progOf(f);
    for (const c of prog) {
      // THE BOOK IS PART OF THE IDENTITY, and leaving it out over-answers.
      // `crossing[recon]` in examples/aka and `exported[main](S,P,N)` in
      // examples/ditto are name collisions with boot.rofl's `crossing[main]/2`
      // and `exported[audit]/1`; without the book they read as the corpus
      // building on the permission relations, which it does not.
      if (known.has(c.head.rel)) {
        const k = `${p}\t${c.head.rel}\t${bookOf(c.head)}`;
        if (c.body.length === 0) wrote.set(k, (wrote.get(k) ?? 0) + 1); else concl.add(k);
      }
      for (const { lit } of bodyLits(c)) if (known.has(lit.rel)) read.add(`${p}\t${lit.rel}\t${bookOf(lit)}`);
    }
  }

  // --- what the .ts hosts do ------------------------------------------------
  // A string literal handed to a named method: `r.assert('collects(mind).')`,
  // `r.query('leak[audit](A, B)')`. Name-matched; see limit 3 in the header.
  const calls = new Set<string>();
  for (const f of walk(ROOT, '.ts')) {
    const rel = relative(ROOT, f);
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/\.(\w+)\(\s*(['"`])([^'"`]*)\2/g)) {
      const [, method, , text] = m;
      for (const r of known) if (new RegExp(`(^|[^\\w])${r}\\s*[([]`).test(text)) calls.add(`${rel}\t${r}\t${method}`);
    }
    // the kernel writing a relation straight into the store
    if (rel.startsWith('src/')) {
      for (const m of src.matchAll(/store\.add\(\s*V\.(\w+)/g)) {
        if (known.has(m[1])) calls.add(`${rel}\t${m[1]}\tstore_add`);
      }
    }
  }

  // --- what a loaded world actually holds ----------------------------------
  const worldRows: string[] = [];
  const exDir = join(ROOT, 'examples');
  let built = 0;
  for (const e of readdirSync(exDir).sort()) {
    const p = join(exDir, e);
    const files2 = statSync(p).isDirectory()
      ? readdirSync(p).sort().filter((x) => x.endsWith('.rofl')).map((x) => join(p, x))
      : e.endsWith('.rofl') ? [p] : [];
    if (files2.length === 0) continue;
    const world = e.replace(/\.rofl$/, '');
    const r = new Rofl();
    if (!r.load(boot).ok) continue;
    let ok = true;
    for (const f of files2) if (!r.load(readFileSync(f, 'utf8')).ok) ok = false;
    if (!ok) continue;
    try { r.evaluate(); } catch { continue; }
    built++;
    for (const rel of [...known].sort()) {
      const a = bs.arity[rel] ?? 0;
      const vars = Array.from({ length: a }, (_, i) => `X${i}`).join(', ');
      // ASK IN THE BOOK IT LANDS IN. An unbracketed `collected(X)` asks
      // [main]; boot.rofl writes `collected[audit]`, so the bare query answers
      // 0 for every world and reads as "the corpus never gathers", which is
      // false. The bracket is the relation's own, from boot.rofl's head.
      const b = bs.headBook[rel];
      const q = (b && b !== 'main' ? `${rel}[${b}]` : rel) + (a === 0 ? '' : `(${vars})`);
      let n = 0;
      try { n = r.query(q).rows.length; } catch { continue; }
      if (n > 0) worldRows.push(`world_rows("${world}", ${rel}, ${n}).`);
    }
  }

  // --- what the document claims ------------------------------------------
  // Emitted so `npm run whyperm` can show `doc_missing` / `doc_extra` for the
  // tree as it stands. The GATE does not read this: it re-scans both sides.
  let docRels: string[] = [];
  try { docRels = docListed(readFileSync(join(ROOT, 'docs/books-and-permission.md'), 'utf8')); }
  catch { docRels = []; }

  const out: string[] = [
    '-- facts/permission-inventory.rofl — GENERATED by scanners/permission_inventory.ts.',
    '-- Do not edit. `npm run perminv` rebuilds it; `npm run whyperm` derives over it.',
    '--',
    '-- boot_rule(Rid, Rel, Book, Tense)   a clause of boot.rofl, head side',
    '-- boot_body(Rid, Rel, Book, Sign)    one of its premises (pos | neg)',
    '-- boot_edb(Rel)                      boot.rofl declares Rel host data',
    '-- corpus_fact(Prog, Rel, Book, N)    Prog writes N ground facts of Rel[Book] in .rofl source',
    '-- corpus_rule(Prog, Rel, Book)       a rule in Prog concludes Rel[Book]',
    '-- corpus_read(Prog, Rel, Book)       a rule body in Prog reads Rel[Book]',
    '-- host_call(File, Rel, Method)       a .ts file names Rel in a string handed to Method',
    '-- world_rows(World, Rel, N)          rows Rel holds in that examples/ world at tick 0',
    '-- doc_lists(Rel)                     docs/books-and-permission.md has an inventory row for Rel',
    '',
    `corpus_files(${files}).  corpus_unparsed(${unparsed}).  worlds_built(${built}).`,
    '',
    '-- ---------------------------------------------------------- boot.rofl',
    ...bs.rules,
    '',
    ...bs.edb.map((r) => `boot_edb(${r}).`),
    '',
    '-- ------------------------------------------------------------- corpus',
    ...[...wrote.entries()].sort().map(([k, n]) => {
      const [p, r, b] = k.split('\t');
      return `corpus_fact("${p}", ${r}, ${b}, ${n}).`;
    }),
    ...[...concl].sort().map((k) => { const [p, r, b] = k.split('\t'); return `corpus_rule("${p}", ${r}, ${b}).`; }),
    ...[...read].sort().map((k) => { const [p, r, b] = k.split('\t'); return `corpus_read("${p}", ${r}, ${b}).`; }),
    '',
    '-- ------------------------------------------------ the document itself',
    ...docRels.map((r) => `doc_lists(${r}).`),
    '',
    '-- --------------------------------------------------------- .ts hosts',
    ...[...calls].sort().map((k) => {
      const [f, r, m] = k.split('\t');
      return `host_call("${f}", ${r}, ${m}).`;
    }),
    '',
    '-- ------------------------------------------------------------- worlds',
    ...worldRows.sort(),
    '',
  ];
  writeFileSync(join(ROOT, 'facts/permission-inventory.rofl'), out.join('\n'));
  console.log(`boot: ${bs.rules.length} clause facts, ${bs.edb.length} edb declarations, ` +
    `${known.size} relations named`);
  console.log(`corpus: ${files} .rofl files parsed (${unparsed} not programs), ` +
    `${wrote.size} write pairs, ${concl.size} rule pairs, ${read.size} read pairs`);
  console.log(`hosts: ${calls.size} call sites   worlds: ${built} built, ${worldRows.length} populated rows`);
  console.log('facts/permission-inventory.rofl written');
}

// realpath BOTH sides (finding f_main_guard_breaks_on_symlinked_tmp)
const real = (p: string): string => { try { return realpathSync(p); } catch { return p; } };
if (process.argv[1] && real(resolve(process.argv[1])) === real(new URL(import.meta.url).pathname)) main();
