// demo.ts — THE SCHEDULE AS THE HUMAN SEES IT (16) AND THE DAY FOR A PHONE (17), split out of
// examples/spat_edits/demo.ts on 2026-09-16 (S3c): that file passed 120 s under the load of a shared
// machine once the secretary's lines were in the fixture, and a demo has 120 s in scripts/goldens.ts.
// Same fixture and helpers (examples/spat/demolib.ts). `npm run test:hosts` hashes this output.
//
//   node --experimental-strip-types examples/spat_seen/demo.ts

import * as fs from 'node:fs';
import { run as verb } from '../spat/edits.ts';
import { FROM, Group, ROOT, asRobin, fresh, inproc, spat, sql, type Res } from '../spat/demolib.ts';
import { fold, tgDay, tgWeek } from '../spat/tg.ts';

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

// ------------------- 17. the day and the week for a phone
// THE GOLDEN MOVED 2026-09-15 (S3b): the owner's «!! не покрыт …» was one line of 194 characters. The hole is now
// its own line and who was where is the next, indented «  — …»; no line of the text is longer than 120 (tg.ts fold).
// AND 2026-09-16 (S3c): the fixture's dated exceptions — alex's carry inside work_pm (a «!!» line and a «везёт» line),
// his note under his name; on the week, Thursday's clash and Saturday's carry with no leg.
const TG_THU = [
  '*Чт 03.09* — !! не покрыт kit 17:40–18:20',
  '  — alex: c_acme (внешнее); няня: не в эти часы; nextdoor: не в эти часы; robin: c_swim (наше)',
  '!! не покрыт nico 17:40–18:20',
  '  — alex: c_acme (внешнее); няня: не в эти часы; nextdoor: не в эти часы; robin: c_swim (наше)',
  '!! alex 14:00 везёт во время работа (день) (чт)',
  '!! у nico чт около 17:00 перегона нет — правка e_nicothu ничего не меняет',
  '!! у nico чт около 13:30 перегона нет — правка e_nicopick ничего не меняет',
  '', '*alex*', '✎ ноутбук в офис', '• 07:30–08:00 отвезти в школу (с kit)', '• 08:10–08:30 отвезти в садик (с nico)', '• 09:00–13:00 работа (утро)', '• 14:00–14:30 везёт kit: школа → дом [правка e_kitthu]', '• 14:00–16:00 работа (день)', '• 18:00–20:30 acme (офис)',
  '', '*kit*', '• 08:00–14:00 school_kit (школа)', '', '*nico*', '• 08:30–13:30 sadik_nico (садик)',
  '', '*robin*', '• 13:25–13:50 забор детей (садик) (с nico)', '• 14:15–14:45 обед (с kit, nico)', '• 17:00–18:00 плавание (бассейн)',
].join('\n');
const TG_WEEK = [
  '*Неделя w0831* (31.08–06.09)', 'Пн — !! без запаса: robin физио → забор детей, 0 мин', 'Вт — сходится', 'Ср — сходится',
  'Чт — !! 2 дыры: kit 17:40–18:20, nico 17:40–18:20; alex 14:00 везёт во время работа (день) (чт);',
  '  у nico чт около 17:00 перегона нет — правка e_nicothu ничего не меняет;',
  '  у nico чт около 13:30 перегона нет — правка e_nicopick ничего не меняет', 'Пт — !! без запаса: robin физио → забор детей, 0 мин',
  'Сб — сходится', 'Вс — сходится', '', 'Подробно: show <день>',
].join('\n');
async function phone(): Promise<Group> {
  const g = new Group('17. the day and the week for a phone — --format tg: short lines, no padding, one line per day for the week; the terminal untouched');
  const root = fresh();
  // the golden text, held here: a renderer change is a diff a person reads, not a hash that moved
  const day = inproc(asRobin(root), (s) => { console.log(tgDay(s.r, 'thu', 'w0831')); return 0; });
  g.check('tgDay(thu) — дословно как ожидается (27 строк — S3d: окно взятого перегона как у решателя «14:00–14:30», e_nicopick без перегона; без выравнивания пробелами кроме отступа причин)', day.out === TG_THU && !/[^\n ] {2,}/.test(day.out), day.out);
  // PLANTED (D): the reasons of a hole on their own line; nothing longer than 120; a name longer than that is not cut
  const longest = Math.max(...day.out.split('\n').map((l) => l.length));
  g.check(`ни одной строки длиннее 120 (самая длинная ${longest}); причины дыры — второй строкой «  — alex: …», не в строке «!! не покрыт»`,
    longest <= 120 && /^!! не покрыт nico 17:40–18:20\n  — alex: c_acme/m.test(day.out) && !/не покрыт [a-z]+ \d\d:\d\d–\d\d:\d\d:/.test(day.out), String(longest));
  const names = Array.from({ length: 6 }, (_, i) => `person${i}: c_something_${i} (внешнее)`).join('; ');
  const folded = fold(`!! не покрыт kit 17:40–18:20\n  — ${names}`).split('\n');
  const token = 'x'.repeat(130);
  g.check('fold: 6 причин по 40 знаков — три строки ≤ 120, разрыв после «;», продолжение с отступом 4; название в 130 знаков остаётся целым',
    folded.length === 3 && folded.every((l) => l.length <= 120) && folded[1].endsWith(';') && folded[2].startsWith('    person') && fold(`!! ${token} tail`).includes(token), folded.join(' | '));
  const wk = inproc(asRobin(root), (s) => { console.log(tgWeek(s.r, 'w0831')); return 0; });
  g.check('tgWeek(w0831) — дословно: строка на день, дыры сосчитаны, длинный четверг сложен, «Подробно: show <день>»', wk.out === TG_WEEK, wk.out);
  const cli = await spat(root, 'robin', ['show', 'thu', '--format', 'tg']);
  g.check('show thu --format tg = tgDay(thu)', cli.code === 0 && cli.out === `${TG_THU}\n`, cli.out);
  const tm = await spat(root, 'robin', ['tomorrow', '--format', 'tg'], { SPAT_NOW: '2026-09-06T21:30:00+03:00' });
  g.check('tomorrow --format tg (вс 06.09): «*Пн 07.09*» под неделей w0907, ≤ 25 строк', /^\*Пн 07\.09\* — /.test(tm.out) && tm.out.split('\n').length <= 25, tm.out.split('\n')[0]);
  g.check('show week --format tg = tgWeek (12 строк, не 87)', (await spat(root, 'robin', ['show', 'week', '--format', 'tg'])).out === `${TG_WEEK}\n`);
  const term = await spat(root, 'robin', ['show', 'thu']);
  g.check('без флага — терминальная сетка как была (колонки, ВЕЗЁТ/НЕ ПОКРЫТ заглавными)', /^чт 2026-09-03 \(неделя w0831\)\n  !! НЕ ПОКРЫТ чт 17:40–18:20  kit/.test(term.out) && /    07:30–08:00  отвезти в школу    школа      \+ kit/.test(term.out), term.out.split('\n').slice(0, 2).join(' | '));
  // the broken day of an edit under --format tg goes through the same lines — after «применено» (16.09), so the hole grows to 19:00
  const br = await spat(root, 'robin', ['edit', 'add errand thu 17:30-18:30 robin shop', '--format', 'tg'], { SPAT_NOW: '2026-08-31T21:31:00+03:00' });
  g.check('edit … --format tg (код 0): «применено» первой строкой, «!! не покрыт …» и причины второй строкой, ≤ 120', br.code === 0 && /^применено: /.test(br.out) && /!! не покрыт kit [\d:–]+\n  — /.test(br.out) && Math.max(...br.out.split('\n').map((l) => l.length)) <= 120, br.out.split('\n').slice(0, 4).join(' | '));
  g.code('--format xx', await spat(root, 'robin', ['show', 'thu', '--format', 'xx']), 2);
  return g;
}


const t0 = Date.now();
const todo = [asSeen, phone];
const groups: Group[] = new Array(todo.length);
let next = 0;
await Promise.all(Array.from({ length: 2 }, async () => { while (next < todo.length) { const i = next++; groups[i] = await todo[i](); } }));
for (const g of groups) for (const l of g.lines) console.log(l);
const n = groups.reduce((a, g) => a + g.n, 0);
const fails = groups.reduce((a, g) => a + g.fails, 0);
console.log(`\n${n - fails}/${n} scenarios`);
console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(fails === 0 ? 0 : 1);
