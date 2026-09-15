// demo.ts — SPAT, 2026-09-15 evening: a place of the world is a line a book
// added (group 18). A file of its own for the reason demolib.ts states — a
// demo has 120 s in scripts/goldens.ts and spat_edits is at 97 — on the same
// fixture through the same helpers.
//
//   node --experimental-strip-types examples/spat_places/demo.ts

import * as fs from 'node:fs';
import { run as verb } from '../spat/edits.ts';
import { FROM, Group, ROOT, asRobin, count, fresh, inproc, spat, sql, type Res } from '../spat/demolib.ts';
import { chains, table } from '../spat/spat.ts';

const idOf = (r: Res, re = /\((e_[0-9a-f]+)\)/): string => re.exec(r.out)?.[1] ?? '';
const at = (m: number): { SPAT_NOW: string } => ({ SPAT_NOW: `2026-08-31T21:${String(30 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}+03:00` });

// ------------------- 18. a place is a line of the world a book added
async function places(): Promise<Group> {
  const g = new Group('18. a place is a line of the world a book added — place add writes e_place/e_travel, the rules derive place/ru_name/travel from what acts; an adult\'s, never a helper\'s');
  const root = fresh();
  // the fixture: robin's gym (20 from home) is a place, the nanny's spa (no right) and alex's lake (retracted) are not
  const fx = inproc(asRobin(root), (s) => {
    const pl = table(s.r, 'place', 'P').map((x) => x.P);
    console.log(`${pl.includes('gym')} ${pl.includes('spa')} ${pl.includes('lake')} ${s.r.holds('no_right(e_nannyplace)')} ${s.r.holds('retracted_edit(e_lake)')} ${table(s.r, 'travel', 'A, B, M').some((x) => x.A === 'home' && x.B === 'gym' && x.M === '20')} ${table(s.r, 'ru_name', 'A, N').some((x) => x.A === 'gym' && x.N === '"Gym"')}`);
    return 0;
  });
  g.check('фикстура: gym — место (travel home→gym 20, ru_name "Gym"); spa няни — без права, не место; lake alex — отозвано, не место', fx.out === 'true false false true true true true', fx.out);
  // PLANTED (A1): the owner's line — «American Academy, это новое место» — with no atom: slugged, the name from the quotes
  const a = await spat(root, 'robin', ['place', 'add', 'American Academy'], at(0));
  g.code('robin: place add "American Academy"', a, 0);
  const A = idOf(a);
  g.check('atom american_academy выведен из названия; ответ называет следствие без дороги: «ребёнка везти некому (no_way …)»; в книге e_place + edit_at/edit_via/for_week, без e_travel',
    /место american_academy \(«American Academy»\) добавлено/.test(a.out) && /время дороги от дома не задано/.test(a.out) && /везти некому \(no_way/.test(a.out)
    && sql<{ pred: string }[]>(root, "SELECT pred FROM facts WHERE ledger = 'p_robin' AND args LIKE ? ORDER BY seq", `%"${A}"%`).map((x) => x.pred).join(',') === 'e_place,edit_at,edit_via,for_week', a.out);
  const who = await spat(root, 'robin', ['whoami'], at(1));
  g.check('whoami: под «места:» — american_academy «American Academy», дорога от дома не задана; не среди недельных правок', /места:\n  e_[0-9a-f]+  действует  american_academy «American Academy», дорога от дома не задана/.test(who.out) && !new RegExp(`${A}[^]*повторяемые`).test(who.out), who.out);
  // PLANTED (A2): the block at the new place by its quoted name — the where resolves; what the model says is no_way,
  // because school → academy has no travel (only home ↔ academy could, and even that was not given)
  const m = await spat(root, 'robin', ['edit', 'add math thu 15:00-16:30 kit "American Academy"'], at(2));
  const M = /confirm (e_[0-9a-f]+)/.exec(m.out)?.[1] ?? '';
  g.check('add math thu 15:00-16:30 kit "American Academy": место разобрано (не «мир такого не знает»), запись с american_academy; код 3 «ломает чт: no_way», «некому везти kit 15:00: школа → American Academy»',
    m.code === 3 && !/мир такого не знает/.test(m.out) && /ломает чт: no_way/.test(m.out) && /НЕКОМУ ВЕЗТИ чт 15:00 kit: школа → American Academy/.test(m.out)
    && sql<{ args: string }[]>(root, "SELECT args FROM facts WHERE pred = 'e_add' AND args LIKE ?", `%"${M}"%`).some((x) => /"american_academy"/.test(x.args)), m.out.split('\n').slice(0, 2).join(' | '));
  g.code('add … kit american_academy (по atom) — тоже разобрано', await spat(root, 'robin', ['edit', 'add math2 sat 10:00-11:00 kit american_academy'], at(3)), 3);
  // the same atom twice: refused — a second row would give the pair two travel figures (two_ways), which the model names but cannot choose between
  const twice = await spat(root, 'robin', ['place', 'add', 'academy', 'American Academy', '20'], at(4));
  g.check('тот же atom/название второй раз → 2 «место уже есть — правка e_…»: retract, потом place add', twice.code === 2 && new RegExp(`место american_academy уже есть — правка ${A} \\(robin, дорога не задана\\)`).test(twice.out) && /retract/.test(twice.out), twice.out);
  g.code('place add school "Школа" (место мира)', await spat(root, 'robin', ['место', 'добавить', 'school', 'Школа'], at(5)), 2);
  g.code('place add kit "Kit" (atom человека)', await spat(root, 'robin', ['place', 'add', 'kit', 'Kit'], at(6)), 2);
  const cyr = await spat(root, 'robin', ['place', 'add', 'Академия'], at(7));
  g.check('place add "Академия" без atom → 2, просит atom латиницей (модель ничего не транслитерирует)', cyr.code === 2 && /atom/.test(cyr.out) && /латиницей/.test(cyr.out), cyr.out.split('\n')[0]);
  g.code('place add gym2 20 (без названия)', await spat(root, 'robin', ['place', 'add', 'gym2', '20'], at(8)), 2);
  g.code('place add gym2 "Gym2" 20 от дома x (хвост)', await spat(root, 'robin', ['place', 'add', 'gym2', 'Gym2', '20', 'от', 'дома', 'x'], at(9)), 2);
  g.check('ни один отказ не записан: в p_robin ровно две записи e_place (gym фикстуры и academy)', sql<{ n: number }[]>(root, "SELECT count(*) n FROM facts WHERE ledger = 'p_robin' AND pred = 'e_place'")[0].n === 2 /* fixture gym + academy */, String(count(root, 'p_robin')));
  // PLANTED (A3): the nanny — a place is the household's; her row would never act (the fixture's spa), and the door is code 4
  const nn = await spat(root, 'nanny', ['place', 'add', 'club', 'Club', '10'], at(10));
  g.check('няня: place add → 4 «место добавляет взрослый»; может: alex, robin; в её книге ничего', nn.code === 4 && /может: alex, robin/.test(nn.out) && sql<{ n: number }[]>(root, "SELECT count(*) n FROM facts WHERE ledger = 'p_nanny' AND pred = 'e_place'")[0].n === 1, nn.out);
  g.code('add x mon 16:00-17:00 kit spa (место няни, без права — мир его не знает)', inproc({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.alex }, (s) => verb(s, 'edit', ['add x mon 16:00-17:00 kit spa'])), 2);
  // PLANTED (A4): with the minutes the journey is a number — the chain carries it: lunch ends 14:45, 20 to the gym, 15:00 is −5
  const y = await spat(root, 'robin', ['edit', 'add yoga thu 15:00-16:30 robin gym'], at(11));
  g.check('add yoga thu 15:00-16:30 robin gym (20 от дома): «ломает чт: … no_time», «НЕ УСПЕВАЕТ … обед → yoga, -5 мин» — дорога в цепочке',
    y.code === 3 && /no_time/.test(y.out) && /НЕ УСПЕВАЕТ чт robin: обед → yoga  -5 мин/.test(y.out), y.out.split('\n').slice(0, 3).join(' | '));
  const y2 = await spat(root, 'robin', ['edit', 'add yoga thu 15:15-16:30 robin gym'], at(12));
  const Y2 = /confirm (e_[0-9a-f]+)/.exec(y2.out)?.[1] ?? '';
  g.check('15:15 — no_time нет, но on_foot_unknown: gym → бассейн без дороги (ровно то, что сказала дверь); после confirm цепочка обед → yoga с запасом 10 мин',
    y2.code === 3 && !/no_time/.test(y2.out) && /on_foot_unknown/.test(y2.out) && (await spat(root, 'robin', ['confirm', Y2], at(13))).code === 0
    && inproc(asRobin(root), (s) => { console.log(JSON.stringify(chains(s.r).find((c) => c.day === 'thu' && c.b === 'yoga'))); return 0; }).out.includes('"m":10'), y2.out.split('\n').slice(0, 2).join(' | '));
  const box = await spat(root, 'robin', ['edit', 'add box sat 15:00-16:30 kit gym'], at(14));
  g.code('add box sat 15:00-16:30 kit gym — с дорогой ребёнка везут, код 0', box, 0);
  g.check('show sat: box в Gym [правка e_…]; сходится', /15:00–16:30  box\s+Gym\s+\[правка/.test((await spat(root, 'robin', ['show', 'sat'], at(15))).out));
  // PLANTED (A5): retract of a place that has blocks: refused with the list; of an empty one: taken back, and the name is gone
  const held = await spat(root, 'robin', ['retract', 'e_gym'], at(16));
  g.check('retract e_gym (на нём box и yoga) → 2 с перечнем: «box (kit, сб) [правка e_…], yoga (robin, чт) [правка e_…]»', held.code === 2 && /место держат блоки — box \(kit, сб\) \[правка e_[0-9a-f]+\], yoga \(robin, чт\) \[правка e_[0-9a-f]+\]/.test(held.out), held.out);
  g.code(`retract ${A} (american_academy; math — предложение, не держит)`, await spat(root, 'robin', ['retract', A], at(17)), 0);
  const gone = inproc({ ...asRobin(root), ...at(18) }, (s) => verb(s, 'edit', ['add math3 sat 10:00-11:00 kit "American Academy"']));
  g.check('после отзыва «American Academy» — 2 «мир такого не знает»; whoami: место отозвано', gone.code === 2 && /мир такого не знает/.test(gone.out) && new RegExp(`${A}  отозвана  american_academy`).test((await spat(root, 'robin', ['whoami'], at(19))).out), gone.out.split('\n')[0]);
  g.code('alex retract e_gym (правка robin)', await spat(root, 'alex', ['retract', 'e_gym'], at(20)), 4);
  return g;
}

const t0 = Date.now();
const todo = [places];
const groups: Group[] = new Array(todo.length);
let next = 0;
await Promise.all(Array.from({ length: 1 }, async () => { while (next < todo.length) { const i = next++; groups[i] = await todo[i](); } }));
for (const g of groups) for (const l of g.lines) console.log(l);
const n = groups.reduce((a, g) => a + g.n, 0);
const fails = groups.reduce((a, g) => a + g.fails, 0);
console.log(`\n${n - fails}/${n} scenarios`);
console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(fails === 0 ? 0 : 1);
