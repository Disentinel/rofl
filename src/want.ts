/** A WANT (docs/intents.md 4.1, 4.2), the mirror of rust/rofl/src/program.rs `lower_want` and engine/want.rs.
 *
 *  `want Cap(A1..An) :- Body.` is the rule `want_key($want(Cap, A1..An)) :- Body.`, with `want_of(W, Cap)` and a
 *  `want_arg(W, I, Ai)` per argument read from the key, written by these rules alone. At evaluation the wants are held
 *  against the capability rows of the adapter books the world holds; each check refuses the world naming the want
 *  or the rule. */
import { type Term, type Clause, type BodyElem, type Lit, mka, mkf, canonTerm } from './unify.ts';
import type { FactStore } from './store.ts';

/** The rows a want lowers to, which a want's rules alone write. */
export const WANT_ROWS: ReadonlySet<string> = new Set(['want_key', 'want_of', 'want_arg']);

const srcTerm = (t: Term): string => (t.k === 'v' ? (t.name.startsWith('_$') ? '_' : t.name) : t.k === 'f' ? `${t.name}(${t.args.map(srcTerm).join(', ')})` : canonTerm(t));

export function lowerWant(c: Clause): { rule: Clause; texts: string[] } | string {
  const cap = c.head.rel;
  if (c.head.perspExplicit || c.head.temporal !== 'now') return `want ${cap}: a want names no book and no tense`;
  const key = mkf('$want', [mka(cap), ...c.head.args]), w = srcTerm(key);
  const texts = [`want_of(${w}, ${cap}) :- want_key(${w}).`, ...c.head.args.map((a, i) => `want_arg(${w}, ${i + 1}, ${srcTerm(a)}) :- want_key(${w}).`)];
  return { rule: { head: { rel: 'want_key', persp: mka('main'), perspExplicit: false, args: [key], temporal: 'now' }, body: c.body }, texts };
}

const litsDeep = (b: BodyElem[]): Lit[] => b.flatMap((e) => (e.t === 'pos' || e.t === 'neg' ? [e.lit] : e.t === 'agg' ? litsDeep(e.body) : []));
const fits = (ty: Term, a: Term): boolean => {
  if (a.k === 'v' || ty.k !== 'a') return true;
  if (ty.name === 'number') return a.k === 'i';
  if (ty.name === 'atom') return a.k === 'a';
  if (ty.name === 'text' || ty.name === 'time' || ty.name === 'json') return a.k === 's';
  return true;
};

/** The first check a want of these rules fails over this store, as the refusal says it; null when every one holds. */
export function checkWants(store: FactStore, rules: { id: string; clause: Clause }[]): string | null {
  const wants = rules.flatMap((r) => {
    const k = r.clause.head.rel === 'want_key' ? r.clause.head.args[0] : undefined;
    return k?.k === 'f' && k.args[0]?.k === 'a' ? [{ cap: k.args[0].name, given: k.args.slice(1) }] : [];
  });
  const rows = (rel: string, n: number) => store.relAll(rel).filter((f) => f.args.length === n).map((f) => f.args);
  const caps = rows('capability', 3);
  if (wants.length === 0 && caps.length === 0) return null;
  const isCap = (cap: string) => caps.some((c) => c[0].k === 'a' && c[0].name === cap);
  const refuse = (m: string) => `want refused: ${m}`;
  for (const { cap, given } of wants) {
    const shown = `want ${cap}(${given.map(srcTerm).join(', ')})`;
    if (!isCap(cap)) return refuse(`${shown}: no capability '${cap}' is declared; the world imports its adapter's book (\`capability(${cap}, Adapter, Class)\`)`);
    const types = new Map<number, Term>();
    for (const a of rows('arg', 4)) if (a[0].k === 'a' && a[0].name === cap && a[1].k === 'i' && !types.has(Number(a[1].v))) types.set(Number(a[1].v), a[3]);
    const ordered = [...types].sort((x, y) => x[0] - y[0]);
    if (ordered.length !== given.length) return refuse(`${shown}: '${cap}' takes ${ordered.length} argument(s) by its \`arg\` rows, the want gives ${given.length}`);
    for (const [k, [pos, ty]] of ordered.entries()) {
      if (pos !== k + 1) return refuse(`${shown}: the \`arg\` rows of '${cap}' leave position ${k + 1} out`);
      if (!fits(ty, given[k])) return refuse(`${shown}: argument ${k + 1} is ${srcTerm(given[k])}, and '${cap}' takes a ${canonTerm(ty)} there`);
    }
  }
  const q = rules.find((r) => r.clause.head.rel === 'query' && r.clause.head.args.length === 2);
  if (q && caps.length > 0) return refuse(`rule ${q.id}: it concludes query, the template of a sql capability; a template is its adapter book's, never a string a rule builds`);
  for (const a of rows('answers', 3)) {
    if (a[0].k !== 'a' || a[1].k !== 'a' || !isCap(a[0].name)) continue;
    const [cap, rel] = [a[0].name, a[1].name];
    const by = rules.find((r) => r.clause.head.rel === rel);
    if (by) return refuse(`rule ${by.id}: it concludes ${rel}, which '${cap}' answers in; an answer is its adapter's, at a later tick`);
    const shows = caps.some((c) => c[0].k === 'a' && c[0].name === cap && c[2].k === 'a' && c[2].name === 'shows');
    const reader = shows ? rules.find((r) => litsDeep(r.clause.body).some((l) => l.rel === rel)) : undefined;
    if (reader) return refuse(`rule ${reader.id}: it reads ${rel}, which '${cap}' answers in, and what a \`shows\` capability answers feeds nothing back`);
  }
  return null;
}
