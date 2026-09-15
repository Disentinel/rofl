// store.ts — THE LOADER AND THE WRITER of the multi-user store. Nothing here
// decides: who may read, who may edit, what breaks, who is a stranger are
// relations in access.rofl, and this file asks them and moves rows.
//
//   $SPAT_ROOT/<tenant>.sqlite   the household's volume (volume.ts): its books
//     users                      tg_user(User, ChatId, Tenant, Role) — the operator's hand; loaded as [main]
//     world                      the household — never written here; loaded as [main]
//     p_<user>                   that user's book, loaded as [p_<user>]
//     p_me                       the tool's own book, [p_me]
//
// THE LEDGER IS THE COLUMN. A row is loaded into the book its ledger names
// whatever it says; the writer refuses a fact tagged with another book, and
// text is parsed only where there is text (the program's own files, a book
// handed to `volume load`). Identity comes from the environment only
// (STORE.md); there is no --as. Which books are private, and where they
// live, is volumes.rofl — the loader signs the program's load `rules` and
// says where it read each book from, so the audits there can see it.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { Rofl } from '../../src/api.ts';
import { parseProgram } from '../../src/parser.ts';
import type { Clause } from '../../src/unify.ts';
import { BOOT, SPAT, bust, setSource, table, world } from './spat.ts';
import { books as booksOf, openVolume, readBook, volumes, write, type Volume } from './volume.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
export const ACCESS = fs.readFileSync(path.join(HERE, 'access.rofl'), 'utf8');
export const VOLUMES = fs.readFileSync(path.join(HERE, 'volumes.rofl'), 'utf8');

/** One exit code per contract line; the message is what stdout gets;
 *  `opened` is what the loader had read when it refused. */
export class SpatError extends Error {
  code: 2 | 3 | 4 | 5 | 6; opened: string[] = [];
  constructor(code: 2 | 3 | 4 | 5 | 6, msg: string) { super(msg); this.code = code; }
}

/** `as`/`tenant` are settled by `resolve` when the call carries a sender id; until then they may be empty. */
export interface Env { root: string; tenant: string; as: string; fromId?: number; via: string; tz: string; now: Date; }
/** EVERYTHING THAT BECOMES PART OF A FACT IS AN ATOM FIRST. SPAT_AS, SPAT_TENANT
 *  and SPAT_VIA are written into `caller(...)`, `tenant(...)`, `edit_via(...)`;
 *  a value like `robin). tg_user(robin, 1, example, operator` would be two
 *  clauses. Measured on 33832b7 as the edit-text hole; this is the same
 *  hole one door over. */
export const ATOM = /^[a-z][a-z0-9_]*$/;
const atom = (v: string | undefined, what: string, code: 2 | 5 = 5): string | undefined => {
  if (v !== undefined && !ATOM.test(v)) throw new SpatError(code, `${what} не атом (a-z, 0-9, _): ${JSON.stringify(v)}`);
  return v;
};
export function env(): Env {
  const { SPAT_ROOT, SPAT_TENANT, SPAT_AS, SPAT_FROM_ID, SPAT_TZ, SPAT_NOW, SPAT_VIA } = process.env;
  if (!SPAT_ROOT) throw new SpatError(5, 'нет корня: SPAT_ROOT не задан');
  atom(SPAT_AS, 'SPAT_AS'); atom(SPAT_TENANT, 'SPAT_TENANT'); atom(SPAT_VIA, 'SPAT_VIA');
  // EXACTLY ONE SOURCE OF IDENTITY: a book by name (me, the operator by hand)
  // or a Telegram sender id that the users book must know. Both is a call
  // that cannot say who it is; neither is the same.
  if (!!SPAT_AS === !!SPAT_FROM_ID) throw new SpatError(5, SPAT_AS ? 'личность задана дважды: SPAT_AS и SPAT_FROM_ID' : 'нет личности: ни SPAT_AS, ни SPAT_FROM_ID');
  if (SPAT_FROM_ID && !/^\d+$/.test(SPAT_FROM_ID)) throw new SpatError(5, `SPAT_FROM_ID не число: ${SPAT_FROM_ID}`);
  if (SPAT_AS && !SPAT_TENANT) throw new SpatError(5, 'нет арендатора: SPAT_TENANT не задан');
  const now = SPAT_NOW ? new Date(SPAT_NOW) : new Date();
  if (Number.isNaN(now.getTime())) throw new SpatError(5, `SPAT_NOW не разобран: ${SPAT_NOW}`);
  try { new Intl.DateTimeFormat('en-US', { timeZone: SPAT_TZ ?? 'UTC' }); } catch { throw new SpatError(5, `SPAT_TZ не распознан: ${SPAT_TZ}`); }
  return { root: SPAT_ROOT, tenant: SPAT_TENANT ?? '', as: SPAT_AS ?? '', fromId: SPAT_FROM_ID ? Number(SPAT_FROM_ID) : undefined,
    via: SPAT_VIA ?? 'cli', tz: SPAT_TZ ?? 'UTC', now };
}

const bookPath = (v: Volume, ledger: string): string => path.join(v.file, ledger);
/** A small world: access.rofl over some rows and the call's facts, for the questions asked before any book is opened. */
function small(rows: Clause[], facts: string): Rofl {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.assert(`${ACCESS}\n${facts}`), 'access.rofl');
  must(r.assertClauses(rows), 'rows');
  r.evaluate();
  return r;
}

/** WHO IS CALLING, before any book of any tenant is opened. A sender id is
 *  asked of access.rofl over the users books alone — the named tenant's, or
 *  every volume's under the root, or the rows handed in (init): `sender(U, T)`
 *  names the person and their family, `stranger(N)` is the rule's own verdict. */
export function resolve(e: Env, opened: string[] = [], users?: Clause[]): Env {
  if (e.fromId === undefined) return e;
  const rows: Clause[] = users ?? [];
  if (!users) {
    for (const t of e.tenant ? [e.tenant] : volumes(e.root)) {
      const v = openVolume(e.root, t);
      opened.push(bookPath(v, 'users')); rows.push(...readBook(v, 'users')); v.db.close();
    }
  }
  const r = small(rows, `from_id(${e.fromId}).`);
  const refuse = (msg: string): never => { throw Object.assign(new SpatError(5, msg), { opened }); };
  if (r.holds(`stranger(${e.fromId})`)) refuse(`я вас не знаю (${e.fromId}); добавить может владелец — строкой в книге users`);
  const found = table(r, 'sender', 'U, T').filter((x) => e.tenant === '' || x.T === e.tenant);
  if (found.length === 0) refuse(`${e.fromId} не состоит в семье ${e.tenant} по книге users`);
  if (new Set(found.map((x) => x.T)).size > 1) refuse(`${e.fromId} в нескольких семьях (${found.map((x) => x.T).join(', ')}): задайте SPAT_TENANT`);
  return { ...e, as: found[0].U, tenant: found[0].T };
}
/** The caller resolved over one tenant's users, and refused unless the rules make them its operator. */
export function operator(e0: Env, tenant: string, users: Clause[]): Env {
  atom(tenant, 'семья', 2);
  const e = resolve({ ...e0, tenant }, [], users);
  if (!small(users, `tenant(${tenant}).\ncaller(${e.as}).`).holds(`role(${e.as}, operator)`)) throw new SpatError(4, `${e.as} не оператор арендатора ${tenant} по книге users`);
  return e;
}

export interface Book { book: string; user: string; where: string; }
export const bookOf = (user: string): string => `p_${user}`;

/** `opened`: every book the loader read, in order — a stranger's proof; `maybes`: the
 *  hypothesis books (`m_`), registered in the volume and never given to the rules. */
export interface Store { env: Env; vol: Volume; books: Book[]; open: Book[]; maybes: Book[]; week: string; opened: string[]; r: Rofl; }

/** What the loader asserts about a call: tenant, caller, the Monday of today
 *  and of tomorrow in the store's zone (WHICH week those are is the rules'
 *  question), one `authority` line per book — its one writer, by name — and
 *  where each book was read from, for volumes.rofl to hold against. */
const loaderFacts = (e: Env, books: Book[]): string =>
  `tenant(${e.tenant}).\ncaller(${e.as}).\ndate_monday(today, "${dateIn(e, 0).monday}").\n`
  + `date_monday(tomorrow, "${dateIn(e, 1).monday}").\nauthority(main, rules).\nbook_source(rules, repo).\n`
  + `book_source(world, store).\nbook_source(users, store).\n`
  + books.map((b) => `authority(${b.book}, ${b.user}).\nbook_source(${b.book}, store).`).join('\n');

export interface Cal { ymd: string; n: number; monday: string; }
/** A calendar day by its date: its ISO weekday 1..7 (the world's `day(D, N)`
 *  is keyed the same) and the Monday it belongs to; a date the calendar does
 *  not have (31.02) comes back as a different day, which the caller compares. */
export function calDay(ymd: string): Cal {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  if (Number.isNaN(t)) return { ymd: '', n: 0, monday: '' };
  const n = new Date(t).getUTCDay() || 7;
  return { ymd: new Date(t).toISOString().slice(0, 10), n, monday: new Date(t - (n - 1) * 86_400_000).toISOString().slice(0, 10) };
}
/** The date `days` from now IN THE STORE'S ZONE. */
export function dateIn(e: Env, days = 0): Cal {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: e.tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(e.now.getTime() + days * 86_400_000));
  const g = (k: string): string => f.find((x) => x.type === k)?.value ?? '';
  return calDay(`${g('year')}-${g('month')}-${g('day')}`);
}

/** A TEXT BOOK, LINE BY LINE — the wall for what is still text: a hand-written
 *  book on its way into a volume. One clause per line, a fact, and its tag is
 *  the book's. The whole file is checked before one fact of it is returned. */
export function bookClauses(b: Book, text: string): Clause[] {
  const out: Clause[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('--')) return;
    const where = `${b.where}:${i + 1}`;
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
 *  world book, the users book, the loader's facts — answers `stranger` and
 *  `may_read`; the full one is built from the books that answer allowed.
 *  Every book is read once; `opened` lists them in the order they were. */
export function openStore(e0: Env, opts: { weekOf?: string; extra?: string[] } = {}): Store {
  const opened: string[] = [];
  const e = resolve(e0, opened);
  const vol = openVolume(e.root, e.tenant);
  const all = booksOf(vol).map((b) => ({ ...b, where: bookPath(vol, b.book) }));
  const books = all.filter((b) => b.book.startsWith('p_')); const maybes = all.filter((b) => b.book.startsWith('m_'));
  const read = (ledger: string): Clause[] => {
    const p = bookPath(vol, ledger);
    if (!opened.includes(p)) opened.push(p);
    return readBook(vol, ledger);
  };
  const users = read('users'); const worldRows = read('world');
  const facts = loaderFacts(e, books);
  const s = small([...users, ...worldRows], facts);
  if (s.holds(`stranger(${e.as})`)) throw Object.assign(new SpatError(5, `${e.as}: не член семьи ${e.tenant} и не в книге users`), { opened });
  const allowed = new Set(table(s, 'may_read', 'U, L').filter((x) => x.U === e.as).map((x) => x.L));
  const open = books.filter((b) => allowed.has(b.book));
  const texts = open.map((b) => read(b.book));

  let week = '?';
  const source = (r: Rofl): void => {
    // THE PROGRAM IS SIGNED `rules` — the public book's name — so volumes.rofl
    // can tell its facts from the household's; everything else is anonymous.
    must(r.assert(facts), 'loader');
    must(r.assert(`${SPAT}\n${ACCESS}\n${VOLUMES}`, { who: 'rules' }), 'spat.rofl + access.rofl + volumes.rofl');
    must(r.assertClauses([...worldRows, ...users]), 'world + users');
    open.forEach((b, i) => must(r.assertClauses(texts[i], { who: b.user }), b.where));
    // THE WEEK IN FORCE, decided before the first evaluation so it costs one:
    // --week-of, else the operator's latest roll, else the world's own.
    const cur = baseArgs(r, 'current')[0]?.[0];
    if (opts.weekOf !== undefined && !baseArgs(r, 'week').some((w) => w[0] === atom(opts.weekOf, '--week-of', 2))) {
      throw new SpatError(2, `нет такой недели: ${opts.weekOf}; есть ${baseArgs(r, 'week').map((w) => w[0]).join(', ')}`);
    }
    week = opts.weekOf ?? rolledWeek(r) ?? cur ?? '?';
    if (cur && week !== cur) { r.retract(`current(${cur})`); must(r.assert(`current(${week}).`), 'current'); }
  };
  setSource(source);
  const r = world(undefined, { extra: opts.extra });   // runs `source`, which settles `week`
  return { env: e, vol, books, open, maybes, week, opened, r };
}

/** Base facts of one relation off the store's keys — no evaluation, so the week can be swapped before the first. */
const baseArgs = (r: Rofl, rel: string): string[][] => r.factKeys(rel).map((k) => (/\((.*)\)$/.exec(k)?.[1] ?? '').split(',').map((x) => x.replace(/^"|"$/g, '')));

/** The operator's latest `rolled(W, Iso)` in the tool's book: the week the store is read under unless --week-of says. */
const rolledWeek = (r: Rofl): string | undefined => baseArgs(r, 'rolled').sort((a, b) => (a[1] < b[1] ? 1 : -1))[0]?.[0];

export function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new SpatError(6, `${what}: ${res.diagnostics.join('; ')}`);
}

// ---------------------------------------------------------------------------
// writing

/** THE CALLER'S ENTRY, ONE TRANSACTION: the clauses exactly as the trial saw
 *  them, the trail (moment, channel, what was said) as columns rather than a
 *  comment line — so nothing the writer can be handed becomes a second row.
 *  The choice against O_APPEND text is argued in STORE.md, «Тома». */
export const put = (s: Store, b: Book, clauses: Clause[], what: string, week?: string): number =>
  write(s.vol, b.book, clauses, { at: isoNow(s.env), via: s.env.via, edit: what.replace(/\s+/g, ' ').trim() }, week);

/** An id is the entry's content and its moment: one person, one instant, one text — one edit. */
export const editId = (user: string, iso: string, text: string): string =>
  'e_' + createHash('sha1').update(`${user}\n${iso}\n${text}`).digest('hex').slice(0, 8);

export const isoNow = (e: Env): string => process.env.SPAT_NOW ?? e.now.toISOString();

/** The book the caller writes; nobody writes another's. */
export const myBook = (s: Store): Book => s.books.find((x) => x.user === s.env.as)
  ?? (() => { throw new SpatError(6, `у ${s.env.as} нет книги в ${s.vol.file} — spat init создаёт их`); })();

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
