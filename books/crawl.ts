// crawl.ts — the executor of ontocrawler-2 over books/grafema/.
//
//   node --experimental-strip-types books/crawl.ts grafema            # what is due
//   node --experimental-strip-types books/crawl.ts grafema --q 'crawl(R, X, D)'
//   node --experimental-strip-types books/crawl.ts grafema --why 'answer(gen(grafema, held_by), partial)'
//
// A book is a directory books/<name>/ with book.rofl, steering.rofl and a
// world.json naming the crystals and extra packs it loads.
//
// It has no plan of its own: it prints what the book derives — the audits,
// the round, what to crawl and in which order, what to escalate, what the
// report asks — and the fill rates loop 2 needs. The crawler then edits
// book.rofl by hand, closes the tick in steering.rofl, and runs this again.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Rofl } from '../src/api.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

interface Section { who: string; text: string; }
function sections(text: string, dflt: string): Section[] {
  const out: Section[] = [];
  let who = dflt;
  let buf: string[] = [];
  for (const line of text.split('\n')) {
    const m = /^--\s*@who\s+([a-z_0-9]+)\s*$/.exec(line);
    if (m) { out.push({ who, text: buf.join('\n') }); who = m[1]; buf = []; }
    else buf.push(line);
  }
  out.push({ who, text: buf.join('\n') });
  return out.filter((s) => s.text.trim().length > 0);
}

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

export function world(book: string): Rofl {
  const cfg = JSON.parse(read('books', book, 'world.json')) as { crystals: string[]; packs?: string[] };
  const r = new Rofl();
  must(r.load(read('boot.rofl')), 'boot.rofl');
  must(r.load(read('rules', 'self-audit.rofl')), 'rules/self-audit.rofl');
  must(r.load(read('books', 'protocol.rofl'), { who: 'ontocrawler_2' }), 'protocol.rofl');
  for (const c of cfg.crystals) must(r.load(read('books', 'crystals', `${c}.rofl`), { who: 'ontocrawler_2' }), `crystals/${c}`);
  for (const p of cfg.packs ?? []) must(r.load(read('books', book, p), { who: 'ontocrawler_2' }), p);
  for (const f of ['book.rofl', 'steering.rofl']) {
    for (const s of sections(read('books', book, f), 'ontocrawler_2')) {
      must(r.load(s.text, { who: s.who }), `${f} [@who ${s.who}]`);
    }
  }
  const ev = r.evaluate();
  if (ev.partial) throw new Error(`evaluation hit the budget: peakRows ${ev.peakRows} space ${ev.space}`);
  return r;
}

const rows = (r: Rofl, q: string) => {
  const res = r.query(q);
  if (res.error) throw new Error(`${q}: ${res.error}`);
  return res.rows;
};

function section(title: string): void { console.log(`\n== ${title}`); }

function audits(r: Rofl): void {
  section('audits');
  const gates = [
    'unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)', 'leak[audit](A, B)',
    'undefined_premise[audit](R, Rel)', 'unmoded[audit](R)', 'forged[audit](F)',
    'no_state[audit](Q)', 'guessed_forbidden[audit](X, C)', 'edge_without_evidence[audit](I)',
    'edge_without_round[audit](I)', 'edge_without_depth[audit](I)', 'retired_but_filled[audit](C, R)',
    'archetype_without_origin[audit](R)', 'seed_without_sentence[audit](X)', 'holder_without_invariant[audit](H)', 'asker_without_put[audit](A)', 'asked_without_result[audit](R, X, D, S, K)',
    'echo[audit](I, W)', 'mute_pass[audit](W, K)', 'brought_without_evidence[audit](I, W, S)',
    'decision_without_claim[audit](D)', 'asks_as_unknown[audit](Q, R)', 'question_without_role[audit](Q)', 'values_without_role[audit](I)',
  ];
  for (const g of gates) {
    const rs = rows(r, g);
    console.log(`${rs.length === 0 ? 'ok ' : 'RED'} ${g}${rs.length ? ` — ${rs.length}` : ''}`);
    for (const x of rs.slice(0, 8)) console.log(`      ${x.text}`);
  }
}

function due(r: Rofl): void {
  const round = rows(r, 'round(K)').map((x) => x.bindings.K)[0];
  const rep = rows(r, 'report_due(K)').map((x) => x.bindings.K);
  section(`round ${round}${rep.length ? `  — REPORT DUE (${rep.join(',')})` : ''}`);

  const entered = new Map<string, number>();
  for (const x of rows(r, 'entered(X, K)')) entered.set(x.bindings.X, Number(x.bindings.K));
  const fmt = (x: { bindings: Record<string, string> }) =>
    `${x.bindings.R}(${x.bindings.D === 'in' ? '?' : x.bindings.X}, ${x.bindings.D === 'in' ? x.bindings.X : '?'})  [entered ${entered.get(x.bindings.X)}]`;
  const byEntered = (a: { bindings: Record<string, string> }, b: { bindings: Record<string, string> }) =>
    (entered.get(a.bindings.X) ?? 0) - (entered.get(b.bindings.X) ?? 0) || a.bindings.X.localeCompare(b.bindings.X);

  const hi = rows(r, 'hi(R, X, D)').sort(byEntered);
  const lo = rows(r, 'lo(R, X, D)').sort(byEntered);
  console.log(`crawl: ${hi.length} hi, ${lo.length} lo`);
  for (const x of hi) console.log(`  hi  ${fmt(x)}`);
  for (const x of lo.slice(0, 12)) console.log(`  lo  ${fmt(x)}`);
  if (lo.length > 12) console.log(`  lo  … ${lo.length - 12} more`);

  const esc = rows(r, 'escalate(R, X, D, H)');
  console.log(`escalate: ${esc.length}`);
  for (const x of esc) console.log(`  ${fmt(x)} -> ${x.bindings.H}`);

  const census: Record<string, number> = {};
  for (const x of rows(r, 'answer(Q, S)')) census[x.bindings.S] = (census[x.bindings.S] ?? 0) + 1;
  console.log(`answers: ${JSON.stringify(census)}`);

  if (rep.length) {
    section(`report ${rep[0]}`);
    const nf = rows(r, 'new_fact(K, Id)');
    console.log(`new facts this round: ${nf.length}`);
    const ux = rows(r, 'unexpected_now(K, Id)');
    console.log(`unexpected this round: ${ux.map((x) => x.bindings.Id).join(', ') || 'none'}`);
    const ly = rows(r, 'low_yield(B)');
    console.log(`low yield: ${ly.map((x) => x.bindings.B).join(', ') || 'none'}`);
    for (const x of rows(r, 'ask_kill(B)')) console.log(`ASK kill? ${x.bindings.B}`);
    for (const x of rows(r, 'ask_priority(C)')) console.log(`ASK priority? class ${x.bindings.C}`);
    const sat = rows(r, 'saturated(C)').map((x) => x.bindings.C);
    console.log(`saturated: ${sat.join(', ') || 'none'}`);
  }
}

export type Fill = { c: string; rel: string; n: number; asked: number; pct: number; own: boolean; retired: boolean };
export function fills(r: Rofl): Fill[] {
  const classes = new Map<string, string[]>();
  const ents = new Set(rows(r, 'entity(X)').map((x) => x.bindings.X));
  for (const x of rows(r, 'class(X, C)')) {
    if (!ents.has(x.bindings.X)) continue;
    if (!classes.has(x.bindings.C)) classes.set(x.bindings.C, []);
    classes.get(x.bindings.C)!.push(x.bindings.X);
  }
  const shape = new Map<string, string>();
  for (const x of rows(r, 'q_shape(R, D)')) shape.set(x.bindings.R, x.bindings.D);
  const filled = new Set(rows(r, 'filled(R, X, D)').map((x) => `${x.bindings.R}|${x.bindings.X}|${x.bindings.D}`));
  const asked = new Set(rows(r, 'asked(R, X, D, S, K)').map((x) => `${x.bindings.R}|${x.bindings.X}|${x.bindings.D}`));
  for (const x of rows(r, 'not_found(R, X, D, S, K)')) asked.add(`${x.bindings.R}|${x.bindings.X}|${x.bindings.D}`);
  const retired = new Set(rows(r, 'retired(C, R)').map((x) => `${x.bindings.C}|${x.bindings.R}`));
  const own = new Set(rows(r, 'crystal_own(C, R)').map((x) => `${x.bindings.C}|${x.bindings.R}`));
  // filled / asked, over the entities of the class that were put the question;
  // an entity nobody asked counts for nothing either way.
  const out: Fill[] = [];
  for (const [c, xs] of [...classes].sort()) {
    for (const [rel, d] of [...shape].sort()) {
      const a = xs.filter((x) => asked.has(`${rel}|${x}|${d}`) || filled.has(`${rel}|${x}|${d}`));
      if (a.length === 0) continue;
      const n = a.filter((x) => filled.has(`${rel}|${x}|${d}`)).length;
      out.push({ c, rel, n, asked: a.length, pct: Math.round((100 * n) / a.length), own: own.has(`${c}|${rel}`), retired: retired.has(`${c}|${rel}`) });
    }
  }
  return out;
}

function fillRates(r: Rofl): void {
  section('loop 2 — fill rates (class x archetype)');
  const byClass = new Map<string, string[]>();
  for (const f of fills(r)) {
    const mark = f.own ? '*' : f.retired ? '-' : f.asked >= 3 && f.pct > 70 ? '+' : f.asked >= 3 && f.pct < 30 ? '?' : ' ';
    if (!byClass.has(f.c)) byClass.set(f.c, []);
    byClass.get(f.c)!.push(`${f.rel}${mark}${f.n}/${f.asked}`);
  }
  const size = new Map<string, number>();
  for (const x of rows(r, 'class(X, C)')) size.set(x.bindings.C, (size.get(x.bindings.C) ?? 0) + 1);
  for (const [c, cells] of byClass) console.log(`${c} (n=${size.get(c)}): ${cells.join('  ')}`);
  console.log('(filled/asked; * in the crystal, - retired, + would induce, ? would retire; only asked>=3 decides)');
  section('uncovered — what the crystal expects of a thing and the book has not filled');
  const byX = new Map<string, string[]>();
  for (const x of rows(r, 'uncovered(X, R, Via)')) {
    if (!byX.has(x.bindings.X)) byX.set(x.bindings.X, []);
    byX.get(x.bindings.X)!.push(`${x.bindings.R} (via ${x.bindings.Via})`);
  }
  const xs = [...byX].sort((a, b) => b[1].length - a[1].length);
  for (const [x, rs] of xs.slice(0, 12)) console.log(`  ${x}: ${rs.join(', ')}`);
  if (xs.length > 12) console.log(`  … ${xs.length - 12} more`);
  if (!xs.length) console.log('  none');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [book, ...args] = process.argv.slice(2);
  if (!book) throw new Error('usage: crawl.ts <book> [--q L | --why L | --whynot L]');
  const r = world(book);
  const flag = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  if (flag('--q')) { const rs = rows(r, flag('--q')!); for (const x of rs) console.log(x.text); if (rs.length === 0) console.log('(empty)'); }
  else if (flag('--why')) console.log(r.why(flag('--why')!).text);
  else if (flag('--whynot')) console.log(r.whynot(flag('--whynot')!, { depth: 3 }).text);
  else { audits(r); due(r); fillRates(r); }
}
