// ПЕРЕБОР ПЛАНОВ ДНЯ. Правила материализуют ОДИН мир и объясняют его; выбор
// между способами перебирает хост — то же разделение, по которому уже работает
// `relax`. Дни независимы (измерено: поломка понедельника не двигает ни один
// другой день), поэтому перебор идёт по дню, а не по неделе: 2^2 = 4 плана
// вместо 2^10 = 1024, три секунды вместо ста пятидесяти.
import * as fs from 'node:fs';
import { world, table, holes, chains, ru } from './spat.ts';

interface Way { run: string; w: string; who: string; from: number; to: number; dest: string; }

function waysOf(day: string, weekFile: string): Map<string, Way[]> {
  const r = world(weekFile);
  const mine = table(r, 'attempt', 'T, W, H, D, Dep, Ret').filter((x) => x.D === day);
  const runTo = new Map(table(r, 'run', 'T, Ch, F, To, D, W, At')
    .filter((x) => x.D === day).map((x) => [x.T, x.To]));
  const open = new Set(table(r, 'way', 'T, W').map((x) => `${x.T}|${x.W}`));
  const by = new Map<string, Way[]>();
  for (const a of mine) {
    if (!open.has(`${a.T}|${a.W}`)) continue;         // закрытые способы не выбираем
    // КУДА едет водитель: для ferry — до остановки, имя способа её несёт;
    // для drive — до самой цели поездки.
    const ferry = /^ferry\(([^,]+),([^,]+),/.exec(a.W);
    const dest = ferry ? ferry[2] : (runTo.get(a.T) ?? 'home');
    const list = by.get(a.T) ?? [];
    list.push({ run: a.T, w: a.W, who: a.H, from: Number(a.Dep), to: Number(a.Ret), dest });
    by.set(a.T, list);
  }
  return by;
}

const product = <T>(xs: T[][]): T[][] =>
  xs.reduce<T[][]>((acc, list) => acc.flatMap((c) => list.map((x) => [...c, x])), [[]]);

/** A chosen way OCCUPIES its driver: that is what makes the car and the clock
 *  react. A lift by somebody else costs the household nothing and adds no
 *  block, which is exactly why it is often the better plan. */
function facts(plan: Way[], day: string, week: string): string[] {
  const out = ['constraint(c_plan, plan, household).'];
  plan.forEach((w, i) => {
    if (w.who === 'nobody' || w.to <= w.from) return;
    // THE BLOCK GOES WHERE THE DRIVER ACTUALLY ENDS UP. Putting it at `home`
    // said the driver never left: no position change, so no leg, so no car
    // taken - and two people setting off at the same minute in one car came
    // out as a plan that holds. The question that found it was "а второго кто
    // везёт?", and the model could not answer because nobody had moved.
    out.push(`added(c_plan, pw${i}, ${w.who}, ${w.dest}, ${week}, ${day}, ${w.from}, ${w.to}).`);
  });
  return out;
}

function score(weekFile: string, extra: string[], day: string) {
  const r = world(weekFile, { extra });
  const cs = chains(r).filter((c) => c.day === day);
  // ПОЛОМКИ ЭТОГО ДНЯ, а не всей недели.  — свойство недели, и пока
  // я брал его целиком, каждый план выглядел одинаково сломанным: конфликт
  // Регины в понедельник красил все шесть вторничных планов. Счёт плана
  // обязан говорить о том дне, который перебирается.
  const mine: string[] = [];
  if (table(r, 'overbooked', 'P, D, E1, E2').some((x) => x.D === day)) mine.push('в двух местах');
  if (holes(r).some((h) => h.day === day)) mine.push('ребёнок без присмотра');
  if (table(r, 'negative_slack', 'P, D, E1, E2').some((x) => x.D === day)) mine.push('не успевает');
  if (table(r, 'car_clash', 'D, P1, P2').some((x) => x.D === day)) mine.push('одна машина');
  if (table(r, 'too_slow', 'P, D, F, T').some((x) => x.D === day)) mine.push('пешком не успеть');
  if (table(r, 'too_late', 'C, E, D, F, By').some((x) => x.D === day)) mine.push('мимо окна');
  return {
    broken: mine.sort(),
    holes: holes(r).filter((h) => h.day === day).length,
    slack: cs.length > 0 ? Math.min(...cs.map((c) => c.m)) : null,
    work: table(r, 'day_work', 'P, D, M').filter((x) => x.D === day)
      .map((x) => `${ru(x.P)} ${Math.floor(Number(x.M) / 60)}ч${Number(x.M) % 60}м`).join(' '),
  };
}

export interface Scored { plan: Way[]; s: ReturnType<typeof score>; }

/** Every plan for one day, scored in a real world each, best first. */
export function plansFor(weekFile: string, day: string):
    { runs: string[]; by: Map<string, Way[]>; rows: Scored[] } {
  const r0 = world(weekFile);
  const week = table(r0, 'current', 'W')[0]?.W ?? 'w0831';
  const by = waysOf(day, weekFile);
  const runs = [...by.keys()].sort();
  const rows = product(runs.map((t) => by.get(t)!))
    .map((plan) => ({ plan, s: score(weekFile, facts(plan, day, week), day) }));
  rows.sort((a, b) => a.s.broken.length - b.s.broken.length || (b.s.slack ?? 0) - (a.s.slack ?? 0));
  return { runs, by, rows };
}

export function renderPlans(weekFile: string, day: string): string {
  const { runs, by, rows } = plansFor(weekFile, day);
  const out = [ru(day) + ': ' + runs.length + ' поездок, ' + rows.length + ' планов', ''];
  for (const t of runs) out.push('  ' + t + ': ' + by.get(t)!.map((w) => w.w).join(' | '));
  out.push('');
  for (const { plan, s } of rows) {
    out.push((s.broken.length === 0 ? '  СХОДИТСЯ' : '  ' + s.broken.join(', ')).padEnd(32)
      + '| запас ' + String(s.slack ?? '-').padStart(4) + ' | дыр ' + s.holes + ' | ' + s.work);
    for (const w of plan) out.push('      ' + w.run + ': ' + w.w);
  }
  return out.join('\n');
}
