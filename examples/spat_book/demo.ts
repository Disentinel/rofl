// demo.ts — SPAT, 2026-09-15 late: the family's book extends the world — a
// fact of [hh] on an edb relation is one more line of main, added, never
// overriding, withheld where it is not the book's to say; the grammar reads
// the world as it stands (group 21). A file of its own so that spat_places
// stays under the 120 s a demo has in scripts/goldens.ts on a loaded machine
// (measured: 42 scenarios in one file were 124 s at load 10); the same
// fixture through the same helpers (examples/spat/demolib.ts).
//
//   node --experimental-strip-types examples/spat_book/demo.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Evaluation } from '../../src/engine.ts';
import { FROM, Group, HERE, ROOT, asRobin, fresh, inproc, spat } from '../spat/demolib.ts';
import { BRIDGE, render } from '../spat/bridge.ts';

const at = (m: number): { SPAT_NOW: string } => ({ SPAT_NOW: `2026-08-31T21:${String(30 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}+03:00` });

// ------------------- 21. the family's book extends the world
async function extendsWorld(): Promise<Group> {
  const g = new Group('21. the family\'s book extends the world — a fact on an edb relation (spat.rofl §14, bridge.rofl) is one more line of main: added, never overriding, withheld where it is not the book\'s to say; the grammar reads the world as it stands');
  const root = fresh();
  // PLANTED (E1): the stand, v4 sandbox — the three facts were accepted (0) and «мир такого не знает» stood. Now the world has the place.
  const r1 = await spat(root, 'robin', ['rule', 'add', 'place(american_academy). ru_name(american_academy, "American Academy"). travel(home, american_academy, 15).'], at(0));
  g.check('rule add place/ru_name/travel → 0, «в мир семьи: …» ×3 (не «в точках расширения не даёт ничего»)', r1.code === 0 && (r1.out.match(/в мир семьи: /g) ?? []).length === 3 && !/не даёт ничего/.test(r1.out), r1.out);
  const e1 = await spat(root, 'robin', ['edit', 'add math every thu 15:00-16:30 kit american_academy'], at(1));
  // since S3c the fixture's e_kitthu (alex takes kit from school at 14:00) answers the school → academy hop, and home ↔ academy has
  // its road: nothing breaks; the no-road case stands on Saturday below (zoo)
  g.check('add math every thu 15:00-16:30 kit american_academy: был 2 «мир такого не знает» — теперь применено (0), место известно; хоп школа → academy отвечен e_kitthu, «ломает» нет', e1.code === 0 && !/мир такого не знает/.test(e1.out) && !/ломает/.test(e1.out), e1.out.split('\n').slice(0, 2).join(' | '));
  // any pair is one more line: the drive from school, and the same block is 0
  const r2 = await spat(root, 'robin', ['rule', 'add', 'travel(school, american_academy, 10).'], at(2));
  const e2 = await spat(root, 'robin', ['edit', 'add math every thu 15:00-16:30 kit american_academy'], at(3));
  g.check('rule add travel(school, american_academy, 10) → 0; та же правка → 0, каждую неделю', r2.code === 0 && e2.code === 0 && /каждую неделю/.test(e2.out), `${r2.out} | ${e2.out}`);
  g.check('show thu: math в American Academy [правка e_…], kit везут', /math\s+American Academy\s+\[правка/.test((await spat(root, 'robin', ['show', 'thu'], at(4))).out));
  // PLANTED (E1b): the lead's line — a place with a Russian name and no road, then a block there by atom and by the name
  const zoo = await spat(root, 'robin', ['rule', 'add', 'place(zoo). ru_name(zoo, "Зоопарк").'], at(20));
  g.check('rule add place(zoo). ru_name(zoo, "Зоопарк") → 0, «в мир семьи: place(zoo) «Зоопарк»» и «дороги от дома нет: … задать: rule add \'travel(home, zoo, <минут>).\'»', zoo.code === 0 && /в мир семьи: place\(zoo\) «Зоопарк»/.test(zoo.out) && /дороги от дома нет: .*rule add 'travel\(home, zoo, <минут>\)\.'/.test(zoo.out), zoo.out);
  const zk = await spat(root, 'robin', ['edit', 'add trip sat 10:00-12:00 kit zoo'], at(21));
  const za = await spat(root, 'robin', ['edit', 'add trip sun 10:00-12:00 alex zoo'], at(22));
  const zq = await spat(root, 'robin', ['edit', 'add trip sun 13:00-14:00 alex "Зоопарк"'], at(23));
  g.check('add trip sat 10:00-12:00 kit zoo: был 2 «мир такого не знает» — теперь применено, «ломает сб: no_way» (дороги нет, ребёнка везти некому); add trip sun … alex zoo → 0; alex "Зоопарк" (по ru_name) → 0',
    zk.code === 0 && !/мир такого не знает/.test(zk.out) && /ломает сб: no_way/.test(zk.out) && za.code === 0 && zq.code === 0, `${zk.out.split('\n').slice(0, 2).join(' | ')} || ${za.out} || ${zq.out}`);
  // PLANTED (E2): the principle — a fact of the book does not override the world's; what it may not say is withheld with the reason
  const r3 = await spat(root, 'alex', ['rule', 'add', 'travel(home, school, 5). person(uncle, adult). person(aunt, helper). person(cousin, visitor). work_needed(nanny, 300). constraint(e_skipwalk, nanny, external). needs(x, y). person(nico, child). want(x, alex, home, 60).'], at(5));
  g.check('rule add девяти фактов → 0; ответ по каждому: travel(home, school, 5) НЕ ДЕЙСТВУЕТ (мир задаёт 20); uncle/aunt — учётная запись; cousin — в мир; nanny — за помощника не говорит; constraint(e_skipwalk…) — правка; needs — не edb; nico — уже в мире; want — переключатель',
    r3.code === 0 && /travel\(home, school, 5\) — НЕ ДЕЙСТВУЕТ: мир уже задаёт travel\(home, school, 20\)/.test(r3.out) && /person\(uncle, adult\) — книга семьи не заводит: adult — учётная запись/.test(r3.out)
    && /person\(aunt, helper\) — книга семьи не заводит: helper — учётная запись/.test(r3.out) && /в мир семьи: person\(cousin, visitor\)/.test(r3.out) && /work_needed\(nanny, 300\) — книга семьи не заводит: за помощника \(няня\)/.test(r3.out)
    && /constraint\(e_skipwalk, nanny, external\) — книга семьи не заводит: e_skipwalk — правка/.test(r3.out) && /needs\(x, y\) — факт правил семьи, миру не виден/.test(r3.out) && /person\(nico, child\) — уже в мире/.test(r3.out) && /want\(x, alex, home, 60\) — миру не передаётся: переключатель/.test(r3.out), r3.out);
  const w = inproc({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.alex }, (s) => { console.log(`${s.r.query('travel(home, school, M)').rows.map((x) => x.bindings.M).join(',')} ${s.r.holds('person(uncle, adult)')} ${s.r.holds('person(cousin, visitor)')} ${s.r.holds('may_edit(nanny, e_skipwalk)')} ${s.r.query('overrides[audit](R, K)').rows.map((x) => x.text).join(';')} ${s.r.query('withheld[audit](R, K)').rows.length}`); return 0; });
  g.check('мир (alex): travel(home, school) = 20 и только; uncle не взрослый; cousin — person; may_edit(nanny, e_skipwalk) нет; overrides = travel k(home,school); withheld 4',
    w.out === '20 false true false K = k(home,school), R = travel 4', w.out);
  const u = await spat(root, 'uncle', ['whoami'], at(6));
  g.check('uncle (гость по users): по-прежнему «книги мне открыты: ни одной», роли guest — правило семьи его не сделало взрослым', u.code === 0 && /\(guest\)/.test(u.out) && /книги мне открыты: ни одной/.test(u.out), u.out.split('\n').slice(0, 2).join(' | '));
  // PLANTED (E3): the generator is what the file says, and refuses an edb relation nobody decided
  const spatText = fs.readFileSync(path.join(HERE, 'spat.rofl'), 'utf8');
  let planted = '';
  try { render(spatText.replace('key_of(travel, 2).', '')); } catch (e) { planted = (e as Error).message; }
  g.check('bridge.rofl = render(): файл не устарел; без key_of(travel) генератор останавливается («edb(travel) has neither key_of nor not_extended»)', render() === fs.readFileSync(BRIDGE, 'utf8') && /edb\(travel\) has neither key_of nor not_extended/.test(planted), planted);
  // PLANTED (E4, the lead's P1 on 7c20d85): a family-book current() was «НЕ ДЕЙСТВУЕТ» by the rules and the week in force for
  // everyone by the host, which read `current` (and `rolled`) off the store's raw keys of every book — [hh] sorts before [main]
  const wk = await spat(root, 'alex', ['rule', 'add', 'current(w0907). rolled(w0999, "2026-09-09T00:00:00+03:00"). week(w0999).'], at(7));
  const wr = await spat(root, 'robin', ['whoami'], at(8)); const wm = await spat(root, 'me', ['whoami'], at(9)); const ws = await spat(root, 'robin', ['show', 'mon'], at(10));
  g.check('rule add current(w0907)/rolled(w0999)/week(w0999) → 0: current НЕ ДЕЙСТВУЕТ, rolled не edb, week — неделю заводит оператор; whoami robin/me и show mon — по-прежнему w0831; --week-of w0999 и roll w0999 → 2',
    wk.code === 0 && /current\(w0907\) — НЕ ДЕЙСТВУЕТ: мир уже задаёт current\(w0831\)/.test(wk.out) && /rolled\(w0999, .*\) — факт правил семьи, миру не виден/.test(wk.out) && /week\(w0999\) — миру не передаётся: неделю заводит оператор/.test(wk.out)
    && /неделя w0831/.test(wr.out) && /неделя w0831/.test(wm.out) && /^пн 2026-08-31 \(неделя w0831\)/.test(ws.out)
    && (await spat(root, 'robin', ['show', 'mon', '--week-of', 'w0999'], at(11))).code === 2 && (await spat(root, 'alex', ['roll', 'w0999'], at(12))).code === 2, `${wk.out} | ${wr.out.split('\n')[0]} | ${wm.out.split('\n')[0]} | ${ws.out.split('\n')[0]}`);
  g.check('unstratified/leak/undefined_premise: мир с мостом грузится чисто (leak 0, undefined_premise 0, demand-backed 0)', inproc(asRobin(root), (s) => { console.log(`${s.r.query('leak[audit](A, B)').rows.length} ${s.r.query('undefined_premise[audit](R, Rel)').rows.length} ${new Evaluation(s.r.store, {}).rules.filter((x) => !x.safe).length}`); return 0; }).out === '0 0 0');
  return g;
}

const t0 = Date.now();
const g = await extendsWorld();
for (const l of g.lines) console.log(l);
console.log(`\n${g.n - g.fails}/${g.n} scenarios`);
console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(g.fails === 0 ? 0 : 1);
