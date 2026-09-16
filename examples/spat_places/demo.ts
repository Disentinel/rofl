// demo.ts — SPAT, 2026-09-15 evening: a place is three facts of the family's
// book (group 18), a one-off block has no «every» to take off (19), and a
// family rule may read its author's own book at the door (20). The book
// extending the world is examples/spat_book/demo.ts (21). A file of its own
// for the reason demolib.ts states — a demo has 120 s in scripts/goldens.ts
// and spat_edits is at 97 — on the same fixture through the same helpers.
//
//   node --experimental-strip-types examples/spat_places/demo.ts

import * as fs from 'node:fs';
import { run as verb } from '../spat/edits.ts';
import { FROM, Group, ROOT, asRobin, count, fresh, inproc, spat, sql, type Res } from '../spat/demolib.ts';
import { chains } from '../spat/spat.ts';

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
  g.check('= rule add: «в мир семьи: place(american_academy) «American Academy»», «ru_name(…)»; ответ называет следствие без дороги («дороги от дома нет: ребёнка везти туда некому (no_way …)»); в clauses 2 факта под r_…, travel нет',
    /в мир семьи: place\(american_academy\) «American Academy»/.test(a.out) && /в мир семьи: ru_name\(american_academy, "American Academy"\)/.test(a.out) && /дороги от дома нет: ребёнка везти туда некому \(no_way/.test(a.out)
    && sql<{ head: string }[]>(root, 'SELECT head FROM clauses WHERE id = ?', A).map((x) => /"rel":"([a-z_]+)"/.exec(x.head)?.[1]).sort().join(',') === 'place,ru_name', a.out);
  const who = await spat(root, 'robin', ['whoami'], at(1));
  g.check('whoami: под «места (правила семьи):» — r_… american_academy «American Academy», дорога от дома не задана', new RegExp(`места \\(правила семьи\\):\n  ${A}  действует  american_academy «American Academy», дорога от дома не задана`).test(who.out), who.out);
  // PLANTED (A2): the block at the new place by its quoted name — the where resolves through the world AS IT STANDS; what the
  // model says is no_way, because the academy has no travel: the fixture's e_kitthu (alex takes kit from school at 14:00)
  // answers the hop there, and the way back home at 16:30 is the leg nobody can make
  const m = await spat(root, 'robin', ['edit', 'add math thu 15:00-16:30 kit "American Academy"'], at(2));
  const M = idOf(m);
  g.check('add math thu 15:00-16:30 kit "American Academy": место разобрано (не «мир такого не знает»), запись с american_academy; применено (16.09), «ломает чт: no_way», «некому везти kit 16:30: American Academy → дом»',
    m.code === 0 && !/мир такого не знает/.test(m.out) && /ломает чт: no_way/.test(m.out) && /НЕКОМУ ВЕЗТИ чт 16:30 kit: American Academy → дом/.test(m.out)
    && sql<{ args: string }[]>(root, "SELECT args FROM facts WHERE pred = 'e_add' AND args LIKE ?", `%"${M}"%`).some((x) => /"american_academy"/.test(x.args)), m.out.split('\n').slice(0, 2).join(' | '));
  const m2 = await spat(root, 'robin', ['edit', 'add math2 sat 10:00-11:00 kit american_academy'], at(3));
  g.code('add … kit american_academy (по atom) — тоже разобрано', m2, 0);
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
  g.check('add yoga thu 15:00-16:30 robin gym: применено, «ломает чт: … no_time», «НЕ УСПЕВАЕТ … обед → yoga -5 мин» — дорога в цепочке',
    y.code === 0 && /no_time/.test(y.out) && /НЕ УСПЕВАЕТ чт robin: обед → yoga  -5 мин/.test(y.out), y.out.split('\n').slice(0, 3).join(' | '));
  g.code('retract yoga 15:00', await spat(root, 'robin', ['retract', idOf(y)], at(13)), 0);
  const y2 = await spat(root, 'robin', ['edit', 'add yoga thu 15:15-16:30 robin gym'], at(14));
  g.check('15:15 — no_time нет, но on_foot_unknown: gym → бассейн без дороги (ровно то, что сказала дверь); цепочка обед → yoga с запасом 10 мин',
    y2.code === 0 && !/no_time/.test(y2.out) && /on_foot_unknown/.test(y2.out)
    && inproc(asRobin(root), (s) => { console.log(JSON.stringify(chains(s.r).find((c) => c.day === 'thu' && c.b === 'yoga'))); return 0; }).out.includes('"m":10'), y2.out.split('\n').slice(0, 2).join(' | '));
  const box = await spat(root, 'robin', ['edit', 'add box sat 15:00-16:30 kit gym'], at(15));
  g.code('add box sat 15:00-16:30 kit gym — с дорогой ребёнка везут, код 0', box, 0);
  g.check('show sat: box в Gym [правка e_…]; сходится', /15:00–16:30  box\s+Gym\s+\[правка/.test((await spat(root, 'robin', ['show', 'sat'], at(16))).out));
  // PLANTED (A5): rule retract of a place that has blocks: refused with the list; of an empty one: taken back, and the name is gone
  const held = await spat(root, 'robin', ['rule', 'retract', G], at(17));
  g.check(`rule retract ${G} (на gym box и yoga) → 2 с перечнем: «box (kit, сб) [правка e_…], yoga (robin, чт) [правка e_…]»`, held.code === 2 && /место держат блоки — box \(kit, сб\) \[правка e_[0-9a-f]+\], yoga \(robin, чт\) \[правка e_[0-9a-f]+\]/.test(held.out), held.out);
  // math and math2 ACT since 16.09 (no proposal to wait in): the place is held until they are taken back
  const heldA = await spat(root, 'robin', ['rule', 'retract', A], at(18));
  g.check(`rule retract ${A} пока math/math2 стоят → 2 с перечнем`, heldA.code === 2 && /место держат блоки — math \(kit, чт\)/.test(heldA.out), heldA.out);
  const rm = [(await spat(root, 'robin', ['retract', M], at(22))).code, (await spat(root, 'robin', ['retract', idOf(m2)], at(23))).code, (await spat(root, 'robin', ['rule', 'retract', A], at(24))).code];
  g.check(`retract math, math2 → 0, 0; затем rule retract ${A} → 0 (место без блоков)`, rm.join(',') === '0,0,0', rm.join(','));
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

const t0 = Date.now();
const todo = [places, skipEvery, ownBook];
const groups: Group[] = new Array(todo.length);
let next = 0;
await Promise.all(Array.from({ length: 3 }, async () => { while (next < todo.length) { const i = next++; groups[i] = await todo[i](); } }));
for (const g of groups) for (const l of g.lines) console.log(l);
const n = groups.reduce((a, g) => a + g.n, 0);
const fails = groups.reduce((a, g) => a + g.fails, 0);
console.log(`\n${n - fails}/${n} scenarios`);
console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(fails === 0 ? 0 : 1);
