// volume.ts — A PRIVATE VOLUME IS ONE SQLITE FILE PER TENANT, and a book in
// it is a set of typed rows. What is private about a household — its world,
// its users, its people's books — is never text in the repository: the rules
// and the shipped example are `.rofl` files (volume `program`, public, in the
// repo); a tenant's books are rows in `$SPAT_ROOT/<tenant>.sqlite` (volume
// `household`, private, in the store). volumes.rofl declares which is which.
//
//   facts(seq, ledger, pred, args, at, via, edit)   INSERT only: a trigger refuses UPDATE and DELETE
//   books(ledger, user)                             which books exist and whose they are
//   meta(key, value)                                tenant, schema, week
//
// THE LEDGER IS THE COLUMN. A row is read into the perspective its `ledger`
// names — `p_<user>` into [p_<user>], `world` and `users` into [main] — and
// `args` holds the kernel's own terms (termToJson), so `robin` the atom and
// "robin" the string cannot be confused and nothing in a row can name another
// book or become a second row. Text is parsed only where there is text: the
// program's own files, and a hand-written book that `volume load` imports.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { escapeString } from '../../src/parser.ts';
import { mka, termFromJson, termToJson, type Clause, type Term } from '../../src/unify.ts';
import { ATOM, SpatError, bookClauses, isoNow, operator, type Env } from './store.ts';

export const SCHEMA = '1';
export interface Volume { tenant: string; file: string; db: DatabaseSync; }
export const volumeFile = (root: string, tenant: string): string => path.join(root, `${tenant}.sqlite`);
/** Every tenant with a volume under the root, by name — a name that is not an atom is not a tenant. */
export const volumes = (root: string): string[] =>
  (fs.existsSync(root) ? fs.readdirSync(root) : []).filter((f) => f.endsWith('.sqlite')).map((f) => f.slice(0, -7)).filter((t) => ATOM.test(t)).sort();
/** The perspective a ledger loads into: a person's book (`p_`), a hypothesis (`m_`) and the
 *  household's rule book (`hh`) are their own; the world and the users are the main book. */
export const perspOf = (ledger: string): string => (/^(p_|m_)/.test(ledger) || ledger === 'hh' ? ledger : 'main');

const DDL = `
CREATE TABLE facts(seq INTEGER PRIMARY KEY, ledger TEXT NOT NULL, pred TEXT NOT NULL, args TEXT NOT NULL,
                   at TEXT NOT NULL, via TEXT NOT NULL, edit TEXT);
CREATE INDEX facts_by_ledger ON facts(ledger, seq);
CREATE TABLE books(ledger TEXT PRIMARY KEY, user TEXT NOT NULL);
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TRIGGER facts_no_update BEFORE UPDATE ON facts BEGIN SELECT RAISE(ABORT, 'facts: INSERT only; a retraction is one more row'); END;
CREATE TRIGGER facts_no_delete BEFORE DELETE ON facts BEGIN SELECT RAISE(ABORT, 'facts: INSERT only; a retraction is one more row'); END;`;

/** Open a tenant's volume; `create` lays the schema down and refuses an existing file. A missing
 *  volume is "no such tenant" (5) — SQLite would otherwise create an empty one on open. */
export function openVolume(root: string, tenant: string, create = false): Volume {
  if (!ATOM.test(tenant)) throw new SpatError(5, `имя семьи не атом (a-z, 0-9, _): ${JSON.stringify(tenant)}`);
  const file = volumeFile(root, tenant);
  if (create && fs.existsSync(file)) throw new SpatError(6, `${file} уже существует`);
  if (!create && !fs.existsSync(file)) throw new SpatError(5, `нет арендатора: ${file} не существует`);
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(file);
    db.exec('PRAGMA busy_timeout=5000');
    if (create) {
      db.exec(`PRAGMA journal_mode=WAL; ${DDL}`);
      db.prepare('INSERT INTO meta(key, value) VALUES (?, ?), (?, ?)').run('tenant', tenant, 'schema', SCHEMA);
    }
  } catch (e) { throw new SpatError(6, `${file}: ${(e as Error).message}`); }
  const v = { tenant, file, db };
  if (meta(v, 'schema') !== SCHEMA) throw new SpatError(6, `${file}: схема ${meta(v, 'schema') ?? 'нет'}, ожидалась ${SCHEMA}`);
  return v;
}
export const meta = (v: Volume, key: string): string | undefined =>
  (v.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value;

export const books = (v: Volume): { book: string; user: string }[] =>
  (v.db.prepare('SELECT ledger, user FROM books ORDER BY ledger').all() as { ledger: string; user: string }[])
    .map((x) => ({ book: x.ledger, user: x.user }));
export const addBook = (v: Volume, ledger: string, user: string): void => {
  v.db.prepare('INSERT OR IGNORE INTO books(ledger, user) VALUES (?, ?)').run(ledger, user);
};

/** A term the parser would read back as itself: ground, and every name an
 *  identifier — so a row put in by hand with an atom `Robin` (a variable, to
 *  the parser) is refused here rather than dumped into a file no load takes. */
const NAME = /^[a-z$][A-Za-z0-9_]*$/;
const writable = (t: Term): boolean =>
  t.k === 'i' || t.k === 's' || (t.k === 'a' && NAME.test(t.name)) || (t.k === 'f' && NAME.test(t.name) && t.args.every(writable));

interface Row { seq: number; pred: string; args: string; at: string; via: string; edit: string | null; }
const rowsOf = (v: Volume, ledger: string): Row[] =>
  v.db.prepare('SELECT seq, pred, args, at, via, edit FROM facts WHERE ledger = ? ORDER BY seq').all(ledger) as unknown as Row[];
/** A row's relation and terms, or the refusal that names the row: the
 *  relation is an atom (a tag smuggled into `pred` would render as a line
 *  no parser takes) and every term is one the parser would read back. */
const termsOf = (v: Volume, ledger: string, r: Row): Term[] => {
  if (!ATOM.test(r.pred)) throw new SpatError(6, `${v.file}/${ledger} seq ${r.seq}: pred не атом: ${r.pred}`);
  try {
    const ts = (JSON.parse(r.args) as unknown[]).map(termFromJson);
    if (ts.every(writable)) return ts;
  } catch { /* falls through to the refusal */ }
  throw new SpatError(6, `${v.file}/${ledger} seq ${r.seq}: args не термы: ${r.args}`);
};

/** A BOOK, ROW BY ROW, as the loader's clauses. The perspective is the ledger
 *  column's and the terms are the row's — no text, so no line can say which
 *  book it is in. The whole book is read before one clause is returned. */
export const readBook = (v: Volume, ledger: string): Clause[] => rowsOf(v, ledger).map((r) => ({
  head: { rel: r.pred, persp: mka(perspOf(ledger)), perspExplicit: perspOf(ledger) !== 'main', args: termsOf(v, ledger, r), temporal: 'now' as const },
  body: [],
}));

export interface Trail { at: string; via: string; edit: string | null; }
/** The trail of a book's first row — what was said when a hypothesis was written. */
export const trailOf = (v: Volume, ledger: string): Trail | undefined => rowsOf(v, ledger)[0];
/** ONE ENTRY, ONE TRANSACTION. The wall stands at the writer: every clause is
 *  a ground fact in THIS ledger's own perspective, or nothing is written.
 *  Two processes writing one book both land, whole, in seq order: BEGIN
 *  IMMEDIATE takes the write lock and busy_timeout waits for it (WAL). */
export function write(v: Volume, ledger: string, clauses: Clause[], trail: Trail, week?: string): number {
  const persp = perspOf(ledger);
  for (const c of clauses) {
    const p = c.head.persp;
    if (c.body.length > 0 || c.head.temporal !== 'now') throw new SpatError(6, `${ledger}: правило в книге; книга держит только факты`);
    if (c.head.rel === MARKER) throw new SpatError(6, `${ledger}: ${MARKER} — метка дампа, не факт книги`);
    if (p.k !== 'a' || p.name !== persp) throw new SpatError(6, `${ledger}: факт помечен [${p.k === 'a' ? p.name : '?'}], а книга — [${persp}]`);
    if (!ATOM.test(c.head.rel) || !c.head.args.every(writable)) throw new SpatError(6, `${ledger}: ${c.head.rel} — не замкнутый факт`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(trail.edit ?? '')) throw new SpatError(2, 'в следе правки управляющий символ; след — одна строка');
  const ins = v.db.prepare('INSERT INTO facts(ledger, pred, args, at, via, edit) VALUES (?, ?, ?, ?, ?, ?)');
  try {
    v.db.exec('BEGIN IMMEDIATE');
    for (const c of clauses) ins.run(ledger, c.head.rel, JSON.stringify(c.head.args.map(termToJson)), trail.at, trail.via, trail.edit);
    if (week !== undefined) v.db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)').run('week', week);
    v.db.exec('COMMIT');
  } catch (e) {
    try { v.db.exec('ROLLBACK'); } catch { /* no transaction to roll back */ }
    throw new SpatError(6, `${v.file}/${ledger}: запись не прошла, ничего не записано: ${(e as Error).message}`);
  }
  return clauses.length;
}

/** A DUMP SAYS WHAT IT IS, IN ITS FIRST CLAUSE: `dump_of(Tenant, Book,
 *  private).` — the way boot.rofl claims the kernel ring on line one. A
 *  public loader (scripts/goldens.ts) refuses a file that opens so; this
 *  reader strips it, and refuses a dump of another book than the one it is
 *  being read into. */
export const MARKER = 'dump_of';
export function fromText(file: string, ledger: string): Clause[] {
  if (!fs.existsSync(file)) throw new SpatError(2, `${file}: нет такого файла`);
  const user = ledger.startsWith('p_') ? ledger.slice(2) : ledger;
  const cs = bookClauses({ book: perspOf(ledger), user, where: file }, fs.readFileSync(file, 'utf8'));
  const m = cs[0]?.head;
  if (m?.rel !== MARKER) return cs;
  const book = m.args[1];
  if (book?.k !== 'a' || book.name !== ledger) throw new SpatError(6, `${file}: дамп книги ${book?.k === 'a' ? book.name : '?'}, а грузится в ${ledger}`);
  return cs.slice(1);
}

/** `volume load`: a hand-written book (or a dump) through the text wall —
 *  the tag is the file name — into ITS OWN ledger, never the caller's. A
 *  line naming another book, or a rule, refuses the whole file: not one row. */
export function load(v: Volume, file: string, trail: Trail, ledger?: string): { ledger: string; rows: number } {
  const name = path.basename(file).replace(/\.rofl$/, '');
  const led = ledger ?? (name === 'world' || name === 'users' || perspOf(name) !== 'main' ? name : `p_${name}`);
  if (!ATOM.test(led)) throw new SpatError(2, `${file}: имя книги не атом: ${led}`);
  const cs = fromText(file, led);
  const user = led.startsWith('p_') ? led.slice(2) : led;
  const rows = write(v, led, cs, trail);
  if (led.startsWith('p_')) addBook(v, led, user);
  return { ledger: led, rows };
}

const show = (t: Term): string =>
  t.k === 'a' ? t.name : t.k === 'i' ? String(t.v) : t.k === 's' ? escapeString(t.v)
    : t.k === 'f' ? `${t.name}(${t.args.map(show).join(', ')})` : `?${t.name}`;
/** `volume dump`: a book back as `.rofl` text — one fact per line in seq
 *  order, tagged as the loader would stamp it, the trail as the comment
 *  above each entry. No clock and no path in it: the same book dumps to the
 *  same bytes, and loading the dump is the same book again. */
export function render(v: Volume, ledger: string): string {
  const user = books(v).find((b) => b.book === ledger)?.user ?? ledger;
  const out = [`-- SPAT VOLUME DUMP tenant=${v.tenant} book=${ledger} private — книга ${user}; load этого файла в ${ledger} — та же книга;`,
    '-- в публичном дереве этому файлу не место: эталон отказывает по первой клаузе', `${MARKER}(${v.tenant}, ${ledger}, private).`];
  let last = '';
  for (const r of rowsOf(v, ledger)) {
    const key = `-- ${r.at} ${r.via} ${user}: ${r.edit ?? ''}`;
    if (key !== last) { out.push(key); last = key; }
    const args = termsOf(v, ledger, r).map(show);
    out.push(`${r.pred}${ledger.startsWith('p_') ? `[${ledger}]` : ''}(${args.join(', ')}).`);
  }
  return out.join('\n') + '\n';
}
/** Every ledger the volume holds: the two main books, then the registered ones. */
export const ledgers = (v: Volume): string[] =>
  [...new Set(['world', 'users', ...books(v).map((b) => b.book),
    ...(v.db.prepare('SELECT DISTINCT ledger FROM facts ORDER BY ledger').all() as { ledger: string }[]).map((x) => x.ledger)])];

/** The legacy text layout of a tenant, as one command: `me.rofl` and every
 *  book under `ledgers/`. Its `world.rofl` and `users.rofl` are `init`'s. */
const legacy = (dir: string): string[] => {
  const led = path.join(dir, 'ledgers');
  return [...(fs.existsSync(led) ? fs.readdirSync(led).sort().filter((f) => f.endsWith('.rofl')).map((f) => path.join(led, f)) : []),
    ...(fs.existsSync(path.join(dir, 'me.rofl')) ? [path.join(dir, 'me.rofl')] : [])];
};

const USAGE = 'spat volume load <семья> <файл.rofl|каталог> [--book <книга>]  ·  spat volume dump <семья> [<книга>]   (оператор)';
/** `spat volume …`, the operator's verbs over a tenant's volume. */
export function run(e0: Env, rest: string[]): number {
  const [verb, tenant, arg] = rest;
  if ((verb !== 'load' && verb !== 'dump') || !tenant) throw new SpatError(2, USAGE);
  const v = openVolume(e0.root, tenant);
  const e = operator(e0, tenant, readBook(v, 'users'));
  if (verb === 'load') {
    if (!arg) throw new SpatError(2, USAGE);
    const b = rest.indexOf('--book');
    const p = path.resolve(arg);
    const dir = fs.existsSync(p) && fs.statSync(p).isDirectory();
    if (dir && b >= 0) throw new SpatError(2, `${arg}: каталог грузится книга за книгой по именам файлов, --book тут не к чему`);
    for (const f of dir ? legacy(p) : [p]) {
      const r = load(v, f, { at: isoNow(e), via: e.via, edit: `load ${path.basename(f)}` }, b >= 0 ? rest[b + 1] : undefined);
      console.log(`${v.file}/${r.ledger}: ${r.rows} фактов из ${path.relative(process.cwd(), f)}`);
    }
  } else {
    for (const l of arg ? [arg] : ledgers(v)) process.stdout.write(render(v, l));
  }
  v.db.close();
  return 0;
}
