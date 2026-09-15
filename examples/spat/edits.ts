// edits.ts — THE VERBS OF THE MULTI-USER CLI: whoami, edit, confirm, retract,
// roll, and the grammar of `spat edit`. A verb parses text into facts, asks
// access.rofl through store.ts, and appends to the caller's own book. The
// exit code is the answer; stdout says why.

import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { parseProgram } from '../../src/parser.ts';
import type { Clause } from '../../src/unify.ts';
import { dayOrder, hhmm, parseTime, ru, sayConstraint, table } from './spat.ts';
import { SpatError, bookClauses, bookOf, dateIn, editId, isoNow, must, myBook, operator, put, trial, type Env, type Store } from './store.ts';
import { addBook, openVolume, write } from './volume.ts';
import { BOOT, bust } from './spat.ts';
import * as fs from 'node:fs';
import { renderDay, renderIcs } from './tomorrow.ts';

const GRAMMAR = [
  '  move   <блок> [<день>] <время>              перенести   (перенести обед вт 14:00)',
  '  skip   <блок> [<день>]                      отменить    (отменить прогулка пн)',
  '  add    <что> <день> <от>-<до> [<кто>] [<где>]  добавить (добавить dentist ср 10:00-11:00 robin clinic)',
  '  sick   <кто> [<день>]                       болеет      (болеет kit пт)',
  '  car out <день> [<от>-<до>]                  машины нет  (машины нет пн 07:00-10:00)',
  '  report <ограничение> <день> <время>         сообщить    (сообщить c_bus пн 14:10)',
  '  день: mon..sun / пн..вс; без дня — все дни, когда блок стоит.',
].join('\n');

const VERB: Record<string, string> = {
  move: 'move', 'перенести': 'move', skip: 'skip', 'отменить': 'skip', add: 'add', 'добавить': 'add',
  sick: 'sick', 'болеет': 'sick', car: 'car', 'машины': 'car', report: 'report', 'сообщить': 'report',
};

/** Every name the world knows, by its atom and by its Russian reading. */
function names(r: Rofl): Map<string, string> {
  const m = new Map<string, string>();
  const put = (a: string): void => { m.set(a, a); m.set(ru(a).toLowerCase(), a); };
  for (const x of table(r, 'person', 'P, K')) put(x.P);
  for (const x of table(r, 'usual', 'C, E, W, P, Sp, F, T')) { put(x.E); put(x.P); }
  for (const x of table(r, 'place', 'P')) put(x.P);
  for (const x of table(r, 'constraint', 'C, O, S')) put(x.C);
  for (const x of table(r, 'day', 'D, N')) put(x.D);
  m.set('all', 'all'); m.set('все', 'all');
  return m;
}
const ATOM = /^[a-z][a-z0-9_]*$/;
const bad = (what: string): never => {
  throw new SpatError(2, `не разобрал: ${what}\n\nДопустимо:\n${GRAMMAR}`);
};

export interface Edit { kind: string; summary: string; facts: (id: string) => string[]; }

/** TEXT -> FACTS. One line of a person's Russian or English into the fact
 *  shapes access.rofl reads. Names resolve through the world, so a block or
 *  a person the world does not know is a code-2 answer and never a fact.
 *  ONE LINE, EVERY TOKEN SPOKEN FOR: a control character anywhere, or a token
 *  after the last field, is code 2 — measured on 33832b7, a second line in
 *  the text became a second fact in the book and bricked it for every adult. */
export function parseEdit(r: Rofl, text: string): Edit {
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(text)) bad('в правке управляющий символ (перевод строки, табуляция, NUL); правка — одна строка');
  const w = text.trim().split(/\s+/).filter((x) => x.length > 0);
  const done = <T,>(used: number, out: T): T => (w.length > used ? bad(`лишнее в конце: '${w.slice(used).join(' ')}'`) : out);
  const N = names(r);
  const days = new Set(table(r, 'day', 'D, N').map((x) => x.D));
  const name = (t: string | undefined, what: string): string => {
    const a = t === undefined ? undefined : N.get(t.toLowerCase());
    return a ?? bad(`${what}: '${t ?? ''}' — мир такого не знает`);
  };
  const day = (t: string | undefined): string => {
    const a = name(t, 'день');
    return a === 'all' || days.has(a) ? a : bad(`день: '${t}'`);
  };
  const time = (t: string | undefined): number => {
    try { return parseTime(t ?? ''); } catch { return bad(`время: '${t ?? ''}' — пиши 13:25`); }
  };
  const range = (t: string | undefined): [number, number] => {
    const p = (t ?? '').split(/[-–]/);
    return p.length === 2 ? [time(p[0]), time(p[1])] : bad(`интервал: '${t ?? ''}' — пиши 13:00-15:00`);
  };
  const isDay = (t: string | undefined): boolean => t !== undefined && (days.has(N.get(t.toLowerCase()) ?? '') || N.get(t.toLowerCase()) === 'all');
  const verb = VERB[(w[0] ?? '').toLowerCase()] ?? bad(`глагол: '${w[0] ?? ''}'`);
  const block = (t: string | undefined): string => {
    const a = name(t, 'блок');
    return table(r, 'usual', 'C, E, W, P, Sp, F, T').some((x) => x.E === a) ? a : bad(`блок: '${t}' — нет в типовой неделе`);
  };
  if (verb === 'move') {
    const ev = block(w[1]);
    const d = isDay(w[2]) ? day(w[2]) : 'all';
    const t = time(w[isDay(w[2]) ? 3 : 2]);
    return done(isDay(w[2]) ? 4 : 3, { kind: 'move', summary: `${ru(ev)} → ${ru(d)} ${hhmm(t)}`, facts: (id) => [`e_move(${id}, ${ev}, ${d}, ${t}).`] });
  }
  if (verb === 'skip') {
    const ev = block(w[1]);
    const d = w[2] === undefined ? 'all' : day(w[2]);
    return done(3, { kind: 'skip', summary: `${ru(ev)} отменён ${ru(d)}`, facts: (id) => [`e_skip(${id}, ${ev}, ${d}).`] });
  }
  if (verb === 'add') {
    const what = w[1] !== undefined && ATOM.test(w[1]) ? w[1] : bad(`что: '${w[1] ?? ''}' — латиницей, как в файле недели`);
    const d = day(w[2]);
    const [f, t] = range(w[3]);
    const who = w[4] === undefined ? undefined : name(w[4], 'кто');
    const where = w[5] === undefined ? table(r, 'base', 'B')[0].B : name(w[5], 'где');
    return done(6, { kind: 'add', summary: `${what} ${ru(d)} ${hhmm(f)}–${hhmm(t)}`,
      facts: (id) => [`e_add(${id}, ${what}, ${d}, ${f}, ${t}, ${who ?? '$ME'}, ${where}).`] });
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

/** A fact of the caller's book, tagged as the book's — parsed once, tried and written as the same clauses. */
const tagged = (book: string, lines: string[]): Clause[] => parseProgram(lines.map((l) => l.replace(/^([a-z_]+)\(/, `$1[${book}](`)).join('\n'));

/** `spat edit '<text>'`: the trial in a world with the candidate, then one
 *  transaction — or none. Codes 0, 2, 3, 4 as the contract lists them. */
export function edit(s: Store, text: string): number {
  const book = myBook(s);
  const e = parseEdit(s.r, text);
  const at = isoNow(s.env);
  const id = editId(s.env.as, at, text.trim());
  const clauses = tagged(book.book, [...e.facts(id).map((l) => l.replace('$ME', s.env.as)),
    `edit_at(${id}, "${at}").`, `edit_via(${id}, ${s.env.via}).`, `for_week(${id}, ${s.week}).`]);
  const v = trial(s, id, clauses);
  if (v.noRight) {
    const o = v.owner!;
    const may = table(s.r, 'may_edit', 'U, X').filter((x) => x.X === o.c).map((x) => ru(x.U)).sort();
    console.log(`отказано: ${o.scope === 'person' ? `${o.c} — это ${ru(o.owner)}, не ты` : sayConstraint(s.r, o.c).trim()}`);
    console.log(`  может: ${may.length > 0 ? may.join(', ') : 'никто; внешнее ограничение только сообщают (report)'}`);
    return 4;
  }
  if (v.breaks.length > 0) {
    put(s, book, [...clauses, ...tagged(book.book, [`proposed(${id}).`])], text);
    const ord = dayOrder(s.r);
    const on = table(s.r, 'breaks_on', 'E, D, R').filter((x) => x.E === id).sort((a, b) => ord.get(a.D)! - ord.get(b.D)!);
    console.log(`ЗАПИСАНО КАК ПРЕДЛОЖЕНИЕ, не действует: ${e.summary}`);
    for (const d of [...new Set(on.map((x) => x.D))]) {
      console.log(`  ломает ${ru(d)}: ${on.filter((x) => x.D === d).map((x) => x.R).join(', ')}`);
      console.log(renderDay(s.r, d, `  как будет ${ru(d)}:`, false));
    }
    console.log(`  подтвердить: spat confirm ${id}`);
    return 3;
  }
  put(s, book, clauses, text);
  console.log(`применено: ${e.summary} (${id}) — неделя ${s.week}${stale(s)}`);
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
  const text = (f: string): string => { if (!fs.existsSync(f)) throw new SpatError(2, `${f}: нет такого файла`); return fs.readFileSync(f, 'utf8'); };
  const users = bookClauses({ book: 'main', user: 'users', where: usersFile }, text(usersFile));
  const e = operator(e0, tenant, users);
  const world = bookClauses({ book: 'main', user: 'world', where: weekFile }, text(weekFile));
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
  const st = (e: string): string => (s.r.holds(`retracted_edit(${e})`) ? 'отозвана' : s.r.holds(`pending(${e})`) ? 'ждёт confirm'
    : s.r.holds(`no_right(${e})`) ? 'без права' : 'действует');
  for (const e of mine) console.log(`  ${e}  ${st(e)}`);
  return 0;
}

/** A DATED DAY IS SHOWN UNDER ITS OWN WEEK. `week_of(today|tomorrow, W)` is
 *  the rules' answer over `week_starts`; when W is not the week in force the
 *  world is re-read under W, so the day carries W's own moved/added and the
 *  edits recorded for W — never the same weekday of another week. A date
 *  with no `week_starts` is refused: the world does not have that week. */
function dated(s: Store, which: 'today' | 'tomorrow'): { day: string; ymd: string; week: string } {
  const { ymd, n, monday } = dateIn(s.env, which === 'today' ? 0 : 1);
  const w = table(s.r, 'week_of', 'Which, W').find((x) => x.Which === which)?.W;
  if (!w) throw new SpatError(2, `неделя с понедельника ${monday} не заведена: в мире нет week_starts(W, "${monday}") — ${ru(which === 'today' ? 'сегодня' : 'завтра')} ${ymd} показать не из чего; нужна строка week/week_starts в world.rofl и roll`);
  if (w !== s.week) { s.r.retract(`current(${s.week})`); s.r.assert(`current(${w}).`); s.r.evaluate(); bust(s.r); }
  return { day: dayAtom(s, n), ymd, week: w };
}
const dayAtom = (s: Store, n: number): string => table(s.r, 'day', 'D, N').find((x) => Number(x.N) === n)?.D ?? bad(`в мире нет дня с номером ${n}: day(D, ${n}) не объявлен`);
/** «неделя в силе не сегодняшняя» — a rule's row, printed wherever a week is named. */
const stale = (s: Store): string => {
  const x = table(s.r, 'stale_week', 'C, W')[0];
  return x ? `\n  !! в силе неделя ${x.C}, а сегодня неделя ${x.W}: правки ложатся в ${x.C}; оператору нужен roll ${x.W}` : '';
};

/** Dispatch for the store verbs; the classic verbs stay in spat.ts. */
export function run(s: Store, cmd: string, rest: string[]): number {
  switch (cmd) {
    case 'whoami': return whoami(s);
    case 'edit': return edit(s, rest.join(' '));
    case 'confirm': return mark(s, 'confirmed', rest[0] ?? bad('confirm <edit-id>'));
    case 'retract': return mark(s, 'retracted', rest[0] ?? bad('retract <edit-id>'));
    case 'roll': return roll(s, rest[0] ?? bad('roll <week>'));
    case 'tomorrow': { const d = dated(s, 'tomorrow'); console.log(renderDay(s.r, d.day, `ЗАВТРА, ${ru(d.day)} ${d.ymd} (неделя ${d.week})`)); return 0; }
    case 'show': {
      if (rest[0] === 'week' || rest[0] === 'неделя') { console.log(renderDay(s.r, undefined, `НЕДЕЛЯ ${s.week}${stale(s)}`)); return 0; }
      if (rest[0] === undefined) { const d = dated(s, 'today'); console.log(renderDay(s.r, d.day, `СЕГОДНЯ, ${ru(d.day)} ${d.ymd} (неделя ${d.week})`)); return 0; }
      const d = names(s.r).get(rest[0].toLowerCase()) ?? bad(`день: '${rest[0]}'`);
      console.log(renderDay(s.r, d, `${ru(d)} (неделя ${s.week})${stale(s)}`)); return 0;
    }
    case 'ics': { process.stdout.write(renderIcs(s, rest.indexOf('--for') >= 0 ? rest[rest.indexOf('--for') + 1] : undefined)); return 0; }
    default: return bad(`глагол '${cmd}'`);
  }
}
