// demo.ts — SPAT's host contract, exercised: the multi-user store from the
// outside. `npm run test:hosts` hashes this output and its exit code; a
// planted defect flips a line to FAIL and the exit to 1, so every scenario
// below is a test that can say no. Each group is one of the defects the
// brief plants, named after it, and runs against its own copy of
// examples/spat/store.example in a temp dir — the shipped household, never a
// real one.
//
// THE GROUPS RUN AT ONCE AND PRINT IN ORDER. One `spat` call is a node
// process that evaluates the whole model, 1.7 s on a quiet machine; fifty of
// them in a row is 100 s, which is inside the host's 120 s limit only while
// nothing else runs. Measured 2026-09-14: the first bless of this demo caught
// it mid-run and recorded exit -1. Groups are independent, so they share the
// cores; the output is assembled afterwards so the hash does not depend on
// which finished first.
//
//   node --experimental-strip-types examples/spat/demo.ts

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { Evaluation } from '../../src/engine.ts';
import { SPAT } from './spat.ts';
import { RU_BROKEN } from './html.ts';
import { SpatError, bookClauses, env, openStore } from './store.ts';
import { parseEdit } from './edits.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'spat-demo-'));
const CLI = path.join(HERE, 'spat.ts');
const NOW = '2026-08-31T21:30:00+03:00';
const WEEK = path.join(HERE, 'week.example.rofl');
const mask = (s: string): string => s.split(ROOT).join('$ROOT');
const bytes = (f: string): string => fs.readFileSync(f, 'utf8');

/** One group's lines and verdicts, printed together when every group is done. */
class Group {
  lines: string[] = []; fails = 0; n = 0;
  constructor(title: string) { this.lines.push(`\n${title}`); }
  check(name: string, ok: boolean, detail = ''): void {
    this.n++;
    this.lines.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n       ${mask(detail)}`}`);
    if (!ok) this.fails++;
  }
  code(name: string, r: Res, want: number): void {
    this.check(`${name} → код ${want}`, r.code === want, `got ${r.code}: ${r.out.split('\n')[0]}`);
  }
}

/** A fresh tenant from the shipped fixture, under its own root. */
function fresh(): string {
  const root = fs.mkdtempSync(path.join(ROOT, 'r-'));
  const dir = path.join(root, 'example');
  fs.cpSync(path.join(HERE, 'store.example'), dir, { recursive: true });
  fs.renameSync(path.join(dir, 'users.rofl'), path.join(root, 'users.rofl'));
  fs.rmSync(path.join(dir, 'books.rofl')); fs.rmSync(path.join(dir, 'trial.rofl'));
  fs.copyFileSync(WEEK, path.join(dir, 'world.rofl'));
  return root;
}

interface Res { code: number; out: string; }
/** The people call as Telegram senders — SPAT_FROM_ID, and users.rofl says
 *  who and which family; `me` calls by name, as the scheduler does. */
const FROM: Record<string, string> = { alex: '100001', robin: '100002', nanny: '100003', mallory: '100004', uncle: '100005' };
function spat(root: string, as: string, args: string[], extra: Record<string, string | undefined> = {}): Promise<Res> {
  const who = FROM[as] ? { SPAT_FROM_ID: FROM[as] } : { SPAT_AS: as, SPAT_TENANT: 'example' };
  const e: Record<string, string | undefined> = { ...process.env, SPAT_ROOT: root, SPAT_TZ: 'Europe/Nicosia', SPAT_NOW: NOW, ...who, ...extra };
  for (const k of ['SPAT_AS', 'SPAT_FROM_ID', 'SPAT_TENANT']) if (!(k in who) && !(k in extra)) delete e[k];
  for (const k of Object.keys(extra)) if (extra[k] === undefined) delete e[k];
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['--experimental-strip-types', CLI, ...args], { env: e });
    let out = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code: code ?? -1, out: mask(out) }));
  });
}

// ------------------------------------------------------- 1. the tag wall
async function tagWall(): Promise<Group> {
  const g = new Group('1. the tag wall — a line of another book');
  const root = fresh();
  const book = path.join(root, 'example/ledgers/robin.rofl');
  fs.appendFileSync(book, 'e_skip[p_alex](e_forged, walk, tue).\n');
  const r = await spat(root, 'robin', ['whoami']);
  g.code('строка [p_alex] в robin.rofl', r, 6);
  g.check('код 6 называет файл и строку', /robin\.rofl:\d+.*\[p_alex\].*\[p_robin\]/.test(r.out), r.out);
  let loaded: number | string = 'threw';
  try { loaded = bookClauses({ book: 'p_robin', user: 'robin', file: book }, bytes(book)).length; } catch (e) { loaded = (e as Error).message.includes('robin.rofl:') ? 'threw' : 'other'; }
  g.check('ни один факт файла не загружен: валидные строки перед плохой не возвращены', loaded === 'threw');
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
  const n = await spat(root, 'nanny', ['edit', 'move pickup wed 15:00']);
  g.code('nanny: move pickup (c_pickup — robin, household)', n, 4);
  g.check('код 4 говорит, кто может', /может: alex, robin/.test(n.out), n.out);
  g.check('на диск ничего: nanny.rofl как был', bytes(path.join(root, 'example/ledgers/nanny.rofl')) === bytes(path.join(HERE, 'store.example/ledgers/nanny.rofl')));
  g.code('robin: report c_pickup (не внешнее)', await spat(root, 'robin', ['edit', 'report c_pickup mon 14:10']), 4);
  g.code('правка не разобрана', await spat(root, 'robin', ['edit', 'move nothing 25:00']), 2);
  return g;
}

// -------------------------------------------------------- 3. the stranger
/** What the loader had opened when it refused, asked in-process. */
function openedBy(vars: Record<string, string>): string {
  const saved = { ...process.env };
  for (const k of ['SPAT_AS', 'SPAT_FROM_ID', 'SPAT_TENANT']) delete process.env[k];
  Object.assign(process.env, { SPAT_NOW: NOW, ...vars });
  let opened = ['opened nothing and did not refuse'];
  try { openStore(env()); } catch (e) { opened = (e as SpatError).opened.map((f) => path.relative(vars.SPAT_ROOT, f)); }
  for (const k of ['SPAT_ROOT', 'SPAT_TENANT', 'SPAT_AS', 'SPAT_FROM_ID', 'SPAT_NOW']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  return opened.join(' ');
}
async function stranger(): Promise<Group> {
  const g = new Group('3. the stranger — code 5 before a book is opened');
  const root = fresh();
  g.code('SPAT_AS=mallory (другой арендатор)', await spat(root, 'me', ['show'], { SPAT_AS: 'mallory' }), 5);
  g.check('до отказа открыты только world.rofl и users.rofl, ни одной книги',
    openedBy({ SPAT_ROOT: root, SPAT_TENANT: 'example', SPAT_AS: 'mallory' }) === 'example/world.rofl users.rofl');
  const r = await spat(root, 'me', ['show'], { SPAT_AS: undefined, SPAT_FROM_ID: '424242' });
  g.code('SPAT_FROM_ID неизвестный', r, 5);
  g.check('текст: «я вас не знаю; добавить может владелец»', /я вас не знаю.*добавить может владелец/.test(r.out), r.out);
  g.check('до отказа открыт только users.rofl — ни мира, ни книг', openedBy({ SPAT_ROOT: root, SPAT_FROM_ID: '424242' }) === 'users.rofl');
  g.code('SPAT_AS и SPAT_FROM_ID вместе', await spat(root, 'robin', ['show'], { SPAT_AS: 'robin', SPAT_TENANT: 'example' }), 5);
  g.code('ни SPAT_AS, ни SPAT_FROM_ID', await spat(root, 'me', ['show'], { SPAT_AS: undefined }), 5);
  g.code('SPAT_FROM_ID robin + SPAT_TENANT другой семьи', await spat(root, 'robin', ['show'], { SPAT_TENANT: 'elsewhere' }), 5);
  const w = await spat(root, 'robin', ['whoami']);
  g.check('SPAT_FROM_ID robin без SPAT_TENANT: семья из users.rofl', w.code === 0 && /я: robin \(from_id 100002\).*семья example/.test(w.out), w.out.split('\n')[0]);
  g.code('mallory по id: её семья elsewhere не развёрнута', await spat(root, 'mallory', ['show']), 5);
  g.code('неизвестный глагол', await spat(root, 'robin', ['dance']), 2);
  return g;
}

// ---------------------------------------------- 4. breaks, confirm, retract
async function breaks(): Promise<Group> {
  const g = new Group('4. breaks the day — proposed, confirmed by its author, retracted');
  const root = fresh();
  g.code('robin: sick alex tue', await spat(root, 'robin', ['edit', 'sick alex tue']), 0);
  const r = await spat(root, 'robin', ['edit', 'add errand tue 18:30-20:00 robin office'], { SPAT_NOW: '2026-08-31T21:31:00+03:00' });
  g.code('robin: errand вт 18:30 — дети одни', r, 3);
  const id = /confirm (e_[0-9a-f]+)/.exec(r.out)?.[1] ?? '';
  g.check('код 3 называет дыру, чьё ограничение и id', /НЕ ПОКРЫТ вт.*nico/s.test(r.out) && /robin\s+e_[0-9a-f]+\s+robin\s+наше/.test(r.out) && id !== '', r.out);
  g.check('записано как proposed', new RegExp(`proposed\\[p_robin\\]\\(${id}\\)`).test(bytes(path.join(root, 'example/ledgers/robin.rofl'))));
  g.check('show вт: правка не действует', !/errand/.test((await spat(root, 'robin', ['show', 'tue'])).out));
  g.code('alex confirm чужой правки', await spat(root, 'alex', ['confirm', id]), 4);
  g.code('robin confirm своей', await spat(root, 'robin', ['confirm', id]), 0);
  const after = (await spat(root, 'robin', ['show', 'tue'])).out;
  g.check('show вт: правка действует, дыра видна', /errand/.test(after) && /НЕ ПОКРЫТ вт/.test(after), after);
  g.code('robin retract', await spat(root, 'robin', ['retract', id]), 0);
  g.code('confirm отозванной', await spat(root, 'robin', ['confirm', id]), 2);
  g.check('книга только росла: ни одной строки не пропало', bytes(path.join(root, 'example/ledgers/robin.rofl')).startsWith(bytes(path.join(HERE, 'store.example/ledgers/robin.rofl'))));
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
  const g = new Group('6. six writers at once into one book');
  const root = fresh();
  // 0 and 3 are both a write, and each trial sees only the fixture, so the
  // codes do not depend on the order the six land in
  const texts = ['skip walk tue', 'skip lunch wed', 'move lunch thu 14:30', 'skip cleaning sat', 'report c_sadik wed 13:35', 'car out wed 15:00-17:00'];
  const codes = await Promise.all(texts.map((t, i) => spat(root, 'robin', ['edit', t], { SPAT_NOW: `2026-08-31T21:3${i}:00+03:00` })));
  g.check('каждая записана (0 или 3), ни одна не отвергнута', codes.every((c) => c.code === 0 || c.code === 3), codes.map((c) => c.code).join(','));
  const book = path.join(root, 'example/ledgers/robin.rofl');
  let entries = -1;
  try { entries = bookClauses({ book: 'p_robin', user: 'robin', file: book }, bytes(book)).filter((c) => c.head.rel === 'edit_at').length; } catch { entries = -1; }
  const fixture = (bytes(path.join(HERE, 'store.example/ledgers/robin.rofl')).match(/^edit_at\[/gm) ?? []).length;
  g.check('книга цела: разбирается, записи фикстуры + 6 новых', entries === fixture + 6, `edit_at rows: ${entries}, fixture ${fixture}`);
  g.check('ни одна строка не потеряна: каждая правка в книге', texts.every((t) => bytes(book).includes(`: ${t}\n`)));
  return g;
}

// ------------------------------------------------- 7. roll, ics, init
async function operator(): Promise<Group> {
  const g = new Group('7. roll, ics, init — the operator and the calendar');
  const root = fresh();
  g.code('robin roll (не оператор)', await spat(root, 'robin', ['roll', 'w0907']), 4);
  g.code('alex roll w0907', await spat(root, 'alex', ['roll', 'w0907']), 0);
  g.check('roll ушёл в me.rofl, не в книгу alex', /rolled\[p_me\]\(w0907/.test(bytes(path.join(root, 'example/me.rofl'))) && !/rolled/.test(bytes(path.join(root, 'example/ledgers/alex.rofl'))));
  g.check('whoami: неделя w0907', /неделя w0907/.test((await spat(root, 'robin', ['whoami'])).out));
  g.check('--week-of w0831 отвечает по-старому (walk пн отменён правкой)', !/прогулка/.test((await spat(root, 'robin', ['show', 'mon', '--week-of', 'w0831'])).out));
  g.check('nanny не видит книгу robin (правка walk не в её сетке)', /прогулка/.test((await spat(root, 'nanny', ['show', 'mon', '--week-of', 'w0831'])).out));
  g.check('world.rofl и users.rofl не тронуты', bytes(path.join(root, 'example/world.rofl')) === bytes(WEEK)
    && bytes(path.join(root, 'users.rofl')) === bytes(path.join(HERE, 'store.example/users.rofl')));
  const ics = await spat(root, 'robin', ['ics', '--for', 'kit']);
  g.code('ics --for kit', ics, 0);
  const ev = ics.out.split('BEGIN:VEVENT').length - 1;
  g.check('ics: только блоки kit и блоки с ним, датированные из week_starts', ev > 0 && /DTSTART;TZID=Europe\/Nicosia:202609/.test(ics.out) && !/работа/.test(ics.out), `${ev} events`);
  // the operator admits the new tenant by hand in users.rofl first; that is the
  // whole admission — a sender the new family does not list is not even a
  // caller there (5), a listed one who is not its operator is refused (4)
  g.code('alex init fam2 без строки в users.rofl', await spat(root, 'alex', ['init', 'fam2', '--world', WEEK]), 5);
  fs.appendFileSync(path.join(root, 'users.rofl'), 'tg_user(alex, 100001, fam2, operator).\ntg_user(robin, 100002, fam2, adult).\n');
  g.code('robin init (в fam2, не оператор)', await spat(root, 'robin', ['init', 'fam2', '--world', WEEK]), 4);
  g.code('alex теперь в двух семьях, без SPAT_TENANT', await spat(root, 'alex', ['whoami']), 5);
  g.code('alex init fam2', await spat(root, 'alex', ['init', 'fam2', '--world', WEEK]), 0);
  g.check('init разложил каталог: world, книги взрослых и няни, me', ['world.rofl', 'me.rofl', 'ledgers/alex.rofl', 'ledgers/robin.rofl', 'ledgers/nanny.rofl']
    .every((f) => fs.existsSync(path.join(root, 'fam2', f))) && !fs.existsSync(path.join(root, 'fam2/ledgers/kit.rofl')));
  g.code('init повторно', await spat(root, 'alex', ['init', 'fam2', '--world', WEEK]), 6);
  g.check('whoami с SPAT_TENANT=fam2: тот же alex, новая семья', /семья fam2/.test((await spat(root, 'alex', ['whoami'], { SPAT_TENANT: 'fam2' })).out));
  return g;
}

// ---------------------------------- 9. nothing handed in becomes a second line
async function injection(): Promise<Group> {
  const g = new Group('9. nothing handed in becomes a second line — the book after each refusal is byte-identical');
  const root = fresh();
  const book = path.join(root, 'example/ledgers/robin.rofl');
  const before = bytes(book);
  const same = (name: string): void => g.check(`${name}: robin.rofl байт-в-байт`, bytes(book) === before);
  g.code('правка с переводом строки (вторая строка — факт чужой книги)', await spat(root, 'robin', ['edit', 'add errand tue 18:30-20:00 robin office\ne_skip[p_alex](e_evil, walk, mon).']), 2);
  same('после \\n');
  g.code('правка с \\r', await spat(root, 'robin', ['edit', 'skip walk mon\re_skip[p_alex](e_evil, walk, mon).']), 2);
  same('после \\r');
  let nul = 'no throw';
  try { parseEdit(openStoreAs(root).r, 'skip walk mon\0e_skip[p_alex](e_evil, walk, mon).'); } catch (e) { nul = e instanceof SpatError && e.code === 2 ? 'code 2' : String(e); }
  g.check('правка с NUL (в процессе: argv не переносит NUL) → код 2', nul === 'code 2', nul);
  g.code('хвост после последнего поля: person[p_robin](robin, operator).', await spat(root, 'robin', ['edit', 'skip walk mon person[p_robin](robin, operator).']), 2);
  same('после хвоста');
  g.code('SPAT_AS с клаузой внутри', await spat(root, 'me', ['whoami'], { SPAT_AS: 'robin). tg_user(robin, 1, example, operator' }), 5);
  g.code('SPAT_VIA с клаузой внутри', await spat(root, 'robin', ['edit', 'skip walk tue'], { SPAT_VIA: 'cli). e_skip[p_alex](e, walk, mon' }), 5);
  same('после SPAT_VIA');
  g.code('--week-of с клаузой внутри', await spat(root, 'robin', ['show', 'mon', '--week-of', 'w0831). e_skip[p_alex](e, walk, mon']), 2);
  g.code('--week-of неизвестной недели', await spat(root, 'robin', ['show', 'mon', '--week-of', 'w9999']), 2);
  const ok = await spat(root, 'robin', ['edit', 'skip walk tue']);
  g.code('и обычная правка после всего этого', ok, 0);
  g.check('след правки — одна строка комментария, факты — ровно те, что задуманы', bytes(book).slice(before.length).split('\n').filter((l) => l !== '').length === 5);
  return g;
}
function openStoreAs(root: string): ReturnType<typeof openStore> {
  const saved = { ...process.env };
  for (const k of ['SPAT_AS', 'SPAT_FROM_ID', 'SPAT_TENANT']) delete process.env[k];
  Object.assign(process.env, { SPAT_ROOT: root, SPAT_FROM_ID: FROM.robin, SPAT_NOW: NOW });
  try { return openStore(env()); } finally {
    for (const k of ['SPAT_ROOT', 'SPAT_TENANT', 'SPAT_AS', 'SPAT_FROM_ID', 'SPAT_NOW']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
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

// ------------------- 8. the rules materialise; every reason has Russian
function reasons(): Group {
  const g = new Group('8. every rule of the store materialises; every reason has Russian (from a scan, not a list)');
  // A RULE THAT LOSES A BINDER IS NOT REFUSED, IT GOES QUIET: the engine
  // unfolds a body that is not range-restricted on demand, and a relation
  // nobody demands is empty. Measured 2026-09-14 over access.rofl: 85 of 149
  // dropped premises leave a rule unsafe, and the census sees none of them.
  // This is the check that does — the same one the deleted suite carried.
  const root = fresh();
  const saved = { ...process.env };
  Object.assign(process.env, { SPAT_ROOT: root, SPAT_TENANT: 'example', SPAT_AS: 'robin', SPAT_NOW: NOW });
  const ev = new Evaluation(openStore(env()).r.store, {});
  for (const k of ['SPAT_ROOT', 'SPAT_TENANT', 'SPAT_AS', 'SPAT_NOW']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
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
const groups = await Promise.all([tagWall(), rights(), stranger(), breaks(), tomorrow(), writers(), operator(), injection(), weekOfDate()]);
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
