// npm run test:dist — what `npm run dist` built, away from the tree: the packaged command line answers what `npm run nb` answers, on a copy of the starter
// notebooks outside the tree too, and the VSIX, installed into an empty profile, runs them in VS Code with the same result.
// Two halves, each under two minutes: `-- --cli` stops after the command line; `-- --editor-only` runs the editor alone, with only the packaged command line's
// answers it holds the editor to, on the build in dist/ when no file of the tree is newer (npm run test:dist and test:dist:vscode). `-- --vscode 1.101.0` runs that VS Code release (downloaded once into the temp directory) instead of the installed one; `-- --shot F` screenshots the window.
// `-- --break vocab` builds the packages without the draw vocabularies, `-- --break resolver` with a `rofl:` name read as a path: each must turn this red.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from '@vscode/test-electron';
import { vscodeLock } from './lock.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)), DIST = path.join(ROOT, 'dist');
const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
if (!process.argv.includes("--cli")) vscodeLock();
const t0 = performance.now(), tmp = mkdtempSync(path.join(os.tmpdir(), 'rofl-dist-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => { spawnSync('pkill', ['-9', '-f', tmp]); process.exit(1); });

const editor = process.argv.includes('--editor-only'), vsixAt = existsSync(DIST) ? readdirSync(DIST).find((f) => f.endsWith('.vsix')) : undefined;
const newest = () => Math.max(...spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map((f) => { try { return statSync(path.join(ROOT, f)).mtimeMs; } catch { return 0; } }));
const fresh = editor && !arg('--break') && vsixAt && statSync(path.join(DIST, vsixAt)).mtimeMs > newest();
if (fresh) console.log(`dist/${vsixAt} is newer than every file of the tree: not built again`);
const built = fresh ? { status: 0, stdout: '', stderr: '' } : spawnSync(process.execPath, ['--experimental-strip-types', path.join(ROOT, 'scripts/dist.ts')], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, ROFL_DIST_BREAK: arg('--break') ?? '' } });
if (built.status !== 0) { console.error(built.stdout + built.stderr); process.exit(1); }
const vsix = readdirSync(DIST).find((f) => f.endsWith('.vsix'))!, tgz = readdirSync(DIST).find((f) => f.endsWith('.tgz'))!;
const manifest = JSON.parse(readFileSync(path.join(DIST, 'vsix/package.json'), 'utf8')), id = `${manifest.publisher}.${manifest.name}`;

type Out = { code: number | null; stdout: string };
const node = (args: string[], cwd = ROOT) => new Promise<Out>((done) => {
  const p = spawn(process.execPath, args, { cwd, env: { ...process.env, ROFL_NB_DAEMON: '0' } });
  let stdout = ''; p.stdout.on('data', (d) => { stdout += d; });
  const kill = setTimeout(() => p.kill(), 120_000);
  p.on('close', (code) => { clearTimeout(kill); done({ code, stdout }); });
});
const strip = (s: string) => { try { return JSON.stringify(JSON.parse(s), (k, v) => k === 'ms' ? undefined : v); } catch { return `not JSON: ${s.slice(0, 200)}`; } };
const bad: string[] = [];

// what a marketplace reads before anything runs: no untrusted or virtual workspace, the vendored parser's notice in both packages, the cells' comment and brackets
const list = (cmd: string, args: string[]) => spawnSync(cmd, args, { encoding: 'utf8' }).stdout ?? '';
const inVsix = list('unzip', ['-l', path.join(DIST, vsix)]), inTgz = list('tar', ['-tzf', path.join(DIST, tgz)]);
const shipped = { id: id === 'GrafemaLabs.rofl' && vsix === `rofl-${manifest.version}.vsix` && manifest.preview === true, untrusted: manifest.capabilities?.untrustedWorkspaces?.supported === false, virtual: manifest.capabilities?.virtualWorkspaces === false,
  noticeVsix: inVsix.includes('extension/THIRD_PARTY_NOTICES'), noticeTgz: inTgz.includes('package/THIRD_PARTY_NOTICES'),
  comments: inVsix.includes('extension/language-configuration.json') && manifest.contributes.languages.filter((l: { configuration?: string }) => l.configuration).length === 2 };
if (Object.values(shipped).some((v) => !v)) bad.push(`the packages lack: ${Object.entries(shipped).filter(([, v]) => !v).map(([k]) => k).join(', ')}`);

// the command line: the package against the tree on the tree's notebook, and the package on a copy outside the tree
const pkg = path.join(DIST, 'rofl-nb/notebook/rofl-nb.js'), nb = path.join(tmp, 'nb');
cpSync(path.join(DIST, 'examples'), nb, { recursive: true });
const review = path.join(ROOT, 'examples/notebook/review.rofl.md');
const broken = path.join(nb, 'broken.rofl');
writeFileSync(broken, 'a(1).\nb(X) :- a(X).\nc(X) :- a(X) b(X).\n');
const copying = Promise.all(['review', 'small'].map((n) => node([pkg, `${n}.rofl.md`, '--json'], path.join(nb, 'notebook'))));
if (!editor) {
const [inTree, packaged] = await Promise.all([node(['--experimental-strip-types', path.join(ROOT, 'notebook/cli.ts'), review, '--json']), node([pkg, review, '--json'])]);
if (inTree.code !== 0 || strip(inTree.stdout) !== strip(packaged.stdout)) bad.push(`review.rofl.md: the package says ${packaged.code}, ${strip(packaged.stdout).length} characters; the tree ${inTree.code}, ${strip(inTree.stdout).length}; ${strip(inTree.stdout) === strip(packaged.stdout) ? 'the same' : 'not the same'}`);
}
const copies = await copying;
const cases: { file: string; cli: string; view?: boolean }[] = ['review', 'small'].map((n, i) => {
  if (copies[i].code !== 0) bad.push(`${n}.rofl.md outside the tree: exit ${copies[i].code}`);
  const cli = path.join(tmp, `${n}.json`);
  writeFileSync(cli, copies[i].stdout);
  return { file: path.join(nb, 'notebook', `${n}.rofl.md`), cli };
});
// every picture the package carries, run by the packaged command line on a copy outside the tree, for the editor to draw the same
const pictures = readdirSync(path.join(ROOT, 'examples/visual')).filter((f) => f.endsWith('.rofl.md'));
for (const [i, r] of (await Promise.all(pictures.map((f) => node([pkg, f, '--json'], path.join(nb, 'visual'))))).entries()) {
  const cli = path.join(tmp, `${pictures[i]}.json`);
  writeFileSync(cli, r.stdout);
  cases.push({ file: path.join(nb, 'visual', pictures[i]), cli, view: true });
}
// the guide's output blocks, printed again by the packaged command line rather than the tree's
if (!editor) {
const guide = spawnSync(process.execPath, ['--experimental-strip-types', path.join(ROOT, 'scripts/guide.ts'), '--check'], { encoding: 'utf8', timeout: 120_000, env: { ...process.env, ROFL_GUIDE_CLI: pkg } });
if (guide.status !== 0) bad.push(`the guide, run by the package: ${guide.stdout}${guide.stderr}`.trim());
else console.log('guide/: every output block is what the package prints');
}
// the language server as installed from the package: `rofl-lsp --stdio` answers initialize and marks a broken rule on its line
if (!editor) {
const prefix = path.join(tmp, 'prefix'), installedTgz = spawnSync('npm', ['install', '--prefix', prefix, '--no-audit', '--no-fund', '--offline', path.join(DIST, tgz)], { encoding: 'utf8', timeout: 60_000 });
if (installedTgz.status !== 0) bad.push(`npm install ${tgz}: ${installedTgz.stdout}${installedTgz.stderr}`);
const rpc = (m: object) => { const b = JSON.stringify({ jsonrpc: '2.0', ...m }); return `Content-Length: ${Buffer.byteLength(b)}\r\n\r\n${b}`; };
const talk = spawnSync(path.join(prefix, 'node_modules/.bin/rofl-lsp'), ['--stdio'], { encoding: 'utf8', timeout: 20_000, input: [
  rpc({ id: 1, method: 'initialize', params: { rootUri: null, capabilities: {} } }),
  rpc({ method: 'textDocument/didOpen', params: { textDocument: { uri: `file://${broken}`, languageId: 'rofl', version: 1, text: readFileSync(broken, 'utf8') } } }),
  rpc({ id: 2, method: 'shutdown' }), rpc({ method: 'exit' })].join('') });
const said = [...(talk.stdout ?? '').matchAll(/Content-Length: \d+\r\n\r\n(\{.*?\})(?=Content-Length|$)/gs)].map((m) => JSON.parse(m[1]));
const init = said.find((m) => m.id === 1)?.result, marked = said.find((m) => m.method === 'textDocument/publishDiagnostics')?.params.diagnostics ?? [];
if (!init?.capabilities?.hoverProvider || marked.length !== 1 || marked[0].range.start.line !== 2) bad.push(`rofl-lsp --stdio from ${tgz}: initialize ${JSON.stringify(init)?.slice(0, 120)}, diagnostics ${JSON.stringify(marked)}, stderr ${talk.stderr}`);
else console.log(`rofl-lsp from ${tgz}: initialize answered, the broken rule marked on line ${marked[0].range.start.line + 1}`);
// every example of examples/visual the package carries, copied out of the installed package and run by it, draws what the tree draws, and has marks;
// a `rofl:` name that is no vocabulary is refused
const home = path.join(prefix, 'node_modules/rofl-nb'), drawn = path.join(tmp, 'drawn');
cpSync(path.join(home, 'examples'), drawn, { recursive: true });
const views = (s: string): number[] => { try { return JSON.parse(s).cells.flatMap((c: { lines: { view?: { marks: object } }[] }) => c.lines.flatMap((l) => l.view ? [Object.keys(l.view.marks).length] : [])); } catch { return []; } };
const t1 = performance.now(), runs = await Promise.all(pictures.map((f) => Promise.all([node([path.join(home, 'notebook/rofl-nb.js'), f, '--json'], path.join(drawn, 'visual')),
  node(['--experimental-strip-types', path.join(ROOT, 'notebook/cli.ts'), path.join(ROOT, 'examples/visual', f), '--json'])])));
let drew = 0;
for (const [i, [got, tree]] of runs.entries()) {
  const n = views(got.stdout);
  if (got.code === 2 || got.code !== tree.code || strip(got.stdout) !== strip(tree.stdout) || !n.length || n.includes(0)) bad.push(`${pictures[i]} from ${tgz}: exit ${got.code} (the tree ${tree.code}), ${strip(got.stdout) === strip(tree.stdout) ? 'the same' : 'not the same'} --json, marks ${JSON.stringify(n)}: ${strip(got.stdout).slice(0, 200)}`);
  else drew++, console.log(`  ${pictures[i]}: exit ${got.code}, ${n.join(' + ')} marks, as the tree draws`);
}
writeFileSync(path.join(drawn, 'escape.rofl.md'), '---\nreads: [rofl:visual/../package.json]\n---\n\n```datalog\n? p(X)\n```\n');
const escape = await node([path.join(home, 'notebook/rofl-nb.js'), 'escape.rofl.md', '--json'], drawn);
const refused = escape.code === 2 && strip(escape.stdout).includes('rofl:visual/../package.json: not a file shipped with ROFL');
if (!refused) bad.push(`rofl:visual/../package.json was not refused: exit ${escape.code}, ${strip(escape.stdout).slice(0, 300)}`);
console.log(`examples/visual from ${tgz}: ${drew} of ${pictures.length} drawn as the tree draws, rofl:visual/../package.json ${refused ? 'refused' : 'NOT refused'}, ${((performance.now() - t1) / 1000).toFixed(1)} s`);
const ver = spawnSync(path.join(prefix, 'node_modules/.bin/rofl-nb'), ['--version'], { encoding: 'utf8', timeout: 20_000 });
if (ver.status !== 0 || ver.stdout !== `rofl-nb ${tgz.replace(/^rofl-nb-(.*)\.tgz$/, '$1')}\n`) bad.push(`rofl-nb --version from ${tgz}: exit ${ver.status}, ${JSON.stringify(ver.stdout + ver.stderr)}`);
}
console.log(`command line: ${bad.length ? `FAIL\n  ${bad.join('\n  ')}\n` : 'ok'}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
if (process.argv.includes('--cli')) process.exit(bad.length ? 1 : 0);

// the editor: the VSIX installed into an empty extensions directory, and a harness extension that installs nothing of its own
const version = arg('--vscode'), shot = arg('--shot');
const code = version ? await downloadAndUnzipVSCode({ version, cachePath: path.join(os.tmpdir(), 'rofl-vscode-releases') }) : process.env.ROFL_VSCODE ?? '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(code), extensions = path.join(tmp, 'extensions');
const installed = spawnSync(cli, [...cliArgs, '--extensions-dir', extensions, '--user-data-dir', path.join(tmp, 'user'), '--install-extension', path.join(DIST, vsix)], { encoding: 'utf8', timeout: 60_000 });
if (installed.status !== 0) bad.push(`install: ${installed.stdout}${installed.stderr}`);
const harness = path.join(tmp, 'harness');
mkdirSync(harness);
writeFileSync(path.join(harness, 'package.json'), JSON.stringify({ name: 'dist-check', publisher: 'rofl', version: '0.0.0', engines: { vscode: '*' } }));
const report = path.join(tmp, 'report');
let stop: NodeJS.Timeout | undefined;
if (shot) stop = setInterval(() => { if (existsSync(`${shot}.ready`)) { clearInterval(stop); spawnSync('screencapture', ['-x', shot]); writeFileSync(`${shot}.done`, ''); } }, 200);
const logFile = path.join(tmp, 'vscode.log'), log = createWriteStream(logFile);
try {
  if (!installed.status) await runTests({
    vscodeExecutablePath: code, extensionDevelopmentPath: harness, extensionTestsPath: path.join(ROOT, 'vscode/test/installed.cjs'),
    launchArgs: [nb, '--extensions-dir', extensions, '--user-data-dir', path.join(tmp, 'user'), '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
    extensionTestsEnv: { ROFL_DIST_EXTENSIONS: extensions, ROFL_DIST_ID: id, ROFL_DIST_CASES: JSON.stringify(cases), ROFL_DIST_REPORT: report, ROFL_DIST_LSP: broken, ...(shot && { ROFL_DIST_SHOT: shot }) },
    stdout: log, stderr: log,
  });
} catch (e) { bad.push(existsSync(report) ? readFileSync(report, 'utf8') || (e as Error).message : `${(e as Error).message}\n${readFileSync(logFile, 'utf8').slice(-2000)}`); }
finally { log.end(); clearInterval(stop); if (shot) rmSync(`${shot}.ready`, { force: true }), rmSync(`${shot}.done`, { force: true }); }
for (const l of existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n') : []) if (l.startsWith(nb)) console.log(`  ${l.replace(nb + '/', '')}`);
console.log(`${bad.length ? `FAIL\n  ${bad.join('\n  ')}` : 'ok'}: ${vsix} in VS Code ${version ?? 'as installed'}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(bad.length ? 1 : 0);
