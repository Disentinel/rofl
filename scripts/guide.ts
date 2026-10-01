// npm run guide — the user's guide (guide/*.md) shows the tool's real output, never a hand-written one.
// `<!-- BEGIN run DIR: rofl-nb ARGS -->` runs the command line in DIR and writes what it printed on stdout;
// `run+exit` adds the exit code; `| head -N` keeps the first N lines. `<!-- BEGIN file PATH -->` writes the file.
// `<!-- BEGIN draw DIR: F.rofl.md -->` draws each `draw` line of the notebook as a page on GitHub can show it: the renderer's own SVG, written
// to guide/pictures; else the view's mermaid, which GitHub draws; else its Markdown table; else its text.
// `-- --check` fails if a block or a picture differs from its render; `npm run dist` runs it.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRAPHS, zoom, type View } from '../notebook/draw.ts';
import { backendsOf } from '../notebook/draw-text.ts';
import { style, type Hooks } from '../vscode/visual/picture.ts';
import { pictureOf } from '../vscode/visual/pictures.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), GUIDE = path.join(ROOT, 'guide');
// ROFL_GUIDE_CLI: the command line to run, the built package's rofl-nb.js for one (vscode/test/dist.ts); the tree's prints `npm run nb -- ` where it prints `rofl-nb `
const CLI = process.env.ROFL_GUIDE_CLI ?? path.join(ROOT, 'notebook/cli.ts');
const BLOCK = /(<!-- BEGIN (run\+exit|run|file|draw) ([^:>]+?)(?:: (.+?))? -->\n)[\s\S]*?(<!-- END \2 -->)/g;
const check = process.argv.includes('--check');
let stale = 0;

// the renderer's stylesheet, scoped to a picture's own svg, so a picture stands alone as a file
let css = '';
style({ getElementById: () => null, createElement: () => ({}), head: { append: (s: { textContent: string }) => { css = s.textContent; } } } as unknown as Document);
css = css.replace(/\.rofl-pic svg /g, '.rofl-pic ').replace(/\.rofl-pic svg\b/g, '.rofl-pic');

async function draw(where: string, file: string): Promise<string> {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', path.join(ROOT, 'notebook/cli.ts'), file, '--json'], { cwd: path.join(ROOT, where), encoding: 'utf8', timeout: 120_000, env: { ...process.env, ROFL_NB_DAEMON: '0' } });
  const views: { text: string; view: View }[] = JSON.parse(r.stdout).cells.flatMap((c: { lines: { text: string; view?: View }[] }) => c.lines.filter((l) => l.view));
  const out: string[] = [];
  for (const [k, { text, view }] of views.entries()) {
    const v = zoom(view), b = backendsOf(v), name = `${path.basename(file, '.rofl.md')}${k ? `-${k}` : ''}`;
    const el = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
    if (!GRAPHS.includes(v.kind)) await pictureOf(v)?.mount(el as unknown as HTMLElement, v, { libs: async () => false } as Hooks, () => {}, () => {});
    if (/^<svg[\s\S]*<\/svg>$/.test(el.innerHTML)) {
      const svg = el.innerHTML.replace(/^<svg /, '<svg xmlns="http://www.w3.org/2000/svg" class="rofl-pic" ').replace('>', `><style>${css}</style>`) + '\n', at = path.join(GUIDE, 'pictures', `${name}.svg`);
      if (!existsSync(at) || readFileSync(at, 'utf8') !== svg) {
        if (check) { console.error(`STALE guide/pictures/${name}.svg: run \`npm run guide\``); stale++; }
        else { mkdirSync(path.dirname(at), { recursive: true }); writeFileSync(at, svg); }
      }
      out.push(`![${text}: ${file}](pictures/${name}.svg)`);
      continue;
    }
    const w = b.find((x) => x.fence === 'mermaid') ?? b.find((x) => x.format === 'markdown') ?? b[0];
    out.push(w.format === 'markdown' ? w.write(v) : `\`\`\`${w.fence}\n${w.write(v).trimEnd()}\n\`\`\``);
  }
  return out.join('\n\n');
}

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

for (const f of readdirSync(GUIDE).filter((f) => f.endsWith('.md'))) {
  const p = path.join(GUIDE, f), doc = readFileSync(p, 'utf8');
  const drawn = new Map<string, string>();
  for (const [, , kind, where, cmd] of doc.matchAll(BLOCK)) if (kind === 'draw') drawn.set(`${where.trim()}:${cmd}`, await draw(where.trim(), cmd!));
  let n = 0;
  const out = doc.replace(BLOCK, (_, begin, kind, where, cmd, end) => (n++, begin + (kind === 'draw' ? drawn.get(`${where.trim()}:${cmd}`)! : render(kind, where.trim(), cmd)) + '\n' + end));
  if (n !== (doc.match(/<!-- BEGIN /g) ?? []).length) { console.error(`guide/${f}: a BEGIN marker without its END, or not run, file, run+exit or draw`); stale++; continue; }
  if (out === doc) continue;
  if (check) { console.error(`STALE guide/${f}: run \`npm run guide\``); stale++; }
  else { writeFileSync(p, out); console.log(`wrote guide/${f}`); }
}
process.exit(stale ? 1 : 0);
