// scripts/surface_split.ts — THE SURFACE-SPLIT PARITY GATE (docs/surface-split.md, work item 2).
//
//   node --experimental-strip-types scripts/surface_split.ts [--engine ts|rust] [--order forward|reverse]
//                                                            [--break naive|nosurface] [--verbose]       (npm run test:split)
//   node --experimental-strip-types scripts/surface_split.ts --driver [--hot N] [--order ...]
//                                                            [--break early|narrow|nophase] [--verbose]
//
// The corpus is examples/vscode/mini and examples/vscode/split, 14 files, as examples/checks/vscode-split-facts.rofl
// holds them. A file is a volume: its facts are the ones that name its node prefix; a fact that names none (the
// host's paths and strings) is core. The WHOLE world is the model + the question + every fact. Then each file is
// evaluated ALONE, as a cooled split would: a fork of core + that file's facts + the [surface] facts the OTHER
// files published, and what it publishes itself goes back to the others; the ingest runs to a fixpoint (passes until
// no volume's surface moves; a volume whose input did not move is not evaluated again), forward and in reverse order.
// Green when, in both orders: every fact naming one file (its node ids, its path) holds in that file's volume exactly
// as in the whole world; every fact naming two files is concluded by some volume; no volume concludes a fact the
// whole world has not; the answers (ANSWERS) are each in the volume of their first node; and the surfaces together
// are the whole world's [surface]. [surface] and the kernel's book are not compared fact by fact.
//
// --break naive      the original crossing rules (the model at NAIVE_BASE) and no surface exchanged: must be red
// --break nosurface  the current model, no surface exchanged: must be red
//
// --driver runs the ingest through runtime/split.ts instead (Rust only): subscription by key, phases, cooling by book
// (`--hot N` volumes kept hot, 0 by default, so every evaluation after the first reheats a cooled volume). The same
// checks read each volume's world at its last evaluation, and three more: the answers asked of the RESIDENT world
// (core + surface + answers) equal the whole world's; the `why` of every side_effect_value answer, the volumes on its
// chain lifted into the resident world, equals the whole world's, line for line; and the resident world after the
// whys is the one before them, byte for byte (each lifted volume cooled by book again). No publication is withdrawn.
//   --break early    the answers of each volume's first evaluation, before the surface fixpoint: must be red
//   --break narrow   a volume subscribes to its own keys only, not to the names it holds: must be red
//   --break nophase  every surface relation published from the start, negations read an incomplete surface
//   --break books    a volume cooled by the books code, flow and main only (a base fact of another book, `probe[audit]`
//                    in the first volume, is forgotten: the driver refuses it, or the volume differs from the whole world)
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { Rofl } from '../src/api.ts';
import { RoflPort, type RoflSession } from '../runtime/port.ts';
import { MODEL_FILES } from '../notebook/front.ts';
import { drive } from '../runtime/split.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FACTS = 'examples/checks/vscode-split-facts.rofl';
const QUESTION = 'examples/vscode/side-effects.rofl';
/** the model before the [surface] book, for the planted break */
const NAIVE_BASE = '8538c41';
const BUDGET = 4_000_000_000, SPACE = 40_000_000;
const PREF = /\bn([0-9a-f]{16})_\d+/g;

const argv = process.argv.slice(2);
const opt = (k: string): string | undefined => { const i = argv.indexOf(k); return i < 0 ? undefined : argv[i + 1]; };
const driver = argv.includes('--driver');
const engines = driver ? ['rust'] : opt('--engine') ? [opt('--engine')!] : ['rust', 'ts'];
const hot = Number(opt('--hot') ?? 0);
const brk = opt('--break');
const orders = opt('--order') ? [opt('--order')!] : ['forward', 'reverse'];
if (orders.some((o) => o !== 'forward' && o !== 'reverse')) { console.error('--order forward | reverse'); process.exit(64); }
const verbose = argv.includes('--verbose');
const BREAKS = driver ? ['early', 'narrow', 'nophase', 'books'] : ['naive', 'nosurface'];
if (brk && !BREAKS.includes(brk)) { console.error(`--break ${BREAKS.join(' | ')}`); process.exit(64); }

const read = (f: string): string => brk === 'naive' && (f.startsWith('rules/') && f !== 'rules/js-concat.rofl' || f === QUESTION)
  ? (() => {
    try { return execFileSync('git', ['show', `${NAIVE_BASE}:${f}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { console.error(`--break naive reads ${f} at ${NAIVE_BASE}, which this checkout's history does not hold`); process.exit(2); }
  })()
  : fs.readFileSync(path.join(ROOT, f), 'utf8');
const model = [...MODEL_FILES, QUESTION].filter((f) => brk !== 'naive' || f !== 'rules/js-surface.rofl');

// ------------------------------------------------------------------ the corpus, cut by node prefix
const core: string[] = [];
const volumes = new Map<string, string[]>();
const fileOf = new Map<string, string>();
for (const line of fs.readFileSync(path.join(ROOT, FACTS), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('--')) continue;
  const ps = new Set([...line.matchAll(PREF)].map((m) => m[1]!));
  if (ps.size > 1) throw new Error(`a base fact names two files: ${line}`);
  if (ps.size === 0) { core.push(line); continue; }
  const p = [...ps][0]!;
  if (!volumes.has(p)) volumes.set(p, []);
  volumes.get(p)!.push(line);
  const m = /^ast_node\[code\]\(n[0-9a-f]{16}_\d+, file, "([^"]+)"/.exec(line);
  if (m) fileOf.set(p, m[1]!);
}
const prefixOf = new Map([...fileOf].map(([p, f]) => [f, p]));
const order = [...volumes.keys()].sort((a, b) => fileOf.get(a)!.localeCompare(fileOf.get(b)!));
// one base fact in a book the model writes in but no volume fact uses: a volume that cools only the books of the model forgets it (a hot and a cold
// volume then differ), and the driver refuses, or the volume's world differs from the whole world's
volumes.get(order[0]!)!.push(`probe[audit](n${order[0]}_1, "tag", "x").`);

// ------------------------------------------------------------------ one engine, behind four verbs
interface World { fork(): Promise<World>; assert(text: string): Promise<void>; evaluate(): Promise<void>; state(): Promise<string>; why(q: string): Promise<string>; close(): Promise<void> }
async function coreWorld(engine: string): Promise<{ world: World; stop: () => Promise<void> }> {
  const texts = model.map(read);
  if (engine === 'ts') {
    const wrap = (r: Rofl): World => ({
      fork: async () => wrap(r.fork()),
      assert: async (t) => { const a = r.assert(t); if (!a.ok) throw new Error(a.diagnostics.join('\n')); },
      evaluate: async () => { r.evaluate(BUDGET); },
      state: async () => r.store.canonicalState(),
      why: async (q) => r.why(q).text,
      close: async () => {},
    });
    const r = new Rofl({ space: SPACE });
    for (const t of texts) { const a = r.load(t, { budget: BUDGET, defer: true }); if (!a.ok) throw new Error(a.diagnostics.join('\n')); }
    const a = r.assert(core.join('\n')); if (!a.ok) throw new Error(a.diagnostics.join('\n'));
    r.evaluate(BUDGET);
    return { world: wrap(r), stop: async () => {} };
  }
  const port = await RoflPort.start(path.join(ROOT, `rust/target/${process.env.ROFL_PROFILE ?? 'release'}/rofl-serve`));
  const wrap = (s: RoflSession): World => ({
    fork: async () => wrap(await s.fork()),
    assert: async (t) => { await s.assert(t); },
    evaluate: async () => { await s.evaluate(); },
    state: () => s.stateText(),
    why: (q) => s.why(q),
    close: async () => { await s.close(); },
  });
  const s = await port.fresh(BUDGET, { space: SPACE });
  for (const t of texts) await s.load(t);
  await s.assert(core.join('\n'));
  await s.evaluate();
  return { world: wrap(s), stop: () => port.stop() };
}

// ------------------------------------------------------------------ reading a state
const factOf = (line: string): string | null => {
  if (!/^[a-z_$][\w$]*\[/.test(line)) return null;   // a fact; not a witness, a tick or an aggregate's cell
  const i = line.search(/ (tick|timeless) /);
  return i < 0 ? line : line.slice(0, i);
};
const book = (f: string): string => /^[^(\[]*\[([^\]]*)\]/.exec(f)?.[1] ?? 'main';
const relOf = (f: string): string => f.slice(0, f.indexOf('('));
/** the files a fact names: its node ids by prefix, and a corpus path written as a string */
const namesOf = (f: string): string[] => {
  const out = new Set<string>();
  for (const m of f.matchAll(PREF)) out.add(m[1]!);
  for (const m of f.matchAll(/"([^"]+)"/g)) { const p = prefixOf.get(m[1]!); if (p) out.add(p); }
  return [...out];
};
const firstNode = (f: string): string | null => /^[^(]*\((n([0-9a-f]{16})_\d+)[,)]/.exec(f)?.[2] ?? null;
/** the facts of one file (naming it alone), the facts naming two or more, and the [surface] book */
interface Read { single: Map<string, Set<string>>; cross: Set<string>; surface: Set<string> }
function readState(text: string): Read {
  const single = new Map<string, Set<string>>(), cross = new Set<string>(), surface = new Set<string>();
  for (const line of text.split('\n')) {
    const f = factOf(line);
    if (!f) continue;
    const b = book(f);
    if (b === 'surface') { surface.add(f); continue; }
    if (b === '$kernel') continue;
    const ns = namesOf(f);
    if (ns.length === 0) continue;
    if (ns.length > 1) { cross.add(f); continue; }
    if (!single.has(ns[0]!)) single.set(ns[0]!, new Set());
    single.get(ns[0]!)!.add(f);
  }
  return { single, cross, surface };
}
const asFacts = (fs_: Iterable<string>): string => [...fs_].map((f) => `${f}.`).join('\n');
/** the question's answers and the call graph's verdicts, owned by the file of their first node */
const ANSWERS = new Set(['side_effect_value[main]', 'side_effect_site[main]', 'side_effect_env[main]', 'se_site[main]',
  'catch_from_host[flow]', 'caught_value[flow]', 'unresolved_call[code]', 'may_not_run[code]', 'reached_unguarded[code]',
  'may_not_be_reached[code]', 'reachable[code]', 'resolves[code]', 'calls[code]', 'throwing_call[code]', 'thrown_by[flow]']);
const answersOf = (r: Read, p: string): Set<string> =>
  new Set([...(r.single.get(p) ?? []), ...r.cross].filter((f) => ANSWERS.has(relOf(f)) && firstNode(f) === p));

// ------------------------------------------------------------------ the gate
const missingFrom = (want: Iterable<string> | undefined, got: Set<string> | undefined): string[] => [...(want ?? [])].filter((f) => !got?.has(f));
const byRel = (xs: string[]): string => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(relOf(x), (m.get(relOf(x)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(', ');
};
const all = (r: Read): Set<string> => new Set([...r.cross, ...[...r.single.values()].flatMap((s) => [...s])]);

/** The ingest through runtime/split.ts: each volume's world at its last evaluation, the surface, and the checks of
 *  the resident world (its answers, the why of each side_effect_value answer, its state after the whys). */
async function driven(seq: string[], W: Read, whole: World, held: Map<string, boolean>): Promise<{ last: Map<string, string>; surface: Set<string>;
  evals: number; bad: number; lines: string[]; refused?: string }> {
  const port = await RoflPort.start(path.join(ROOT, `rust/target/${process.env.ROFL_PROFILE ?? 'release'}/rofl-serve`));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-split-'));
  const last = new Map<string, string>();
  const t0 = performance.now();
  const d = await drive({
    port, budget: BUDGET, space: SPACE, program: model.map(read), core: core.join('\n'), dir, hot,
    brk: brk as 'early' | 'narrow' | 'nophase' | 'books' | undefined,
    volumes: seq.map((p) => ({ prefix: p, file: fileOf.get(p)!, text: volumes.get(p)!.join('\n') })),
    inspect: (p, st) => last.set(p, st), log: verbose ? (l) => console.error(l) : undefined,
  }).catch(async (e: Error) => {
    await port.stop();
    fs.rmSync(dir, { recursive: true, force: true });
    return e;
  });
  if (d instanceof Error) return { last, surface: new Set(), evals: 0, bad: 1, lines: [], refused: d.message };
  const ms = Math.round(performance.now() - t0);
  const lines: string[] = [];
  let bad = 0;
  const st = d.stats;
  lines.push(`  driver: ${st.evaluations} evaluations (${st.first} first, ${st.incremental} by delta in a hot world, ${st.reheated} reheated), rounds ${st.rounds.join('+')} over ${st.maxPhase + 1} phases, ${st.published} published, ${st.inputs} subscribed inputs, ${st.unkeyed} values keyed by nobody, ${st.cooled} cooled (${st.coldBytes} bytes), ${ms} ms`);
  if (st.withdrawn) { bad++; lines.push(`  ${st.withdrawn} publications withdrawn inside a phase: the surface did not grow monotonically`); }
  const isAnswer = (f: string) => /^side_effect_(value|site|env)(\[main\])?\(/.test(f);
  const want = new Set([...all(W)].filter(isAnswer));
  const got = new Set(await d.answers());
  const am = missingFrom(want, got), ai = missingFrom(got, want);
  if (am.length || ai.length || !want.size) {
    bad++;
    lines.push(`  the resident world's answers: ${am.length} missing (${byRel(am)}), ${ai.length} invented (${byRel(ai)}), of ${want.size}`);
    if (verbose) for (const f of [...am.map((x) => `- ${x}`), ...ai.map((x) => `+ ${x}`)].slice(0, 40)) lines.push(`      ${f}`);
  } else lines.push(`  the resident world's answers equal the whole world's: ${want.size}`);
  const before = await d.resident.stateText();
  // A why lifted into the resident world is a proof in a smaller world, so where a fact has more than one derivation
  // the engine's choice of witness (least by height, then signature) may fall on another: a fact naming no file
  // (`external_module("fs")`) proved from another file's import, a fact both derived in its volume and mirrored back
  // from the surface. So each why is held to the whole world two ways: byte for byte, and as a PROOF of it: every fact
  // it shows holds in the whole world, every axiom is a base fact there and none is a [surface] fact (the lift reached
  // every volume the proof rests on), and every negation it shows fails there too.
  const proofBad = (t: string): string[] => {
    const out: string[] = [];
    for (const line of t.split('\n')) {
      const m = /^\s*(not )?([a-z_$][\w$]*\[[^\]]*\]\(.*\))(?:  <= r[0-9a-f]+ @tick \d+| \[(axiom|above|finite failure)\])$/.exec(line);
      if (!m) continue;
      const [, neg, f, how] = m;
      if (neg) { if (!f.includes('?') && held.has(f)) out.push(`not ${f} holds`); continue; }
      if (!held.has(f)) out.push(`${f} does not hold`);
      else if (how === 'axiom' && (!held.get(f) || book(f) === 'surface')) out.push(`${f} is an axiom here and not a base fact there`);
    }
    return out;
  };
  let whyBad = 0, liftedMax = 0, liftedSum = 0, n = 0, exact = 0;
  for (const f of [...want].filter((x) => x.startsWith('side_effect_value')).sort().slice(0, Number(opt('--whys') ?? 1e9))) {
    const a = await whole.why(f), b = await d.why(f);
    n++;
    liftedMax = Math.max(liftedMax, b.lifted.length);
    liftedSum += b.lifted.length;
    if (a === b.text) exact++;
    const wrong = proofBad(b.text);
    if (wrong.length || b.text.split('\n').length < 2) {
      whyBad++;
      if (verbose && whyBad <= 3) lines.push(`      why ${f}: ${wrong.slice(0, 5).join('; ')}`);
    }
    if (verbose && a !== b.text) { const at = path.join(os.tmpdir(), `rofl-split-why-${n}`); fs.writeFileSync(`${at}.whole`, a); fs.writeFileSync(`${at}.resident`, b.text); }
  }
  if (whyBad) { bad++; lines.push(`  ${whyBad} of ${n} whys are not proofs in the whole world`); }
  else if (!n) lines.push('  whys: not asked (--whys 0)');
  else lines.push(`  ${n} whys are proofs in the whole world resting on base facts, ${exact} of them its own byte for byte; volumes lifted a why: ${n ? (liftedSum / n).toFixed(1) : 0} mean, ${liftedMax} max`);
  const after = await d.resident.stateText();
  if (after !== before) { bad++; lines.push("  the resident world after the whys is not the one before them"); if (verbose) { fs.writeFileSync(path.join(os.tmpdir(), "rofl-split-resident.before"), before); fs.writeFileSync(path.join(os.tmpdir(), "rofl-split-resident.after"), after); } }
  await d.close();
  await port.stop();
  fs.rmSync(dir, { recursive: true, force: true });
  return { last, surface: new Set(d.surface.keys()), evals: st.evaluations, bad, lines };
}

let red = 0;
for (const engine of engines) {
  const t0 = performance.now();
  const { world: base, stop } = await coreWorld(engine);
  const whole = await base.fork();
  await whole.assert([...volumes.values()].map((v) => v.join('\n')).join('\n'));
  await whole.evaluate();
  const wholeText = await whole.state();
  const W = readState(wholeText);
  const held = new Map<string, boolean>();   // every fact of the whole world -> base
  for (const line of wholeText.split('\n')) { const f = factOf(line); if (f) held.set(f, / base( |$)/.test(line.slice(f.length))); }
  if (!driver) await whole.close();
  let evals = 0;
  for (const dir of orders) {
    const seq = dir === 'forward' ? order : [...order].reverse();
    const published = new Map<string, Set<string>>(seq.map((p) => [p, new Set()]));
    const last = new Map<string, Read>();
    const lines: string[] = [];
    let bad = 0;
    if (driver) {
      const r = await driven(seq, W, whole, held);
      if (r.refused) {
        console.log(`${engine} driver ${dir}: RED, the driver refused: ${r.refused}`);
        red++;
        continue;
      }
      for (const [p, st] of r.last) last.set(p, readState(st));
      published.set(seq[0]!, r.surface);
      evals += r.evals;
      bad += r.bad;
      lines.push(...r.lines);
    }
    // a volume is evaluated again only when the surface it reads moved since its last evaluation
    const seen = new Map<string, string>();
    let rounds = 0;
    for (let moved = !driver; moved && rounds < 12;) {
      moved = false;
      rounds++;
      for (const p of seq) {
        const others = new Set<string>();
        if (brk !== 'naive' && brk !== 'nosurface') for (const [q, s] of published) if (q !== p) for (const f of s) others.add(f);
        const input = [...others].sort().join('\n');
        if (seen.get(p) === input) continue;
        seen.set(p, input);
        const v = await base.fork();
        await v.assert(volumes.get(p)!.join('\n') + '\n' + asFacts(others));
        await v.evaluate();
        evals++;
        const r = readState(await v.state());
        await v.close();
        const mine = new Set([...r.surface].filter((f) => !others.has(f)));
        const before = published.get(p)!;
        if (mine.size !== before.size || [...mine].some((f) => !before.has(f))) moved = true;
        published.set(p, mine);
        last.set(p, r);
      }
    }
    const wholeAll = all(W), crossUnion = new Set<string>();
    let answers = 0;
    const answersMissing: string[] = [], answersInvented: string[] = [];
    for (const p of seq) {
      const r = last.get(p)!;
      const want = answersOf(W, p), got = answersOf(r, p);
      answers += want.size;
      answersMissing.push(...missingFrom(want, got));
      answersInvented.push(...missingFrom(got, want));
      for (const f of r.cross) crossUnion.add(f);
      const missing = missingFrom(W.single.get(p), r.single.get(p));
      const unanswered = missingFrom(answersOf(W, p), answersOf(r, p)).filter((f) => !missing.includes(f));
      const invented = [...all(r)].filter((f) => !wholeAll.has(f));
      if (missing.length || unanswered.length || invented.length) {
        bad++;
        const say = (n: string, xs: string[]) => `${xs.length} ${n}${xs.length ? ` (${byRel(xs)})` : ''}`;
        lines.push(`  ${fileOf.get(p)}: ${say('missing', missing)}, ${say('answers missing', unanswered)}, ${say('invented', invented)}`);
        if (verbose) for (const f of [...missing.map((x) => `- ${x}`), ...unanswered.map((x) => `- ${x}`), ...invented.map((x) => `+ ${x}`)].slice(0, 60)) lines.push(`      ${f}`);
      }
    }
    const uncovered = missingFrom(W.cross, crossUnion);
    if (uncovered.length) {
      bad++;
      lines.push(`  ${uncovered.length} facts naming two files no volume concludes (${byRel(uncovered)})`);
      if (verbose) for (const f of uncovered.slice(0, 60)) lines.push(`      - ${f}`);
    }
    const union = new Set([...published.values()].flatMap((s) => [...s]));
    const sm = missingFrom(W.surface, union), si = missingFrom(union, W.surface);
    if (sm.length || si.length) {
      bad++;
      lines.push(`  the surfaces together differ from the whole world's: ${sm.length} missing (${byRel(sm)}), ${si.length} invented (${byRel(si)})`);
    }
    console.log(`${brk ? `PLANTED BREAK ${brk} (must be red) ` : ''}${engine}${driver ? ' driver' : ''} ${dir}: ${order.length} volumes, ${driver ? 'to the fixpoint' : `${rounds} passes`}, surface ${union.size} facts, ${bad ? `RED, ${bad} checks differ` : 'every volume equals the whole world'}; the answers: ${answers} in the whole world, ${answersMissing.length} missing${answersMissing.length ? ` (${byRel(answersMissing)})` : ''} and ${answersInvented.length} invented${answersInvented.length ? ` (${byRel(answersInvented)})` : ''} in the volumes`);
    if (!brk || verbose) for (const l of lines) console.log(l);
    if (bad) red++;
  }
  if (driver) await whole.close();
  await stop();
  console.log(`${brk ? `PLANTED BREAK ${brk} ` : ''}${engine}: ${evals} volume evaluations, ${Math.round(performance.now() - t0)} ms`);
}
if (brk) {
  console.log(red ? `the planted break (${brk}) is red, as it must be` : `the planted break (${brk}) stayed GREEN: the gate sees nothing`);
  process.exit(red ? 0 : 1);
}
process.exit(red ? 1 : 0);
