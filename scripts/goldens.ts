// scripts/goldens.ts — THE WHOLE-REPOSITORY CHECK.
//
//   npm test              check both engines against facts/goldens.rofl
//   npm test -- --engine rust|ts   check one engine only (the golden is shared); a world
//                         the other engine alone answers is skipped, and the TypeScript host
//                         contracts (doors, shrug surfaces, deep explain) run only with ts
//   npm test -- --changed[=REF]    choose by the tree's changes since REF (HEAD): only rust/
//                         -> rust, only src/ -> ts, anything else (or nothing) -> both
//   npm run bless         rewrite facts/goldens.rofl from the current tree
//
// A world is a set of `.rofl` files: an example, a directory of them, or a rule
// pack beside the facts of the same name. Both engines load the FILES and
// evaluate; the answer is `canonicalState()`, and what is committed is a hash
// of it plus a census of rows per relation.
//
// WHY THE FILES AND NOT A SEED. The corpus this replaces handed the port a
// `.seed.json` — a snapshot carrying the rules as data — because a second
// engine was assumed not to need a parser. It has one, 446 lines of it, and the
// seed path never touched it. Worse, the seed IS the program: a broken rule in
// `rules/` never reached the port at all, with or without regeneration. Loading
// the files fixes both.
//
// WHY A COMMITTED GOLDEN AND NOT A REGENERATED ONE. The old harness regenerated
// its expectation before every run, so a change to any `.rofl` moved the
// expectation with it and could not go red. Measured: deleting
// `abrupt_kind(break_statement).` from rules/js-controlflow.rofl left it 150/150
// green. A golden is taken at a working state and committed, or it is not a
// golden.
//
// WHY A HASH AND A CENSUS RATHER THAN THE STATE. The states are 42 MB. The hash
// is exact — any change moves it. The census says WHERE: rows per relation, so
// a red names the relation that moved and by how much. For the exact firing,
// run the two engines by hand and diff; `rust/target/release/rofl-load` prints
// the state a world evaluates to.

import { Rofl } from '../src/api.ts';
import { parseProgram } from '../src/parser.ts';
import { canonClauseSets } from '../src/unify.ts';
import { ruleIdOf, BUDGET_REASON, SPACE_REASON, ARITH_TYPE_REASON, ARITH_ZERO_REASON, ARITH_OVERFLOW_REASON,
  STR_TYPE_REASON, STR_INDEX_REASON, STR_SEP_REASON, ATOM_NAME_REASON, SEALED_REASON } from '../src/reflect.ts';
import { reasonOf } from '../src/shrug.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { worldFiles, prefetchMd } from './md_world.ts';
import { materialize, unreadOf } from './sentences.ts';
import { runPool, jobs, type Task } from './pool.ts';
import { parseSelector, select, NotAWorld, belowFiles } from './agg_select.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GOLDEN = path.join(ROOT, 'facts/goldens.rofl');
// ROFL_PROFILE names the cargo profile whose `rofl-load` answers for Rust:
// `release` unless said otherwise, `fast` for the development loop, `breaks`
// for scripts/agg_breaks.ts. Every profile has the release semantics.
export const PROFILE = process.env.ROFL_PROFILE || 'release';
const RUST = path.join(ROOT, 'rust/target', PROFILE, 'rofl-load');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
/** boot.rofl, or the copy a planted fault of scripts/agg_breaks.ts names in ROFL_BOOT, read where a world is answered */
const bootPath = (): string => process.env.ROFL_BOOT || path.join(ROOT, 'boot.rofl');
const bootText = (): string => (process.env.ROFL_BOOT ? fs.readFileSync(process.env.ROFL_BOOT, 'utf8') : BOOT);

/** A FACT PACK IS READ BY LOADING IT, NOT BY MATCHING IT. Every reader here was
 *  a regex over `.rofl` text — a duplicate parser, in a repository whose whole
 *  point is that rules are data and `query` is how you ask. Ten such sites went
 *  in during one session that had just catalogued seven of them as the class to
 *  remove. A regex reads what it was told to expect; the loader reads what is
 *  written, and refuses what is malformed instead of silently missing it. */
function pack(file: string, text?: string): Rofl | null {
  const p = path.join(ROOT, file);
  if (text === undefined && !fs.existsSync(p)) return null;
  const r = new Rofl();
  r.load(BOOT);
  if (!r.load(text ?? fs.readFileSync(p, 'utf8')).ok) throw new Error(`${file} does not load`);
  r.evaluate();
  return r;
}
const loaded = pack;
const col = (r: Rofl, lit: string, ...vs: string[]): string[][] =>
  r.query(lit).rows.map((x) => vs.map((v) => String(x.bindings[v]).replace(/^"|"$/g, '')));

/** `oneEngine` names the engine that answers a world alone: `ts` for a host
 *  contract the two answer differently (budget_wall), `rust` for a world
 *  only the Rust engine can answer, or one too big for TypeScript to be asked
 *  (the TypeScript engine is not run on it at all: not by npm test, bless, whycheck
 *  or test:agg; facts/checks.rofl, "RUST ONLY", states the rule and each world's reason). `strata` runs the stock evaluator, `explain` the
 *  `explain_request` bridge of rofl-load. */
export interface World {
  /** a budget no world needs, which a planted fault that runs away is cut by sooner (scripts/agg_breaks.ts); a cut it makes is still a problem */
  name: string; files: string[]; ticks?: number; budget?: number; cap?: number; space?: number;
  oneEngine?: 'ts' | 'rust'; strata?: boolean; explain?: boolean; retain?: number;
  /** base facts retracted one by one after the evaluation (rofl-load `--retract`: the Rust engine updates the cells they
   *  supported, the TypeScript engine evaluates again); both must hold the state a world without them holds */
  retract?: string[];
  /** its files load together and are evaluated once, a fixture offered alone
   *  (as rofl-load runs a world), in both engines: the aggregate proof worlds */
  together?: boolean;
  /** its `.rofl.md` files, and its `.rofl` files headed `-- through-sentences`, go once round the sentence form (scripts/sentences.ts) */
  sentences?: boolean;
}

/** A declared world as it is loaded: each `.rofl.md` file read into rules, and under `sentences` each file headed
 *  so written as sentences and read back (scripts/sentences.ts). Done where the world is answered, so a fault
 *  planted in the reader or the renderer reaches it. */
export const placed = (w: World): World => ({ ...w, files: w.files.map((f) => materialize(f, !!w.sentences)) });

/** Every world buildable from `.rofl` text alone. A demo whose world is
 *  assembled in TypeScript is not here — the check must be reachable from the
 *  files, not from a host program. */
export function worlds(): World[] {
  const out: World[] = [];
  const ex = path.join(ROOT, 'examples');
  for (const e of fs.readdirSync(ex).sort()) {
    const p = path.join(ex, e);
    // `examples/checks/` holds one file per declared world and is never a world
    // itself: loading its members together would answer about their union,
    // which is nobody's question.
    if (e === 'checks') continue;
    if (fs.statSync(p).isDirectory()) {
      const files = fs.readdirSync(p).sort().filter((x) => x.endsWith('.rofl')).map((x) => path.join(p, x));
      if (files.length > 0) out.push({ name: e, files });
      // a notebook is a world of its own, with the model and the worlds it names
      for (const x of fs.readdirSync(p).sort().filter((x) => x.endsWith('.rofl.md'))) out.push({ name: `${e}_${x.replace(/\.rofl\.md$/, '')}`, files: worldFiles(path.join(p, x)) });
    } else if (e.endsWith('.rofl')) out.push({ name: e.replace(/\.rofl$/, ''), files: [p] });
    else if (e.endsWith('.rofl.md')) out.push({ name: e.replace(/\.rofl\.md$/, ''), files: worldFiles(p) });  // executable Markdown; a plain .md is a document
  }
  const rl = path.join(ROOT, 'rules');
  const pack = (dir: string, prefix: string): void => {
    for (const e of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, e);
      if (fs.statSync(p).isDirectory()) { pack(p, `${prefix}${e}_`); continue; }
      // a world authored as Markdown (`.rofl.md`) is read into rules first (scripts/read.ts) and loaded from there
      if (!e.endsWith('.rofl') && !e.endsWith('.rofl.md')) continue;
      const stem = e.replace(/\.rofl(\.md)?$/, '');
      const facts = path.join(ROOT, 'facts', `${stem}.rofl`);
      const file = e.endsWith('.rofl.md') ? worldFiles(p) : [p];
      out.push({ name: `rules_${prefix}${stem}`,
        files: fs.existsSync(facts) ? [facts, ...file] : file });
    }
  };
  pack(rl, '');
  out.push({ name: 'boot_only', files: [] });
  // A WALKED WORLD DECLARED ONE-ENGINE (check_opt(W, one_engine, rust)): a world found by walking has no check_world
  // block, so the option alone is read for it, and a name that is no world is refused rather than ignored
  const r = loaded('facts/checks.rofl');
  const dec = declared();
  for (const [n, e] of r ? col(r, 'check_opt(N, one_engine, E)', 'N', 'E') : []) {
    if (dec.some((w) => w.name === n)) continue;
    const w = out.find((x) => x.name === n);
    if (e !== 'ts' && e !== 'rust') throw new Error(`check_opt("${n}", one_engine, ${e}): the engine is ts or rust`);
    if (!w) throw new Error(`check_opt("${n}", one_engine, ${e}): no such world`);
    w.oneEngine = e as 'ts' | 'rust';
  }
  return [...out, ...dec];
}

/** `problems` are reds that are neither a hash nor an alarm: a refusal
 *  fixture that loaded, or refused for another reason. */
export interface Answer {
  hash: string; facts: number; census: Map<string, number>; dropped: string[]; alarms: string[];
  problems: string[];
}

/** WORLDS THE TREE CANNOT DISCOVER, declared in facts/checks.rofl. Everything
 *  under examples/ and rules/ is found by walking; a world that needs a TICK
 *  COUNT or a BUDGET, or that exists to be REFUSED, has nothing to be walked to
 *  and is named there instead. That file is where the 19 test files whose whole
 *  subject is host behaviour — arithmetic holes, budget walls, escapes — become
 *  worlds rather than TypeScript string literals. */
export function declared(text?: string): World[] {
  const r = pack('facts/checks.rofl', text);
  if (!r) return [];
  const out = new Map<string, World>();
  for (const [n] of col(r, 'check_world(N)', 'N')) out.set(n, { name: n, files: [] });
  for (const [n, f] of col(r, 'check_file(N, F)', 'N', 'F')) out.get(n)?.files.push(path.join(ROOT, f));
  // EVERY OPTION IS ONE THIS HARNESS READS. `one_engine` was read as the
  // literal `1` and meant "TypeScript only", so any other value was silently
  // ignored and the world ran on both engines (f_one_engine_meant_ts_only).
  const KNOWN = new Set(['ticks', 'budget', 'space', 'one_engine', 'evaluator', 'explain', 'retain', 'sentences', 'together', 'retract']);
  for (const [n, k] of col(r, 'check_opt(N, K, V)', 'N', 'K')) {
    if (!KNOWN.has(k)) throw new Error(`check_opt("${n}", ${k}, _): no such option; the options are ${[...KNOWN].join(', ')}`);
    // a world the tree is walked to may be declared one-engine, the one option that needs no files (see worlds())
    if (!out.has(n) && k !== 'one_engine') throw new Error(`check_opt("${n}", ${k}, _): no check_world("${n}")`);
  }
  for (const [n, e] of col(r, 'check_opt(N, one_engine, E)', 'N', 'E')) {
    if (e !== 'ts' && e !== 'rust') throw new Error(`check_opt("${n}", one_engine, ${e}): the engine is ts or rust`);
    if (out.has(n)) out.get(n)!.oneEngine = e;
  }
  for (const [n, e] of col(r, 'check_opt(N, evaluator, E)', 'N', 'E')) {
    if (e !== 'strata') throw new Error(`check_opt("${n}", evaluator, ${e}): the one evaluator to choose is strata`);
    out.get(n)!.strata = true;
  }
  for (const [n, e] of col(r, 'check_opt(N, explain, E)', 'N', 'E')) {
    if (e !== '1') throw new Error(`check_opt("${n}", explain, ${e}): explain takes 1`);
    out.get(n)!.explain = true;
  }
  for (const [n, e] of col(r, 'check_opt(N, together, E)', 'N', 'E')) {
    if (e !== '1') throw new Error(`check_opt("${n}", together, ${e}): together takes 1`);
    out.get(n)!.together = true;
  }
  for (const [n, e] of col(r, 'check_opt(N, sentences, E)', 'N', 'E')) {
    if (e !== '1') throw new Error(`check_opt("${n}", sentences, ${e}): sentences takes 1`);
    out.get(n)!.sentences = true;
  }
  for (const [n, v] of col(r, 'check_opt(N, ticks, V)', 'N', 'V')) {
    const w = out.get(n); if (w) w.ticks = Number(v);
  }
  for (const [n, v] of col(r, 'check_opt(N, budget, V)', 'N', 'V')) {
    const w = out.get(n); if (w) w.budget = Number(v);
  }
  // the completed ticks whose provenance is kept (rofl-load --retain); Rust only
  for (const [n, v] of col(r, 'check_opt(N, retain, V)', 'N', 'V')) {
    const w = out.get(n);
    if (w && w.oneEngine !== 'rust' && !w.together) throw new Error(`check_opt("${n}", retain, ${v}): retain_ticks is set on a world not loaded together`);
    if (w) w.retain = Number(v);
  }
  // the facts retracted after the evaluation, in the order the registry lists them (rofl-load --retract)
  for (const [n, v] of col(r, 'check_opt(N, retract, V)', 'N', 'V')) {
    const w = out.get(n);
    if (w && !w.together) throw new Error(`check_opt("${n}", retract, "${v}"): a retraction is made in a world loaded together`);
    if (w) (w.retract ??= []).push(v);
  }
  // the space wall, in rows (rofl-load --space); Rust only
  for (const [n, v] of col(r, 'check_opt(N, space, V)', 'N', 'V')) {
    const w = out.get(n);
    if (w && w.oneEngine !== 'rust' && !w.together) throw new Error(`check_opt("${n}", space, ${v}): a space wall is set on a world not loaded together`);
    if (w) w.space = Number(v);
  }
  return [...out.values()];
}

/** The files a world is declared to refuse, as `world\tfile`. */
function expectedRefusals(): Set<string> {
  const r = pack('facts/checks.rofl');
  return new Set(r ? col(r, 'check_refuses(N, F)', 'N', 'F').map(([n, f]) => `${n}\t${f}`) : []);
}
/** The refusals a world is not declared to make: by check_refuses, or by its file's first line, `-- expect-refusal: <text>`, which the
 *  refusal says (expectedRefusal). */
function undeclared(w: World, a: Answer, ok: Set<string>): string[] {
  const left = a.dropped.filter((d) => !ok.has(`${w.name}\t${d.slice(0, d.indexOf(':'))}`));
  if (left.length === 0) return left;
  // a world in sentences is refused as the file the reader wrote, which carries the line (sentences.ts)
  const files = placed(w).files;
  return left.filter((d) => {
    const base = d.slice(0, d.indexOf(':')), f = files.find((x) => path.basename(x) === base), want = f && expectedRefusal(f);
    return !(want && d.slice(base.length + 1).includes(want));
  });
}


/** Rows per relation, read off the canonical state. `wit` lines are counted as
 *  one pseudo-relation: which support a store records among equals is not fixed
 *  by the semantics, so the COUNT is the part worth pinning. */
function census(state: string): Map<string, number> {
  const c = new Map<string, number>();
  for (const l of state.split('\n')) {
    if (l === '') continue;
    const k = l.startsWith('wit ') ? '@wit' : l.startsWith('cell ') ? '@cell' : l.startsWith('mem ') ? '@mem'
      : (/^([a-z_]+\[[a-z$]+\])/.exec(l)?.[1] ?? '@other');
    c.set(k, (c.get(k) ?? 0) + 1);
  }
  return c;
}

/** A WITNESS TUPLE IS NOT COMPARED, ITS CARDINALITY IS. A fact derivable more
 *  than one way has no distinguished support; which one a store records falls
 *  out of iteration order, so two engines that order differently disagree
 *  forever. Measured over the four worlds red since anybody looked — drip,
 *  spat, sus, wtf: every differing line was a witness line, zero were fact
 *  lines, and the differing lines agreed on head, rule, tick and support SIZE.
 *
 *  The anchor is the rule, NOT the first `[` in the line: a witness reads
 *  `wit ab1[main](...) <- rb6dc800c@0 [fact:...]` and the first bracket is in
 *  the HEAD. Anchoring there ate head, rule and tick, reported a clean sweep,
 *  and a mutant set with a PLANTING CONTROL is what caught it — eight planted,
 *  seven red, one survivor, which is this narrowing's stated cost. */
const WIT = /^(wit .* <- r[0-9a-f]+@\d+ )\[(.*)\]$/;
export function normalise(state: string): string {
  return state.split('\n').map((l) => {
    const m = WIT.exec(l);
    return m ? `${m[1]}[${m[2].split('; ').length}]` : l;
  }).join('\n');
}

const digest = (s: string): string =>
  createHash('sha256').update(normalise(s)).digest('hex').slice(0, 16);

/** AN ALARM IS NOT A COUNT, AND UNTIL NOW THE LOOP COULD NOT TELL.
 *
 *  The golden pins a census, so a relation meaning "this must not happen" is
 *  GREEN at whatever number it was blessed at — measured 2026-09-11: 118 audit
 *  rows non-zero and passing. Some of those are censuses (`collected[audit]`
 *  counts, it does not accuse); some are accusations. Nothing said which.
 *
 *  `alarm(Rel)` is declared beside the rule that concludes it, by the person
 *  who knows which it is. A world raising one FAILS whatever the golden says,
 *  so blessing cannot paper over it — which is the whole difference between a
 *  check and a record. */
function alarmsRaised(r: Rofl, state: string): string[] {
  return raised(r.query('alarm(R)').rows.map((row) => String(row.bindings['R'])), state);
}

/** Every row of every alarm relation, per book, read off the canonical state
 *  by prefix rather than off the census, whose key pattern cannot spell a
 *  relation name with a digit in it. Shared by both engines. */
function raised(rels: string[], state: string): string[] {
  const n = new Map<string, number>();
  for (const l of state.split('\n')) {
    for (const rel of rels) {
      if (!l.startsWith(`${rel}[`)) continue;
      const key = l.slice(0, l.indexOf(']') + 1);
      n.set(key, (n.get(key) ?? 0) + 1);
    }
  }
  return [...n].map(([k, c]) => `${k} ${c}`).sort();
}

/** The alarms a Rust state declares: its `alarm[main](rel)` rows. */
function alarmRels(state: string): string[] {
  return [...state.matchAll(/^alarm\[main\]\(([a-z_][a-z0-9_]*)\) /gm)].map((m) => m[1]);
}

/** THE ROWS A WORLD'S FILES SAY ITS STATE MUST HOLD, AND MUST NOT
 *  (`-- expect-row:`, `-- expect-no-row:`), read against either engine's
 *  state: an alarm `not answer` goes undecided and silent over a hole beside
 *  it (f_a_missing_row_check_goes_quiet_over_a_hole), and a row does not. */
function rowProblems(files: string[], state: string): string[] {
  const out: string[] = [], lines = state.split('\n');
  // no byte of control reaches the state: a mark the engine keeps for itself (a group no rule bound) prints as `_`
  const ctl = /[\x00-\x08\x0b-\x1f]/.exec(state);
  if (ctl) out.push(`a control byte 0x${ctl[0].charCodeAt(0).toString(16).padStart(2, '0')} reached the state: ${JSON.stringify(state.slice(Math.max(0, ctl.index - 40), ctl.index + 20))}`);
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/^-- expect-(no-)?row: (.+)$/gm)) {
      const want = m[2].trim(), has = lines.some((l) => l.startsWith(want));
      if (!m[1] && !has) out.push(`${path.basename(f)}: the state lacks the row ${want}`);
      if (m[1] && has) out.push(`${path.basename(f)}: the state holds the row ${want}`);
    }
  }
  return out;
}

/** The TypeScript engine's answer; `Engine` is another build of `Rofl`, which
 *  scripts/agg_breaks.ts loads from a copy of src/ with a fault planted. */
export function answerTS(w0: World, Engine: typeof Rofl = Rofl): Answer {
  if (w0.together) return answerTSTogether(w0, Engine);
  const w = placed(w0);
  // `evaluator, strata` reaches this engine as it reaches rofl-load: a world
  // both engines answer runs the stock evaluator in both, or the option would
  // be read by one and silently dropped by the other
  const r = new Engine(w.strata ? { evaluator: 'strata' } : {});
  // THE BUDGET GOES ON EVERY LOAD, NOT ONLY ON `evaluate`. In this host a load
  // evaluates what it can with the budget it is given, so a world whose budget
  // reaches `evaluate` alone has already been derived and never walls; in Rust
  // `Session::fresh(budget)` sets it once for the session. Passing it
  // everywhere is what makes the two comparable — measured: with the budget on
  // `evaluate` only, TypeScript completed a world Rust walled on, and that
  // looked exactly like an engine divergence until the instrument was checked.
  const opt = w.budget ?? w.cap ? { budget: w.budget ?? w.cap } : undefined;
  r.load(bootText(), w.strata ? { ...opt, defer: true } : opt); // a table a later file derives is not there yet when boot alone is evaluated
  // A REFUSAL IS AN ANSWER AND IT BELONGS IN THE GOLDEN. Until now a file that
  // would not load was dropped and the world carried on — which hid `ring1`
  // for as long as the corpus existed, and left "this program must be refused"
  // unassertable by anything but a test. The diagnostics are part of the
  // expected output now, so a program that stops being refused, or starts
  // being refused for a different reason, is a red.
  // THE FACT OF THE REFUSAL IS HASHED, THE MESSAGE IS NOT. Two implementations
  // word a syntax error differently and always will; that a file is refused,
  // and which one, is the part both must agree on. The message is printed by
  // `--bless` so a person can still read it.
  const diags: string[] = [];
  const dropped: string[] = [];
  const loaded: string[] = [], problems: string[] = [];
  for (const f of w.files) {
    const unread = unreadOf(f);
    // a fixture written to be refused says what for, in a world both answer
    const want = w.oneEngine ? null : expectedRefusal(f);
    // a load evaluates; under the stock evaluator only a fixture is judged alone, and any other file waits for its table
    const wait = w.strata && !want && !unread.length;
    const res = unread.length ? { ok: false, diagnostics: unread } : r.load(fs.readFileSync(f, 'utf8'), wait ? { ...opt, defer: true } : opt);
    if (want && res.ok) problems.push(`${path.basename(f)} was to be refused (${want}) and loaded`);
    if (want && !res.ok && !res.diagnostics.join('\n').includes(want)) problems.push(`${path.basename(f)} refused, but not for '${want}': ${res.diagnostics[0] ?? ''}`);
    if (res.ok) { loaded.push(f); continue; }
    dropped.push(`${path.basename(f)}: ${res.diagnostics[0] ?? ''}`);
    diags.push(`refused ${path.basename(f)}`);
  }
  if (w.ticks) for (let i = 0; i < w.ticks; i++) r.tickAdvance();
  else r.evaluate(w.budget ?? w.cap);
  const state = diags.sort().join('\n') + (diags.length ? '\n' : '') + r.store.canonicalState();
  return { hash: digest(state), facts: r.store.allFactKeys().length, census: census(state),
           dropped, alarms: alarmsRaised(r, state), problems: [...problems, ...rowProblems(loaded, state)] };
}

const belowArgs = (files: string[]): string[] => belowFiles(files).flatMap((f) => ['--below', f]);

/** The first line of a refusal fixture: `-- expect-refusal: <substring>`. */
export function expectedRefusal(f: string): string | null {
  const first = fs.readFileSync(f, 'utf8').split('\n', 1)[0];
  const m = /^-- expect-refusal: (.+)$/.exec(first);
  return m ? m[1].trim() : null;
}

/** A TOGETHER WORLD IN THE TYPESCRIPT ENGINE, as rofl-load runs one
 *  (`answerRustOnly`): a fixture is offered alone, boot and the world below
 *  it fed, and refused at the door (`load`) or by the evaluation (`eval`);
 *  every other file goes into the world, whose files all load before it is
 *  evaluated once, then ticked, explained, and read. */
/** The steps of a together world in the TypeScript engine, as rofl-load
 *  takes them: a fresh engine under the world's walls with boot loaded, the
 *  world below fed, and the evaluation (ticked and explained as declared),
 *  with its exit class for a refusal. */
function together(w: World, Engine: typeof Rofl) {
  const budget = w.budget ?? w.cap ?? 200_000_000;
  const fresh = (): Rofl => {
    const r = new Engine({ ...(w.strata ? { evaluator: 'strata' as const } : {}), ...(w.space ? { space: w.space } : {}),
      ...(w.retain !== undefined ? { retainTicks: w.retain } : {}) });
    if (!r.load(bootText(), { defer: true }).ok) throw new Error('boot.rofl does not load');
    return r;
  };
  // the world below: boot, the first file and the files it names, evaluated, then fed
  const feed = (r: Rofl, files: string[]): string | null => {
    const below = belowFiles(files);
    if (below.length === 0) return null;
    const b = fresh();
    for (const f of below) {
      const res = b.load(fs.readFileSync(f, 'utf8'), { defer: true });
      if (!res.ok) return `below: ${f} refused: ${res.diagnostics[0] ?? ''}`;
    }
    try { b.evaluate(budget); r.feedBelow(b); } catch (e) { return `below: ${(e as Error).message}`; }
    return null;
  };
  // the evaluation: rofl-load's, with its exit class for a refusal
  const run = (r: Rofl, explain: boolean): { cls: 'eval'; msg: string } | null => {
    try {
      if (!w.ticks || w.retract?.length) {
        r.evaluate(budget);
        for (const f of w.retract ?? []) {
          const x = r.retract(f);
          if (!x.ok) return { cls: 'eval', msg: `retract ${f}: ${x.diagnostics.join('; ')}` };
          r.evaluate(budget);
        }
        if (explain && !w.ticks) { r.explainRequests({ budget }); r.evaluate(budget); }
      }
      if (w.ticks) {
        for (let i = 0; i < w.ticks; i++) r.tickAdvance({ budget });
        if (explain) { r.evaluate(budget); r.explainRequests({ budget }); r.evaluate(budget); }
      }
    } catch (e) {
      const msg = (e as Error).message;
      // a world refused for a broken promise is asked again, as rofl-load asks it: it refuses again, never answers
      if (!/has two values in the book/.test(msg)) return { cls: 'eval', msg };
      try { r.evaluate(budget); } catch (e2) { return { cls: 'eval', msg: (e2 as Error).message }; }
      return { cls: 'eval', msg: 'a broken world was answered after its refusal' };
    }
    return null;
  };
  return { fresh, feed, run };
}

/** A together world's files, which `answerTSTogether` has already told from
 *  the fixtures it refuses, built into one world: the engine, and why it did
 *  not evaluate if it did not. scripts/whycheck.ts asks its questions of it. */
export function togetherWorld(w: World, keep: string[], Engine: typeof Rofl = Rofl): { r: Rofl; failed: string | null } {
  const { fresh, feed, run } = together(w, Engine);
  const r = fresh();
  let failed: string | null = null;
  for (const f of keep) {
    const res = r.load(fs.readFileSync(f, 'utf8'), { defer: true });
    if (!res.ok) { failed = `${f} refused: ${res.diagnostics.join(' / ')}`; break; }
  }
  if (failed === null) failed = feed(r, keep);
  if (failed === null) { const e = run(r, !!w.explain); if (e) failed = e.msg; }
  return { r, failed };
}

function answerTSTogether(w0: World, Engine: typeof Rofl): Answer {
  const w = placed(w0);
  const { fresh, feed, run } = together(w, Engine);
  const diags: string[] = [], keep: string[] = [], dropped: string[] = [], problems: string[] = [];
  for (const f of w.files) {
    const want = expectedRefusal(f), unread = unreadOf(f);
    if (!want && !unread.length) { keep.push(f); continue; }
    const base = path.basename(f);
    let cls: 'load' | 'eval' | null = null, msg = '';
    if (unread.length) { cls = 'load'; msg = unread.join('\n'); }
    else {
      const r = fresh();
      const res = r.load(fs.readFileSync(f, 'utf8'), { defer: true });
      if (!res.ok) { cls = 'load'; msg = res.diagnostics.join('\n'); }
      else {
        const fb = feed(r, [f]);
        if (fb !== null) { cls = 'eval'; msg = fb; }
        else { const e = run(r, false); if (e) { cls = e.cls; msg = e.msg; } }
      }
    }
    if (cls === null) {
      keep.push(f);
      if (want) problems.push(`${base} was to be refused (${want}) and loaded`);
      continue;
    }
    diags.push(`refused ${base} (${cls})`);
    dropped.push(`${base}: ${msg.split('\n').filter((l) => l.trim()).slice(-1)[0]?.trim() ?? ''}`);
    if (!want) problems.push(`${base} refused: ${msg.trim().split('\n').slice(0, 3).join(' / ')}`);
    else if (!msg.includes(want)) problems.push(`${base} refused, but not for '${want}': ${msg.trim().split('\n').slice(0, 3).join(' / ')}`);
  }
  const { r, failed } = togetherWorld(w, keep, Engine);
  if (failed !== null) problems.push(`the world does not evaluate: ${failed.trim().split('\n').slice(0, 3).join(' / ')}`);
  const state = r.store.canonicalState();
  if ((!w.budget && !w.space || w.cap) && /^hole\[\$kernel\]\(.*,(budget|space)_exhausted\) /m.test(state)) problems.push('the world was cut by the budget');
  problems.push(...rowProblems(keep, state));
  const full = diags.sort().join('\n') + (diags.length ? '\n' : '') + state;
  return { hash: digest(full), facts: r.store.allFactKeys().length, census: census(full), dropped, alarms: raised(alarmRels(state), state), problems };
}

/** A WORLD THAT SEALS PROVENANCE AND DECLARES A TREE'S CLOSURE is answered by the Rust engine from the tree, which stores none of
 *  the closure's rows. A hash that differs from the golden's there is accepted when the census matches (a witness is not
 *  recorded), and a census cannot see a member's premise or the spelling of a row; so its state must be the state of the same
 *  world with the closure stored (ROFL_NO_VCLOSURE), byte for byte, and a difference is a problem of its own.
 *
 *  A wall's cut moves with the engine (f_the_owner_settles_walls_promises_and_incremental): a row answered from the tree costs no
 *  space and no step, so a world whose wall the stored closure meets and the tree does not is not compared further. */
export const WALL_HOLE = /^hole\[\$kernel\]\(.*,(budget|space)_exhausted\) /m;
export const treeSealed = (files: string[]): boolean => {
  const text = files.filter((f) => f.endsWith('.rofl') && fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  return /^sealed\(provenance\)\./m.test(text) && /^tree \w+\(.*\) closure \w+\./m.test(text);
};
/** What the state with the closure stored says against the state answered from the tree: null where they agree or the stored one is cut by a wall. */
export const storedIsCut = (tree: string, stored: string): boolean => WALL_HOLE.test(stored) && !WALL_HOLE.test(tree);
export function closureVerdict(tree: string, stored: string): string | null {
  if (storedIsCut(tree, stored) || tree === stored) return null;
  const a = tree.split('\n'), b = stored.split('\n');
  const i = a.findIndex((l, k) => l !== b[k]);
  return `answered from its tree the state differs from the world with the closure stored, line ${i + 1}: ${JSON.stringify(a[i])} against ${JSON.stringify(b[i])}`;
}
function storedClosureProblems(w: World, keep: string[], args: string[], state: string): string[] {
  if (!treeSealed(keep)) return [];
  const p = spawnSync(RUST, args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, env: { ...process.env, ROFL_NO_VCLOSURE: '1' } });
  if (p.status !== 0) return [`the world with its closure stored does not evaluate (${p.status})`];
  const v = closureVerdict(state, p.stdout);
  return [...(v === null ? [] : [v]), ...snapshotProblems(args, state)];
}

/** A SNAPSHOT OF THAT WORLD, OPENED AND NOT EVALUATED, holds what the world held: the closure's rows were never stored, so a
 *  snapshot that did not carry the closure (or whose reopened engine did not read it off its tree) answered `ask` with nothing
 *  and listed none of the rows, though the readers held. rofl-serve opens what rofl-load --save wrote; its state is the world's. */
function snapshotProblems(args: string[], state: string): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-closure-snap-'));
  try {
    const snap = path.join(dir, 'world.seed.json');
    const saved = spawnSync(RUST, [...args, '--save', snap], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
    if (saved.status !== 0) return [`the world does not save a snapshot (${saved.status})`];
    const serve = spawnSync(path.join(path.dirname(RUST), 'rofl-serve'), [], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024,
      input: `${JSON.stringify({ op: 'open', seedPath: snap })}\n${JSON.stringify({ op: 'state', session: 1 })}\n` });
    const reopened = (JSON.parse((serve.stdout ?? '').split('\n')[1] || '{}') as { state?: string }).state;
    if (reopened === undefined) return ['a snapshot of the world is not opened by rofl-serve'];
    if (reopened === state.replace(/\n$/, '')) return [];
    const a = reopened.split('\n'), b = state.replace(/\n$/, '').split('\n');
    const i = a.findIndex((l, k) => l !== b[k]);
    return [`a snapshot opened and not evaluated holds another state than the world, line ${i + 1}: ${JSON.stringify(a[i])} against ${JSON.stringify(b[i])}`];
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

export function answerRust(w0: World): Answer | null {
  if (!fs.existsSync(RUST)) return null;
  const w = placed(w0);
  if (w.together) return answerRustOnly(w);
  // A WORLD MAY DECLARE THAT ONE ENGINE ANSWERS IT, and the declaration is in
  // facts/checks.rofl with its reason. Not an escape hatch: the alternative is
  // a permanent red, which this repository has already recorded as the state in
  // which a check gets switched off.
  if (w.oneEngine === 'ts') return null;
  if (w.oneEngine === 'rust') return answerRustOnly(w);
  if (belowFiles(w.files).length > 0) throw new Error(`${w.name}: a world below is fed by the Rust engine alone, and this world is not Rust-only`);
  // A REFUSED FILE IS OBSERVED, NOT FATAL. `rofl-load` exits non-zero and
  // prints to stderr when it will not load a program — which IS the answer for
  // a world written to be refused. The first version let execFileSync throw,
  // and the whole check died on the one world whose point is the refusal. Each
  // file is offered alone first; what loads goes into the world, what does not
  // becomes a `refused` line exactly as on the TypeScript side.
  //
  // The MESSAGE is not hashed. Two implementations word a syntax error
  // differently and always will; that a file is refused, and which one, is the
  // part both must agree on.
  const run = (args: string[]): string => execFileSync(RUST, args,
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const boot = bootPath();
  const diags: string[] = [], keep: string[] = [], problems: string[] = [];
  for (const f of w.files) {
    const unread = unreadOf(f), want = expectedRefusal(f), base = path.basename(f);
    // only a fixture is offered alone, as answerRustOnly does: a file that needs its stratum table beside it is refused alone, rightly
    if (!want && !unread.length && w.strata) { keep.push(f); continue; }
    const p = unread.length ? { status: 2, stderr: unread.join('\n') } : spawnSync(RUST, [boot, ...(w.strata ? ['--strata'] : []), f], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
    if (p.status === 0) {
      keep.push(f);
      if (want) problems.push(`${base} was to be refused (${want}) and loaded`);
      continue;
    }
    diags.push(`refused ${base}`);
    if (want && !p.stderr.includes(want)) problems.push(`${base} refused, but not for '${want}': ${p.stderr.trim().split('\n')[0]}`);
  }
  const args = [boot, ...(w.ticks ? ['--ticks', String(w.ticks)] : []),
    ...(w.budget ?? w.cap ? ['--budget', String(w.budget ?? w.cap)] : []), ...(w.strata ? ['--strata'] : []), ...keep];
  const state = run(args);
  const full = diags.sort().join('\n') + (diags.length ? '\n' : '') + state;
  return { hash: digest(full), facts: 0, census: census(full), dropped: [], alarms: raised(alarmRels(state), state),
           problems: [...problems, ...rowProblems(keep, state), ...storedClosureProblems(w, keep, args, state)] };
}

/** A WORLD ONLY THE RUST ENGINE ANSWERS: the hash, the census AND THE ALARMS
 *  come from its state, since nothing else evaluated it. A refusal names its
 *  class — exit 2 is the load door, exit 3 the evaluation — and a fixture
 *  written to be refused says what for on its first line, which must appear
 *  in the refusal or the world fails.
 *
 *  ONLY A FIXTURE IS OFFERED ALONE. Any other file goes straight into the
 *  world, which must then evaluate: a data file that only makes sense beside
 *  its stratum table (agg_count_strata_stock) is refused alone under the
 *  stock evaluator, and rightly. */
function answerRustOnly(w: World): Answer {
  const boot = bootPath();
  const opts = [...(w.ticks ? ['--ticks', String(w.ticks)] : []), ...(w.budget ?? w.cap ? ['--budget', String(w.budget ?? w.cap)] : []),
    ...(w.space ? ['--space', String(w.space)] : []), ...(w.strata ? ['--strata'] : []),
    ...(w.retain !== undefined ? ['--retain', String(w.retain)] : []), ...(w.retract ?? []).flatMap((f) => ['--retract', f])];
  const diags: string[] = [], keep: string[] = [], dropped: string[] = [], problems: string[] = [];
  for (const f of w.files) {
    const want = expectedRefusal(f), unread = unreadOf(f);
    if (!want && !unread.length) { keep.push(f); continue; }
    const p = unread.length ? { status: 2, stderr: unread.join('\n') } : spawnSync(RUST, [boot, ...opts, ...belowArgs([f]), f], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
    const base = path.basename(f);
    if (p.status === 0) {
      keep.push(f);
      if (want) problems.push(`${base} was to be refused (${want}) and loaded`);
      continue;
    }
    if (p.status !== 2 && p.status !== 3) throw new Error(`rofl-load died on ${base} (${p.status}): ${p.stderr}`);
    diags.push(`refused ${base} (${p.status === 2 ? 'load' : 'eval'})`);
    dropped.push(`${base}: ${p.stderr.split('\n').filter((l) => l.trim()).slice(-1)[0]?.trim() ?? ''}`);
    if (!want) problems.push(`${base} refused: ${p.stderr.trim().split('\n').slice(0, 3).join(' / ')}`);
    else if (!p.stderr.includes(want)) problems.push(`${base} refused, but not for '${want}': ${p.stderr.trim().split('\n').slice(0, 3).join(' / ')}`);
  }
  const runArgs = [boot, ...opts, ...(w.explain ? ['--explain'] : []), ...belowArgs(keep), ...keep];
  const p = spawnSync(RUST, runArgs, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (p.status !== 0) {
    problems.push(`the world does not evaluate (${p.status}): ${p.stderr.trim().split('\n').slice(0, 3).join(' / ')}`);
  }
  const state = p.stdout;
  // A WORLD THE BUDGET CUT PROVES NOTHING: its alarms may not have been
  // reached. Only a world that asks for a wall may be cut by it, and what
  // its alarms cannot say after the cut, its files say as rows the cut state
  // must hold and must not (`-- expect-row:`, `-- expect-no-row:`).
  if ((!w.budget && !w.space || w.cap) && /^hole\[\$kernel\]\(.*,(budget|space)_exhausted\) /m.test(state)) problems.push('the world was cut by the budget');
  problems.push(...rowProblems(keep, state));
  const full = diags.sort().join('\n') + (diags.length ? '\n' : '') + state;
  const facts = state.split('\n').filter((l) => / support=\d+$/.test(l)).length;
  return { hash: digest(full), facts, census: census(full), dropped, alarms: raised(alarmRels(state), state),
           problems: [...problems, ...(p.status === 0 ? storedClosureProblems(w, keep, runArgs, state) : [])] };
}

/** THE TYPESCRIPT ENGINE'S SHRUG SURFACES (docs/aggregates.md, "Shrugs, as
 *  built"): `?` lists a shrug with its reason beside the rows that hold, `why`
 *  explains one down to its root, and `whynot` tells a shrug from what is
 *  unentailed. They are host verbs, which a world cannot call (the Rust
 *  engine's are held by agg_cell_shrug_why, through the explain bridge), so
 *  they are asked here, over the world agg_cell_shrug reads. */
export function shrugSurfaces(): string[] {
  const out: string[] = [];
  // every cause this engine writes on a hole row is declared (shrug.rofl)
  for (const c of [BUDGET_REASON, SPACE_REASON, ARITH_TYPE_REASON, ARITH_ZERO_REASON, ARITH_OVERFLOW_REASON,
    STR_TYPE_REASON, STR_INDEX_REASON, STR_SEP_REASON, ATOM_NAME_REASON, SEALED_REASON, 'support_withdrawn', 'fault_left_out']) {
    if (reasonOf(c) === undefined) out.push(`shrug.rofl does not declare the cause ${c}`);
  }
  const r = new Rofl();
  r.load(BOOT);
  if (!r.load(fs.readFileSync(path.join(ROOT, 'examples/checks/agg-shrug-data.rofl'), 'utf8')).ok) return ['agg-shrug-data.rofl does not load'];
  const q = r.query('sd_lose(X)');
  if (q.rows.map((x) => x.text).join('; ') !== 'X = b; X = e') out.push(`? sd_lose(X) holds for ${q.rows.map((x) => x.text).join('; ')}, not b and e`);
  const sh = (q.shrugs ?? []).map((x) => `${x.text} ${x.reason}`).join('; ');
  if (sh !== 'X = c inherited') out.push(`? sd_lose(X) lists the shrugs '${sh}', not 'X = c inherited'`);
  if (!(q.shrugs ?? []).some((x) => x.line.includes('the answer reads another answer that is a shrug'))) out.push('? sd_lose(X) gives a shrug no reason text');
  const v = r.query('sd_val(b, V)');
  if ((v.shrugs ?? []).map((x) => x.text).join() !== 'V = _[sd_val(b, _).1]') out.push(`? sd_val(b, V) names what it does not know as '${(v.shrugs ?? []).map((x) => x.text).join()}', not 'V = _[sd_val(b, _).1]'`);
  const w = r.why('sd_lose(c)');
  if (!w.text.includes('root $rule(') || !w.text.includes('arith_overflow, arithmetic left the integer range')) out.push(`why sd_lose(c) does not reach its root: ${w.text.split('\n')[0]}`);
  if (!w.text.includes('sd_win[main](c)@now :- sd_big[main](?B)@now')) out.push('why sd_lose(c) does not show the rule its root is');
  const n1 = r.whynot('sd_settled(c)');
  if (n1.holds || !n1.text.startsWith('whynot sd_settled[main](c): no answer, a shrug')) out.push(`whynot sd_settled(c) does not call it a shrug: ${n1.text.split('\n')[0]}`);
  // a world a wall cut: what does not hold is no answer, for the budget
  const b = new Rofl();
  b.load(BOOT, { budget: 50 });
  b.load(fs.readFileSync(path.join(ROOT, 'examples/checks/budget-wall.rofl'), 'utf8'), { budget: 50 });
  b.evaluate(50);
  const bq = b.query('tri(X, Y, Z)');
  if (!(bq.shrugs ?? []).some((x) => x.reason === 'budget' && x.line.includes('spent(steps, 51, 50)'))) out.push(`? over a world the wall cut lists no budget shrug: ${JSON.stringify(bq.shrugs ?? [])}`);
  const n2 = r.whynot('sd_lose(a)');
  if (n2.text.includes('a shrug') || !n2.text.includes('failed premise')) out.push(`whynot sd_lose(a) does not show an unentailed literal's failed premises: ${n2.text.split('\n').slice(0, 2).join(' / ')}`);
  return out;
}

/** EVERY DOOR ADMITS AN AGGREGATE AND ANSWERS AS THE RUST ENGINE DOES
 *  (docs/aggregates.md, "The TypeScript engine, as built"): `load`, `assert`
 *  and `assertClauses` of each kind a program writes give one state, and a
 *  snapshot the Rust engine saved (cells, lattices, a join read, an interval
 *  function, a dominance) reopens here to the state it saved, and evaluates
 *  again to it. A world cannot ask this (it is the host's contract), so it is
 *  asked here. */
export function aggregateDoors(): string[] {
  const out: string[] = [];
  const base = 'edb(agg_door_q). agg_door_q(1). agg_door_q(2). edb(agg_door_e). agg_door_e(k, 1). agg_door_e(k, 2). edb(agg_door_s). agg_door_s(set(1, 2)).';
  const progs: [string, string][] = [
    ['a count', 'agg_door(N) :- N is count(X : agg_door_q(X)).'],
    ['a lattice', 'lattice agg_door_l(X, min D).\nagg_door_l(X, D) :- agg_door_e(X, D).'],
    ['a threshold', 'agg_door_t() :- at_least(2, X : agg_door_q(X)).'],
    ['a join', 'lattice agg_door_j(X, union S).\nagg_door_j(K, set(X)) :- agg_door_e(K, X).'],
    ['a join read', 'agg_door_in(E) :- agg_door_s(S), E in S.\nagg_door_sub(S) :- agg_door_s(S), set(1) subset S.'],
    ['a widening', 'lattice agg_door_w(X, hull I) widen 2.\nagg_door_w(K, iv(X, X)) :- agg_door_e(K, X).'],
    ['an interval function', 'agg_door_iv(J) :- agg_door_q(I), J is ivadd(I, 1).'],
    ['a dominance rule', 'agg_door_d(K, X) :- agg_door_e(K, X).\nagg_door_d(K, X) <= agg_door_d(K, Y) :- Y < X.'],
  ];
  const fresh = (): Rofl => { const r = new Rofl(); r.load(BOOT); r.load(base); return r; };
  const stateOf = (f: (r: Rofl) => { ok: boolean; diagnostics: string[] }): string => {
    const r = fresh();
    const res = f(r);
    if (!res.ok) return `refused: ${res.diagnostics.join('; ')}`;
    r.evaluate();
    return r.store.canonicalState();
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-agg-door-'));
  try {
    for (const [what, prog] of progs) {
      const viaLoad = stateOf((r) => r.load(prog));
      if (viaLoad.startsWith('refused')) { out.push(`load ${what}: ${viaLoad}`); continue; }
      // the plan the aggregate evaluator used, asked as of any program: each negation at the level its head closes at
      try {
        const r = fresh();
        r.load(`${prog}\nagg_door_not(X) :- agg_door_q(X), not agg_door_e(k, X).`);
        const plan = r.strataPlan().filter((x) => x.rel === 'agg_door_not');
        if (plan.length !== 1 || typeof plan[0].level !== 'number') out.push(`strataPlan ${what}: ${JSON.stringify(plan)}, not one negation at a level`);
      } catch (e) { out.push(`strataPlan ${what}: ${(e as Error).message}`); }
      // `assert` and `assertClauses` take no declaration or dominance rule's
      // neighbour in one call less than `load` does: each clause alone
      const viaAssert = stateOf((r) => { for (const c of parseProgram(prog)) { const x = r.assertClauses([c]); if (!x.ok) return x; } return { ok: true, diagnostics: [] }; });
      if (viaAssert !== viaLoad) out.push(`assertClauses ${what}: a state other than load's`);
      const viaText = stateOf((r) => r.assert(prog));
      if (viaText !== viaLoad) out.push(`assert ${what}: a state other than load's`);
      if (!fs.existsSync(RUST)) continue;
      const src = path.join(dir, 'door.rofl'), snap = path.join(dir, 'door.json');
      fs.writeFileSync(src, `${base}\n${prog}\n`);
      const rust = execFileSync(RUST, [path.join(ROOT, 'boot.rofl'), '--save', snap, src], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (normalise(rust) !== normalise(viaLoad)) out.push(`${what}: the TypeScript engine's state is not the Rust engine's`);
      try {
        const r = Rofl.fromSnapshot(fs.readFileSync(snap, 'utf8'));
        if (normalise(r.store.canonicalState()) !== normalise(rust)) out.push(`${what}: a Rust snapshot reopened to another state`);
        r.store.dirty = true;
        r.evaluate();
        if (normalise(r.store.canonicalState()) !== normalise(rust)) out.push(`${what}: a Rust snapshot evaluated again to another state`);
      } catch (e) { out.push(`${what}: a Rust snapshot refused: ${(e as Error).message}`); }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  return out;
}

/** NO FRAME PER LEVEL: `why` and `whynot` of a chain 3000 derivations deep, by each TypeScript evaluator (the plain
 *  one, and the aggregate one a lattice declaration hands the program to), reach its bottom with the text the Rust
 *  engine writes on the same program: rust/rofl/tests/explain.rs holds the same lengths. A world cannot ask whynot
 *  deeper than the explain bridge's three levels, so this is asked here. */
export function deepExplain(): string[] {
  const out: string[] = [], n = 3000;
  const src = `edb(q). q(0).\np(C) :- q(C).\np(J) :- p(I), I < ${n}, J is I + 1.\nw(J) :- p(J), I is J - 1, w(I).\n`;
  for (const [what, extra] of [['the plain evaluator', ''], ['the aggregate evaluator', 'lattice dd(C, min D).\ndd(C, 0) :- q(C).\n']]) {
    const r = new Rofl();
    r.load(BOOT);
    if (!r.load(src + extra).ok) { out.push(`${what}: the chain does not load`); continue; }
    try {
      const why = r.why(`p(${n})`);
      if (!why.ok || why.text.length !== 27_268_619 || !why.text.endsWith(`${n} is +(${n - 1},1) [builtin]`)) out.push(`${what}: why of a chain ${n} deep is ${why.text.length} characters (${why.text.slice(0, 80)}), not the Rust engine's 27268619`);
      const wn = r.whynot(`w(${n})`, { depth: n + 10, nodes: 10 * n });
      const lines = wn.text.split('\n').length;
      if (wn.holds || wn.text.length !== 36_585_121 || lines !== 6021) out.push(`${what}: whynot of a chain ${n} deep is ${wn.text.length} characters in ${lines} lines (${wn.text.slice(0, 80)}), not the Rust engine's 36585121 in 6021`);
    } catch (e) { out.push(`${what}: ${(e as Error).message}`); }
  }
  return out;
}

// ------------------------------------------------------------- the hosts
//
// THE HALF A WORLD CANNOT REACH. A `.rofl` file says what holds; it cannot ask
// `why`, retract a fact, excise one and watch the blast radius, fork a store or
// advance a tick. Measured over the 23 demos, TWENTY-ONE call at least one of
// `why`, `whynot`, `excise`, `retract`, `fromSnapshot`, `tickAdvance` or a
// runtime `assert` — so the demos are not scaffolding round the language, they
// ARE the demonstration of the host contract, and that contract had no oracle.
//
// Their stdout is one. Measured: two runs of a demo differ in exactly the line
// carrying its own elapsed milliseconds and nowhere else, so masking that makes
// the output hashable. The EXIT CODE is part of the answer — `moot` exits 1
// because it found a disagreement and says so, and a demo that stopped
// disagreeing would be a change worth seeing.
//
// One engine by nature: these are TypeScript programs.

// A MEASUREMENT LINE LOSES ITS NUMBERS, and the rule is one sentence rather
// than a list of formats. The first mask took `N ms` and five demos still moved
// between runs; the second added every time unit and `npc` still moved on
// `7.2 ticks/s`, where the number touches no unit at all. Enumerating formats
// is widening a guess — so instead: a line that reports a DURATION OR A RATE is
// a measurement, and none of its numbers are part of what the demo demonstrates.
//
// The cost is stated: a line that mixes a count with a timing loses the count
// too. What it buys is that a demo printing a benchmark is still hashable, and
// the rest of its output — the answers, the explanations, the refusals — is
// compared exactly.
// ...OR AN ENVIRONMENT READING. `cram` prints the machine's load average
// beside its own numbers, which is a property of the hardware and not of the
// tree — the same class as `slop` measuring itself against whatever
// LibreOffice is installed, and the same answer: it is not part of what the
// demo demonstrates.
const TIMED = /\b(ms|us|µs|ns)\b|\b\d\s*s\b|\/(s|tick|fact|row)\b|\b\d+(\.\d+)?x\b|load average/;
const NUMS = /\d+(\.\d+)?/g;

function maskTimings(out: string): string {
  // WHITESPACE COLLAPSES ON A MASKED LINE TOO: `153` and `1` mask to the same
  // `#` but leave different column padding behind, so the alignment carried the
  // timing the number no longer did.
  // A SOURCE DIGEST IS AN ENVIRONMENT READING TOO: `cram` prints a hash of src/, which moves on every edit to src/
  // whatever the edit (f_a_demo_that_casts_into_the_evaluator_breaks_when_its_shape_grows).
  return out.split('\n')
    .map((l) => (TIMED.test(l) ? l.replace(NUMS, '#').replace(/ +/g, ' ') : l.replace(/\bat digest [0-9a-f]{12}\b/, 'at digest #')))
    .join('\n');
}

/** A DEMO WHOSE OUTPUT IS NOT A FUNCTION OF THE TREE, declared in
 *  facts/checks.rofl with its reason. Two of the twenty-three: `npc` prints a
 *  benchmark TABLE whose columns carry no units, so a timing and a row count
 *  are indistinguishable line by line and no mask can separate them; `slop`
 *  measures itself against a headless LibreOffice and answers about whatever
 *  is installed. Enumerating more number formats to chase the first is
 *  widening a guess, which is how the mask got to its third version. */
function unhashable(): Set<string> {
  const r = pack('facts/checks.rofl');
  return new Set(r ? col(r, 'demo_unhashable(N, Why)', 'N').map(([n]) => n) : []);
}

export function demos(): string[] {
  const ex = path.join(ROOT, 'examples');
  const skip = unhashable();
  return fs.readdirSync(ex).sort()
    .filter((e) => !skip.has(e))
    .map((e) => path.join(ex, e, 'demo.ts'))
    .filter((p) => fs.existsSync(p));
}

export function answerDemo(file: string): { hash: string; exit: number; lines: number } {
  let out = ''; let exit = 0;
  try {
    out = execFileSync(process.execPath, ['--experimental-strip-types', file],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    exit = err.status ?? -1;
    out = (err.stdout ?? '') + (err.stderr ?? '');
  }
  const masked = maskTimings(out);
  return { hash: digest(masked), exit, lines: masked.split('\n').length };
}

// --------------------------------------------------------------- the pack

let hostRows: [string, { hash: string; exit: number; lines: number }][] = [];

function render(rows: [World, Answer][]): string {
  const L = [
    '-- facts/goldens.rofl — GENERATED by `npm run bless`. The whole-repository',
    '-- check reads it; `npm test` compares both engines against it.',
    '--',
    '-- A golden is taken at a WORKING STATE and committed. Re-blessing is a',
    '-- decision and shows up as a diff, which is the whole point: the harness',
    '-- this replaced regenerated its expectation before every run, so no change',
    '-- to any `.rofl` could turn it red.',
    '--',
    `-- ${rows.length} worlds.`,
    '',
    'edb(golden_state).',
    'edb(golden_rel).',
    'edb(golden_host).',
    '',
  ];
  for (const [w, a] of rows) L.push(`golden_state("${w.name}", "${a.hash}", ${a.facts}).`);
  L.push('');
  for (const [name, h] of hostRows) L.push(`golden_host("${name}", "${h.hash}", ${h.exit}, ${h.lines}).`);
  L.push('');
  for (const [w, a] of rows)
    for (const [rel, n] of [...a.census].sort()) L.push(`golden_rel("${w.name}", "${rel}", ${n}).`);
  return L.join('\n') + '\n';
}

let goldenPack: Rofl | null | undefined;
const golden = (): Rofl | null => (goldenPack ??= pack('facts/goldens.rofl'));

/** The goldens of facts/goldens.rofl, or of `text` in its place (another
 *  revision of the file, which scripts/agg_breaks.ts --changed compares). */
export function parse(text?: string): Map<string, { hash: string; facts: number; census: Map<string, number> }> {
  const r = text === undefined ? golden() : pack('facts/goldens.rofl', text);
  const out = new Map<string, { hash: string; facts: number; census: Map<string, number> }>();
  if (!r) return out;
  for (const [n, h, f] of col(r, 'golden_state(N, H, F)', 'N', 'H', 'F'))
    out.set(n, { hash: h, facts: Number(f), census: new Map() });
  for (const [n, rel, c] of col(r, 'golden_rel(N, Rel, C)', 'N', 'Rel', 'C'))
    out.get(n)?.census.set(rel, Number(c));
  return out;
}

function parseHosts(): Map<string, { hash: string; exit: number; lines: number }> {
  const r = golden();
  const out = new Map<string, { hash: string; exit: number; lines: number }>();
  if (!r) return out;
  for (const [n, h, e, l] of col(r, 'golden_host(N, H, E, L)', 'N', 'H', 'E', 'L'))
    out.set(n, { hash: h, exit: Number(e), lines: Number(l) });
  return out;
}

// ------------------------------------------------------------------- main

/** Every `.rofl.md` world the walk will read, so the reads can run at once. */
function mdWorldPaths(): string[] {
  const out: string[] = [];
  const walk = (dir: string, deep: boolean): void => {
    for (const e of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, e);
      if (fs.statSync(p).isDirectory()) { if (deep || dir.endsWith('examples')) walk(p, deep); continue; }
      if (e.endsWith('.rofl.md')) out.push(p);
    }
  };
  walk(path.join(ROOT, 'examples'), false);
  walk(path.join(ROOT, 'rules'), true);
  return out;
}

export type EngineChoice = 'both' | 'ts' | 'rust';

/** The engine(s) the working tree's changes since `ref` call for: only rust/ -> Rust, only src/ -> TypeScript, anything else, or nothing, both. */
function engineFromChanges(ref: string): { engine: EngineChoice; why: string } {
  const run = (args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const files = [...new Set([...run(['diff', '--name-only', ref]), ...run(['ls-files', '-o', '--exclude-standard'])])];
  if (files.length === 0) return { engine: 'both', why: `no change since ${ref}` };
  if (files.every((f) => f.startsWith('rust/'))) return { engine: 'rust', why: `${files.length} changed file(s) since ${ref}, all under rust/` };
  if (files.every((f) => f.startsWith('src/'))) return { engine: 'ts', why: `${files.length} changed file(s) since ${ref}, all under src/` };
  const other = files.find((f) => !f.startsWith('rust/') && !f.startsWith('src/'))!;
  return { engine: 'both', why: `${other} changed since ${ref}` };
}

let refusalsOk: Set<string> | undefined;
/** One world against its golden: null when it passes, else its FAIL line. */
export function checkWorld(w: World, g: { hash: string; census: Map<string, number> } | undefined, rustMissing: boolean, engine: EngineChoice = 'both'): string | null {
  if (!g) return `${w.name}: no golden — bless it or delete the world`;
  // a world only the other engine answers is not asked of this one
  if (w.oneEngine && engine !== 'both' && w.oneEngine !== engine) return null;
  const t0 = Date.now();
  // a Rust-only world is never given to the TypeScript engine
  const ts = w.oneEngine === 'rust' || engine === 'rust' ? null : answerTS(w);
  const t1 = Date.now();
  const rs = rustMissing || engine === 'ts' ? null : answerRust(w);
  if (process.env.ROFL_TIMES) fs.appendFileSync(process.env.ROFL_TIMES, `${w.name}\t${t1 - t0}\t${Date.now() - t1}\t${(ts ?? rs)?.facts ?? 0}\t${w.oneEngine ?? 'both'}\n`);
  const bad: string[] = [];
  // a file the world refuses and is not declared to refuse (check_refuses in facts/checks.rofl)
  const blessed = w.oneEngine === 'rust' ? rs : ts;
  if (blessed) for (const d of undeclared(w, blessed, refusalsOk ??= expectedRefusals())) bad.push(`REFUSED ${d}`);
  if (w.oneEngine === 'rust') {
    if (!rs) return `${w.name.padEnd(28)} rust-only world and no Rust binary`;
    if (rs.hash !== g.hash) {
      const moved = [...new Set([...g.census.keys(), ...rs.census.keys()])]
        .filter((k) => (g.census.get(k) ?? 0) !== (rs.census.get(k) ?? 0))
        .map((k) => `${k} ${g.census.get(k) ?? 0}->${rs.census.get(k) ?? 0}`);
      bad.push(`rust: ${moved.length ? moved.slice(0, 3).join(', ') : 'same census, different state'}`);
    }
    for (const p of rs.problems) bad.push(p);
    for (const a of rs.alarms) bad.push(`ALARM ${a}`);
    return bad.length === 0 ? null : `${w.name.padEnd(28)} ${bad.join('  |  ')}`;
  }
  if (engine === 'rust') {
    if (!rs) return `${w.name.padEnd(28)} no Rust binary`;
    const sealsProv = w.files.some((f) => f.endsWith('.rofl') && fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f), 'utf8').includes('sealed(provenance)'));
    if (rs.hash !== g.hash) {
      const skip = sealsProv ? '@wit' : '';
      const moved = [...new Set([...g.census.keys(), ...rs.census.keys()])]
        .filter((k) => k !== skip && (g.census.get(k) ?? 0) !== (rs.census.get(k) ?? 0))
        .map((k) => `${k} ${g.census.get(k) ?? 0}->${rs.census.get(k) ?? 0}`);
      if (!skip || moved.length) bad.push(`rust: ${moved.length ? moved.slice(0, 3).join(', ') : 'same census, different state'}`);
    }
    for (const p of rs.problems) bad.push(`rust: ${p}`);
    for (const a of rs.alarms) bad.push(`ALARM rust: ${a}`);
    return bad.length === 0 ? null : `${w.name.padEnd(28)} ${bad.join('  |  ')}`;
  }
  if (!ts) return `${w.name.padEnd(28)} no TypeScript answer`;
  // under sealed(provenance) the Rust engine records no witness, so its witness count is not compared
  const sealsProvenance = w.files.some((f) => f.endsWith('.rofl') && fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f), 'utf8').includes('sealed(provenance)'));
  for (const [who, a] of [['ts', ts], ['rust', rs]] as [string, Answer | null][]) {
    if (!a || a.hash === g.hash) continue;
    const skip = who === 'rust' && sealsProvenance ? '@wit' : '';
    const moved = [...new Set([...g.census.keys(), ...a.census.keys()])]
      .filter((k) => k !== skip && (g.census.get(k) ?? 0) !== (a.census.get(k) ?? 0))
      .map((k) => `${k} ${g.census.get(k) ?? 0}->${a.census.get(k) ?? 0}`);
    if (skip && moved.length === 0) continue;
    bad.push(`${who}: ${moved.length ? moved.slice(0, 3).join(', ') : 'same census, different state'}`);
  }
  // AN ALARM IS RED WHATEVER THE GOLDEN SAYS. Blessing records a number;
  // this is a claim that the number must be none, and the two must not be
  // confusable — a world that raises one fails even when its census matches.
  // So is a row the world's files say its state must hold, in either engine.
  for (const [who, a] of [['ts', ts], ['rust', rs]] as [string, Answer | null][]) {
    if (!a) continue;
    for (const p of a.problems) bad.push(`${who}: ${p}`);
    for (const x of a.alarms) if (who === 'ts' || !ts.alarms.includes(x)) bad.push(`ALARM ${who === 'ts' ? '' : 'rust: '}${x}`);
  }
  return bad.length === 0 ? null : `${w.name.padEnd(28)} ${bad.join('  |  ')}`;
}

/** The answer a world is blessed from, and what a person must read about it. */
export function blessAnswer(w: World): { a: Answer; said: string[] } {
  const ts = answerTS(w);
  if (w.oneEngine !== 'rust') return { a: ts, said: [...ts.problems, ...ts.alarms.map((a) => `ALARM ${a}`)].map((p) => `  !! ${w.name}: ${p}`) };
  const rs = answerRust(w);
  if (!rs) throw new Error(`${w.name}: rust-only world and no Rust binary`);
  return { a: rs, said: [...rs.problems, ...rs.alarms.map((a) => `ALARM ${a}`)].map((p) => `  !! ${w.name}: ${p}`) };
}

const SELF = new URL(import.meta.url).pathname;

/** A command run beside the worlds, its output read when it is needed. */
const beside = (script: string, ...args: string[]): Promise<{ status: number | null; out: string }> =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, ['--experimental-strip-types', path.join(ROOT, script), ...args, '--check'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (status) => resolve({ status, out }));
  });

/** A selection that names nothing is a red run with the reason, not a stack. */
function refuse(e: unknown): never {
  console.log(`FAIL ${(e as Error).message}`);
  process.exit(1);
}

const isMain = process.argv[1] && path.basename(process.argv[1]) === 'goldens.ts';
if (isMain) {
  const { sel, rest } = parseSelector(process.argv.slice(2));
  const blessing = rest.includes('--bless'), hosts = rest.includes('--hosts');
  let engine: EngineChoice = 'both', engineWhy = '';
  for (const a of rest) {
    const [flag, inline] = a.split('=', 2);
    if (flag === '--changed') ({ engine, why: engineWhy } = engineFromChanges(inline ?? 'HEAD'));
  }
  const ei = rest.findIndex((a) => a === '--engine' || a.startsWith('--engine='));
  if (ei >= 0) {
    const v = rest[ei].includes('=') ? rest[ei].split('=')[1] : rest[ei + 1];
    if (v !== 'rust' && v !== 'ts' && v !== 'both') refuse(new Error(`--engine ${v ?? ''}: rust, ts or both`));
    engine = v as EngineChoice; engineWhy = '--engine';
  }
  if (engine !== 'both' && (blessing || hosts)) refuse(new Error('a golden is blessed from, and the demos run on, their own engines: no --engine or --changed with --bless or --hosts'));
  if (sel && (blessing || hosts)) throw new Error('a selection checks worlds; it neither blesses nor runs the demos');
  // NO GOLDEN IS TAKEN, AND NO RUN IS JUDGED, WITH A FAULT SWITCHED ON. The
  // breaks build obeys ROFL_BREAK and ROFL_KERNEL_OVERRIDE, and either one
  // left exported in a shell turned a bless into a golden of the fault
  // (`ROFL_PROFILE=breaks ROFL_BREAK=max npm run bless` blessed 23 moves). The
  // pool workers of scripts/agg_breaks.ts set both empty and never run this.
  const planted = ['ROFL_BREAK', 'ROFL_KERNEL_OVERRIDE', 'ROFL_BOOT', 'ROFL_READER'].filter((k) => process.env[k]);
  if (planted.length) refuse(new Error(`${planted.map((k) => `${k}=${process.env[k]}`).join(', ')} is set: a planted fault is switched on; unset it`));
  if (blessing && PROFILE === 'breaks') refuse(new Error('ROFL_PROFILE=breaks is the build that holds every planted fault; bless with release or fast'));
  if (blessing && fs.existsSync(RUST) && fs.readFileSync(RUST).includes('ROFL_BREAK')) {
    refuse(new Error(`${path.relative(ROOT, RUST)} is built with the planted faults (--features breaks); bless with a build without them`));
  }
  const plain = !blessing && !hosts;
  const docsCheck = plain && !sel ? beside('scripts/render_docs.ts') : null;
  // the generated packs are checked beside the worlds that read them: all of
  // them at once in a whole run, and under a selection once it is known
  const SPEC_PACK = 'facts/spec-census.rofl', BREAKS_PACK = 'examples/checks/agg-breaks-census.rofl';
  const PROSE_PACK = 'examples/checks/agg-prose-census.rofl';
  const packCheck = (f: string) => f === SPEC_PACK ? beside('scanners/spec.ts')
    : f === PROSE_PACK ? beside('scripts/agg_prose.ts') : beside('scripts/agg_breaks.ts', '--census');
  const early = plain && !sel ? new Map([SPEC_PACK, BREAKS_PACK, PROSE_PACK].map((f) => [f, packCheck(f)])) : null;
  // a selection of declared worlds needs no walk, and the walk reads every
  // Markdown world; anything else is looked for among all of them
  let picked: World[] | null = null, why: string[] = [];
  if (sel && sel.files.length === 0) {
    try { ({ picked, why } = select(declared(), sel)); } catch (e) { if (!(e instanceof NotAWorld)) refuse(e); }
  }
  if (!picked) {
    if (!hosts) await prefetchMd(mdWorldPaths(), jobs());
    const all = worlds();
    try { ({ picked, why } = sel ? select(all, sel) : { picked: all, why: [] }); } catch (e) { refuse(e); }
  }
  const ws = picked!;
  // A GENERATED PACK IS REGENERATED AND COMPARED WHENEVER A WORLD THAT READS IT
  // IS CHECKED, a selection included: a selective run that read the pack only
  // against its golden would pin the photograph against itself
  // (f_a_golden_over_a_generated_census_pins_the_photograph_against_itself).
  const check = (f: string) => early ? early.get(f)!
    : plain && ws.some((w) => w.files.includes(path.join(ROOT, f))) ? packCheck(f) : null;
  const specCheck = check(SPEC_PACK), breaksCheck = check(BREAKS_PACK), proseCheck = check(PROSE_PACK);
  if (blessing) {
    // BLESSING SAYS WHAT IT CHANGES. The one real hazard of a committed golden
    // is blessing over a defect, and it was paid for within an hour of this
    // file existing: a bless ran while a planted mutant was still in
    // rules/js-controlflow.rofl, and `abrupt_kind[main] 4 -> 3` went into the
    // expectation as the truth. Refusing to bless on a dirty tree is the wrong
    // guard — changing a rule IS the reason to bless — so the guard is that the
    // delta is printed and lands in the commit for a person to read.
    const before = fs.existsSync(GOLDEN) ? parse() : new Map();
    const hostsBefore = parseHosts();
    // THE DEMOS ARE BLESSED ONLY WHEN ASKED. They take two minutes; the worlds
    // take seven seconds, and a bless that always paid for both would be run
    // less often, which is the way a golden goes stale.
    hostRows = process.argv.includes('--hosts')
      ? demos().map((f) => [path.basename(path.dirname(f)), answerDemo(f)] as [string, { hash: string; exit: number; lines: number }])
      : [...hostsBefore];
    // A RUST-ONLY WORLD IS BLESSED FROM THE RUST ANSWER, which is the only one
    // it has; its problems and parity are printed, and a bless over them is a
    // decision a person reads in the output.
    const answers = await runPool<{ a: Answer; said: string[] }>(ws.map((w) => ({ mod: SELF, fn: 'blessAnswer', args: [w] })));
    const rows: [World, Answer][] = ws.map((w, i) => [w, answers[i].a]);
    for (const { said } of answers) for (const l of said) console.log(l);
    const ok = expectedRefusals();
    const bad = rows.flatMap(([w, a]) => undeclared(w, a, ok).map((d) => `${w.name}: ${d}`));
    if (bad.length > 0) {
      for (const b of bad) console.log(`REFUSED ${b}`);
      console.log('not blessed: a world refuses a file it is not declared to refuse (check_refuses in facts/checks.rofl)');
      process.exit(1);
    }
    fs.writeFileSync(GOLDEN, render(rows));
    for (const [w, a] of rows) if (a.dropped.length > 0)
      console.log(`  refused ${w.name}: ${a.dropped.join('; ')}`);
    let moved = 0;
    for (const [w, a] of rows) {
      const g = before.get(w.name);
      if (!g) { console.log(`  NEW  ${w.name}`); moved++; continue; }
      if (g.hash === a.hash) continue;
      const d = [...new Set([...g.census.keys(), ...a.census.keys()])]
        .filter((k) => (g.census.get(k) ?? 0) !== (a.census.get(k) ?? 0))
        .map((k) => `${k} ${g.census.get(k) ?? 0}->${a.census.get(k) ?? 0}`);
      console.log(`  MOVED ${w.name.padEnd(26)} ${d.slice(0, 4).join(', ') || 'same census'}`);
      moved++;
    }
    for (const n of before.keys()) if (!rows.some(([w]) => w.name === n)) { console.log(`  GONE ${n}`); moved++; }
    for (const [n, h] of hostRows) {
      const b = hostsBefore.get(n);
      if (!b) { console.log(`  NEW  demo ${n} (exit ${h.exit})`); moved++; }
      else if (b.hash !== h.hash) { console.log(`  MOVED demo ${n.padEnd(20)} exit ${b.exit}->${h.exit}, ${b.lines}->${h.lines} lines`); moved++; }
    }
    console.log(`blessed ${rows.length} worlds${hostRows.length ? ` + ${hostRows.length} demos` : ''}, ${moved} changed -> facts/goldens.rofl`);
    process.exit(0);
  }

  if (hosts) {
    const g = parseHosts(); const t = Date.now();
    let ok = 0; const bad: string[] = [];
    for (const f of demos()) {
      const n = path.basename(path.dirname(f));
      const e = g.get(n);
      const a = answerDemo(f);
      if (!e) { bad.push(`${n}: no golden — bless with \`npm run bless -- --hosts\``); continue; }
      if (e.hash === a.hash) { ok++; continue; }
      bad.push(`${n.padEnd(10)} exit ${e.exit}->${a.exit}, ${e.lines}->${a.lines} lines`);
    }
    for (const b of bad) console.log(`FAIL ${b}`);
    console.log(`\n${ok}/${demos().length} demos, one engine (they are TypeScript), ${((Date.now() - t) / 1000).toFixed(0)} s`);
    process.exit(bad.length === 0 ? 0 : 1);
  }

  const want = parse();
  const t0 = Date.now();
  const rustMissing = !fs.existsSync(RUST);
  const tasks: Task[] = ws.map((w) => ({ mod: SELF, fn: 'checkWorld', args: [w, want.get(w.name), rustMissing, engine] }));
  const host = engine !== 'rust';
  if (host) {
    tasks.push({ mod: SELF, fn: 'aggregateDoors', args: [] });
    tasks.push({ mod: SELF, fn: 'shrugSurfaces', args: [] });
    tasks.push({ mod: SELF, fn: 'deepExplain', args: [] });
  }
  const results = await runPool<string | null | string[]>(tasks);
  const deep = host ? results.pop() as string[] : [];
  const surfaces = host ? results.pop() as string[] : [];
  const doors = host ? results.pop() as string[] : [];
  const fail = (results as (string | null)[]).filter((x): x is string => x !== null);
  const skipped = engine === 'both' ? 0 : ws.filter((w) => w.oneEngine && w.oneEngine !== engine).length;
  const pass = results.length - fail.length - skipped;
  for (const p of doors) fail.push(`aggregate door: ${p}`);
  for (const p of surfaces) fail.push(`shrug surface: ${p}`);
  for (const p of deep) fail.push(`deep explain: ${p}`);
  // A CHECK THAT CANNOT RUN SAYS SO. A missing Rust binary halves the oracle,
  // and a run that quietly checked one engine would read exactly like one that
  // checked two.
  if (rustMissing) console.log(`!! ${path.relative(ROOT, RUST)} is not built — checking ONE engine, not two`);
  // A CHECK THAT FAILS IS RED WHATEVER IT PRINTED: one that crashed, or was
  // killed (status null), says none of the words looked for, and was green.
  const failed = (c: { status: number | null; out: string }, words: RegExp, what: string): void => {
    if (c.status === 0) return;
    const said = c.out.split('\n').filter((l) => words.test(l)).map((l) => l.trim());
    fail.push(...(said.length ? said : [`${what} exited ${c.status ?? 'on a signal'}`]));
  };
  if (sel) {
    const also = [specCheck && 'the [checks] book', breaksCheck && 'the census of planted faults'].filter(Boolean);
    console.log(`!! ${ws.length} worlds selected, ${why.join('; ') || sel.worlds.join(', ')}; the rest and the documents are not checked${also.length ? `; ${also.join(' and ')} regenerated and compared` : ''}`);
  } else {
    // A DOCUMENT THAT LIES ABOUT THE TREE IS AS RED AS A FACT THAT MOVED, and it
    // costs about a second. CLAUDE.md was hand-patched three times in two days
    // because nothing here could see it.
    const docs = await docsCheck!;
    failed(docs, /STALE|BROKEN|DANGLING/, 'scripts/render_docs.ts --check');
    for (const l of docs.out.split('\n').filter((l) => /UNVERIFIABLE/.test(l))) console.log(`!! ${l.trim()}`);
  }
  // AND THE [checks] BOOK, for the same reason and by the same means. The
    // coverage world reads `facts/spec-census.rofl` — which checks exist, which
    // citations resolve — and a world cannot walk a filesystem, so the pack is
    // generated. A generated pack a golden reads is a photograph pinned against
    // itself unless something regenerates and compares
    // (f_a_golden_over_a_generated_census_pins_the_photograph_against_itself),
  // so this is that something.
  if (specCheck) failed(await specCheck, /STALE|Error/, 'scanners/spec.ts --check');
  // AND THE CENSUS OF PLANTED FAULTS, which the world agg_breaks_census
  // reads: the table of scripts/agg_breaks.ts and the brk! sites in the source
  if (breaksCheck) failed(await breaksCheck, /STALE|Error/, 'scripts/agg_breaks.ts --census --check');
  // AND THE CENSUS OF PROSE, which the world agg_prose reads: the documents
  // w_agg_reconcile_docs owns and what they still say about aggregation
  if (proseCheck) failed(await proseCheck, /STALE|Error/, 'scripts/agg_prose.ts --check');
  for (const f of fail) console.log(`FAIL ${f}`);
  const ran = engine === 'rust' ? 'Rust only' : engine === 'ts' ? 'TypeScript only' : rustMissing ? 'ts only' : 'both engines';
  console.log(`\n${pass}/${ws.length - skipped} worlds${skipped ? ` (${skipped} skipped: answered by the other engine alone)` : ''}, ${ran}${engineWhy ? ` (${engineWhy})` : ''}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (engine !== 'both') console.log(`!! ${engine === 'rust' ? 'TypeScript' : 'Rust'} skipped: the full gate before a push is \`npm test\` (both engines)`);
  for (const e of ['rust', 'ts'] as const) {
    const one = ws.filter((w) => w.oneEngine === e).map((w) => w.name);
    if (one.length) console.log(`${one.length} checked on ${e === 'rust' ? 'Rust' : 'TypeScript'} only: ${one.join(' ')}`);
  }
  process.exit(fail.length === 0 ? 0 : 1);
}
