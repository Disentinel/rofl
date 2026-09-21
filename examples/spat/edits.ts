// edits.ts — THE VERBS OF THE MULTI-USER CLI: whoami, edit, confirm, retract,
// roll, and the grammar of `spat edit`. A verb parses text into facts, asks
// access.rofl through store.ts, and appends to the caller's own book. The
// exit code is the answer; stdout says why.

import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { parseProgram } from '../../src/parser.ts';
import type { Clause } from '../../src/unify.ts';
import { dayOrder, hhmm, parseTime, rows, ru, sayConstraint, table } from './spat.ts';
import { SpatError, bookOf, dateIn, editId, isoNow, must, myBook, operator, put, trial, type Env, type Store } from './store.ts';
import { dateToken, dated, dayAtom, under, weekOf, type Dated } from './dates.ts';
import { addBook, fromText, openVolume, write } from './volume.ts';
import { BOOT, bust } from './spat.ts';
import { renderDay, renderIcs } from './tomorrow.ts';
import { problems, tgDay, tgWeek } from './tg.ts';
import { run as maybe } from './maybe.ts';
import { run as rule } from './rules.ts';
import { bookPlaces, line, slug, words } from './places.ts';
import { GRAMMAR as SECRETARY, VERBS as SEC_VERB, carryWarns, onceEach, parseSecretary } from './notes.ts';
import { renderWarnings } from './tomorrow.ts';
import { tgWarnings } from './tg.ts';
import { reminders, retire, run as need } from './needs.ts';

const GRAMMAR = [
  '  move   <блок> [<день>] <время>              перенести   (перенести обед вт 14:00)',
  '  skip   <блок> [<день>]                      отменить    (отменить прогулка пн)',
  '  add    <что> <день> <от>-<до> [<кто[,кто…]>] [<где>]  добавить (добавить dentist ср 10:00-11:00 robin clinic)',
  '  sick   <кто> [<день>]                       болеет      (болеет kit пт)',
  '  car out <день> [<от>-<до>]                  машины нет  (машины нет пн 07:00-10:00)',
  '  report <ограничение> <день> <время>         сообщить    (сообщить c_bus пн 14:10)',
  '  add    <что> every <дни> <от>-<до> [<кто>] [<где>]   каждую неделю (добавить greek каждый вт 16:00-17:00 kit school)',
  '  skip   <блок> every <дни>                   каждую неделю (отменить walk каждый вт)',
  SECRETARY,
  '  день: mon..sun / пн..вс; сегодня/завтра/послезавтра, 15.09, 2026-09-15 — по календарю SPAT_TZ;',
  '  без дня — все дни, когда блок стоит. дни при every: день, weekdays/будни, alldays/ежедневно, группа дней из мира.',
  '  блок — как в расписании: типовая неделя, повторяемые и добавленные правками; skip/move добавленного = отзыв той правки.',
  '  где — atom места или его название в кавычках ("American Academy"); новое место: spat place add … (взрослый).',
].join('\n');

const VERB: Record<string, string> = {
  move: 'move', 'перенести': 'move', skip: 'skip', 'отменить': 'skip', add: 'add', 'добавить': 'add',
  sick: 'sick', 'болеет': 'sick', car: 'car', 'машины': 'car', report: 'report', 'сообщить': 'report',
};

/** Every name the world knows, by its atom and by its Russian reading. */
export function names(r: Rofl): Map<string, string> {
  const m = new Map<string, string>();
  const put = (a: string): void => { m.set(a, a); m.set(ru(a).toLowerCase(), a); };
  for (const x of table(r, 'person', 'P, K')) put(x.P);
  for (const x of table(r, 'usual', 'C, E, W, P, Sp, F, T')) { put(x.E); put(x.P); }
  for (const x of table(r, 'added', 'C, E, W, P, Wk, D, F, T')) put(x.E);
  for (const x of table(r, 'place', 'P')) put(x.P);
  for (const x of table(r, 'constraint', 'C, O, S')) put(x.C);
  for (const x of table(r, 'day', 'D, N')) put(x.D);
  m.set('all', 'all'); m.set('все', 'all');
  return m;
}
const ATOM = /^[a-z][a-z0-9_]*$/;
const bad = (what: string): never => { throw new SpatError(2, `не разобрал: ${what}\n\nДопустимо:\n${GRAMMAR}`); };


/** `entries`: the book entries a skip/move of an ADDED block takes back — the schedule as the human
 *  sees it includes what a book put there, so «убери greek пн» on a block robin added is that entry's
 *  retraction; `facts(id)` then holds `retracts(...)` lines and, for a move, the new add under `id`. */
export interface Edit { kind: string; summary: string; facts: (id: string) => string[]; on?: Dated; every?: boolean; entries?: { id: string; ev: string; day: string }[]; }

/** TEXT -> FACTS. One line of a person's Russian or English into the fact
 *  shapes access.rofl reads. Names resolve through the world, so a block or
 *  a person the world does not know is a code-2 answer and never a fact.
 *  ONE LINE, EVERY TOKEN SPOKEN FOR: a control character anywhere, or a token
 *  after the last field, is code 2 — measured on 33832b7, a second line in
 *  the text became a second fact in the book and bricked it for every adult. */
export function parseEdit(r: Rofl, text: string, e?: Env): Edit {
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(text)) bad('в правке управляющий символ (перевод строки, табуляция, NUL); правка — одна строка');
  // a "quoted phrase" is one word — a place by its name (places.ts)
  const w = words(text).map((x) => x.t);
  const done = (used: number, out: Edit): Edit => (w.length > used ? bad(`лишнее в конце: '${w.slice(used).join(' ')}'`) : { ...out, on });
  const N = names(r);
  const days = new Set(table(r, 'day', 'D, N').map((x) => x.D));
  const groups = new Set(table(r, 'in_group', 'G, D').map((x) => x.G));
  // a name resolves through the world AS IT STANDS — the file's lines and the family's book (bridge.rofl) alike;
  // a quoted place («"American Academy"») by its ru_name, else by its slug (american_academy)
  const name = (t: string | undefined, what: string): string => {
    const a = t === undefined ? undefined : N.get(t.toLowerCase()) ?? N.get(slug(t));
    return a ?? bad(`${what}: '${t ?? ''}' — мир такого не знает`);
  };
  let on: Dated | undefined;
  const dated = (t: string | undefined): Dated | undefined => (t !== undefined && e ? dateToken(e, t) : undefined);
  const day = (t: string | undefined): string => {
    const d = dated(t);
    if (d) { on = d; return dayAtom(r, d.n); }
    const a = name(t, 'день');
    return a === 'all' || days.has(a) ? a : bad(`день: '${t}'`);
  };
  // the days of a recurring line: one day, weekdays, alldays, or a group the world names
  const spec = (t: string | undefined): string => {
    if (t !== undefined && /^(alldays|ежедневно|day|день|все|all)$/i.test(t)) return 'alldays';
    if (t !== undefined && /^(weekdays?|будни|будням)$/i.test(t)) return 'weekdays';
    if (t !== undefined && groups.has(t.toLowerCase())) return t.toLowerCase();
    const a = name(t, 'дни');
    return days.has(a) ? a : bad(`дни: '${t}' — день, weekdays/будни, alldays/ежедневно или группа дней`);
  };
  const EVERY = /^(every|каждый|каждую|каждое|еженедельно)$/i;
  const time = (t: string | undefined): number => {
    let m: number;
    try { m = parseTime(t ?? ''); } catch { return bad(`время: '${t ?? ''}' — пиши 13:25`); }
    return m < 1440 ? m : bad(`время: '${t}' — в сутках 24 часа`);
  };
  const range = (t: string | undefined): [number, number] => {
    const p = (t ?? '').split(/[-–]/);
    return p.length === 2 ? [time(p[0]), time(p[1])] : bad(`интервал: '${t ?? ''}' — пиши 13:00-15:00`);
  };
  const isDay = (t: string | undefined): boolean => t !== undefined && (dated(t) !== undefined || days.has(N.get(t.toLowerCase()) ?? '') || N.get(t.toLowerCase()) === 'all');
  // THE SECRETARY'S VERBS (notes.ts): avail/carry/note by their word, or «няня ср 17:30-21:00» — a person, a day and
  // an interval with no verb at all, which is `avail`; «kit забираю я ср 14:00» — the child first, the verb second
  const w0 = (w[0] ?? '').toLowerCase();
  // «не будем <условие>» / «скип …» / `skip <условие>` — a need's condition skipped (needs.ts, access.rofl §5c)
  const reqs = new Set(table(r, 'req', 'R, K, T, O').map((x) => x.R));
  const waive = (w0 === 'не' && /^будем$/i.test(w[1] ?? '')) ? 2 : /^(скип|waive)$/i.test(w0) || (VERB[w0] === 'skip' && reqs.has(w[1] ?? '')) ? 1 : 0;
  const sec = waive > 0 ? 'waive' : SEC_VERB[w0] ?? (N.has(w0) && isDay(w[1]) && /[-–]/.test(w[2] ?? '') ? 'avail' : SEC_VERB[(w[1] ?? '').toLowerCase()]?.startsWith('carry1') ? 'carry1' : undefined);
  if (sec !== undefined) {
    const ws = waive > 0 ? ['waive', ...w.slice(waive)] : SEC_VERB[w0] ? w : sec === 'avail' ? ['avail', ...w] : [w[1], w[0], ...w.slice(2)];
    return parseSecretary(r, sec, ws, text, { N, me: e?.as, day, time, range, done, bad, week: e ? weekIn(r) : undefined });
  }
  const verb = VERB[w0] ?? bad(`глагол: '${w[0] ?? ''}'`);
  // THE BLOCKS AS THE HUMAN SEES THEM: the typical week (a recurring line included), and what a
  // book added this week. An added block named with its day is taken back by its entry.
  const adds = table(r, 'added', 'C, E, W, P, Wk, D, F, T');
  const usuals = table(r, 'usual', 'C, E, W, P, Sp, F, T');
  const edits = new Set(table(r, 'edit_by', 'E, U').map((x) => x.E));
  const block = (t: string | undefined, d?: string): string => {
    const a = t === undefined ? undefined : N.get(t.toLowerCase());
    if (a !== undefined && (usuals.some((x) => x.E === a) || adds.some((x) => x.E === a))) return a;
    // THE BLOCKS OF THAT DAY, so the model has nothing to ask the person: the world's and a book's, marked
    const seen = new Map<string, string>();
    for (const x of table(r, 'span', 'C, E, W, P, D, F, T').filter((x) => d === undefined || d === 'all' || x.D === d)) seen.set(x.E, edits.has(x.C) ? ` [правка ${x.C}]` : '');
    throw new SpatError(2, `блок: '${t ?? ''}' — ${d && d !== 'all' ? `${ru(d)}: стоят` : 'в расписании стоят'} ${[...seen].sort().map(([e, m]) => ru(e) + m).join(', ')}`);
  };
  // a recurring line named with no day: the recurrence itself, taken back
  const recurringOf = (ev: string): { id: string; ev: string; day: string }[] =>
    usuals.filter((x) => x.E === ev && edits.has(x.C)).map((x) => ({ id: x.C, ev, day: x.Sp }));
  const addedOn = (ev: string, d: string): { id: string; ev: string; day: string; row: (typeof adds)[number] }[] | undefined => {
    if (!adds.some((x) => x.E === ev)) return undefined;
    const rows = adds.filter((x) => x.E === ev && (d === 'all' || x.D === d));
    if (rows.length === 0 && !usuals.some((x) => x.E === ev)) throw new SpatError(2, `${ev} стоит ${adds.filter((x) => x.E === ev).map((x) => ru(x.D)).join(', ')}, не ${ru(d)}`);
    return rows.length === 0 ? undefined : rows.map((x) => ({ id: x.C, ev, day: x.D, row: x }));
  };
  const backs = (xs: { id: string }[]): string[] => xs.map((x) => `retracts(${x.id}, "$AT", $VIA).`);
  if (verb === 'move') {
    const d = isDay(w[2]) ? day(w[2]) : 'all';
    const ev = block(w[1], d);
    const t = time(w[isDay(w[2]) ? 3 : 2]);
    const taken = addedOn(ev, d);
    if (taken) {
      // an added block moved: its entry taken back, the same block written again at the new time
      return done(isDay(w[2]) ? 4 : 3, { kind: 'move', summary: `${ru(ev)} → ${ru(d)} ${hhmm(t)}`, entries: taken,
        facts: (id) => [...backs(taken), ...taken.map((x) => `e_add(${id}, ${ev}, ${x.day}, ${t}, ${t + Number(x.row.T) - Number(x.row.F)}, ${x.row.W}, ${x.row.P}).`)] });
    }
    return done(isDay(w[2]) ? 4 : 3, { kind: 'move', summary: `${ru(ev)} → ${ru(d)} ${hhmm(t)}`, facts: (id) => [`e_move(${id}, ${ev}, ${d}, ${t}).`] });
  }
  if (verb === 'skip') {
    if (w[2] !== undefined && EVERY.test(w[2])) {
      const ev = block(w[1]); const sp = spec(w[3]);
      // a block a book added THIS WEEK is not on any other week: «every» has nothing to take off — measured on 1a78e14,
      // `skip <added> every <day>` was code 0 «отменён каждую неделю» and the block stood. The take-back is `skip <name> <day>`
      if (!usuals.some((x) => x.E === ev)) throw new SpatError(2, `${ru(ev)} — разовая правка этой недели (${adds.filter((x) => x.E === ev).map((x) => `${ru(x.D)} [правка ${x.C}]`).join(', ')}), не повторяемый блок; отзыв: skip ${ev} <день>`);
      return done(4, { kind: 'skip', every: true, summary: `${ru(ev)} отменён каждую неделю: ${ru(sp)}`, facts: (id) => [`e_unusual(${id}, ${ev}, ${sp}).`] });
    }
    const d = w[2] === undefined ? 'all' : day(w[2]);
    const ev = block(w[1], d);
    const taken = addedOn(ev, d) ?? (d === 'all' && recurringOf(ev).length > 0 ? recurringOf(ev) : undefined);
    if (taken) return done(3, { kind: 'skip', summary: `${ru(ev)} отменён ${ru(d)}`, entries: taken, facts: () => backs(taken) });
    return done(3, { kind: 'skip', summary: `${ru(ev)} отменён ${ru(d)}`, facts: (id) => [`e_skip(${id}, ${ev}, ${d}).`] });
  }
  if (verb === 'add') {
    const what = w[1] !== undefined && ATOM.test(w[1]) ? w[1] : bad(`что: '${w[1] ?? ''}' — латиницей, как в файле недели`);
    // RECURRING: one line of the typical week, `usual/7` in shape, owned by its author
    const every = w[2] !== undefined && EVERY.test(w[2]);
    const d = every ? spec(w[3]) : day(w[2]);
    const at = every ? 4 : 3;
    const [f, t] = range(w[at]);
    // «vadim,ivan» — every participant of a need's block is one e_add row of the same entry (spat.rofl §15)
    const who = w[at + 1] === undefined ? ['$ME'] : w[at + 1].split(',').map((x) => name(x.trim(), 'кто'));
    const where = w[at + 2] === undefined ? table(r, 'base', 'B')[0].B : name(w[at + 2], 'где');
    return done(at + 3, { kind: 'add', every, summary: `${what} ${every ? 'каждую неделю: ' : ''}${ru(d)} ${hhmm(f)}–${hhmm(t)}${who.length > 1 ? ` (${who.map(ru).join(', ')})` : ''}`,
      facts: (id) => who.map((p) => (every ? `e_usual(${id}, ${what}, ${d}, ${f}, ${t}, ${p}, ${where}).` : `e_add(${id}, ${what}, ${d}, ${f}, ${t}, ${p}, ${where}).`)) });
  }
  if (verb === 'sick') {
    const p = name(w[1], 'кто');
    const d = w[2] === undefined ? 'all' : day(w[2]);
    return done(3, { kind: 'sick', summary: `${ru(p)} болеет ${ru(d)}`, facts: (id) => [`e_sick(${id}, ${p}, ${d}).`] });
  }
  if (verb === 'car') {
    if (!/^(out|нет)$/i.test(w[1] ?? '')) bad(`'${w.slice(0, 2).join(' ')}' — пиши car out / машины нет`);
    const d = day(w[2]);
    const wake = table(r, 'day_wake', 'F, T')[0];
    const [f, t] = w[3] === undefined ? [Number(wake?.F ?? 0), Number(wake?.T ?? 1440)] : range(w[3]);
    return done(4, { kind: 'car', summary: `машины нет ${ru(d)} ${hhmm(f)}–${hhmm(t)}`, facts: (id) => [`e_car_out(${id}, ${d}, ${f}, ${t}).`] });
  }
  const c = name(w[1], 'ограничение');
  const d = day(w[2]); const t = time(w[3]);
  return done(4, { kind: 'report', summary: `${c}: ${ru(d)} ${hhmm(t)}`, facts: (id) => [`e_report(${id}, ${c}, ${d}, ${t}).`] });
}

/** The week in force as the world holds it — for a moment («напомни чт 16:30») named by a day of the week. */
const weekIn = (r: Rofl): string => table(r, 'current', 'W')[0]?.W ?? '?';
/** A fact of the caller's book, tagged as the book's — parsed once, tried and written as the same clauses. */
export const tagged = (book: string, lines: string[]): Clause[] => parseProgram(lines.map((l) => l.replace(/^([a-z_]+)\(/, `$1[${book}](`)).join('\n'));
/** One entry's facts: the operation, its moment, its channel, its week — tagged as the book's. */
export const entryClauses = (book: string, e: Edit, id: string, as: string, at: string, via: string, week: string): Clause[] =>
  tagged(book, [...e.facts(id).map((l) => l.replace('$ME', as).replace('$AT', at).replace('$VIA', via)), `edit_at(${id}, "${at}").`, `edit_via(${id}, ${via}).`, `for_week(${id}, ${week}).`]);

/** `spat edit '<text>'`: the trial in a world with the candidate, then one
 *  transaction — or none. Codes 0, 2, 3, 4 as the contract lists them. */
export function edit(s: Store, text: string): number {
  const e = parseEdit(s.r, text, s.env);
  const at = isoNow(s.env);
  // A DATED EDIT LANDS IN THE DATE'S OWN WEEK and is tried under it; a day
  // named by name lands in the week in force, as before.
  const week = e.on ? weekOf(s, e.on).week : s.week;
  const id = editId(s.env.as, at, text.trim());
  if (e.entries) return takeBack(s, e, id, at, week, text);
  return commit(s, id, entryClauses(myBook(s).book, e, id, s.env.as, at, s.env.via, week), week, e, text);
}
/** AN ADDED BLOCK TAKEN BACK. The author retracts their own entry (`retracted`, as `retract <id>`
 *  does); another member writes `retracts(E, …)` into THEIR book and access.rofl honours it by the
 *  right that lets them edit the entry (`may_edit`) — the entry's book is not theirs to write. A
 *  move is the same, then the block written again under a new id through the ordinary trial. */
function takeBack(s: Store, e: Edit, id: string, at: string, week: string, text: string): number {
  const book = myBook(s);
  const by = new Map(table(s.r, 'edit_by', 'E, U').map((x) => [x.E, x.U]));
  for (const x of e.entries!) {
    if (by.get(x.id) !== s.env.as && !s.r.holds(`may_edit(${s.env.as}, ${x.id})`)) {
      const may = table(s.r, 'may_edit', 'U, X').filter((y) => y.X === x.id).map((y) => ru(y.U)).sort();
      console.log(`отказано: ${ru(x.ev)} ${ru(x.day)} — правка ${ru(by.get(x.id) ?? '?')} (${x.id}), не твоя
  может: ${may.join(', ') || 'только автор'}`);
      return 4;
    }
  }
  for (const x of e.entries!) {
    const mine = by.get(x.id) === s.env.as;
    const cs = tagged(book.book, [`${mine ? 'retracted' : 'retracts'}(${x.id}, "${at}", ${s.env.via}).`]);
    must(s.r.assertClauses(cs, { who: s.env.as }), 'retract'); put(s, book, cs, text);
    console.log(`отозвана${mine ? '' : ' по праву семьи'} ${x.id} (${ru(x.ev)} ${ru(x.day)}${mine ? '' : `, правка ${ru(by.get(x.id) ?? '?')}`})`);
  }
  const adds = e.facts(id).filter((l) => l.startsWith('e_add('));
  if (adds.length === 0) { bust(s.r); s.r.evaluate(); return 0; }
  return Math.max(...adds.map((l, i) => {
    const nid = editId(s.env.as, at, `${text.trim()} #${i}`);
    return commit(s, nid, entryClauses(book.book, { ...e, entries: undefined, facts: () => [l.replace(`(${id},`, `(${nid},`)] }, nid, s.env.as, at, s.env.via, week), week, e, text);
  }));
}
/** THE CANDIDATE TRIED AND WRITTEN, or refused — `edit` and `maybe apply` end here. */
export function commit(s: Store, id: string, clauses: Clause[], week: string, e: { summary: string; on?: Dated; every?: boolean }, text: string): number {
  const book = myBook(s);
  const warn = stale(s);
  under(s, week);
  const v = trial(s, id, clauses);
  if (v.noRight) {
    const o = v.owner!;
    const may = table(s.r, 'may_edit', 'U, X').filter((x) => x.X === o.c).map((x) => ru(x.U)).sort();
    console.log(`отказано: ${o.scope === 'person' ? `${o.c} — это ${ru(o.owner)}, не ты` : sayConstraint(s.r, o.c).trim()}`);
    console.log(`  может: ${may.length > 0 ? may.join(', ') : 'никто; внешнее ограничение только сообщают (report)'}`);
    return 4;
  }
  // A PERSON'S FACT IS APPLIED (owner's decision 16.09): what it breaks is printed AFTER «применено», in the
  // words the day's problems use, never as a lock. `--propose` keeps the old door — written as proposed until
  // `confirm` — for what the model chose by itself (a place, a time), not for what a person said.
  const ord = dayOrder(s.r);
  const on = table(s.r, 'breaks_on', 'E, D, R').filter((x) => x.E === id).sort((a, b) => ord.get(a.D)! - ord.get(b.D)!);
  // one source, each «!!» once (notes.ts onceEach): the day's problems already carry this entry's own carry lines
  const broken = (): void => {
    const L: string[] = [];
    for (const d of [...new Set(on.map((x) => x.D))]) {
      L.push(`  ломает ${ru(d)}: ${on.filter((x) => x.D === d).map((x) => x.R).join(', ')}`);
      L.push(...(s.fmt === 'tg' ? problems(s.r, d) : [renderDay(s.r, d, `  как будет ${ru(d)}:`, false)]).join('\n').split('\n'));
    }
    L.push(...carryWarns(s.r, undefined, id).map((l) => (s.fmt === 'tg' ? l : `  ${l}`)));
    for (const l of onceEach(L)) console.log(l);
  };
  if (v.breaks.length > 0 && s.propose) {
    put(s, book, [...clauses, ...tagged(book.book, [`proposed(${id}).`])], text);
    console.log(`ЗАПИСАНО КАК ПРЕДЛОЖЕНИЕ, не действует: ${e.summary}`);
    broken();
    console.log(`  подтвердить: spat confirm ${id}`);
    return 3;
  }
  put(s, book, clauses, text);
  console.log(`применено: ${e.summary}${e.on ? ` (${e.on.ymd})` : ''} (${id}) — ${e.every ? 'каждую неделю' : `неделя ${week}`}${warn}`);
  broken();
  return 0;
}

/** confirm / retract: your own edit, one more fact, never a deletion. */
export function mark(s: Store, what: 'confirmed' | 'retracted', id: string): number {
  const book = myBook(s);
  const by = table(s.r, 'edit_by', 'E, U').find((x) => x.E === id);
  if (!by) throw new SpatError(2, `нет такой правки: ${id}`);
  if (by.U !== s.env.as) {
    console.log(`отказано: ${id} — правка ${ru(by.U)}; ${what === 'confirmed' ? 'подтвердить' : 'отозвать'} может только ${ru(by.U)}`);
    return 4;
  }
  if (s.r.holds(`retracted_edit(${id})`)) {
    if (what === 'confirmed') throw new SpatError(2, `${id}: отозвана, подтверждать нечего`);
    console.log(`${id}: уже отозвана, ничего не записано`); return 0;
  }
  const already = what === 'confirmed' && !s.r.holds(`pending(${id})`);
  if (already) { console.log(`${id}: уже действует, ничего не записано`); return 0; }
  put(s, book, tagged(book.book, [`${what}(${id}, "${isoNow(s.env)}", ${s.env.via}).`]), `${what} ${id}`);
  console.log(`${id}: ${what === 'confirmed' ? 'подтверждена, действует' : 'отозвана'}`);
  return 0;
}

export function roll(s: Store, week: string): number {
  if (!s.r.holds(`role(${s.env.as}, operator)`)) { console.log(`отказано: roll — только оператор, ${s.env.as} им не является`); return 4; }
  if (!table(s.r, 'week', 'W').some((x) => x.W === week)) throw new SpatError(2, `нет такой недели в мире: ${week}; есть ${table(s.r, 'week', 'W').map((x) => x.W).join(', ')}`);
  const me = s.books.find((b) => b.user === 'me');
  if (!me) throw new SpatError(6, `${s.vol.file}: книги p_me нет`);
  put(s, me, tagged('p_me', [`rolled(${week}, "${isoNow(s.env)}").`]), `roll ${week}`, week);
  console.log(`неделя теперь ${week} (была ${s.week})`);
  return 0;
}

/** `spat init <tenant> --world <file> --users <file>`: the volume, the world
 *  and the users as its first two books, an empty book per adult and helper,
 *  an empty one for the tool. Operator only — and the operator has already
 *  admitted themself for this tenant in the users file they hand in: that
 *  line IS the admission, and it is checked before the volume exists. */
export function init(e0: Env, tenant: string, weekFile: string, usersFile?: string): string[] {
  if (!usersFile) throw new SpatError(2, 'init <семья> --world <файл> --users <файл>: без книги users некому быть оператором');
  const users = fromText(usersFile, 'users');
  const e = operator(e0, tenant, users);
  const world = fromText(weekFile, 'world');
  const w = new Rofl();
  must(w.load(BOOT), 'boot.rofl'); must(w.assertClauses(world), weekFile);
  const v = openVolume(e.root, tenant, true);
  const trail = { at: isoNow(e), via: e.via, edit: `init ${path.basename(usersFile)} ${path.basename(weekFile)}` };
  write(v, 'users', users, trail); write(v, 'world', world, trail);
  const made = ['users', 'world'];
  for (const p of table(w, 'person', 'P, K').filter((x) => x.K === 'adult' || x.K === 'helper')) { addBook(v, bookOf(p.P), p.P); made.push(bookOf(p.P)); }
  addBook(v, 'p_me', 'me'); made.push('p_me');
  v.db.close();
  return made;
}

export function whoami(s: Store): number {
  const roles = table(s.r, 'role', 'U, R').filter((x) => x.U === s.env.as).map((x) => ru(x.R));
  console.log(`я: ${ru(s.env.as)}${s.env.fromId === undefined ? '' : ` (from_id ${s.env.fromId})`} (${roles.join(', ')}) · семья ${s.env.tenant} · неделя ${s.week} · сегодня ${dateIn(s.env).ymd}`);
  console.log(`  книги мне открыты: ${s.open.map((b) => b.book).join(' ') || 'ни одной'}`);
  console.log(`  пишу только в: ${s.books.find((b) => b.user === s.env.as)?.where ?? 'никуда'}${stale(s)}`);
  const mine = table(s.r, 'edit_by', 'E, U').filter((x) => x.U === s.env.as).map((x) => x.E);
  const every = new Set([...rows(s.r, 'e_usual[L](E, W, S, F, T, P, Pl)'), ...rows(s.r, 'e_unusual[L](E, Ev, S)')].map((x) => x.E));
  const st = (e: string): string => (s.r.holds(`retracted_edit(${e})`) ? 'отозвана' : s.r.holds(`pending(${e})`) ? 'ждёт confirm'
    : s.r.holds(`no_right(${e})`) ? 'без права' : 'действует');
  for (const e of mine.filter((x) => !every.has(x))) console.log(`  ${e}  ${st(e)}`);
  if (mine.some((x) => every.has(x))) console.log('  повторяемые (каждую неделю):');
  for (const e of mine.filter((x) => every.has(x))) console.log(`  ${e}  ${st(e)}`);
  // the places my rules put into the world (places.ts, spat.rofl §14) — in force, since only an active rule is loaded
  const places = bookPlaces(s).filter((p) => p.by === s.env.as);
  if (places.length > 0) console.log('  места (правила семьи):');
  for (const p of places) console.log(`  ${p.id}  действует  ${p.atom} «${p.name}»${p.min === undefined ? ', дорога от дома не задана' : `, ${p.min} мин от дома`}`);
  return 0;
}

/** «неделя в силе не сегодняшняя» — a rule's row, printed wherever a week is named. */
const stale = (s: Store): string => {
  const x = table(s.r, 'stale_week', 'C, W')[0];
  return x ? `\n  !! в силе неделя ${x.C}, а сегодня неделя ${x.W}: правки ложатся в ${x.C}; оператору нужен roll ${x.W}` : '';
};

/** Dispatch for the store verbs; the classic verbs stay in spat.ts. */
export function run(s: Store, cmd: string, rest: string[]): number {
  const tg = s.fmt === 'tg';
  switch (cmd) {
    case 'whoami': return whoami(s);
    case 'edit': return edit(s, rest.join(' '));
    case 'need': return need(s, rest);
    case 'retire': return retire(s, rest.join(' '));
    case 'reminders': return reminders(s, rest);
    case 'avail': case 'carry': case 'note': case 'done': case 'remind': {   // the phrase may arrive whole in one argument, or already start with its verb
      const text = rest.length === 1 && /\s/.test(rest[0]) ? rest[0] : line(rest);
      return edit(s, SEC_VERB[(text.split(/\s+/)[0] ?? '').toLowerCase()] ? text : `${cmd} ${text}`);
    }
    case 'warnings': {
      // every «!!» line of the week — or of one day — as one list, for the review step of the bot
      const d = rest[0] === undefined ? undefined : dateToken(s.env, rest[0]) ? dated(s, rest[0]) : { day: names(s.r).get(rest[0].toLowerCase()) ?? bad(`день: '${rest[0]}'`), week: s.week };
      console.log(tg ? tgWarnings(s.r, d?.week ?? s.week, d?.day) : renderWarnings(s.r, d?.week ?? s.week, d?.day)); return 0;
    }
    case 'confirm': return mark(s, 'confirmed', rest[0] ?? bad('confirm <edit-id>'));
    case 'retract': return mark(s, 'retracted', rest[0] ?? bad('retract <edit-id>'));
    case 'roll': return roll(s, rest[0] ?? bad('roll <week>'));
    case 'tomorrow': { const d = dated(s, 'tomorrow'); console.log(tg ? tgDay(s.r, d.day, d.week) : renderDay(s.r, d.day, `ЗАВТРА, ${ru(d.day)} ${d.ymd} (неделя ${d.week})`)); return 0; }
    case 'show': {
      if (rest[0] === 'week' || rest[0] === 'неделя') { console.log(tg ? tgWeek(s.r, s.week) : renderDay(s.r, undefined, `НЕДЕЛЯ ${s.week}${stale(s)}`)); return 0; }
      if (rest[0] === undefined || dateToken(s.env, rest[0])) {
        const d = dated(s, rest[0] ?? 'today');
        console.log(tg ? tgDay(s.r, d.day, d.week) : renderDay(s.r, d.day, `${rest[0] === undefined ? 'СЕГОДНЯ, ' : ''}${ru(d.day)} ${d.ymd} (неделя ${d.week})`)); return 0;
      }
      const d = names(s.r).get(rest[0].toLowerCase()) ?? bad(`день: '${rest[0]}'`);
      console.log(tg ? tgDay(s.r, d, s.week) : renderDay(s.r, d, `${ru(d)} (неделя ${s.week})${stale(s)}`)); return 0;
    }
    case 'ics': { process.stdout.write(renderIcs(s, rest.indexOf('--for') >= 0 ? rest[rest.indexOf('--for') + 1] : undefined)); return 0; }
    case 'maybe': return maybe(s, rest);
    case 'rule': return rule(s, rest);
    default: return bad(`глагол '${cmd}'`);
  }
}
