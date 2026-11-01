// scripts/refine.ts — THE REFINE LOOP: ask, reflect, refine, ask (docs/cli.md, *The plan as facts*).
//
//   node --experimental-strip-types scripts/refine.ts <files> [--out F]   the report on stderr; the plan facts to F, or stdout
//   node --experimental-strip-types scripts/refine.ts --check             the loop over examples/checks/plan-world.rofl, judged
//
// 1. ASK     the world as it is, with a meter beside it: the order each rule was solved in and the width it cost
//            (partial solutions summed over its premises), both from the profile.
// 2. REFLECT the world beside models/engine/profile.rofl and models/engine/plan.rofl, in a world of its own: the
//            plan[fixpointplan] facts and the width each forecasts.
// 3. REFINE  the plan facts written out, to travel with the model.
// 4. ASK     the world with the facts: the width again. Per rule, the report sets the width before, the forecast and
//            the width after side by side; a plan that cost more than the order it replaced is marked `worse`, which
//            is the estimate's hypothesis false there, to be looked at, not hidden. The Rust engine, release build.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const RUST = path.join(ROOT, 'rust/target', process.env.ROFL_PROFILE || 'release', 'rofl');
const PACKS = ['models/engine/profile.rofl', 'models/engine/plan.rofl'].map((p) => path.join(ROOT, p));
const METER = `refine_width(R, T) :- fires[profile](R, _), concludes(R, _), T is sum(V ; K : width[profile](R, K, V)).
refine_order(R, At, O, W) :- order[profile](R, At, O, W), concludes(R, _).
`;

type Row = string[];
// the reflection world is 2^N x N rows per rule of N premises, past the default space at the JS model's size: it
// runs under walls of its own, and a wall it still meets is said, not answered from the rows it reached
const REFLECT_WALLS = ['--space', '200000000', '--budget', '20000000000'];
const ask = (files: string[], qs: string[], walls: string[] = []): Row[][] => {
  const run = spawnSync(RUST, ['load', '--json', ...walls, ...qs.flatMap((q) => ['--ask', q]), ...files], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (run.status !== 0 && run.status !== 5) throw new Error(`rofl load exited ${run.status}: ${run.stderr}`);
  return run.stdout.trim().split('\n').map((l) => {
    const a = JSON.parse(l);
    if (a.partial) throw new Error(`${qs.join(', ')}: partial, ${a.shrugs?.[0]?.line ?? 'a wall'}`);
    return a.rows as Row[];
  });
};
const tmp = (name: string, text: string): string => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-refine-')), name);
  fs.writeFileSync(f, text);
  return f;
};

export type Report = { head: string; rule: string; at: string; before: number; forecast: number; after: number; order: string; was: string };

export function refine(files: string[]): { facts: string; report: Report[] } {
  const meter = tmp('meter.rofl', METER);
  const measure = (extra: string[]) => {
    const [widths, orders, heads] = ask([...files, meter, ...extra], ['refine_width(R, T)', 'refine_order(R, At, O, W)', 'concludes(R, H)']);
    return {
      width: new Map(widths.map(([r, t]) => [r, Number(t)])),
      order: new Map(orders.map(([r, at, o, w]) => [`${r} ${at}`, { o, w }])),
      head: new Map(heads.map(([r, h]) => [r, h])),
    };
  };
  const before = measure([]);
  const [plans, costs] = ask([...files, ...PACKS], ['plan[fixpointplan](R, At, L)', 'plan_cost[fixpointplan](R, At, C)'], REFLECT_WALLS);
  const forecast = new Map(costs.map(([r, at, c]) => [`${r} ${at}`, Number(c)]));
  const facts = plans.map(([r, at, l]) => `plan[fixpointplan](${r}, ${at}, ${l}).`).sort().join('\n') + (plans.length ? '\n' : '');
  const after = facts ? measure([tmp('plan.rofl', facts)]) : before;
  const report: Report[] = plans
    .map(([r, at, l]) => ({
      head: before.head.get(r) ?? r,
      rule: r,
      at,
      before: before.width.get(r) ?? 0,
      forecast: forecast.get(`${r} ${at}`) ?? 0,
      after: after.width.get(r) ?? 0,
      order: l,
      was: before.order.get(`${r} ${at}`)?.o ?? '',
    }))
    .sort((a, b) => a.head.localeCompare(b.head) || Number(a.at) - Number(b.at));
  return { facts, report };
}

const list = (l: string): string => l.replace(/\$cons\(/g, '').replace(/,\$nil\)*/g, '').replace(/\$nil/g, '').replace(/,/g, ' ');
export function render(report: Report[]): string {
  if (!report.length) return 'no rule planned: none of two to eight positive premises\n';
  const w = Math.max(...report.map((r) => r.head.length), 4);
  const lines = [`${'rule'.padEnd(w)}  at  ${'before'.padStart(8)}  ${'forecast'.padStart(8)}  ${'after'.padStart(8)}  order (was)`];
  for (const r of report) {
    const mark = r.before === 0 && r.after === 0 ? '  not fired (the kernel answers it)' : r.after > r.before ? '  worse' : r.after < r.before ? '  better' : '';
    lines.push(`${r.head.padEnd(w)}  ${r.at.padStart(2)}  ${String(r.before).padStart(8)}  ${String(r.forecast).padStart(8)}  ${String(r.after).padStart(8)}  ${list(r.order)} (${list(r.was)})${mark}`);
  }
  return lines.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const { report } = refine([path.join(ROOT, 'examples/checks/plan-world.rofl')]);
    const want: Record<string, [number, number, number]> = { out: [1001, 210, 210], alt: [211, 210, 210], two: [11, 11, 11] };
    const bad = report.filter((r) => String(want[r.head]) !== String([r.before, r.forecast, r.after]));
    process.stderr.write(render(report));
    if (bad.length || report.length !== 3) { console.log('  FAIL  the loop over plan-world.rofl did not say what it should'); process.exit(1); }
    console.log('  ok    refine over examples/checks/plan-world.rofl: 1001 -> 210 forecast 210, 211 -> 210, 11 -> 11');
    process.exit(0);
  }
  const out = args.indexOf('--out');
  const files = args.filter((a, i) => !a.startsWith('--') && (out < 0 || i !== out + 1));
  if (!files.length) { console.error('usage: refine <files> [--out F] | --check'); process.exit(4); }
  const { facts, report } = refine(files.map((f) => (f.startsWith('@') ? f : path.resolve(f))));
  process.stderr.write(render(report));
  if (out >= 0) fs.writeFileSync(args[out + 1], `-- the plan facts models/engine/plan.rofl concluded over ${files.join(' ')}; load them with the world\n${facts}`);
  else process.stdout.write(facts);
}
