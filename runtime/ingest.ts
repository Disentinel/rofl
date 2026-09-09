// runtime/ingest.ts — THE INGEST LOOP: parse as an intent, cool at the boundary.
//
// The world holds a GOAL — `must_index[code](Corpus, File)` — and
// `rules/ingest.rofl` derives everything else: whether the goal is met, which
// files are missing, and what to do next. This file executes what those rules
// ask for and asserts back what it did. It decides nothing about WHICH file is
// wanted; that is a query.
//
// The loop, per tick:
//
//   1. ask `needs_index` — the frontier, frozen for the round
//   2. parse a batch with scanners/js_ast.ts and `load` the facts
//   3. evaluate, and read `peak_rows` against `space` — the only honest
//      pressure signal, and it is counted in ROWS, which are not facts
//   4. if over the mark, assert `under_pressure`, ask `candidate_intent(cool,
//      ...)`, cool each volume and record `cooled` plus a `hole`
// AND IT DOES NOT CALL `tick`, WHICH IS THE OPPOSITE OF WHAT IT LOOKS LIKE IT
// SHOULD DO. Measured: an ordinary asserted fact is TICK-SCOPED, so a kernel
// tick drops it. One `tick()` in this loop takes `must_index` with it, the
// frontier comes back empty, and the loop reports a corpus fully indexed with
// eight files unread. Carrying the goal across would cost two `@next` rules;
// carrying the AST facts would cost re-staging every fact of every file on
// every tick, which is the whole world per boundary.
//
// The iteration below is therefore NOT a kernel tick, and the distinction is
// semantic rather than a naming quibble. What cooling needs is to happen
// outside a frozen `Assumption` — and `evaluate()` runs to fixpoint and
// RETURNS, so anything done after it returns is already outside every round it
// ran. The tick boundary is where a fact's SCOPE ends; the round boundary is
// where negation unfreezes. Cooling wants the second, and only the second.
//
// WHAT THIS IS FOR. Not to index a corpus once — a script could do that. It is
// to find out whether the PER-FILE COST STAYS FLAT as the corpus grows, which
// is the only question that separates "works on 16 files" from "works on ten
// thousand". Every number it prints is per-tick so the shape is visible rather
// than the total.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { scan, idPrefix } from '../scanners/js_ast.ts';
import { RoflPort, type RoflSession } from './port.ts';

export interface IngestOpts {
  /** Files to index, as paths relative to `root`. */
  files: string[];
  root: string;
  corpus: string;
  /** Where cooled volumes go. */
  volumes: string;
  /** Files parsed per tick. */
  batch: number;
  /** Cool when peak rows exceed this fraction of the row wall. */
  pressureAt: number;
  /** Cool when the world exceeds this many facts. The signal the row wall
   *  cannot see: on a pure AST index every fact is BASE, so the join
   *  accumulator stays empty while the store grows without bound. Measured on
   *  the whole of eslint — 5 896 383 facts at 7 437 rows. */
  maxFacts: number;
  /** Cool when resident memory exceeds this many MB. Only the host can see
   *  this at all; the engine has no idea how much room the machine has. */
  maxRssMb: number;
  onTick?: (t: TickReport) => void;
}

export interface TickReport {
  tick: number;
  parsed: number;
  factsLoaded: number;
  cooled: number;
  coldBytes: number;
  worldFacts: number;
  peakRows: number;
  space: number;
  msParse: number;
  msLoad: number;
  msEval: number;
  msCool: number;
  msTick: number;
  left: number;
}

const q = (s: string): string => JSON.stringify(s);

/** Run the loop to completion, or until it stops making progress. */
export async function ingest(s: RoflSession, o: IngestOpts): Promise<TickReport[]> {
  fs.mkdirSync(o.volumes, { recursive: true });
  await s.load(o.files.map((f) => `must_index[code](${o.corpus}, ${q(f)}).`).join('\n'));
  await s.evaluate();

  const log: TickReport[] = [];
  let tick = 0;
  for (;;) {
    // 1. THE FRONTIER IS A QUERY. Nothing here remembers what it did last
    // round; if the loop crashed and restarted, this is the same answer.
    const left = (await s.ask('needs_index[code](C, F)')).rows.map((r) => JSON.parse(r[1]) as string);
    if (left.length === 0) break;

    const batch = left.slice(0, o.batch);
    const t0 = Date.now();
    const facts: string[] = [];
    let parsed = 0;
    for (const rel of batch) {
      try {
        facts.push(scan(fs.readFileSync(path.join(o.root, rel), 'utf8'), { file: rel }).facts.join('\n'));
        parsed += 1;
      } catch (e) {
        // A FILE THAT WILL NOT PARSE IS RECORDED, NOT RETRIED. Left alone it
        // would sit on the frontier forever and the loop would never finish;
        // silently dropped it would be indistinguishable from an indexed file.
        //
        // THIS PATH IS NOW THE UNEXPECTED ONE. `scanners/js_ast.ts` returns
        // `ast_parse_error` as a FACT rather than throwing, and `indexed` in
        // rules/ingest.rofl reads it — so a refusal leaves the frontier through
        // the rules. What reaches here is something else going wrong, which is
        // why the message is kept instead of being flattened to `unparsable`.
        facts.push(`ast_parse_error[code](${q(rel)}, ${q(String((e as Error).message).slice(0, 120))}).`);
      }
    }
    const t1 = Date.now();
    const text = facts.join('\n');
    if (text.length > 0) await s.load(text);
    const t2 = Date.now();
    const ev = await s.evaluate();
    const t3 = Date.now();

    // 3-4. PRESSURE IS THE HOST'S TO SEE, COOLING IS THE RULES' TO CHOOSE.
    //
    // EVERY REASON IS MEASURED SEPARATELY AND ANY ONE IS ENOUGH. This was a
    // single premise on `peak_rows` and that instrument is blind to the thing
    // that actually grew: over the whole of eslint the world reached 5 896 383
    // facts while peak rows sat at 7 437, so cooling never fired. Rows are not
    // facts. A number that correlates with pressure is not pressure.
    let cooled = 0;
    let coldBytes = 0;
    const { facts: hot } = await s.factCount();
    const rssMb = Math.round(process.memoryUsage().rss / 1048576);
    const reasons: string[] = [];
    if (ev.peakRows > ev.space * o.pressureAt) reasons.push('rows_pressure');
    if (hot > o.maxFacts) reasons.push('world_pressure');
    if (rssMb > o.maxRssMb) reasons.push('memory_pressure');
    if (reasons.length > 0) {
      await s.load(reasons.map((r) => `${r}[code](${o.corpus}).`).join('\n'));
      await s.evaluate();
      const want = (await s.ask('candidate_intent(cool, C, F)')).rows.map((r) => JSON.parse(r[1]) as string);
      // ONE PASS FOR ALL OF THEM. One call per volume walks the whole world per
      // volume, which is quadratic in the batch and was measured as such.
      const vols = want.map((rel) => ({
        prefix: idPrefix(rel),
        path: path.join(o.volumes, `${idPrefix(rel).replace(/_$/, '')}.rofl`),
      }));
      const done: string[] = [];
      if (vols.length > 0) {
        const cs = await s.coolMany(vols);
        for (let i = 0; i < cs.length; i++) {
          if (cs[i].facts === 0) continue;
          cooled += 1;
          coldBytes += cs[i].bytes;
          // BOTH HALVES, IN ONE ACT. `cooled` keeps the file INDEXED so it does
          // not return to the frontier; the `hole` makes a question about the
          // cold volume REFUSE rather than answer empty, because an empty
          // answer and a clean one are the same two characters.
          done.push(`cooled[code](${q(want[i])}, ${q(cs[i].path)}).`);
          done.push(`hole($cold(${q(want[i])}), cooled_to_disk).`);
        }
      }
      if (done.length > 0) await s.load(done.join('\n'));
      // The pressure reading is per tick, so the flag does not outlive it —
      // and the REASONS are recorded beside it, because a volume that went to
      // disk should be able to say why it went.
      await s.load(`pressure_relieved[code](${o.corpus}, ${tick}).\n`
        + reasons.map((r) => `cooled_because[code](${o.corpus}, ${tick}, ${r}).`).join('\n'));
    }
    const t4 = Date.now();
    const t5 = t4;

    const { facts: worldFacts } = await s.factCount();
    const rep: TickReport = {
      tick, parsed, factsLoaded: text.length === 0 ? 0 : text.split('\n').length,
      cooled, coldBytes, worldFacts, peakRows: ev.peakRows, space: ev.space,
      msParse: t1 - t0, msLoad: t2 - t1, msEval: t3 - t2, msCool: t4 - t3, msTick: t5 - t4,
      left: left.length - batch.length,
    };
    log.push(rep);
    o.onTick?.(rep);
    tick += 1;

    // NO PROGRESS IS A STOP, NOT A SPIN. If a tick parsed nothing and cooled
    // nothing the loop cannot advance, and running on would burn a machine
    // quietly rather than say so.
    if (parsed === 0 && cooled === 0) {
      throw new Error(`ingest stalled at tick ${tick}: ${left.length} files left and nothing moved`);
    }
  }
  return log;
}

/** Every `.js` under a directory, as paths relative to it, sorted. */
export function jsFiles(root: string, sub = ''): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const r = path.join(d, e.name);
      if (e.isDirectory()) walk(r);
      else if (e.name.endsWith('.js')) out.push(r);
    }
  };
  walk(sub);
  return out.sort();
}

/**  runtime/ingest.ts <root> <sub> <n> [--batch K] [--pressure F] */
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const [root, sub, nStr, ...rest] = process.argv.slice(2);
  const n = Number(nStr ?? 16);
  const arg = (k: string, d: number): number => {
    const i = rest.indexOf(k);
    return i < 0 ? d : Number(rest[i + 1]);
  };
  const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
  const files = jsFiles(root, sub ?? '').slice(0, n);
  const port = await RoflPort.start();
  const s = await port.fresh();
  await s.loadFile(path.join(REPO, 'boot.rofl'));
  await s.loadFile(path.join(REPO, 'rules/ingest.rofl'));
  const t0 = Date.now();
  const log = await ingest(s, {
    files, root, corpus: 'eslint',
    volumes: path.join(REPO, 'rust/target/volumes'),
    batch: arg('--batch', 8),
    pressureAt: arg('--pressure', 0.5),
    maxFacts: arg('--max-facts', 2_000_000),
    maxRssMb: arg('--max-rss', 4096),
    onTick: (t) => console.log(
      `tick ${String(t.tick).padStart(3)} parsed ${String(t.parsed).padStart(3)} ` +
      `cooled ${String(t.cooled).padStart(3)} world ${String(t.worldFacts).padStart(9)} ` +
      `rows ${String(t.peakRows).padStart(8)} left ${String(t.left).padStart(4)} | ` +
      `parse ${String(t.msParse).padStart(5)} load ${String(t.msLoad).padStart(5)} ` +
      `eval ${String(t.msEval).padStart(6)} cool ${String(t.msCool).padStart(5)} ` +
      `tick ${String(t.msTick).padStart(5)}`),
  });
  const wall = Date.now() - t0;
  const sum = (f: (t: TickReport) => number): number => log.reduce((a, t) => a + f(t), 0);
  console.log(`\nfiles=${files.length} ticks=${log.length} wall=${wall}ms (${(wall / files.length).toFixed(1)} ms/file)`);
  console.log(`parse=${sum((t) => t.msParse)} load=${sum((t) => t.msLoad)} eval=${sum((t) => t.msEval)} ` +
    `cool=${sum((t) => t.msCool)} tick=${sum((t) => t.msTick)} cooled_files=${sum((t) => t.cooled)} ` +
    `cold_bytes=${sum((t) => t.coldBytes)}`);
  await port.stop();
}
