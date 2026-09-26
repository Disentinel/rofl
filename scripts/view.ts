// One HTML page that shows a set of `.rofl.md` files: tabs, colors, links between them. Nothing to install, open it in a browser.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

const ROOT = new URL('..', import.meta.url).pathname;
const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(name); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const out = opt('--out'), title = opt('--title'), lead = opt('--lead');
if (!argv.length) { console.error('usage: npm run view -- <dir | file.rofl.md ...> [--out FILE.html] [--title T] [--lead TEXT]'); process.exit(2); }

const files: string[] = [];
for (const a of argv) {
  if (statSync(a).isDirectory()) {
    const names = readdirSync(a).filter((n) => n.endsWith('.rofl.md')).sort();
    if (existsSync(path.join(a, 'index.md'))) names.unshift('index.md');
    files.push(...names.map((n) => path.join(a, n)));
  } else files.push(a);
}
const first = argv[0].replace(/\/$/, '');
const name = title ?? (statSync(first).isDirectory() ? path.basename(path.resolve(first)) : path.basename(first).replace(/(\.rofl)?\.md$/, ''));
const target = out ?? path.join(statSync(first).isDirectory() ? first : path.dirname(first), 'view.html');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const embedded = files.map((f) => {
  const text = readFileSync(f, 'utf8');
  if (/<\/script/i.test(text)) throw new Error(`${f} contains </script and cannot be embedded`);
  return `<script type="text/plain" id="f-${path.basename(f).replace(/(\.rofl)?\.md$/, '')}">\n${text}</script>`;
}).join('\n');
const parser = ts.transpileModule(readFileSync(`${ROOT}scripts/md_blocks.ts`, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
  .outputText.replace(/^export /gm, '').replace(/^\/\/.*\n/gm, '');

const page = readFileSync(`${ROOT}scripts/view.template.html`, 'utf8')
  .replaceAll('{{TITLE}}', esc(name))
  .replace('{{LEAD}}', lead ? `<p class="sub">${esc(lead)}</p>` : '')
  .replace('{{PARSER}}', () => parser)
  .replace('{{FILES}}', () => embedded);
writeFileSync(target, page);
console.log(`${target}: ${files.length} files`);
