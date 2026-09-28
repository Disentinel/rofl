// npm run guide — the user's guide (guide/*.md) shows the tool's real output, never a hand-written one.
// `<!-- BEGIN run DIR: rofl-nb ARGS -->` runs the command line in DIR and writes what it printed on stdout;
// `run+exit` adds the exit code; `| head -N` keeps the first N lines. `<!-- BEGIN file PATH -->` writes the file.
// `-- --check` fails if a block differs from its render; `npm run dist` runs it.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), GUIDE = path.join(ROOT, 'guide');
// ROFL_GUIDE_CLI: the command line to run, the built package's rofl-nb.js for one (vscode/test/dist.ts); the tree's prints `npm run nb -- ` where it prints `rofl-nb `
const CLI = process.env.ROFL_GUIDE_CLI ?? path.join(ROOT, 'notebook/cli.ts');
const BLOCK = /(<!-- BEGIN (run\+exit|run|file) ([^:>]+?)(?:: (.+?))? -->\n)[\s\S]*?(<!-- END \2 -->)/g;

function render(kind: string, where: string, cmd?: string): string {
  if (kind === 'file') {
    // as npm run dist ships it
    const text = readFileSync(path.join(ROOT, where), 'utf8').replace(/npm run nb -- (translate )?examples\/(notebook|tutorial)\//g, 'rofl-nb $1').trimEnd();
    const fence = text.includes('```') ? '````' : '```';
    return `${fence}${where.endsWith('.md') ? 'markdown' : where.endsWith('.js') ? 'js' : ''}\n${text}\n${fence}`;
  }
  const [line, head] = cmd!.split(' | head -');
  const args = line.split(' ').slice(1);
  const r = spawnSync(process.execPath, ['--experimental-strip-types', CLI, ...args],
    { cwd: path.join(ROOT, where), encoding: 'utf8', timeout: 120_000, env: { ...process.env, ROFL_NB_DAEMON: '0', ROFL_NB_LIMIT: '120' } });
  if (r.error || r.status === null) throw new Error(`${where}: ${line}: ${r.error?.message ?? 'killed'}`);
  let out = r.stdout.replace(/npm run nb -- /g, 'rofl-nb ').trimEnd().split('\n');
  if (head) out = out.slice(0, Number(head));
  return ['```', `$ ${cmd}`, ...out, ...(kind === 'run+exit' ? ['$ echo $?', String(r.status)] : []), '```'].join('\n');
}

const check = process.argv.includes('--check');
let stale = 0;
for (const f of readdirSync(GUIDE).filter((f) => f.endsWith('.md'))) {
  const p = path.join(GUIDE, f), doc = readFileSync(p, 'utf8');
  let n = 0;
  const out = doc.replace(BLOCK, (_, begin, kind, where, cmd, end) => (n++, begin + render(kind, where.trim(), cmd) + '\n' + end));
  if (n !== (doc.match(/<!-- BEGIN /g) ?? []).length) { console.error(`guide/${f}: a BEGIN marker without its END, or not run, file or run+exit`); stale++; continue; }
  if (out === doc) continue;
  if (check) { console.error(`STALE guide/${f}: run \`npm run guide\``); stale++; }
  else { writeFileSync(p, out); console.log(`wrote guide/${f}`); }
}
process.exit(stale ? 1 : 0);
