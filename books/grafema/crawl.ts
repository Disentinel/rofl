// crawl.ts — the executor of ontocrawler-2 over books/grafema/.
//
//   node --experimental-strip-types books/grafema/crawl.ts            # what is due
//   node --experimental-strip-types books/grafema/crawl.ts --q 'crawl(R, X, D)'
//   node --experimental-strip-types books/grafema/crawl.ts --why 'answer(gen(grafema, held_by), partial)'
//   node --experimental-strip-types books/grafema/crawl.ts --whynot 'hit(gen(grafema, held_by))'
//
// It has no plan of its own: it prints what the book derives — the audits,
// the round, what to crawl and in which order, what to escalate, what the
// report asks — and the fill rates loop 2 needs. The crawler then edits
// book.rofl by hand, closes the tick in steering.rofl, and runs this again.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Rofl } from '../../src/api.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
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

export function world(): Rofl {
  const r = new Rofl();
  must(r.load(read('boot.rofl')), 'boot.rofl');
  must(r.load(read('rules', 'self-audit.rofl')), 'rules/self-audit.rofl');
  must(r.load(read('books', 'grafema', 'protocol.rofl'), { who: 'ontocrawler_2' }), 'protocol.rofl');
  for (const f of ['book.rofl', 'steering.rofl']) {
    for (const s of sections(read('books', 'grafema', f), 'ontocrawler_2')) {
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
    'no_state[audit](Q)', 'class_guessed[audit](X, C)', 'edge_without_evidence[audit](I)',
    'edge_without_round[audit](I)', 'edge_without_depth[audit](I)', 'retired_but_filled[audit](C, R)',
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

function fillRates(r: Rofl): void {
  section('loop 2 — fill rates (class x archetype)');
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
  const retired = new Set(rows(r, 'retired(C, R)').map((x) => `${x.bindings.C}|${x.bindings.R}`));
  const sig = new Set(rows(r, 'signature(C, R)').map((x) => `${x.bindings.C}|${x.bindings.R}`));
  for (const [c, xs] of [...classes].sort()) {
    const cells: string[] = [];
    for (const [rel, d] of [...shape].sort()) {
      const n = xs.filter((x) => filled.has(`${rel}|${x}|${d}`)).length;
      const pct = Math.round((100 * n) / xs.length);
      const mark = sig.has(`${c}|${rel}`) ? '*' : retired.has(`${c}|${rel}`) ? '-' : ' ';
      cells.push(`${rel}${mark}${n}/${xs.length}=${pct}%`);
    }
    console.log(`${c} (n=${xs.length}): ${cells.join('  ')}`);
  }
  console.log('(* induced signature, - retired; rule: >70% -> signature, <30% -> retire, n>=3)');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const r = world();
  const flag = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  if (flag('--q')) { const rs = rows(r, flag('--q')!); for (const x of rs) console.log(x.text); if (rs.length === 0) console.log('(empty)'); }
  else if (flag('--why')) console.log(r.why(flag('--why')!).text);
  else if (flag('--whynot')) console.log(r.whynot(flag('--whynot')!, { depth: 3 }).text);
  else { audits(r); due(r); fillRates(r); }
}
