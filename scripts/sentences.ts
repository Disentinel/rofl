// sentences.ts — the sentence generator: eight structures over the reflection.
//
//   npm run sentences -- rules/js-*.rofl        (needs rust/target/release/rofl-render)
//
// Dumps the program as facts, propagates nouns to argument positions, picks a
// noun per position by support, then lets rules/sentences.rofl decide the
// structure, subject and markers of every relation. Prints a table and, with
// --md FILE, writes it as Markdown.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Rofl } from '../src/api.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const argv = process.argv.slice(2);
let md: string | null = null;
const mi = argv.indexOf('--md'); if (mi >= 0) { md = argv[mi + 1]; argv.splice(mi, 2); }
if (!argv.length) { console.error('usage: npm run sentences -- <rules.rofl...> [--md out.md]'); process.exit(2); }

const facts = execFileSync(`${ROOT}rust/target/release/rofl-render`, ['--facts', ...argv], { maxBuffer: 1 << 28 }).toString();
const INFER = `
edb(seed).
seed(ast_node, 0, node).   seed(ast_node, 1, kind).      seed(ast_node, 2, file).   seed(ast_node, 3, line).
seed(ast_child, 0, node).  seed(ast_child, 1, child).    seed(ast_child, 2, index). seed(ast_child, 3, node).
seed(ast_attr, 0, node).   seed(ast_attr, 1, attribute). seed(ast_attr, 2, value).
seed(ast_name, 0, node).   seed(ast_name, 1, name).
seed(ast_value, 0, node).  seed(ast_value, 1, text).
seed(key_name, 0, node).   seed(key_name, 1, key).
seed(ast_within, 0, node). seed(ast_within, 1, node).
at(R, K, Rel, I, V) :- lit(R, K, Rel, _), argv(R, K, I, V).
at(R, 0, Rel, I, V) :- head(R, Rel), argv(R, 0, I, V).
var_noun(R, V, N) :- at(R, K, ast_node, 0, V), arga(R, K, 1, Kind), kind_noun(Kind, N).
var_noun(R, V, N) :- at(R, K, ast_node, 0, V), argv(R, K, 1, KV), at(R, _, Set, 0, KV), kind_noun(Set, N).
var_noun(R, V, N) :- at(R, K, Rel, I, V), noun(Rel, I, N).
vote(Rel, I, N, R, K) :- at(R, K, Rel, I, V), var_noun(R, V, N).
noun(Rel, I, N) :- seed(Rel, I, N).
noun(Rel, I, N) :- vote(Rel, I, N, _, _).
`;
// two worlds: the propagation is the heavy one, the eight rules are light
const boot = readFileSync(`${ROOT}boot.rofl`, 'utf8');
const t0 = Date.now();
const r1 = new Rofl();
const res1: any = r1.load([boot, readFileSync(`${ROOT}facts/js-phrases.rofl`, 'utf8'), INFER, facts].join('\n'), { budget: 300_000_000 });
if (!res1.ok) { console.error(res1.diagnostics.slice(0, 3).join('\n')); process.exit(1); }
console.error(`nouns propagated in ${Date.now() - t0} ms${res1.partial ? ' PARTIAL' : ''}`);
const clean = (x: any) => String(x).replace(/^"|"$/g, '');
let rows = (q: string) => (r1.query(q).rows as any[]).map((x) => x.bindings);

// one noun per position, by support; three or more node kinds at a position is a node
const VALUE = new Set(['name', 'key', 'file', 'index', 'text', 'kind', 'line', 'attribute', 'value', 'literal', 'child']);
const support = new Map<string, Map<string, number>>();
for (const b of rows('vote(Rel, I, N, R, K)')) {
  const pos = `${b.Rel}/${b.I}`;
  const m = support.get(pos) ?? new Map(); support.set(pos, m);
  m.set(clean(b.N), (m.get(clean(b.N)) ?? 0) + 1);
}
const pick = new Map<string, string>();
for (const [pos, m] of support) {
  const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
  const kinds = sorted.filter(([n]) => !VALUE.has(n) && n !== 'node');
  pick.set(pos, kinds.length >= 3 || (m.has('node') && kinds.length >= 2) ? 'node' : sorted[0][0]);
}
const picks = [...pick].map(([pos, n]) => { const [rel, i] = pos.split('/'); return `pick(${rel}, ${i}, ${JSON.stringify(n)}).`; }).join('\n');
const t1 = Date.now();
const r = new Rofl();
const res: any = r.load([boot, readFileSync(`${ROOT}rules/sentences.rofl`, 'utf8'), facts, picks].join('\n'), { budget: 100_000_000 });
if (!res.ok) { console.error(res.diagnostics.slice(0, 3).join('\n')); process.exit(1); }
console.error(`sentences decided in ${Date.now() - t1} ms${res.partial ? ' PARTIAL' : ''}`);
rows = (q: string) => (r.query(q).rows as any[]).map((x) => x.bindings);

// assemble
const arity = new Map<string, number>(); for (const b of rows('arity(Rel, N)')) arity.set(String(b.Rel), Number(b.N));
const words = new Map<string, string[]>(); for (const b of rows('word(Rel, I, W)')) { const w = words.get(String(b.Rel)) ?? []; w[Number(b.I)] = clean(b.W); words.set(String(b.Rel), w); }
const takes = new Map<string, string>(); for (const b of rows('takes(Rel, S)')) takes.set(String(b.Rel), String(b.S));
const admits = new Map<string, string[]>(); for (const b of rows('admits(Rel, S)')) admits.set(String(b.Rel), [...(admits.get(String(b.Rel)) ?? []), String(b.S)]);
const subject = new Map<string, number>(); for (const b of rows('subject(Rel, I)')) subject.set(String(b.Rel), Number(b.I));
const object = new Map<string, number>(); for (const b of rows('object(Rel, I)')) object.set(String(b.Rel), Number(b.I));
const marker = new Map<string, string>(); for (const b of rows('marker(Rel, I, M)')) marker.set(`${b.Rel}/${b.I}`, String(b.M).replace('_', ' '));
const pair = new Map<string, { q: string; s: number; i: number; j: number }>(); for (const b of rows('pair(Rel, Q, S, I, J)')) if (!pair.has(String(b.Rel))) pair.set(String(b.Rel), { q: String(b.Q), s: Number(b.S), i: Number(b.I), j: Number(b.J) });
const plural = (q: string) => { const w = (words.get(q) ?? q.split('_')).filter((x) => x && x !== 'of' && x !== 'to'); const last = w[w.length - 1] ?? q; return [...w.slice(0, -1), last.endsWith('s') ? last : last + 's'].join(' '); };
const SKIP = new Set(['phrase', 'kind_noun', 'edb', 'seed', 'pick']);
const VAR = ['X', 'Y', 'Z', 'W', 'U', 'V'];
const art = (n: string) => (/^[aeiou]/.test(n) ? 'an' : 'a');
const np = (rel: string, i: number) => { const n = pick.get(`${rel}/${i}`); const v = VAR[i] ?? `A${i}`; return n ? (VALUE.has(n) ? `${n} ${v}` : `${art(n)} ${n} ${v}`) : v; };
function sentence(rel: string): string {
  const s = takes.get(rel); if (!s) return '(no structure)';
  const n = arity.get(rel) ?? 0, S = subject.get(rel) ?? 0, O = object.get(rel);
  const w = (words.get(rel) ?? []).filter(Boolean);
  const rest = () => { const out: string[] = []; for (let i = 0; i < n; i++) { if (i === S || i === O) continue; const m = marker.get(`${rel}/${i}`); out.push(`${m ?? '?'} ${np(rel, i)}`); } return out.length ? ' ' + out.join(' ') : ''; };
  const Sn = np(rel, S), On = O === undefined ? '' : (['may', 'the_of', 'role_of', 'has'].includes(s) ? (VAR[O] ?? `A${O}`) : np(rel, O));
  switch (s) {
    case 'adjective': return `${Sn} is ${w.join(' ')}.`;
    case 'bare_verb': return `${Sn} ${w.join(' ')}.`;
    case 'verb': return `${Sn} ${w.join(' ')} ${On}${rest()}.`;
    case 'the_of': return `the ${w.slice(0, -1).join(' ')} of ${Sn} is ${On}${rest()}.`;
    case 'has': return `${Sn} has ${w.filter((x) => x !== 'has').join(' ')} ${On}${rest()}.`;
    case 'passive': return `${Sn} is ${w.join(' ')}${On ? ' by ' + On : ''}${rest()}.`;
    case 'role_of': return `${Sn} is the ${w.join(' ')} of ${On}.`;
    case 'may': return `${Sn} may be the ${w.slice(2).join(' ')} ${On}.`;
    case 'among': return `${On} is among the ${w.join(' ')} of ${Sn}.`;
    case 'the_role': { const K = [...Array(n).keys()].find((i) => i !== S && pick.get(`${rel}/${i}`) === 'key'); const Ov = [...Array(n).keys()].find((i) => i !== S && i !== K); return `the ${w.join(' ')} ${VAR[K ?? 0]} of ${Sn} is ${Ov === undefined ? '' : np(rel, Ov)}.`; }
    case 'pair': { const p = pair.get(rel)!; const others: string[] = []; for (let i = 0; i < n; i++) if (![p.s, p.i, p.j].includes(i)) others.push(`${marker.get(`${rel}/${i}`) ?? '?'} ${np(rel, i)}`); return `${np(rel, p.s)} has two ${plural(p.q)} ${VAR[p.i]} and ${VAR[p.j]}${others.length ? ' ' + others.join(' ') : ''}.`; }
  }
  return '?';
}
const hand = new Map<string, string>();
for (const m of readFileSync(`${ROOT}facts/js-phrases.rofl`, 'utf8').matchAll(/^phrase\((\w+), "([^"]+)"\)/gm)) if (!hand.has(m[1])) hand.set(m[1], m[2]);
const handSig = new Map<string, string>();
for (const m of readFileSync(`${ROOT}facts/js-phrases.rofl`, 'utf8').matchAll(/^sig\((\w+), "([^"]+)"\)/gm)) handSig.set(m[1], m[2]);
const sigStructure = (t: string) => { const name = t.slice(0, t.indexOf('(')); const n = (t.match(/,/g) ?? []).length + 1; return /^has_two_/.test(name) ? 'pair' : /^the_/.test(name) ? 'the_of' : /^has_/.test(name) ? 'has' : /^may_/.test(name) ? 'may' : /^is_the_.*_of$/.test(name) || /^is_(a|an|the)_/.test(name) ? 'role_of' : /^is_.*(ed|en)$/.test(name) ? 'passive' : /^is_/.test(name) ? (n === 1 ? 'adjective' : 'role_of') : n === 1 ? 'bare_verb' : 'verb'; };
const handStructure = (t: string) => /^the .* of /.test(t) ? 'the_of' : / has /.test(t) ? 'has' : / may be /.test(t) ? 'may' : / is among /.test(t) ? 'among' : /^<[^>]+> is \w+ed\b/.test(t) ? 'passive' : /^<[^>]+> is (a|an|the) /.test(t) ? 'role_of' : /^<[^>]+> is \w+$/.test(t) ? 'adjective' : 'verb';

const rels = [...arity.keys()].filter((x) => !SKIP.has(x)).sort();
const byStructure = new Map<string, number>();
let agree = 0, disagree = 0; const dis: string[] = [];
const lines: string[] = ['| relation | arity | takes | sentence | also admits | hand |', '|---|---|---|---|---|---|'];
const sigLine = (rel: string) => '';
for (const rel of rels) {
  const s = takes.get(rel) ?? '-'; byStructure.set(s, (byStructure.get(s) ?? 0) + 1);
  const h = hand.get(rel) ?? handSig.get(rel);
  if (h) { const hs = hand.has(rel) ? handStructure(h) : sigStructure(h); if (hs === s) agree++; else { disagree++; dis.push(`${rel}: took ${s}, hand ${hs}: ${h}`); } }
  lines.push(`| ${rel} | ${arity.get(rel)} | ${s} | ${sentence(rel)} | ${(admits.get(rel) ?? []).filter((x) => x !== s).join(', ')} | ${h ? h.replace(/\|/g, '\\|') : ''} |`);
}
console.log(`${rels.length} relations; structures: ${[...byStructure].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(', ')}`);
console.log(`unmarked positions: ${rows('unmarked(Rel, I)').length}; subjects not at 0: ${[...subject].filter(([, i]) => i !== 0).length}`);
console.log(`against the hand phrases: structure agrees ${agree}, disagrees ${disagree}`);
for (const d of dis) console.log('  ' + d);
console.log('\nsamples:');
for (const rel of ['may_be_node', 'selects', 'field_of', 'class_member_static', 'member_value', 'resolves', 'plain_assign', 'catch_from_host', 'this_host', 'super_of', 'class_method_of', 'decorated_member', 'imports_name', 'eff_hidden_call', 'callee_shape', 'shape_verdict']) if (arity.has(rel)) console.log(`  ${rel.padEnd(22)} ${takes.get(rel)?.padEnd(9)} ${sentence(rel)}`);
if (md) writeFileSync(md, `# Sentences, generated\n\n${lines.join('\n')}\n`);
const sigOf = (rel: string): string => {
  const st = takes.get(rel) ?? 'verb', n = arity.get(rel) ?? 0, S = subject.get(rel) ?? 0;
  const w = (words.get(rel) ?? []).filter(Boolean);
  const vn = (i: number) => `${pick.get(`${rel}/${i}`) ?? 'node'} ${VAR[i] ?? 'A' + i}`;
  const rest = (skip: number[], lead: string) => { const out: string[] = []; for (let i = 0; i < n; i++) { if (skip.includes(i)) continue; const m = marker.get(`${rel}/${i}`); out.push(`${m ? m + ' ' : (out.length === 0 && lead ? lead + ' ' : '')}${vn(i)}`); } return out; };
  const O = object.get(rel);
  const stem = w.join('_');
  let name = stem, args: string[] = [];
  switch (st) {
    case 'adjective': name = w[0] === 'is' ? stem : `is_${stem}`; args = [vn(S)]; break;
    case 'bare_verb': args = [vn(S)]; break;
    case 'verb': args = [vn(S), ...rest([S], '')]; break;
    case 'passive': name = w[0] === 'is' ? stem : `is_${stem}`; args = [vn(S), ...rest([S], 'by')]; break;
    case 'has': name = w[0] === 'has' ? stem : `has_${stem}`; args = [vn(S), ...rest([S], '')]; break;
    case 'role_of': name = `is_the_${stem}_of`; args = [vn(S), ...rest([S], '')]; break;
    case 'may': name = `may_be_the_${w.slice(2).join('_')}`; args = [vn(S), ...rest([S], '')]; break;
    case 'the_of': name = `the_${w.slice(0, -1).join('_')}`; args = [`of ${vn(S)}`, ...(O === undefined ? [] : [`is ${vn(O)}`]), ...rest([S, O ?? -1], '')]; break;
    case 'the_role': { const K = [...Array(n).keys()].find((i) => i !== S && pick.get(`${rel}/${i}`) === 'key') ?? -1; const Ov = [...Array(n).keys()].find((i) => i !== S && i !== K); name = `the_${stem}`; args = [`of ${vn(S)}`, ...(K >= 0 ? [vn(K)] : []), ...(Ov === undefined ? [] : [`is ${vn(Ov)}`]), ...rest([S, K, Ov ?? -1], '')]; break; }
    case 'pair': { const p = pair.get(rel)!; name = `has_two_${plural(p.q).replace(/ /g, '_')}`; args = [vn(p.s), vn(p.i), vn(p.j), ...rest([p.s, p.i, p.j], '')]; break; }
    default: args = [vn(S), ...rest([S], '')];
  }
  return `sig(${rel}, "${name}(${args.join(', ')})").`;
};
if (md) writeFileSync(md.replace(/\.md$/, '.sigs.rofl'), '-- proposed signatures: every relation, the structure the eight rules chose, nouns by support\n' + rels.map(sigOf).join('\n') + '\n');
