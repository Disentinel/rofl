// examples/spat/html.ts — the week as a GRID you can look at and print.
//
// The text views answer questions; a grid answers "where is everyone on
// Thursday evening" in one glance, which is the question a hand-built
// schedule on the fridge was answering before this existed. Nothing here
// models anything: every number comes from a relation the rules already
// derived — `span` for the blocks, `uncovered` for the red ones, `slack` for
// the handovers with no room, `out_why` for who was taken and by whose
// constraint. If the grid and the text ever disagree, the grid is wrong.
//
// PRINT IS A FIRST-CLASS OUTPUT, not a CSS afterthought: the artefact this
// replaces was a sheet of paper. A4 landscape, and every distinction that
// carries meaning is drawn TWICE — by colour and by a border or a hatch — so
// a black-and-white printer loses nothing.

import type { Rofl } from '../../src/api.ts';
import {
  blocks, holes, chains, whoWasBusy, ownerOf, table, index,
  ru, hhmm, dayOrder, gridOf, runs,
  type Block, type Hole,
} from './spat.ts';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Eight hues that stay distinguishable when a printer drops them to grey.
 *  Assigned by sorted person id, so the same person keeps a colour across
 *  runs and across weeks — a legend you have to re-learn is not a legend. */
const HUES = [205, 12, 145, 275, 45, 330, 185, 95];

/** `broken/1` names its reasons as atoms; these are the same words a person
 *  uses about them. An atom with no entry prints as itself, so a new reason
 *  announces itself instead of vanishing. */
const RU_BROKEN: Record<string, string> = {
  uncovered: 'ребёнок без присмотра',
  double_booked: 'кто-то в двух местах сразу',
  no_time: 'на переезд не хватает времени',
  unreachable: 'ребёнка некому отвезти',
  no_way: 'ребёнка некому отвезти',
  short_day: 'рабочий день не добирает часов',
};

interface Lane { block: Block; lane: number; }

/** Greedy interval colouring, one day at a time. Two people at the same hour
 *  must not be drawn on top of each other, and the number of lanes a day
 *  needs is a property of that day, not of the week. */
function lanesOf(bs: Block[]): { lanes: Lane[]; width: number } {
  const sorted = [...bs].sort((a, b) => a.from - b.from || a.to - b.to
    || (a.who < b.who ? -1 : 1));
  const ends: number[] = [];
  const lanes: Lane[] = [];
  for (const block of sorted) {
    let lane = ends.findIndex((e) => e <= block.from);
    if (lane === -1) { lane = ends.length; ends.push(block.to); }
    else ends[lane] = block.to;
    lanes.push({ block, lane });
  }
  return { lanes, width: Math.max(1, ends.length) };
}

export interface WeekHtmlOpts {
  /** wrap in a document of its own — for `spat html > week.html` */
  standalone?: boolean;
  title?: string;
}

export function weekHtml(r: Rofl, opts: WeekHtmlOpts = {}): string {
  const g = gridOf(r);
  const ord = dayOrder(r);
  const bs = blocks(r);
  const hs = holes(r);
  const days = [...new Set([...bs.map((b) => b.day), ...hs.map((h) => h.day)])]
    .sort((a, b) => (ord.get(a) ?? 99) - (ord.get(b) ?? 99));

  // THE WINDOW IS DERIVED, never typed: a week with a 05:00 school run must
  // show 05:00, and a week that starts at nine must not waste four rows.
  const times = [...bs.flatMap((b) => [b.from, b.to]), ...hs.flatMap((h) => [h.from, h.to])];
  const lo = Math.floor(Math.min(...times) / 60) * 60;
  const hi = Math.ceil(Math.max(...times) / 60) * 60;
  const span = Math.max(g, hi - lo);
  const pct = (m: number): number => ((m - lo) / span) * 100;

  const people = [...new Set(bs.map((b) => b.who))].sort();
  const hue = new Map(people.map((p, i) => [p, HUES[i % HUES.length]]));
  const kind = new Map(table(r, 'person', 'P, K').map((x) => [x.P, x.K]));

  const week = table(r, 'current', 'W')[0]?.W ?? '?';
  const cons = table(r, 'constraint', 'C, O, S');
  const ext = cons.filter((c) => c.S === 'external');
  const tight = chains(r).filter((c) => c.m <= 5).sort((a, b) => a.m - b.m
    || (ord.get(a.day) ?? 99) - (ord.get(b.day) ?? 99));
  const withs = index(table(r, 'with', 'E, Ch'), (x) => x.E);
  const single = runs(r).filter((x) => x.ways.length === 1);
  // ONE READ OF `broken`, USED TWICE. It was two reads - one for the header,
  // one for the panel - and a mutant emptied the panel's while leaving the
  // header's, so the page said `does not add up` at the top and `adds up
  // entirely` below. Two reads of one relation is two chances to disagree.
  const broke = table(r, 'broken', 'R').map((x) => x.R);
  const over = table(r, 'overbooked', 'P, D, E1, E2')
    .filter((x) => x.E1 < x.E2)   // the relation is symmetric; print each pair once
    .sort((a, b) => (ord.get(a.D) ?? 99) - (ord.get(b.D) ?? 99));

  const out: string[] = [];
  const p = (s: string): void => { out.push(s); };

  // ---- hour rules, one row per hour, in the gutter and behind the grid ----
  const hours: number[] = [];
  for (let m = lo; m <= hi; m += 60) hours.push(m);

  p('<div class="top">');
  p(`<h1>Неделя<span class="wk">${esc(week)}</span></h1>`);
  p('<p class="sub">' + esc(
    `${people.map(ru).join(' · ')} — ${cons.length} ограничений, ${ext.length} внешних`
  ) + '. ' + (broke.length === 0
    ? 'Сходится.'
    : `<b>Не сходится: ${broke.map((b) => RU_BROKEN[b] ?? b).join(', ')}.</b>`) + '</p>');
  p('</div>');

  // ---- legend ----
  p('<div class="legend">');
  for (const who of people) {
    p(`<span class="chip" style="--h:${hue.get(who)}"><i></i>${esc(ru(who))}`
      + `${kind.get(who) ? ` <em>${esc(ru(kind.get(who)!))}</em>` : ''}</span>`);
  }
  if (hs.length > 0) p('<span class="chip hole-chip"><i></i>не покрыт</span>');
  p('</div>');

  // ---- the grid ----
  p(`<div class="grid" style="--days:${days.length}">`);
  p('<div class="gutter">');
  for (const m of hours) {
    p(`<span class="hr" style="top:${pct(m).toFixed(3)}%">${hhmm(m)}</span>`);
  }
  p('</div>');

  const byDay = index(bs, (b) => b.day);
  for (const day of days) {
    const { lanes, width } = lanesOf(byDay.get(day) ?? []);
    p(`<div class="day"><div class="dh">${esc(ru(day))}</div><div class="cells">`);
    for (const m of hours) {
      p(`<div class="rule" style="top:${pct(m).toFixed(3)}%"></div>`);
    }
    for (const { block, lane } of lanes) {
      const kids = (withs.get(block.ev) ?? []).map((x) => ru(x.Ch));
      const dur = block.to - block.from;
      p(`<div class="b${dur <= 40 ? ' thin' : ''}" style="--h:${hue.get(block.who)};`
        + `top:${pct(block.from).toFixed(3)}%;height:${((dur / span) * 100).toFixed(3)}%;`
        + `left:${((lane / width) * 100).toFixed(2)}%;width:${(100 / width).toFixed(2)}%"`
        + ` title="${esc(`${ru(block.who)} · ${ru(block.ev)} · ${ru(block.place)}`
          + ` · ${hhmm(block.from)}–${hhmm(block.to)}`)}">`
        + `<b>${esc(ru(block.ev))}</b>`
        + `<span class="w">${esc(ru(block.who))}</span>`
        + `<span class="t">${hhmm(block.from)}–${hhmm(block.to)}</span>`
        + `<span class="pl">${esc(ru(block.place))}</span>`
        + (kids.length > 0 ? `<span class="k">+ ${esc(kids.join(', '))}</span>` : '')
        + '</div>');
    }
    for (const h of hs.filter((x) => x.day === day)) {
      p(`<div class="hole" style="top:${pct(h.from).toFixed(3)}%;`
        + `height:${(((h.to - h.from) / span) * 100).toFixed(3)}%"`
        + ` title="${esc(`${ru(h.child)} не покрыт ${hhmm(h.from)}–${hhmm(h.to)}`)}">`
        + `<b>${esc(ru(h.child))}</b><span>${hhmm(h.from)}–${hhmm(h.to)}</span></div>`);
    }
    p('</div></div>');
  }
  p('</div>');

  // ---- the panels: every red block, and what took each person ----
  p('<div class="panels">');
  p('<section><h2>Не покрыто</h2>');
  if (hs.length === 0) {
    p('<p class="ok">Каждый ребёнок покрыт каждую минуту.</p>');
  } else {
    for (const h of hs) {
      p(`<div class="hcard"><h3>${esc(ru(h.child))} — ${esc(ru(h.day))} `
        + `${hhmm(h.from)}–${hhmm(h.to)}</h3><table>`);
      for (const { person, why } of whoWasBusy(r, h.day, h.from)) {
        const cells = why.map((c) => {
          if (c === 'not_present') return '<td colspan="3">в эти часы её вообще нет</td>';
          const { owner, scope } = ownerOf(r, c);
          return `<td><code>${esc(c)}</code></td><td>${esc(ru(owner))}</td>`
            + `<td class="${scope === 'external' ? 'extl' : 'ours'}">`
            + `${scope === 'external' ? 'ВНЕШНЕЕ' : 'наше'}</td>`;
        }).join('</tr><tr><th></th>');
        p(`<tr><th>${esc(ru(person))}</th>${cells}</tr>`);
      }
      p('</table></div>');
    }
  }
  p('</section>');

  p('<section><h2>Запас на пересадках</h2>');
  if (tight.length === 0) {
    p('<p class="ok">Каждая пересадка с запасом больше пяти минут.</p>');
  } else {
    p('<table class="slack">');
    for (const c of tight) {
      p(`<tr class="${c.m < 0 ? 'bad' : c.m === 0 ? 'zero' : ''}">`
        + `<td>${esc(ru(c.day))}</td><td>${esc(ru(c.who))}</td>`
        + `<td>${esc(ru(c.a))} → ${esc(ru(c.b))}</td>`
        + `<td class="n">${c.m} мин</td></tr>`);
    }
    p('</table>');
  }
  if (single.length > 0) {
    p(`<h3>Без замены — ${single.length} поездок с единственным способом</h3><table class="slack">`);
    for (const x of single) {
      p(`<tr><td>${esc(ru(x.day))}</td><td>${hhmm(x.at)}</td>`
        + `<td>${esc(ru(x.child))}: ${esc(ru(x.from))} → ${esc(ru(x.to))}</td>`
        + `<td class="n">${esc(ru(x.ways[0]))}</td></tr>`);
    }
    p('</table>');
  }
  p('</section>');

  // WHAT THE MODEL CALLS BROKEN MUST BE ON THE PRINTOUT. The grid drew this
  // week correctly and said nothing about `double_booked`, which `spat check`
  // had already found - a sheet that hides a failure the model located is
  // worse than no sheet, because it looks complete.
  p('<section><h2>Не сходится</h2>');
  if (broke.length === 0) {
    p('<p class="ok">Неделя сходится целиком.</p>');
  } else {
    p(`<p class="brk">${broke.map((b) => esc(RU_BROKEN[b] ?? b)).join(' · ')}</p>`);
    if (over.length > 0) {
      p('<h3>В двух местах сразу</h3><table class="slack">');
      for (const o of over) {
        p(`<tr class="zero"><td>${esc(ru(o.D))}</td><td>${esc(ru(o.P))}</td>`
          + `<td>${esc(ru(o.E1))} и ${esc(ru(o.E2))}</td></tr>`);
      }
      p('</table>');
    }
    const short = table(r, 'short_day', 'P, D, M, N')
      .sort((a, b) => (ord.get(a.D) ?? 99) - (ord.get(b.D) ?? 99));
    if (short.length > 0) {
      p('<h3>Недобор часов</h3><table class="slack">');
      for (const x of short) {
        const miss = Number(x.N) - Number(x.M);
        p(`<tr class="zero"><td>${esc(ru(x.D))}</td><td>${esc(ru(x.P))}</td>`
          + `<td>${Math.floor(Number(x.M) / 60)}ч ${Number(x.M) % 60}м из `
          + `${Math.floor(Number(x.N) / 60)}ч ${Number(x.N) % 60}м</td>`
          + `<td class="n">-${Math.floor(miss / 60)}:${String(miss % 60).padStart(2, '0')}</td></tr>`);
      }
      p('</table>');
    }
  }
  p('</section>');

  // HOW MUCH DRIVING EACH HANDOVER CAN ABSORB. `slack` says what is left
  // over; the budget says the whole envelope, and the two together turn "took
  // 25 minutes" into "took 25 of the 25 there are". Travel is not a number -
  // it moves with traffic, route and how hard the driver is pressing - so the
  // envelope is the durable statement and the measurement is a sample in it.
  const budget = table(r, 'travel_budget', 'P, D, E1, E2, Max')
    .map((x) => ({ p: x.P, d: x.D, e1: x.E1, e2: x.E2, max: Number(x.Max) }))
    .filter((x) => x.max <= 30)
    .sort((a, b) => a.max - b.max || (ord.get(a.d) ?? 99) - (ord.get(b.d) ?? 99));
  const cond = table(r, 'assume', 'C')[0]?.C;
  p('<section><h2>Бюджет дороги</h2>');
  p('<p class="note">Сколько минут пути пересадка выдерживает целиком.'
    + (cond ? ` Замер снят в режиме <code>${esc(cond)}</code> — это один сэмпл`
      + ' одного режима, не «то самое число».' : '') + '</p>');
  if (budget.length === 0) {
    p('<p class="ok">Ни одна пересадка не упирается в дорогу.</p>');
  } else {
    p('<table class="slack">');
    for (const b of budget) {
      const used = chains(r).find((c) => c.day === b.d && c.who === b.p
        && c.a === b.e1 && c.b === b.e2);
      const spent = used ? b.max - used.m : null;
      p(`<tr class="${used && used.m <= 0 ? 'zero' : ''}">`
        + `<td>${esc(ru(b.d))}</td><td>${esc(ru(b.p))}</td>`
        + `<td>${esc(ru(b.e1))} → ${esc(ru(b.e2))}</td>`
        + `<td class="n">${spent === null ? '' : `${spent} из `}${b.max} мин</td></tr>`);
    }
    p('</table>');
  }
  p('</section>');

  p('<section><h2>Ограничения</h2><table class="cons">');
  for (const c of [...cons].sort((a, b) => (a.S < b.S ? 1 : a.S > b.S ? -1 : 0)
      || (a.C < b.C ? -1 : 1))) {
    p(`<tr class="${c.S === 'external' ? 'extl' : ''}"><td><code>${esc(c.C)}</code></td>`
      + `<td>${esc(ru(c.O))}</td><td>${c.S === 'external' ? 'ВНЕШНЕЕ' : 'наше'}</td></tr>`);
  }
  p('</table><p class="note">Внешнее — не решение, а ограничение: спорить с ним '
    + 'это другой разговор.</p></section>');
  p('</div>');

  const body = out.join('\n');
  const title = opts.title ?? `Сетка недели ${week}`;
  const head = `<title>${esc(title)}</title>\n${FONTS}\n<style>${CSS}</style>`;
  if (!opts.standalone) return `${head}\n${body}\n`;
  return `<!doctype html>\n<html lang="ru"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `${head}</head><body>${body}</body></html>\n`;
}

const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
  + 'family=Fira+Sans+Condensed:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500'
  + '&family=IBM+Plex+Sans:wght@400;500;600&display=swap">';

// EVERY COLOUR IS A TOKEN, and the two dark blocks redefine tokens only. A
// colour whose sole definition sits inside a media query never applies in the
// un-stamped state, which is the state most viewers are in.
const CSS = `
:root{
  --paper:#f4f6f4; --card:#fff; --ink:#14181a; --dim:#5e6a6e; --rule:#d2d8d5;
  --accent:#1e5f63; --alarm:#b22b1f; --alarm-bg:#fbeceb; --alarm-hatch:rgba(178,43,31,.14);
  --ok:#1f6b3d;
  --blk-s:60%; --blk-l:94%; --blk-edge:46%; --blk-rail:36%; --blk-ink:#16130e;
  --grid-h:640px;
  --disp:"Fira Sans Condensed","Helvetica Neue Condensed",Arial Narrow,sans-serif;
  --body:"IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --paper:#12161a; --card:#191e23; --ink:#e8ebe9; --dim:#8b979c; --rule:#2c353b;
  --accent:#4fa8ad; --alarm:#ff7060; --alarm-bg:#33191a; --alarm-hatch:rgba(255,112,96,.16);
  --ok:#5cc57f;
  --blk-s:26%; --blk-l:23%; --blk-edge:44%; --blk-rail:56%; --blk-ink:#eceae4;
}}
:root[data-theme="dark"]{
  --paper:#12161a; --card:#191e23; --ink:#e8ebe9; --dim:#8b979c; --rule:#2c353b;
  --accent:#4fa8ad; --alarm:#ff7060; --alarm-bg:#33191a; --alarm-hatch:rgba(255,112,96,.16);
  --ok:#5cc57f;
  --blk-s:26%; --blk-l:23%; --blk-edge:44%; --blk-rail:56%; --blk-ink:#eceae4;
}

*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:var(--body);
  margin:0;padding:26px 24px 52px;line-height:1.45;-webkit-text-size-adjust:100%}

/* ---- head ---- */
.top{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px 16px;
  border-bottom:2px solid var(--accent);padding-bottom:8px;margin-bottom:12px}
h1{font-family:var(--disp);font-size:1.75rem;font-weight:700;margin:0;
  letter-spacing:.005em;text-wrap:balance}
h1 .wk{font-family:var(--mono);font-size:.8rem;font-weight:400;color:var(--accent);
  margin-left:.6em;letter-spacing:.04em}
.sub{margin:0;color:var(--dim);font-size:.82rem;flex:1 1 260px}
.sub b{color:var(--alarm);font-weight:600}

.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0 0 14px;font-size:.76rem}
.chip{display:inline-flex;align-items:center;gap:6px}
.chip i{width:10px;height:14px;border-radius:2px;flex:0 0 auto;
  background:hsl(var(--h) var(--blk-s) var(--blk-l));
  border-left:3px solid hsl(var(--h) 42% var(--blk-rail));
  border-top:1px solid hsl(var(--h) 30% var(--blk-edge));
  border-right:1px solid hsl(var(--h) 30% var(--blk-edge));
  border-bottom:1px solid hsl(var(--h) 30% var(--blk-edge))}
.chip em{color:var(--dim);font-style:normal;font-size:.92em}
.hole-chip i{background:var(--alarm-bg);border:1.5px dashed var(--alarm)}

/* ---- the board ---- */
.grid{display:grid;grid-template-columns:3.4rem repeat(var(--days),minmax(0,1fr));
  gap:0 5px;margin-bottom:30px}
.gutter{position:relative;height:var(--grid-h);margin-top:23px}
.gutter .hr{position:absolute;right:8px;transform:translateY(-50%);
  font-family:var(--mono);font-size:.66rem;color:var(--dim);
  font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.day{min-width:0}
.dh{font-family:var(--disp);height:23px;font-size:.86rem;font-weight:600;
  text-align:center;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);
  border-bottom:1px solid var(--rule)}
.cells{position:relative;height:var(--grid-h);background:var(--card);
  border:1px solid var(--rule);border-top:0;overflow:hidden}
.rule{position:absolute;left:0;right:0;height:0;border-top:1px solid var(--rule)}
.b{position:absolute;overflow:hidden;padding:2px 5px;font-size:.66rem;line-height:1.28;
  background:hsl(var(--h) var(--blk-s) var(--blk-l));color:var(--blk-ink);
  border:1px solid hsl(var(--h) 30% var(--blk-edge));
  border-left:3px solid hsl(var(--h) 42% var(--blk-rail))}
.b b{display:block;font-family:var(--disp);font-weight:600;font-size:1.06em}
.b .w{display:block;opacity:.9}
.b .t{display:block;font-family:var(--mono);font-size:.58rem;opacity:.72;
  font-variant-numeric:tabular-nums}
.b .pl,.b .k{display:block;font-size:.6rem;opacity:.72}
.b.thin{padding:0 5px;line-height:1.05;font-size:.6rem}
.b.thin .t,.b.thin .pl,.b.thin .w{display:none}
.hole{position:absolute;left:0;right:0;z-index:5;
  background:var(--alarm-bg);border:1.5px dashed var(--alarm);
  background-image:repeating-linear-gradient(45deg,transparent,transparent 5px,
    var(--alarm-hatch) 5px,var(--alarm-hatch) 10px);
  color:var(--alarm);font-size:.66rem;text-align:center;padding-top:1px}
.hole b{display:block;font-family:var(--disp);font-weight:700;
  text-transform:uppercase;letter-spacing:.04em}
.hole span{font-family:var(--mono);font-size:.58rem;opacity:.9}

/* ---- panels ---- */
.panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));
  gap:26px;align-items:start}
section h2{font-family:var(--disp);font-size:1rem;font-weight:600;margin:0 0 9px;
  padding-bottom:4px;border-bottom:2px solid var(--accent);
  text-transform:uppercase;letter-spacing:.08em}
section h3{font-family:var(--disp);font-size:.86rem;margin:14px 0 5px;font-weight:600}
.ok{color:var(--ok);font-size:.82rem;margin:4px 0}
.hcard{margin-bottom:14px}
.hcard h3{color:var(--alarm);margin-top:0}
table{border-collapse:collapse;width:100%;font-size:.75rem}
td,th{padding:2px 8px 2px 0;text-align:left;vertical-align:top;font-weight:400}
th{font-weight:600;white-space:nowrap}
code{font-family:var(--mono);font-size:.9em;color:var(--dim)}
.extl{color:var(--alarm);font-weight:600}
.ours{color:var(--dim)}
.slack td{font-variant-numeric:tabular-nums}
.slack .n{text-align:right;font-family:var(--mono);white-space:nowrap}
.slack tr.zero td,.slack tr.bad td{color:var(--alarm);font-weight:600}
.cons tr.extl code{color:var(--alarm)}
.brk{color:var(--alarm);font-weight:600;font-size:.82rem;margin:2px 0 0}
.note{font-size:.73rem;color:var(--dim);margin:9px 0 0;max-width:52ch}

@media print{
  @page{size:A4 landscape;margin:8mm}
  :root{--paper:#fff;--card:#fff;--ink:#000;--dim:#3d4548;--rule:#9aa2a5;
        --accent:#12484b;--alarm:#961f16;--blk-s:52%;--blk-l:95%;
        --blk-edge:38%;--blk-rail:28%;--blk-ink:#000;--grid-h:452px}
  body{padding:0;font-size:9pt;print-color-adjust:exact;-webkit-print-color-adjust:exact}
  h1{font-size:14pt} .sub{font-size:8pt} .legend{font-size:7.6pt;margin-bottom:8px}
  .grid{margin-bottom:0;break-inside:avoid}
  .panels{break-before:page;grid-template-columns:1fr 1fr;gap:18px}
  .b{font-size:6.5pt} .b .t,.b .pl,.b .k{font-size:5.9pt}
  section{break-inside:avoid}
}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
`;
