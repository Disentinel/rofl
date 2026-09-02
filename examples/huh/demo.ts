// demo.ts — HUH: "How'd yoU get Here". Provenance on a shell pipe.
//
//   node --experimental-strip-types examples/huh/demo.ts
//
// Generates an access log, tokenizes it into ROFL facts, loads the four
// pipe rules from huh.rofl, and then asks the kernel the two questions a
// pipe cannot answer about itself:
//
//   why    — which log lines add up to this number, through which stages
//   whynot — the line I expected is not here; WHICH STAGE ATE IT
//
// Everything printed is computed. Every number is also computed a second
// time by running the actual shell pipeline over the same file, and the two
// are compared: HUH's ground truth is free and deterministic, so there is
// no excuse for asserting the engine is right instead of checking it.
//
// The file exports its pieces so test/example-huh.test.ts can run the same
// assertions on a smaller log without shelling out to this script.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Rofl } from '../../src/api.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  countingSemiring, provenanceSemiring, provenanceOf, renderCount,
  type Count, type Polynomial,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);

// ---------------------------------------------------------------------------
// the log

/** The demo's sample size, and the seed that fixes the log. Both are stated
 *  in the output: a provenance claim over an unnamed sample is not a claim. */
export const DEMO_LINES = 2000;
export const SEED = 920;

/** awk's field number for the request path in a common-log line. */
export const AWK_FIELD = 7;

/** The bucket the demo follows, and the one it lists sources for. The second
 *  is deliberately a bucket small enough for the provenance semiring's term
 *  cap to hold all of it — see `provenanceLines`. */
export const FOCUS = '/api/v2/checkout';
export const LISTED = '/api/v2/refund';

const PATH_MIX: [string, number][] = [
  ['/api/v2/checkout', 26], ['/api/v2/refund', 13], ['/api/v2/cart', 18],
  ['/api/v2/login', 12], ['/healthz', 16], ['/static/app.js', 15],
];
const STATUS_MIX: [number, number][] = [
  [200, 75], [304, 10], [404, 5], [403, 2], [429, 2], [500, 3], [503, 3],
];

function expand<T>(mix: [T, number][]): T[] {
  const out: T[] = [];
  for (const [v, n] of mix) for (let i = 0; i < n; i++) out.push(v);
  return out;
}
const PATH_POOL = expand(PATH_MIX);
const STATUS_POOL = expand(STATUS_MIX);

/** The same LCG the rest of this suite uses. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** A deterministic nginx-shaped access log. The stream is a prefix: the
 *  first N lines of a longer log are exactly the log of length N, so the
 *  fast test and the big demo probe the very same lines. */
export function generateLog(n: number, seed: number = SEED): string[] {
  const rnd = lcg(seed);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = PATH_POOL[Math.floor(rnd() * PATH_POOL.length)];
    const st = STATUS_POOL[Math.floor(rnd() * STATUS_POOL.length)];
    const a = Math.floor(rnd() * 4);
    const b = Math.floor(rnd() * 200) + 1;
    const bytes = 100 + Math.floor(rnd() * 900);
    const sec = String(i % 60).padStart(2, '0');
    const min = String(Math.floor(i / 60) % 60).padStart(2, '0');
    out.push(`10.0.${a}.${b} - - [30/Aug/2026:12:${min}:${sec} +0000] `
      + `"GET ${p} HTTP/1.1" ${st} ${bytes}`);
  }
  return out;
}

/** Whitespace fields of a log line, as awk sees them (1-based via [i-1]). */
export function fieldsOf(raw: string): string[] {
  return raw.split(/\s+/);
}
export const pathOf = (raw: string): string => fieldsOf(raw)[AWK_FIELD - 1];
export const statusOf = (raw: string): number => Number(fieldsOf(raw)[8]);

export function writeLog(dir: string, lines: string[]): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'access.log');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

// ---------------------------------------------------------------------------
// the mapping: log -> facts -> a loaded world

/** One fact group per line. This is the whole host-side mapping, and it is
 *  the only place strings are taken apart: the kernel has no string
 *  builtins, so field extraction cannot be a rule. */
export function tokenize(lines: string[]): string {
  return lines.map((raw, i) => {
    const n = i + 1;
    return `line(${n}). status(${n}, ${statusOf(raw)}). `
      + `field(${n}, ${AWK_FIELD}, ${JSON.stringify(pathOf(raw))}).`;
  }).join('\n');
}

export const RULES = fs.readFileSync(path.join(HERE, 'huh.rofl'), 'utf8');

export function buildWorld(lines: string[]): Rofl {
  const r = new Rofl();
  const res = r.load(RULES + '\n' + tokenize(lines));
  if (!res.ok) throw new Error('huh: load failed\n' + res.diagnostics.join('\n'));
  return r;
}

/** The store with one log line removed and the fixpoint recomputed from
 *  scratch — exactly what `excise` does internally, kept as a world so the
 *  counting semiring can be folded over it again. */
export function withoutLine(r: Rofl, n: number): Rofl {
  const scratch = Rofl.fromSnapshot(r.save());
  const res = scratch.retract(`line(${n})`);
  if (!res.ok) throw new Error('huh: retract failed\n' + res.diagnostics.join('\n'));
  scratch.evaluate();
  return scratch;
}

const uniqKey = (p: string): string => `s_uniq[main](${JSON.stringify(p)})`;

// ---------------------------------------------------------------------------
// the engine's answers

export interface Bucket { path: string; count: Count; }

/** `uniq -c`, as the number of derivations of each bucket fact. */
export function bucketCounts(r: Rofl): Bucket[] {
  const fold = evaluateSemiring(r.store, countingSemiring);
  const out: Bucket[] = [];
  for (const [key, count] of fold.value) {
    const m = /^s_uniq\[main\]\((".*")\)$/.exec(key);
    if (m) out.push({ path: JSON.parse(m[1]) as string, count });
  }
  // `sort -rn`, plus a tie-break on the path so the ranking is a function of
  // the data alone. Ranking is presentation: v0 has no aggregation.
  const num = (c: Count): number => (typeof c === 'bigint' ? Number(c) : Infinity);
  return out.sort((a, b) => num(b.count) - num(a.count) || (a.path < b.path ? -1 : 1));
}

export function countOf(buckets: Bucket[], p: string): Count {
  const b = buckets.find((x) => x.path === p);
  if (!b) throw new Error(`huh: no bucket ${p}`);
  return b.count;
}

const LINE_PREFIX = 'line[main](';

/** The provenance annotation of every fact, with a base annotation that
 *  names only the `line/1` facts — so a monomial is one log line rather
 *  than the whole fact group behind it. One fold answers for every bucket. */
export function provenanceFold(r: Rofl): Map<string, Polynomial> {
  return evaluateSemiring(r.store, provenanceSemiring, {
    base: (key) => (key.startsWith(LINE_PREFIX) ? provenanceOf(key) : provenanceSemiring.one),
  }).value;
}

/** WHICH lines made a bucket.
 *
 *  `complete` is false when the semiring's term cap (PROVENANCE_MAX_TERMS,
 *  32) truncated the polynomial — a documented under-approximation, and the
 *  reason the demo lists sources for a bucket that fits under it. */
export function provenanceLines(
  fold: Map<string, Polynomial>, p: string, expected: Count,
): { lines: number[]; complete: boolean } {
  const poly = fold.get(uniqKey(p)) ?? [];
  const nums = new Set<number>();
  for (const mono of poly) {
    for (const key of mono) {
      const m = /^line\[main\]\((\d+)\)$/.exec(key);
      if (m) nums.add(Number(m[1]));
    }
  }
  const lines = [...nums].sort((a, b) => a - b);
  return { lines, complete: typeof expected === 'bigint' && BigInt(lines.length) === expected };
}

export interface Probes {
  /** a FOCUS line whose status is 5xx — stage 1 ate it, on `C <= 499` */
  droppedAbove: number;
  /** a FOCUS line whose status is below 400 — stage 1, on the OTHER comparison */
  droppedBelow: number;
  /** a 4xx line whose $7 is some other path — stage 2 sent it elsewhere */
  droppedByAwk: number;
  /** a line that really is in the bucket — the one excise deletes */
  contributing: number;
}

export function probes(lines: string[], focus: string = FOCUS): Probes {
  let droppedAbove = 0, droppedBelow = 0, droppedByAwk = 0, contributing = 0;
  lines.forEach((raw, i) => {
    const n = i + 1;
    const st = statusOf(raw);
    const p = pathOf(raw);
    const is4xx = st >= 400 && st <= 499;
    if (!droppedAbove && p === focus && st >= 500) droppedAbove = n;
    if (!droppedBelow && p === focus && st < 400) droppedBelow = n;
    if (!droppedByAwk && is4xx && p !== focus) droppedByAwk = n;
    if (!contributing && is4xx && p === focus) contributing = n;
  });
  if (!droppedAbove || !droppedBelow || !droppedByAwk || !contributing) {
    throw new Error('huh: the sample is too small to contain all four probes');
  }
  return { droppedAbove, droppedBelow, droppedByAwk, contributing };
}

/** The `[builtin fails]` leaf of a demonstration — the condition that
 *  actually decided the row's fate, lifted out of the tree so prose can
 *  quote it instead of restating it from memory. */
export function decidingBuiltin(whynotText: string): string {
  const hit = whynotText.split('\n').find((l) => l.includes('[builtin fails]'));
  if (hit === undefined) return '(none: the demonstration bottomed out elsewhere)';
  return hit.trim().replace(/^failed premise:\s*/, '').replace(/\s*\[builtin fails\]$/, '');
}

// ---------------------------------------------------------------------------
// the oracle: the real pipe, run by a real shell over the same file

/** The 4xx filter as a regex over the closing quote of the request, so it can
 *  only ever match the status field. `grep 4xx` in HUH.md is shorthand; this
 *  is the command that actually runs. */
export const GREP = `grep -E '" 4[0-9][0-9] '`;
export const AWK = `awk '{print $${AWK_FIELD}}'`;
export const TAIL = `sort | uniq -c | sort -k1,1nr -k2,2`;

export const pipeText = (log: string): string => `cat ${log} | ${GREP} | ${AWK} | ${TAIL}`;

function sh(cmd: string): string {
  return execFileSync('/bin/sh', ['-c', cmd], { encoding: 'utf8' });
}

/** `uniq -c` from the shell. `without` deletes one line first — the oracle
 *  for excise. */
export function shellBuckets(log: string, without?: number): Bucket[] {
  const src = without === undefined ? `cat '${log}'` : `awk 'NR != ${without}' '${log}'`;
  const out = sh(`${src} | ${GREP} | ${AWK} | ${TAIL}`);
  const rows: Bucket[] = [];
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\S+)\s*$/.exec(line);
    if (m) rows.push({ path: m[2], count: BigInt(m[1]) });
  }
  return rows;
}

/** The line numbers behind one bucket, straight from `grep -n`. */
export function shellLineNumbers(log: string, p: string): number[] {
  const out = sh(`grep -nE '" 4[0-9][0-9] ' '${log}' `
    + `| awk '$${AWK_FIELD} == "${p}" { split($1, a, ":"); print a[1] }' | sort -n`);
  return out.split('\n').filter((s) => s.trim() !== '').map(Number);
}

export const renderBuckets = (bs: Bucket[]): string =>
  bs.map((b) => `${renderCount(b.count).padStart(8)}  ${b.path}`).join('\n');

/** Two bucket tables agree when they are the same multiset of rows. */
export function sameBuckets(a: Bucket[], b: Bucket[]): boolean {
  const key = (bs: Bucket[]) =>
    bs.map((x) => `${x.path}=${renderCount(x.count)}`).sort().join(' ');
  return key(a) === key(b);
}

// ---------------------------------------------------------------------------
// the transcript

const WIDTH = 76;

function main(): void {
  const say = (s: string = '') => { console.log(s); };
  const rule = (title: string) => say(('== ' + title + ' ').padEnd(WIDTH, '='));
  const verdicts: string[] = [];
  const check = (what: string, ok: boolean) => {
    verdicts.push(`${ok ? 'AGREE   ' : 'DISAGREE'}  ${what}`);
    say(`  oracle: ${ok ? 'AGREE' : 'DISAGREE'} — ${what}`);
  };

  const lines = generateLog(DEMO_LINES);
  const file = writeLog(path.join(os.tmpdir(), 'rofl-huh-demo'), lines);
  const world = buildWorld(lines);
  const p = probes(lines);

  say('HUH — How\'d yoU get Here');
  say('provenance on a shell pipe, computed by the ROFL kernel');
  say();
  say(`log     ${file}`);
  say(`sample  ${DEMO_LINES} lines, generated deterministically (seed ${SEED})`);
  say(`facts   ${world.store.relCount('line')} line + ${world.store.relCount('status')} status`
    + ` + ${world.store.relCount('field')} field, from examples/huh/demo.ts`);
  say('rules   examples/huh/huh.rofl — grep, awk, sort, uniq as four rules');
  say(`pipe    ${pipeText(file)}`);
  say();

  // -- 1 -------------------------------------------------------------------
  rule('1. the counted result');
  say('counting semiring folded over the support hypergraph: the value of a bucket');
  say('fact is the number of derivations of it, i.e. the number of lines that got');
  say('there. `uniq -c` is not a rule and does not need to be.');
  say();
  const engine = bucketCounts(world);
  say(renderBuckets(engine));
  say();
  const shell = shellBuckets(file);
  say(`the same file through /bin/sh:`);
  say(renderBuckets(shell));
  check(`all ${shell.length} buckets over ${DEMO_LINES} lines`, sameBuckets(engine, shell));
  say();

  // -- 2 -------------------------------------------------------------------
  const focusCount = countOf(engine, FOCUS);
  rule(`2. why is it ${renderCount(focusCount)}?`);
  say(`$ why s_uniq(${JSON.stringify(FOCUS)})`);
  say(world.why(`s_uniq(${JSON.stringify(FOCUS)})`).text);
  say();
  say('one derivation of the bucket, down to axioms. There are '
    + `${renderCount(focusCount)} of them; the tree renders the canonical one.`);
  say();

  // -- 3 -------------------------------------------------------------------
  rule('3. WHICH lines?');
  say('provenance semiring, base annotation = the line fact, so a monomial is a');
  say('log line. Shown for a smaller bucket on purpose (see the cap note below).');
  say();
  const fold = provenanceFold(world);
  const listedCount = countOf(engine, LISTED);
  const prov = provenanceLines(fold, LISTED, listedCount);
  say(`  ${LISTED}  (${renderCount(listedCount)} lines)`);
  say('  ' + prov.lines.join(' '));
  const oracleLines = shellLineNumbers(file, LISTED);
  say(`  grep -n over the same file: ${oracleLines.length} line numbers`);
  check(`the ${oracleLines.length} source lines behind ${LISTED}`,
    prov.lines.length === oracleLines.length && prov.lines.every((n, i) => n === oracleLines[i]));
  say();
  const focusProv = provenanceLines(fold, FOCUS, focusCount);
  say(`the same question about ${FOCUS} returns ${focusProv.lines.length} of its `
    + `${renderCount(focusCount)} lines:`);
  say('provenanceSemiring keeps at most PROVENANCE_MAX_TERMS = 32 monomials, so above');
  say('32 sources the answer is a documented under-approximation, not the whole set.');
  say();

  // -- 4 -------------------------------------------------------------------
  rule('4. whynot: which stage ate my line?');
  say(`line ${p.droppedAbove} of the log is`);
  say(`  ${lines[p.droppedAbove - 1]}`);
  say(`it is a ${FOCUS} request, so you expect it in that bucket. It is not there.`);
  say();
  say(`$ whynot s_sort(${p.droppedAbove}, ${JSON.stringify(FOCUS)})`);
  const wn1 = world.whynot(`s_sort(${p.droppedAbove}, ${JSON.stringify(FOCUS)})`,
    { depth: 4, nodes: 32 });
  say(wn1.text);
  say();
  say(`the leaf is the answer: "${decidingBuiltin(wn1.text)}" is false, and that comparison`);
  say('is stage 1. grep ate it. Nothing had to be re-run to find that out.');
  say();
  const wnLow = world.whynot(`s_sort(${p.droppedBelow}, ${JSON.stringify(FOCUS)})`,
    { depth: 4, nodes: 32 });
  say(`line ${p.droppedBelow} (status ${statusOf(lines[p.droppedBelow - 1])}, same path) dies at the same stage but on the`);
  say(`other comparison: "${decidingBuiltin(wnLow.text)}". The answer is the condition,`);
  say('not just the stage.');
  say();

  // -- 5 -------------------------------------------------------------------
  rule('5. whynot again, and a different stage answers');
  say(`line ${p.droppedByAwk} of the log is`);
  say(`  ${lines[p.droppedByAwk - 1]}`);
  say(`it IS a 4xx, so grep kept it. It is still not in the ${FOCUS} bucket.`);
  say();
  say(`$ whynot s_sort(${p.droppedByAwk}, ${JSON.stringify(FOCUS)})`);
  const wn2 = world.whynot(`s_sort(${p.droppedByAwk}, ${JSON.stringify(FOCUS)})`,
    { depth: 4, nodes: 32 });
  say(wn2.text);
  say();
  say(`this time the failing premise is field(${p.droppedByAwk}, 7, …) under the awk rule:`);
  say(`stage 2 projected ${pathOf(lines[p.droppedByAwk - 1])}, so the row went to another bucket.`);
  say('Same question, same call, different stage named. That is the whole point.');
  say();

  // -- 6 -------------------------------------------------------------------
  rule('6. excise: delete one log line');
  say(`$ excise line(${p.contributing})   -- ${lines[p.contributing - 1]}`);
  const ex = world.excise(`line(${p.contributing})`);
  for (const k of ex.removed) say(`  - ${k}`);
  say(`  ${ex.removed.length} facts fall; ${uniqKey(FOCUS)} is not among them —`);
  say(`  the bucket has ${renderCount(focusCount)} supports and only lost one.`);
  say();
  const cut = bucketCounts(withoutLine(world, p.contributing));
  say(`  count on the excised world: ${renderCount(focusCount)} -> ${renderCount(countOf(cut, FOCUS))}`);
  const shellCut = shellBuckets(file, p.contributing);
  say(`  the shell, with the same line deleted: ${renderCount(countOf(shellCut, FOCUS))}`);
  check(`the blast radius of deleting line ${p.contributing}`, sameBuckets(cut, shellCut));
  say();

  // -- summary -------------------------------------------------------------
  rule('oracle summary');
  say(`${verdicts.length} comparisons against the real pipe over ${DEMO_LINES} log lines:`);
  for (const v of verdicts) say('  ' + v);
  const bad = verdicts.filter((v) => v.startsWith('DISAGREE')).length;
  say();
  say(bad === 0
    ? 'the engine and /bin/sh compute the same numbers.'
    : `${bad} DISAGREEMENT(S) — that is the finding; the engine's answer stands as computed.`);
  if (bad > 0) process.exitCode = 1;
}

const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1] &&
  real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) main();
