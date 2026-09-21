// tomorrow.ts — TWO RENDERERS over the multi-user world: a day as text
// (`tomorrow`, `show`) and the week as an ICS feed (`ics`). Nothing here is
// decided: holes, slack, lateness and blocks are relations, read and printed.
// "Today" is SPAT_TZ (and SPAT_NOW in tests) and never the process clock.

import type { Rofl } from '../../src/api.ts';
import { blocks, chains, dayOrder, hhmm, holes, index, pickedTrips, ru, sayConstraint, table, whoWasBusy } from './spat.ts';
import { SpatError, type Store } from './store.ts';
import { hhLines } from './rules.ts';
import { carryWarns, noted, notes } from './notes.ts';
import { needLines } from './needs.ts';

/** A day — or the whole week when `day` is undefined — problems first:
 *  holes, chains with no slack, late arrivals; then the grid by person. */
export function renderDay(r: Rofl, day: string | undefined, title: string, grid = true): string {
  const on = <T extends { day: string }>(xs: T[]): T[] => xs.filter((x) => day === undefined || x.day === day);
  const ord = dayOrder(r);
  const byDay = <T extends { day: string }>(xs: T[]): T[] => xs.slice().sort((a, b) => ord.get(a.day)! - ord.get(b.day)!);
  const out: string[] = [title];
  const hs = on(holes(r));
  const tight = on(chains(r)).filter((c) => c.m <= 0);
  const late = table(r, 'too_late', 'C, Ev, D, F, By').filter((x) => day === undefined || x.D === day);
  const stuck = new Set(table(r, 'run_stuck', 'T').map((x) => x.T));
  const noWay = table(r, 'run', 'T, Ch, From, To, D, K, At').filter((x) => stuck.has(x.T) && (day === undefined || x.D === day));
  const hh = hhLines(r, day);
  const cw = carryWarns(r, day).map((l) => `  ${l}`);
  const nl = needLines(r, day).map((l) => `  !! ${l}`);   // a need not placed, a condition not met (needs.ts)
  if (hs.length + tight.length + late.length + noWay.length + hh.defects.length + cw.length + nl.length === 0) out.push('  сходится: дыр нет, запас есть, никто не опаздывает.');
  for (const h of byDay(hs)) {
    out.push(`  !! НЕ ПОКРЫТ ${ru(h.day)} ${hhmm(h.from)}–${hhmm(h.to)}  ${ru(h.child)}`);
    for (const { person, why } of whoWasBusy(r, h.day, h.from)) {
      out.push(`       ${ru(person).padEnd(10)} ${why.map((c) => (c === 'not_present' ? 'не в эти часы' : sayConstraint(r, c).trim())).join('; ')}`);
    }
  }
  for (const c of byDay(tight)) {
    out.push(`  !! ${c.m < 0 ? 'НЕ УСПЕВАЕТ' : 'БЕЗ ЗАПАСА'} ${ru(c.day)} ${ru(c.who)}: ${ru(c.a)} → ${ru(c.b)}  ${c.m} мин`);
  }
  for (const l of late) out.push(`  !! ОПОЗДАНИЕ ${ru(l.D)} ${ru(l.Ev)} начинается ${hhmm(l.F)}, надо не позже ${hhmm(l.By)}  (${l.C})`);
  for (const n of noWay) out.push(`  !! НЕКОМУ ВЕЗТИ ${ru(n.D)} ${hhmm(n.At)} ${ru(n.Ch)}: ${ru(n.From)} → ${ru(n.To)}`);
  out.push(...cw, ...hh.defects, ...hh.warns, ...nl);
  if (!grid) return out.join('\n');
  const trips = on(pickedTrips(r));
  const withs = index(table(r, 'with', 'E, Ch'), (x) => x.E);
  const days = day === undefined ? [...ord.keys()].sort((a, b) => ord.get(a)! - ord.get(b)!) : [day];
  for (const d of days) {
    const bs = blocks(r).filter((b) => b.day === d);
    if (bs.length === 0 && day === undefined) continue;
    if (day === undefined) out.push(`\n${ru(d)}`);
    // the secretary's lines (notes.ts): a note under the day, a note or a handed-over leg under the person
    out.push(...notes(r, d, 'all').map((n) => `  ${n}`));
    const by = index(bs, (b) => b.who);
    for (const who of [...new Set([...by.keys(), ...trips.filter((t) => t.day === d).map((t) => t.who), ...noted(r, d)])].sort()) {
      out.push(`  ${ru(who)}`, ...notes(r, d, who).map((n) => `    ${n}`));
      const lines = (by.get(who) ?? []).map((b) => ({
        at: b.from,
        text: `    ${hhmm(b.from)}–${hhmm(b.to)}  ${ru(b.ev).padEnd(18)} ${ru(b.place).padEnd(10)}`
          + ((withs.get(b.ev) ?? []).length > 0 ? ' + ' + withs.get(b.ev)!.map((x) => ru(x.Ch)).join(', ') : '')
          + (/^[emh]_/.test(b.c) ? `  [правка ${b.c}]` : ''),
      }));
      for (const t of trips.filter((x) => x.day === d && x.who === who)) {
        lines.push({ at: t.dep, text: `    ${t.dep === t.ret ? `${hhmm(t.dep)}      ` : `${hhmm(t.dep)}–${hhmm(t.ret)}`}  ВЕЗЁТ ${t.what}${t.wait > 0 ? ` (ждёт ${t.wait}м)` : ''}${t.carry ? `  [правка ${t.carry}]` : ''}` });
      }
      for (const l of lines.sort((a, b) => a.at - b.at || (a.text < b.text ? -1 : 1))) out.push(l.text);
    }
  }
  return out.join('\n');
}

/** `spat warnings [<day>]`: every «!!» line of the week — or of one day — as one list, nothing else. */
export function renderWarnings(r: Rofl, week: string, day?: string): string {
  const lines = renderDay(r, day, '', false).split('\n').slice(1).filter((l) => l.startsWith('  !!'));
  return [`${day === undefined ? `неделя ${week}` : `${ru(day)} (неделя ${week})`}: ${lines.length === 0 ? 'предупреждений нет' : `${lines.length} предупреждений`}`, ...lines].join('\n');
}

/** The week as VEVENTs, one per block of `span`, dated from
 *  `week_starts(Week, "YYYY-MM-DD")` in the world file. `--for` keeps the
 *  blocks of one person and the blocks that have them in (`with`). */
export function renderIcs(s: Store, forWho?: string): string {
  const r = s.r;
  const start = table(r, 'week_starts', 'W, D').find((x) => x.W === s.week)?.D.replace(/^"|"$/g, '');
  if (!start) throw new SpatError(2, `в мире нет week_starts(${s.week}, "YYYY-MM-DD") — без даты календарь не собрать`);
  const t0 = new Date(`${start}T00:00:00Z`).getTime();
  const ord = dayOrder(r);
  const withs = index(table(r, 'with', 'E, Ch'), (x) => x.E);
  const stamp = (n: number, m: number): string => {
    const d = new Date(t0 + (n - 1) * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
    return `${d}T${hhmm(m).replace(':', '')}00`;
  };
  const tz = s.env.tz;
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//spat//ROFL//RU', `X-WR-CALNAME:spat ${s.env.tenant} ${s.week}`];
  const bs = blocks(r).filter((b) => forWho === undefined || b.who === forWho
    || (withs.get(b.ev) ?? []).some((x) => x.Ch === forWho));
  bs.sort((a, b) => ord.get(a.day)! - ord.get(b.day)! || a.from - b.from || (a.who < b.who ? -1 : 1));
  for (const b of bs) {
    const n = ord.get(b.day)!;
    const plus = (withs.get(b.ev) ?? []).map((x) => ru(x.Ch));
    L.push('BEGIN:VEVENT', `UID:${b.c}-${b.ev}-${b.day}-${b.who}@spat`,
      `DTSTART;TZID=${tz}:${stamp(n, b.from)}`, `DTEND;TZID=${tz}:${stamp(n, b.to)}`,
      `SUMMARY:${ru(b.ev)} — ${ru(b.who)}${plus.length > 0 ? ' + ' + plus.join(', ') : ''}`,
      `LOCATION:${ru(b.place)}`, `DESCRIPTION:${sayConstraint(r, b.c).trim().replace(/\s+/g, ' ')}`, 'END:VEVENT');
  }
  for (const h of holes(r)) {
    L.push('BEGIN:VEVENT', `UID:hole-${h.child}-${h.day}-${h.from}@spat`,
      `DTSTART;TZID=${tz}:${stamp(ord.get(h.day)!, h.from)}`, `DTEND;TZID=${tz}:${stamp(ord.get(h.day)!, h.to)}`,
      `SUMMARY:НЕ ПОКРЫТ ${ru(h.child)}`, 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}
