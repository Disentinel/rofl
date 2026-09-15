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
import { mka, type Clause, type Lit } from '../../src/unify.ts';
import { rows, ru } from './spat.ts';
import { SpatError, editId, isoNow, must, type Store } from './store.ts';
import { readBook, readClauses, showClause, writeClauses, type Ruled, type Volume } from './volume.ts';
import { tagged } from './edits.ts';

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
  const before = { leak: f.query('leak[audit](A, B)').rows.length, undef: f.query('undefined_premise[audit](R, Rel)').rows.length, points: pointRows(f) };
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
  // WRITTEN: the clauses under one id, the trail as facts of the book; from the bot it waits for a person
  const at = isoNow(s.env);
  const id = 'r' + editId(s.env.as, at, text.trim()).slice(1);
  const proposed = s.env.via === 'telegram';
  const facts = tagged(HH, [`rule_by(${id}, ${s.env.as}).`, `rule_at(${id}, "${at}").`, `rule_via(${id}, ${s.env.via}).`, ...(proposed ? [`rule_proposed(${id}).`] : [])]);
  writeClauses(s.vol, HH, id, cs, facts, { at, via: s.env.via, edit: `rule add ${text.trim().replace(/\s+/g, ' ')}` });
  const today = gives.length > 0 ? `сегодня оно даёт:\n  ${gives.join('\n  ')}` : 'сегодня в точках расширения (defect/busy/needs_cover/warn) оно не даёт ничего';
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
