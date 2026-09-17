// demo.ts — THE SECRETARY'S LINES (S3c, 2026-09-16), exercised from the outside:
// a helper's hours for one day (`avail`, 22), a child's leg handed to a named
// adult (`carry`, 23), a note under a day or a person (`note`, 24), and the door
// that moved — a person's fact is applied and what it breaks is printed after
// «применено»; `--propose` alone writes a proposal — with `spat warnings` as the
// week's «!!» lines in one list (25). Same fixture and helpers as the other spat
// demos (examples/spat/demolib.ts); a file of its own for the 120 s a demo has.
//
//   node --experimental-strip-types examples/spat_secretary/demo.ts

import * as fs from 'node:fs';
import { run as verb } from '../spat/edits.ts';
import { FROM, Group, ROOT, asRobin, count, fresh, inproc, spat, sql, type Res } from '../spat/demolib.ts';

const idOf = (r: Res, re = /\((e_[0-9a-f]+)\)/): string => re.exec(r.out)?.[1] ?? '';
const at = (m: number): { SPAT_NOW: string } => ({ SPAT_NOW: `2026-08-31T21:${String(30 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}+03:00` });
const asAlex = (root: string): Record<string, string> => ({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.alex });
/** Rows of a relation over the store, asked in this process — the census a spawn would print nothing of. */
const rowsOf = (root: string, q: string): number => Number(inproc(asRobin(root), (s) => { console.log(s.r.query(q).rows.length); return 0; }).out);
const holds = (root: string, lits: string[]): string => inproc(asRobin(root), (s) => { console.log(lits.map((l) => (s.r.holds(l) ? '1' : '0')).join('')); return 0; }).out;

// ------------------- 22. avail — a helper's window for one day, instead of the world's
async function avail(): Promise<Group> {
  const g = new Group('22. avail <кто> <день> <от>-<до> — the person\'s window for THAT day instead of the world\'s (window/5); an adult may state the nanny\'s hours; retract brings the holes back');
  const root = fresh();
  // PLANTED (A): Thursday's evening holes — the nanny has no window on thu (nanny_days = mon/wed/fri)
  const before = rowsOf(root, 'uncovered(C, thu, S)');
  g.check(`положительный контроль: uncovered чт до правки — ${before} строк (не 0)`, before > 0, String(before));
  const a = await spat(root, 'alex', ['edit', 'avail nanny thu 17:00-21:00'], at(0));
  g.code('alex: avail nanny thu 17:00-21:00 (взрослый о часах няни — c_nanny внешнее, но няня семьи)', a, 0);
  const A = idOf(a);
  g.check(`в книге alex e_avail(${A}, nanny, thu, 1020, 1260); ответ «применено: няня чт 17:00–21:00»`,
    sql<{ args: string }[]>(root, "SELECT args FROM facts WHERE ledger = 'p_alex' AND pred = 'e_avail'").some((x) => x.args.includes(`"${A}"`) && /"thu"/.test(x.args) && /1020/.test(x.args) && /1260/.test(x.args)) && /^применено: няня чт 17:00–21:00/.test(a.out), a.out);
  g.check('uncovered чт после правки — 0; window(A, nanny, thu, 1020, 1260); here(nanny, thu, 17:40)', rowsOf(root, 'uncovered(C, thu, S)') === 0 && holds(root, [`window(${A}, nanny, thu, 1020, 1260)`, 'here(nanny, thu, 1060)']) === '11');
  g.check('show thu: «НЕ ПОКРЫТ» нет; whoami alex: правка действует', !/НЕ ПОКРЫТ/.test((await spat(root, 'alex', ['show', 'thu'], at(1))).out) && new RegExp(`${A}  действует`).test((await spat(root, 'alex', ['whoami'], at(2))).out));
  g.code(`alex retract ${A}`, await spat(root, 'alex', ['retract', A], at(3)), 0);
  g.check(`после отзыва uncovered чт снова ${before}`, rowsOf(root, 'uncovered(C, thu, S)') === before, String(rowsOf(root, 'uncovered(C, thu, S)')));
  // PLANTED (A2): INSTEAD OF, not beside — the fixture's e_nannywed (wed 17:00–21:00) over the world's 19:00–22:00: the nanny is
  // here at 17:00 and NOT at 21:20; once robin takes it back the world's window stands again
  g.check('фикстура e_nannywed: window(nanny, wed) — одна строка, правки; here(nanny, wed, 17:00) да, here(nanny, wed, 21:20) нет', rowsOf(root, 'window(C, nanny, wed, F, T)') === 1 && holds(root, ['window(e_nannywed, nanny, wed, 1020, 1260)', 'here(nanny, wed, 1020)', 'here(nanny, wed, 1280)']) === '110');
  g.code('robin retract e_nannywed', await spat(root, 'robin', ['retract', 'e_nannywed'], at(4)), 0);
  g.check('без правки: window(c_nanny, nanny, wed, 1140, 1320) — мировая; here(nanny, wed, 21:20) да, 17:00 нет', holds(root, ['window(c_nanny, nanny, wed, 1140, 1320)', 'here(nanny, wed, 1280)', 'here(nanny, wed, 1020)']) === '110');
  // the grammar: verbless, the Russian verb, the helper about herself, and the refusals
  const v = await spat(root, 'robin', ['edit', 'няня ср 17:30-21:00'], at(5));
  g.check('robin: «няня ср 17:30-21:00» без глагола → 0 «применено: няня ср 17:30–21:00»', v.code === 0 && /^применено: няня ср 17:30–21:00/.test(v.out), v.out);
  g.code('nanny: доступна няня пт 18:30-22:00 (своё окно)', await spat(root, 'nanny', ['edit', 'доступна няня пт 18:30-22:00'], at(6)), 0);
  const nb = inproc({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.nanny }, (s) => verb(s, 'edit', ['avail nextdoor mon 13:00-15:00']));
  g.check('nanny: avail nextdoor → 4 «может: никто» (окно соседей — ничьё для правок)', nb.code === 4 && /может: никто/.test(nb.out), nb.out);
  g.code('avail alex mon 10:00-12:00 (у взрослого окна нет)', inproc(asRobin(root), (s) => verb(s, 'edit', ['avail alex mon 10:00-12:00'])), 2);
  g.code('avail nanny all 10:00-12:00 (all — не день)', inproc(asRobin(root), (s) => verb(s, 'edit', ['avail nanny all 10:00-12:00'])), 2);
  g.code('avail nanny thu 17:00-21:00 extra (хвост)', inproc(asRobin(root), (s) => verb(s, 'edit', ['avail nanny thu 17:00-21:00 extra'])), 2);
  g.code('avail nanny thu 17:00 (не интервал)', inproc(asRobin(root), (s) => verb(s, 'edit', ['avail nanny thu 17:00'])), 2);
  g.check('ни один отказ не записан: e_avail в книге robin ровно 4 (фикстура ×3 + verbless)', sql<{ n: number }[]>(root, "SELECT count(*) n FROM facts WHERE ledger = 'p_robin' AND pred = 'e_avail'")[0].n === 4);
  return g;
}

// ------------------- 23. carry — a child's leg handed to a named adult
async function carry(): Promise<Group> {
  const g = new Group('23. carry <ребёнок> <день> <время> <кто> — the leg that begins about that time is theirs: no run, «ВЕЗЁТ» under them; a clash with their own block is a warning, not a refusal');
  const root = fresh();
  // PLANTED (B, S3d): Friday — the bus stops short, an adult meets it: the grid prints «13:42–13:58 ВЕЗЁТ kit: школа → дом» for a
  // school that ends 13:20. The person names the run by the time they SEE (13:45) — measured on the stand: the carry matched
  // nothing and the old driver stayed — or by the block boundary (13:20); either takes the run, and the line keeps its window
  const f0 = (await spat(root, 'robin', ['show', 'fri'], at(0))).out;
  const tripOf = (out: string): string => out.split('\n').find((l) => /ВЕЗЁТ kit/.test(l)) ?? '';
  g.check('положительный контроль: show fri — «13:42–13:58  ВЕЗЁТ kit: школа → дом» у решателя, run(back(school_kit, fri)) есть', /13:42–13:58  ВЕЗЁТ kit: школа → дом$/.test(tripOf(f0)) && rowsOf(root, 'run(back(school_kit, fri), kit, F, T, fri, K, At)') === 1, tripOf(f0));
  const c = await spat(root, 'robin', ['edit', 'carry kit fri 13:45 alex'], at(1));
  g.code('robin: carry kit fri 13:45 alex (время из сетки, не граница блока)', c, 0);
  const C = idOf(c);
  const f1 = (await spat(root, 'robin', ['show', 'fri'], at(2))).out;
  /** the grid lines under one person: from «  who» to the next unindented name */
  const under = (out: string, who: string): string => /^ {4}.*(?:\n {4}.*)*/m.exec(out.slice(out.indexOf(`\n  ${who}\n`) + 1).split('\n').slice(1).join('\n'))?.[0] ?? '';
  g.check(`show fri: под alex «13:42–13:58  ВЕЗЁТ kit: школа → дом  [правка ${C}]» — то же окно; под robin строки ВЕЗЁТ kit нет; carry_run(back(school_kit, fri), ${C}, alex); перегон остался (run 1), «!! у kit … перегона нет» нет`,
    new RegExp(`13:42–13:58  ВЕЗЁТ kit: школа → дом  \\[правка ${C}\\]`).test(under(f1, 'alex')) && !/ВЕЗЁТ kit/.test(under(f1, 'robin')) && /забор детей/.test(under(f1, 'robin'))
    && holds(root, [`carry_run(back(school_kit, fri), ${C}, alex)`]) === '1' && rowsOf(root, 'run(back(school_kit, fri), kit, F, T, fri, K, At)') === 1 && !/у kit пт/.test(c.out), f1);
  g.check(`--format tg: под *alex* «• 13:42–13:58 везёт kit: школа → дом [правка ${C}]»`, new RegExp(`\\*alex\\*[^*]*• 13:42–13:58 везёт kit: школа → дом \\[правка ${C}\\]`).test((await spat(root, 'robin', ['show', 'fri', '--format', 'tg'], at(3))).out));
  g.code(`robin retract ${C}`, await spat(root, 'robin', ['retract', C], at(4)), 0);
  g.check('после отзыва show fri как было: ВЕЗЁТ kit снова у решателя', tripOf((await spat(root, 'robin', ['show', 'fri'], at(5))).out) === tripOf(f0));
  const c2 = await spat(root, 'robin', ['edit', 'carry kit fri 13:20 alex'], at(11));
  const C2 = idOf(c2);
  g.check(`carry kit fri 13:20 alex (граница блока) — тоже попадает: carry_run(back(school_kit, fri), ${C2}, alex), строка «13:42–13:58 … [правка ${C2}]»`, c2.code === 0 && holds(root, [`carry_run(back(school_kit, fri), ${C2}, alex)`]) === '1' && new RegExp(`13:42–13:58  ВЕЗЁТ kit: школа → дом  \\[правка ${C2}\\]`).test((await spat(root, 'robin', ['show', 'fri'], at(12))).out), c2.out);
  g.code(`robin retract ${C2}`, await spat(root, 'robin', ['retract', C2], at(13)), 0);
  // PLANTED (B2): the carrier is in a block of their own — a WARNING after «применено», not a refusal; the carry acts
  const w = await spat(root, 'alex', ['edit', 'kit забираю я пн 14:00'], at(6));
  g.check('alex: «kit забираю я пн 14:00» → 0; первая строка «применено: alex везёт kit пн 14:00», затем «!! alex 14:00 везёт во время работа (день) (пн)»',
    w.code === 0 && /^применено: alex везёт kit пн 14:00/.test(w.out) && /\n  !! alex 14:00 везёт во время работа \(день\) \(пн\)/.test(w.out), w.out);
  const W = idOf(w);
  g.check(`show mon: та же строка «!!» среди проблем дня, «!!» ровно один раз в ответе edit; ВЕЗЁТ kit под alex [правка ${W}] (хоп школа → физио взят по границе блока 14:00; robin по 15:00 — вторая строка того же перегона)`,
    /!! alex 14:00 везёт во время работа \(день\) \(пн\)/.test((await spat(root, 'alex', ['show', 'mon'], at(7))).out) && (w.out.match(/!! alex 14:00 везёт/g) ?? []).length === 1
    && holds(root, [`carry_run(hop(school_kit, music, mon), ${W}, alex)`, 'carry_run(hop(school_kit, music, mon), e_kitmusicc, robin)']) === '11');
  // the fixture: alex's thu carry inside work_pm, and a carry with no leg near it
  g.check('фикстура: carry_during(e_kitthu, alex, thu, 840, work_pm); carry_idle(e_nicothu) — садик кончился в 13:30, вне окна; e_nicopick (robin, nico 13:30 — её же pickup с nico): не clash и без перегона (блок with уже отвечает); defect(thu, carrier_busy, e_kitthu); carry_run: back(thu)←e_kitthu по автобусному окну, go(tue)←e_kitgo по прибытию, hop(wed)←e_kitwed по границе блока, hop(mon)←e_kitmusicc по моменту; взятые хопы без дороги — run_ok, «некому везти» их нет',
    holds(root, ['carry_during(e_kitthu, alex, thu, 840, work_pm)', 'carry_idle(e_nicothu, nico, thu, 1020)', 'carry_during(e_nicopick, robin, thu, 810, pickup)', 'carry_idle(e_nicopick, nico, thu, 810)', 'defect(thu, carrier_busy, e_kitthu)',
      'carry_run(back(school_kit, thu), e_kitthu, alex)', 'carry_run(go(school_kit, tue), e_kitgo, robin)', 'carry_run(hop(school_kit, club, wed), e_kitwed, robin)', 'carry_run(hop(school_kit, music, mon), e_kitmusicc, robin)', 'run_ok(hop(school_kit, club, wed))', 'run_stuck(hop(school_kit, club, wed))']) === '11011111110');
  // the top-level verb with the phrase as ONE argument (the shim's shape) — measured on the stand: the phrase was read as the child's name
  const idle = await spat(root, 'robin', ['carry', 'везёт alex nico ср 11:00'], at(8));
  g.check('robin: spat carry «везёт alex nico ср 11:00» одним аргументом — перегона около 11:00 нет: 0 и строка «!! у nico ср около 11:00 перегона нет — правка e_… ничего не меняет» (ровно одна)', idle.code === 0 && (idle.out.match(/!! у nico ср около 11:00 перегона нет — правка e_[0-9a-f]+ ничего не меняет/g) ?? []).length === 1, idle.out);
  // the grammar in Russian: the accusative of a name the family's book gave the child
  g.code('robin: rule add ru_name(kit, "Кит")', await spat(root, 'robin', ['rule', 'add', 'ru_name(kit, "Кит").'], at(9)), 0);
  const ru = await spat(root, 'robin', ['edit', 'Кита забираю я пт 13:20'], at(10));
  g.check('«Кита забираю я пт 13:20» → 0 «применено: robin везёт Кит пт 13:20» (падеж разобран через ru_name книги)', ru.code === 0 && /^применено: robin везёт Кит пт 13:20/.test(ru.out), ru.out);
  // who may, who is named
  g.code('nanny: carry kit mon 14:00 nanny (ребёнок не её)', inproc({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.nanny }, (s) => verb(s, 'edit', ['carry kit mon 14:00 nanny'])), 4);
  g.code('carry kit fri 13:20 nextdoor (не взрослый и не помощник)', inproc(asRobin(root), (s) => verb(s, 'edit', ['carry kit fri 13:20 nextdoor'])), 2);
  g.code('carry alex fri 13:20 robin (не ребёнок)', inproc(asRobin(root), (s) => verb(s, 'edit', ['carry alex fri 13:20 robin'])), 2);
  g.code('carry kit fri 25:00 alex', inproc(asRobin(root), (s) => verb(s, 'edit', ['carry kit fri 25:00 alex'])), 2);
  g.code('carry kit fri 13:20 (без кого)', inproc(asRobin(root), (s) => verb(s, 'edit', ['carry kit fri 13:20'])), 2);
  g.check(`книга robin: e_carry ровно 9 (фикстура ×5, ${C}, ${C2}, ср 11:00, Кита); alex: 4 (фикстура ×3, ${W})`, sql<{ n: number }[]>(root, "SELECT count(*) n FROM facts WHERE ledger = 'p_robin' AND pred = 'e_carry'")[0].n === 9 && sql<{ n: number }[]>(root, "SELECT count(*) n FROM facts WHERE ledger = 'p_alex' AND pred = 'e_carry'")[0].n === 4);
  return g;
}

// ------------------- 24. note — a line under the day or a person, read by no rule
async function note(): Promise<Group> {
  const g = new Group('24. note "<текст>" <день> [<кто>] — «✎ текст» under the day or the person in show/tomorrow and --format tg; no rule of the schedule reads it; retract takes it off');
  const root = fresh();
  const fri = (await spat(root, 'robin', ['show', 'fri'], at(0))).out; const thu = (await spat(root, 'robin', ['show', 'thu'], at(1))).out;
  g.check('фикстура: show fri «  ✎ торт для гостя» под днём (до людей); show thu «    ✎ ноутбук в офис» первой строкой под alex; show mon: няня без блоков, но с именем и «✎ ключ под ковриком»', /\n  ✎ торт для гостя\n  alex\n/.test(fri) && /\n  alex\n    ✎ ноутбук в офис\n/.test(thu) && /\n  няня\n    ✎ ключ под ковриком\n/.test((await spat(root, 'robin', ['show', 'mon'], at(13))).out), `${fri.split('\n').slice(0, 4).join(' | ')} || ${thu.split('\n').filter((l) => /alex|✎/.test(l)).slice(0, 3).join(' | ')}`);
  const tg = (await spat(root, 'robin', ['show', 'thu', '--format', 'tg'], at(2))).out;
  g.check('--format tg thu: «✎ ноутбук в офис» сразу под *alex*; fri tg: «✎ торт для гостя» под заголовком дня', /\*alex\*\n✎ ноутбук в офис\n/.test(tg) && /^\*Пт [\d.]+\*[^\n]*\n(?:[^\n]*\n)*?✎ торт для гостя\n/.test((await spat(root, 'robin', ['show', 'fri', '--format', 'tg'], at(3))).out), tg.split('\n').slice(0, 12).join(' | '));
  g.check('заметка — не ограничение и ничего не касается: constraint(e_cake, _, _) нет, touches(e_cake, _) нет, acts(e_cake) да', holds(root, ['acts(e_cake)']) === '1' && rowsOf(root, 'constraint(e_cake, O, S)') + rowsOf(root, 'touches(e_cake, X)') === 0);
  const defects = rowsOf(root, 'defect(D, R, K)');
  const n1 = await spat(root, 'robin', ['edit', "note 'позвонить в школу' пн"], at(4));
  g.check('robin: note \'позвонить в школу\' пн (одинарные кавычки) → 0 «применено: заметка пн: «позвонить в школу»»; show mon: «  ✎ позвонить в школу»', n1.code === 0 && /^применено: заметка пн: «позвонить в школу»/.test(n1.out) && /\n  ✎ позвонить в школу\n/.test((await spat(root, 'robin', ['show', 'mon'], at(5))).out), n1.out);
  const n2 = await spat(root, 'alex', ['note', 'взять форму', 'вт', 'kit'], at(6));
  g.check('alex: spat note "взять форму" вт kit (глагол верхнего уровня = edit) → 0; show tue: под kit «    ✎ взять форму»', n2.code === 0 && /\n  kit\n    ✎ взять форму\n/.test((await spat(root, 'alex', ['show', 'tue'], at(7))).out), n2.out);
  g.check('defect(D, R, K) до и после двух заметок — не сдвинулся', rowsOf(root, 'defect(D, R, K)') === defects);
  // the refusals: control characters (the edit is one line), a quote in the text, 201 characters, no quotes, no such day
  g.code('note "a\\nb" пн (перевод строки)', inproc(asRobin(root), (s) => verb(s, 'edit', ['note "a\nb" пн'])), 2);
  g.code('note "a\\tb" пн (табуляция)', inproc(asRobin(root), (s) => verb(s, 'edit', ['note "a\tb" пн'])), 2);
  g.code('заметка «с "кавычкой"» пн', inproc(asRobin(root), (s) => verb(s, 'edit', ['заметка «с "кавычкой"» пн'])), 2);
  g.code(`note "${'x'.repeat(201)}" пн (201 знак)`, inproc(asRobin(root), (s) => verb(s, 'edit', [`note "${'x'.repeat(201)}" пн`])), 2);
  g.code(`note "${'x'.repeat(200)}" пн (200 знаков)`, inproc(asRobin(root), (s) => verb(s, 'edit', [`note "${'x'.repeat(200)}" пн`])), 0);
  g.code('note торт пн (без кавычек)', inproc(asRobin(root), (s) => verb(s, 'edit', ['note торт пн'])), 2);
  g.code('note "торт" funday', inproc(asRobin(root), (s) => verb(s, 'edit', ['note "торт" funday'])), 2);
  g.code('note "торт" пн mallory (не из мира)', inproc(asRobin(root), (s) => verb(s, 'edit', ['note "торт" пн mallory'])), 2);
  g.code('note "торт" пн kit extra (хвост)', inproc(asRobin(root), (s) => verb(s, 'edit', ['note "торт" пн kit extra'])), 2);
  g.check('в книге robin e_note: фикстура 3 + пн + 200 знаков = 5; show tue без «старая заметка» (отозвана), show mon без «следующая неделя» (w0907)', sql<{ n: number }[]>(root, "SELECT count(*) n FROM facts WHERE ledger = 'p_robin' AND pred = 'e_note'")[0].n === 5 && !/старая заметка/.test((await spat(root, 'robin', ['show', 'tue'], at(11))).out) && !/следующая неделя/.test((await spat(root, 'robin', ['show', 'mon'], at(12))).out));
  g.code('robin retract e_cake', await spat(root, 'robin', ['retract', 'e_cake'], at(8)), 0);
  g.check('show fri без «✎ торт для гостя»; whoami: e_cake отозвана', !/торт для гостя/.test((await spat(root, 'robin', ['show', 'fri'], at(9))).out) && /e_cake  отозвана/.test((await spat(root, 'robin', ['whoami'], at(10))).out));
  return g;
}

// ------------------- 25. applied, not proposed — and the week's «!!» lines in one list
async function applied(): Promise<Group> {
  const g = new Group('25. a person\'s fact is applied — «применено» first, the break after; --propose alone is code 3; spat warnings [<день>] is every «!!» of the week in one list');
  const root = fresh();
  const n0 = count(root, 'p_robin');
  const proposedOf = (id: string): number => sql<{ n: number }[]>(root, "SELECT count(*) n FROM facts WHERE pred = 'proposed' AND args LIKE ?", `%"${id}"%`)[0].n;
  // PLANTED (D): the edit that used to be code 3 — measured on 2eafa2f: «ЗАПИСАНО КАК ПРЕДЛОЖЕНИЕ, не действует»
  const a = await spat(root, 'robin', ['edit', 'add errand thu 17:30-18:30 robin shop'], at(0));
  const A = idOf(a, /применено: .*\((e_[0-9a-f]+)\)/);
  g.check('add errand thu 17:30-18:30 robin shop → 0; строка 1 «применено: errand чт 17:30–18:30 (e_…) — неделя w0831», строка 2 «  ломает чт: …uncovered…», дальше «!! НЕ ПОКРЫТ чт …»; в книге нет proposed; show thu: errand стоит',
    a.code === 0 && /^применено: errand чт 17:30–18:30 \(e_[0-9a-f]+\) — неделя w0831\n  ломает чт: [a-z_, ]*uncovered/.test(a.out) && /!! НЕ ПОКРЫТ чт/.test(a.out)
    && proposedOf(A) === 0 && new RegExp(`errand.*правка ${A}`).test((await spat(root, 'robin', ['show', 'thu'], at(1))).out), a.out.split('\n').slice(0, 3).join(' | '));
  const p = await spat(root, 'robin', ['edit', 'add errand2 thu 18:30-19:30 robin shop', '--propose', '--format', 'tg'], at(2));
  g.check('тот же род правки с --propose --format tg → 3 «ЗАПИСАНО КАК ПРЕДЛОЖЕНИЕ», proposed в книге, «подтвердить: spat confirm e_…», строки ≤ 120', p.code === 3 && /^ЗАПИСАНО КАК ПРЕДЛОЖЕНИЕ/.test(p.out) && /подтвердить: spat confirm e_/.test(p.out) && Math.max(...p.out.split('\n').map((l) => l.length)) <= 120 && proposedOf(/confirm (e_[0-9a-f]+)/.exec(p.out)?.[1] ?? '?') === 1, p.out.split('\n').slice(0, 3).join(' | '));
  g.check('show thu: errand2 не действует (ждёт confirm)', !/errand2/.test((await spat(root, 'robin', ['show', 'thu'], at(3))).out));
  const tg = await spat(root, 'robin', ['edit', 'add errand3 thu 19:30-20:30 robin shop', '--format', 'tg'], at(4));
  g.check('без --propose --format tg → 0: «применено: …» первой, «!! не покрыт …» и причины «  — …» второй, ≤ 120', tg.code === 0 && /^применено: errand3/.test(tg.out) && /!! не покрыт (kit|nico) [\d:–]+\n  — /.test(tg.out) && Math.max(...tg.out.split('\n').map((l) => l.length)) <= 120, tg.out.split('\n').slice(0, 3).join(' | '));
  // every «!!» of the week, one list: the two Thursday holes grew, the tight chains, the fixture's carry lines
  const w = await spat(root, 'robin', ['warnings'], at(5));
  const lines = w.out.split('\n').filter((l) => l.startsWith('  !!'));
  g.check(`warnings: заголовок «неделя w0831: N предупреждений», N = число строк «!!» (${lines.length}); в списке дыры чт, «без запаса» пн/пт, «alex 14:00 везёт во время работа (день) (чт)», «у nico чт … перегона нет»`,
    w.code === 0 && new RegExp(`^неделя w0831: ${lines.length} предупреждений\n`).test(w.out) && lines.length >= 6 && /!! НЕ ПОКРЫТ чт/.test(w.out) && /!! БЕЗ ЗАПАСА пн/.test(w.out) && /!! БЕЗ ЗАПАСА пт/.test(w.out)
    && /!! alex 14:00 везёт во время работа \(день\) \(чт\)/.test(w.out) && /!! у nico чт около 17:00 перегона нет — правка e_nicothu/.test(w.out), w.out);
  const wt = await spat(root, 'robin', ['warnings', 'thu'], at(6));
  g.check('warnings thu: только четверг — «чт (неделя w0831): N», без «пн»', wt.code === 0 && /^чт \(неделя w0831\): \d+ предупреждений\n/.test(wt.out) && !/ пн/.test(wt.out) && /везёт во время работа \(день\) \(чт\)/.test(wt.out), wt.out.split('\n')[0]);
  const ws = await spat(root, 'robin', ['warnings', 'sun'], at(7));
  g.check('warnings sun: «вс (неделя w0831): предупреждений нет»', ws.code === 0 && ws.out.trim() === 'вс (неделя w0831): предупреждений нет', ws.out);
  const wg = await spat(root, 'robin', ['warnings', '--format', 'tg'], at(8));
  g.check('warnings --format tg: заголовки дней «*Чт 03.09*», под ними строки «!! …», ни одной длиннее 120, дней без проблем нет', wg.code === 0 && /\*Чт 03\.09\*\n!! не покрыт/.test(wg.out) && !/\*Вс/.test(wg.out) && Math.max(...wg.out.split('\n').map((l) => l.length)) <= 120, wg.out.split('\n').slice(0, 3).join(' | '));
  g.check('warnings завтра (пн 07.09 под SPAT_NOW вс 06.09, неделя w0907) → «пн (неделя w0907): …»', /^пн \(неделя w0907\): /.test((await spat(root, 'robin', ['warnings', 'завтра'], { SPAT_NOW: '2026-09-06T21:30:00+03:00' })).out));
  g.code('warnings funday', inproc(asRobin(root), (s) => verb(s, 'warnings', ['funday'])), 2);
  // whynot/why/relax take names, not atoms — measured on the stand: «whynot Кит ср 18:00» was code 1 «unexpected character»
  const wn = await spat(root, 'robin', ['whynot', 'Кит', 'ср', '18:00'], at(11));
  g.check('whynot Кит ср 18:00 (имени в мире нет) → 2 «мир такого не знает», не 1; whynot kit чт 18:00 → 0 «НЕ ПОКРЫТ»; why обед → 0; whynot kit чт 25:00 → 2', wn.code === 2 && /мир такого не знает/.test(wn.out) && (await spat(root, 'robin', ['whynot', 'kit', 'чт', '18:00'], at(12))).out.includes('НЕ ПОКРЫТ') && (await spat(root, 'robin', ['why', 'обед'], at(13))).code === 0 && (await spat(root, 'robin', ['whynot', 'kit', 'чт', '25:00'], at(14))).code === 2, wn.out);
  // maybe apply is an edit too: applied, not proposed
  const m = await spat(root, 'robin', ['maybe', 'add errand4 thu 20:30-21:00 robin shop'], at(9));
  const M = /гипотеза (m_[0-9a-f]+)/.exec(m.out)?.[1] ?? '';
  g.check('maybe apply ломающей гипотезы → 0 «применено», не 3', (await spat(root, 'robin', ['maybe', 'apply', M], at(10))).out.startsWith('применено: '));
  g.check('книга robin только росла: + 4 (errand) + 5 (errand2, proposed) + 4 (errand3) + 4 (apply) строк', count(root, 'p_robin') === n0 + 17, `${n0} -> ${count(root, 'p_robin')}`);
  return g;
}

const t0 = Date.now();
const todo = [avail, carry, note, applied];
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
