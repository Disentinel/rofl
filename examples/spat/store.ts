// store.ts — THE LOADER AND THE WRITER of the multi-user store. Nothing here
// decides: who may read, who may edit, what breaks, who is a stranger are
// relations in access.rofl, and this file asks them and moves bytes.
//
//   $SPAT_ROOT/users.rofl                tg_user(User, ChatId, Tenant, Role).
//   $SPAT_ROOT/<tenant>/world.rofl       the household — never written here
//   $SPAT_ROOT/<tenant>/ledgers/<u>.rofl one book per user, loaded as [p_<u>]
//   $SPAT_ROOT/<tenant>/me.rofl          the tool's own book, [p_me]
//
// THE TAG IS THE FILE NAME. A line in a book is loaded into the book's
// perspective whatever it says; a line that names another book is refused
// with the file and the line, and nothing from that file is loaded.
// Identity comes from the environment only: SPAT_ROOT, SPAT_TENANT, SPAT_AS,
// SPAT_TZ, and SPAT_NOW for tests. There is no --as.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { Rofl } from '../../src/api.ts';
import { parseProgram } from '../../src/parser.ts';
import type { Clause } from '../../src/unify.ts';
import { BOOT, SPAT, bust, setSource, table, world } from './spat.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
export const ACCESS = fs.readFileSync(path.join(HERE, 'access.rofl'), 'utf8');

/** One exit code per contract line; the message is what stdout gets. */
export class SpatError extends Error {
  code: 2 | 3 | 4 | 5 | 6;
  /** the files the loader had opened when it refused — a stranger's is two */
  opened: string[] = [];
  constructor(code: 2 | 3 | 4 | 5 | 6, msg: string) { super(msg); this.code = code; }
}

export interface Env { root: string; tenant: string; as: string; tz: string; now: Date; }
export function env(): Env {
  const { SPAT_ROOT, SPAT_TENANT, SPAT_AS, SPAT_TZ, SPAT_NOW } = process.env;
  if (!SPAT_ROOT) throw new SpatError(5, 'нет корня: SPAT_ROOT не задан');
  if (!SPAT_TENANT) throw new SpatError(5, 'нет арендатора: SPAT_TENANT не задан');
  if (!SPAT_AS) throw new SpatError(5, 'нет личности: SPAT_AS не задан');
  const now = SPAT_NOW ? new Date(SPAT_NOW) : new Date();
  if (Number.isNaN(now.getTime())) throw new SpatError(5, `SPAT_NOW не разобран: ${SPAT_NOW}`);
  try { new Intl.DateTimeFormat('en-US', { timeZone: SPAT_TZ ?? 'UTC' }); } catch { throw new SpatError(5, `SPAT_TZ не распознан: ${SPAT_TZ}`); }
  return { root: SPAT_ROOT, tenant: SPAT_TENANT, as: SPAT_AS, tz: SPAT_TZ ?? 'UTC', now };
}

export interface Book { book: string; user: string; file: string; }
export const bookOf = (user: string): string => `p_${user}`;

export interface Store {
  env: Env; dir: string; books: Book[]; open: Book[]; week: string;
  /** every file the loader opened, in order — the proof `stranger` opened none */
  opened: string[];
  r: Rofl;
}


function booksIn(dir: string): Book[] {
  const out: Book[] = [];
  const led = path.join(dir, 'ledgers');
  if (fs.existsSync(led)) {
    for (const f of fs.readdirSync(led).sort()) {
      if (!f.endsWith('.rofl')) continue;
      const user = f.slice(0, -5);
      if (!/^[a-z][a-z0-9_]*$/.test(user)) throw new SpatError(6, `${path.join(led, f)}: имя книги не атом`);
      out.push({ book: bookOf(user), user, file: path.join(led, f) });
    }
  }
  if (fs.existsSync(path.join(dir, 'me.rofl'))) out.push({ book: 'p_me', user: 'me', file: path.join(dir, 'me.rofl') });
  return out;
}

/** What the loader asserts about a call: the tenant, the caller, and one
 *  `authority` line per book file — the book's one writer, by its name. */
const loaderFacts = (e: Env, books: Book[]): string =>
  `tenant(${e.tenant}).\ncaller(${e.as}).\n` + books.map((b) => `authority(${b.book}, ${b.user}).`).join('\n');

/** A BOOK, LINE BY LINE. One clause per line, a fact, and its tag is the
 *  file's. The whole file is checked before one fact of it is asserted. */
export function bookClauses(b: Book, text: string): Clause[] {
  const out: Clause[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('--')) return;
    const where = `${b.file}:${i + 1}`;
    let cs: Clause[];
    try { cs = parseProgram(line); } catch (err) { throw new SpatError(6, `${where}: не разобрана: ${(err as Error).message}`); }
    for (const c of cs) {
      if (c.body.length > 0) throw new SpatError(6, `${where}: правило в книге; книга держит только факты`);
      const p = c.head.persp;
      if (c.head.perspExplicit && !(p.k === 'a' && p.name === b.book)) {
        throw new SpatError(6, `${where}: строка помечена [${p.k === 'a' ? p.name : '?'}], а книга — [${b.book}]`);
      }
      out.push({ ...c, head: { ...c.head, persp: { k: 'a', name: b.book }, perspExplicit: true } });
    }
  });
  return out;
}

/** OPEN THE STORE FOR ONE CALL. Two worlds: a small one — access.rofl, the
 *  world file, users.rofl, the loader's facts — answers `stranger` and
 *  `may_read`; the full one is built from the books that answer allowed.
 *  Every file is read once; `opened` lists them in the order they were. */
export function openStore(e: Env, opts: { weekOf?: string; extra?: string[] } = {}): Store {
  const dir = path.join(e.root, e.tenant);
  if (!fs.existsSync(path.join(dir, 'world.rofl'))) throw new SpatError(5, `нет арендатора: ${path.join(dir, 'world.rofl')} не существует`);
  const books = booksIn(dir);
  const opened: string[] = [];
  const read = (f: string): string => { opened.push(f); return fs.readFileSync(f, 'utf8'); };
  const worldText = read(path.join(dir, 'world.rofl'));
  const usersFile = path.join(e.root, 'users.rofl');
  const usersText = fs.existsSync(usersFile) ? read(usersFile) : '';
  const shared = `${ACCESS}\n${worldText}\n${usersText}\n${loaderFacts(e, books)}\n`;

  const small = new Rofl();
  must(small.load(BOOT), 'boot.rofl');
  must(small.assert(shared), 'access.rofl + world.rofl + users.rofl');
  small.evaluate();
  if (small.holds(`stranger(${e.as})`)) {
    throw Object.assign(new SpatError(5, `${e.as}: не член семьи ${e.tenant} и не в users.rofl`), { opened });
  }
  const allowed = new Set(table(small, 'may_read', 'U, L').filter((x) => x.U === e.as).map((x) => x.L));
  const open = books.filter((b) => allowed.has(b.book));
  const texts = open.map((b) => bookClauses(b, read(b.file)));

  let week = '?';
  const source = (r: Rofl): void => {
    must(r.assert(SPAT + '\n' + shared), 'spat.rofl + store');
    open.forEach((b, i) => must(r.assertClauses(texts[i], { who: b.user }), b.file));
    // THE WEEK IN FORCE, decided before the first evaluation so it costs one:
    // --week-of, else the operator's latest roll, else the world's own.
    const cur = baseArgs(r, 'current')[0]?.[0];
    week = opts.weekOf ?? rolledWeek(r) ?? cur ?? '?';
    if (cur && week !== cur) { r.retract(`current(${cur})`); must(r.assert(`current(${week}).`), 'current'); }
  };
  setSource(source);
  const r = world(undefined, { extra: opts.extra });
  return { env: e, dir, books, open, week, opened, r };
}

/** The base facts of one relation, read off the store's own keys — no
 *  evaluation, so the week can be swapped before the first one runs. */
const baseArgs = (r: Rofl, rel: string): string[][] =>
  r.factKeys(rel).map((k) => (/\((.*)\)$/.exec(k)?.[1] ?? '').split(',').map((x) => x.replace(/^"|"$/g, '')));

/** The operator's `roll` lives in me.rofl as `rolled(W, Iso)`; the latest
 *  one is the week the store is read under, unless --week-of says otherwise.
 *  Applied by the same swap `--week-of` uses, so `current/1` stays one fact. */
function rolledWeek(r: Rofl): string | undefined {
  const rows = baseArgs(r, 'rolled').sort((a, b) => (a[1] < b[1] ? 1 : -1));
  return rows[0]?.[0];
}

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new SpatError(6, `${what}: ${res.diagnostics.join('; ')}`);
}

// ---------------------------------------------------------------------------
// writing

/** APPEND-ONLY, ONE write() PER ENTRY, O_APPEND. Two processes appending to
 *  one book both land, whole and in some order, because the kernel appends
 *  each write atomically at the current end; an entry is a few hundred bytes,
 *  well under the page. No lock file, so no stale lock after a crash, and no
 *  read-modify-write, so no lost update. The choice is argued in STORE.md. */
export function append(file: string, entry: string): void {
  const text = entry.endsWith('\n') ? entry : entry + '\n';
  if (Buffer.byteLength(text) > 4096) throw new SpatError(6, `${file}: запись длиннее 4096 байт`);
  const fd = fs.openSync(file, 'a');
  try { fs.writeSync(fd, text); } finally { fs.closeSync(fd); }
}

/** An id is the entry's content and its moment: the same person saying the
 *  same thing at the same instant is one edit, not two. */
export const editId = (user: string, iso: string, text: string): string =>
  'e_' + createHash('sha1').update(`${user}\n${iso}\n${text}`).digest('hex').slice(0, 8);

export const isoNow = (e: Env): string => process.env.SPAT_NOW ?? e.now.toISOString();

/** The book the caller writes; nobody writes another's. */
export function myBook(s: Store): Book {
  const b = s.books.find((x) => x.user === s.env.as);
  if (!b) throw new SpatError(6, `у ${s.env.as} нет книги в ${s.dir}/ledgers — spat init создаёт их`);
  return b;
}

/** THE TRIAL. The world already evaluated without the candidate is the
 *  baseline: its defects go in as `before(D, R, K)`, the candidate goes
 *  in as itself plus `trial(E)`, and access.rofl answers `no_right`,
 *  `breaks` and `needs_confirm` in a world `why` can be asked about. */
export interface Verdict { noRight: boolean; breaks: string[]; owner?: { c: string; owner: string; scope: string }; }
export function trial(s: Store, id: string, clauses: Clause[]): Verdict {
  const r = s.r;
  const before = table(r, 'defect', 'D, R, K').map((x) => `before(${x.D}, ${x.R}, ${x.K}).`);
  must(r.assertClauses(clauses, { who: s.env.as }), 'candidate');
  must(r.assert(`trial(${id}).\n${before.join('\n')}`), 'trial');
  r.evaluate(); bust(r);
  const noRight = r.holds(`edit_without_right[audit](${id})`);
  const touched = r.query(`touches(${id}, X)`).rows.map((x) => String(x.bindings.X));
  const c = touched.find((x) => !r.holds(`may_edit(${s.env.as}, ${x})`))
    ?? (noRight ? String(r.query(`e_report[L](${id}, C, D, T)`).rows[0]?.bindings.C) : undefined);
  const own = c ? r.query(`constraint(${c}, O, S)`).rows[0]?.bindings : undefined;
  const breaks = [...new Set(r.query(`breaks(${id}, R)`).rows.map((x) => String(x.bindings.R)))].sort();
  return { noRight, breaks,
    owner: c ? { c, owner: String(own?.O ?? c), scope: String(own?.S ?? 'person') } : undefined };
}

// ---------------------------------------------------------------------------
// today, by SPAT_TZ and nothing else

const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
/** The ISO weekday 1..7 of the day `days` from now IN THE STORE'S ZONE; the
 *  world's `day(D, N)` is keyed the same, and that is the only calendar. */
export function weekdayIn(e: Env, days = 0): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: e.tz, weekday: 'short' }).format(new Date(e.now.getTime() + days * 86_400_000));
  return WD.indexOf(wd.toLowerCase()) || 7;
}
export function dayAtom(r: Rofl, n: number): string {
  const d = table(r, 'day', 'D, N').find((x) => Number(x.N) === n);
  if (!d) throw new SpatError(2, `в мире нет дня с номером ${n}: day(D, ${n}) не объявлен`);
  return d.D;
}

/** `spat init <tenant> --world <file>`: the directory, the world, an empty
 *  book per adult and helper, an empty me.rofl. Operator only. */
export function init(e: Env, tenant: string, weekFile: string): string[] {
  const usersFile = path.join(e.root, 'users.rofl');
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.assert(ACCESS + '\n' + (fs.existsSync(usersFile) ? fs.readFileSync(usersFile, 'utf8') : '')
    + `\ntenant(${tenant}).\ncaller(${e.as}).\n`), 'users.rofl');
  r.evaluate();
  if (!r.holds(`role(${e.as}, operator)`)) throw new SpatError(4, `init: ${e.as} не оператор арендатора ${tenant} по ${usersFile}`);
  const dir = path.join(e.root, tenant);
  if (fs.existsSync(dir)) throw new SpatError(6, `${dir} уже существует`);
  const w = new Rofl();
  must(w.load(BOOT), 'boot.rofl'); must(w.assert(fs.readFileSync(weekFile, 'utf8')), weekFile);
  const made: string[] = [];
  fs.mkdirSync(path.join(dir, 'ledgers'), { recursive: true });
  fs.copyFileSync(weekFile, path.join(dir, 'world.rofl')); made.push('world.rofl');
  for (const p of table(w, 'person', 'P, K').filter((x) => x.K === 'adult' || x.K === 'helper')) {
    fs.writeFileSync(path.join(dir, 'ledgers', `${p.P}.rofl`), `-- книга ${p.P}: правки, отчёты, confirm/retract. Только добавление.\n`);
    made.push(`ledgers/${p.P}.rofl`);
  }
  fs.writeFileSync(path.join(dir, 'me.rofl'), '-- книга инструмента: rolled(Week, Iso).\n'); made.push('me.rofl');
  return made;
}
