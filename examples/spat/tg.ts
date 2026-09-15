// tg.ts — THE DAY AND THE WEEK FOR A PHONE. The terminal grid (tomorrow.ts)
// is columns padded with spaces, 87 lines for a week, unreadable in a chat
// bubble. This is the same relations rendered for a proportional font: short
// lines, no padding, no table; the only markup is `*…*` on the day's name and
// on each person's name. Escaping for MarkdownV2 is the sender's (the shim's
// egress escapes everything it is handed, `*` included); this returns text.
// A week is a summary — one line per day — and a full day is `show <day>`.

import type { Rofl } from '../../src/api.ts';
import { blocks, chains, dayOrder, hhmm, holes, index, ownerOf, pickedTrips, ru, table, whoWasBusy } from './spat.ts';
import { hhLines } from './rules.ts';

const DAY: Record<string, string> = { mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Вс' };
/** «16.09» for a day of the week that starts on `start` (YYYY-MM-DD); '' without a start. */
const dm = (start: string | undefined, n: number): string => {
  if (!start) return '';
  const d = new Date(Date.parse(`${start}T00:00:00Z`) + (n - 1) * 86_400_000);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const startOf = (r: Rofl, week: string): string | undefined => table(r, 'week_starts', 'W, D').find((x) => x.W === week)?.D.replace(/^"|"$/g, '');

/** THE PROBLEMS OF A DAY, one short line each, the same relations tomorrow.ts prints. */
export function problems(r: Rofl, day: string): string[] {
  const out: string[] = [];
  for (const h of holes(r).filter((x) => x.day === day)) {
    const who = whoWasBusy(r, day, h.from).map(({ person, why }) => `${ru(person)} — ${why.map((c) => (c === 'not_present' ? 'не в эти часы' : `${c} (${ownerOf(r, c).scope === 'external' ? 'внешнее' : 'наше'})`)).join(', ')}`);
    out.push(`!! не покрыт ${ru(h.child)} ${hhmm(h.from)}–${hhmm(h.to)}${who.length > 0 ? `: ${who.join('; ')}` : ''}`);
  }
  for (const c of chains(r).filter((x) => x.day === day && x.m <= 0)) out.push(`!! ${c.m < 0 ? 'не успевает' : 'без запаса'}: ${ru(c.who)} ${ru(c.a)} → ${ru(c.b)}, ${c.m} мин`);
  for (const l of table(r, 'too_late', 'C, Ev, D, F, By').filter((x) => x.D === day)) out.push(`!! опоздание: ${ru(l.Ev)} с ${hhmm(l.F)}, надо не позже ${hhmm(l.By)} (${l.C})`);
  const stuck = new Set(table(r, 'run_stuck', 'T').map((x) => x.T));
  for (const n of table(r, 'run', 'T, Ch, From, To, D, K, At').filter((x) => stuck.has(x.T) && x.D === day)) out.push(`!! некому везти ${ru(n.Ch)} ${hhmm(n.At)}: ${ru(n.From)} → ${ru(n.To)}`);
  const hh = hhLines(r, day);
  return [...out, ...hh.defects.map((x) => x.trim()), ...hh.warns.map((x) => x.trim())];
}

/** One day: its name and date, the problems, then each person's lines. */
export function tgDay(r: Rofl, day: string, week: string): string {
  const head = `*${DAY[day] ?? ru(day)} ${dm(startOf(r, week), dayOrder(r).get(day) ?? 1)}*`.trimEnd().replace(/ \*$/, '*');
  const ps = problems(r, day);
  const out = [ps.length === 0 ? `${head} — сходится` : `${head} — ${ps[0]}`, ...ps.slice(1)];
  const base = table(r, 'base', 'B')[0]?.B;
  const withs = index(table(r, 'with', 'E, Ch'), (x) => x.E);
  const by = index(blocks(r).filter((b) => b.day === day), (b) => b.who);
  const trips = pickedTrips(r).filter((t) => t.day === day);
  for (const who of [...new Set([...by.keys(), ...trips.map((t) => t.who)])].sort()) {
    out.push('', `*${ru(who)}*`);
    const lines = (by.get(who) ?? []).map((b) => {
      // the place only when the name does not already say it, and never the base
      const place = b.place !== base && !ru(b.ev).toLowerCase().includes(ru(b.place).toLowerCase().slice(0, 4)) ? ` (${ru(b.place)})` : '';
      const co = (withs.get(b.ev) ?? []).map((x) => ru(x.Ch));
      return { at: b.from, text: `• ${hhmm(b.from)}–${hhmm(b.to)} ${ru(b.ev)}${place}${co.length > 0 ? ` (с ${co.join(', ')})` : ''}${/^[emh]_/.test(b.c) ? ` [правка ${b.c}]` : ''}` };
    });
    for (const t of trips.filter((x) => x.who === who)) lines.push({ at: t.dep, text: `• ${hhmm(t.dep)}–${hhmm(t.ret)} везёт ${t.what}${t.wait > 0 ? ` (ждёт ${t.wait} мин)` : ''}` });
    out.push(...lines.sort((a, b) => a.at - b.at || (a.text < b.text ? -1 : 1)).map((l) => l.text));
  }
  return out.join('\n');
}

/** The week as a summary: one line per day, the problems counted and named; the full day is `show <day>`. */
export function tgWeek(r: Rofl, week: string): string {
  const start = startOf(r, week);
  const ord = dayOrder(r);
  const days = [...ord.keys()].sort((a, b) => ord.get(a)! - ord.get(b)!);
  const out = [`*Неделя ${week}*${start ? ` (${dm(start, 1)}–${dm(start, days.length)})` : ''}`];
  for (const d of days) {
    const hs = holes(r).filter((x) => x.day === d);
    const rest = problems(r, d).filter((x) => !x.startsWith('!! не покрыт')).map((x) => x.replace(/^!! /, ''));
    const parts = [...(hs.length > 0 ? [`${hs.length} ${hs.length === 1 ? 'дыра' : hs.length < 5 ? 'дыры' : 'дыр'}: ${hs.map((h) => `${ru(h.child)} ${hhmm(h.from)}–${hhmm(h.to)}`).join(', ')}`] : []), ...rest];
    out.push(`${DAY[d] ?? ru(d)} — ${parts.length === 0 ? 'сходится' : `!! ${parts.join('; ')}`}`);
  }
  out.push('', 'Подробно: show <день>');
  return out.join('\n');
}
