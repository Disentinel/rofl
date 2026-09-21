// demo.ts — THE WEEK IN FORCE FOLLOWS THE DATE (S3e, 2026-09-21), exercised
// from the outside: nobody rolled, and «add … thu» still lands in this week's
// Thursday; a weekday named without a date is the nearest one ahead, dated;
// a roll is a step ahead only; a date whose week the world does not have is
// code 2 with the line to add (29). Measured on the stand 21.09: `current`
// stood a week behind and two edits landed in the past. Same fixture and
// helpers as the other spat demos (examples/spat/demolib.ts).
//
//   node --experimental-strip-types examples/spat_week/demo.ts

import * as fs from 'node:fs';
import { run as verb } from '../spat/edits.ts';
import { FROM, Group, ROOT, fresh, inproc, spat, sql } from '../spat/demolib.ts';

const TZ = { SPAT_TZ: 'Europe/Nicosia' };
const robin = (root: string, now: string): Record<string, string> => ({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.robin, SPAT_NOW: now, ...TZ });
const alex = (root: string, now: string): Record<string, string> => ({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.alex, SPAT_NOW: now, ...TZ });
/** One verb in this process: its output and `<code>`. */
const one = (env: Record<string, string>, v: string, args: string[]): string => {
  const r = inproc(env, (s) => { let c: number; try { c = verb(s, v, args); } catch (e) { c = (e as { code?: number }).code ?? -1; console.log(String((e as Error).message)); } console.log(`<${c}>`); return 0; });
  return /<-?\d+>\s*$/.test(r.out) ? r.out : `${r.out}\n<${r.code}>`;   // a store that refused to open (2) printed no marker
};
const codeOf = (out: string): string => /<(-?\d+)>\s*$/.exec(out)?.[1] ?? '?';
const weekOfEdit = (root: string, id: string): string => JSON.parse(sql<{ args: string }[]>(root, "SELECT args FROM facts WHERE pred = 'for_week' AND args LIKE ?", `%"${id}"%`)[0]?.args ?? '[]')[1]?.name ?? '?';
const idOf = (out: string): string => /\((e_[0-9a-f]+)\)/.exec(out)?.[1] ?? '';

// ------------------- 29. the week in force is the week of the date; a weekday is the nearest one ahead
async function week(): Promise<Group> {
  const g = new Group('29. the week in force = the week of SPAT_NOW (week_starts); a weekday without a date = the nearest ahead, in ITS week; roll — ahead only; no week_starts for today — code 2 with the line to add');
  const root = fresh();
  const MON = '2026-08-31T21:30:00+03:00'; const TUE = '2026-09-01T09:00:00+03:00'; const SUN = '2026-09-06T21:30:00+03:00';
  // PLANTED (1): the fixture's world says current(w0831) and p_me rolled(w0831); on Tuesday 08.09 nobody rolled — the week
  // in force is still w0907, by the date; the stand's «в силе w0914 неделю спустя» cannot happen
  const w = await spat(root, 'robin', ['whoami'], { SPAT_NOW: '2026-09-08T10:00:00+03:00' });
  g.check('вт 08.09 без roll: whoami «неделя w0907 · сегодня 2026-09-08», без строки «в силе неделя …»', w.code === 0 && /неделя w0907 · сегодня 2026-09-08/.test(w.out) && !/в силе неделя/.test(w.out), w.out);
  // (2) the three defects of the brief, on the fixture's dates: Monday → this Thursday; Tuesday → NEXT Monday; Sunday evening → tomorrow's Monday
  const a = await spat(root, 'robin', ['edit', 'add x thu 15:00-16:00 kit'], { SPAT_NOW: MON });
  g.check('пн 31.08: add x thu 15:00-16:00 kit → 0 «применено: x чт 15:00–16:00 (2026-09-03) (e_…) — неделя w0831»; for_week w0831', a.code === 0 && /^применено: x чт 15:00–16:00 \(2026-09-03\) \(e_[0-9a-f]+\) — неделя w0831/.test(a.out) && weekOfEdit(root, idOf(a.out)) === 'w0831', a.out);
  const b = one(robin(root, TUE), 'edit', ['add y mon 15:00-16:00 kit']);
  g.check('вт 01.09: add y mon … → «применено: y пн 15:00–16:00 (2026-09-07) … — неделя w0907» — СЛЕДУЮЩИЙ понедельник; for_week w0907', codeOf(b) === '0' && /^применено: y пн 15:00–16:00 \(2026-09-07\) \(e_[0-9a-f]+\) — неделя w0907/m.test(b) && weekOfEdit(root, idOf(b)) === 'w0907', b);
  const c = one(robin(root, SUN), 'edit', ['add z mon 15:00-16:00 kit']);
  g.check('вс 06.09 21:30: add z mon … → «(2026-09-07) … — неделя w0907» — завтрашний понедельник, не уходящая неделя; for_week w0907', codeOf(c) === '0' && /\(2026-09-07\) \(e_[0-9a-f]+\) — неделя w0907/.test(c) && weekOfEdit(root, idOf(c)) === 'w0907', c);
  const d = one(robin(root, '2026-08-31T09:00:00+03:00'), 'edit', ['add q mon 15:00-16:00 kit']);
  g.check('пн 31.08 09:00: add q mon … → сегодня (2026-08-31), неделя w0831', codeOf(d) === '0' && /\(2026-08-31\) \(e_[0-9a-f]+\) — неделя w0831/.test(d), d);
  const e = one(robin(root, MON), 'edit', ['add r sun 10:00-11:00 kit']);
  g.check('пн 31.08: add r sun … → это воскресенье (2026-09-06), w0831', codeOf(e) === '0' && /\(2026-09-06\) \(e_[0-9a-f]+\) — неделя w0831/.test(e), e);
  // skip/move over a block as the human sees it — the same choice of week; every — unchanged; a date — as before
  const f = one(robin(root, SUN), 'edit', ['skip walk mon']);
  g.check('вс 06.09: skip walk mon → «применено: прогулка отменён пн (2026-09-07) … — неделя w0907»', codeOf(f) === '0' && /прогулка отменён пн \(2026-09-07\) \(e_[0-9a-f]+\) — неделя w0907/.test(f), f);
  const h = one(robin(root, SUN), 'edit', ['add piano every mon 16:00-17:00 kit']);
  g.check('вс 06.09: add piano every mon … → «каждую неделю», без даты', codeOf(h) === '0' && /piano каждую неделю: пн 16:00–17:00 \(e_[0-9a-f]+\) — каждую неделю/.test(h), h);
  g.check('вс 06.09: add v 12.09 10:00-11:00 kit → дата как раньше: w0907', /\(2026-09-12\) \(e_[0-9a-f]+\) — неделя w0907/.test(one(robin(root, SUN), 'edit', ['add v 12.09 10:00-11:00 kit'])));
  // show <weekday> and warnings <weekday>: the same nearest day, under its own week
  const sh = await spat(root, 'robin', ['show', 'thu'], { SPAT_NOW: SUN });
  g.check('вс 06.09: show thu → заголовок «чт 2026-09-10 (неделя w0907)» — ближайший четверг', sh.code === 0 && /^чт 2026-09-10 \(неделя w0907\)/.test(sh.out), sh.out.split('\n')[0]);
  g.check('пн 31.08: show thu → «чт 2026-09-03 (неделя w0831)», в нём x [правка]; warnings mon (вт 01.09) → «пн (неделя w0907): …»', /^чт 2026-09-03 \(неделя w0831\)/.test(one(robin(root, MON), 'show', ['thu'])) && /  x +/.test(one(robin(root, MON), 'show', ['thu'])) && /^пн \(неделя w0907\): /m.test(one(robin(root, TUE), 'warnings', ['mon'])));
  // no week_starts for the date: code 2 with the exact lines to add, for every verb of the store
  const n = await spat(root, 'robin', ['whoami'], { SPAT_NOW: '2026-09-14T09:00:00+03:00' });
  g.check('пн 14.09 (недели нет): whoami → 2 «неделя с понедельника 2026-09-14 не заведена: в мире нет week_starts(W, "2026-09-14") — сегодня 2026-09-14, показать не из чего.» + «добавить в world.rofl (оператор, spat volume load <семья> world.rofl --book world):» + «week(w0914).  week_starts(w0914, "2026-09-14").»',
    n.code === 2 && n.out.trim() === 'неделя с понедельника 2026-09-14 не заведена: в мире нет week_starts(W, "2026-09-14") — сегодня 2026-09-14, показать не из чего.\n  добавить в world.rofl (оператор, spat volume load <семья> world.rofl --book world):\n  week(w0914).  week_starts(w0914, "2026-09-14").', n.out);
  g.check('то же для show, edit, need list (2); --week-of w0907 отвечает (0)', codeOf(one(robin(root, '2026-09-14T09:00:00+03:00'), 'show', ['mon'])) === '2' && codeOf(one(robin(root, '2026-09-16T09:00:00+03:00'), 'edit', ['add t mon 10:00-11:00 kit'])) === '2' && codeOf(one(robin(root, '2026-09-14T09:00:00+03:00'), 'need', ['list'])) === '2'
    && (await spat(root, 'robin', ['show', 'mon', '--week-of', 'w0907'], { SPAT_NOW: '2026-09-14T09:00:00+03:00' })).code === 0);
  // roll — a step ahead only; ahead, the week in force is the rolled one and whoami says so
  const r0 = one(alex(root, TUE), 'roll', ['w0831']);
  g.check('вт 01.09: alex roll w0831 → 2 «roll только вперёд: неделя w0831 (2026-08-31) не позже сегодняшней 2026-08-31 — неделя в силе следует за датой сама»', codeOf(r0) === '2' && /^roll только вперёд: неделя w0831 \(2026-08-31\) не позже сегодняшней 2026-08-31 — неделя в силе следует за датой сама$/m.test(r0), r0);
  const r1 = one(alex(root, TUE), 'roll', ['w0907']);
  const w1 = one(robin(root, TUE), 'whoami', []);
  g.check('alex roll w0907 → 0 «неделя теперь w0907 (была w0831)»; whoami вт 01.09: «неделя w0907», строка «!! в силе неделя w0907 (roll оператора), сегодня неделя w0831: недатированное (every, all, place, need list) — в w0907»', codeOf(r1) === '0' && /^неделя теперь w0907 \(была w0831\)/m.test(r1) && /неделя w0907 · сегодня 2026-09-01/.test(w1) && /!! в силе неделя w0907 \(roll оператора\), сегодня неделя w0831: недатированное \(every, all, place, need list\) — в w0907/.test(w1), w1);
  g.check('после roll вперёд: add s thu … (вт 01.09) всё равно в чт 03.09, w0831 — день по дате, не по roll', /\(2026-09-03\) \(e_[0-9a-f]+\) — неделя w0831/.test(one(robin(root, TUE), 'edit', ['add s thu 10:00-11:00 kit'])));
  g.check('вт 08.09 после roll w0907: roll позади даты не действует — whoami «неделя w0907», без «!!»', (() => { const o = one(robin(root, '2026-09-08T10:00:00+03:00'), 'whoami', []); return /неделя w0907 · сегодня 2026-09-08/.test(o) && !/в силе неделя/.test(o); })());
  return g;
}

const t0 = Date.now();
const g = await week();
for (const l of g.lines) console.log(l);
console.log(`\n${g.n - g.fails}/${g.n} scenarios`);
console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(g.fails === 0 ? 0 : 1);
