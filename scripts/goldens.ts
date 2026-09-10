// scripts/goldens.ts — THE WHOLE-REPOSITORY CHECK.
//
//   npm test              check both engines against facts/goldens.rofl
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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GOLDEN = path.join(ROOT, 'facts/goldens.rofl');
const RUST = path.join(ROOT, 'rust/target/release/rofl-load');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

export interface World { name: string; files: string[]; ticks?: number; budget?: number; oneEngine?: boolean }

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
    } else if (e.endsWith('.rofl')) out.push({ name: e.replace(/\.rofl$/, ''), files: [p] });
  }
  const rl = path.join(ROOT, 'rules');
  const pack = (dir: string, prefix: string): void => {
    for (const e of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, e);
      if (fs.statSync(p).isDirectory()) { pack(p, `${prefix}${e}_`); continue; }
      if (!e.endsWith('.rofl')) continue;
      const facts = path.join(ROOT, 'facts', e);
      out.push({ name: `rules_${prefix}${e.replace(/\.rofl$/, '')}`,
        files: fs.existsSync(facts) ? [facts, p] : [p] });
    }
  };
  pack(rl, '');
  out.push({ name: 'boot_only', files: [] });
  return [...out, ...declared()];
}

export interface Answer { hash: string; facts: number; census: Map<string, number>; dropped: string[]; }

/** WORLDS THE TREE CANNOT DISCOVER, declared in facts/checks.rofl. Everything
 *  under examples/ and rules/ is found by walking; a world that needs a TICK
 *  COUNT or a BUDGET, or that exists to be REFUSED, has nothing to be walked to
 *  and is named there instead. That file is where the 19 test files whose whole
 *  subject is host behaviour — arithmetic holes, budget walls, escapes — become
 *  worlds rather than TypeScript string literals. */
function declared(): World[] {
  const f = path.join(ROOT, 'facts/checks.rofl');
  if (!fs.existsSync(f)) return [];
  const src = fs.readFileSync(f, 'utf8');
  const out = new Map<string, World>();
  for (const m of src.matchAll(/^check_world\("([^"]+)"\)/gm)) out.set(m[1], { name: m[1], files: [] });
  for (const m of src.matchAll(/^check_file\("([^"]+)", "([^"]+)"\)/gm))
    out.get(m[1])?.files.push(path.join(ROOT, m[2]));
  for (const m of src.matchAll(/^check_opt\("([^"]+)", one_engine, 1\)/gm)) {
    const w = out.get(m[1]); if (w) w.oneEngine = true;
  }
  for (const m of src.matchAll(/^check_opt\("([^"]+)", (ticks|budget), (\d+)\)/gm)) {
    const w = out.get(m[1]);
    if (w && m[2] === 'ticks') w.ticks = Number(m[3]);
    if (w && m[2] === 'budget') w.budget = Number(m[3]);
  }
  return [...out.values()];
}

/** Rows per relation, read off the canonical state. `wit` lines are counted as
 *  one pseudo-relation: which support a store records among equals is not fixed
 *  by the semantics, so the COUNT is the part worth pinning. */
function census(state: string): Map<string, number> {
  const c = new Map<string, number>();
  for (const l of state.split('\n')) {
    if (l === '') continue;
    const k = l.startsWith('wit ') ? '@wit' : (/^([a-z_]+\[[a-z$]+\])/.exec(l)?.[1] ?? '@other');
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

export function answerTS(w: World): Answer {
  const r = new Rofl();
  // THE BUDGET GOES ON EVERY LOAD, NOT ONLY ON `evaluate`. In this host a load
  // evaluates what it can with the budget it is given, so a world whose budget
  // reaches `evaluate` alone has already been derived and never walls; in Rust
  // `Session::fresh(budget)` sets it once for the session. Passing it
  // everywhere is what makes the two comparable — measured: with the budget on
  // `evaluate` only, TypeScript completed a world Rust walled on, and that
  // looked exactly like an engine divergence until the instrument was checked.
  const opt = w.budget ? { budget: w.budget } : undefined;
  r.load(BOOT, opt);
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
  for (const f of w.files) {
    const res = r.load(fs.readFileSync(f, 'utf8'), opt);
    if (res.ok) continue;
    dropped.push(`${path.basename(f)}: ${res.diagnostics[0] ?? ''}`);
    diags.push(`refused ${path.basename(f)}`);
  }
  if (w.ticks) for (let i = 0; i < w.ticks; i++) r.tickAdvance();
  else r.evaluate(w.budget);
  const state = diags.sort().join('\n') + (diags.length ? '\n' : '') + r.store.canonicalState();
  return { hash: digest(state), facts: r.store.allFactKeys().length, census: census(state), dropped };
}

export function answerRust(w: World): Answer | null {
  if (!fs.existsSync(RUST)) return null;
  // A WORLD MAY DECLARE THAT ONE ENGINE ANSWERS IT, and the declaration is in
  // facts/checks.rofl with its reason. Not an escape hatch: the alternative is
  // a permanent red, which this repository has already recorded as the state in
  // which a check gets switched off.
  if (w.oneEngine) return null;
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
  const boot = path.join(ROOT, 'boot.rofl');
  const diags: string[] = []; const keep: string[] = [];
  for (const f of w.files) {
    try { run([boot, f]); keep.push(f); }
    catch { diags.push(`refused ${path.basename(f)}`); }
  }
  const state = run([boot, ...(w.ticks ? ['--ticks', String(w.ticks)] : []),
    ...(w.budget ? ['--budget', String(w.budget)] : []), ...keep]);
  const full = diags.sort().join('\n') + (diags.length ? '\n' : '') + state;
  return { hash: digest(full), facts: 0, census: census(full), dropped: [] };
}


// --------------------------------------------------------------- the pack

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
    '',
  ];
  for (const [w, a] of rows) L.push(`golden_state("${w.name}", "${a.hash}", ${a.facts}).`);
  L.push('');
  for (const [w, a] of rows)
    for (const [rel, n] of [...a.census].sort()) L.push(`golden_rel("${w.name}", "${rel}", ${n}).`);
  return L.join('\n') + '\n';
}

function parse(): Map<string, { hash: string; facts: number; census: Map<string, number> }> {
  const src = fs.readFileSync(GOLDEN, 'utf8');
  const out = new Map<string, { hash: string; facts: number; census: Map<string, number> }>();
  for (const m of src.matchAll(/^golden_state\("([^"]+)", "([^"]+)", (\d+)\)/gm))
    out.set(m[1], { hash: m[2], facts: Number(m[3]), census: new Map() });
  for (const m of src.matchAll(/^golden_rel\("([^"]+)", "([^"]+)", (\d+)\)/gm))
    out.get(m[1])?.census.set(m[2], Number(m[3]));
  return out;
}

// ------------------------------------------------------------------- main

const isMain = process.argv[1] && path.basename(process.argv[1]) === 'goldens.ts';
if (isMain) {
  const ws = worlds();
  if (process.argv.includes('--bless')) {
    // BLESSING SAYS WHAT IT CHANGES. The one real hazard of a committed golden
    // is blessing over a defect, and it was paid for within an hour of this
    // file existing: a bless ran while a planted mutant was still in
    // rules/js-controlflow.rofl, and `abrupt_kind[main] 4 -> 3` went into the
    // expectation as the truth. Refusing to bless on a dirty tree is the wrong
    // guard — changing a rule IS the reason to bless — so the guard is that the
    // delta is printed and lands in the commit for a person to read.
    const before = fs.existsSync(GOLDEN) ? parse() : new Map();
    const rows: [World, Answer][] = ws.map((w) => [w, answerTS(w)]);
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
    console.log(`blessed ${rows.length} worlds, ${moved} changed -> facts/goldens.rofl`);
    process.exit(0);
  }

  const want = parse();
  const t0 = Date.now();
  let pass = 0; const fail: string[] = [];
  const rustMissing = !fs.existsSync(RUST);
  for (const w of ws) {
    const g = want.get(w.name);
    if (!g) { fail.push(`${w.name}: no golden — bless it or delete the world`); continue; }
    const ts = answerTS(w);
    const rs = rustMissing ? null : answerRust(w);
    const bad: string[] = [];
    for (const [who, a] of [['ts', ts], ['rust', rs]] as [string, Answer | null][]) {
      if (!a || a.hash === g.hash) continue;
      const moved = [...new Set([...g.census.keys(), ...a.census.keys()])]
        .filter((k) => (g.census.get(k) ?? 0) !== (a.census.get(k) ?? 0))
        .map((k) => `${k} ${g.census.get(k) ?? 0}->${a.census.get(k) ?? 0}`);
      bad.push(`${who}: ${moved.length ? moved.slice(0, 3).join(', ') : 'same census, different state'}`);
    }
    if (bad.length === 0) pass++; else fail.push(`${w.name.padEnd(28)} ${bad.join('  |  ')}`);
  }
  // A CHECK THAT CANNOT RUN SAYS SO. A missing Rust binary halves the oracle,
  // and a run that quietly checked one engine would read exactly like one that
  // checked two.
  if (rustMissing) console.log(`!! ${path.relative(ROOT, RUST)} is not built — checking ONE engine, not two`);
  for (const f of fail) console.log(`FAIL ${f}`);
  console.log(`\n${pass}/${ws.length} worlds, ${rustMissing ? 'ts only' : 'both engines'}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(fail.length === 0 ? 0 : 1);
}
