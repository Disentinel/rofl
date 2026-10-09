// npm run dist — the notebook without a checkout: dist/rofl-nb-<v>.tgz (the `rofl-nb` command and the `rofl-lsp` language server, ROFL's version) and
// dist/rofl-<ext>.vsix (the editor, the extension's own version from vscode/package.json), both plain JS.
// One tree serves both: the modules the command line and the extension import, transpiled in place, the model's .rofl files beside them, @babel/parser vendored.
// The extension is that tree under rofl-nb/, entered through a CommonJS main, so an editor that loads extensions with require runs it too.
// `-- --target <vsce target>` (linux-x64, darwin-arm64, win32-x64, ...): the VSIX for that platform, carrying the Rust engine built for it
// (rust/target/rofl-<target>/rofl, else this machine's rust/target/release/rofl) in rofl-nb/bin; without one, the VSIX for every platform, which evaluates on the TypeScript engine.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { MODEL_FILES, PHRASE_FILES, SHIPPED } from '../notebook/front.ts';
import { buildRenderer } from './renderer.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), OUT = path.join(ROOT, 'dist');
const root = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')), version: string = root.version;
const ext = JSON.parse(readFileSync(path.join(ROOT, 'vscode/package.json'), 'utf8')), vsix = `${ext.name}-${ext.version}.vsix`;
const NODE = '>=22.0.0', VSCODE = '^1.101.0';   // fs.globSync is Node 22; VS Code 1.101 is the first on Node 22 (Electron 35)
const PKG = path.join(OUT, 'rofl-nb'), VSIX = path.join(OUT, 'vsix');
// ROFL_DIST_BREAK, for vscode/test/dist.ts --break: `vocab` leaves out what `rofl:` names, `resolver` makes a `rofl:` name read as a path
const BREAK = process.env.ROFL_DIST_BREAK;
const TARGET = process.argv.includes('--target') ? process.argv[process.argv.indexOf('--target') + 1] : undefined;
rmSync(OUT, { recursive: true, force: true });
// the guide shows the tool's own output; a stale block is a build error, not a doc that lies
execFileSync(process.execPath, ['--experimental-strip-types', path.join(ROOT, 'scripts/guide.ts'), '--check'], { stdio: 'inherit' });

// every module the command line, the kept kernel and the extension reach by relative imports
const ENTRIES = ['notebook/cli.ts', 'notebook/serve.ts', 'lsp/server.ts', 'vscode/extension.ts', 'vscode/worker.ts'];
const seen = new Set<string>();
for (const q = [...ENTRIES]; q.length;) {
  const f = q.pop()!;
  if (seen.has(f)) continue;
  seen.add(f);
  for (const m of readFileSync(path.join(ROOT, f), 'utf8').matchAll(/(?:from|import)\s*\(?\s*'(\.\.?\/[^']+\.ts)'|new URL\('(\.\.?\/[^']+\.ts)'/g)) q.push(path.normalize(path.join(path.dirname(f), m[1] ?? m[2])));
}
for (const f of seen) {
  let js = ts.transpileModule(readFileSync(path.join(ROOT, f), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/'(\.\.?\/[^']*)\.ts'/g, "'$1.js'")
    .replace(/from '@babel\/parser'/g, `from '${path.relative(path.dirname(f), 'vendor/babel-parser.js').replace(/^(?!\.)/, './')}'`)
    .replace(/npm run nb -- /g, 'rofl-nb ');
  // an extension host that predates ES module extensions resolves `vscode` only for require
  if (f === 'vscode/extension.ts' || f === 'vscode/lsp.ts') js = js.replace("import * as vscode from 'vscode';", "import { createRequire } from 'node:module';\nconst vscode = createRequire(import.meta.url)('vscode');");
  if (f === 'notebook/cli.ts') {
    const help = "Then: examples/notebook/review.rofl.md, examples/notebook/self.rofl.md.";
    if (!js.includes(help)) throw new Error(`${f}: the help no longer names the examples as the build expects`);
    js = js.replace(help, 'Then copy and read ${path.join(ROOT, "examples/notebook")}: review.rofl.md (no code) and small.rofl.md (over small.js).');
    const play = 'Play examples/tutorial (6 levels), from examples/tutorial/1-what-ships.rofl.md.';
    if (!js.includes(play)) throw new Error(`${f}: the help no longer names the tutorial as the build expects`);
    js = js.replace(play, 'Copy and play ${path.join(ROOT, "examples/tutorial")} (6 short levels), from 1-what-ships.rofl.md.');
  }
  if (BREAK === 'resolver' && f === 'notebook/front.ts') { const broken = js.replace("name.startsWith('rofl:')", 'false'); if (broken === js) throw new Error(`${f}: no resolver to break`); js = broken; }
  if (/from '(?!node:|\.)/.test(js)) throw new Error(`${f} imports a package the build does not carry`);
  mkdirSync(path.dirname(path.join(PKG, f)), { recursive: true });
  writeFileSync(path.join(PKG, f.replace(/\.ts$/, '.js')), js);
}
// each command's entry asks for Node 22 before any import that needs it, then runs its module as the main one
for (const [bin, main] of [['notebook/rofl-nb.js', './cli.js'], ['lsp/rofl-lsp.js', './server.js']]) writeFileSync(path.join(PKG, bin), `#!/usr/bin/env node
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) { console.error(\`${path.basename(bin, '.js')} needs Node 22 or later; this is Node \${process.versions.node} — install Node 22 (nvm install 22)\`); process.exit(2); }
const { fileURLToPath } = await import('node:url');
process.argv[1] = fileURLToPath(new URL('${main}', import.meta.url));
await import('${main}');
`);
cpSync(path.join(ROOT, 'node_modules/@babel/parser/lib/index.js'), path.join(PKG, 'vendor/babel-parser.js'));
const babel = JSON.parse(readFileSync(path.join(ROOT, 'node_modules/@babel/parser/package.json'), 'utf8')).version;
writeFileSync(path.join(PKG, 'THIRD_PARTY_NOTICES'), `vendor/babel-parser.js is @babel/parser ${babel} (https://github.com/babel/babel), under the MIT license:\n\n${readFileSync(path.join(ROOT, 'node_modules/@babel/parser/LICENSE'), 'utf8')}`);
for (const f of [...MODEL_FILES, ...PHRASE_FILES, 'facts/kernel-phrases.rofl', 'facts/ring1-phrases.rofl', 'LICENSE']) cpSync(path.join(ROOT, f), path.join(PKG, f));
const tutorial = (readdirSync(path.join(ROOT, 'examples/tutorial'), { recursive: true }) as string[]).filter((f) => f.endsWith('.md')).map((f) => `examples/tutorial/${f}`);
const start = readdirSync(path.join(ROOT, 'examples/start')).map((f) => `examples/start/${f}`);
// the pictures a notebook draws: what `reads: [rofl:visual/graph.rofl.md]` names (front.ts SHIPPED), the matrix beside the vocabularies, and the examples
const visual = readdirSync(path.join(ROOT, 'visual')).filter((f) => f.endsWith('.rofl.md')).map((f) => `visual/${f}`);
const drawn = readdirSync(path.join(ROOT, 'examples/visual')).map((f) => `examples/visual/${f}`);
const spat = ['examples/spat/spat.rofl', 'examples/spat/week.example.rofl'];
for (const f of BREAK === 'vocab' ? [] : new Set([...SHIPPED, ...visual])) cpSync(path.join(ROOT, f), path.join(PKG, f));
for (const f of ['examples/review.rofl.md', 'examples/notebook/review.rofl.md', 'examples/notebook/small.rofl.md', 'examples/notebook/small.js', ...tutorial, ...start, ...drawn, ...spat]) {
  // a shipped notebook still tells the reader to run it from the checkout; point it at the installed command instead
  const text = f.endsWith('.md') ? readFileSync(path.join(ROOT, f), 'utf8').replace(/npm run nb -- (translate )?examples\/(notebook|tutorial)\//g, 'rofl-nb $1') : null;
  for (const dst of [path.join(PKG, f), path.join(OUT, f)]) {
    if (text !== null) { mkdirSync(path.dirname(dst), { recursive: true }); writeFileSync(dst, text); }
    else cpSync(path.join(ROOT, f), dst);
  }
}
const guide = (f: string) => readFileSync(path.join(ROOT, 'guide', f), 'utf8').replace(/<!-- (BEGIN|END) [^>]*-->\n/g, '');
if (!guide('INSTALL.md').includes(`Node ${NODE.match(/\d+/)![0]} or later`) || !guide('INSTALL.md').includes(`VS Code ${VSCODE.slice(1).replace(/\.0$/, '')} or later`)) throw new Error(`guide/INSTALL.md does not ask for Node ${NODE} and VS Code ${VSCODE}`);
for (const f of ['QUICKSTART.md', 'CONCEPTS.md', 'WRITING.md', 'AGENTS.md', 'CHEATSHEET.md', 'INSTALL.md', 'MODELS.md']) writeFileSync(path.join(PKG, f), guide(f));
writeFileSync(path.join(PKG, 'DRAWING.md'), guide('DRAWING.md').replace(/\]\(\.\.\//g, ']('));
cpSync(path.join(ROOT, 'guide/pictures'), path.join(PKG, 'pictures'), { recursive: true });
writeFileSync(path.join(PKG, 'README.md'), guide('README-npm.md'));
writeFileSync(path.join(OUT, 'INSTALL.md'), guide('INSTALL.md'));
writeFileSync(path.join(PKG, 'package.json'), JSON.stringify({
  name: 'rofl-nb', version, description: 'The ROFL notebook: run a .rofl.md notebook from the command line; rofl-lsp, a language server for .rofl and .rofl.md', license: root.license, type: 'module',
  bin: { 'rofl-nb': 'notebook/rofl-nb.js', 'rofl-lsp': 'lsp/rofl-lsp.js' }, engines: { node: NODE }, repository: root.repository,
}, null, 2) + '\n');
execFileSync('npm', ['pack', '--silent', '--pack-destination', OUT], { cwd: PKG, stdio: ['ignore', 'ignore', 'inherit'] });

cpSync(PKG, path.join(VSIX, 'rofl-nb'), { recursive: true });
for (const f of ['rofl.tmLanguage.json', 'datalog.tmLanguage.json', 'language-configuration.json', 'icon.png', 'file-light.png', 'file-dark.png', 'CHANGELOG.md']) cpSync(path.join(ROOT, 'vscode', f), path.join(VSIX, f));
for (const f of ['LICENSE', 'THIRD_PARTY_NOTICES']) cpSync(path.join(PKG, f), path.join(VSIX, f));
writeFileSync(path.join(VSIX, 'README.md'), guide('README-marketplace.md'));
// a Marketplace or npm page shows its images from GitHub: each names a file on the pushed branch it points at
for (const f of [path.join(VSIX, 'README.md'), path.join(PKG, 'README.md')]) for (const [, url] of readFileSync(f, 'utf8').matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
  const [, ref, file] = /^https:\/\/raw\.githubusercontent\.com\/Disentinel\/rofl\/([^/]+)\/(.+)$/.exec(url) ?? [];
  try { execFileSync('git', ['cat-file', '-e', `origin/${ref}:${file}`], { cwd: ROOT, stdio: 'ignore' }); } catch { throw new Error(`${path.relative(OUT, f)}: the image ${url} is no file of the repository's pushed branches`); }
}
// the notebook renderer, browser JS the extension's pictures are drawn with
buildRenderer(path.join(VSIX, 'rofl-nb/vscode/visual/out'));
if (TARGET) {
  const exe = `rofl${TARGET.startsWith('win32') ? '.exe' : ''}`;
  mkdirSync(path.join(VSIX, 'rofl-nb/bin'), { recursive: true });
  const built = [`rofl-${TARGET}`, 'release'].map((d) => path.join(ROOT, 'rust/target', d, exe)).find(existsSync)!;
  cpSync(built, path.join(VSIX, 'rofl-nb/bin', exe));
}
writeFileSync(path.join(VSIX, 'main.js'), "exports.activate = async (ctx) => (await import('./rofl-nb/vscode/extension.js')).activate(ctx);\n");
const { type: _, devDependencies: __, ...manifest } = ext;
manifest.contributes.notebookRenderer = manifest.contributes.notebookRenderer.map((r: { entrypoint: string }) => ({ ...r, entrypoint: r.entrypoint.replace(/^\.\//, './rofl-nb/vscode/') }));
writeFileSync(path.join(VSIX, 'package.json'), JSON.stringify({ ...manifest,
  main: './main.js', files: ['main.js', 'rofl-nb', '*.tmLanguage.json', 'language-configuration.json', '*.png', 'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES'], engines: { vscode: VSCODE } }, null, 2) + '\n');
execFileSync(path.join(ROOT, 'vscode/node_modules/.bin/vsce'), ['package', '--no-dependencies', ...(TARGET ? ['--target', TARGET] : []), '--out', path.join(OUT, vsix)], { cwd: VSIX, stdio: ['ignore', 'ignore', 'inherit'] });

for (const f of [`rofl-nb-${version}.tgz`, vsix]) console.log(`dist/${f}: ${Math.round(readFileSync(path.join(OUT, f)).length / 1024)} KB`);
