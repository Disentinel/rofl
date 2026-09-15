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

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { canonTerm } from '../../src/unify.ts';
import { BOOT, SPAT } from './spat.ts';
import { RU_BROKEN } from './html.ts';
import { ACCESS, SpatError, VOLUMES, env, openStore, type Store } from './store.ts';
import { parseEdit, run as verb } from './edits.ts';
import { load, openVolume, readBook, render, type Volume } from './volume.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'spat-demo-'));
const CLI = path.join(HERE, 'spat.ts');
const NOW = '2026-08-31T21:30:00+03:00';
const WEEK = path.join(HERE, 'week.example.rofl');
const FIX = path.join(HERE, 'store.example');
const mask = (s: string): string => s.split(ROOT).join('$ROOT');
const TRAIL = { at: NOW, via: 'cli', edit: 'load store.example' };

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

/** A fresh tenant under its own root: the shipped fixture imported into a
 *  volume the way the stand migrates — one `volume load` per book. */
function fresh(): string {
  const root = fs.mkdtempSync(path.join(ROOT, 'r-'));
  const v = openVolume(root, 'example', true);
  load(v, path.join(FIX, 'users.rofl'), TRAIL);
  load(v, WEEK, TRAIL, 'world');
  for (const f of fs.readdirSync(path.join(FIX, 'ledgers')).sort()) load(v, path.join(FIX, 'ledgers', f), TRAIL);
  load(v, path.join(FIX, 'me.rofl'), TRAIL);
  v.db.close();
  return root;
}
/** The database, asked directly — what a demo may do and the tool may not. */
function sql<T>(root: string, q: string, ...args: (string | number)[]): T {
  const v = openVolume(root, 'example');
  try { return v.db.prepare(q).all(...args) as unknown as T; } finally { v.db.close(); }
}
const count = (root: string, ledger: string): number =>
  sql<{ n: number }[]>(root, 'SELECT count(*) n FROM facts WHERE ledger = ?', ledger)[0].n;
const top = (root: string, ledger: string): number =>
  sql<{ s: number }[]>(root, 'SELECT coalesce(max(seq), 0) s FROM facts WHERE ledger = ?', ledger)[0].s;

interface Res { code: number; out: string; }
/** The people call as Telegram senders — SPAT_FROM_ID, and the users book says
 *  who and which family; `me` calls by name, as the scheduler does. */
const FROM: Record<string, string> = { alex: '100001', robin: '100002', nanny: '100003', mallory: '100004', uncle: '100005' };
function spat(root: string, as: string, args: string[], extra: Record<string, string | undefined> = {}): Promise<Res> {
  const who = FROM[as] ? { SPAT_FROM_ID: FROM[as] } : { SPAT_AS: as, SPAT_TENANT: 'example' };
  const e: Record<string, string | undefined> = { ...process.env, SPAT_ROOT: root, SPAT_TZ: 'Europe/Nicosia', SPAT_NOW: NOW, ...who, ...extra };
  for (const k of ['SPAT_AS', 'SPAT_FROM_ID', 'SPAT_TENANT']) if (!(k in who) && !(k in extra)) delete e[k];
  for (const k of Object.keys(extra)) if (extra[k] === undefined) delete e[k];
  return new Promise((resolve) => {
    // node:sqlite still warns `ExperimentalWarning` on 22.x, with the pid in the line; the stand silences it the same way
    const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--experimental-strip-types', CLI, ...args], { env: e });
    let out = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('error', (e) => { out += `spawn: ${e.message}`; });
    p.on('close', (code, signal) => resolve({ code: code ?? -1, out: mask(out + (signal ? ` [${signal}]` : '')) }));
  });
}
const withEnv = <T,>(vars: Record<string, string>, f: () => T): T => {
  const saved = { ...process.env };
  for (const k of ['SPAT_AS', 'SPAT_FROM_ID', 'SPAT_TENANT']) delete process.env[k];
  Object.assign(process.env, { SPAT_NOW: NOW, ...vars });
  try { return f(); } finally {
    for (const k of ['SPAT_ROOT', 'SPAT_TENANT', 'SPAT_AS', 'SPAT_FROM_ID', 'SPAT_NOW']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
};
const codeOf = (f: () => unknown): string => { try { f(); return 'no throw'; } catch (e) { return e instanceof SpatError ? `code ${e.code}: ${e.message}` : String(e); } };
/** A verb run IN THIS PROCESS over an opened store — the same code path as
 *  the CLI minus the process: one world can answer several refusals, where
 *  a spawn per refusal is one evaluation each (measured: 1.2 s of a spawn's
 *  1.45 s is the fixpoint, and the demo is CPU-bound on four cores). */
function inproc(vars: Record<string, string>, f: (s: Store) => number): Res {
  const lines: string[] = []; const log = console.log;
  console.log = (...xs: unknown[]): void => { lines.push(xs.map(String).join(' ')); };
  try { return withEnv(vars, () => { try { return { code: f(openStore(env())), out: mask(lines.join('\n')) }; } catch (e) { return { code: e instanceof SpatError ? e.code : -1, out: mask(lines.concat(String((e as Error).message)).join('\n')) }; } }); }
  finally { console.log = log; }
}
const asRobin = (root: string): Record<string, string> => ({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.robin });

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
      return n('p_alex') === 45 && n('p_robin') === 44 && n('p_nanny') === 40 && n('p_uncle') === 0 && n('p_me') === 1 && readBook(v, 'world').length > 0
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
const todo = [tagWall, rights, stranger, breaks, tomorrow, writers, operator, injection, weekOfDate, volume, datedEdits, recurring, hypotheses, ruleBooks];
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
