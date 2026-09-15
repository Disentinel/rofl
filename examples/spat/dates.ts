// dates.ts — A DATE IS A FACT OF THE ENVIRONMENT. `сегодня`, `завтра`,
// `послезавтра`, `15.09` (this year) and `2026-09-15` are resolved by the CLI
// in SPAT_TZ (and SPAT_NOW), never by the person or the model — measured
// 2026-09-15: the model computed the weekday itself and wrote Monday for a
// Tuesday. A date is in ONE week: the world is re-read under it.

import type { Rofl } from '../../src/api.ts';
import { bust, table } from './spat.ts';
import { SpatError, calDay, dateIn, must, type Cal, type Env, type Store } from './store.ts';

const bad = (what: string): never => { throw new SpatError(2, `не разобрал: ${what}`); };

/** `which` names the loader's `date_monday` row the day can be asked under; `on` is a date of its own. */
const DATE_WORD: Record<string, number> = { 'сегодня': 0, today: 0, 'завтра': 1, tomorrow: 1, 'послезавтра': 2 };
export type Dated = Cal & { which: 'today' | 'tomorrow' | 'on' };
export function dateToken(e: Env, t: string): Dated | undefined {
  const w = DATE_WORD[t.toLowerCase()];
  if (w !== undefined) return { ...dateIn(e, w), which: w === 0 ? 'today' : w === 1 ? 'tomorrow' : 'on' };
  const dm = /^(\d{1,2})\.(\d{1,2})$/.exec(t);
  const ymd = dm ? `${dateIn(e).ymd.slice(0, 4)}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : undefined;
  if (ymd === undefined) return undefined;
  const d = calDay(ymd);
  return d.ymd === ymd ? { ...d, which: 'on' } : bad(`дата: '${t}' — в календаре такого дня нет`);
}
export const dayAtom = (r: Rofl, n: number): string => table(r, 'day', 'D, N').find((x) => Number(x.N) === n)?.D ?? bad(`в мире нет дня с номером ${n}: day(D, ${n}) не объявлен`);

/** A DATED DAY IS SHOWN UNDER ITS OWN WEEK. `week_of(today|tomorrow, W)` is
 *  the rules' answer over `week_starts`; when W is not the week in force the
 *  world is re-read under W, so the day carries W's own moved/added and the
 *  edits recorded for W — never the same weekday of another week. A date
 *  with no `week_starts` is refused: the world does not have that week. */
export function weekOf(s: Store, d: Dated): { day: string; ymd: string; week: string } {
  // today and tomorrow are the loader's `date_monday` rows and the rules' `week_of`; any
  // other date is the same join over `week_starts`, read here rather than asserted and
  // re-evaluated — one evaluation less per dated edit (measured: 0.5 s each)
  const w = d.which === 'on' ? table(s.r, 'week_starts', 'W, M').find((x) => x.M.replace(/^"|"$/g, '') === d.monday)?.W
    : table(s.r, 'week_of', 'Which, W').find((x) => x.Which === d.which)?.W;
  if (!w) throw new SpatError(2, `неделя с понедельника ${d.monday} не заведена: в мире нет week_starts(W, "${d.monday}") — ${d.ymd} показать не из чего; нужна строка week/week_starts в world.rofl и roll`);
  return { day: dayAtom(s.r, d.n), ymd: d.ymd, week: w };
}
/** The world re-read under another week — the swap `--week-of` makes, made once. */
export function under(s: Store, w: string): void {
  const cur = table(s.r, 'current', 'W')[0]?.W;
  if (cur === w) return;
  s.r.retract(`current(${cur})`); must(s.r.assert(`current(${w}).`), 'current'); s.r.evaluate(); bust(s.r);
}
export function dated(s: Store, t: string): { day: string; ymd: string; week: string } {
  const d = weekOf(s, dateToken(s.env, t) ?? bad(`день: '${t}'`));
  under(s, d.week);
  return d;
}
