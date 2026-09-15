// demo.ts — SPAT's host contract, exercised: the multi-user store from the
// outside. `npm run test:hosts` hashes this output and its exit code; a
// planted defect flips a line to FAIL and the exit to 1, so every scenario
// below is a test that can say no. Each group is one of the defects the
// brief plants, named after it, and runs against its own volume, imported
// from examples/spat/store.example into a temp dir — the shipped household,
// public and made up, never a real one; the real ones are SQLite files under
// $SPAT_ROOT and nothing here reads one.
//
// THE GROUPS RUN AT ONCE AND PRINT IN ORDER. One `spat` call is a node
// process that evaluates the whole model, 1.5 s on a quiet machine; fifty of
// them in a row is 100 s, which is inside the host's 120 s limit only while
// nothing else runs. Measured 2026-09-14: the first bless of this demo caught
// it mid-run and recorded exit -1. Groups are independent, so they share the
// cores; the output is assembled afterwards so the hash does not depend on
// which finished first.
//
//   node --experimental-strip-types examples/spat/demo.ts
//
// The store's own contract lives here (groups 1-11); what was built on it
// on 2026-09-15 — dates, recurring lines, hypotheses, the household's rule
// book — is examples/spat_edits/demo.ts, a second file because a demo has
// 120 s and one `spat` call is 1.45 s of fixpoint (demolib.ts).


import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { canonTerm } from '../../src/unify.ts';
import { BOOT, SPAT } from './spat.ts';
import { RU_BROKEN } from './html.ts';
import { ACCESS, SpatError, VOLUMES, env, openStore } from './store.ts';
import { parseEdit } from './edits.ts';
import { load, openVolume, readBook, render, type Volume } from './volume.ts';
import { FIX, FROM, Group, ROOT, TRAIL, WEEK, codeOf, count, fresh, spat, sql, top, withEnv } from './demolib.ts';

// ------------------------------------------------------- 1. the tag wall
async function tagWall(): Promise<Group> {
  const g = new Group('1. the tag wall — a line of another book, at the import and inside the volume');
  const root = fresh();
  const bad = path.join(root, 'robin.rofl');
  fs.writeFileSync(bad, `${fs.readFileSync(path.join(FIX, 'ledgers/robin.rofl'), 'utf8')}e_skip[p_alex](e_forged, walk, tue).\n`);
  const before = count(root, 'p_robin');
  const r = await spat(root, 'alex', ['volume', 'load', 'example', bad]);
  g.code('volume load robin.rofl со строкой [p_alex]', r, 6);
  g.check('код 6 называет файл и строку', /robin\.rofl:\d+.*\[p_alex\].*\[p_robin\]/.test(r.out), r.out);
  g.check('ни одна строка файла не записана: валидные строки перед плохой не вставлены', count(root, 'p_robin') === before, `${before} -> ${count(root, 'p_robin')}`);
  // PLANTED (2): a row put into the base by hand, ledger = p_alex. The column
  // IS the book: the loader puts it in [p_alex] whatever the demo meant, so
  // alex's readers see the walk skipped and the nanny — who may not open
  // alex's book — still sees it standing.
  const v = openVolume(root, 'example');
  for (const [pred, args] of [['e_skip', '[{"k":"a","name":"e_planted"},{"k":"a","name":"walk"},{"k":"a","name":"tue"}]'],
    ['edit_at', '[{"k":"a","name":"e_planted"},{"k":"s","v":"2026-08-31T10:00:00+03:00"}]'],
    ['edit_via', '[{"k":"a","name":"e_planted"},{"k":"a","name":"cli"}]'], ['for_week', '[{"k":"a","name":"e_planted"},{"k":"a","name":"w0831"}]']]) {
    v.db.prepare("INSERT INTO facts(ledger, pred, args, at, via, edit) VALUES ('p_alex', ?, ?, 'x', 'cli', 'planted by hand')").run(pred, args);
  }
  v.db.close();
  const alex = await spat(root, 'alex', ['show', 'tue']); const nanny = await spat(root, 'nanny', ['show', 'tue']);
  g.check('строка ledger=p_alex, вставленная руками: у alex прогулка вт отменена (грузится в [p_alex])', alex.code === 0 && !/прогулка/.test(alex.out), alex.out);
  g.check('няня её не видит: may_read не открывает ей p_alex, прогулка вт на месте', nanny.code === 0 && /прогулка/.test(nanny.out), nanny.out);
  return g;
}

// ---------------------------------------------------------- 2. the rights
async function rights(): Promise<Group> {
  const g = new Group('2. the rights — household, external, a helper');
  const root = fresh();
  g.code('robin: move run_school 07:25 (c_school_run — alex, household)', await spat(root, 'robin', ['edit', 'move run_school 07:25']), 0);
  const r = await spat(root, 'robin', ['edit', 'skip school_kit fri']);
  g.code('robin: skip school_kit (c_school — external)', r, 4);
  g.check('код 4 называет владельца и что внешнее', /c_school.*ВНЕШНЕЕ/.test(r.out) && /report/.test(r.out), r.out);
  const before = count(root, 'p_nanny');
  const n = await spat(root, 'nanny', ['edit', 'move pickup wed 15:00']);
  g.code('nanny: move pickup (c_pickup — robin, household)', n, 4);
  g.check('код 4 говорит, кто может', /может: alex, robin/.test(n.out), n.out);
  g.check('в базу ничего: книга няни как была', count(root, 'p_nanny') === before);
  g.code('robin: report c_pickup (не внешнее)', await spat(root, 'robin', ['edit', 'report c_pickup mon 14:10']), 4);
  g.code('правка не разобрана', await spat(root, 'robin', ['edit', 'move nothing 25:00']), 2);
  g.code('robin volume dump (не оператор)', await spat(root, 'robin', ['volume', 'dump', 'example']), 4);
  g.code('robin volume load (не оператор)', await spat(root, 'robin', ['volume', 'load', 'example', path.join(FIX, 'me.rofl')]), 4);
  return g;
}

// -------------------------------------------------------- 3. the stranger
/** What the loader had opened when it refused, asked in-process. */
function openedBy(vars: Record<string, string>): string {
  return withEnv(vars, () => {
    try { openStore(env()); return 'opened nothing and did not refuse'; } catch (e) { return (e as SpatError).opened.map((f) => path.relative(vars.SPAT_ROOT, f)).join(' '); }
  });
}
async function stranger(): Promise<Group> {
  const g = new Group('3. the stranger — code 5 before a book is opened');
  const root = fresh();
  g.code('SPAT_AS=mallory (другой арендатор)', await spat(root, 'me', ['show'], { SPAT_AS: 'mallory' }), 5);
  g.check('до отказа открыты только users и world, ни одной книги',
    openedBy({ SPAT_ROOT: root, SPAT_TENANT: 'example', SPAT_AS: 'mallory' }) === 'example.sqlite/users example.sqlite/world');
  const r = await spat(root, 'me', ['show'], { SPAT_AS: undefined, SPAT_FROM_ID: '424242' });
  g.code('SPAT_FROM_ID неизвестный', r, 5);
  g.check('текст: «я вас не знаю; добавить может владелец»', /я вас не знаю.*добавить может владелец/.test(r.out), r.out);
  g.check('до отказа открыта только книга users — ни мира, ни книг', openedBy({ SPAT_ROOT: root, SPAT_FROM_ID: '424242' }) === 'example.sqlite/users');
  g.code('SPAT_AS и SPAT_FROM_ID вместе', await spat(root, 'robin', ['show'], { SPAT_AS: 'robin', SPAT_TENANT: 'example' }), 5);
  g.code('ни SPAT_AS, ни SPAT_FROM_ID', await spat(root, 'me', ['show'], { SPAT_AS: undefined }), 5);
  g.code('SPAT_FROM_ID robin + SPAT_TENANT другой семьи', await spat(root, 'robin', ['show'], { SPAT_TENANT: 'elsewhere' }), 5);
  const w = await spat(root, 'robin', ['whoami']);
  g.check('SPAT_FROM_ID robin без SPAT_TENANT: семья из книги users', w.code === 0 && /я: robin \(from_id 100002\).*семья example/.test(w.out), w.out.split('\n')[0]);
  g.code('mallory по id: её семья elsewhere не развёрнута', await spat(root, 'mallory', ['show']), 5);
  g.code('неизвестный глагол', await spat(root, 'robin', ['dance']), 2);
  return g;
}

// ---------------------------------------------- 4. breaks, confirm, retract
async function breaks(): Promise<Group> {
  const g = new Group('4. breaks the day — proposed, confirmed by its author, retracted');
  const root = fresh();
  const before = count(root, 'p_robin');
  g.code('robin: sick alex tue', await spat(root, 'robin', ['edit', 'sick alex tue']), 0);
  const r = await spat(root, 'robin', ['edit', 'add errand tue 18:30-20:00 robin office'], { SPAT_NOW: '2026-08-31T21:31:00+03:00' });
  g.code('robin: errand вт 18:30 — дети одни', r, 3);
  const id = /confirm (e_[0-9a-f]+)/.exec(r.out)?.[1] ?? '';
  g.check('код 3 называет дыру, чьё ограничение и id', /НЕ ПОКРЫТ вт.*nico/s.test(r.out) && /robin\s+e_[0-9a-f]+\s+robin\s+наше/.test(r.out) && id !== '', r.out);
  const proposed = sql<{ args: string }[]>(root, "SELECT args FROM facts WHERE ledger = 'p_robin' AND pred = 'proposed'").map((x) => x.args);
  g.check('записано как proposed, в книге robin, термом', proposed.some((a) => a.includes(`"name":"${id}"`)), proposed.join(' '));
  g.check('show вт: правка не действует', !/errand/.test((await spat(root, 'robin', ['show', 'tue'])).out));
  g.code('alex confirm чужой правки', await spat(root, 'alex', ['confirm', id]), 4);
  g.code('robin confirm своей', await spat(root, 'robin', ['confirm', id]), 0);
  const after = (await spat(root, 'robin', ['show', 'tue'])).out;
  g.check('show вт: правка действует, дыра видна', /errand/.test(after) && /НЕ ПОКРЫТ вт/.test(after), after);
  g.code('robin retract', await spat(root, 'robin', ['retract', id]), 0);
  g.code('confirm отозванной', await spat(root, 'robin', ['confirm', id]), 2);
  g.check('книга только росла: 4 + 5 + 1 + 1 строк, ни одна не пропала', count(root, 'p_robin') === before + 11, `${before} -> ${count(root, 'p_robin')}`);
  const why = (await spat(root, 'robin', ['why', 'evening'])).out;
  g.check('why над многопользовательским миром доходит до книги няни', /e_add\[p_nanny\]/.test(why) && /книга \[p_nanny\].*telegram/.test(why), why);
  return g;
}

// ------------------------------------------------------- 5. tomorrow, by TZ
async function tomorrow(): Promise<Group> {
  const g = new Group('5. tomorrow — by SPAT_TZ, never by the process clock');
  const root = fresh();
  // the brief's shape (21:30+03:00 is 18:30Z, the same calendar day either way) on a
  // Sunday the world has a next week for; then the minute that DOES tell the zones apart
  const a = await spat(root, 'me', ['tomorrow'], { SPAT_NOW: '2026-09-06T21:30:00+03:00', TZ: 'UTC' });
  g.check('SPAT_NOW=вс 06.09 21:30+03:00, Nicosia, процесс в UTC → завтра пн 07.09', /ЗАВТРА, пн 2026-09-07/.test(a.out), a.out.split('\n')[0]);
  const b = await spat(root, 'me', ['tomorrow'], { SPAT_NOW: '2026-09-07T00:30:00+03:00', TZ: 'UTC' });
  g.check('пн 07.09 00:30+03:00 — в UTC ещё вс: SPAT_TZ решает, завтра вт 08.09', /ЗАВТРА, вт 2026-09-08/.test(b.out), b.out.split('\n')[0]);
  const c = await spat(root, 'me', ['tomorrow'], { SPAT_NOW: '2026-09-07T00:30:00+03:00', SPAT_TZ: 'UTC' });
  g.check('та же минута под SPAT_TZ=UTC — завтра пн 07.09', /ЗАВТРА, пн 2026-09-07/.test(c.out), c.out.split('\n')[0]);
  g.check('me читает все книги (правка няни в сетке пн)', /evening/.test((await spat(root, 'me', ['show', 'mon'])).out));
  return g;
}

// ---------------------------------------------- 6. six writers, one book
async function writers(): Promise<Group> {
  const g = new Group('6. six writers at once into one book — every one lands, whole, with its own seq (WAL)');
  const root = fresh();
  // 0 and 3 are both a write, and each trial sees only the fixture, so the
  // codes do not depend on the order the six land in
  const texts = ['skip walk tue', 'skip lunch wed', 'move lunch thu 14:30', 'skip cleaning sat', 'report c_sadik wed 13:35', 'car out wed 15:00-17:00'];
  const fixture = sql<{ n: number }[]>(root, "SELECT count(*) n FROM facts WHERE ledger = 'p_robin' AND pred = 'edit_at'")[0].n;
  const codes = await Promise.all(texts.map((t, i) => spat(root, 'robin', ['edit', t], { SPAT_NOW: `2026-08-31T21:3${i}:00+03:00` })));
  g.check('каждая записана (0 или 3), ни одна не отвергнута', codes.every((c) => c.code === 0 || c.code === 3), codes.map((c) => c.code).join(','));
  const rows = sql<{ seq: number; pred: string; edit: string }[]>(root, "SELECT seq, pred, edit FROM facts WHERE ledger = 'p_robin' ORDER BY seq");
  const entries = rows.filter((r) => r.pred === 'edit_at').length;
  g.check('книга цела: записи фикстуры + 6 новых', entries === fixture + 6, `edit_at rows: ${entries}, fixture ${fixture}`);
  g.check('ни одна правка не потеряна: каждая в столбце edit', texts.every((t) => rows.some((r) => r.edit === t)));
  g.check('у каждой строки свой seq, и записи не перемешаны: четыре факта правки идут подряд',
    new Set(rows.map((r) => r.seq)).size === rows.length && texts.every((t) => { const s = rows.filter((r) => r.edit === t).map((r) => r.seq); return s.length >= 4 && s[s.length - 1] - s[0] === s.length - 1; }));
  return g;
}

// ------------------------------------------------- 7. roll, ics, init
async function operator(): Promise<Group> {
  const g = new Group('7. roll, ics, init — the operator and the calendar');
  const root = fresh();
  const [worldN, usersN, worldTop] = [count(root, 'world'), count(root, 'users'), top(root, 'world')];
  g.code('robin roll (не оператор)', await spat(root, 'robin', ['roll', 'w0907']), 4);
  g.code('alex roll w0907', await spat(root, 'alex', ['roll', 'w0907']), 0);
  const rolled = sql<{ ledger: string }[]>(root, "SELECT ledger FROM facts WHERE pred = 'rolled'").map((x) => x.ledger);
  g.check('roll ушёл в p_me, не в книгу alex; meta.week = w0907', rolled.join(',') === 'p_me,p_me' && sql<{ value: string }[]>(root, "SELECT value FROM meta WHERE key = 'week'")[0]?.value === 'w0907', rolled.join(','));
  g.check('whoami: неделя w0907', /неделя w0907/.test((await spat(root, 'robin', ['whoami'])).out));
  g.check('--week-of w0831 отвечает по-старому (walk пн отменён правкой)', !/прогулка/.test((await spat(root, 'robin', ['show', 'mon', '--week-of', 'w0831'])).out));
  g.check('nanny не видит книгу robin (правка walk не в её сетке)', /прогулка/.test((await spat(root, 'nanny', ['show', 'mon', '--week-of', 'w0831'])).out));
  g.check('world и users не тронуты: те же строки, тот же последний seq', count(root, 'world') === worldN && count(root, 'users') === usersN && top(root, 'world') === worldTop);
  const ics = await spat(root, 'robin', ['ics', '--for', 'kit']);
  g.code('ics --for kit', ics, 0);
  const ev = ics.out.split('BEGIN:VEVENT').length - 1;
  g.check('ics: только блоки kit и блоки с ним, датированные из week_starts', ev > 0 && /DTSTART;TZID=Europe\/Nicosia:202609/.test(ics.out) && !/работа/.test(ics.out), `${ev} events`);
  // the operator admits the new tenant by hand in the users file init is given;
  // that is the whole admission — a sender the file does not list is not even a
  // caller there (5), a listed one who is not its operator is refused (4)
  const users2 = path.join(root, 'fam2-users.rofl');
  g.code('alex init fam2 без --users', await spat(root, 'alex', ['init', 'fam2', '--world', WEEK]), 2);
  fs.writeFileSync(users2, 'tg_user(robin, 100002, fam2, adult).\n');
  g.code('alex init fam2, в users нет строки alex', await spat(root, 'alex', ['init', 'fam2', '--world', WEEK, '--users', users2]), 5);
  fs.appendFileSync(users2, 'tg_user(alex, 100001, fam2, operator).\n');
  g.code('robin init (в fam2, не оператор)', await spat(root, 'robin', ['init', 'fam2', '--world', WEEK, '--users', users2]), 4);
  g.check('том fam2 не создан отказом', !fs.existsSync(path.join(root, 'fam2.sqlite')));
  g.code('alex init fam2', await spat(root, 'alex', ['init', 'fam2', '--world', WEEK, '--users', users2]), 0);
  g.check('init разложил том: users, world, книги взрослых и няни, p_me', fs.existsSync(path.join(root, 'fam2.sqlite')) && (() => {
    const v = openVolume(root, 'fam2');
    try { return v.db.prepare('SELECT ledger FROM books ORDER BY ledger').all().map((x) => x.ledger).join(',') === 'p_alex,p_me,p_nanny,p_robin' && readBook(v, 'world').length > 0 && readBook(v, 'users').length === 2; } finally { v.db.close(); }
  })());
  // the stand's migration in one command: the legacy directory's ledgers/*.rofl and me.rofl, each into its own book
  const mig = await spat(root, 'alex', ['volume', 'load', 'fam2', FIX], { SPAT_TENANT: 'fam2' });
  g.code('alex volume load fam2 <каталог store.example>', mig, 0);
  g.check('каталог: четыре книги ledgers/ и me, каждая в свою; books.rofl и trial.rofl не тронуты', (() => {
    const v = openVolume(root, 'fam2');
    try {
      const n = (l: string): number => (v.db.prepare('SELECT count(*) n FROM facts WHERE ledger = ?').get(l) as { n: number }).n;
      return n('p_alex') === 45 && n('p_robin') === 62 && n('p_nanny') === 40 && n('p_uncle') === 0 && n('p_me') === 1 && readBook(v, 'world').length > 0
        && (v.db.prepare('SELECT count(DISTINCT ledger) n FROM facts').get() as { n: number }).n === 6;
    } finally { v.db.close(); }
  })(), mig.out);
  g.code('alex теперь в двух семьях, без SPAT_TENANT', await spat(root, 'alex', ['whoami']), 5);
  g.code('init повторно', await spat(root, 'alex', ['init', 'fam2', '--world', WEEK, '--users', users2], { SPAT_TENANT: 'fam2' }), 6);
  g.check('whoami с SPAT_TENANT=fam2: тот же alex, новая семья', /семья fam2/.test((await spat(root, 'alex', ['whoami'], { SPAT_TENANT: 'fam2' })).out));
  return g;
}

// ---------------------------------- 9. nothing handed in becomes a second row
async function injection(): Promise<Group> {
  const g = new Group('9. nothing handed in becomes a second row — the book after each refusal has the same rows');
  const root = fresh();
  const before = [count(root, 'p_robin'), top(root, 'p_robin')].join('/');
  const same = (name: string): void => g.check(`${name}: книга robin — те же строки, тот же seq`, [count(root, 'p_robin'), top(root, 'p_robin')].join('/') === before);
  // PLANTED (3): a newline in the edit text — code 2, and SELECT count(*) is what it was
  g.code('правка с переводом строки (вторая строка — факт чужой книги)', await spat(root, 'robin', ['edit', 'add errand tue 18:30-20:00 robin office\ne_skip[p_alex](e_evil, walk, mon).']), 2);
  same('после \\n');
  g.code('правка с \\r', await spat(root, 'robin', ['edit', 'skip walk mon\re_skip[p_alex](e_evil, walk, mon).']), 2);
  same('после \\r');
  const nul = withEnv({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.robin }, () => codeOf(() => parseEdit(openStore(env()).r, 'skip walk mon\0e_skip[p_alex](e_evil, walk, mon).')));
  g.check('правка с NUL (в процессе: argv не переносит NUL) → код 2', nul.startsWith('code 2'), nul);
  g.code('хвост после последнего поля: person[p_robin](robin, operator).', await spat(root, 'robin', ['edit', 'skip walk mon person[p_robin](robin, operator).']), 2);
  same('после хвоста');
  g.code('SPAT_AS с клаузой внутри', await spat(root, 'me', ['whoami'], { SPAT_AS: 'robin). tg_user(robin, 1, example, operator' }), 5);
  g.code('SPAT_VIA с клаузой внутри', await spat(root, 'robin', ['edit', 'skip walk tue'], { SPAT_VIA: 'cli). e_skip[p_alex](e, walk, mon' }), 5);
  same('после SPAT_VIA');
  g.code('--week-of с клаузой внутри', await spat(root, 'robin', ['show', 'mon', '--week-of', 'w0831). e_skip[p_alex](e, walk, mon']), 2);
  g.code('--week-of неизвестной недели', await spat(root, 'robin', ['show', 'mon', '--week-of', 'w9999']), 2);
  const ok = await spat(root, 'robin', ['edit', 'skip walk tue']);
  g.code('и обычная правка после всего этого', ok, 0);
  const rows = sql<{ pred: string; edit: string; via: string }[]>(root, "SELECT pred, edit, via FROM facts WHERE ledger = 'p_robin' AND seq > ?", Number(before.split('/')[1]));
  g.check('след правки — столбцы, факты — ровно те, что задуманы', rows.map((r) => r.pred).join(',') === 'e_skip,edit_at,edit_via,for_week' && rows.every((r) => r.edit === 'skip walk tue' && r.via === 'cli'), JSON.stringify(rows));
  return g;
}

// ------------------------------------ 10. a dated day is shown under its own week
async function weekOfDate(): Promise<Group> {
  const g = new Group('10. tomorrow across the week boundary — a date is in one week, and never another');
  const root = fresh();
  // Sunday 06.09 21:30, week in force w0831: tomorrow is Monday 07.09 = w0907,
  // where the садик is open (w0831 had it shut on Monday) and walk is skipped all week
  const a = await spat(root, 'me', ['tomorrow'], { SPAT_NOW: '2026-09-06T21:30:00+03:00' });
  g.code('вс 06.09 21:30, в силе w0831: tomorrow', a, 0);
  g.check('заголовок: пн 2026-09-07, неделя w0907', /ЗАВТРА, пн 2026-09-07 \(неделя w0907\)/.test(a.out), a.out.split('\n')[0]);
  g.check('содержание — понедельник w0907, не w0831: садик открыт, прогулки нет (правка на w0907)', /sadik_nico/.test(a.out) && !/прогулка/.test(a.out), a.out);
  const b = await spat(root, 'me', ['tomorrow'], { SPAT_NOW: '2026-08-31T21:30:00+03:00' });
  g.check('пн 31.08: tomorrow — вт w0831 (садик закрыт)', /ЗАВТРА, вт 2026-09-01 \(неделя w0831\)/.test(b.out) && !/sadik_nico/.test(b.out), b.out.split('\n')[0]);
  const c = await spat(root, 'me', ['tomorrow'], { SPAT_NOW: '2026-09-27T21:30:00+03:00' });
  g.code('вс 27.09: завтра 28.09 — недели нет', c, 2);
  g.check('отказ называет понедельник и что нужно', /2026-09-28.*не заведена.*week_starts/.test(c.out), c.out);
  g.code('show (сегодня) 2026-09-28 — та же неделя, тот же отказ', await spat(root, 'robin', ['show'], { SPAT_NOW: '2026-09-28T09:00:00+03:00' }), 2);
  const w = await spat(root, 'robin', ['whoami'], { SPAT_NOW: '2026-09-07T10:00:00+03:00' });
  g.check('пн 07.09 при w0831 в силе: предупреждение «нужен roll w0907» (правило stale_week)', /в силе неделя w0831.*сегодня неделя w0907.*roll w0907/.test(w.out), w.out);
  return g;
}

// ------------------- 11. the volume: only INSERT, a round trip, and what is public
/** The facts of a book as a set: relation and canonical terms, no trail. */
const factSet = (v: Volume, ledger: string): Set<string> =>
  new Set(readBook(v, ledger).map((c) => `${c.head.rel}(${c.head.args.map(canonTerm).join(',')})`));
/** The store's world built the way the loader builds it — the program signed
 *  `rules`, the household anonymous — with one line more in the program. */
function signed(planted: string): Rofl {
  const r = new Rofl();
  const ok = [r.load(BOOT),
    r.assert('authority(main, rules).\ntenant(example).\ncaller(robin).\nauthority(p_robin, robin).\ndate_monday(today, "2026-08-31").\ndate_monday(tomorrow, "2026-08-31").'),
    r.assert(`${SPAT}\n${ACCESS}\n${VOLUMES}\n${planted}`, { who: 'rules' }),
    r.assert(fs.readFileSync(WEEK, 'utf8') + fs.readFileSync(path.join(FIX, 'users.rofl'), 'utf8'))];
  if (!ok.every((x) => x.ok)) throw new Error(ok.flatMap((x) => x.diagnostics).join('; '));
  r.evaluate();
  return r;
}
async function volume(): Promise<Group> {
  const g = new Group('11. the volume — INSERT only, a book round-trips through text, a person in a public book is an audit row');
  const root = fresh();
  const v = openVolume(root, 'example');
  const n = count(root, 'p_robin');
  // PLANTED (1): an UPDATE and a DELETE, by hand — the trigger, not the tool, says no
  const upd = codeOf(() => v.db.exec("UPDATE facts SET pred = 'e_skip' WHERE ledger = 'p_robin'"));
  const del = codeOf(() => v.db.exec("DELETE FROM facts WHERE ledger = 'p_robin'"));
  g.check('UPDATE facts → триггер отказывает', /INSERT only/.test(upd), upd);
  g.check('DELETE facts → триггер отказывает', /INSERT only/.test(del), del);
  g.check('строк столько же', count(root, 'p_robin') === n, `${n} -> ${count(root, 'p_robin')}`);
  v.db.prepare("INSERT INTO facts(ledger, pred, args, at, via, edit) VALUES ('p_robin', 'edit_via', '[{\"k\":\"a\",\"name\":\"e_x\"},{\"k\":\"a\",\"name\":\"cli\"}]', 'x', 'cli', null)").run();
  g.check('положительный контроль: INSERT проходит, строк на одну больше', count(root, 'p_robin') === n + 1);
  // a rule in a book, at the import: refused whole
  const ruled = path.join(root, 'uncle.rofl');
  fs.writeFileSync(ruled, 'e_skip[p_uncle](e_u1, walk, mon).\nacts(E) :- e_skip[p_uncle](E, _, _).\n');
  const rl = codeOf(() => load(v, ruled, TRAIL));
  g.check('volume load файла с правилом → код 6, ни одной строки', rl.startsWith('code 6') && /правило в книге/.test(rl) && count(root, 'p_uncle') === 0, rl);
  // THE ROUND TRIP: dump every book of the fixture, load the dumps into a
  // second volume, compare the books as sets of terms — the trail differs,
  // the facts may not. A wrong term encoding, a lost string, a swapped
  // book would all show here as a set difference.
  const root2 = fs.mkdtempSync(path.join(ROOT, 'r-'));
  const v2 = openVolume(root2, 'example', true);
  const ledgers = ['world', 'users', 'p_alex', 'p_me', 'p_nanny', 'p_robin', 'p_uncle'];
  const diffs: string[] = [];
  for (const l of ledgers) {
    const text = render(v, l);
    fs.writeFileSync(path.join(root2, `${l}.rofl`), text);
    load(v2, path.join(root2, `${l}.rofl`), { at: '2026-09-01T00:00:00+03:00', via: 'cli', edit: 'reload' }, l);
    const a = factSet(v, l); const b = factSet(v2, l);
    for (const x of a) if (!b.has(x)) diffs.push(`${l}: -${x}`);
    for (const x of b) if (!a.has(x)) diffs.push(`${l}: +${x}`);
    if (a.size === 0 && l !== 'p_uncle') diffs.push(`${l}: empty`);
  }
  g.check(`dump → load → те же факты в каждой из ${ledgers.length} книг (множества термов; строки со строками, числа с числами)`, diffs.length === 0, diffs.slice(0, 5).join(' | '));
  g.check('dump детерминирован: два рендера одной книги байт-в-байт', render(v, 'p_alex') === render(v, 'p_alex') && render(v2, 'p_alex').split('\n').filter((x) => !x.startsWith('--')).join('\n') === render(v, 'p_alex').split('\n').filter((x) => !x.startsWith('--')).join('\n'));
  const strings = readBook(v2, 'world').filter((c) => c.head.rel === 'week_starts').flatMap((c) => c.head.args.filter((t) => t.k === 's')).length;
  g.check('строки мира остались строками после круга (week_starts: 2 даты)', strings === 2, String(strings));
  // THE DUMP SAYS WHAT IT IS: its first clause is the marker, a load into
  // another book is refused, and a load into its own strips the marker
  const first = (t: string): string => t.split('\n').find((l) => l !== '' && !l.startsWith('--')) ?? '';
  g.check('первая клауза дампа — dump_of(example, p_alex, private), в книге после круга её нет', first(render(v, 'p_alex')) === 'dump_of(example, p_alex, private).' && !factSet(v2, 'p_alex').has('dump_of(example,p_alex,private)'), first(render(v, 'p_alex')));
  const wrong = codeOf(() => load(v2, path.join(root2, 'world.rofl'), TRAIL, 'p_robin'));
  g.check('дамп world в книгу p_robin → код 6 по метке, ни одной строки', wrong.startsWith('code 6') && /дамп книги world/.test(wrong) && factSet(v2, 'p_robin').size === factSet(v, 'p_robin').size, wrong);
  v.db.close(); v2.db.close();
  // PLANTED (P2-A): a tag smuggled into `pred` by hand — the loader and the dump refuse the book, naming the row
  const root3 = fresh();
  const v3 = openVolume(root3, 'example');
  v3.db.prepare("INSERT INTO facts(ledger, pred, args, at, via, edit) VALUES ('p_robin', 'e_skip[p_alex]', '[{\"k\":\"a\",\"name\":\"e_forge1\"},{\"k\":\"a\",\"name\":\"walk\"},{\"k\":\"a\",\"name\":\"tue\"}]', 'x', 'cli', 'planted by hand')").run();
  const seq = (v3.db.prepare('SELECT max(seq) s FROM facts').get() as { s: number }).s;
  v3.db.close();
  const pr = await spat(root3, 'robin', ['whoami']);
  g.code('строка pred=e_skip[p_alex] в p_robin, вставленная руками: whoami', pr, 6);
  g.check('код 6 называет книгу, seq и pred', new RegExp(`example\\.sqlite/p_robin seq ${seq}: pred не атом: e_skip\\[p_alex\\]`).test(pr.out), pr.out);
  g.code('volume dump той же книги', await spat(root3, 'alex', ['volume', 'dump', 'example', 'p_robin']), 6);
  // PLANTED (4): a person's Russian name in a PUBLIC book — the audit names her
  const clean = signed('');
  const dirty = signed('ru_name(robin, "Робин").');
  const rows = (r: Rofl): string => r.query('private_in_public[audit](A)').rows.map((x) => String(x.bindings.A)).sort().join(',');
  g.check('чистая программа: private_in_public пуст, from_public непуст (подпись `rules` работает)', rows(clean) === '' && clean.query('from_public(F, B)').rows.length > 50, `${rows(clean)} / ${clean.query('from_public(F, B)').rows.length}`);
  g.check('ru_name(robin, …) в публичной книге → private_in_public[audit](robin)', rows(dirty) === 'robin', rows(dirty));
  // ...and the other door: a dump loaded into a public world unsigned, as a walk would — the marker is the second source
  const swallowed = new Rofl();
  swallowed.load(BOOT); swallowed.assert(`${SPAT}\n${ACCESS}\n${VOLUMES}`); swallowed.assert(fs.readFileSync(path.join(root2, 'world.rofl'), 'utf8')); swallowed.evaluate();
  const people = swallowed.query('person(P, K)').rows.map((x) => String(x.bindings.P)).sort().join(',');
  g.check(`дамп мира в публичном мире (без подписи) → private_in_public называет каждого из дома: ${people}`, rows(swallowed) === people && people.split(',').length === 8, rows(swallowed));
  const live = withEnv({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.robin }, () => openStore(env()).r);
  g.check('живой том: аудиты молчат, объявления есть (book 10, book_source 9 — the household\'s rule book among them), программа подписана',
    live.query('private_in_public[audit](A)').rows.length === 0 && live.query('misplaced[audit](B, W)').rows.length === 0
    && live.query('book(B, V)').rows.length === 10 && live.query('book_source(B, W)').rows.length === 9 && live.query('from_public(F, B)').rows.length > 50);
  return g;
}

// ------------------- 8. the rules materialise; every reason has Russian
function reasons(): Group {
  const g = new Group('8. every rule of the store materialises; every reason has Russian (from a scan, not a list)');
  // A RULE THAT LOSES A BINDER IS NOT REFUSED, IT GOES QUIET: the engine
  // unfolds a body that is not range-restricted on demand, and a relation
  // nobody demands is empty. Measured 2026-09-14 over access.rofl: 85 of 149
  // dropped premises leave a rule unsafe, and the census sees none of them.
  // This is the check that does — the same one the deleted suite carried.
  const root = fresh();
  const ev = withEnv({ SPAT_ROOT: root, SPAT_TENANT: 'example', SPAT_AS: 'robin' }, () => new Evaluation(openStore(env()).r.store, {}));
  const unsafe = ev.rules.filter((x) => !x.safe).map((x) => x.canon);
  g.check('ни одно правило не demand-backed: все материализуются', unsafe.length === 0 && ev.demandRels.size === 0, `unsafe: ${unsafe.join(' | ')}; demand: ${[...ev.demandRels].join(',')}`);
  const heads = new Set([...SPAT.matchAll(/^broken\((\w+)\)\s*:-/gm)].map((m) => m[1]));
  g.check('scan нашёл не меньше восьми причин', heads.size >= 8, String(heads.size));
  const noRu = [...heads].filter((h) => !(h in RU_BROKEN));
  const dead = Object.keys(RU_BROKEN).filter((k) => !heads.has(k));
  g.check('каждая причина broken/1 имеет русское имя, и каждое имя — причину', noRu.length === 0 && dead.length === 0, `no ru: ${noRu.join(',')}; dead: ${dead.join(',')}`);
  return g;
}

const t0 = Date.now();
// SIX GROUPS AT A TIME, in a fixed order of results. Fourteen at once on four
// cores is fourteen node processes contending for the same fixpoint; six keeps
// the cores busy and the memory flat (measured 2026-09-15 under load 30: two
// spawns of fourteen came back killed with no output).
const todo = [tagWall, rights, stranger, breaks, tomorrow, writers, operator, injection, weekOfDate, volume];
const groups: Group[] = new Array(todo.length);
let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => { while (next < todo.length) { const i = next++; groups[i] = await todo[i](); } }));
groups.push(reasons());
for (const g of groups) for (const l of g.lines) console.log(l);
const n = groups.reduce((a, g) => a + g.n, 0);
const fails = groups.reduce((a, g) => a + g.fails, 0);
console.log(`\n${n - fails}/${n} scenarios`);
// the wall time goes to stderr: the host hashes stdout, and `47 s` is not a
// shape its timing mask knows (one digit before the unit is)
console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(fails === 0 ? 0 : 1);

