// npm run dist — the notebook without a checkout: dist/rofl-nb-<v>.tgz (the `rofl-nb` command) and dist/rofl-notebook-<v>.vsix (the editor), both plain JS.
// One tree serves both: the modules the command line and the extension import, transpiled in place, the model's .rofl files beside them, @babel/parser vendored.
// The extension is that tree under rofl-nb/, entered through a CommonJS main, so an editor that loads extensions with require runs it too.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { MODEL_FILES, PHRASE_FILES } from '../notebook/front.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), OUT = path.join(ROOT, 'dist');
const root = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')), version: string = root.version;
const ext = JSON.parse(readFileSync(path.join(ROOT, 'vscode/package.json'), 'utf8'));
const NODE = '>=22.0.0', VSCODE = '^1.101.0';   // fs.globSync is Node 22; VS Code 1.101 is the first on Node 22 (Electron 35)
const PKG = path.join(OUT, 'rofl-nb'), VSIX = path.join(OUT, 'vsix');
rmSync(OUT, { recursive: true, force: true });

// every module the command line, the kept kernel and the extension reach by relative imports
const ENTRIES = ['notebook/cli.ts', 'notebook/serve.ts', 'vscode/extension.ts', 'vscode/worker.ts'];
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
  if (f === 'vscode/extension.ts') js = js.replace("import * as vscode from 'vscode';", "import { createRequire } from 'node:module';\nconst vscode = createRequire(import.meta.url)('vscode');");
  if (f === 'notebook/cli.ts') {
    const help = "Read first: examples/notebook/review.rofl.md (small, no code), examples/notebook/self.rofl.md (over this tree's code).";
    if (!js.includes(help)) throw new Error(`${f}: the help no longer names the examples as the build expects`);
    js = js.replace(help, 'Copy and read first: ${path.join(ROOT, "examples/notebook")}: review.rofl.md (no code) and small.rofl.md (over small.js).');
  }
  if (/from '(?!node:|\.)/.test(js)) throw new Error(`${f} imports a package the build does not carry`);
  mkdirSync(path.dirname(path.join(PKG, f)), { recursive: true });
  writeFileSync(path.join(PKG, f.replace(/\.ts$/, '.js')), js);
}
// the command's entry asks for Node 22 before any import that needs it, then runs cli.js as the main module
writeFileSync(path.join(PKG, 'notebook/rofl-nb.js'), `#!/usr/bin/env node
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) { console.error(\`rofl-nb needs Node 22 or later; this is Node \${process.versions.node} — install Node 22 (nvm install 22)\`); process.exit(2); }
const { fileURLToPath } = await import('node:url');
process.argv[1] = fileURLToPath(new URL('./cli.js', import.meta.url));
await import('./cli.js');
`);
cpSync(path.join(ROOT, 'node_modules/@babel/parser/lib/index.js'), path.join(PKG, 'vendor/babel-parser.js'));
const babel = JSON.parse(readFileSync(path.join(ROOT, 'node_modules/@babel/parser/package.json'), 'utf8')).version;
writeFileSync(path.join(PKG, 'THIRD_PARTY_NOTICES'), `vendor/babel-parser.js is @babel/parser ${babel} (https://github.com/babel/babel), under the MIT license:\n\n${readFileSync(path.join(ROOT, 'node_modules/@babel/parser/LICENSE'), 'utf8')}`);
for (const f of [...MODEL_FILES, ...PHRASE_FILES, 'facts/kernel-phrases.rofl', 'facts/ring1-phrases.rofl', 'LICENSE']) cpSync(path.join(ROOT, f), path.join(PKG, f));
for (const f of ['examples/review.rofl.md', 'examples/notebook/review.rofl.md', 'examples/notebook/small.rofl.md', 'examples/notebook/small.js']) {
  // a shipped .rofl.md still tells the reader to run it from the checkout; point it at the installed command instead
  const text = f.endsWith('.rofl.md') ? readFileSync(path.join(ROOT, f), 'utf8').replace(/npm run nb -- examples\/notebook\//g, 'rofl-nb ') : null;
  for (const dst of [path.join(PKG, f), path.join(OUT, f)]) {
    if (text !== null) { mkdirSync(path.dirname(dst), { recursive: true }); writeFileSync(dst, text); }
    else cpSync(path.join(ROOT, f), dst);
  }
}
const install = readFileSync(path.join(ROOT, 'scripts/dist-install.md'), 'utf8').replaceAll('<v>', version).replaceAll('<node>', NODE).replaceAll('<vscode>', VSCODE);
writeFileSync(path.join(PKG, 'README.md'), install);
writeFileSync(path.join(OUT, 'INSTALL.md'), install);
writeFileSync(path.join(PKG, 'package.json'), JSON.stringify({
  name: 'rofl-nb', version, description: 'The ROFL notebook: run a .rofl.md notebook from the command line', license: root.license, type: 'module',
  bin: { 'rofl-nb': 'notebook/rofl-nb.js' }, engines: { node: NODE }, repository: root.repository,
}, null, 2) + '\n');
execFileSync('npm', ['pack', '--silent', '--pack-destination', OUT], { cwd: PKG, stdio: ['ignore', 'ignore', 'inherit'] });

cpSync(PKG, path.join(VSIX, 'rofl-nb'), { recursive: true });
for (const f of ['rofl.tmLanguage.json', 'datalog.tmLanguage.json', 'language-configuration.json']) cpSync(path.join(ROOT, 'vscode', f), path.join(VSIX, f));
for (const f of ['LICENSE', 'THIRD_PARTY_NOTICES']) cpSync(path.join(PKG, f), path.join(VSIX, f));
writeFileSync(path.join(VSIX, 'README.md'), install);
writeFileSync(path.join(VSIX, 'main.js'), "exports.activate = async (ctx) => (await import('./rofl-nb/vscode/extension.js')).activate(ctx);\n");
const { type: _, devDependencies: __, ...manifest } = ext;
writeFileSync(path.join(VSIX, 'package.json'), JSON.stringify({ ...manifest, version, description: 'A .rofl.md opens as a notebook and runs through the ROFL notebook kernel',
  main: './main.js', files: ['main.js', 'rofl-nb', '*.tmLanguage.json', 'language-configuration.json', 'LICENSE', 'THIRD_PARTY_NOTICES'], engines: { vscode: VSCODE }, repository: root.repository }, null, 2) + '\n');
execFileSync(path.join(ROOT, 'vscode/node_modules/.bin/vsce'), ['package', '--no-dependencies', '--out', path.join(OUT, `rofl-notebook-${version}.vsix`)], { cwd: VSIX, stdio: ['ignore', 'ignore', 'inherit'] });

for (const f of [`rofl-nb-${version}.tgz`, `rofl-notebook-${version}.vsix`]) console.log(`dist/${f}: ${Math.round(readFileSync(path.join(OUT, f)).length / 1024)} KB`);
