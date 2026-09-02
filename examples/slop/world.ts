// world.ts — loading a workbook into the kernel, the provenance display, and
// the oracle.
//
// Nothing here computes a value or a provenance. The kernel does both: this
// file loads facts, and then READS BACK what the store recorded — the witness
// forest for the tree, `query` for everything else. The one thing it adds is
// a PROJECTION: a why tree over `val` nodes is a tree over the inside of a
// formula, and a spreadsheet user thinks in cells, so `provenanceTree` walks
// the same witnesses and prints only the cell frontier. The projection is
// stated so it can be checked — `demo.ts` prints the unprojected kernel tree
// for the same cell next to it.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Rofl } from '../../src/api.ts';
import type { Workbook } from './xlsx.ts';
import { readWorkbook } from './xlsx.ts';
import { SCALE, unscale } from './formula.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');

export const RULES = fs.readFileSync(path.join(HERE, 'slop.rofl'), 'utf8');
/** boot.rofl is loaded because slop.rofl HAS negation — the convergence
 *  report is `not moved(R)` — and without a stratum table negation runs
 *  unchecked (LIMITS.md). `unstratified` being empty is part of the demo. */
export const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

export function load(facts: string, extra: string = ''): Rofl {
  const r = new Rofl();
  for (const program of [BOOT, RULES, facts + '\n' + extra]) {
    const res = r.load(program);
    if (!res.ok) throw new Error('slop: load failed\n' + res.diagnostics.join('\n'));
  }
  return r;
}

// ---------------------------------------------------------------------------
// reading answers back

const q = (s: string): string => JSON.stringify(s);

export function valueOf(r: Rofl, cell: string): number | string | null {
  const rows = r.query(`value(${q(cell)}, V)`).rows;
  if (rows.length === 0) return null;
  const raw = rows[0].bindings['V'];
  return /^-?\d+$/.test(raw) ? Number(raw) : raw;
}

export function intervalOf(r: Rofl, cell: string): [number, number] | null {
  const rows = r.query(`ivalue(${q(cell)}, L, H)`).rows;
  if (rows.length === 0) return null;
  return [Number(rows[0].bindings['L']), Number(rows[0].bindings['H'])];
}

/** A carrier value as a decimal string with all eight places, so a report
 *  never rounds away the thing it is reporting. */
export function show(v: number, places: number = 8): string {
  const neg = v < 0;
  const s = String(Math.abs(v)).padStart(9, '0');
  const int = s.slice(0, -8) || '0';
  const frac = s.slice(-8).slice(0, places).replace(/0+$/, '');
  return (neg ? '-' : '') + int + (frac === '' ? '' : '.' + frac);
}

// ---------------------------------------------------------------------------
// the provenance display
//
// `> huh C47`, and the two lines it exists for: a manual entry in the middle
// of a computed model, and a constant typed inside a formula.

const CELL_RE = /^value\[main\]\((".*?"),(-?\d+|".*")\)$/;
const NUM_RE = /^num\[main\]\((\d+),(-?\d+)\)$/;
const INPUT_RE = /^input\[main\]\((".*?"),(-?\d+)\)$/;
const LABEL_RE = /^label\[main\]\((".*?"),(".*")\)$/;
const EMPTY_RE = /^empty\[main\]\((".*?")\)$/;
const FIND_RE = /^find\[main\]\(\d+,\d+,(".*?"),\d+\)$/;

export interface TreeOpts { depth?: number; children?: number; }

interface Leaf { kind: 'constant' | 'lookup'; text: string }

/** One step of the projection: from a `val` fact, the cells its derivation
 *  actually used and the leaves worth naming. Only the CHOSEN branch of an
 *  IF is here, because the store recorded the firing that happened — which
 *  is the difference between "this number depends on that cell" and "this
 *  formula mentions that cell". */
function frontier(r: Rofl, key: string, seen: Set<string>): { cells: string[]; leaves: Leaf[] } {
  const cells: string[] = [];
  const leaves: Leaf[] = [];
  const walk = (k: string): void => {
    if (seen.has(k)) return;
    seen.add(k);
    const m = CELL_RE.exec(k);
    if (m) { cells.push(k); return; }
    const n = NUM_RE.exec(k);
    if (n) { leaves.push({ kind: 'constant', text: show(Number(n[2])) }); return; }
    const f = FIND_RE.exec(k);
    if (f) leaves.push({ kind: 'lookup', text: JSON.parse(f[1]) as string });
    for (const w of r.store.witnessesOf(k)) {
      for (const p of w.prems) if (p.t === 'fact') walk(p.key);
    }
    // a `find` fact is base, so its own premises are empty; the lookup's
    // source cell arrives through the rule's `value` premise above
  };
  for (const w of r.store.witnessesOf(key)) {
    for (const p of w.prems) if (p.t === 'fact') walk(p.key);
  }
  return { cells, leaves };
}

/** The tree the spec asks for, over the witnesses the kernel recorded. */
export function provenanceTree(r: Rofl, cell: string, opts: TreeOpts = {}): string {
  const maxDepth = opts.depth ?? 6;
  const out: string[] = [];
  const shownCells = new Set<string>();

  const formulaText = (c: string): string | null => {
    const rows = r.query(`formula_text(${q(c)}, T)`).rows;
    return rows.length === 0 ? null : (JSON.parse(rows[0].bindings['T']) as string);
  };

  const render = (cellKey: string, indent: number): void => {
    const m = CELL_RE.exec(cellKey);
    if (!m) return;
    const id = JSON.parse(m[1]) as string;
    const raw = m[2];
    const numeric = /^-?\d+$/.test(raw);
    const pad = '  '.repeat(indent);
    const ftext = formulaText(id);
    const shown = numeric ? show(Number(raw)) : raw;

    if (shownCells.has(id)) { out.push(`${pad}${id} = ${shown}   [shown above]`); return; }
    shownCells.add(id);

    // which of the four kinds of leaf is this cell?
    let tag = '';
    for (const w of r.store.witnessesOf(cellKey)) {
      for (const p of w.prems) {
        if (p.t !== 'fact') continue;
        if (INPUT_RE.test(p.key)) tag = '   [MANUAL ENTRY — a number a human typed]';
        else if (LABEL_RE.test(p.key)) tag = '   [text a human typed]';
        else if (EMPTY_RE.test(p.key)) tag = '   [BLANK CELL, read as zero]';
      }
    }
    out.push(`${pad}${id} = ${shown}${ftext === null ? tag : `  <- =${ftext}`}`);
    if (ftext === null || indent >= maxDepth) {
      if (ftext !== null) out.push(`${pad}  [depth limit ${maxDepth} reached]`);
      return;
    }
    const { cells, leaves } = frontier(r, cellKey, new Set());
    const seenLeaf = new Set<string>();
    for (const l of leaves) {
      const line = l.kind === 'constant'
        ? `${pad}  ${l.text}   [A CONSTANT TYPED INTO THE FORMULA]`
        : `${pad}  via VLOOKUP into ${l.text}`;
      if (!seenLeaf.has(line)) { seenLeaf.add(line); out.push(line); }
    }
    const cap = opts.children ?? 64;
    for (const c of cells.slice(0, cap)) render(c, indent + 1);
    if (cells.length > cap) out.push(`${pad}  ... and ${cells.length - cap} more precedents`);
  };

  const rows = r.query(`value(${q(cell)}, V)`).rows;
  if (rows.length === 0) return `${cell} has no value; try: whynot value(${q(cell)}, V)`;
  render(`value[main](${q(cell)},${rows[0].bindings['V']})`, 0);
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// the oracle

/** Where a headless LibreOffice might be. `soffice` on PATH first, because a
 *  machine that has arranged for it means it. */
const CANDIDATES = [
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
  '/opt/libreoffice/program/soffice',
];

export function findSoffice(): string | null {
  for (const cmd of ['soffice', 'libreoffice']) {
    try {
      const p = execFileSync('/usr/bin/which', [cmd], { encoding: 'utf8' }).trim();
      if (p) return p;
    } catch { /* not on PATH */ }
  }
  for (const p of CANDIDATES) if (fs.existsSync(p)) return p;
  return null;
}

/** Hand a workbook to LibreOffice and read back what it computed.
 *
 *  The route is .xlsx -> .xlsx and not .xlsx -> .csv on purpose: a CSV goes
 *  through the number FORMAT (a rate comes out as "4,73251065547232%", with
 *  the locale's decimal comma), while the round trip writes the recalculated
 *  values into `<v>` in full double precision, where this repository's own
 *  reader picks them up. The profile is a throwaway directory so nothing
 *  touches the user's LibreOffice settings. */
export function recalculate(file: string, soffice: string): Workbook {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-slop-lo-'));
  try {
    execFileSync(soffice, [
      `-env:UserInstallation=file://${path.join(dir, 'profile')}`,
      '--headless', '--norestore', '--convert-to', 'xlsx', '--outdir', dir, file,
    ], { stdio: 'ignore', timeout: 180_000 });
    const out = path.join(dir, path.basename(file).replace(/\.[^.]+$/, '.xlsx'));
    return readWorkbook(fs.readFileSync(out));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export interface Comparison {
  cell: string;
  ours: number;
  theirs: number;
  /** difference in CARRIER UNITS, which is what the claim is made in */
  units: number;
}

/** Compare one kernel value against one oracle value. The oracle's number is
 *  a double; the comparison happens in carrier units, because "to the cent"
 *  is a claim about a unit and the unit has to be named. */
export function compare(cell: string, ours: number, theirs: number): Comparison {
  return { cell, ours, theirs, units: Math.abs(ours - Math.round(theirs * SCALE)) };
}

export { unscale, SCALE };
