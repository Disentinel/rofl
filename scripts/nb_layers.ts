// npm run test:nb runs this. A notebook answers a cell edit from the model it evaluated over the code once (playground/host.ts), and must answer
// what the whole world answers. Each notebook below takes one way out of that shortcut; with the guard it takes spoilt, its answers must differ.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { inputs } from '../notebook/cli.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const FILE = path.join(ROOT, 'examples/notebook/small.rofl.md');
const PROBES: Record<string, string> = {
  none: '',
  model: 'completion_deferred(foo_statement, a_reason).\nknown_here(K) :- completion_known(K).\n? known_here(foo_statement)',
  asked: 'mine(N) :- fn_node[code](N).\n? mine(N)\n? has_return[code](F)',
  kernel: 'mine(N) :- fn_node[code](N).\nflat(R) :- edb(R).\n? flat(fn_node)',
  why: 'why unawaited(ndb0114bc_25)\nwhynot recurses(ndb0114bc_25)',
};
const BREAK: Record<string, [string, string]> = {
  model: ['&& ![...heads].some((r) => this.modelRels.has(r) || sc.rels.has(r))', ''],
  asked: ['(base && !heads.has(relOf(a.lit)) ? base : f).query', 'f.query'],
  kernel: ['&& !over.some((r) => this.kernelRels.has(r))', ''],
  why: ['const one = (rel: string) => heads.has(rel) ? cells : model;', 'const one = (rel: string) => cells;'],
};

/** The kernel, or a copy of it over a host with one guard spoilt. */
async function kernelOf(broken?: string): Promise<typeof import('../notebook/kernel.ts').Kernel> {
  if (!broken) return (await import('../notebook/kernel.ts')).Kernel;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nb-layers-'));
  const absolute = (from: string, t: string) => t.replace(/from '(\.\.?\/[^']+)'/g, (_, p) => `from '${path.join(ROOT, path.dirname(from), p)}'`);
  const [at, to] = BREAK[broken];
  const host = readFileSync(path.join(ROOT, 'playground/host.ts'), 'utf8');
  if (!host.includes(at)) throw new Error(`--break ${broken}: the guard is not in playground/host.ts any more`);
  writeFileSync(path.join(dir, 'host.ts'), absolute('playground/host.ts', host.replace(at, to)));
  writeFileSync(path.join(dir, 'kernel.ts'), absolute('notebook/kernel.ts', readFileSync(path.join(ROOT, 'notebook/kernel.ts'), 'utf8')).replace(/from '[^']*\/playground\/host\.ts'/, `from '${path.join(dir, 'host.ts')}'`));
  return (await import(path.join(dir, 'kernel.ts'))).Kernel;
}

const text = readFileSync(FILE, 'utf8'), { input } = inputs(FILE, text), rel = path.relative(ROOT, FILE);
const withProbe = (cell: string) => cell ? `${text}\n\`\`\`datalog\n${cell}\n\`\`\`\n` : text;
const answers = (k: { run: (p: string, t: string, i: typeof input) => object }, t: string) => JSON.stringify({ ...k.run(rel, t, input), ms: 0 });
const Kernel = await kernelOf();
const whole = new Kernel({ whole: true }), truth = Object.fromEntries(Object.entries(PROBES).map(([name, cell]) => [name, answers(whole, withProbe(cell))]));
/** The probes a kernel answers otherwise than the whole world, run in order over one kernel, so every run after the first keeps the code's model. */
const differ = (k: { run: (p: string, t: string, i: typeof input) => object }, names: string[]) => names.filter((name) => answers(k, withProbe(PROBES[name])) !== truth[name]);
const kept = differ(new Kernel(), Object.keys(PROBES));
console.log(kept.length ? `differ: ${kept.join(' ')}` : 'same');
for (const g of Object.keys(BREAK)) console.log(`--break ${g}: differ: ${differ(new (await kernelOf(g))(), ['none', g]).join(' ')}`);
