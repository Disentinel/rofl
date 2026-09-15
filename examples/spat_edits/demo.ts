// demo.ts — SPAT AFTER 2026-09-15, exercised from the outside: a date is a
// fact of the environment (group 12), a recurring line is one more line of
// the typical week (13), a hypothesis is a book (14), and the household's own
// rules live in its volume and are checked by the kernel (15). The store's
// own contract — the wall, the rights, the stranger, the volume — is
// examples/spat/demo.ts; this file runs on the same fixture through the same
// helpers (examples/spat/demolib.ts) and is a file of its own only because a
// demo has 120 s in scripts/goldens.ts and one `spat` call is 1.45 s of
// fixpoint. `npm run test:hosts` hashes this output and its exit code.
//
//   node --experimental-strip-types examples/spat_edits/demo.ts

import * as fs from 'node:fs';
import { SpatError, type Store } from '../spat/store.ts';
import { run as verb } from '../spat/edits.ts';
import { openVolume, render } from '../spat/volume.ts';
import { FROM, Group, ROOT, asRobin, count, fresh, inproc, spat, sql, type Res } from '../spat/demolib.ts';

// ------------------- 12. a date is a fact of the environment
async function datedEdits(): Promise<Group> {
  const g = new Group('12. a date is a fact of the environment — сегодня/завтра/15.09 resolve in SPAT_TZ and land in the DATE\'s week');
  const root = fresh();
  const row = (id: string): { pred: string; args: string }[] => sql(root, "SELECT pred, args FROM facts WHERE ledger = 'p_robin' AND args LIKE ? ORDER BY seq", `%"${id}"%`);
  const idOf = (r: Res): string => /\((e_[0-9a-f]+)\)/.exec(r.out)?.[1] ?? '';
  // PLANTED (A1): the owner said «сегодня» on a Tuesday and the model wrote Monday
  const a = await spat(root, 'robin', ['edit', 'add greek сегодня 16:00-17:00 kit home'], { SPAT_NOW: '2026-09-01T10:00:00+03:00' });
  g.code('вт 01.09: add greek сегодня', a, 0);
  const ra = row(idOf(a));
  g.check('факт: e_add … tue …, for_week w0831 — день и неделя от SPAT_NOW, не от человека', ra.some((x) => x.pred === 'e_add' && /"tue"/.test(x.args)) && ra.some((x) => x.pred === 'for_week' && /"w0831"/.test(x.args)), JSON.stringify(ra));
  // PLANTED (A2): Sunday evening «завтра» is Monday of the NEXT week, and the edit is for_week THAT week
  const b = await spat(root, 'robin', ['edit', 'add greek завтра 16:00-17:00 kit home'], { SPAT_NOW: '2026-09-06T21:30:00+03:00' });
  g.code('вс 06.09 21:30: add greek завтра', b, 0);
  const rb = row(idOf(b));
  g.check('факт: e_add … mon …, for_week w0907; ответ называет неделю w0907', rb.some((x) => x.pred === 'e_add' && /"mon"/.test(x.args)) && rb.some((x) => x.pred === 'for_week' && /"w0907"/.test(x.args)) && /неделя w0907/.test(b.out), b.out);
  const c = await spat(root, 'robin', ['edit', 'add greek 2026-09-08 16:00-17:00 kit home'], { SPAT_NOW: '2026-09-01T10:00:00+03:00' });
  g.check('дата 2026-09-08 (вт следующей недели): tue, for_week w0907', c.code === 0 && row(idOf(c)).some((x) => x.pred === 'e_add' && /"tue"/.test(x.args)) && row(idOf(c)).some((x) => x.pred === 'for_week' && /"w0907"/.test(x.args)), c.out);
  const d = inproc({ ...asRobin(root), SPAT_NOW: '2026-09-01T10:00:00+03:00' }, (s) => { const r = verb(s, 'edit', ['skip walk 31.02']); return r; });
  g.code('31.02 — в календаре нет', d, 2);
  const d2 = inproc({ ...asRobin(root), SPAT_NOW: '2026-09-01T10:00:00+03:00' }, (s) => verb(s, 'edit', ['skip walk 28.09']));
  g.code('28.09 — недели нет', d2, 2);
  g.check('отказ называет понедельник 2026-09-28 и week_starts', /2026-09-28.*не заведена.*week_starts/.test(d2.out), d2.out);
  const e = await spat(root, 'robin', ['show', 'завтра'], { SPAT_NOW: '2026-09-06T21:30:00+03:00' });
  g.check('show завтра (вс 06.09): пн 2026-09-07 под неделей w0907, greek в сетке; show mon (w0831) — без greek', /пн 2026-09-07 \(неделя w0907\)/.test(e.out) && /greek/.test(e.out) && !/greek/.test((await spat(root, 'robin', ['show', 'mon'])).out), e.out.split('\n')[0]);
  return g;
}

// ------------------- 13. every week — a recurring line of the typical week
async function recurring(): Promise<Group> {
  const g = new Group('13. every week — add/skip every <days> is one more line of the typical week, on every week, off everywhere once retracted');
  const root = fresh();
  const a = await spat(root, 'robin', ['edit', 'add piano every thu 16:00-17:00 kit home']);
  g.code('robin: add piano every thu', a, 0);
  const id = /\((e_[0-9a-f]+)\)/.exec(a.out)?.[1] ?? '';
  g.check('ответ говорит «каждую неделю»; в базе e_usual', /каждую неделю/.test(a.out) && sql<{ n: number }[]>(root, "SELECT count(*) n FROM facts WHERE ledger = 'p_robin' AND pred = 'e_usual' AND args LIKE ?", `%"${id}"%`)[0].n === 1, a.out);
  // PLANTED (B1): the block stands on Thursday of EVERY week that has a week_starts, not only the one in force
  const w1 = (await spat(root, 'robin', ['show', 'thu'])).out; const w2 = (await spat(root, 'robin', ['show', 'thu', '--week-of', 'w0907'])).out;
  g.check('чт w0831 и чт w0907: piano в обоих, с [правка id]', new RegExp(`piano.*правка ${id}`).test(w1) && new RegExp(`piano.*правка ${id}`).test(w2), `${/piano/.test(w1)} ${/piano/.test(w2)}`);
  const tueBefore = (await spat(root, 'robin', ['show', 'tue'])).out;
  const sk = await spat(root, 'robin', ['edit', 'skip walk every tue'], { SPAT_NOW: '2026-08-31T21:31:00+03:00' });
  g.code('robin: skip walk every tue', sk, 0);
  const skId = /\((e_[0-9a-f]+)\)/.exec(sk.out)?.[1] ?? '';
  g.check('вт: прогулка была — и нет', /прогулка/.test(tueBefore) && !/прогулка/.test((await spat(root, 'robin', ['show', 'tue'])).out));
  const who = (await spat(root, 'robin', ['whoami'])).out;
  g.check('whoami: обе под «повторяемые», не среди недельных', new RegExp(`повторяемые[^]*${id}[^]*${skId}`).test(who) && !new RegExp(`${id}[^]*повторяемые`).test(who), who);
  g.code('nanny: add tutoring every wed … kit (ребёнок не её)', inproc({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.nanny }, (s) => verb(s, 'edit', ['add tutoring every wed 16:00-17:00 kit home'])), 4);
  g.code('robin: add x every funday', inproc(asRobin(root), (s) => verb(s, 'edit', ['add x every funday 10:00-11:00'])), 2);
  // PLANTED (B2): a retraction takes the line off every week, not the one in force
  g.code('robin retract piano', await spat(root, 'robin', ['retract', id]), 0);
  const [f1, f2] = [(await spat(root, 'alex', ['show', 'week'])).out, (await spat(root, 'alex', ['show', 'week', '--week-of', 'w0907'])).out];
  g.check('после отзыва: piano нигде — ни в w0831, ни в w0907', !/piano/.test(f1) && !/piano/.test(f2));
  g.check('фикстура: e_greek (robin, every tue) стоит в обеих неделях; e_nannyusual (няня за ребёнка) — нигде', /greek/.test(f1) && /greek/.test(f2) && !/tutoring/.test(f1) && !/tutoring/.test(f2));
  return g;
}

// ------------------- 14. a hypothesis is a book
async function hypotheses(): Promise<Group> {
  const g = new Group('14. a hypothesis is a book — maybe writes [m_<id>], show is unchanged, compare is two columns, apply is an ordinary edit');
  const root = fresh();
  const mid = (r: Res): string => /гипотеза (m_[0-9a-f]+)/.exec(r.out)?.[1] ?? '';
  const a = await spat(root, 'robin', ['maybe', 'add greek mon 16:00-17:00 kit home']);
  g.code('robin: maybe add greek mon', a, 0);
  const mon = mid(a);
  const bookRow = sql<{ user: string }[]>(root, 'SELECT user FROM books WHERE ledger = ?', mon);
  g.check('книга m_ зарегистрирована за robin; факты под ledger=m_: e_add, edit_at, edit_via, for_week; в p_robin — ничего нового',
    bookRow[0]?.user === 'robin' && sql<{ pred: string }[]>(root, 'SELECT pred FROM facts WHERE ledger = ? ORDER BY seq', mon).map((x) => x.pred).join(',') === 'e_add,edit_at,edit_via,for_week'
    && sql<{ n: number }[]>(root, "SELECT count(*) n FROM facts WHERE ledger = 'p_robin' AND pred = 'e_add' AND args LIKE '%\"greek\"%'")[0].n === 0, JSON.stringify(bookRow));
  const b = await spat(root, 'robin', ['maybe', 'add greek wed 16:00-17:00 kit home'], { SPAT_NOW: '2026-08-31T21:31:00+03:00' });
  const wed = mid(b);
  // PLANTED (C1): a hypothesis does not change the week — show is the same world
  g.check('show mon: greek нет (гипотеза не в силе; правила m_ книг не читают)', b.code === 0 && !/greek/.test((await spat(root, 'robin', ['show', 'mon'])).out));
  const c = await spat(root, 'robin', ['maybe', 'compare'], { SPAT_NOW: '2026-08-31T21:32:00+03:00' });
  g.code('maybe compare', c, 0);
  // PLANTED (C2): «пн или ср» is two columns, each with its day, what breaks, holes, slack, and why down to the axiom in its own book
  g.check('две колонки: оба id в одной строке, день пн/ср, why доходит до e_add[m_…] [axiom]',
    new RegExp(`${mon}\\s+${wed}`).test(c.out) && /день\s+пн\s+ср/.test(c.out) && new RegExp(`e_add\\[${mon}\\]\\(${mon},greek,mon.*\\[axiom\\]`).test(c.out) && new RegExp(`e_add\\[${wed}\\]`).test(c.out), c.out);
  g.check('alex: своих гипотез нет (гипотеза — своя книга)', /гипотез нет/.test(inproc({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.alex }, (s) => verb(s, 'maybe', ['list'])).out));
  const n0 = [count(root, 'p_robin'), count(root, wed)];
  const ap = await spat(root, 'robin', ['maybe', 'apply', wed], { SPAT_NOW: '2026-08-31T21:33:00+03:00' });
  g.code('robin: maybe apply <ср>', ap, 0);
  const eid = /\((e_[0-9a-f]+)\)/.exec(ap.out)?.[1] ?? '';
  // PLANTED (C3): apply is an entry in p_robin; the m_ book only grows, by its `applied` row
  g.check('в p_robin +4 строки под новым e_-id; книга m_ +1 (applied); show ср: greek [правка e_…]',
    count(root, 'p_robin') === n0[0] + 4 && count(root, wed) === n0[1] + 1
    && sql<{ pred: string }[]>(root, 'SELECT pred FROM facts WHERE ledger = ? ORDER BY seq DESC LIMIT 1', wed)[0].pred === 'applied'
    && new RegExp(`greek.*правка ${eid}`).test((await spat(root, 'robin', ['show', 'wed'])).out), `${n0} -> ${count(root, 'p_robin')},${count(root, wed)}`);
  const again = inproc(asRobin(root), (s) => { const c = verb(s, 'maybe', ['apply', wed]); return c; });
  g.code('apply повторно', again, 2);
  g.check('maybe list: ср — применена как e_…, пн — живая', new RegExp(`${wed}.*применена как ${eid}`).test(inproc(asRobin(root), (s) => verb(s, 'maybe', ['list'])).out));
  g.check('через двое суток: живых гипотез нет (TTL по edit_at)', /живых гипотез нет/.test((await spat(root, 'robin', ['maybe', 'compare'], { SPAT_NOW: '2026-09-02T22:00:00+03:00' })).out));
  const nn = inproc({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.nanny }, (s) => (verb(s, 'maybe', ['move pickup wed 15:00']) === 0 ? verb(s, 'maybe', ['compare']) : 9));
  g.check('nanny: гипотеза о чужом ограничении пишется (0) и в compare — «без права»', nn.code === 0 && /ломает\s+без права/.test(nn.out), nn.out);
  const pl = await spat(root, 'robin', ['place', 'tutoring', '60', 'robin', 'home']);
  g.code('robin: place tutoring 60 robin home', pl, 0);
  g.check('три лучших, каждый с «ломает/дыр/запас» и готовой строкой maybe; отсев по cand_bad', /1\. .*ломает: .*дыр \d+ .*запас/.test(pl.out) && /3\. /.test(pl.out) && /spat maybe 'add tutoring/.test(pl.out) && /отсеяно правилами \(cand_bad\): \w+ \d+/.test(pl.out), pl.out);
  return g;
}

// ------------------- 15. the household's own rules, without a release
async function ruleBooks(): Promise<Group> {
  const g = new Group('15. the household\'s own rules — a new kind of constraint is a rule in the family\'s book [hh], checked by the kernel, read at four points and nowhere else');
  const root = fresh();
  const rid = (r: Res): string => /(r_[0-9a-f]+)/.exec(r.out)?.[1] ?? '';
  const asAlex = { SPAT_ROOT: root, SPAT_FROM_ID: FROM.alex };
  const counts = (s: Store): string => ['may_edit(U, X)', 'uncovered(C, D, S)', 'defect(D, R, K)'].map((q) => s.r.query(q).rows.length).join('/');
  // the laptop rule: three clauses under one id, the AST in `clauses`, the trail in `facts`
  const a = await spat(root, 'alex', ['rule', 'add', 'needs(work_am, laptop). laptop_at(home). defect[hh](no_laptop, B, D) :- needs(B, laptop), span(_, B, _, Pl, D, _, _), not laptop_at(Pl).']);
  g.code('alex: rule add «ноутбук» (3 клаузы)', a, 0);
  const laptop = rid(a);
  g.check('в clauses 3 строки под id, в facts hh: rule_by/rule_at/rule_via; головы [hh]',
    sql<{ n: number }[]>(root, 'SELECT count(*) n FROM clauses WHERE id = ?', laptop)[0].n === 3
    && sql<{ pred: string }[]>(root, "SELECT pred FROM facts WHERE ledger = 'hh' ORDER BY seq").map((x) => x.pred).join(',') === 'rule_by,rule_at,rule_via'
    && sql<{ head: string }[]>(root, 'SELECT head FROM clauses WHERE id = ?', laptop).every((x) => /"persp":\{"k":"a","name":"hh"\}/.test(x.head)), laptop);
  // PLANTED (D1): a day where work_am is not at home — the edit breaks it by the household's own name
  const e1 = await spat(root, 'alex', ['edit', 'add work_am thu 09:00-11:00 alex office']);
  g.check('edit add work_am чт office → код 3, «ломает чт: no_laptop»', e1.code === 3 && /ломает чт: .*no_laptop/.test(e1.out), e1.out.split('\n').slice(0, 2).join(' | '));
  g.code('alex rule retract «ноутбук»', await spat(root, 'alex', ['rule', 'retract', laptop]), 0);
  const e2 = await spat(root, 'alex', ['edit', 'add work_am thu 09:00-11:00 alex office'], { SPAT_NOW: '2026-08-31T21:31:00+03:00' });
  g.check('после отзыва та же правка: no_laptop среди причин нет', e2.code === 3 && !/no_laptop/.test(e2.out), e2.out.split('\n').slice(0, 2).join(' | '));
  // PLANTED (D2): a head that names main in the text — stamped [hh], grants nothing.
  // The census is taken now, after the two proposed edits above (each is a
  // constraint and moves may_edit by two), and again after the two rules.
  let c0 = '';
  const f = inproc({ ...asAlex, SPAT_NOW: '2026-08-31T21:32:00+03:00' }, (s) => { c0 = counts(s); return verb(s, 'rule', ['add', 'may_edit[main](nanny, c_pickup) :- person(nanny, helper).']); });
  g.code('alex: rule add may_edit[main](nanny, c_pickup)', f, 0);
  g.check('в clauses голова переписана в [hh]; в тексте [main] нет', sql<{ head: string }[]>(root, 'SELECT head FROM clauses WHERE id = ?', rid(f)).every((x) => /"name":"hh"/.test(x.head) && !/"name":"main"/.test(x.head)));
  g.code('nanny: move pickup wed 15:00 — по-прежнему', await spat(root, 'nanny', ['edit', 'move pickup wed 15:00']), 4);
  // PLANTED (D3): a head outside the four points — accepted, inert
  g.code('alex: rule add uncovered(kit, mon, 600).', await spat(root, 'alex', ['rule', 'add', 'uncovered(kit, mon, 600).'], { SPAT_NOW: '2026-08-31T21:33:00+03:00' }), 0);
  // the kernel's refusals, verbatim — three on one world, each on its own fork
  const tryRule = (s: Store, text: string): Res => { try { return { code: verb(s, 'rule', ['add', text]), out: '' }; } catch (e) { return { code: e instanceof SpatError ? e.code : -1, out: (e as Error).message }; } };
  let c1 = ''; let cyc: Res = { code: 0, out: '' }; let big: Res = { code: 0, out: '' };
  const foreign = inproc(asAlex, (s) => {
    c1 = counts(s);
    cyc = tryRule(s, 'needs_cover[hh](kit, D, S) :- slot(D, S), not needs_cover(kit, D, S).');
    big = tryRule(s, 'busy[hh](P, D, S) :- person(P, K), slot(D, S), slot(D2, S2), slot(D3, S3).');
    return verb(s, 'rule', ['add', 'defect[hh](x, B, D) :- e_add[p_robin](E, B, D, F, T, W, P).']);
  });
  g.check(`may_edit/uncovered/defect в main до и после двух правил: ${c0} — не сдвинулись`, c1 === c0, `${c0} -> ${c1}`);
  g.check('циклическое отрицание → код 2, «unstratified», диагностика ядра дословно (program rejected: round …)', cyc.code === 2 && /unstratified/.test(cyc.out) && /program rejected: round \d+ settled nothing/.test(cyc.out), cyc.out.split('\n')[0]);
  g.check('произведение слотов → код 2 «слишком дорогое», причина ядра (space_exhausted/budget_exhausted)', big.code === 2 && /слишком дорогое/.test(big.out) && /(space|budget)_exhausted/.test(big.out), big.out);
  g.code('тело читает [p_robin] (не своя книга)', foreign, 2);
  g.check('ни одна отвергнутая не записана: в clauses ровно 3 + 1 + 1 строк', sql<{ n: number }[]>(root, 'SELECT count(*) n FROM clauses')[0].n === 5);
  g.code('nanny: rule add', inproc({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.nanny }, (s) => verb(s, 'rule', ['add', 'warn(x, "y", fri).'])), 4);
  // from the bot: proposed until the person confirms; then a «!!» line of show
  const w = await spat(root, 'robin', ['rule', 'add', 'warn(car_check, "техосмотр", fri).'], { SPAT_VIA: 'telegram' });
  g.check('robin через telegram: warn → код 3, «сегодня оно даёт: warn[hh](car_check…)»', w.code === 3 && /warn\[hh\]\(car_check/.test(w.out), w.out);
  g.code('alex confirm чужого правила', await spat(root, 'alex', ['rule', 'confirm', rid(w)]), 4);
  g.code('robin confirm', await spat(root, 'robin', ['rule', 'confirm', rid(w)]), 0);
  g.check('show fri: «!! car_check: техосмотр (пт, правило семьи)»', /!! car_check: техосмотр\s+\(пт, правило семьи\)/.test((await spat(root, 'robin', ['show', 'fri'])).out));
  // busy through the point: free time on Sunday shrinks by the rule's two hours
  g.code('alex: busy(robin, sun, S) 10:00-12:00', await spat(root, 'alex', ['rule', 'add', 'busy(robin, sun, S) :- slot(sun, S), S >= 600, S < 720.'], { SPAT_NOW: '2026-08-31T21:34:00+03:00' }), 0);
  g.check('free robin: вс 07:00–10:00, 12:00–22:00', /вс\s+свободно: 07:00–10:00, 12:00–22:00/.test((await spat(root, 'robin', ['free', 'robin'])).out));
  // the dump renders the book as .rofl, rules included; a schema-1 volume is brought to 2 on open
  const v = openVolume(root, 'example');
  const dump = render(v, 'hh');
  g.check('volume dump hh: правила текстом под своим id, головы [hh]', /-- r_[0-9a-f]+\nneeds\[hh\]\(work_am, laptop\)\./.test(dump) && /defect\[hh\]\(no_laptop, B, D\) :- needs\[hh\]\(B, laptop\), span\(_, B, _, Pl, D, _, _\), not laptop_at\[hh\]\(Pl\)\./.test(dump), dump.slice(-300));
  v.db.exec("DROP TABLE clauses; UPDATE meta SET value = '1' WHERE key = 'schema'"); v.db.close();
  const v2 = openVolume(root, 'example');
  g.check('том схемы 1 при открытии получает таблицу clauses и схему 2', (v2.db.prepare("SELECT value FROM meta WHERE key = 'schema'").get() as { value: string }).value === '2' && v2.db.prepare('SELECT count(*) n FROM clauses').get() !== undefined);
  v2.db.close();
  return g;
}

// ------------------- 16. the schedule as the human sees it
async function asSeen(): Promise<Group> {
  const g = new Group('16. the schedule as the human sees it — skip/move name a block a book added (its entry taken back, by the author or by right) or a recurring one; an unknown name lists the day');
  const root = fresh();
  const eid = (r: Res, re = /\((e_[0-9a-f]+)\)/): string => re.exec(r.out)?.[1] ?? '';
  const last = (ledger: string): { pred: string; args: string } => sql<{ pred: string; args: string }[]>(root, 'SELECT pred, args FROM facts WHERE ledger = ? ORDER BY seq DESC LIMIT 1', ledger)[0];
  // PLANTED (A/B amendment): add greek mon → skip greek mon — the block is gone and the entry is retracted
  const a = await spat(root, 'robin', ['edit', 'add chess mon 16:00-17:00 kit home']);
  const A = eid(a);
  const sk = await spat(root, 'robin', ['edit', 'skip chess mon'], { SPAT_NOW: '2026-08-31T21:31:00+03:00' });
  g.code('robin: add chess mon, skip chess mon', sk, a.code === 0 ? 0 : 9);
  g.check(`ответ «отозвана ${A} (chess пн)»; в книге robin — retracted(${A}); show mon без chess, evening няни на месте`,
    new RegExp(`отозвана ${A} \\(chess пн\\)`).test(sk.out) && last('p_robin').pred === 'retracted' && last('p_robin').args.includes(`"${A}"`)
    && (await spat(root, 'robin', ['show', 'mon']).then((r) => !/chess/.test(r.out) && /evening/.test(r.out))), `${sk.out} | ${JSON.stringify(last('p_robin'))}`);
  const b = await spat(root, 'robin', ['edit', 'add chess wed 16:00-17:00 kit home'], { SPAT_NOW: '2026-08-31T21:32:00+03:00' });
  const B = eid(b);
  const unknown = inproc({ ...asRobin(root), SPAT_NOW: '2026-08-31T21:33:00+03:00' }, (s) => verb(s, 'edit', ['skip chesss wed']));
  g.check('skip несуществующего → код 2 с блоками среды: добавленный chess с пометкой [правка e_…], без грамматики', unknown.code === 2 && new RegExp(`ср: стоят .*chess \\[правка ${B}\\]`).test(unknown.out) && !/Допустимо/.test(unknown.out), unknown.out.split('\n')[0]);
  const al = await spat(root, 'alex', ['edit', 'skip chess wed'], { SPAT_NOW: '2026-08-31T21:34:00+03:00' });
  g.code('alex: skip chess wed (правка robin, по праву семьи)', al, 0);
  g.check(`«отозвана по праву семьи ${B} (chess ср, правка robin)»; retracts(${B}) в книге alex; show wed без chess`,
    new RegExp(`отозвана по праву семьи ${B} \\(chess ср, правка robin\\)`).test(al.out) && last('p_alex').pred === 'retracts' && last('p_alex').args.includes(`"${B}"`)
    && !/chess/.test((await spat(root, 'alex', ['show', 'wed'])).out), `${al.out} | ${JSON.stringify(last('p_alex'))}`);
  const no = inproc({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.alex }, (s) => verb(s, 'edit', ['skip evening mon']));
  g.check('alex: skip evening mon (правка няни, внешняя) → 4, «может: няня»', no.code === 4 && /может: няня/.test(no.out), no.out);
  const c = await spat(root, 'robin', ['edit', 'add chess thu 16:00-17:00 kit home'], { SPAT_NOW: '2026-08-31T21:35:00+03:00' });
  const C = eid(c);
  const mv = await spat(root, 'robin', ['edit', 'move chess thu 17:30'], { SPAT_NOW: '2026-08-31T21:36:00+03:00' });
  g.code('robin: move chess thu 17:30 (добавленный блок)', mv, 0);
  const D = eid(mv, /применено: .*\((e_[0-9a-f]+)\)/);
  g.check(`«отозвана ${C}» и «применено: chess → чт 17:30 (${D})»; show thu: chess 17:30–18:30 [правка ${D}]`,
    new RegExp(`отозвана ${C} \\(chess чт\\)`).test(mv.out) && D !== '' && D !== C && new RegExp(`17:30–18:30\\s+chess.*правка ${D}`).test((await spat(root, 'robin', ['show', 'thu'])).out), mv.out);
  // a recurring block skipped on one day is that week's skip; the recurrence stands
  g.code('robin: skip greek tue (every-блок фикстуры, с днём — только эта неделя)', await spat(root, 'robin', ['edit', 'skip greek tue'], { SPAT_NOW: '2026-08-31T21:37:00+03:00' }), 0);
  g.check('вт w0831 без greek, вт w0907 с greek', !/greek/.test((await spat(root, 'robin', ['show', 'tue'])).out) && /greek/.test((await spat(root, 'robin', ['show', 'tue', '--week-of', 'w0907'])).out));
  const rec = await spat(root, 'robin', ['edit', 'skip greek'], { SPAT_NOW: '2026-08-31T21:38:00+03:00' });
  g.check('skip greek без дня — отзыв повторения: «отозвана e_greek (greek вт)», вт w0907 без greek', rec.code === 0 && /отозвана e_greek \(greek вт\)/.test(rec.out) && !/greek/.test((await spat(root, 'robin', ['show', 'tue', '--week-of', 'w0907'])).out), rec.out);
  // the fixture: alex's retracts by right, without right, of nothing
  const fx = inproc(asRobin(root), (s) => { console.log(`${s.r.holds('retracted_edit(e_skipclean)')} ${s.r.holds('retracted_edit(e_nannyadd)')} ${s.r.query('retract_without_right[audit](E, L)').rows.map((x) => x.bindings.E).sort().join(',')}`); return 0; });
  g.check('фикстура: retracts(e_skipclean) alex — отозвана; retracts(e_nannyadd) — нет права, действует; аудит: e_nannyadd, e_nowhere', fx.out === 'true false e_nannyadd,e_nowhere', fx.out);
  return g;
}

const t0 = Date.now();
// FOUR GROUPS AT ONCE, in a fixed order of results (see examples/spat/demo.ts).
const todo = [datedEdits, recurring, hypotheses, ruleBooks, asSeen];
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
