// npm run test:dist — what `npm run dist` built, away from the tree: the packaged command line answers what `npm run nb` answers, on a copy of the starter
// notebooks outside the tree too, and the VSIX, installed into an empty profile, runs them in VS Code with the same result.
// `-- --vscode 1.101.0` runs that VS Code release (downloaded once into the temp directory) instead of the installed one; `-- --shot F` screenshots the window.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from '@vscode/test-electron';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)), DIST = path.join(ROOT, 'dist');
const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const t0 = performance.now(), tmp = mkdtempSync(path.join(os.tmpdir(), 'rofl-dist-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => { spawnSync('pkill', ['-9', '-f', tmp]); process.exit(1); });

const built = spawnSync(process.execPath, ['--experimental-strip-types', path.join(ROOT, 'scripts/dist.ts')], { encoding: 'utf8', timeout: 60_000 });
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
const [inTree, packaged, ...copies] = await Promise.all([
  node(['--experimental-strip-types', path.join(ROOT, 'notebook/cli.ts'), review, '--json']), node([pkg, review, '--json']),
  ...['review', 'small'].map((n) => node([pkg, `${n}.rofl.md`, '--json'], path.join(nb, 'notebook')))]);
if (inTree.code !== 0 || strip(inTree.stdout) !== strip(packaged.stdout)) bad.push(`review.rofl.md: the package says ${packaged.code}, ${strip(packaged.stdout).length} characters; the tree ${inTree.code}, ${strip(inTree.stdout).length}; ${strip(inTree.stdout) === strip(packaged.stdout) ? 'the same' : 'not the same'}`);
const cases = ['review', 'small'].map((n, i) => {
  if (copies[i].code !== 0) bad.push(`${n}.rofl.md outside the tree: exit ${copies[i].code}`);
  const cli = path.join(tmp, `${n}.json`);
  writeFileSync(cli, copies[i].stdout);
  return { file: path.join(nb, 'notebook', `${n}.rofl.md`), cli };
});
console.log(`command line: ${bad.length ? 'FAIL' : 'ok'}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);

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
    extensionTestsEnv: { ROFL_DIST_EXTENSIONS: extensions, ROFL_DIST_ID: id, ROFL_DIST_CASES: JSON.stringify(cases), ROFL_DIST_REPORT: report, ...(shot && { ROFL_DIST_SHOT: shot }) },
    stdout: log, stderr: log,
  });
} catch (e) { bad.push(existsSync(report) ? readFileSync(report, 'utf8') || (e as Error).message : `${(e as Error).message}\n${readFileSync(logFile, 'utf8').slice(-2000)}`); }
finally { log.end(); clearInterval(stop); if (shot) rmSync(`${shot}.ready`, { force: true }), rmSync(`${shot}.done`, { force: true }); }
for (const l of existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n') : []) if (l.startsWith(nb)) console.log(`  ${l.replace(nb + '/', '')}`);
console.log(`${bad.length ? `FAIL\n  ${bad.join('\n  ')}` : 'ok'}: ${vsix} in VS Code ${version ?? 'as installed'}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(bad.length ? 1 : 0);
