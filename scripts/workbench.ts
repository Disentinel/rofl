// The workbench as static files: a notebook page, no code pane, whose kernel runs in the page. `--out DIR` (by default workbench/dist).
// Publish the directory as an artifact with capabilities {db:{}, room:{}, sample:{}, user:{scopes:["profile"]}}, or serve it as it is.
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { emitAll } from './emit.ts';
import { EXAMPLES, FILES } from '../workbench/bench.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const argv = process.argv.slice(2), oi = argv.indexOf('--out');
const OUT = path.resolve(oi >= 0 ? argv[oi + 1] : `${ROOT}workbench/dist`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/lib`, { recursive: true });

// the host reads code with the JS scanner, which a notebook with no code never calls: it is not shipped, nor is babel
emitAll(ROOT, `${OUT}/lib`, ['workbench/page.ts'], { 'scanners/js_ast.ts': 'export const scan = () => { throw new Error("no code in the workbench"); };\n' });
const copy = (from: string, to: string) => { mkdirSync(path.dirname(`${OUT}/${to}`), { recursive: true }); copyFileSync(`${ROOT}${from}`, `${OUT}/${to}`); };
for (const f of FILES) copy(f, f);
for (const e of EXAMPLES) if (e.file) copy(`examples/visual/${path.basename(e.file)}`, e.file);
const read = (f: string) => readFileSync(`${ROOT}${f}`, 'utf8');
const page = read('workbench/page.html').replace('  /* tokens */\n', () => read('playground/tokens.css'));
// `--standalone`: the head an artifact's skeleton otherwise gives it, for any web server
writeFileSync(`${OUT}/index.html`, argv.includes('--standalone') ? `<!doctype html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${page}` : page);

const all = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? all(`${d}/${e.name}`) : [`${d}/${e.name}`]);
const files = all(OUT).map((f) => [path.relative(OUT, f), statSync(f).size] as const).sort();
console.log(`${OUT}: ${files.length} files, ${Math.round(files.reduce((a, [, n]) => a + n, 0) / 1024)} KB`);
if (argv.includes('--list')) for (const [f, n] of files) console.log(`${String(n).padStart(8)}  ${f}`);
