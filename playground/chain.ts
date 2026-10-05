// chain.ts — a value's path above its proof. The engine's `why` writes every premise of every step; a value answer
// (`side_effect_value(Site, F, V)`, `may_be_lit(E, V)`) is read as the few steps its value took. The step a value
// took is the premise that carries the same value, its last argument: one of the value layer (may_be_*, the [surface]
// relations sx_*) first, else any premise relating something to it (a fact of one argument is about its value, not a
// step of it). The engine's text is read as it is, so both engines give one chain.
// `folded` is the proof with the premises proved by finite failure counted, one line per step, instead of written.
import type { Node } from './host.ts';

type Fact = { key: string; kids: string[] };

/** The facts of a `why` text, each with the facts it rests on, as the engine first wrote them out. */
function factsOf(raw: string): { top: string; facts: Map<string, Fact> } {
  const facts = new Map<string, Fact>(), stack: { ind: number; key: string }[] = [];
  let top = '';
  for (const l of raw.split('\n')) {
    const ind = l.search(/\S/), s = l.trim();
    while (stack.length && stack[stack.length - 1].ind >= ind) stack.pop();
    const m = /^(\w+(?:\[\w+\])?\(.*\))(?:  <= r[0-9a-f]+(?: @tick \d+)?| \[(axiom|above|past tick)\])$/.exec(s);
    if (!m) { stack.push({ ind, key: '' }); continue; }
    const key = m[1];
    if (!top) top = key;
    const up = stack[stack.length - 1];
    if (up?.key) facts.get(up.key)!.kids.push(key);
    if (!facts.has(key)) facts.set(key, { key, kids: [] });
    stack.push({ ind, key: m[2] === 'above' ? '' : key });
  }
  return { top, facts };
}

const relOf = (k: string) => k.slice(0, k.indexOf('(')).replace(/^nb__/, '').replace(/\[\w+\]$/, '');
const argsOf = (k: string): string[] => k.slice(k.indexOf('(') + 1, -1).match(/"(?:[^"\\]|\\.)*"|[^,]+/g) ?? [];
const VALUE = /^(may_be_|sx_)/;
const NODE = /^n[0-9a-f]{8,16}_\d+$/;
const unq = (s: string) => s.startsWith('"') ? JSON.parse(s) as string : s;

/** What a step of the value layer stands for, by what its rule joined: the first premise relation named here. */
const ROLE: [string, (a: string[]) => string][] = [
  ['literal_kind', () => 'the literal'],
  ['node_value_kind', () => 'the value'],
  ['ext_member', () => 'read from outside the code'],
  ['param_of', (a) => `the parameter ${unq(a[2])}`],
  ['binder', (a) => `reads ${unq(a[1])}`],
  ['module_target', (a) => `imported from ${unq(a[1])}`],
  ['imports_name', () => 'imported'],
  ['destructures', () => 'destructured'],
  ['destructures_at', () => 'destructured'],
  ['assigned', () => 'assigned'],
  ['ret_plain', () => 'returned'],
  ['ret_param', () => 'returned'],
  ['member_value', () => 'a member'],
  ['array_elem', () => 'an element'],
  ['value_transparent', () => 'passed through'],
];

/** The chain of a value answer, from where the value is written to the answer, one line per step: where, the code, what
 *  the step is. Empty when the answer carries no value its premises hand on. `say`: a fact as a sentence, for a step
 *  outside the value layer. */
export function chainOf(raw: string, nodes: Record<string, Node>, say: (key: string) => string): string[] {
  const { top, facts } = factsOf(raw);
  if (!top) return [];
  const steps: string[] = [];
  for (let k: string | undefined = top, seen = new Set<string>(); k && !seen.has(k); ) {
    seen.add(k);
    steps.push(k);
    const v = argsOf(k).at(-1), kids: string[] = facts.get(k)?.kids ?? [];
    const carries: string[] = kids.filter((x) => x !== k && argsOf(x).length > 1 && argsOf(x).at(-1) === v);
    k = carries.find((x) => VALUE.test(relOf(x))) ?? carries[0];
  }
  if (steps.length < 2) return [];
  const node = (t?: string) => t && NODE.test(t) && nodes[t] ? nodes[t] : undefined;
  const label = (t = '') => { const n = node(t); return n ? `${n.label} at ${n.file}:${n.line}` : unq(t); };
  // a fact as a sentence, the node the line is about as `it`
  const said = (k: string, at?: string) => say(k).replace(/, in the \w+$/, '').replace(/`?(n[0-9a-f]{8,16}_\d+)`?/g, (m, id) => id === at ? 'it' : nodes[id] ? `[${label(id)}]` : m);
  const kid = (k: string, rel: string) => facts.get(k)?.kids.find((x) => relOf(x) === rel);
  const lines: { file: string; where: string; code: string; what: string }[] = [];
  let last: string | undefined;
  steps.forEach((k, i) => {
    const rel = relOf(k), a = argsOf(k), kids = facts.get(k)?.kids ?? [];
    let at: string | undefined = a.find((t) => node(t)), code: string | undefined, what: string;
    if (i === 0) {
      const arg = kid(k, 'arg_at');
      what = arg ? `argument ${argsOf(arg)[1]} at the answer` : said(k, at);
    } else if (/^sx_arg_/.test(rel)) {
      const call = kid(k, 'resolves');
      at = call ? argsOf(call)[0] : at;
      what = `argument ${a[1]} of ${label(a[0])}`;
    } else if (/^sx_ret/.test(rel)) what = `returned by ${label(a[0])}`;
    else if (/^sx_export_/.test(rel)) {
      at = kids.map(argsOf).find((x) => node(x[0]))?.[0];
      code = unq(a[1]);
      what = 'exported';
    } else if (/^sx_/.test(rel)) what = 'handed on';
    else if (VALUE.test(rel)) {
      const role = ROLE.find(([r]) => kids.some((x) => relOf(x) === r));
      what = role ? role[1](argsOf(kids.find((x) => relOf(x) === role[0])!)) : 'flows';
    } else what = said(k, at);
    // a step of the same node as the one above it says nothing new; a [surface] step is a hop of its own
    const sx = /^sx_/.test(rel);
    if (i > 0 && at === last && !sx) return;
    if (!sx) last = at;
    const n = node(at);
    lines.push({ file: n?.file ?? '', where: n ? `${n.file}:${n.line}` : '', code: code ?? n?.label ?? '', what });
  });
  lines.reverse();
  // where the value changes file, the line says so
  lines.forEach((l, i) => { if (i > 0 && l.file && lines[i - 1].file && l.file !== lines[i - 1].file) l.what = `across files: ${l.what}`; });
  const w0 = Math.max(...lines.map((l) => l.where.length)), w1 = Math.max(...lines.map((l) => l.code.length));
  return lines.map((l) => `${l.where.padEnd(w0)}  ${l.code.padEnd(w1)}  ${l.what}`.trimEnd());
}

/** A legible proof with each step's premises proved by finite failure, and what showed it, counted on one line. */
export function folded(text: string): string {
  const ls = text.split('\n'), out: string[] = [];
  const pad = (l: string) => l.search(/\S/);
  const neg = (l: string) => /^\s*not .* \(nothing says so\)$/.test(l);
  // the count of each parent's failed premises goes where the first of them stood
  const counts = new Map<number, number>(), first = new Map<number, number>();
  const parentOf = (k: number) => { for (let j = k - 1; j >= 0; j--) if (pad(ls[j]) < pad(ls[k])) return j; return -1; };
  for (let k = 0; k < ls.length; k++) {
    if (!neg(ls[k])) continue;
    const p = parentOf(k);
    counts.set(p, (counts.get(p) ?? 0) + 1);
    if (!first.has(p)) first.set(p, k);
  }
  const at = new Map([...first].map(([p, k]) => [k, p]));
  for (let k = 0; k < ls.length; k++) {
    if (!neg(ls[k])) { out.push(ls[k]); continue; }
    const p = at.get(k);
    if (p !== undefined) { const n = counts.get(p)!; out.push(`${' '.repeat(pad(ls[k]))}+ ${n} side ${n === 1 ? 'condition holds' : 'conditions hold'} (nothing says otherwise)`); }
    for (const d = pad(ls[k]); k + 1 < ls.length && pad(ls[k + 1]) > d; ) k++;
  }
  return out.join('\n');
}
