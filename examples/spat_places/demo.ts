// demo.ts — SPAT, 2026-09-15 evening: a place is three facts of the family's
// book (group 18), a one-off block has no «every» to take off (19), a family
// rule may read its author's own book at the door (20), and the family's book
// extends the world — a fact on an edb relation is one more line of main,
// added, never overriding (21). A file of its own for the reason demolib.ts
// states — a demo has 120 s in scripts/goldens.ts and spat_edits is at 97 —
// on the same fixture through the same helpers.
//
//   node --experimental-strip-types examples/spat_places/demo.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Evaluation } from '../../src/engine.ts';
import { run as verb } from '../spat/edits.ts';
import { FROM, Group, HERE, ROOT, asRobin, count, fresh, inproc, spat, sql, type Res } from '../spat/demolib.ts';
import { chains } from '../spat/spat.ts';
import { BRIDGE, render } from '../spat/bridge.ts';

const idOf = (r: Res, re = /\((e_[0-9a-f]+)\)/): string => re.exec(r.out)?.[1] ?? '';
const at = (m: number): { SPAT_NOW: string } => ({ SPAT_NOW: `2026-08-31T21:${String(30 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}+03:00` });

// ------------------- 18. a place is three facts of the family's book
async function places(): Promise<Group> {
  const g = new Group('18. a place is three facts of the family\'s book — place add is sugar over rule add (place/ru_name/travel), the world takes them through bridge.rofl; an adult\'s verb, never a helper\'s');
  const root = fresh();   // hh is empty here: the fixture's hh.rofl is not loadable text (it holds rules)
  const rid = (r: Res): string => /(r_[0-9a-f]+)/.exec(r.out)?.[1] ?? '';
  // PLANTED (A1): the owner's line — «American Academy, это новое место» — with no atom: slugged, the name from the quotes
  const a = await spat(root, 'robin', ['place', 'add', 'American Academy'], at(0));
  g.code('robin: place add "American Academy"', a, 0);
  const A = rid(a);
  g.check('= rule add: «в мир семьи: place(american_academy)», «ru_name(american_academy, "American Academy")»; ответ называет следствие без дороги («ребёнка везти некому (no_way …)»); в clauses 2 факта под r_…, travel нет',
    /в мир семьи: place\(american_academy\)/.test(a.out) && /в мир семьи: ru_name\(american_academy, "American Academy"\)/.test(a.out) && /время дороги от дома не задано/.test(a.out) && /везти некому \(no_way/.test(a.out)
    && sql<{ head: string }[]>(root, 'SELECT head FROM clauses WHERE id = ?', A).map((x) => /"rel":"([a-z_]+)"/.exec(x.head)?.[1]).sort().join(',') === 'place,ru_name', a.out);
  const who = await spat(root, 'robin', ['whoami'], at(1));
  g.check('whoami: под «места (правила семьи):» — r_… american_academy «American Academy», дорога от дома не задана', new RegExp(`места \\(правила семьи\\):\n  ${A}  действует  american_academy «American Academy», дорога от дома не задана`).test(who.out), who.out);
  // PLANTED (A2): the block at the new place by its quoted name — the where resolves through the world AS IT STANDS; what the
  // model says is no_way, because school → academy has no travel (only home ↔ academy could, and even that was not given)
  const m = await spat(root, 'robin', ['edit', 'add math thu 15:00-16:30 kit "American Academy"'], at(2));
  const M = /confirm (e_[0-9a-f]+)/.exec(m.out)?.[1] ?? '';
  g.check('add math thu 15:00-16:30 kit "American Academy": место разобрано (не «мир такого не знает»), запись с american_academy; код 3 «ломает чт: no_way», «некому везти kit 15:00: школа → American Academy»',
    m.code === 3 && !/мир такого не знает/.test(m.out) && /ломает чт: no_way/.test(m.out) && /НЕКОМУ ВЕЗТИ чт 15:00 kit: школа → American Academy/.test(m.out)
    && sql<{ args: string }[]>(root, "SELECT args FROM facts WHERE pred = 'e_add' AND args LIKE ?", `%"${M}"%`).some((x) => /"american_academy"/.test(x.args)), m.out.split('\n').slice(0, 2).join(' | '));
  g.code('add … kit american_academy (по atom) — тоже разобрано', await spat(root, 'robin', ['edit', 'add math2 sat 10:00-11:00 kit american_academy'], at(3)), 3);
  // the same atom twice: refused at the sugar — a second travel row for one pair would be two_ways; the raw rule add is monotone and says «уже в мире»
  const twice = await spat(root, 'robin', ['place', 'add', 'academy', 'American Academy', '20'], at(4));
  g.check('тот же atom/название второй раз → 2 «место уже есть — правило r_…»: rule retract, потом place add', twice.code === 2 && new RegExp(`место american_academy уже есть — правило ${A} \\(robin, дорога не задана\\)`).test(twice.out) && /rule retract/.test(twice.out), twice.out);
  g.code('place add school "Школа" (место мира)', await spat(root, 'robin', ['место', 'добавить', 'school', 'Школа'], at(5)), 2);
  g.code('place add kit "Kit" (atom человека)', await spat(root, 'robin', ['place', 'add', 'kit', 'Kit'], at(6)), 2);
  const cyr = await spat(root, 'robin', ['place', 'add', 'Академия'], at(7));
  g.check('place add "Академия" без atom → 2, просит atom латиницей (модель ничего не транслитерирует)', cyr.code === 2 && /atom/.test(cyr.out) && /латиницей/.test(cyr.out), cyr.out.split('\n')[0]);
  g.code('place add gym2 20 (без названия)', await spat(root, 'robin', ['place', 'add', 'gym2', '20'], at(8)), 2);
  g.code('place add gym2 "Gym2" 20 от дома x (хвост)', await spat(root, 'robin', ['place', 'add', 'gym2', 'Gym2', '20', 'от', 'дома', 'x'], at(9)), 2);
  g.check('ни один отказ не записан: в clauses ровно 2 строки', sql<{ n: number }[]>(root, 'SELECT count(*) n FROM clauses')[0].n === 2);
  // PLANTED (A3): the nanny — the family's book is an adult's (rule add), and so is the sugar
  const nn = await spat(root, 'nanny', ['place', 'add', 'club', 'Club', '10'], at(10));
  g.check('няня: place add → 4 «правила семьи пишет взрослый или оператор»; clauses не выросли', nn.code === 4 && /взрослый или оператор/.test(nn.out) && sql<{ n: number }[]>(root, 'SELECT count(*) n FROM clauses')[0].n === 2, nn.out);
  // PLANTED (A4): with the minutes the journey is a number — the chain carries it: lunch ends 14:45, 20 to the gym, 15:00 is −5
  const gy = await spat(root, 'robin', ['place', 'add', 'gym', 'Gym', '20', 'от', 'дома'], at(11));
  const G = rid(gy);
  g.check('place add gym "Gym" 20 от дома → 0, «в мир семьи: travel(home, gym, 20)», и дверь: между gym и другим местом время не задано', gy.code === 0 && /в мир семьи: travel\(home, gym, 20\)/.test(gy.out) && /между gym и другим местом/.test(gy.out), gy.out);
  const y = await spat(root, 'robin', ['edit', 'add yoga thu 15:00-16:30 robin gym'], at(12));
  g.check('add yoga thu 15:00-16:30 robin gym: «ломает чт: … no_time», «НЕ УСПЕВАЕТ … обед → yoga -5 мин» — дорога в цепочке',
    y.code === 3 && /no_time/.test(y.out) && /НЕ УСПЕВАЕТ чт robin: обед → yoga  -5 мин/.test(y.out), y.out.split('\n').slice(0, 3).join(' | '));
  const y2 = await spat(root, 'robin', ['edit', 'add yoga thu 15:15-16:30 robin gym'], at(13));
  const Y2 = /confirm (e_[0-9a-f]+)/.exec(y2.out)?.[1] ?? '';
  g.check('15:15 — no_time нет, но on_foot_unknown: gym → бассейн без дороги (ровно то, что сказала дверь); после confirm цепочка обед → yoga с запасом 10 мин',
    y2.code === 3 && !/no_time/.test(y2.out) && /on_foot_unknown/.test(y2.out) && (await spat(root, 'robin', ['confirm', Y2], at(14))).code === 0
    && inproc(asRobin(root), (s) => { console.log(JSON.stringify(chains(s.r).find((c) => c.day === 'thu' && c.b === 'yoga'))); return 0; }).out.includes('"m":10'), y2.out.split('\n').slice(0, 2).join(' | '));
  const box = await spat(root, 'robin', ['edit', 'add box sat 15:00-16:30 kit gym'], at(15));
  g.code('add box sat 15:00-16:30 kit gym — с дорогой ребёнка везут, код 0', box, 0);
  g.check('show sat: box в Gym [правка e_…]; сходится', /15:00–16:30  box\s+Gym\s+\[правка/.test((await spat(root, 'robin', ['show', 'sat'], at(16))).out));
  // PLANTED (A5): rule retract of a place that has blocks: refused with the list; of an empty one: taken back, and the name is gone
  const held = await spat(root, 'robin', ['rule', 'retract', G], at(17));
  g.check(`rule retract ${G} (на gym box и yoga) → 2 с перечнем: «box (kit, сб) [правка e_…], yoga (robin, чт) [правка e_…]»`, held.code === 2 && /место держат блоки — box \(kit, сб\) \[правка e_[0-9a-f]+\], yoga \(robin, чт\) \[правка e_[0-9a-f]+\]/.test(held.out), held.out);
  g.code(`rule retract ${A} (american_academy; math — предложение, не держит)`, await spat(root, 'robin', ['rule', 'retract', A], at(18)), 0);
  const gone = inproc({ ...asRobin(root), ...at(19) }, (s) => verb(s, 'edit', ['add math3 sat 10:00-11:00 kit "American Academy"']));
  g.check('после отзыва «American Academy» — 2 «мир такого не знает»; whoami: места нет', gone.code === 2 && /мир такого не знает/.test(gone.out) && !/american_academy/.test((await spat(root, 'robin', ['whoami'], at(20))).out), gone.out.split('\n')[0]);
  g.code(`nanny rule retract ${G} (правило robin)`, await spat(root, 'nanny', ['rule', 'retract', G], at(21)), 4);
  return g;
}

// ------------------- 19. a one-off block has no «every» to take off
async function skipEvery(): Promise<Group> {
  const g = new Group('19. skip <added block> every <day> — a one-off of this week is not on any other week: code 2 with the take-back, not «отменён каждую неделю» (measured on 1a78e14: code 0 and the block stood)');
  const root = fresh();
  const a = await spat(root, 'robin', ['edit', 'add chess mon 16:00-17:00 kit home'], at(0));
  const A = idOf(a);
  const n0 = count(root, 'p_robin');
  const sk = await spat(root, 'robin', ['edit', 'skip chess every mon'], at(1));
  g.check(`add chess mon, skip chess every mon → 2 «разовая правка этой недели (пн [правка ${A}]) … отзыв: skip chess <день>»; книга не выросла; chess стоит`,
    a.code === 0 && sk.code === 2 && new RegExp(`chess — разовая правка этой недели \\(пн \\[правка ${A}\\]\\)`).test(sk.out) && /отзыв: skip chess <день>/.test(sk.out)
    && count(root, 'p_robin') === n0 && /chess/.test((await spat(root, 'robin', ['show', 'mon'], at(2))).out), sk.out);
  g.code('skip greek every tue (повторяемая строка фикстуры) — как было, 0', await spat(root, 'robin', ['edit', 'skip greek every tue'], at(3)), 0);
  g.code('skip walk every mon (типовой блок мира) — как было, 0', await spat(root, 'robin', ['edit', 'skip walk every mon'], at(4)), 0);
  const back = await spat(root, 'robin', ['edit', 'skip chess mon'], at(5));
  g.check(`skip chess mon — отзыв «отозвана ${A} (chess пн)», show mon без chess`, back.code === 0 && new RegExp(`отозвана ${A} \\(chess пн\\)`).test(back.out) && !/chess/.test((await spat(root, 'robin', ['show', 'mon'], at(6))).out), back.out);
  return g;
}

// ------------------- 20. a family rule may read its author's own book at the door
async function ownBook(): Promise<Group> {
  const g = new Group('20. rule add reading the author\'s own book — the trial declares imports(hh, p_<author>) for the candidate (measured on 1a78e14: leak[audit] for a first rule); another member\'s book is still 2');
  const root = fresh();   // hh is empty here: robin has no rule in force, so the loader declares no imports for her
  const r = await spat(root, 'robin', ['rule', 'add', 'warn[hh](mine, "моя отмена", D) :- e_skip[p_robin](E, B, D), day(D, N).'], at(0));
  g.check('robin (первое правило): тело читает e_skip[p_robin] → 0, «warn[hh]: 2 строк: … mon · … sat» — e_skipwalk пн, e_skipclean сб; e_skipwalkall (all) не день',
    r.code === 0 && /warn\[hh\]: 2 строк: warn\[hh\]\(mine, "моя отмена", mon\) · warn\[hh\]\(mine, "моя отмена", sat\)/.test(r.out), r.out);
  g.check('show mon: «!! mine: моя отмена (пн, правило семьи)» — правило в силе, чтение своей книги при загрузке без leak', /!! mine: моя отмена\s+\(пн, правило семьи\)/.test((await spat(root, 'robin', ['show', 'mon'], at(1))).out));
  const foreign = await spat(root, 'alex', ['rule', 'add', 'warn[hh](x, "y", D) :- e_skip[p_robin](E, B, D), day(D, N).'], at(2));
  g.check('alex: тело читает [p_robin] → 2 «читает только main, hh и свою книгу p_alex» (положительный контроль)', foreign.code === 2 && /читает только main, hh и свою книгу p_alex/.test(foreign.out), foreign.out);
  g.check('в clauses одно правило', sql<{ n: number }[]>(root, 'SELECT count(*) n FROM clauses')[0].n === 1);
  return g;
}

// ------------------- 21. the family's book extends the world
async function extendsWorld(): Promise<Group> {
  const g = new Group('21. the family\'s book extends the world — a fact on an edb relation (spat.rofl §14, bridge.rofl) is one more line of main: added, never overriding, withheld where it is not the book\'s to say; the grammar reads the world as it stands');
  const root = fresh();
  // PLANTED (E1): the stand, v4 sandbox — the three facts were accepted (0) and «мир такого не знает» stood. Now the world has the place.
  const r1 = await spat(root, 'robin', ['rule', 'add', 'place(american_academy). ru_name(american_academy, "American Academy"). travel(home, american_academy, 15).'], at(0));
  g.check('rule add place/ru_name/travel → 0, «в мир семьи: …» ×3 (не «в точках расширения не даёт ничего»)', r1.code === 0 && (r1.out.match(/в мир семьи: /g) ?? []).length === 3 && !/не даёт ничего/.test(r1.out), r1.out);
  const e1 = await spat(root, 'robin', ['edit', 'add math every thu 15:00-16:30 kit american_academy'], at(1));
  g.check('add math every thu 15:00-16:30 kit american_academy: был 2 «мир такого не знает» — теперь 3: место известно, «ломает чт: no_way» (школа → academy без дороги)', e1.code === 3 && !/мир такого не знает/.test(e1.out) && /ломает чт: no_way/.test(e1.out), e1.out.split('\n').slice(0, 2).join(' | '));
  // any pair is one more line: the drive from school, and the same block is 0
  const r2 = await spat(root, 'robin', ['rule', 'add', 'travel(school, american_academy, 10).'], at(2));
  const e2 = await spat(root, 'robin', ['edit', 'add math every thu 15:00-16:30 kit american_academy'], at(3));
  g.check('rule add travel(school, american_academy, 10) → 0; та же правка → 0, каждую неделю', r2.code === 0 && e2.code === 0 && /каждую неделю/.test(e2.out), `${r2.out} | ${e2.out}`);
  g.check('show thu: math в American Academy [правка e_…], kit везут', /math\s+American Academy\s+\[правка/.test((await spat(root, 'robin', ['show', 'thu'], at(4))).out));
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
  g.check('unstratified/leak/undefined_premise: мир с мостом грузится чисто (leak 0, undefined_premise 0, demand-backed 0)', inproc(asRobin(root), (s) => { console.log(`${s.r.query('leak[audit](A, B)').rows.length} ${s.r.query('undefined_premise[audit](R, Rel)').rows.length} ${new Evaluation(s.r.store, {}).rules.filter((x) => !x.safe).length}`); return 0; }).out === '0 0 0');
  return g;
}

const t0 = Date.now();
const todo = [places, skipEvery, ownBook, extendsWorld];
const groups: Group[] = new Array(todo.length);
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => { while (next < todo.length) { const i = next++; groups[i] = await todo[i](); } }));
for (const g of groups) for (const l of g.lines) console.log(l);
const n = groups.reduce((a, g) => a + g.n, 0);
const fails = groups.reduce((a, g) => a + g.fails, 0);
console.log(`\n${n - fails}/${n} scenarios`);
console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(fails === 0 ? 0 : 1);
