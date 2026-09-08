// scanners/rule_shape.ts — WHAT DOES A BODY ACTUALLY ASK THE STORE FOR?
//
// Two questions over one fold, because they are the same fold and a second
// implementation of it is how two answers drift apart.
//
//   NEGATIONS — what is bound when the plan reaches a `not`, which decides
//   whether a book can stay on disk (see below).
//   POSITIVE PREMISES — whether each one shares a variable with anything bound
//   before it. One that shares nothing is a CROSS PRODUCT by construction: the
//   engine consumes positive premises in the order written (`planBody`,
//   src/engine.ts:298, "ONLY NEGATIONS MOVE"), so `fn_node(F), ast_node(R, ...)`
//   lays every R beside every F and only then filters. Measured on the JS model
//   of branch modeljs: 272 functions against 291 return statements is 79152
//   intermediate rows for a few hundred answers, and the same three premises
//   reordered peak at 291 with the answer identical to the digit.
//
// The owner's question, and it decides whether most of a graph can stay on
// disk: he touches ten services out of seven hundred, the rest belong to other
// teams and other languages, so he wants the cold ones cold and a book lifted
// into memory only when something reaches into it.
//
// `docs/medium-and-large.md` says a body of facts may move "exactly when
// nothing is negated under it", and `main` is negated in every program — so
// nothing moves. That verdict was derived for the REMOTE case, where a point
// query is a network round trip. It is too strong for a COLD LOCAL one, and
// the reason is in `planBody` (src/engine.ts:294): a negation is admitted only
// when every variable of it is already BOUND or is EXISTENTIAL to that literal,
// and `addClause` refuses a body that cannot be so ordered. Measured over 3555
// rules, that refusal never fires — so every negation this kernel will ever
// run is a question about a KEY, not about a relation.
//
// Which leaves exactly one shape that still needs a whole relation resident:
//   not p(Z)   with Z existential and NOTHING bound  —  "is p empty?"
//
// This scanner does not decide that. It emits, per negative premise, which
// argument positions stand ground at the point the plan reaches it, which are
// existential, and whether the book itself is a variable.
// `rules/rule-shape.rofl` classifies; `npm run ruleshape` renders.
//
// THE FOLD IS A SECOND IMPLEMENTATION AND IS TREATED AS ONE. Binding order is
// `planBody`'s judgement, and this file re-walks it to learn what was bound
// WHERE, which `planBody` does not report. A second implementation of a rule
// this repository already owns is the classic way to get a disagreement instead
// of an answer, so the fold is checked against `planBody`'s own `headGround`
// and `stuck` on every clause it walks, and any disagreement is printed and
// counted rather than absorbed.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseProgram } from '../src/parser.ts';
import { planBody } from '../src/engine.ts';
import { resolveBook } from '../src/reflect.ts';
import { varsOf } from '../src/unify.ts';
import type { BodyElem, Clause, Lit, Term } from '../src/unify.ts';

const ROOT = join(import.meta.dirname, '..');

/** The book a literal lands in, after the kernel's own rewrite. */
function bookOf(l: Lit): string {
  const r = resolveBook(l);
  return r.persp.k === 'a' ? r.persp.name : '$var';
}

const q = (s: string) => JSON.stringify(s);

/** Every .rofl the tree owns, as (label, path). Programs the kernel runs on
 *  itself are labelled apart from the demo corpus, because they are written to
 *  different constraints and averaging them would hide both. */
function programs(): { group: string; path: string }[] {
  const out: { group: string; path: string }[] = [];
  for (const f of ['boot.rofl', 'safety.rofl', 'policy.rofl']) out.push({ group: 'kernel', path: join(ROOT, f) });
  const walk = (dir: string, group: string) => {
    for (const e of readdirSync(dir).sort()) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, group);
      else if (e.endsWith('.rofl')) out.push({ group, path: p });
    }
  };
  walk(join(ROOT, 'examples'), 'examples');
  walk(join(ROOT, 'rules'), 'rules');
  return out;
}

/** One cross-product premise, named the way a reader repairs it: the file, the
 *  relation the rule concludes, and the relation the premise reads. Rule ids
 *  are hashes and line numbers move, so neither is part of the identity — the
 *  line-anchor trap this repository has recorded twice. */
export interface Cross { group: string; file: string; head: string; premise: string; }

export interface Analysis {
  facts: string[];
  clauses: number;
  rules: number;
  negSites: number;
  posSites: number;
  /** disagreements between this fold and `planBody`'s own `headGround` */
  disagreements: number;
  cross: Cross[];
}

/** THE WHOLE MEASUREMENT, as a function, so `test/rule-shape.test.ts` can
 *  re-derive it from source rather than reading `facts/rule-shape.rofl`. A gate
 *  that reads generated facts is green by construction the moment somebody adds
 *  a rule without re-running the scanner — the shape `kernel_grep`'s hand-copied
 *  list already fell into, and the one `test/permission-doc.test.ts` was built
 *  to avoid. */
export function analyse(): Analysis {
const facts: string[] = [];
const cross: Cross[] = [];
let sites = 0;
let posSites = 0;
let clauses = 0;
let rules = 0;
let disagreements = 0;

for (const { group, path } of programs()) {
  const rel = relative(ROOT, path);
  let prog: Clause[];
  try { prog = parseProgram(readFileSync(path, 'utf8')); } catch { continue; }
  for (const [ci, c] of prog.entries()) {
    clauses++;
    const headBook = bookOf(c.head);
    if (c.body.length === 0) {
      facts.push(`base_clause(${q(c.head.rel)}, ${q(headBook)}).`);
      continue;
    }
    rules++;
    const rid = `${rel}#${ci}`;
    facts.push(`concl(${q(rid)}, ${q(c.head.rel)}, ${q(headBook)}, ${q(group)}, ${q(rel)}).`);
    // THE READ SIDE, because "the relation is derived" is not yet a blocker.
    // What decides whether a book can be evaluated once and then left cold is
    // whether the rules writing it read anything OUTSIDE it.
    for (const b of c.body) {
      if (b.t === 'pos' || b.t === 'neg') {
        facts.push(`reads(${q(rid)}, ${q(b.lit.rel)}, ${q(bookOf(b.lit))}).`);
      }
    }

    const { plan, stuck, headGround } = planBody(c);

    // Which body element each variable occurs in — `planBody`'s own notion of
    // existential: a variable confined to ONE negative literal.
    const seenIn = new Map<string, Set<number>>();
    const note = (t: Term, where: number) => {
      for (const v of varsOf(t)) {
        let s = seenIn.get(v);
        if (!s) { s = new Set(); seenIn.set(v, s); }
        s.add(where);
      }
    };
    for (const a of c.head.args) note(a, -1);
    note(c.head.persp, -1);
    c.body.forEach((b, i) => {
      if (b.t === 'bi') { note(b.l, i); note(b.r, i); }
      else { for (const a of b.lit.args) note(a, i); note(b.lit.persp, i); }
    });
    const bodyIndex = new Map<BodyElem, number>();
    c.body.forEach((b, i) => bodyIndex.set(b, i));

    // The fold, in PLAN order. Mirrors src/engine.ts:319-326.
    const bound = new Set<string>();
    let firstPos = true;
    const groundIn = (t: Term) => [...varsOf(t)].every((v) => bound.has(v));
    const bindAll = (t: Term) => { for (const v of varsOf(t)) bound.add(v); };

    for (const b of plan) {
      if (b.t === 'neg') {
        const i = bodyIndex.get(b)!;
        const site = `${rid}@${i}`;
        sites++;
        const book = bookOf(b.lit);
        const perspVar = b.lit.persp.k !== 'a';
        facts.push(`neg_site(${q(site)}, ${q(rid)}, ${q(b.lit.rel)}, ${q(book)}, ${q(group)}).`);
        facts.push(`neg_arity(${q(site)}, ${b.lit.args.length}).`);
        if (perspVar) facts.push(`neg_persp_var(${q(site)}).`);
        let nbound = 0;
        let leftRun = 0;
        let runOpen = true;
        for (const [pos, a] of b.lit.args.entries()) {
          const vs = [...varsOf(a)];
          const isGround = vs.every((v) => bound.has(v));
          const isExist = !isGround && vs.every((v) => seenIn.get(v)!.size === 1 && seenIn.get(v)!.has(i));
          if (isGround) {
            nbound++;
            facts.push(`neg_bound(${q(site)}, ${pos}).`);
            if (runOpen) leftRun++;
          } else {
            runOpen = false;
            if (isExist) facts.push(`neg_exist(${q(site)}, ${pos}).`);
            else facts.push(`neg_free(${q(site)}, ${pos}).`);
          }
        }
        facts.push(`neg_nbound(${q(site)}, ${nbound}).`);
        facts.push(`neg_left_run(${q(site)}, ${leftRun}).`);
        continue;
      }
      if (b.t === 'pos') {
        // THE JOIN SIDE. A positive premise that shares no variable with
        // anything already bound is a cross product: every row of it against
        // every row of what stands, and the filter comes later or not at all.
        // `first` is not a cross product — there is nothing for it to share
        // with — and a premise carrying no variables at all is a lookup.
        const i = bodyIndex.get(b)!;
        const site = `${rid}@${i}`;
        const vs = new Set<string>();
        for (const a of b.lit.args) for (const v of varsOf(a)) vs.add(v);
        for (const v of varsOf(b.lit.persp)) vs.add(v);
        posSites++;
        facts.push(`pos_site(${q(site)}, ${q(rid)}, ${q(b.lit.rel)}, ${q(bookOf(b.lit))}, ${q(group)}).`);
        facts.push(`pos_nvars(${q(site)}, ${vs.size}).`);
        if (firstPos) facts.push(`pos_first(${q(site)}).`);
        let shares = false;
        for (const v of vs) if (bound.has(v)) { shares = true; break; }
        if (shares) facts.push(`pos_shares(${q(site)}).`);
        if (!shares && !firstPos && vs.size > 0) {
          cross.push({ group, file: rel, head: c.head.rel, premise: b.lit.rel });
        }
        firstPos = false;
        for (const a of b.lit.args) bindAll(a);
        bindAll(b.lit.persp);
      }
      else if (b.op === '=') { if (groundIn(b.l)) bindAll(b.r); else if (groundIn(b.r)) bindAll(b.l); }
      else if (b.op === 'is') { if (groundIn(b.r)) bindAll(b.l); }
    }

    // THE CONTROL. `planBody` computes `headGround` with the same fold over the
    // same order; if this walk disagrees, this file's binding notion has
    // drifted from the kernel's and every number above is suspect.
    const mine = c.head.args.every(groundIn) && groundIn(c.head.persp);
    if (mine !== headGround && stuck === null) {
      disagreements++;
      console.error(`DISAGREEMENT ${rid}: planBody headGround=${headGround} this fold=${mine}`);
    }
  }
}

  return { facts, clauses, rules, negSites: sites, posSites, disagreements, cross };
}

export function render(a: Analysis): string {
  return [
    '-- facts/rule-shape.rofl — GENERATED by scanners/rule_shape.ts.',
    '-- Do not edit. `npm run ruleshape` rebuilds it.',
    '--',
    '-- neg_site(Site, Rule, Rel, Book, Group)  a negative premise, where it reads',
    '-- neg_arity(Site, N)                      how many arguments it has',
    '-- neg_nbound(Site, K)                     how many stood GROUND when the plan reached it',
    '-- neg_left_run(Site, K)                   length of the leading run of ground positions',
    '-- neg_bound/exist/free(Site, Pos)         per position: ground, existential, or neither',
    '-- neg_persp_var(Site)                     the BOOK itself is a variable',
    '-- pos_site(Site, Rule, Rel, Book, Group)  a POSITIVE premise, in plan order',
    '-- pos_nvars(Site, N)                      how many distinct variables it names',
    '-- pos_first(Site)                         it is the first positive premise',
    '-- pos_shares(Site)                        it shares a variable with what is bound',
    '-- concl(Rule, Rel, Book, Group, File)     a rule, and what it concludes where',
    '-- reads(Rule, Rel, Book)                  a premise of that rule, and its book',
    '-- base_clause(Rel, Book)                  a fact asserted with no body',
    'edb(neg_site).      edb(neg_arity).   edb(neg_nbound).  edb(neg_left_run).',
    'edb(neg_bound).     edb(neg_exist).   edb(neg_free).    edb(neg_persp_var).',
    'edb(concl).         edb(base_clause).  edb(reads).',
    'edb(pos_site).      edb(pos_nvars).   edb(pos_first).   edb(pos_shares).',
    '',
    ...a.facts,
  ].join('\n') + '\n';
}

function isMain(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === new URL(`file://${entry}`).href;
}

if (isMain()) {
  const a = analyse();
  writeFileSync(join(ROOT, 'facts/rule-shape.rofl'), render(a));
  console.log(
    `clauses ${a.clauses}, rules ${a.rules}, negative premises ${a.negSites}, ` +
    `positive premises ${a.posSites}, cross products ${a.cross.length}; ` +
    `fold disagreements with planBody: ${a.disagreements}`,
  );
}
