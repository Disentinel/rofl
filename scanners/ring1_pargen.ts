// scanners/ring1_pargen.ts — THE SPAN HALF OF ring1, AS AN INTERMEDIATE FORM.
//
//   node --experimental-strip-types scanners/ring1_pargen.ts [--verbose]
//
// The automaton half is compiled already (`ring1_lexgen.ts`). This reads the
// productions — clauses whose head spans a range of tokens — and turns each
// into an ordered sequence of typed steps a code generator can walk.
//
// IT CLASSIFIES NOTHING AND IT REFUSES LOUDLY. Four attempts were made at
// deciding which clauses "are" span productions, over the same unchanged rules,
// and they gave 71, 71, 69 and 35 — the classifier moved, not the grammar
// (f_the_span_classifier_would_not_converge_so_measure_instead_of_proving). So
// this does what the automaton generator did instead: take what is written,
// express what it can, and STOP on anything else with the clause named. The
// refusals are the finding. A generator that guesses is worse than one that
// stops, and on the automaton half the refusal — negating a conjunction — was
// more accurate than any analysis I had run.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseProgram } from '../src/parser.ts';
import type { Clause, Lit, Term } from '../src/unify.ts';

const REPO = fs.realpathSync(new URL('..', import.meta.url).pathname);
const read = (p: string): string => fs.readFileSync(path.join(REPO, p), 'utf8');
const vn = (t: Term | undefined): string | null => {
  const x = t as unknown as { k?: string; name?: unknown };
  return x && x.k === 'v' ? String(x.name) : null;
};
const an = (t: Term | undefined): string | null => {
  const x = t as unknown as { k?: string; name?: unknown };
  return x && x.k === 'a' ? String(x.name) : null;
};

/** One step of a production's body, in the order a parser would take it. */
export type Step =
  | { s: 'span'; rel: string; from: string; to: string; args: Term[]; neg: boolean }
  | { s: 'guard'; rel: string; at: string; args: Term[]; neg: boolean }
  | { s: 'arith'; target: string; base: string; delta: number }
  | { s: 'cmp'; op: string; l: Term; r: Term };

export interface Production {
  rel: string; arity: number;
  from: string; to: string;
  value: Term | null;          // the third head argument, when there is one
  steps: Step[];
  where: string;               // clause index, for naming a refusal
}
export interface Refusal { where: string; rel: string; why: string }

/** A relation is a SPAN relation if some clause concludes it with two leading
 *  arguments that are distinct variables. Deliberately generous: the point is
 *  not to be right about the boundary, it is to let the STEP extraction refuse
 *  when the generosity was wrong. */
function spanRels(prog: Clause[]): Set<string> {
  const out = new Set<string>();
  for (const c of prog) {
    const a = c.head.args;
    if (a.length < 2) continue;
    const i = vn(a[0]), j = vn(a[1]);
    if (i && j && i !== j) out.add(c.head.rel);
  }
  return out;
}

const GUARD_ONLY = new Set(['at', 'len', 'src']);

export function extract(): { prods: Production[]; refused: Refusal[]; spans: Set<string> } {
  const prog = parseProgram(read('examples/ring1/ring1.rofl'));
  const spans = spanRels(prog);
  const prods: Production[] = [];
  const refused: Refusal[] = [];

  for (const [ci, c] of prog.entries()) {
    const a = c.head.args;
    if (c.body.length === 0 || a.length < 2) continue;
    const from = vn(a[0]), to = vn(a[1]);
    if (!from || !to || from === to) continue;
    const where = `ring1.rofl#${ci} ${c.head.rel}/${a.length}`;

    const steps: Step[] = [];
    let bad: string | null = null;
    for (const b of c.body) {
      if (bad) break;
      if (b.t === 'bi') {
        const target = vn(b.l);
        const r = b.r as unknown as { k?: string; name?: string; args?: Term[] };
        if (b.op === 'is' && target && r.k === 'f' && (r.name === '+' || r.name === '-')) {
          const base = vn(r.args![0]);
          const n = r.args![1] as unknown as { k?: string; v?: unknown };
          if (base && n.k === 'i') {
            steps.push({ s: 'arith', target, base, delta: Number(n.v) * (r.name === '-' ? -1 : 1) });
            continue;
          }
        }
        if (b.op === '<' || b.op === '<=' || b.op === '>' || b.op === '>=' || b.op === '!=') {
          steps.push({ s: 'cmp', op: b.op, l: b.l, r: b.r });
          continue;
        }
        bad = `builtin \`${b.op}\` with a shape the generator cannot express`;
        continue;
      }
      const lit: Lit = b.lit;
      const neg = b.t === 'neg';
      const g = lit.args;
      if (GUARD_ONLY.has(lit.rel)) { continue; }              // a range check, not a step
      const at = vn(g[0]);
      if (at === null) { bad = `premise \`${lit.rel}\` does not start at a position`; continue; }
      const end = g.length >= 2 ? vn(g[1]) : null;
      if (spans.has(lit.rel) && end !== null && end !== at) {
        steps.push({ s: 'span', rel: lit.rel, from: at, to: end, args: g.slice(2), neg });
      } else {
        steps.push({ s: 'guard', rel: lit.rel, at, args: g.slice(1), neg });
      }
    }
    if (bad) { refused.push({ where, rel: c.head.rel, why: bad }); continue; }
    prods.push({ rel: c.head.rel, arity: a.length, from, to, value: a[2] ?? null, steps, where });
  }
  return { prods, refused, spans };
}

function main(): void {
  const verbose = process.argv.includes('--verbose');
  const { prods, refused, spans } = extract();
  const counts = new Map<string, number>();
  for (const p of prods) for (const s of p.steps) counts.set(s.s, (counts.get(s.s) ?? 0) + 1);

  console.log(`${prods.length} productions expressed, ${refused.length} refused`);
  console.log(`${spans.size} relations concluded with a leading pair of index variables\n`);
  console.log('steps, by kind:');
  for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

  if (refused.length) {
    console.log('\nREFUSED — the generator will not guess at these:');
    for (const r of refused) console.log(`  ${r.where}\n      ${r.why}`);
  }
  if (verbose) {
    console.log('\nproductions:');
    for (const p of prods.slice(0, 40)) {
      const body = p.steps.map((s) =>
        s.s === 'span' ? `${s.neg ? '!' : ''}${s.rel}[${s.from}..${s.to}]`
        : s.s === 'guard' ? `${s.neg ? '!' : ''}${s.rel}@${s.at}`
        : s.s === 'arith' ? `${s.target}=${s.base}${s.delta >= 0 ? '+' : ''}${s.delta}`
        : `${s.op}`).join(' ');
      console.log(`  ${p.rel}[${p.from}..${p.to}]  <-  ${body}`);
    }
  }
}

if (import.meta.filename === process.argv[1]) main();
