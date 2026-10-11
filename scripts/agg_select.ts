// scripts/agg_select.ts — WHICH WORLDS A PIECE OF WORK IS PROVED BY.
//
//   --world W[,W]   by name
//   --item I        every world the ledger binds to a cell item I owns (a
//                   claim, or a column it sweeps), by `handled` or by the
//                   registry's `proves`, and every `work_proof(I, W)`
//   --cell K:L      the worlds bound to the cell (agg, K, L)
//   --file F        every world that loads F
//
// The ledger is read by loading it (facts/agg.rofl, rules/agg.rofl and the
// registry in facts/checks.rofl), never by matching its text. A selection
// that names nothing is an error, not an empty green run.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const LEDGER = ['boot.rofl', 'facts/checks.rofl', 'facts/findings.rofl', 'facts/agg.rofl', 'rules/agg.rofl'];

/** A name the selector gave, or the ledger, that is no world of those given. */
export class NotAWorld extends Error {}

export interface Selector { worlds: string[]; items: string[]; cells: [string, string][]; files: string[] }

const FLAGS = ['--world', '--item', '--cell', '--file'];

/** The selector flags out of `argv`, and whatever else was on it. */
export function parseSelector(argv: string[]): { sel: Selector | null; rest: string[] } {
  const sel: Selector = { worlds: [], items: [], cells: [], files: [] };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('=', 2);
    if (!FLAGS.includes(flag)) { rest.push(argv[i]); continue; }
    const v = inline ?? argv[++i];
    if (v === undefined) throw new Error(`${flag} needs a value`);
    for (const x of v.split(',').filter(Boolean)) {
      if (flag === '--world') sel.worlds.push(x);
      else if (flag === '--item') sel.items.push(x);
      else if (flag === '--file') sel.files.push(path.resolve(ROOT, x));
      else {
        const m = /^([a-z_0-9]+):([a-z_0-9]+)$/.exec(x);
        if (!m) throw new Error(`--cell ${x}: write it K:L, a kind and a column`);
        sel.cells.push([m[1], m[2]]);
      }
    }
  }
  const any = sel.worlds.length + sel.items.length + sel.cells.length + sel.files.length > 0;
  return { sel: any ? sel : null, rest };
}

let ledger: Rofl | undefined;
function load(): Rofl {
  if (ledger) return ledger;
  const r = new Rofl();
  for (const f of LEDGER) {
    const res = r.load(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    if (!res.ok) throw new Error(`${f} does not load: ${res.diagnostics[0]}`);
  }
  r.evaluate();
  return (ledger = r);
}

const rows = (lit: string, ...vs: string[]): string[][] =>
  load().query(lit).rows.map((x) => vs.map((v) => String(x.bindings[v]).replace(/^"|"$/g, '')));

/** The proof worlds of each cell (K, L): the one `handled` names and every
 *  one the registry says `proves` it, so an item still in progress is
 *  covered by the worlds it has registered. */
function cellWorlds(k: string, l: string): string[] {
  return [...new Set([
    ...rows(`handled(agg, ${k}, ${l}, P)`, 'P').map(([p]) => p),
    ...rows(`proves(P, agg, ${k}, ${l})`, 'P').map(([p]) => p),
  ])].filter((p) => p !== 'none');
}

/** The worlds an item is proved by, and the cells it owns that have none. */
export function itemWorlds(item: string): { worlds: string[]; bare: string[] } {
  if (rows(`work(${item}, N)`, 'N').length === 0) throw new Error(`--item ${item}: no such work item in facts/agg.rofl`);
  const cells = new Set(rows(`claim(queued, agg, K, S, L, ${item})`, 'K', 'L').map(([k, l]) => `${k}:${l}`));
  // a sweep owns the cells of its column that no item claims and no waiver takes
  const claimed = new Set([...rows('claim(queued, agg, K, S, L, W)', 'K', 'L'), ...rows('ignored(agg, K, L, R)', 'K', 'L')]
    .map(([k, l]) => `${k}:${l}`));
  for (const [l] of rows(`work_sweeps(${item}, L)`, 'L')) {
    for (const [k] of rows(`cell[audit](agg, K, ${l})`, 'K')) if (!claimed.has(`${k}:${l}`)) cells.add(`${k}:${l}`);
  }
  const worlds = new Set(rows(`work_proof(${item}, P)`, 'P').map(([p]) => p));
  const bare: string[] = [];
  for (const c of [...cells].sort()) {
    const [k, l] = c.split(':');
    const ws = cellWorlds(k, l);
    if (ws.length === 0) bare.push(c);
    for (const w of ws) worlds.add(w);
  }
  return { worlds: [...worlds].sort(), bare };
}

/** The names of the worlds a selector picks out of `all`, each with the
 *  reason it was picked; throws when a part of the selector picks nothing. */
export function select<W extends { name: string; files: string[] }>(all: W[], sel: Selector): { picked: W[]; why: string[] } {
  const names = new Set<string>();
  const why: string[] = [];
  const known = new Set(all.map((w) => w.name));
  for (const w of sel.worlds) {
    if (!known.has(w)) throw new NotAWorld(`--world ${w}: no such world`);
    names.add(w);
  }
  for (const i of sel.items) {
    const { worlds, bare } = itemWorlds(i);
    if (worlds.length === 0) throw new Error(`--item ${i}: no proof world is registered for any cell it owns`);
    why.push(`${i}: ${worlds.join(', ')}${bare.length ? `; cells with no proof world yet: ${bare.join(', ')}` : ''}`);
    for (const w of worlds) names.add(w);
  }
  for (const [k, l] of sel.cells) {
    const ws = cellWorlds(k, l);
    if (ws.length === 0) throw new Error(`--cell ${k}:${l}: no proof world is bound to it`);
    why.push(`${k}:${l}: ${ws.join(', ')}`);
    for (const w of ws) names.add(w);
  }
  for (const f of sel.files) {
    const ws = all.filter((w) => inputs(w).includes(f)).map((w) => w.name);
    if (ws.length === 0) throw new Error(`--file ${path.relative(ROOT, f)}: no world loads it`);
    why.push(`${path.relative(ROOT, f)}: ${ws.join(', ')}`);
    for (const w of ws) names.add(w);
  }
  for (const n of names) if (!known.has(n)) throw new NotAWorld(`the ledger names a world ${n} that is not declared`);
  return { picked: all.filter((w) => names.has(w.name)), why };
}

/** THE WORLD BELOW, named by a file's `-- below: <path>` lines: rofl load
 *  evaluates boot.rofl and those files on their own and feeds what they
 *  conclude to the world before it evaluates (`Session::feed_below`). A
 *  composition is the Rust engine's, so only a Rust-only world may name one. */
export function belowFiles(files: string[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/^-- below: (\S+\.rofl)[ \t]*$/gm)) {
      const p = path.join(ROOT, m[1].trim());
      if (!out.includes(p)) out.push(p);
    }
  }
  return out;
}
/** Every file a world reads: its own, and the world below them. */
export function inputs(w: { files: string[] }): string[] {
  return [...w.files, ...belowFiles(w.files).filter((f) => !w.files.includes(f))];
}
