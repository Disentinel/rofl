// spat.ts — SPAT: a real family week, and the questions a schedule cannot
// answer about itself.
//
//   node --experimental-strip-types examples/spat/spat.ts [command]
//
//     (no arguments)                  the week, the red blocks, what has no backup
//     check                           does it hold together, and where it does not
//     free    <person>                free time, DERIVED — not the gaps
//     place   <name> <minutes>        where could something new go
//     hours   [person]                nominal and effective working hours
//     backup                          who else could do each responsibility
//     why     <block>                 why this block sits where it does
//     whynot  <child> <day> <time>    why nobody is covering that minute
//     relax   <child> <day> <time>    what would have to give, and whose
//     whatif  --without <name>        a person, the car, an outside arrangement
//     whatif  --add '<fact>.'         any change you can write as a fact
//     whatif  --move <block> <days> <time>   move a commitment
//     whatif  --week-of <week>        the other dated week
//     fragile                         chains with no slack, runs with one way
//
//   --week <file>      a different week file
//   --week-of <week>   evaluate as of a different dated week
//
// BRUTE FORCE COMPUTES, ROFL EXPLAINS. The only computation here is
// enumeration: merging adjacent slots into intervals, adding minutes up
// (the kernel has no aggregation, on purpose), and walking a candidate grid
// for `place`. Every judgement — who is covered, who is on call, what has
// slack, what has a backup, which constraint took the last person away and
// who owns it — is a query, a `whynot`, an `excise`, or a semiring folded
// over the support the kernel recorded.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  countingSemiring, tropicalSemiring, provenanceSemiring, provenanceOf,
  renderCount, type Count, type Polynomial,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
export const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
export const SPAT = fs.readFileSync(path.join(HERE, 'spat.rofl'), 'utf8');
// YOUR week if you have one, the shipped example if you do not. `week.rofl`
// is gitignored: a document naming where your children are every hour is not
// something a public repository should carry.
export const DEFAULT_WEEK = fs.existsSync(path.join(HERE, 'week.rofl'))
  ? path.join(HERE, 'week.rofl')
  : path.join(HERE, 'week.example.rofl');

// ---------------------------------------------------------------------------
// display: the model speaks Latin atoms because the kernel has no string
// builtins and the grep test constrains identifiers. People read Russian.

// WHAT A NAME READS AS. Only the STRUCTURAL vocabulary is here - days, the
// kinds of person, the places any household has. WHO LIVES IN THE HOUSE IS
// NOT CODE: names come from `ru_name/2` in the week file, so a household's
// members stay in a file that is gitignored, and this repository ships no
// list of anybody's children. An atom with no entry prints as itself.
const RU: Record<string, string> = {
  nanny: 'няня', school_bus: 'школьный автобус',
  school: 'школа', sadik: 'садик', dentist: 'стоматолог',
  home: 'дом', physio: 'физио', pool: 'бассейн', office: 'офис',
  shop: 'магазин', park: 'парк', clinic: 'клиника',
  run_school: 'отвезти в школу', run_sadik: 'отвезти в садик',
  work_am: 'работа (утро)', work_pm: 'работа (день)',
  physio_block: 'физио', pickup: 'забор детей', lunch: 'обед', walk: 'прогулка',
  swim: 'плавание', shopping: 'закупка', cleaning: 'генуборка',
  dentist_block: 'стоматолог',
  mon: 'пн', tue: 'вт', wed: 'ср', thu: 'чт', fri: 'пт', sat: 'сб', sun: 'вс',
  adult: 'взрослый', child: 'ребёнок', helper: 'помощь',
  neighbour: 'соседи', service: 'сервис', visitor: 'гость',
};
export const ru = (a: string): string => RU[a] ?? a;

// ---------------------------------------------------------------------------
// the world

export interface WorldOpts { weekOf?: string; extra?: string[]; }

export function world(weekFile: string = DEFAULT_WEEK, opts: WorldOpts = {}): Rofl {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load(SPAT + '\n' + fs.readFileSync(weekFile, 'utf8')), weekFile);
  if (opts.weekOf) {
    const cur = table(r, 'current', 'W')[0]?.W;
    if (cur && cur !== opts.weekOf) {
      r.retract(`current(${cur})`);
      must(r.assert(`current(${opts.weekOf}).`), `current(${opts.weekOf})`);
      bust(r);
    }
  }
  for (const e of opts.extra ?? []) { must(r.assert(e), e); bust(r); }
  // the household's own names, from its own file
  for (const n of r.query('ru_name(A, T)').rows) {
    const a = n.bindings.A; const txt = n.bindings.T;
    if (typeof a === 'string' && typeof txt === 'string') RU[a] = txt.replace(/^"|"$/g, '');
  }
  if (opts.weekOf || (opts.extra ?? []).length > 0) r.evaluate();
  return r;
}

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what} did not load:\n  ${res.diagnostics.join('\n  ')}`);
}

// ---------------------------------------------------------------------------
// reading the store
//
// Every query builds a fresh Evaluation and decodes the rule set from the
// store, so asking a thousand one-row questions costs a thousand rule decodes.
// Everything below reads a WHOLE relation once and indexes it here.

const TABLES = new WeakMap<object, Map<string, Record<string, string>[]>>();
export function table(r: Rofl, rel: string, vars: string): Record<string, string>[] {
  let m = TABLES.get(r.store);
  if (!m) { m = new Map(); TABLES.set(r.store, m); }
  const hit = m.get(rel);
  if (hit) return hit;
  const got = r.query(`${rel}(${vars})`).rows.map((x) => x.bindings);
  m.set(rel, got);
  return got;
}
const bust = (r: Rofl): void => { TABLES.delete(r.store); FOLDS.delete(r.store); };

export function index<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return m;
}
export const col = (r: Rofl, q: string, v: string): string[] =>
  r.query(q).rows.map((x) => x.bindings[v]);
export const rows = (r: Rofl, q: string): Record<string, string>[] =>
  r.query(q).rows.map((x) => x.bindings);

// ---------------------------------------------------------------------------
// minutes and days

export const hhmm = (m: number | string): string => {
  const n = Number(m);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
export function parseTime(s: string): number {
  const c = s.match(/^(\d{1,2}):(\d{2})$/);
  if (c) return Number(c[1]) * 60 + Number(c[2]);
  if (/^\d+$/.test(s)) return Number(s);
  throw new Error(`not a time: ${s} (write 18:00, or 1080 for minutes since midnight)`);
}
export const dayOrder = (r: Rofl): Map<string, number> =>
  new Map(table(r, 'day', 'D, N').map((b) => [b.D, Number(b.N)]));
export const gridOf = (r: Rofl): number => Number(table(r, 'grid', 'G')[0]?.G ?? 20);

/** Slot times -> merged [from, to) intervals. The kernel has no aggregation;
 *  this is the host doing arithmetic over what the rules decided. */
export function merge(slots: number[], grid: number): [number, number][] {
  const xs = [...new Set(slots)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const s of xs) {
    const last = out[out.length - 1];
    if (last && last[1] === s) last[1] = s + grid;
    else out.push([s, s + grid]);
  }
  return out;
}
export const mins = (n: number): string =>
  n >= 60 ? `${Math.floor(n / 60)}ч ${n % 60 ? `${n % 60}м` : ''}`.trim() : `${n}м`;

// ---------------------------------------------------------------------------
// semiring folds, cached per store

interface Folds { count: Map<string, Count>; prov: Map<string, Polynomial>; tight: Map<string, number>; }
const FOLDS = new WeakMap<object, Folds>();
const NAMED_SOURCE =
  /^(usual|usual_on|moved|skipped|added|lift|present_window|absent|absent_on|awake|constraint|person|car|driver|travel|with|kind)\[main\]\(/;
/** Weight offset: slack may be negative and tropical's discipline is stated
 *  for non-negative weights, so every chain is charged M + OFFSET and the
 *  offset is taken back off the answer. */
const OFFSET = 10_000;

export function folds(r: Rofl): Folds {
  const hit = FOLDS.get(r.store);
  if (hit) return hit;
  const count = evaluateSemiring(r.store, countingSemiring).value;
  const prov = evaluateSemiring(r.store, provenanceSemiring, {
    base: (k) => (NAMED_SOURCE.test(k) ? provenanceOf(k) : [[]]),
  }).value;
  // tropical, charging each chain its own slack: the value of day_tight(P,D)
  // is then the MINIMUM slack of that person's day.
  const tropical = evaluateSemiring(r.store, tropicalSemiring, {
    base: () => 0,
    weight: (key, w) => {
      if (!key.startsWith('day_tight[main](')) return 0;
      const p = w.prems.find((x) => x.t === 'fact' && x.key.startsWith('slack[main]('));
      const m = p && p.t === 'fact' ? p.key.match(/,(-?\d+)\)$/) : null;
      return m ? Number(m[1]) + OFFSET : OFFSET;
    },
  }).value;
  const tight = new Map<string, number>();
  for (const [k, v] of tropical) {
    if (k.startsWith('day_tight[main](') && v !== Infinity) tight.set(k, v - OFFSET);
  }
  const out = { count, prov, tight };
  FOLDS.set(r.store, out);
  return out;
}

// ---------------------------------------------------------------------------
// constraints and their owners

export const ownerOf = (r: Rofl, c: string): { owner: string; scope: string } => {
  const b = table(r, 'constraint', 'C, O, S').find((x) => x.C === c);
  return b ? { owner: b.O, scope: b.S } : { owner: '?', scope: '?' };
};
export function sayConstraint(r: Rofl, c: string): string {
  const { owner, scope } = ownerOf(r, c);
  return `${c.padEnd(16)} ${ru(owner).padEnd(14)} ${scope === 'external' ? 'ВНЕШНЕЕ' : 'наше'}`;
}

/** Relations whose first argument is a constraint id. Owner is required, so a
 *  week naming a constraint it never declares is a bug in the week file. */
export const OWNED_REL: [string, string][] = [
  ['usual', 'C, E, W, P, Sp, F, T'], ['usual_on', 'C, E, D, F, T'],
  ['moved', 'C, E, W, D1, D2, F, T'], ['skipped', 'C, E, W, D'],
  ['added', 'C, E, W, P, Wk, D, F, T'], ['present_window', 'C, P, Sp, F, T'],
  ['absent', 'C, P, Sp'], ['absent_on', 'C, P, W, D'], ['awake', 'C, Ch, Sp, F, T'],
  ['lift', 'C, Cr, R, F, T, Sp, L, A'], ['walks_alone', 'C, P'], ['give', 'C, N'],
];
export function unowned(r: Rofl): string[] {
  const declared = new Set(table(r, 'constraint', 'C, O, S').map((x) => x.C));
  const used = new Set<string>();
  for (const [rel, vars] of OWNED_REL) for (const b of table(r, rel, vars)) used.add(b.C);
  return [...used].filter((c) => !declared.has(c)).sort();
}

const NAMES_PEOPLE: [string, string, string[]][] = [
  ['usual', 'C, E, W, P, Sp, F, T', ['W']], ['added', 'C, E, W, P, Wk, D, F, T', ['W']],
  ['present_window', 'C, P, Sp, F, T', ['P']], ['absent', 'C, P, Sp', ['P']],
  ['absent_on', 'C, P, W, D', ['P']], ['awake', 'C, Ch, Sp, F, T', ['Ch']],
  ['walks_alone', 'C, P', ['P']], ['driver', 'P', ['P']], ['with', 'E, Ch', ['Ch']],
  ['lift', 'C, Cr, R, F, T, Sp, L, A', ['Cr', 'R']],
];
const NAMES_PLACES: [string, string, string[]][] = [
  ['usual', 'C, E, W, P, Sp, F, T', ['P']], ['added', 'C, E, W, P, Wk, D, F, T', ['P']],
  ['travel', 'A, B, M', ['A', 'B']], ['on_foot', 'A, B, M', ['A', 'B']],
  ['supervised', 'P', ['P']], ['base', 'B', ['B']],
  ['lift', 'C, Cr, R, F, T, Sp, L, A', ['F', 'T']],
];
function undeclared(r: Rofl, spec: [string, string, string[]][], declared: Set<string>): string[] {
  const used = new Set<string>();
  for (const [rel, vars, pick] of spec) {
    for (const b of table(r, rel, vars)) for (const v of pick) used.add(b[v]);
  }
  return [...used].filter((x) => !declared.has(x)).sort();
}

/** Everything wrong with a week file the tool can see by itself. Each one
 *  fails SILENTLY otherwise: a misspelt child simply stops having a week. */
export function lint(r: Rofl): string[] {
  const out: string[] = [];
  const orphans = unowned(r);
  if (orphans.length > 0) {
    out.push(`НЕТ ВЛАДЕЛЬЦА: ${orphans.join(', ')}`);
    out.push('  add a  constraint(Id, Owner, household|external).  line for each;');
    out.push('  until you do, the tool cannot say whose requirement it is.');
  }
  const people = undeclared(r, NAMES_PEOPLE, new Set(table(r, 'person', 'P, K').map((x) => x.P)));
  if (people.length > 0) {
    out.push(`НЕ ОБЪЯВЛЕН person(...): ${people.join(', ')}`);
    out.push('  a name with no person/2 line has no week at all — check the spelling.');
  }
  const places = undeclared(r, NAMES_PLACES, new Set(table(r, 'place', 'P').map((x) => x.P)));
  if (places.length > 0) {
    out.push(`НЕ ОБЪЯВЛЕНО place(...): ${places.join(', ')}`);
  }
  // a chain between two places with no travel time is silently dropped
  const tt = new Set(table(r, 'tt', 'A, B, M').map((x) => `${x.A}|${x.B}`));
  const sp = index(table(r, 'span', 'C, E, W, P, D, F, T'), (x) => `${x.W}|${x.D}`);
  const missing = new Set<string>();
  for (const day of sp.values()) {
    const ord = day.slice().sort((a, b) => Number(a.F) - Number(b.F));
    for (let i = 1; i < ord.length; i++) {
      const k = `${ord[i - 1].P}|${ord[i].P}`;
      if (!tt.has(k)) missing.add(`${ord[i - 1].P} -> ${ord[i].P}`);
    }
  }
  if (missing.size > 0) {
    out.push(`НЕТ ВРЕМЕНИ В ПУТИ: ${[...missing].sort().join(', ')}`);
    out.push('  a handover between two places with no travel/3 fact has no slack');
    out.push('  and is silently left out of every answer. Add the minutes.');
  }
  return out;
}

// ---------------------------------------------------------------------------
// the week as intervals

export interface Block {
  c: string; ev: string; who: string; place: string; day: string; from: number; to: number;
}
export const blocks = (r: Rofl): Block[] =>
  table(r, 'span', 'C, E, W, P, D, F, T').map((b) => ({
    c: b.C, ev: b.E, who: b.W, place: b.P, day: b.D, from: Number(b.F), to: Number(b.T),
  }));

export interface Hole { child: string; day: string; from: number; to: number; }
export function holes(r: Rofl): Hole[] {
  const g = gridOf(r);
  const by = index(table(r, 'uncovered', 'Ch, D, S'), (x) => `${x.Ch}|${x.D}`);
  const out: Hole[] = [];
  for (const [k, xs] of by) {
    const [child, day] = k.split('|');
    for (const [from, to] of merge(xs.map((x) => Number(x.S)), g)) out.push({ child, day, from, to });
  }
  const ord = dayOrder(r);
  return out.sort((a, b) => ord.get(a.day)! - ord.get(b.day)! || a.from - b.from
    || (a.child < b.child ? -1 : 1));
}

/** Who was NOT available in a slot, and which constraint took them.
 *
 *  Both halves are read straight out of the store: `out_why/4` is derived by
 *  the rules, journey included, and carries the constraint id. Nothing here
 *  recomputes a travel buffer or decides anything. */
export function whoWasBusy(r: Rofl, day: string, slot: number):
    { person: string; why: string[] }[] {
  const out: { person: string; why: string[] }[] = [];
  const took = index(table(r, 'out_why', 'P, D, S, C')
    .filter((x) => x.D === day && Number(x.S) === slot), (x) => x.P);
  const present = new Set(table(r, 'here', 'P, D, S')
    .filter((x) => x.D === day && Number(x.S) === slot).map((x) => x.P));
  for (const p of table(r, 'coverer', 'P')) {
    const why = [...new Set((took.get(p.P) ?? []).map((x) => x.C))].sort();
    if (!present.has(p.P) && why.length === 0) why.push('not_present');
    if (why.length > 0) out.push({ person: p.P, why });
  }
  return out;
}

// ---------------------------------------------------------------------------
// slack

export interface Chain { who: string; day: string; a: string; b: string; m: number; }
export const chains = (r: Rofl): Chain[] =>
  table(r, 'slack', 'P, D, E1, E2, M').map((x) => ({
    who: x.P, day: x.D, a: x.E1, b: x.E2, m: Number(x.M),
  }));

// ---------------------------------------------------------------------------
// runs, and who could make them

export interface Run { id: string; child: string; from: string; to: string; day: string; at: number; ways: string[]; }
export function runs(r: Rofl): Run[] {
  const byRun = index(table(r, 'way', 'T, W'), (x) => x.T);
  return table(r, 'run', 'T, Ch, F, To, D, K, At').map((x) => ({
    id: x.T, child: x.Ch, from: x.F, to: x.To, day: x.D, at: Number(x.At),
    ways: (byRun.get(x.T) ?? []).map((y) => y.W).sort(),
  }));
}
export function sayWay(w: string): string {
  let m = w.match(/^drive\(([^,]+),/);
  if (m) return `${ru(m[1])} везёт`;
  m = w.match(/^lift\((.+)\)$/);
  if (m) return `${ru(m[1])}`;
  m = w.match(/^walk\((.+)\)$/);
  if (m) return 'пешком';
  return w;
}

// ---------------------------------------------------------------------------
// backup: how many people could discharge each responsibility
//
// The counting semiring folded over the support: `run_ok(T)` has one
// derivation per way, `covered(Ch,D,S)` one per person on duty. Same metric
// NOPE uses for privilege sprawl, read the other way up — there many
// independent paths is the ALARM, here it is the reassurance and ONE is the
// alarm.

export interface Duty { what: string; detail: string; day: string; at: number; n: number; who: string; }
export function backup(r: Rofl): Duty[] {
  const f = folds(r);
  const g = gridOf(r);
  const out: Duty[] = [];
  for (const run of runs(r)) {
    out.push({
      what: 'run', detail: `${ru(run.child)}: ${ru(run.from)} → ${ru(run.to)}`,
      day: run.day, at: run.at, n: run.ways.length,
      who: run.ways.map(sayWay).join(', ') || '—',
    });
  }
  // a coverage window is a run of slots the same child needs; the backup
  // number is the WORST slot in it, because that is the one that fails
  // A coverage window is a run of slots with the SAME number of people who
  // could take it. Merging by need instead would label a six-hour afternoon
  // "nobody" because forty minutes of it are uncovered.
  const duties = index(table(r, 'on_duty', 'P, D, S'), (x) => `${x.D}|${x.S}`);
  const by = index(table(r, 'needs_cover', 'Ch, D, S'), (x) => `${x.Ch}|${x.D}`);
  for (const [k, xs] of by) {
    const [child, day] = k.split('|');
    const at = new Map<number, number>();
    for (const x of xs) {
      const c = f.count.get(`any_duty[main](${day},${x.S})`);
      at.set(Number(x.S), c === undefined || c === 0n ? 0 : Number(c));
    }
    const times = [...at.keys()].sort((a2, b2) => a2 - b2);
    let i = 0;
    while (i < times.length) {
      const n = at.get(times[i])!;
      let j = i;
      while (j + 1 < times.length && times[j + 1] === times[j] + g
             && at.get(times[j + 1]) === n) j++;
      const from = times[i];
      const to = times[j] + g;
      out.push({
        what: 'cover', detail: `${ru(child)} ${hhmm(from)}–${hhmm(to)}`,
        day, at: from, n,
        who: n === 0 ? '—'
          : (duties.get(`${day}|${from}`) ?? []).map((x) => ru(x.P)).join(', '),
      });
      i = j + 1;
    }
  }
  const ord = dayOrder(r);
  return out.sort((a, b) => ord.get(a.day)! - ord.get(b.day)! || a.at - b.at
    || (a.detail < b.detail ? -1 : 1));
}

// ---------------------------------------------------------------------------
// hours: the engine says which minutes, the host adds them up
//
// The kernel has NO aggregation — START.md section 8 puts it out of scope —
// so every total below is plain arithmetic here, over intervals the rules
// derived. What the rules decide is which minutes COUNT, and that is where
// the content is: an hour of work while you are the only person a child can
// turn to is not an hour of work.

export interface Hours {
  who: string; day: string; nominal: number; effective: number; shared: number;
}
export function hours(r: Rofl): Hours[] {
  const g = gridOf(r);
  const nom = index(table(r, 'work_slot', 'P, D, S'), (x) => `${x.P}|${x.D}`);
  const eff = index(table(r, 'eff_work', 'P, D, S'), (x) => `${x.P}|${x.D}`);
  const sh = index(table(r, 'shared_work', 'P, D, S'), (x) => `${x.P}|${x.D}`);
  const ord = dayOrder(r);
  return [...nom.keys()].map((k) => {
    const [who, day] = k.split('|');
    return {
      who, day,
      nominal: nom.get(k)!.length * g,
      effective: (eff.get(k) ?? []).length * g,
      shared: (sh.get(k) ?? []).length * g,
    };
  }).sort((a, b) => (a.who < b.who ? -1 : a.who > b.who ? 1 : 0)
    || ord.get(a.day)! - ord.get(b.day)!);
}

// ---------------------------------------------------------------------------
// free time — derived, not read off as gaps

export interface FreeWin { day: string; from: number; to: number; }
export function freeTime(r: Rofl, who: string): { free: FreeWin[]; raw: FreeWin[]; onCall: FreeWin[] } {
  const g = gridOf(r);
  const pick = (rel: string, vars: string): FreeWin[] => {
    const by = index(table(r, rel, vars).filter((x) => x.P === who), (x) => x.D);
    const out: FreeWin[] = [];
    for (const [day, xs] of by) {
      for (const [from, to] of merge(xs.map((x) => Number(x.S)), g)) out.push({ day, from, to });
    }
    const ord = dayOrder(r);
    return out.sort((a, b) => ord.get(a.day)! - ord.get(b.day)! || a.from - b.from);
  };
  return {
    free: pick('free_slot', 'P, D, S'),
    raw: pick('raw_gap', 'P, D, S'),
    onCall: pick('on_call', 'P, D, S'),
  };
}

// ---------------------------------------------------------------------------
// place: the one query that GENERATES rather than evaluates

export interface Slot { day: string; at: number; buffer: number; }
export function placements(r: Rofl, act: string, dur: number): { ok: Slot[]; why: Map<string, string[]> } {
  const ord = dayOrder(r);
  const owner = table(r, 'want', 'A, P, Pl, D')[0]?.P;
  const mine = blocks(r).filter((b) => b.who === owner);
  const ok: Slot[] = table(r, 'admissible', 'A, D, S').filter((x) => x.A === act)
    .map((x) => {
      const at = Number(x.S);
      const day = mine.filter((b) => b.day === x.D);
      // how much room the placement leaves on either side: the tightest
      // neighbouring gap, which is the slack it consumes
      const before = day.filter((b) => b.to <= at).map((b) => at - b.to);
      const after = day.filter((b) => b.from >= at + dur).map((b) => b.from - at - dur);
      const gaps = [...before, ...after];
      return { day: x.D, at, buffer: gaps.length > 0 ? Math.min(...gaps) : 999 };
    })
    .sort((a, b) => b.buffer - a.buffer || ord.get(a.day)! - ord.get(b.day)! || a.at - b.at);
  const why = new Map<string, string[]>();
  for (const x of table(r, 'cand_bad', 'A, D, S, R')) {
    if (x.A !== act) continue;
    const k = `${x.D}|${x.S}`;
    if (!why.has(k)) why.set(k, []);
    why.get(k)!.push(x.R);
  }
  return { ok, why };
}

// ---------------------------------------------------------------------------
// perturbation: excise, or assert, then diff

export interface Blast {
  ok: boolean; error?: string; removed: number; added: number;
  newHoles: Hole[]; goneHoles: Hole[];
  lostRuns: { id: string; was: string[] }[];
  soleBefore: number; soleAfter: number;
  tightBefore: number; tightAfter: number;
  brokeBefore: string[]; brokeAfter: string[];
}

export function perturb(r: Rofl, after: Rofl, removed: number, added: number): Blast {
  const key = (h: Hole) => `${h.child}|${h.day}|${h.from}`;
  const b4 = new Map(holes(r).map((h) => [key(h), h]));
  const af = new Map(holes(after).map((h) => [key(h), h]));
  const runsBefore = new Map(runs(r).map((x) => [x.id, x]));
  const runsAfter = new Map(runs(after).map((x) => [x.id, x]));
  const lostRuns: { id: string; was: string[] }[] = [];
  for (const [id, x] of runsBefore) {
    const y = runsAfter.get(id);
    // a run that no longer EXISTS did not lose its driver: the commitment it
    // served is simply not in this week
    if (y && x.ways.length > 0 && y.ways.length === 0) lostRuns.push({ id, was: x.ways });
  }
  const g = gridOf(r);
  return {
    ok: true, removed, added,
    newHoles: [...af.values()].filter((h) => !b4.has(key(h))),
    goneHoles: [...b4.values()].filter((h) => !af.has(key(h))),
    lostRuns,
    soleBefore: table(r, 'sole', 'P, D, S').length * g,
    soleAfter: table(after, 'sole', 'P, D, S').length * g,
    tightBefore: table(r, 'tight', 'P, D, A, B').length,
    tightAfter: table(after, 'tight', 'P, D, A, B').length,
    brokeBefore: table(r, 'broken', 'R').map((x) => x.R).sort(),
    brokeAfter: table(after, 'broken', 'R').map((x) => x.R).sort(),
  };
}

/** The one base fact that IS a person, a car, or an outside arrangement. */
export function findFact(r: Rofl, name: string): string | null {
  const p = table(r, 'person', 'P, K').find((x) => x.P === name);
  if (p) return `person(${name}, ${p.K})`;
  const c = table(r, 'car', 'C').find((x) => x.C === name);
  if (c) return `car(${name})`;
  if (name === 'car') {
    const any = table(r, 'car', 'C')[0]?.C;
    return any ? `car(${any})` : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// rendering

const HR = (t: string) => `\n── ${t} ${'─'.repeat(Math.max(2, 68 - t.length))}`;
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

export function renderWeek(r: Rofl): string {
  const ord = dayOrder(r);
  const hs = holes(r);
  const out: string[] = [];
  const by = index(blocks(r), (b) => b.day);
  for (const day of [...by.keys()].sort((a, b) => ord.get(a)! - ord.get(b)!)) {
    out.push(`\n${ru(day)}`);
    const lines: { at: number; text: string }[] = [];
    for (const b of by.get(day)!) {
      const withs = table(r, 'with', 'E, Ch').filter((x) => x.E === b.ev)
        .map((x) => ru(x.Ch));
      lines.push({
        at: b.from,
        text: `   ${hhmm(b.from)}–${hhmm(b.to)}  ${ru(b.who).padEnd(8)}`
          + ` ${ru(b.ev).padEnd(18)} ${ru(b.place).padEnd(10)}`
          + `${withs.length > 0 ? ' + ' + withs.join(', ') : ''}`,
      });
    }
    for (const h of hs.filter((x) => x.day === day)) {
      lines.push({
        at: h.from,
        text: `   ${hhmm(h.from)}–${hhmm(h.to)}  ${'НЕ ПОКРЫТ'.padEnd(8)}`
          + ` ${ru(h.child)}  <<< никого нет дома`,
      });
    }
    lines.sort((a, b) => a.at - b.at || (a.text < b.text ? -1 : 1));
    for (const l of lines) out.push(l.text);
  }
  return out.join('\n');
}

export function renderHoles(r: Rofl): string {
  const hs = holes(r);
  if (hs.length === 0) return '  Дыр нет: каждый ребёнок покрыт каждую минуту.';
  const out: string[] = [`  ${hs.length} red blocks. Each one names who could have been`,
    '  there and the constraint that took them.\n'];
  for (const h of hs) {
    out.push(`  ${ru(h.day)} ${hhmm(h.from)}–${hhmm(h.to)}   ${ru(h.child)}`);
    for (const { person, why } of whoWasBusy(r, h.day, h.from)) {
      out.push(`      ${ru(person).padEnd(10)} ${why.map((c) => c === 'not_present'
        ? 'не в эти часы вообще'
        : sayConstraint(r, c)).join('; ')}`);
    }
  }
  return out.join('\n');
}

export function renderBackup(r: Rofl): string {
  const bs = backup(r);
  const out: string[] = [];
  const holes0 = bs.filter((b) => b.n === 0);
  const solo = bs.filter((b) => b.n === 1);
  const safe = bs.filter((b) => b.n >= 2);
  out.push(`  ${bs.length} responsibilities this week.`);
  out.push(`  ${holes0.length} with nobody, ${solo.length} with exactly one person, `
    + `${safe.length} with a spare.\n`);
  const show = (title: string, xs: Duty[]) => {
    if (xs.length === 0) return;
    out.push(`  ${title}`);
    for (const b of xs) {
      out.push(`    ${ru(b.day).padEnd(3)} ${hhmm(b.at)}  ${b.detail.padEnd(30)}`
        + ` ${String(b.n).padStart(2)}  ${b.who}`);
    }
    out.push('');
  };
  show('НИКОГО (0) — a hole in the plan:', holes0);
  show('ОДИН (1) — no backup; whoever it is, their absence collapses this:', solo);
  show('ЕСТЬ ЗАПАС (2+) — somebody else could:', safe);
  out.push('  The number is the counting semiring folded over the support the kernel');
  out.push('  recorded: one derivation per person who could take it. NOPE reads the');
  out.push('  same metric as an alarm; here many is reassurance and ONE is the alarm.');
  return out.join('\n');
}

export function renderChains(r: Rofl): string {
  const out: string[] = [];
  const ord = dayOrder(r);
  const cs = chains(r).sort((a, b) => a.m - b.m || ord.get(a.day)! - ord.get(b.day)!);
  const bad = cs.filter((c) => c.m <= 0);
  out.push(`  ${cs.length} handovers this week. ${bad.length} with no slack at all.\n`);
  for (const c of cs.slice(0, 12)) {
    const mark = c.m < 0 ? '!! НЕ УСПЕВАЕТ' : c.m === 0 ? '!! БЕЗ ЗАПАСА ' : '              ';
    out.push(`  ${mark} ${ru(c.day).padEnd(3)} ${ru(c.who).padEnd(8)}`
      + ` ${ru(c.a).padEnd(18)} → ${ru(c.b).padEnd(18)} ${String(c.m).padStart(4)} мин`);
  }
  if (cs.length > 12) out.push(`  ... ${cs.length - 12} more, all with room to spare.`);
  const f = folds(r);
  const tight = [...f.tight.entries()]
    .map(([k, v]) => {
      const m = k.match(/^day_tight\[main\]\(([^,]+),([^)]+)\)$/)!;
      return { who: m[1], day: m[2], m: v };
    })
    .sort((a, b) => a.m - b.m);
  if (tight.length > 0) {
    out.push('\n  tightest handover of each day (tropical semiring: a minimum the');
    out.push('  kernel has no aggregation to compute, folded over the same support):');
    for (const t of tight.slice(0, 6)) {
      out.push(`    ${ru(t.day).padEnd(3)} ${ru(t.who).padEnd(8)} ${String(t.m).padStart(4)} мин`);
    }
  }
  const fr = runs(r).filter((x) => x.ways.length === 1);
  if (fr.length > 0) {
    out.push(`\n  and ${fr.length} runs with exactly one way to happen:`);
    for (const x of fr) {
      out.push(`    ${ru(x.day).padEnd(3)} ${hhmm(x.at)}  ${ru(x.child).padEnd(8)}`
        + ` ${ru(x.from)} → ${ru(x.to).padEnd(10)} ${sayWay(x.ways[0])}`);
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// the questions

export function why(r: Rofl, block: string): string {
  const out: string[] = [];
  const bs = blocks(r).filter((b) => b.ev === block);
  if (bs.length === 0) {
    return `нет такого блока: ${block}. Есть: `
      + [...new Set(blocks(r).map((b) => b.ev))].sort().join(', ');
  }
  const ord = dayOrder(r);
  const u = table(r, 'usual', 'C, E, W, P, Sp, F, T').find((x) => x.E === block);
  out.push(`${ru(block)} — ${ru(bs[0].who)}, ${ru(bs[0].place)}.`);
  if (u) out.push(`\n  типовая неделя:  ${sayConstraint(r, u.C)}  ${u.Sp} `
    + `${hhmm(u.F)}–${hhmm(u.T)}`);
  for (const o of table(r, 'usual_on', 'C, E, D, F, T').filter((x) => x.E === block)) {
    out.push(`  всегда иначе:    ${sayConstraint(r, o.C)}  ${ru(o.D)} `
      + `${hhmm(o.F)}–${hhmm(o.T)}`);
  }
  const cur = table(r, 'current', 'W')[0]?.W;
  for (const m of table(r, 'moved', 'C, E, W, D1, D2, F, T').filter((x) => x.E === block && x.W === cur)) {
    out.push(`  на этой неделе:  ${sayConstraint(r, m.C)}  ${ru(m.D1)} → ${ru(m.D2)} `
      + `${hhmm(m.F)}–${hhmm(m.T)}`);
  }
  for (const s of table(r, 'skipped', 'C, E, W, D').filter((x) => x.E === block && x.W === cur)) {
    out.push(`  на этой неделе:  ${sayConstraint(r, s.C)}  ${ru(s.D)}: отменено`);
  }
  out.push(`\n  идёт: ${bs.sort((a, b) => ord.get(a.day)! - ord.get(b.day)!)
    .map((b) => `${ru(b.day)} ${hhmm(b.from)}–${hhmm(b.to)}`).join(', ')}`);
  const cs = chains(r).filter((c) => c.a === block || c.b === block)
    .sort((a, b) => a.m - b.m);
  if (cs.length > 0) {
    out.push('\n  что к нему примыкает, и сколько остаётся:');
    for (const c of cs) {
      out.push(`    ${ru(c.day).padEnd(3)} ${ru(c.a).padEnd(18)} → ${ru(c.b).padEnd(18)}`
        + ` ${String(c.m).padStart(4)} мин${c.m <= 0 ? '   <<< без запаса' : ''}`);
    }
  }
  const f = folds(r);
  const p = f.prov.get(`span[main](${bs[0].c},${block},${bs[0].who},${bs[0].place},`
    + `${bs[0].day},${bs[0].from},${bs[0].to})`) ?? [];
  if (p.length > 0 && p[0].length > 0) {
    out.push('\n  на чём этот блок стоит (provenance semiring, minimal source sets):');
    for (const k of p[0]) out.push(`    ${k.replace('[main]', '')}`);
  }
  return out.join('\n');
}

export function whynot(r: Rofl, child: string, day: string, at: number): string {
  const out: string[] = [];
  const g = gridOf(r);
  const slot = Math.floor(at / g) * g;
  const needs = table(r, 'needs_cover', 'Ch, D, S')
    .some((x) => x.Ch === child && x.D === day && Number(x.S) === slot);
  if (!needs) {
    out.push(`${ru(child)}, ${ru(day)} ${hhmm(slot)}: покрытие не требуется.`);
    const sup = blocks(r).filter((b) => b.who === child && b.day === day
      && b.from <= slot && slot < b.to);
    if (sup.length > 0) out.push(`  он(а) в ${ru(sup[0].place)} (${ru(sup[0].ev)}).`);
    else out.push('  спит, или уже с кем-то в блоке `with`.');
    out.push('\n  the kernel refusing to invent the need:\n');
    for (const l of r.whynot(`needs_cover[main](${child}, ${day}, ${slot})`, { depth: 3 })
      .text.split('\n')) out.push(`  ${l}`);
    return out.join('\n');
  }
  const covered = !table(r, 'uncovered', 'Ch, D, S')
    .some((x) => x.Ch === child && x.D === day && Number(x.S) === slot);
  if (covered) {
    const who = table(r, 'on_duty', 'P, D, S')
      .filter((x) => x.D === day && Number(x.S) === slot).map((x) => ru(x.P));
    out.push(`${ru(child)}, ${ru(day)} ${hhmm(slot)}: ПОКРЫТ — ${who.join(', ')}.`);
    out.push(`  (сколько человек могли бы: ${who.length}. Один — это единственная точка отказа.)`);
    return out.join('\n');
  }
  out.push(`${ru(child)}, ${ru(day)} ${hhmm(slot)} — НЕ ПОКРЫТ. Не "infeasible":`);
  out.push('вот кто мог бы и что его забрало.\n');
  for (const { person, why } of whoWasBusy(r, day, slot)) {
    out.push(`  ${ru(person).padEnd(10)} ${why.map((c) => c === 'not_present'
      ? 'в эти часы её вообще нет'
      : sayConstraint(r, c)).join('\n' + ' '.repeat(13))}`);
  }
  out.push('\n  and the kernel\'s own demonstration, one failing premise at a time:\n');
  for (const l of r.whynot(`any_duty[main](${day}, ${slot})`, { depth: 4 })
    .text.split('\n')) out.push(`  ${l}`);
  const cs = [...new Set(whoWasBusy(r, day, slot).flatMap((x) => x.why))]
    .filter((c) => c !== 'not_present');
  if (cs.length > 0) {
    out.push('\n  что ещё держится на этих ограничениях:');
    const sp = blocks(r);
    for (const c of cs) {
      const n = sp.filter((b) => b.c === c).length;
      out.push(`    ${sayConstraint(r, c)} — ${plural(n, 'block')} across the week`);
    }
  }
  return out.join('\n');
}

export interface Relaxation { cs: string[]; cost: number; }
export function relax(r: Rofl, weekFile: string, weekOf: string | undefined,
                     child: string, day: string, at: number):
    { ok: boolean; note: string; found: Relaxation[] } {
  const g = gridOf(r);
  const slot = Math.floor(at / g) * g;
  if (!table(r, 'uncovered', 'Ch, D, S')
    .some((x) => x.Ch === child && x.D === day && Number(x.S) === slot)) {
    return { ok: true, note: 'ничего уступать не надо: этот слот покрыт.', found: [] };
  }
  const cand = [...new Set(whoWasBusy(r, day, slot).flatMap((x) => x.why))]
    .filter((c) => c !== 'not_present' && ownerOf(r, c).owner !== '?');
  const cost = new Map(table(r, 'give_cost', 'C, N').map((x) => [x.C, Number(x.N)]));
  const found: Relaxation[] = [];
  // singles first, then pairs of what is left: verified by actually waiving
  // and re-deriving, because a set that only looks sufficient is not an answer
  const trial = (cs: string[]): boolean => {
    const w = world(weekFile, { weekOf, extra: cs.map((c) => `waived(${c}).`) });
    return !table(w, 'uncovered', 'Ch, D, S')
      .some((x) => x.Ch === child && x.D === day && Number(x.S) === slot);
  };
  for (const c of cand) {
    if (trial([c])) found.push({ cs: [c], cost: cost.get(c) ?? 0 });
  }
  if (found.length === 0) {
    for (let i = 0; i < cand.length; i++) {
      for (let j = i + 1; j < cand.length; j++) {
        const cs = [cand[i], cand[j]];
        if (trial(cs)) {
          found.push({ cs, cost: cs.reduce((n, c) => n + (cost.get(c) ?? 0), 0) });
        }
      }
    }
  }
  found.sort((a, b) => a.cs.length - b.cs.length || a.cost - b.cost
    || (a.cs.join() < b.cs.join() ? -1 : 1));
  return {
    ok: found.length > 0, found,
    note: found.length > 0 ? ''
      : 'ни одно из этих ограничений в одиночку или парой не закрывает дыру — '
        + 'нужен новый человек, а не уступка.',
  };
}

// ---------------------------------------------------------------------------
// main

function summary(r: Rofl): string {
  const p = table(r, 'person', 'P, K');
  const cs = table(r, 'constraint', 'C, O, S');
  const ext = cs.filter((x) => x.S === 'external');
  const cur = table(r, 'current', 'W')[0]?.W ?? '?';
  return `  ${p.filter((x) => x.K === 'adult').map((x) => ru(x.P)).join(', ')}`
    + ` · ${p.filter((x) => x.K === 'child').map((x) => ru(x.P)).join(', ')}`
    + ` · ${p.filter((x) => x.K !== 'adult' && x.K !== 'child').map((x) => ru(x.P)).join(', ')}\n`
    + `  неделя ${cur}. ${cs.length} ограничений: ${ext.length} внешних `
    + `(${[...new Set(ext.map((x) => ru(x.O)))].join(', ')}), `
    + `${cs.length - ext.length} наших.`;
}

async function main(argv: string[]): Promise<void> {
  const t0 = Date.now();
  let weekFile = DEFAULT_WEEK;
  let weekOf: string | undefined;
  for (const [flag, set] of [['--week', (v: string) => { weekFile = path.resolve(v); }],
    ['--week-of', (v: string) => { weekOf = v; }]] as [string, (v: string) => void][]) {
    const i = argv.indexOf(flag);
    if (i >= 0 && argv[i + 1] !== undefined && !(flag === '--week-of' && argv[i - 1] === 'whatif')) {
      set(argv[i + 1]); argv.splice(i, 2);
    }
  }
  const [cmd, ...rest] = argv;
  // `place` builds its own world with the want fact in it; `free` needs the
  // free-time block switched on, which nothing else pays for.
  const extra = cmd === 'free' ? ['asking(free).']
    : cmd === 'hours' ? ['asking(hours).'] : [];
  const r = world(weekFile, { weekOf, extra });

  if (cmd === 'html') {
    // THE GRID IS A VIEW, NOT A SECOND MODEL. Every number in it comes from a
    // relation the rules derived; if the grid and the text ever disagree the
    // grid is wrong, and `spat html --check` is what says so.
    const { weekHtml } = await import('./html.ts');
    const out = rest.find((x) => !x.startsWith('--'));
    const html = weekHtml(r, { standalone: true });
    if (out) {
      fs.writeFileSync(path.resolve(process.cwd(), out), html);
      console.log(`${out} — ${html.length} байт. Открой в браузере, печать: A4 landscape.`);
    } else {
      process.stdout.write(html);
    }
    return;
  }

  if (cmd === undefined || cmd === 'week') {
    console.log(`SPAT — ${path.relative(ROOT, weekFile)}`);
    console.log(summary(r));
    const problems = lint(r);
    if (problems.length > 0) {
      console.log('');
      for (const l of problems) console.log(l.startsWith(' ') ? `   ${l}` : `  !! ${l}`);
    }
    console.log(HR('неделя'));
    console.log(renderWeek(r));
    console.log(HR('НЕ ПОКРЫТО'));
    console.log(renderHoles(r));
    const zero = backup(r).filter((b) => b.n === 0);
    const one = backup(r).filter((b) => b.n === 1);
    console.log(HR('без замены'));
    console.log(`  ${zero.length} — вообще некому. ${one.length} — ровно одному человеку.`);
    for (const b of [...zero, ...one].slice(0, 12)) {
      console.log(`    ${String(b.n)}  ${ru(b.day).padEnd(3)} ${hhmm(b.at)}  `
        + `${b.detail.padEnd(30)} ${b.who}`);
    }
    console.log(HR('дальше'));
    console.log('  check · free <кто> · place <что> <минут> · hours · backup · fragile');
    console.log('  why <блок> · whynot <ребёнок> <день> <время> · relax <...> · whatif ...');
    console.log('  html <файл.html> — сетка недели для экрана и печати');
    console.log(`\n(${Date.now() - t0} ms)`);
    return;
  }

  if (cmd === 'check') {
    const broke = table(r, 'broken', 'R').map((x) => x.R);
    console.log(broke.length === 0
      ? 'НЕДЕЛЯ СХОДИТСЯ. Ни одной дыры, ни одного отрицательного запаса,\nни одной поездки без исполнителя, никто не в двух местах сразу.'
      : `НЕ СХОДИТСЯ. Причины: ${broke.join(', ')}\n`);
    if (broke.includes('uncovered')) {
      console.log(HR('дыры в покрытии'));
      console.log(renderHoles(r));
    }
    if (broke.includes('no_time')) {
      console.log(HR('не успевает'));
      for (const c of chains(r).filter((x) => x.m < 0)) {
        console.log(`  ${ru(c.day)} ${ru(c.who)}: ${ru(c.a)} → ${ru(c.b)} — не хватает `
          + `${-c.m} мин`);
      }
    }
    if (broke.includes('no_way')) {
      console.log(HR('поездки без исполнителя'));
      for (const t of table(r, 'run_stuck', 'T')) console.log(`  ${t.T}`);
    }
    if (broke.includes('double_booked')) {
      console.log(HR('в двух местах сразу'));
      for (const o of table(r, 'overbooked', 'P, D, E1, E2')) {
        console.log(`  ${ru(o.D)} ${ru(o.P)}: ${ru(o.E1)} и ${ru(o.E2)}`);
      }
    }
    console.log(HR('запас'));
    console.log(renderChains(r));
  } else if (cmd === 'fragile') {
    console.log(renderChains(r));
  } else if (cmd === 'backup') {
    console.log(renderBackup(r));
  } else if (cmd === 'hours') {
    const hs = hours(r).filter((h) => rest[0] === undefined || h.who === rest[0]);
    const ord = dayOrder(r);
    console.log('Часы: НОМИНАЛЬНО — как стоит в расписании. ЭФФЕКТИВНО — минус те');
    console.log('минуты, когда ты единственный, к кому может обратиться ребёнок.');
    console.log('Второе выведено из покрытия, а не вписано вторым числом.\n');
    const by = index(hs, (h) => h.who);
    for (const [who, xs] of by) {
      console.log(`  ${ru(who)}`);
      let n = 0; let e = 0; let sh = 0;
      for (const h of xs.sort((a, b) => ord.get(a.day)! - ord.get(b.day)!)) {
        n += h.nominal; e += h.effective; sh += h.shared;
        console.log(`    ${ru(h.day).padEnd(3)} ${mins(h.nominal).padStart(8)} номинально`
          + ` · ${mins(h.effective).padStart(8)} эффективно`
          + ` · ${mins(h.nominal - h.shared).padStart(8)} без ребёнка рядом`);
      }
      console.log(`    ${'итого'.padEnd(3)} ${mins(n).padStart(8)}`
        + ` · ${mins(e).padStart(8)} · ${mins(n - sh).padStart(8)}\n`);
    }
    console.log('  ЭФФЕКТИВНО вычитает минуты, когда ты ЕДИНСТВЕННЫЙ, кто может');
    console.log('  прикрыть ребёнка. БЕЗ РЕБЁНКА РЯДОМ вычитает все минуты, когда');
    console.log('  ребёнок дома и его надо держать в поле зрения, даже если второй');
    console.log('  взрослый тоже дома. Первое — то, что ломается; второе — то, что');
    console.log('  в исходном расписании подписано «реально часа 3-4».\n');
    console.log('  The kernel has no aggregation (START.md section 8): the rules decide');
    console.log('  which minutes count, these totals are plain arithmetic in spat.ts.');
  } else if (cmd === 'free') {
    const who = rest[0];
    const { free, raw, onCall } = freeTime(r, who);
    const ord = dayOrder(r);
    console.log(`Свободное время: ${ru(who)}\n`);
    console.log('  ВЫВЕДЕНО, а не считано с пустых мест. Из окна вычитается: время,');
    console.log('  когда ты единственный, кто может прикрыть ребёнка (ты на связи,');
    console.log('  даже если ничем не занят), и промежутки внутри цепочки без запаса.\n');
    const by = index(free, (f) => f.day);
    for (const day of [...new Set(raw.map((f) => f.day))]
      .sort((a, b) => ord.get(a)! - ord.get(b)!)) {
      const f = (by.get(day) ?? []).map((x) => `${hhmm(x.from)}–${hhmm(x.to)}`);
      const oc = onCall.filter((x) => x.day === day).map((x) => `${hhmm(x.from)}–${hhmm(x.to)}`);
      console.log(`  ${ru(day).padEnd(3)} свободно: ${f.join(', ') || '—'}`);
      if (oc.length > 0) console.log(`      на связи (не свободно): ${oc.join(', ')}`);
    }
    const span = (xs: FreeWin[]) => xs.reduce((n, x) => n + (x.to - x.from), 0);
    console.log(`\n  сырые промежутки: ${mins(span(raw))} за неделю`);
    console.log(`  из них свободно:  ${mins(span(free))}`);
    console.log(`  разница:          ${mins(span(raw) - span(free))} — это и есть ответ.`);
  } else if (cmd === 'place') {
    const act = rest[0];
    const dur = parseTime(rest[1] ?? '60');
    const flat = rest.filter((x) => !x.startsWith('--'));
    const owner = flat[2] ?? table(r, 'person', 'P, K').find((x) => x.K === 'adult')!.P;
    const where = flat[3] ?? table(r, 'base', 'B')[0].B;
    const w = world(weekFile, { weekOf, extra: [`want(${act}, ${owner}, ${where}, ${dur}).`] });
    const { ok, why: bad } = placements(w, act, dur);
    const g = gridOf(w);
    const ord = dayOrder(w);
    console.log(`Куда поставить «${act}» — ${mins(dur)}, ${ru(owner)}, ${ru(where)}\n`);
    console.log('  Единственный запрос, который ПОРОЖДАЕТ, а не проверяет: перебор всех');
    console.log('  начал по сетке, отфильтрованный ровно теми же правилами, что решают');
    console.log('  всё остальное. Поэтому «допустимо» здесь значит то же самое.\n');
    if (ok.length === 0) {
      console.log('  Некуда. Что мешает, по числу вариантов:');
      const tally = new Map<string, number>();
      for (const rs of bad.values()) for (const x of new Set(rs)) tally.set(x, (tally.get(x) ?? 0) + 1);
      for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`    ${k}: ${n}`);
    } else {
      const by = index(ok, (x) => x.day);
      for (const day of [...by.keys()].sort((a, b) => ord.get(a)! - ord.get(b)!)) {
        const xs = by.get(day)!.map((x) => x.at).sort((a, b) => a - b);
        const wins = merge(xs, g).map(([f, t]) => `${hhmm(f)}–${hhmm(t - g + dur)}`);
        const best = by.get(day)!.reduce((a, b) => (b.buffer > a.buffer ? b : a));
        console.log(`  ${ru(day).padEnd(3)} ${wins.join(', ')}`);
        console.log(`      лучше всего ${hhmm(best.at)}: оставляет `
          + `${best.buffer === 999 ? 'весь день' : mins(best.buffer)} по краям`);
      }
    }
    const onAt = rest.indexOf('--on');
    if (onAt >= 0) {
      const d = rest[onAt + 1];
      const at = Math.floor(parseTime(rest[onAt + 2]) / g) * g;
      const rs = bad.get(`${d}|${at}`);
      console.log(`\n  а почему не ${ru(d)} ${hhmm(at)}?`);
      console.log(rs ? `    ${rs.map((x) => PLACE_WHY[x] ?? x).join('; ')}`
        : '    подходит — оно есть в списке выше.');
    }
  } else if (cmd === 'why') {
    console.log(why(r, rest[0]));
  } else if (cmd === 'whynot') {
    console.log(whynot(r, rest[0], rest[1], parseTime(rest[2])));
  } else if (cmd === 'relax') {
    const res = relax(r, weekFile, weekOf, rest[0], rest[1], parseTime(rest[2]));
    console.log(`Что придётся уступить, чтобы закрыть ${ru(rest[0])} `
      + `${ru(rest[1])} ${rest[2]}:\n`);
    if (res.note) console.log(`  ${res.note}`);
    for (const f of res.found) {
      console.log(`  уступить ${f.cs.length === 1 ? 'вот это' : `эти ${f.cs.length}`}`
        + `  (цена ${f.cost}):`);
      for (const c of f.cs) console.log(`    ${sayConstraint(r, c)}`);
    }
    if (res.found.length > 1) {
      console.log('\n  Дешевле — сверху. Цена по give/2, по умолчанию 50 за своё');
      console.log('  и 200 за чужое: договориться с садиком дороже, чем сдвинуть прогулку.');
    }
  } else if (cmd === 'whatif') {
    console.log(runWhatif(r, weekFile, weekOf, rest));
  } else {
    console.log(`неизвестная команда: ${cmd}\n`);
    console.log(USAGE);
  }
  console.log(`\n(${Date.now() - t0} ms)`);
}

export function runWhatif(r0: Rofl, weekFile: string, weekOf: string | undefined,
                          rest: string[]): string {
  const at = (f: string) => rest.indexOf(f);
  // a perturbation is compared on sole-cover time as well as on holes, and
  // that lives behind the `deep` gate, so both sides pay for it here
  const DEEP = ['asking(hours).'];
  const r = world(weekFile, { weekOf, extra: DEEP });
  let after: Rofl;
  let what: string;
  let removed = 0; let added = 0;
  if (at('--without') >= 0) {
    const name = rest[at('--without') + 1];
    const isC = table(r, 'constraint', 'C, O, S').some((x) => x.C === name);
    if (isC) {
      what = `снять ${sayConstraint(r, name).trimEnd()}`;
      after = world(weekFile, { weekOf, extra: [...DEEP, `waived(${name}).`] });
    } else {
      const fact = findFact(r, name);
      if (!fact) return `  нет такого: '${name}'. Человек, машина или id ограничения.`;
      const ex = r.excise(fact);
      if (!ex.ok) return `  ${ex.error}`;
      removed = ex.removed.length; added = ex.added.length;
      what = `excise ${fact}`;
      after = world(weekFile, { weekOf, extra: DEEP });
      after.retract(fact);
      after.evaluate();
    }
  } else if (at('--add') >= 0) {
    const clause = rest.slice(at('--add') + 1).join(' ');
    what = `assert ${clause}`;
    after = world(weekFile, { weekOf, extra: [...DEEP, clause] });
  } else if (at('--move') >= 0) {
    const [blk, spec, time] = rest.slice(at('--move') + 1);
    const u = table(r, 'usual', 'C, E, W, P, Sp, F, T').find((x) => x.E === blk);
    if (!u) return `  нет такого блока в типовой неделе: ${blk}`;
    const start = parseTime(time);
    const dur = Number(u.T) - Number(u.F);
    // a day list (`tue,thu`) becomes a group on the spot, so a what-if does
    // not need the week file to have anticipated it
    const days = spec.split(',').filter((x) => x.length > 0);
    const useSpec = days.length > 1 ? 'whatif_days' : spec;
    const groups = days.length > 1 ? days.map((d) => `in_group(whatif_days, ${d}).`) : [];
    what = `${ru(blk)}: ${u.Sp} ${hhmm(u.F)} → ${spec} ${hhmm(start)}`;
    after = world(weekFile, { weekOf, extra: [...DEEP, ...groups] });
    after.retract(`usual(${u.C}, ${u.E}, ${u.W}, ${u.P}, ${u.Sp}, ${u.F}, ${u.T})`);
    after.assert(`usual(${u.C}, ${u.E}, ${u.W}, ${u.P}, ${useSpec}, ${start}, ${start + dur}).`);
    after.evaluate();
  } else if (at('--week-of') >= 0) {
    const w = rest[at('--week-of') + 1];
    what = `неделя ${w}`;
    after = world(weekFile, { weekOf: w, extra: DEEP });
  } else {
    return USAGE;
  }
  const b = perturb(r, after, removed, added);
  const out: string[] = [`  ${what}\n`];
  if (b.newHoles.length === 0 && b.goneHoles.length === 0 && b.lostRuns.length === 0) {
    out.push('  Ни одной новой дыры и ни одной закрытой.');
  }
  if (b.newHoles.length > 0) {
    out.push(`  НОВЫЕ ДЫРЫ (${b.newHoles.length}):`);
    for (const h of b.newHoles) {
      out.push(`    ${ru(h.day)} ${hhmm(h.from)}–${hhmm(h.to)}  ${ru(h.child)}`);
    }
  }
  if (b.goneHoles.length > 0) {
    out.push(`  ЗАКРЫЛОСЬ (${b.goneHoles.length}):`);
    for (const h of b.goneHoles) {
      out.push(`    ${ru(h.day)} ${hhmm(h.from)}–${hhmm(h.to)}  ${ru(h.child)}`);
    }
  }
  if (b.lostRuns.length > 0) {
    out.push(`  ПОЕЗДКИ БЕЗ ИСПОЛНИТЕЛЯ (${b.lostRuns.length}):`);
    for (const l of b.lostRuns) out.push(`    ${l.id}  было: ${l.was.map(sayWay).join(', ')}`);
  }
  out.push('');
  out.push(`  один с детьми:  ${mins(b.soleBefore)} → ${mins(b.soleAfter)}`
    + (b.soleAfter > b.soleBefore ? `   (+${mins(b.soleAfter - b.soleBefore)})` : ''));
  out.push(`  цепочек без запаса: ${b.tightBefore} → ${b.tightAfter}`);
  out.push(`  сходится:       ${b.brokeBefore.join(',') || 'да'} → ${b.brokeAfter.join(',') || 'да'}`);
  if (removed > 0) out.push(`\n  (excise: ${removed} фактов ушло, ${added} появилось)`);
  return out.join('\n');
}

const PLACE_WHY: Record<string, string> = {
  owner_busy: 'в это время он(а) уже чем-то занят(а)',
  sole_cover: 'в это время он(а) единственный, кто может прикрыть ребёнка',
  owner_away: 'в этот день его(её) нет',
  asleep: 'это вне часов бодрствования',
};

const USAGE = [
  '  spat                                    неделя, красные блоки, что без замены',
  '  spat check                              сходится ли',
  '  spat free    <кто>                      свободное время, выведенное',
  '  spat place   <что> <минут> [кто] [где] [--on <день> <время>]',
  '  spat hours   [кто]                      номинальные и эффективные часы',
  '  spat backup                             у кого есть замена, у кого нет',
  '  spat why     <блок>                     почему он тут',
  '  spat whynot  <ребёнок> <день> <время>   почему никто не покрывает',
  '  spat relax   <ребёнок> <день> <время>   что придётся уступить',
  '  spat whatif  --without <кто|id>         | --add \'<факт>.\'',
  '               --move <блок> <дни> <время> | --week-of <неделя>',
  '  spat fragile                            цепочки без запаса, поездки без замены',
  '  spat html    [файл.html]                  сетка недели: экран и печать (A4 landscape)',
  '',
  '  --week <file>      другой файл недели      --week-of <w>   другая неделя',
].join('\n');

const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1]
  && real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
