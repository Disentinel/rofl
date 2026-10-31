// npm run test:npm — the npm packages `npm run dist` packed, before any is published, as a user gets them: installed from the tarballs alone
// (`--offline`) into an empty prefix, with an empty HOME and npm cache and no registry to reach, run from a directory outside the tree with nothing
// of a checkout, of cargo or of Rust on PATH. It asks `rofl` a small world, scans a small JS directory and asks the JS model about it the way
// docs/cli.md says, twice (the second from the kept world), times the command against the bare binary, runs `rofl-nb` on a notebook, imports the
// library, upgrades an older release in place, and checks every platform tarball carries its engine executable.
// Then the faults that must be loud, each shown failing: no platform package, a platform package of another version, a release tag of another version,
// the engine killed by a signal, and the command killed while the engine runs.
// `-- --tag rofl-nb-X` checks only that X is package.json's version and every tarball's, the release job's step before anything is published.
import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { chmodSync, closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORMS } from '../npm/platform.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const DIST = path.resolve(arg('--dist') ?? path.join(ROOT, 'dist'));
const version: string = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const tarballs = existsSync(DIST) ? readdirSync(DIST).filter((f) => /^grafema-rofl-.*\.tgz$/.test(f)) : [];
const manifest = (tgz: string) => JSON.parse(spawnSync('tar', ['-xzOf', path.join(DIST, tgz), 'package/package.json'], { encoding: 'utf8' }).stdout || '{}');

// the release's versions: the tag's, package.json's and every tarball's are one, and the main package and every platform's are there
function versions(tag: string): string[] {
  const bad: string[] = [], want = tag.replace(/^rofl-nb-/, '');
  if (want !== version) bad.push(`the tag ${tag} is version ${want}, and package.json is ${version}`);
  const names = ['@grafema/rofl', ...PLATFORMS.map((p) => `@grafema/rofl-${p}`)];
  for (const name of names) {
    const tgz = `${name.slice(1).replace('/', '-')}-${version}.tgz`;
    if (!tarballs.includes(tgz)) { bad.push(`${tgz} is not in ${DIST}`); continue; }
    const m = manifest(tgz);
    if (m.name !== name || m.version !== want) bad.push(`${tgz} is ${m.name}@${m.version}, not ${name}@${want}`);
  }
  for (const f of tarballs) if (!names.some((n) => f === `${n.slice(1).replace('/', '-')}-${version}.tgz`)) bad.push(`${f} is a tarball of no package of version ${version}`);
  return bad;
}
const tag = arg('--tag');
if (tag) {
  const bad = versions(tag);
  console.log(bad.length ? `REFUSED ${tag}:\n  ${bad.join('\n  ')}` : `${tag}: package.json and the ${tarballs.length} tarballs are all version ${version}`);
  process.exit(bad.length ? 1 : 0);
}

const t0 = performance.now(), bad: string[] = [], said = (ok: boolean, what: string, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!ok) bad.push(what); };
const own = `${process.platform}-${process.arch}`, main = `grafema-rofl-${version}.tgz`, plat = `grafema-rofl-${own}-${version}.tgz`;
if (!tarballs.includes(main) || !tarballs.includes(plat)) { console.error(`no ${main} and ${plat} in ${DIST}: npm run dist first (with this machine's rust/target/release/rofl)`); process.exit(2); }
const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'rofl-npm-')));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));

// every platform tarball there is carries its engine, executable
for (const p of PLATFORMS) {
  const tgz = `grafema-rofl-${p}-${version}.tgz`;
  if (!tarballs.includes(tgz)) { console.log(`--   ${tgz}: not built here`); continue; }
  const exe = `package/bin/rofl${p.startsWith('win32') ? '.exe' : ''}`, line = spawnSync('tar', ['-tvzf', path.join(DIST, tgz)], { encoding: 'utf8' }).stdout.split('\n').find((l) => l.endsWith(` ${exe}`)) ?? '';
  const m = manifest(tgz), [o, c] = p.split('-');
  said(/^-rwxr-xr-x/.test(line) && m.os?.[0] === o && m.cpu?.[0] === c, `${tgz} carries ${exe} executable, for os ${o} and cpu ${c}`, `${line.trim() || 'no such file'}; os ${m.os} cpu ${m.cpu}; ${(statSync(path.join(DIST, tgz)).size / 1048576).toFixed(1)} MB`);
}

// a PATH with node and npm alone; an empty HOME and npm cache; a registry nobody answers at
const tools = path.join(tmp, 'tools'), npmCli = realpathSync(path.join(path.dirname(process.execPath), 'npm'));
mkdirSync(tools);
symlinkSync(process.execPath, path.join(tools, 'node'));
symlinkSync(npmCli, path.join(tools, 'npm'));
symlinkSync(realpathSync(path.join(path.dirname(process.execPath), 'npx')), path.join(tools, 'npx'));
const user = (prefix: string, home = path.join(tmp, 'home')) => {
  mkdirSync(home, { recursive: true });
  const env: NodeJS.ProcessEnv = { PATH: [path.join(prefix, 'bin'), tools, '/usr/bin', '/bin'].join(path.delimiter), HOME: home, TMPDIR: tmp, npm_config_cache: path.join(tmp, 'npm-cache'),
    npm_config_registry: 'http://127.0.0.1:9/', npm_config_userconfig: path.join(home, '.npmrc'), npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false', ROFL_NB_DAEMON: '0' };
  return env;
};
const run = (cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, input?: string): SpawnSyncReturns<string> =>
  spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: 120_000, input });
const install = (prefix: string, files: string[]) => {
  const t = performance.now(), r = run('npm', ['install', '-g', '--offline', '--prefix', prefix, ...files.map((f) => path.join(DIST, f))], tmp, user(prefix));
  return { ...r, s: ((performance.now() - t) / 1000).toFixed(1) };
};

const prefix = path.join(tmp, 'prefix'), env = user(prefix), work = path.join(tmp, 'work'), rofl = path.join(prefix, 'bin', 'rofl');
mkdirSync(work);
const inst = install(prefix, [main, plat]);
said(inst.status === 0 && existsSync(rofl), `npm install -g --offline ${main} ${plat}, no registry`, `exit ${inst.status}, ${inst.s} s${inst.status ? `: ${(inst.stdout + inst.stderr).trim().split('\n').slice(-3).join(' | ')}` : ''}`);
// one name a lookup: dash, Ubuntu's sh, says only the first of several; and a name not found is said, not left out
const where = (c: string) => run('sh', ['-c', `command -v ${c} || echo none`], work, env).stdout.trim();
const found = Object.fromEntries(['rofl', 'rofl-nb', 'rofl-lsp', 'cargo', 'rustc'].map((c) => [c, where(c)]));
said(['rofl', 'rofl-nb', 'rofl-lsp'].every((c) => found[c] === path.join(prefix, 'bin', c)) && found.cargo === 'none' && found.rustc === 'none',
  'rofl, rofl-nb and rofl-lsp are the installed ones, and there is no cargo or rustc', Object.entries(found).map(([c, w]) => `${c}: ${w}`).join(', '));

// a small world
writeFileSync(path.join(work, 'world.rofl'), 'edge(a, b). edge(b, c).\npath(X, Y) :- edge(X, Y).\npath(X, Z) :- path(X, Y), edge(Y, Z).\n');
const ask = run('rofl', ['ask', 'path(a, X)', 'world.rofl'], work, env);
said(ask.status === 0 && ask.stdout === 'X = b\nX = c\n\n', "rofl ask 'path(a, X)' world.rofl", `exit ${ask.status}, ${JSON.stringify(ask.stdout)}${ask.stderr ? ` stderr ${JSON.stringify(ask.stderr.slice(0, 300))}` : ''}`);

// a small JS directory, scanned and asked the way docs/cli.md says, then asked again
mkdirSync(path.join(work, 'src/lib'), { recursive: true });
writeFileSync(path.join(work, 'src/main.js'), "import { greet } from './lib/greet.js';\nconsole.log(greet('world'));\n");
writeFileSync(path.join(work, 'src/lib/greet.js'), "export function greet(who) { return 'hello ' + who; }\n");
const scan = run('rofl', ['scan', 'src', '--out', 'code.rofl'], work, env);
said(scan.status === 0 && existsSync(path.join(work, 'code.rofl')), 'rofl scan src --out code.rofl', `exit ${scan.status}, ${scan.stderr.trim()}`);
const jsq = ['ask', 'depends[code](F, G)', '@rules/js.files', 'code.rofl'], timed = () => { const t = performance.now(), r = run('rofl', jsq, work, env); return { ...r, ms: performance.now() - t }; };
const worlds = path.join(env.HOME!, '.cache/rofl/worlds'), listing = () => existsSync(worlds) ? readdirSync(worlds).filter((f) => f.endsWith('.vol')).sort().join(',') : '';
const first = timed(), kept = listing(), second = timed(), after = listing();
rmSync(worlds, { recursive: true, force: true });
const third = timed();
const rows = 'F = "main.js", G = "lib/greet.js"\n\n';
said(first.status === 0 && first.stdout === rows, `rofl ${jsq.map((a) => a.includes(' ') ? `'${a}'` : a).join(' ')}`, `exit ${first.status}, ${JSON.stringify(first.stdout)}, ${(first.ms / 1000).toFixed(2)} s${first.stderr ? ` stderr ${JSON.stringify(first.stderr.slice(0, 300))}` : ''}`);
said(second.status === 0 && second.stdout === first.stdout && kept !== '' && after === kept && second.ms < first.ms / 2 && third.ms > 2 * second.ms && third.stdout === first.stdout, 'the same question again, answered from the kept world under ~/.cache/rofl/worlds',
  `${(second.ms / 1000).toFixed(2)} s against ${(first.ms / 1000).toFixed(2)} s, and ${(third.ms / 1000).toFixed(2)} s once the kept world is deleted; the kept worlds ${kept ? (after === kept ? `the same ${kept.split(',').length} .vol, none added` : `${kept} then ${after}`) : 'absent'}`);

// a world that scans for itself, `scanner(js, "rofl scan src")` as docs/cli.md says: with rofl on PATH it answers; called by its full path
// with no rofl on PATH, the scanner cannot be started, and the answer is partial with the failure said, never whole and empty
writeFileSync(path.join(work, 'w.rofl'), 'scanner(js, "rofl scan src").\nscan_request(js, "main.js").\nscan_request(js, F) :- depends[code](_, F).\n');
const selfScan = run('rofl', ['ask', 'depends[code](F, G)', '@rules/js.files', 'w.rofl'], work, env);
said(selfScan.status === 0 && selfScan.stdout === rows, 'a world that scans with `rofl scan src` answers', `exit ${selfScan.status}, ${JSON.stringify(selfScan.stdout)}${selfScan.stderr ? ` stderr ${JSON.stringify(selfScan.stderr.slice(0, 300))}` : ''}`);
const noPath = { ...user(prefix, path.join(tmp, 'home-nopath')), PATH: [tools, '/usr/bin', '/bin'].join(path.delimiter) };
const unstarted = run(rofl, ['ask', 'depends[code](F, G)', '@rules/js.files', 'w.rofl'], work, noPath);
said(unstarted.status === 5 && unstarted.stdout.includes('[partial: a scan failed') && unstarted.stderr.includes('a scan failed') && unstarted.stderr.includes('rofl: '),
  'FAULT the same world with no rofl on PATH: its scanner cannot start, the answer is partial (exit 5), the failure said', `exit ${unstarted.status}, ${JSON.stringify(unstarted.stdout)}, stderr ${JSON.stringify(unstarted.stderr.slice(0, 300))}`);

// what the command costs in front of the engine: one question from the kept world, ten times through it and ten times to the binary itself
const pkgDir = path.join(prefix, 'lib/node_modules/@grafema/rofl'), engineBin = path.join(prefix, `lib/node_modules/@grafema/rofl-${own}/bin/rofl`);
const same = ['ask', 'depends[code](F, G)', `@${path.join(pkgDir, 'rules/js.files')}`, 'code.rofl'];
const median = (cmd: string) => { const ms: number[] = []; for (let i = 0; i < 10; i++) { const t = performance.now(), r = run(cmd, same, work, env); ms.push(performance.now() - t); if (r.stdout !== rows) return NaN; } return ms.sort((x, y) => x - y)[5]; };
run(rofl, same, work, env);
const viaShim = median(rofl), viaBin = median(engineBin);
said(viaShim - viaBin < 250, 'the command in front of the engine, one kept-world question, median of 10', `${viaShim.toFixed(0)} ms through rofl, ${viaBin.toFixed(0)} ms to the binary itself: ${(viaShim - viaBin).toFixed(0)} ms more`);

// the notebook, copied out of the package
cpSync(path.join(pkgDir, 'examples/notebook'), path.join(work, 'nb'), { recursive: true });
const nb = run('rofl-nb', ['small.rofl.md'], path.join(work, 'nb'), env);
said(nb.status === 0 && /answers?/.test(nb.stdout), 'rofl-nb small.rofl.md (a notebook over small.js, model: js)', `exit ${nb.status}, ${nb.stdout.split('\n').length} lines${nb.status ? `: ${(nb.stdout + nb.stderr).slice(-300)}` : ''}`);

// the library, from a project of its own; and its rofl through npx
const proj = path.join(tmp, 'proj');
mkdirSync(proj);
writeFileSync(path.join(proj, 'package.json'), '{"name":"proj","private":true,"type":"module"}\n');
const local = run('npm', ['install', '--offline', path.join(DIST, main), path.join(DIST, plat)], proj, env);
const lib = run('node', ['--input-type=module', '-e', "const { Rofl } = await import('@grafema/rofl'); const r = new Rofl(); r.load('edge(a, b). edge(b, c). path(X, Y) :- edge(X, Y). path(X, Z) :- path(X, Y), edge(Y, Z).', 'p.rofl'); r.evaluate(); console.log(r.query('path(a, X)').rows.length);"], proj, env);
said(local.status === 0 && lib.status === 0 && lib.stdout === '2\n', "import('@grafema/rofl') in a project that installed the tarballs", `npm install exit ${local.status}, node exit ${lib.status}, ${JSON.stringify(lib.stdout + lib.stderr.slice(0, 300))}`);
// every file or directory the exports name is in the package; ./port imports; a TypeScript project gets the types
const installed = path.join(proj, 'node_modules/@grafema/rofl'), exported: Record<string, string | Record<string, string>> = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8')).exports;
const named = Object.values(exported).flatMap((e) => typeof e === 'string' ? [e] : Object.values(e)), missing = named.filter((f) => !existsSync(path.join(installed, f.split('*')[0])));
const port = run('node', ['--input-type=module', '-e', "console.log(Object.keys(await import('@grafema/rofl/port')).length > 0)"], proj, env);
said(missing.length === 0 && port.stdout === 'true\n', "every path the package's exports name is in it, and import('@grafema/rofl/port')", `${missing.length ? `missing ${missing.join(', ')}` : `${named.length} paths`}; port ${JSON.stringify(port.stdout + port.stderr.slice(0, 300))}`);
writeFileSync(path.join(proj, 'use.ts'), "import { Rofl } from '@grafema/rofl';\nexport const rows: number = new Rofl().query('path(a, X)').rows.length;\n");
writeFileSync(path.join(proj, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, module: 'nodenext', moduleResolution: 'nodenext', noEmit: true, skipLibCheck: true, types: [] }, files: ['use.ts'] }));
const typed = run(process.execPath, [path.join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', proj], proj, env);
said(typed.status === 0, "a TypeScript project's import of '@grafema/rofl' has its types (tsc --strict)", `exit ${typed.status}${typed.status ? `: ${typed.stdout.slice(0, 300)}` : ''}`);
const npx = run('npx', ['--no-install', 'rofl', 'ask', 'path(a, X)', path.join(work, 'world.rofl')], proj, env);
said(npx.status === 0 && npx.stdout === 'X = b\nX = c\n\n', 'npx rofl ask in that project', `exit ${npx.status}, ${JSON.stringify(npx.stdout + npx.stderr.slice(0, 300))}`);

// FAULT: no platform package
const bare = path.join(tmp, 'bare'), noPlat = install(bare, [main]);
const absent = run(path.join(bare, 'bin', 'rofl'), ['ask', 'path(a, X)', 'world.rofl'], work, user(bare));
said(noPlat.status === 0 && absent.status === 127 && absent.stderr.includes(`@grafema/rofl-${own}@${version} is missing`) && absent.stderr.includes(`npm install @grafema/rofl-${own}@${version}`),
  'FAULT no platform package: exit 127, naming the package to install', `install exit ${noPlat.status}; rofl exit ${absent.status}: ${absent.stderr.trim()}`);

// a copy of a tarball at another version, its manifest and files changed as `edit` says
const repacked = (tgz: string, v: string, edit: (dir: string, m: Record<string, any>) => void = () => {}) => {
  const dir = mkdtempSync(path.join(tmp, 'repack-')), pkg = path.join(dir, 'package'), pj = path.join(pkg, 'package.json');
  run('tar', ['-xzf', path.join(DIST, tgz), '-C', dir], tmp, env);
  const m = { ...JSON.parse(readFileSync(pj, 'utf8')), version: v };
  edit(pkg, m);
  writeFileSync(pj, JSON.stringify(m));
  const r = run('npm', ['pack', '--json', '--pack-destination', dir], pkg, env);
  return path.join(dir, JSON.parse(r.stdout)[0].filename);
};

// FAULT: a platform package of another version
const other = path.join(tmp, 'other'), otherTgz = repacked(plat, `${version}-other`);
const mixed = run('npm', ['install', '-g', '--offline', '--prefix', other, path.join(DIST, main), otherTgz], tmp, user(other));
const skew = run(path.join(other, 'bin', 'rofl'), ['ask', 'path(a, X)', 'world.rofl'], work, user(other));
said(mixed.status === 0 && skew.status === 127 && skew.stderr.includes(`@grafema/rofl-${own}@${version}-other, and this is @grafema/rofl@${version}`),
  'FAULT a platform package of another version: exit 127, naming both versions', `install exit ${mixed.status}; rofl exit ${skew.status}: ${skew.stderr.trim()}`);

// an upgrade: an older release installed, then this one over it into the same prefix, as `npm i -g @grafema/rofl@latest` does. The older engine
// is a script that says so and exits 3, so the run tells which binary answered
const old = `${version.replace(/^(\d+)\.(\d+)\.(\d+).*/, (_, a, b, c) => `${a}.${b}.${Number(c) > 0 ? Number(c) - 1 : 0}`)}-old`;
const oldMain = repacked(main, old, (_, m) => { m.optionalDependencies = Object.fromEntries(Object.keys(m.optionalDependencies).map((k) => [k, old])); });
const oldPlat = repacked(plat, old, (dir) => { const b = path.join(dir, 'bin/rofl'); writeFileSync(b, '#!/bin/sh\necho "the old engine" >&2\nexit 3\n'); chmodSync(b, 0o755); });
const up = path.join(tmp, 'up'), upEnv = user(up), upRofl = path.join(up, 'bin', 'rofl');
const installedOld = run('npm', ['install', '-g', '--offline', '--prefix', up, oldMain, oldPlat], tmp, upEnv), v0 = run(upRofl, ['--version'], work, upEnv), a0 = run(upRofl, ['ask', 'path(a, X)', 'world.rofl'], work, upEnv);
const installedNew = run('npm', ['install', '-g', '--offline', '--prefix', up, path.join(DIST, main), path.join(DIST, plat)], tmp, upEnv), v1 = run(upRofl, ['--version'], work, upEnv), a1 = run(upRofl, ['ask', 'path(a, X)', 'world.rofl'], work, upEnv);
said(installedOld.status === 0 && v0.stdout.startsWith(`rofl ${old} (`) && a0.status === 3 && a0.stderr.includes('the old engine')
  && installedNew.status === 0 && v1.stdout.startsWith(`rofl ${version} (`) && v1.stdout.includes(`@grafema/rofl-${own}`) && a1.status === 0 && a1.stdout === 'X = b\nX = c\n\n' && !a1.stderr.includes('the old engine'),
  `an upgrade from ${old} to ${version} in the same prefix runs the new engine`, `before: ${v0.stdout.trim()}, ask exit ${a0.status} ${a0.stderr.trim()}; after: ${v1.stdout.trim()}, ask exit ${a1.status} ${JSON.stringify(a1.stdout)}`);

// FAULT: a release tag of another version
const wrongTag = run('node', ['--experimental-strip-types', path.join(ROOT, 'scripts/npm_check.ts'), '--dist', DIST, '--tag', `rofl-nb-${version}.1`], ROOT, process.env);
const rightTag = run('node', ['--experimental-strip-types', path.join(ROOT, 'scripts/npm_check.ts'), '--dist', DIST, '--tag', `rofl-nb-${version}`], ROOT, process.env);
said(!rightTag.stdout.includes('the tag '), `the tag rofl-nb-${version} itself is not refused for its version`, rightTag.stdout.trim().split('\n').slice(0, 2).join(' '));
said(wrongTag.status === 1 && wrongTag.stdout.includes(`the tag rofl-nb-${version}.1 is version ${version}.1, and package.json is ${version}`), 'FAULT a tag of another version is refused before anything is published', wrongTag.stdout.trim().split('\n')[0]);

// FAULT: the engine killed by a signal, and the command killed while the engine runs (`rofl serve` waits on its input)
// its input is a FIFO this process holds open, not a pipe of the child: Node closes a child's pipes when the child exits, and an engine that
// outlived the command would then end at once on the end of its input, unseen
const fifo = path.join(tmp, 'serve.in');
run('mkfifo', [fifo], tmp, env);
const input = openSync(fifo, 'r+');
process.on('exit', () => closeSync(input));
const serving = () => new Promise<{ pid: number; exit: Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }> }>((ready) => {
  const p = spawn(rofl, ['serve'], { cwd: work, env, stdio: [input, 'ignore', 'pipe'] });
  let stderr = '';
  p.stderr!.on('data', (d) => { stderr += d; });
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }>((done) => p.on('exit', (code, signal) => done({ code, signal, stderr })));
  setTimeout(() => ready({ pid: p.pid!, exit }), 1500);
});
const engines = (pid: number) => run('ps', ['-axo', 'pid=,ppid=,comm='], tmp, env).stdout.split('\n').map((l) => l.trim().split(/\s+/)).filter(([p, pp, c]) => (Number(p) === pid || Number(pp) === pid) && (c === 'rofl' || c?.endsWith('/rofl'))).map(([p]) => Number(p));
{
  const s = await serving(), [engine] = engines(s.pid);
  if (engine) process.kill(engine, 'SIGKILL');
  const e = await s.exit;
  said(!!engine && (e.signal === 'SIGKILL' || e.code === 137), 'FAULT the engine killed by SIGKILL: the command ends by SIGKILL too', `engine pid ${engine} (the command's ${s.pid}${engine === s.pid ? ': the engine replaced it' : ''}), the command's exit ${e.code ?? e.signal}${e.stderr ? `, ${e.stderr.trim()}` : ''}`);
}
{
  const s = await serving(), [engine] = engines(s.pid);
  process.kill(s.pid, 'SIGTERM');
  const e = await s.exit;
  await new Promise((r) => setTimeout(r, 300));
  const leftover = engine ? engines(engine) : [], left = engine ? leftover.length : -1;
  for (const pid of leftover) process.kill(pid, 'SIGKILL');
  said(!!engine && left === 0 && (e.signal === 'SIGTERM' || e.code === 143), 'FAULT the command killed by SIGTERM: no engine is left running', `engine pid ${engine}, ${left} left, the command's exit ${e.code ?? e.signal}`);
}

console.log(`${bad.length ? `FAIL ${bad.length}: ${bad.join('; ')}` : 'ok'}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(bad.length ? 1 : 0);
