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
  return out.split('\n')
    .map((l) => (TIMED.test(l) ? l.replace(NUMS, '#').replace(/ +/g, ' ') : l))
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
  const f = path.join(ROOT, 'facts/checks.rofl');
  if (!fs.existsSync(f)) return new Set();
  return new Set([...fs.readFileSync(f, 'utf8').matchAll(/^demo_unhashable\("([^"]+)"/gm)].map((m) => m[1]));
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

function parse(): Map<string, { hash: string; facts: number; census: Map<string, number> }> {
  const src = fs.readFileSync(GOLDEN, 'utf8');
  const out = new Map<string, { hash: string; facts: number; census: Map<string, number> }>();
  for (const m of src.matchAll(/^golden_state\("([^"]+)", "([^"]+)", (\d+)\)/gm))
    out.set(m[1], { hash: m[2], facts: Number(m[3]), census: new Map() });
  for (const m of src.matchAll(/^golden_rel\("([^"]+)", "([^"]+)", (\d+)\)/gm))
    out.get(m[1])?.census.set(m[2], Number(m[3]));
  return out;
}

function parseHosts(): Map<string, { hash: string; exit: number; lines: number }> {
  const src = fs.existsSync(GOLDEN) ? fs.readFileSync(GOLDEN, 'utf8') : '';
  const out = new Map<string, { hash: string; exit: number; lines: number }>();
  for (const m of src.matchAll(/^golden_host\("([^"]+)", "([^"]+)", (-?\d+), (\d+)\)/gm))
    out.set(m[1], { hash: m[2], exit: Number(m[3]), lines: Number(m[4]) });
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
    const hostsBefore = parseHosts();
    // THE DEMOS ARE BLESSED ONLY WHEN ASKED. They take two minutes; the worlds
    // take seven seconds, and a bless that always paid for both would be run
    // less often, which is the way a golden goes stale.
    hostRows = process.argv.includes('--hosts')
      ? demos().map((f) => [path.basename(path.dirname(f)), answerDemo(f)] as [string, { hash: string; exit: number; lines: number }])
      : [...hostsBefore];
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
    for (const [n, h] of hostRows) {
      const b = hostsBefore.get(n);
      if (!b) { console.log(`  NEW  demo ${n} (exit ${h.exit})`); moved++; }
      else if (b.hash !== h.hash) { console.log(`  MOVED demo ${n.padEnd(20)} exit ${b.exit}->${h.exit}, ${b.lines}->${h.lines} lines`); moved++; }
    }
    console.log(`blessed ${rows.length} worlds${hostRows.length ? ` + ${hostRows.length} demos` : ''}, ${moved} changed -> facts/goldens.rofl`);
    process.exit(0);
  }

  if (process.argv.includes('--hosts')) {
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
