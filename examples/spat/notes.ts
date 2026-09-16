// notes.ts — THE SECRETARY'S LINES: `avail`, `carry`, `note` — dated exceptions
// of one week, written like `sick`/`car out` (access.rofl §5a), and what the
// renderers print for them. «Няня сегодня с 17:30» is not a rule of the family
// and not the world: it is a correction of the week, and it is APPLIED — what
// it breaks is printed after «применено», never a lock (S3c, 2026-09-16).

import type { Rofl } from '../../src/api.ts';
import { hhmm, ru, table } from './spat.ts';
import type { Edit } from './edits.ts';
import { words } from './places.ts';

export const GRAMMAR = [
  '  avail  <кто> <день> <от>-<до>               доступен    (доступна няня ср 17:30-21:00 · няня ср 17:30-21:00)',
  '  carry  <ребёнок> <день> <время> <кто>        везёт       (везёт robin kit ср 14:00 · kit забираю я ср 14:00)',
  '  note   "<текст>" <день> [<кто>]              заметка     (заметка "торт для гостя" пт · note "ноутбук" чт alex)',
].join('\n');
/** The verbs, and for `carry` the order of the fields the word implies: en `carry <child> … <who>`,
 *  ru third person `везёт <who> <child> …`, ru first person `забираю [я] <child> …` — «я» is the author. */
export const VERBS: Record<string, string> = {
  avail: 'avail', available: 'avail', 'доступен': 'avail', 'доступна': 'avail', 'доступны': 'avail',
  carry: 'carry', 'везёт': 'carry3', 'везет': 'carry3', 'забирает': 'carry3', 'отвозит': 'carry3',
  'везу': 'carry1', 'забираю': 'carry1', 'заберу': 'carry1', 'отвезу': 'carry1', 'отвожу': 'carry1',
  note: 'note', 'заметка': 'note',
};
export const ME = /^(я|me|i)$/i;
const MAX_NOTE = 200;

/** What parseEdit lends: its resolvers over the world, and `done`, which refuses a token past the last field. */
export interface Ctx { N: Map<string, string>; me?: string; day: (t?: string) => string; time: (t?: string) => number; range: (t?: string) => [number, number]; done: (used: number, out: Edit) => Edit; bad: (what: string) => never; }

/** A name as the person wrote it: the world's atom or reading, or an accusative of one («Кита», «Машу») — the
 *  nominative is tried, then the word without its last letter, then that with -а/-я; a helper is never guessed
 *  from a longer stem, since a letter dropped is the whole difference between two children's names. */
export const loose = (N: Map<string, string>, t: string): string | undefined => {
  const w = t.toLowerCase(); const stem = w.slice(0, -1);
  return N.get(w) ?? (w.length > 2 ? N.get(stem) ?? N.get(`${stem}а`) ?? N.get(`${stem}я`) : undefined);
};

/** TEXT → FACTS for the three verbs. `w` is the line's words with the verb first (a verbless
 *  «няня ср 17:30-21:00» arrives with `avail` put in front); `raw` is the line for the quoted text of a note. */
export function parseSecretary(r: Rofl, verb: string, w: string[], raw: string, c: Ctx): Edit {
  const kinds = new Map(table(r, 'person', 'P, K').map((x) => [x.P, x.K]));
  const person = (t: string | undefined, what: string, ok: (k: string) => boolean): string => {
    if (t !== undefined && what === 'кто' && ME.test(t)) return '$ME';
    const a = t === undefined ? undefined : loose(c.N, t);
    if (a === undefined || !kinds.has(a)) c.bad(`${what}: '${t ?? ''}' — мир такого не знает`);
    return ok(kinds.get(a!)!) ? a! : c.bad(`${what}: ${ru(a!)} — ${what === 'ребёнок' ? 'не ребёнок' : 'не взрослый и не помощник'}`);
  };
  if (verb === 'avail') {
    const who = person(w[1], 'кто', () => true);
    if (!table(r, 'present_window', 'C, P, Sp, F, T').some((x) => x.P === who)) c.bad(`${ru(who)}: окна присутствия в мире нет — ${kinds.get(who) === 'adult' ? 'взрослый дома весь день, если не absent' : 'avail меняет часы того, у кого есть present_window'}`);
    const d = c.day(w[2]); if (d === 'all') c.bad('день: avail — на один день');
    const [f, t] = c.range(w[3]);
    return c.done(4, { kind: 'avail', summary: `${ru(who)} ${ru(d)} ${hhmm(f)}–${hhmm(t)}`, facts: (id) => [`e_avail(${id}, ${who}, ${d}, ${f}, ${t}).`] });
  }
  if (verb.startsWith('carry')) {
    // the fields by the word's person: carry <child> <day> <time> <who> · везёт <who> <child> <day> <time> · забираю [я] <child> <day> <time>
    let i = 1; let who = '$ME';
    if (verb === 'carry3') who = person(w[i++], 'кто', (k) => k === 'adult' || k === 'helper');
    const me = (): void => { if (verb === 'carry1' && w[i] !== undefined && ME.test(w[i])) i++; };
    me(); const ch = person(w[i++], 'ребёнок', (k) => k === 'child'); me();
    const d = c.day(w[i++]); if (d === 'all') c.bad('день: carry — на один день');
    const at = c.time(w[i++]);
    if (verb === 'carry') who = person(w[i++], 'кто', (k) => k === 'adult' || k === 'helper');
    return c.done(i, { kind: 'carry', summary: `${ru(who === '$ME' ? c.me ?? 'я' : who)} везёт ${ru(ch)} ${ru(d)} ${hhmm(at)}`, facts: (id) => [`e_carry(${id}, ${ch}, ${d}, ${at}, ${who}).`] });
  }
  // note "<text>" <day> [<who>]: the text is the one quoted word, at most 200 characters, with no quote or backslash in it
  const q = words(raw)[1];
  if (q === undefined || !q.q) c.bad('заметка: текст — в кавычках: note "торт для гостя" пт');
  const text = q!.t;
  if (text === '' || text.length > MAX_NOTE || /["\\]/.test(text)) c.bad(`заметка: текст не пустой, до ${MAX_NOTE} знаков (сейчас ${text.length}), без кавычек и обратной косой`);
  const d = c.day(w[2]); if (d === 'all') c.bad('день: заметка — на один день');
  const who = w[3] === undefined ? 'all' : person(w[3], 'кто', () => true);
  return c.done(w[3] === undefined ? 3 : 4, { kind: 'note', summary: `заметка ${ru(d)}${who === 'all' ? '' : ` ${ru(who)}`}: «${text}»`, facts: (id) => [`e_note(${id}, ${d}, ${who}, ${JSON.stringify(text)}).`] });
}

// ---------------------------------------------------------------------------
// what the renderers print — the same rows for the terminal and the phone

export interface Carry { id: string; who: string; child: string; day: string; at: number; from: string; to: string; }
/** The legs a book handed to somebody: «robin везёт kit: школа → дом 14:00». */
export function carries(r: Rofl, day?: string): Carry[] {
  const base = table(r, 'base', 'B')[0]?.B ?? 'home';
  const from = new Map(table(r, 'carry_from', 'E, Ch, D, Pl, T').map((x) => [x.E, x.Pl]));
  const to = new Map(table(r, 'carry_to', 'E, Ch, D, Pl, T').map((x) => [x.E, x.Pl]));
  return table(r, 'carry', 'E, Ch, D, At, W').filter((x) => (day === undefined || x.D === day) && (from.has(x.E) || to.has(x.E)))
    .map((x) => ({ id: x.E, who: x.W, child: x.Ch, day: x.D, at: Number(x.At), from: from.get(x.E) ?? base, to: to.get(x.E) ?? base }));
}
/** The «!!» lines of a carry — the carrier in a block of their own, a carry with no leg — for one day or the week;
 *  `spat edit` prints the just-written entry's own lines after «применено». */
export function carryWarns(r: Rofl, day?: string, id?: string): string[] {
  const on = (xs: Record<string, string>[]): Record<string, string>[] => xs.filter((x) => (day === undefined || x.D === day) && (id === undefined || x.E === id));
  return [...on(table(r, 'carry_during', 'E, W, D, At, Ev')).map((x) => `!! ${ru(x.W)} ${hhmm(x.At)} везёт во время ${ru(x.Ev)} (${ru(x.D)})`),
    ...on(table(r, 'carry_idle', 'E, Ch, D, At')).map((x) => `!! у ${ru(x.Ch)} ${ru(x.D)} около ${hhmm(x.At)} перегона нет — правка ${x.E} ничего не меняет`)];
}
/** Who has a note under their name that day — a person with no block still gets their line. */
export const noted = (r: Rofl, day: string): string[] => table(r, 'note_on', 'E, D, W, T').filter((x) => x.D === day && x.W !== 'all').map((x) => x.W);
/** The notes of a day: under the day (`all`) or under one person. */
export const notes = (r: Rofl, day: string, who: string): string[] =>
  table(r, 'note_on', 'E, D, W, T').filter((x) => x.D === day && x.W === who).map((x) => `✎ ${x.T.replace(/^"|"$/g, '')}`).sort();
