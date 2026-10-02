// scripts/whycheck.ts — `why`, `whynot` and `excise` from the Rust engine
// against the reference, byte for byte, over every world `npm test` loads.
//
//   npm run whycheck [-- name ...]
//
// The questions are taken from the world itself: its deepest derivation
// (the longest reference `why` among its derived facts), a few derived facts
// spread over the store, each asked `why` and `whynot`, the same fact with its
// last argument changed (a `why` refused, a `whynot` that fails), an undefined
// atom and a fact resting on one where the world is three-valued, and one base
// fact excised. Each is put to `rofl-serve` through runtime/port.ts AND to
// `rofl-load --why/--whynot/--excise`, and both must print what src/api.ts
// prints.

import { Rofl } from '../src/api.ts';
import { RoflPort } from '../runtime/port.ts';
import { worlds, type World } from './goldens.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BOOT = path.join(ROOT, 'boot.rofl');
const LOAD = path.join(ROOT, 'rust/target/release/rofl-load');

type Q = { op: 'why' | 'whynot' | 'excise'; query: string };

/** The world as `npm test` builds it: a refused file is left out, and the
 *  world is the rest — the golden already pins that both engines refuse it. */
function reference(w: World): { r: Rofl; files: string[] } {
  const r = new Rofl();
  const opt = w.budget ? { budget: w.budget } : undefined;
  r.load(fs.readFileSync(BOOT, 'utf8'), opt);
  const files = w.files.filter((f) => r.load(fs.readFileSync(f, 'utf8'), opt).ok);
  if (w.ticks) for (let i = 0; i < w.ticks; i++) r.tickAdvance();
  else r.evaluate(w.budget);
  return { r, files };
}

const askable = (k: string): boolean => !k.includes('$') && !k.includes('?');

function questions(r: Rofl, budget?: number): Q[] {
  const facts = r.store.allFacts().filter((f) => askable(f.key)).map((f) => f.key).sort();
  const derived = facts.filter((k) => r.store.witnessOf(k));
  const base = facts.filter((k) => r.store.get(k)?.base && !r.store.witnessOf(k));
  const spread = (xs: string[], n: number): string[] =>
    xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]);
  let deepest = ''; let lines = 0;
  for (const k of spread(derived, 200)) {
    const n = r.why(k, { budget }).text.split('\n').length;
    if (n > lines) { lines = n; deepest = k; }
  }
  const qs: Q[] = [];
  // an undefined atom, where the world has any: its `why` names the unfounded set
  const unknown = derived.filter((k) => k.startsWith('unknown[')).slice(0, 2);
  // and one that rests on one, through a negation that never settled
  const onUnknown = unknown.length === 0 ? []
    : spread(derived, 200).filter((k) => r.why(k, { budget }).text.includes('[undefined]')).slice(0, 2);
  for (const k of new Set([deepest, ...spread(derived, 4), ...unknown, ...onUnknown].filter(Boolean))) {
    qs.push({ op: 'why', query: k }, { op: 'whynot', query: k });
    const off = k.includes('"') ? k : k.replace(/([(,])[^,()]+\)$/, '$1zz_nowhere)');
    if (off !== k) qs.push({ op: 'why', query: off }, { op: 'whynot', query: off });
  }
  if (base.length) qs.push({ op: 'excise', query: base[Math.floor(base.length / 2)] });
  return qs;
}

function expected(r: Rofl, q: Q, budget?: number): string {
  if (q.op === 'why') return r.why(q.query, { budget }).text;
  if (q.op === 'whynot') return r.whynot(q.query, { budget }).text;
  const x = r.excise(q.query, { budget });
  if (!x.ok) return `error: ${x.error}`;
  const out = [...x.removed.map((k) => `- ${k}`), ...x.added.map((k) => `+ ${k}`)];
  return out.length ? out.join('\n') : '(no change)';
}

async function served(port: RoflPort, w: World, qs: Q[]): Promise<string[]> {
  const s = await port.fresh(w.budget);
  try {
    for (const f of [BOOT, ...w.files]) await s.loadFile(f);
    if (w.ticks) for (let i = 0; i < w.ticks; i++) await s.tick();
    else await s.evaluate();
    const out: string[] = [];
    for (const q of qs) {
      try {
        if (q.op === 'why') out.push(await s.why(q.query));
        else if (q.op === 'whynot') out.push((await s.whynot(q.query)).text);
        else {
          const x = await s.excise(q.query);
          const l = [...x.removed.map((k) => `- ${k}`), ...x.added.map((k) => `+ ${k}`)];
          out.push(l.length ? l.join('\n') : '(no change)');
        }
      } catch (e) { out.push(q.op === 'excise' ? `error: ${(e as Error).message}` : (e as Error).message); }
    }
    return out;
  } finally { await s.close(); }
}

function cli(w: World, qs: Q[]): string[] {
  const args = [...(w.ticks ? ['--ticks', String(w.ticks)] : []), ...(w.budget ? ['--budget', String(w.budget)] : []),
    ...qs.flatMap((q) => [`--${q.op}`, q.query]), BOOT, ...w.files];
  const p = spawnSync(LOAD, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return p.stdout.replace(/\n\n$/, '').split('\n\n');
}

function firstDiff(a: string, b: string): string {
  const x = a.split('\n'); const y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) return `line ${i + 1}: ts ${JSON.stringify(x[i])} / rust ${JSON.stringify(y[i])}`;
  }
  return '';
}

const only = process.argv.slice(2);
const port = await RoflPort.start();
const t0 = Date.now();
let asked = 0; const skipped: string[] = []; const bad: string[] = [];
for (const w of worlds()) {
  if (only.length && !only.includes(w.name)) continue;
  if (w.oneEngine) { skipped.push(w.name); continue; }
  const { r, files } = reference(w);
  const kept = { ...w, files };
  // A key the reference's own parser will not read back is not a question.
  const qs: Q[] = []; const want: string[] = [];
  for (const q of questions(r, w.budget)) {
    try { want.push(expected(r, q, w.budget)); qs.push(q); } catch { /* not askable */ }
  }
  const got = { serve: await served(port, kept, qs), load: cli(kept, qs) };
  for (const [how, ans] of Object.entries(got)) {
    qs.forEach((q, i) => {
      if (ans[i] !== want[i]) bad.push(`${w.name} ${how} ${q.op} ${q.query}: ${firstDiff(want[i], ans[i] ?? '')}`);
    });
  }
  asked += qs.length;
}
await port.stop();
for (const b of bad) console.log(`FAIL ${b}`);
console.log(`\n${asked} questions, each to rofl-serve and rofl-load, ${bad.length} differ from src/api.ts`
  + `, ${((Date.now() - t0) / 1000).toFixed(1)} s\nnot asked (one engine): ${skipped.join(' ') || 'none'}`);
process.exit(bad.length === 0 ? 0 : 1);
