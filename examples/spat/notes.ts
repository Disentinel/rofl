// notes.ts — THE SECRETARY'S LINES: `avail`, `carry`, `note` — dated exceptions
// of one week, written like `sick`/`car out` (access.rofl §5a), and what the
// renderers print for them. «Няня сегодня с 17:30» is not a rule of the family
// and not the world: it is a correction of the week, and it is APPLIED — what
// it breaks is printed after «применено», never a lock (S3c, 2026-09-16).

import type { Rofl } from '../../src/api.ts';
import { hhmm, ru, table } from './spat.ts';
import { minuteOf, sayMoment } from './store.ts';
import type { Edit } from './edits.ts';
import { words } from './places.ts';

export const GRAMMAR = [
  '  avail  <кто> <день> <от>-<до>               доступен    (доступна няня ср 17:30-21:00 · няня ср 17:30-21:00)',
  '  carry  <ребёнок> <день> <время> <кто>        везёт       (везёт robin kit ср 14:00 · kit забираю я ср 14:00)',
  '  note   "<текст>" <день> [<кто>]              заметка     (заметка "торт для гостя" пт · note "ноутбук" чт alex)',
  '  done   <условие|"текст"> [<день>]            сделано     (сделано: репточка · забронировал репточку · подтвердил Иван)',
  '  remind <условие|"текст"> <день> <время>      напомни     (напомни репточка чт 16:30 · напомни через полчаса · напомни завтра утром)',
  '  skip   <условие>                             не будем    (не будем репточка · скип торт)',
].join('\n');
/** The verbs, and for `carry` the order of the fields the word implies: en `carry <child> … <who>`,
 *  ru third person `везёт <who> <child> …`, ru first person `забираю [я] <child> …` — «я» is the author. */
export const VERBS: Record<string, string> = {
  avail: 'avail', available: 'avail', 'доступен': 'avail', 'доступна': 'avail', 'доступны': 'avail',
  carry: 'carry', 'везёт': 'carry3', 'везет': 'carry3', 'забирает': 'carry3', 'отвозит': 'carry3',
  'везу': 'carry1', 'забираю': 'carry1', 'заберу': 'carry1', 'отвезу': 'carry1', 'отвожу': 'carry1',
  note: 'note', 'заметка': 'note',
  done: 'done', 'сделано': 'done', 'сделано:': 'done', 'сделал': 'done', 'сделала': 'done', 'готово': 'done', 'готово:': 'done',
  'забронировал': 'done:booked', 'забронировала': 'done:booked', 'booked': 'done:booked',
  'купил': 'done:item', 'купила': 'done:item', 'взял': 'done:item', 'взяла': 'done:item',
  'подтвердил': 'done:confirm', 'подтвердила': 'done:confirm', 'может': 'done:confirm', 'confirmed': 'done:confirm',
  remind: 'remind', 'напомни': 'remind', 'напомнить': 'remind', 'напоминай': 'remind',
};
export const ME = /^(я|me|i)$/i;
const MAX_NOTE = 200;

/** What parseEdit lends: its resolvers over the world, and `done`, which refuses a token past the last field. */
export interface Ctx { N: Map<string, string>; me?: string; day: (t?: string) => string; time: (t?: string) => number; range: (t?: string) => [number, number]; done: (used: number, out: Edit) => Edit; bad: (what: string) => never; week?: string; }

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
  if (verb.startsWith('done') || verb === 'remind' || verb === 'waive') return parseMark(r, verb, w, c);
  const person = (t: string | undefined, what: string, ok: (k: string) => boolean): string => {
    if (t !== undefined && what === 'кто' && ME.test(t)) return '$ME';
    const a = t === undefined ? undefined : loose(c.N, t);
    if (a === undefined || !kinds.has(a)) c.bad(`${what}: '${t ?? ''}' — мир такого не знает`);
    return ok(kinds.get(a!)!) ? a! : c.bad(`${what}: ${ru(a!)} — ${what === 'ребёнок' ? 'не ребёнок' : 'не взрослый и не помощник'}`);
  };
  if (verb === 'avail') {
    const who = person(w[1], 'кто', () => true);
    // a guest of a need (spat.rofl §15 `windowed`) has no line in the world: their hours ARE the window the owner sends
    if (!table(r, 'present_window', 'C, P, Sp, F, T').some((x) => x.P === who) && !r.holds(`windowed(${who})`)) c.bad(`${ru(who)}: окна присутствия в мире нет — ${kinds.get(who) === 'adult' ? 'взрослый дома весь день, если не absent' : 'avail меняет часы того, у кого есть present_window, или участника потребности'}`);
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
// a need's conditions: done · remind · skip (needs.ts, access.rofl §5c)

const NOISE = /^(сделано:?|готово:?|что|the|про|о|об|для|by|for|на|to)$/i;
const stem = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 5);
/** A condition by its id, or by words of its text / its owner's name / its need's name — «репточку» finds «репточка»;
 *  a kind from the verb («забронировал» → booked) narrows it. One match, or code 2 naming them. */
export function reqOf(r: Rofl, N: Map<string, string>, toks: string[], kind: string | undefined, bad: (w: string) => never): string {
  const all = table(r, 'req', 'R, K, T, O').map((q) => ({ R: q.R, K: q.K, T: q.T, O: q.O, n: table(r, 'need_req', 'N, R').find((x) => x.R === q.R)?.N ?? '' }));
  const say = (q: (typeof all)[number]): string => `${q.R} (${ru(q.n)}: ${q.T.replace(/^"|"$/g, '')} — ${ru(q.O)})`;
  if (all.length === 0) bad('условий нет ни у одной потребности (spat need list)');
  const byId = all.find((q) => q.R === toks[0]); if (byId) return byId.R;
  const ws = toks.filter((t) => !NOISE.test(t)).map(stem).filter((t) => t.length > 0);
  const hit = all.filter((q) => (kind === undefined || q.K === kind) && ws.every((s) => [q.T, ru(q.O), ru(q.n), q.n, q.O, q.R].some((f: string) => f.toLowerCase().split(/[^\p{L}\p{N}]+/u).some((x) => x.startsWith(s) || s.startsWith(stem(x)) && stem(x).length >= 4))));
  if (hit.length === 1) return hit[0].R;
  return bad(hit.length === 0 ? `условие '${toks.join(' ')}' не найдено; есть: ${all.map(say).join(' · ')}` : `уточни, какое: ${hit.map(say).join(' · ')}`);
}
/** done <R|"текст"> [<день>] · remind <R|"текст"> <день> <время> | через N минут | завтра утром · waive <R|"текст"> [<день>] */
function parseMark(r: Rofl, verb: string, w: string[], c: Ctx): Edit {
  const kind = verb.split(':')[1];
  const dayAt = (i: number): number => { for (let j = w.length - 1; j >= i; j--) { try { c.day(w[j]); return j; } catch { /* not a day */ } } return w.length; };
  if (verb === 'remind') {
    const now = Number(table(r, 'now_min', 'N')[0]?.N ?? 0);
    const monday = (): string => (table(r, 'week_starts', 'W, M').find((x) => x.W === c.week)?.M ?? c.bad(`неделя ${c.week} без даты`)).replace(/^"|"$/g, '');
    const m = w.findIndex((t, i) => i > 0 && /^(через|in)$/i.test(t));
    let at: number; let end: number; let toks: string[];
    if (m > 0) {   // напомни [что] через полчаса | через 20 минут | через 2 часа
      const n = /^(полчаса|полчасика)$/i.test(w[m + 1] ?? '') ? 30 : /^\d+$/.test(w[m + 1] ?? '') ? Number(w[m + 1]) * (/^(час|часа|часов|h|hour|hours)$/i.test(w[m + 2] ?? '') ? 60 : 1) : c.bad('через <N> минут | <N> часа | полчаса');
      at = now + n; end = /^(полчаса|полчасика)$/i.test(w[m + 1]) ? m + 2 : m + 3; toks = w.slice(1, m);
    } else {
      const d = dayAt(1); if (d === w.length) c.bad('напомни <условие> <день> <время>');
      const dy = c.day(w[d]); const n = Number(table(r, 'day', 'D, N').find((x) => x.D === dy)?.N ?? 1);
      const t = w[d + 1] ?? ''; const min = /^(утром|morning)$/i.test(t) ? 540 : /^(вечером|evening)$/i.test(t) ? 1140 : c.time(t);
      at = minuteOf(monday(), (n - 1) * 1440 + min); end = d + 2; toks = w.slice(1, d);
    }
    const R = toks.length === 0 ? mine(r, c, verb) : reqOf(r, c.N, toks, undefined, c.bad);
    return c.done(end, { kind: 'remind', summary: `напомню ${sayMoment(at)}: ${sayReq(r, R)}`, facts: (id) => [`e_remind(${id}, ${R}, ${at}).`] });
  }
  const d = dayAt(1); const toks = w.slice(1, d);
  const R = toks.length === 0 ? mine(r, c, verb) : reqOf(r, c.N, toks, kind, c.bad);
  const day = d < w.length ? c.day(w[d]) : c.day('сегодня');
  if (verb === 'waive') return c.done(d + 1, { kind: 'waive', summary: `не будем: ${sayReq(r, R)}`, facts: (id) => [`e_waive(${id}, ${R}).`] });
  return c.done(d + 1, { kind: 'done', summary: `сделано ${ru(day)}: ${sayReq(r, R)}`, facts: (id) => [`e_done(${id}, ${R}, ${day}).`] });
}
/** «репточка — репетиция (rehearsal_booked)». */
const sayReq = (r: Rofl, R: string): string => { const q = table(r, 'req', 'R, K, T, O').find((x) => x.R === R)!; const n = table(r, 'need_req', 'N, R').find((x) => x.R === R)?.N ?? '?'; return `${q.K === 'confirm' ? `${ru(q.O)} может` : q.T.replace(/^"|"$/g, '')} — ${ru(n)} (${R})`; };
/** No condition named: the one the author is responsible for, if there is exactly one open; else code 2 naming them. */
const mine = (r: Rofl, c: Ctx, verb: string): string => {
  const open = table(r, 'req_open', 'R').map((x) => x.R).filter((R) => table(r, 'req', 'R, K, T, O').some((q) => q.R === R && q.O === c.me));
  return open.length === 1 ? open[0] : c.bad(open.length === 0 ? `${verb}: открытых условий за ${ru(c.me ?? '?')} нет — назови условие` : `${verb}: какое из — ${open.join(', ')}`);
};

// ---------------------------------------------------------------------------
// what the renderers print — the same rows for the terminal and the phone; the carried run itself is a Trip (spat.ts pickedTrips)

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
/** EACH «!!» ONCE: a unit is the «!!» line and the indented reason lines under it; a unit already printed is dropped —
 *  measured on the stand 2026-09-16: every «!!» of a carry came twice after «применено» (the day's problems, then the entry's own). */
export function onceEach(L: string[]): string[] {
  const seen = new Set<string>(); let keep = true;
  return L.filter((l) => {
    if (/^\s*!!/.test(l)) { keep = !seen.has(l.trim()); seen.add(l.trim()); } else if (!/^\s+\S/.test(l) || /^\s*(ломает|как будет)/.test(l)) keep = true;
    return keep;
  });
}
