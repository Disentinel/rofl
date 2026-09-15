// rules.ts — THE HOUSEHOLD'S OWN RULES, WITHOUT A RELEASE. «Нужен ноутбук»,
// «согласовать время с другими» are new KINDS of constraint, and a kind is a
// rule: data, in the family's volume, in a book of its own — `hh`. The rule
// is stored as the kernel's AST (clauses table, volume.ts), never as text.
//
// THE WALL. Every head of the book gets the perspective [hh] from the loader
// whatever the text said — `may_edit[main](...)` in a family rule concludes
// `may_edit[hh]`, which no rule of access.rofl reads, and grants nothing. A
// body may read the world (unbracketed, or [main]), the book itself ([hh]),
// or the author's own book ([p_<author>]); any other tag refuses the rule at
// the door (2) and the book at the loader (6). An unbracketed body literal
// whose relation this same submission concludes reads [hh] — a name you
// define in your rule means your rule — except the four extension points,
// which always mean the household's whole picture.
//
// WHAT THE PROGRAM READS FROM THE BOOK is exactly four relations, declared
// in spat.rofl and access.rofl: defect[hh](Kind, Block, Day) → defect/breaks,
// busy[hh](P, D, S) → busy, needs_cover[hh](Ch, D, S) → needs_cover, and
// warn[hh](Kind, Text, Day) → a «!!» line of tomorrow/show. Everything else
// the book concludes is inert.
//
// THE CHECKS ARE THE KERNEL'S, the same ones the golden runs: an unstratified
// program (a negation through the four points back into the book), a leak, an
// undefined premise, a rule that would only be demand-backed, and the budget —
// each is code 2 with the kernel's diagnostic verbatim. A rule that passes is
// tried on the week in force and the answer says what it derives today.

import { Evaluation, StratificationError } from '../../src/engine.ts';
import { parseProgram } from '../../src/parser.ts';
import { mka, type Clause, type Lit, type Term } from '../../src/unify.ts';
import { rows, ru, table } from './spat.ts';
import { SpatError, editId, isoNow, must, type Store } from './store.ts';
import { readBook, readClauses, showClause, writeClauses, type Ruled, type Volume } from './volume.ts';
import { tagged } from './edits.ts';
import { held } from './places.ts';

export const HH = 'hh';
export const POINTS = ['defect', 'busy', 'needs_cover', 'warn'];
const USAGE = 'spat rule add \'<клауза(ы)>\' · rule list · rule retract <id> · rule confirm <id>   (взрослый или оператор)';

/** The status facts of the book: `rule_by(Id, U)`, `rule_at`, `rule_via`, `rule_proposed(Id)`, `rule_confirmed(Id, Iso, Via)`, `rule_retracted(Id, Iso, Via)`. */
interface Status { by: Map<string, string>; proposed: Set<string>; confirmed: Set<string>; retracted: Set<string>; }
function status(facts: Clause[]): Status {
  const ids = (rel: string): Set<string> => new Set(facts.filter((c) => c.head.rel === rel).map((c) => (c.head.args[0]?.k === 'a' ? c.head.args[0].name : '')));
  const by = new Map(facts.filter((c) => c.head.rel === 'rule_by').map((c) => [c.head.args[0]?.k === 'a' ? c.head.args[0].name : '', c.head.args[1]?.k === 'a' ? c.head.args[1].name : '']));
  return { by, proposed: ids('rule_proposed'), confirmed: ids('rule_confirmed'), retracted: ids('rule_retracted') };
}
const active = (st: Status, id: string): boolean => st.by.has(id) && !st.retracted.has(id) && (!st.proposed.has(id) || st.confirmed.has(id));

/** THE WALL ON ONE SUBMISSION: every head stamped [hh]; bodies read main, hh or the author's own book. */
function stamp(cs: Clause[], author: string, refuse: (msg: string) => never): Clause[] {
  const own = new Set(cs.map((c) => c.head.rel).filter((r) => !POINTS.includes(r)));
  const lit = (l: Lit, head: boolean): Lit => {
    if (l.temporal !== 'now') refuse(`${l.rel}: правило с тиком (@next/@init) в книге семьи не живёт`);
    if (head) return { ...l, persp: mka(HH), perspExplicit: true };
    const p = l.persp;
    if (p.k === 'v') refuse(`${l.rel}[${p.name}]: тело читает книгу по переменной — назови книгу: main, hh или p_${author}`);
    const name = p.k === 'a' ? p.name : '?';
    if (!l.perspExplicit) return own.has(l.rel) ? { ...l, persp: mka(HH), perspExplicit: true } : l;
    if (name !== 'main' && name !== HH && name !== `p_${author}`) refuse(`${l.rel}[${name}]: правило семьи читает только main, hh и свою книгу p_${author}`);
    return l;
  };
  return cs.map((c) => ({ head: lit(c.head, true), body: c.body.map((b) => (b.t === 'bi' ? b : { ...b, lit: lit(b.lit, false) })) }));
}

/** The book's clauses the loader may assert: active rules, each through the wall under its author. */
export function hhRules(v: Volume, facts: Clause[]): { clauses: Clause[]; authors: string[] } {
  const st = status(facts);
  const bad = (r: Ruled, msg: string): never => { throw new SpatError(6, `${v.file}/${HH} clauses seq ${r.seq} (${r.id}): ${msg}`); };
  const out: Clause[] = []; const authors = new Set<string>();
  for (const r of readClauses(v, HH)) {
    if (!active(st, r.id)) continue;
    const who = st.by.get(r.id) ?? '';
    if (r.clause.head.persp.k !== 'a' || r.clause.head.persp.name !== HH) bad(r, `голова помечена не [${HH}]`);
    out.push(...stamp([r.clause], who, (m) => bad(r, m)));
    authors.add(who);
  }
  return { clauses: out, authors: [...authors].sort() };
}

/** A fact of the submission as main would hold it: `place(academy)`. */
const lit = (c: Clause): string => showClause({ head: { ...c.head, perspExplicit: false }, body: [] }).replace(/\.$/, '');
const term = (t: Term): string => (t.k === 'a' ? t.name : t.k === 'i' ? String(t.v) : t.k === 's' ? JSON.stringify(t.v) : t.k === 'f' ? `${t.name}(${t.args.map(term).join(', ')})` : t.name);
/** WHAT A FACT OF THE BOOK DID TO THE WORLD (spat.rofl §14, bridge.rofl): one more line of it, already there, ignored as an
 *  override with the world's own line named, withheld with the reason — or a fact of the family's rules alone. */
function worldSaid(f: Store['r'], cs: Clause[], had: Set<string>): string[] {
  const out: string[] = [];
  for (const c of cs.filter((c) => c.body.length === 0)) {
    const rel = c.head.rel; const l = lit(c); const args = c.head.args.map(term);
    const key = f.query(`key_of(${rel}, N)`).rows[0]?.bindings.N;
    const why = f.query(`not_extended(${rel}, W)`).rows[0]?.bindings.W;
    if (key === undefined) { out.push(why === undefined ? `${l} — факт правил семьи, миру не виден (${rel} не edb)` : `${l} — миру не передаётся: ${why === 'books' ? 'блоки недели идут через add/skip/move' : 'переключатель одного вызова'}; правилам семьи видно`); continue; }
    if (had.has(l)) { out.push(`${l} — уже в мире`); continue; }
    if (f.holds(l)) { out.push(`в мир семьи: ${l}`); continue; }
    const k = Number(key); const kargs = k === 0 ? args : args.slice(0, k);
    if (f.holds(`overrides[audit](${rel}, k(${kargs.join(', ')}))`)) {
      const rest = args.slice(k).map((_, i) => `V${i}`);
      const theirs = f.query(`${rel}(${[...args.slice(0, k), ...rest].join(', ')})`).rows.map((x) => `${rel}(${[...args.slice(0, k), ...rest.map((v) => String(x.bindings[v]))].join(', ')})`);
      out.push(`${l} — НЕ ДЕЙСТВУЕТ: мир уже задаёт ${theirs.join(', ')}; книга семьи добавляет, не переопределяет (overrides[audit])`); continue;
    }
    if (f.holds(`withheld[audit](${rel}, k(${args.join(', ')}))`)) {
      const acct = table(f, 'extends_unless', 'R, I, V').find((x) => x.R === rel && args[Number(x.I) - 1] === x.V);
      const helper = table(f, 'speaks_for', 'R, I').filter((x) => x.R === rel).map((x) => args[Number(x.I) - 1]).find((p) => x_helper(f, p));
      const owned = table(f, 'key_owned', 'R, G').find((x) => x.R === rel && f.holds(`${x.G}(${args[0]}, _)`));
      out.push(`${l} — книга семьи не заводит: ${acct ? `${acct.V} — учётная запись, её заводит оператор (users, world)` : helper ? `за помощника (${ru(helper)}) книга семьи не говорит — своё сообщает ${ru(helper)}` : owned ? `${args[0]} — правка, её ограничение из её книги` : 'withheld[audit]'}`); continue;
    }
    out.push(`${l} — в мир не вошло`);
  }
  return out;
}
const x_helper = (f: Store['r'], p: string | undefined): boolean => p !== undefined && f.holds(`person(${p}, helper)`);

/** The rows at the four points, per point — the preview counts them, so a rule that
 *  gives 504 warnings is confirmed as 504, not as its first two lines. */
const pointRows = (r: { query: (q: string) => { rows: { text: string }[] } }): Map<string, string[]> =>
  new Map(POINTS.map((p) => [p, r.query(`${p}[hh](A, B, C)`).rows.map((x) => `${p}[hh](${x.text.replace(/[A-C] = /g, '')})`).sort()]));
const preview = (before: Map<string, string[]>, after: Map<string, string[]>): string[] =>
  POINTS.map((p) => { const was = new Set(before.get(p)); const now = after.get(p)!.filter((x) => !was.has(x)); return now.length === 0 ? '' : `${p}[hh]: ${now.length} строк${now.length > 3 ? `, первые 3: ${now.slice(0, 3).join(' · ')} …` : `: ${now.join(' · ')}`}`; }).filter((x) => x !== '');

/** `rule add '<clauses>'`: the wall, the kernel's checks on a fork, the trial, one transaction. */
function add(s: Store, text: string): number {
  if (!s.r.holds(`role(${s.env.as}, adult)`) && !s.r.holds(`role(${s.env.as}, operator)`)) { console.log(`отказано: правила семьи пишет взрослый или оператор; ${ru(s.env.as)} — нет`); return 4; }
  const refuse = (msg: string): never => { throw new SpatError(2, `правило не принято: ${msg}`); };
  let parsed: Clause[];
  try { parsed = parseProgram(text); } catch (e) { return refuse(`не разобрано ядром: ${(e as Error).message}`); }
  if (parsed.length === 0) refuse('пусто');
  const cs = stamp(parsed, s.env.as, refuse);
  // THE KERNEL'S CHECKS, on a fork of the week in force
  const f = s.r.fork();
  const before = { leak: f.query('leak[audit](A, B)').rows.length, undef: f.query('undefined_premise[audit](R, Rel)').rows.length, points: pointRows(f),
    had: new Set(cs.filter((c) => c.body.length === 0).map(lit).filter((l) => f.holds(l))) };
  // the author's own book is the candidate's to read: the loader declares `imports(hh, p_<author>)` per author of an
  // ACTIVE rule, so a first rule by this author was refused as leak[audit] (measured on 1a78e14) — declared here for the trial
  must(f.assert(`imports(${HH}, p_${s.env.as}).`), 'imports');
  must(f.assertClauses(cs, { who: HH }), 'правило');
  let partial = false;
  try { partial = f.evaluate().partial; } catch (e) {
    if (e instanceof StratificationError) refuse(`unstratified — ядро отвергло программу:\n${e.message}\n${e.demo}`);
    throw e;
  }
  if (partial) refuse(`правило слишком дорогое: ${f.query('hole[$kernel](I, R)').rows.map((x) => x.text).join('; ')}`);
  const leaks = f.query('leak[audit](A, B)').rows.map((x) => x.text);
  if (leaks.length > before.leak) refuse(`leak[audit]: ${leaks.join('; ')}`);
  const undef = f.query('undefined_premise[audit](R, Rel)').rows.map((x) => x.text);
  if (undef.length > before.undef) refuse(`undefined_premise[audit] — правило читает то, чего в мире нет: ${undef.join('; ')}`);
  const unsafe = new Evaluation(f.store, {}).rules.filter((x) => !x.safe).map((x) => x.canon);
  if (unsafe.length > 0) refuse(`правило не материализуется (demand-backed): ${unsafe.join(' | ')}`);
  const gives = preview(before.points, pointRows(f));
  const world = worldSaid(f, cs, before.had);
  // WRITTEN: the clauses under one id, the trail as facts of the book; from the bot it waits for a person
  const at = isoNow(s.env);
  const id = 'r' + editId(s.env.as, at, text.trim()).slice(1);
  const proposed = s.env.via === 'telegram';
  const facts = tagged(HH, [`rule_by(${id}, ${s.env.as}).`, `rule_at(${id}, "${at}").`, `rule_via(${id}, ${s.env.via}).`, ...(proposed ? [`rule_proposed(${id}).`] : [])]);
  writeClauses(s.vol, HH, id, cs, facts, { at, via: s.env.via, edit: `rule add ${text.trim().replace(/\s+/g, ' ')}` });
  const today = [...world, ...(gives.length > 0 ? [`сегодня оно даёт:\n  ${gives.join('\n  ')}`] : cs.some((c) => c.body.length > 0) ? ['сегодня в точках расширения (defect/busy/needs_cover/warn) оно не даёт ничего'] : [])].join('\n  ');
  if (proposed) { console.log(`ЗАПИСАНО КАК ПРЕДЛОЖЕНИЕ ${id}, не действует — правило пришло через бота; ${today}\n  подтвердить: spat rule confirm ${id}`); return 3; }
  console.log(`правило ${id} принято; ${today}`);
  return 0;
}

function mark(s: Store, what: 'confirmed' | 'retracted', id: string): number {
  const st = status(readBook(s.vol, HH));
  const by = st.by.get(id);
  if (by === undefined) throw new SpatError(2, `нет такого правила: ${id}`);
  const operator = s.r.holds(`role(${s.env.as}, operator)`);
  if (by !== s.env.as && !(what === 'retracted' && operator)) { console.log(`отказано: ${id} — правило ${ru(by)}; ${what === 'confirmed' ? 'подтвердить может только' : 'отозвать может'} ${ru(by)}${what === 'retracted' ? ' или оператор' : ''}`); return 4; }
  if (st.retracted.has(id)) { if (what === 'confirmed') throw new SpatError(2, `${id}: отозвано, подтверждать нечего`); console.log(`${id}: уже отозвано`); return 0; }
  if (what === 'confirmed' && (!st.proposed.has(id) || st.confirmed.has(id))) { console.log(`${id}: уже действует`); return 0; }
  // a place the rule put into the world is taken back only when nothing stands there (places.ts)
  const blocks = what === 'retracted' ? readClauses(s.vol, HH).filter((c) => c.id === id && c.clause.body.length === 0 && c.clause.head.rel === 'place')
    .flatMap((c) => held(s, c.clause.head.args[0]?.k === 'a' ? c.clause.head.args[0].name : '')) : [];
  if (blocks.length > 0) throw new SpatError(2, `${id}: место держат блоки — ${blocks.join(', ')}; сначала убери их`);
  const at = isoNow(s.env);
  writeClauses(s.vol, HH, id, [], tagged(HH, [`rule_${what}(${id}, "${at}", ${s.env.via}).`]), { at, via: s.env.via, edit: `rule ${what} ${id}` });
  console.log(`${id}: ${what === 'confirmed' ? 'подтверждено, действует' : 'отозвано'}`);
  return 0;
}

function list(s: Store): number {
  const facts = readBook(s.vol, HH); const st = status(facts);
  const cs = readClauses(s.vol, HH);
  if (st.by.size === 0) { console.log('правил семьи нет: spat rule add \'<клауза>\''); return 0; }
  for (const [id, by] of st.by) {
    const state = st.retracted.has(id) ? 'отозвано' : st.proposed.has(id) && !st.confirmed.has(id) ? 'ждёт confirm' : 'действует';
    console.log(`  ${id}  ${ru(by)}  ${state}`);
    for (const c of cs.filter((x) => x.id === id)) console.log(`      ${showClause(c.clause)}`);
  }
  return 0;
}

/** What the family's rules say about a day, for `tomorrow`/`show`: warn/3 and defect/3 rows of the book. */
export const hhLines = (r: Store['r'], day: string | undefined): { warns: string[]; defects: string[] } => ({
  warns: rows(r, 'warn[hh](K, T, D)').filter((x) => day === undefined || x.D === day).map((x) => `  !! ${x.K}: ${String(x.T).replace(/^"|"$/g, '')}  (${ru(x.D)}, правило семьи)`),
  defects: rows(r, 'defect[hh](K, B, D)').filter((x) => day === undefined || x.D === day).map((x) => `  !! ${x.K} ${ru(x.D)} ${ru(x.B)}  (правило семьи)`),
});

export function run(s: Store, rest: string[]): number {
  const [verb, ...args] = rest;
  if (verb === 'add') return add(s, args.join(' '));
  if (verb === 'list') return list(s);
  if (verb === 'retract' || verb === 'confirm') return mark(s, verb === 'confirm' ? 'confirmed' : 'retracted', args[0] ?? (() => { throw new SpatError(2, USAGE); })());
  throw new SpatError(2, USAGE);
}
