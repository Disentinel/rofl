// npm run test:nb:product — the notebook's gate over what runs around the kernel: the kept kernel (notebook/serve.ts) and its socket,
// the kept model under a cell edit (scripts/nb_layers.ts), each model harness (notebook/model.ts); and what a user meets first: --help,
// the tutorial, every notebook a world the goldens load. npm run test:nb is the kernel's; both run, in that order.
import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { worlds } from './goldens.ts';
import { check, cli, good, has, is, linked, mutate, node, planted, put, report, REVIEW, ROOT, spinning, spy, tmp, withCell, withNatural, type Out } from './nb_lib.ts';

const t0 = performance.now();
// a rule that climbs for ever
const runaway = path.join(tmp, 'runaway/runaway.rofl.md');
put(runaway, '```datalog\nn(0).\nn(Y) :- n(X), Y is X + 1.\n\n? n(5)\n```\n');

// the kept kernel (notebook/serve.ts) answers what a fresh process answers, after a cell edit, a code edit and a kill -9; and a daemon
// that keys its answer on the notebook's text alone, blind to the code, is caught by the same comparison
const staleRoot = linked('stale', 'notebook/serve.ts', mutate('notebook/serve.ts', /runFile\(file, kernel\)/, () => `(memo[file + readFileSync(file, 'utf8')] ??= runFile(file, kernel))`).replace(/^const ROOT/m, 'const memo: Record<string, ReturnType<typeof runFile>> = {};\nconst ROOT'));
const kept = async (name: string, root: string) => {
  const file = planted(name, 'small.rofl.md', (t) => t);
  const sock = path.join(tmp, `${name}.sock`), env = { ROFL_NB_DAEMON: '1', ROFL_NB_SOCKET: sock, ROFL_NB_IDLE: '60', ROFL_NB_CLAUDE: spy };
  const strip = (o: Out) => { try { const r = JSON.parse(o.stdout ?? ''); const loaded = !!r.ms.loaded; delete r.ms; return { r: `${o.code} ${JSON.stringify(r)}`, loaded }; } catch { return { r: o.out, loaded: undefined }; } };
  const step = async () => { const [d, p] = await Promise.all([cli([file, '--json'], env, root), cli([file, '--json'], {}, root)]); return { daemon: strip(d), fresh: strip(p) }; };
  const steps = [await step()];
  writeFileSync(file, withCell('never C is unawaited')(readFileSync(file, 'utf8'))); steps.push(await step());
  writeFileSync(path.join(path.dirname(file), 'small.js'), spinning); steps.push(await step());
  spawnSync('pkill', ['-9', '-f', sock]); steps.push(await step());
  spawnSync('pkill', ['-f', sock]);
  return steps;
};
const keptRuns = Promise.all([kept('kept', ROOT), kept('kept-stale', staleRoot)]);
// one daemon per tree: a run after an engine edit starts a new daemon, and the new one retires the old
const retired = (async () => {
  const root = linked('retire', 'notebook/front.ts', readFileSync(path.join(ROOT, 'notebook/front.ts'), 'utf8')), top = path.join(tmp, 'retire-tmp'), dir = path.join(top, `rofl-nb-${process.getuid!()}`);
  mkdirSync(top);
  const env = { ROFL_NB_DAEMON: '1', XDG_RUNTIME_DIR: top, ROFL_NB_IDLE: '60' }, serve = path.join(root, 'notebook/serve.ts');
  const live = () => `${spawnSync('pgrep', ['-f', serve], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean).length} daemons, sockets ${readdirSync(dir).filter((f) => f.endsWith('.sock')).length}`;
  await cli([REVIEW], env, root);
  const before = live();
  writeFileSync(path.join(root, 'notebook/front.ts'), readFileSync(path.join(ROOT, 'notebook/front.ts'), 'utf8') + '// edited\n');
  const second = await cli([REVIEW], env, root);
  await new Promise((r) => setTimeout(r, 1000));
  const after = live();
  spawnSync('pkill', ['-f', serve]);
  const log = (() => { try { return readFileSync(path.join(dir, 'daemon.log'), 'utf8'); } catch { return ''; } })();
  return { code: second.code, out: `before the edit: ${before}; after: ${after}${log.includes(': retired by a daemon of a newer engine') ? '; the old one said so in daemon.log' : `; daemon.log: ${log}`}`, stdout: second.stdout };
})();

// the daemon at its edges, one daemon in turn: a request that is not one, a file that is not a notebook, a runaway then a normal run,
// two notebooks in turn, and a run that outwaits ROFL_NB_TIMEOUT, after which the daemon is gone and the next run starts another
const edges = (async () => {
  const sock = path.join(tmp, 'edges.sock'), env = { ROFL_NB_DAEMON: '1', ROFL_NB_SOCKET: sock, ROFL_NB_IDLE: '60', ROFL_NB_LIMIT: '3' };
  const small = planted('edges', 'small.rofl.md', (t) => t), other = path.join(path.dirname(small), 'other.rofl.md');
  writeFileSync(other, withCell('never C is unawaited')(readFileSync(small, 'utf8')));
  const raw = (line: string) => new Promise<string>((done) => { const c = connect(sock); let s = ''; c.on('connect', () => c.end(line)); c.on('data', (d) => { s += d; }); c.on('close', () => done(s)); c.on('error', (e) => done(e.message)); });
  const first = await cli([REVIEW], env);
  const garbage = await raw('{not json\n'), notNb = await raw(JSON.stringify({ file: path.join(ROOT, 'README.md') }) + '\n');
  const climbed = await cli([runaway], env), after = await cli([REVIEW], env);
  const strip = (o: Out) => { try { const r = JSON.parse(o.stdout ?? ''); const ms = r.ms; delete r.ms; return { r: `${o.code} ${JSON.stringify(r)}`, loaded: ms.loaded as boolean, model: ms.model as string }; } catch { return { r: o.out, loaded: undefined, model: undefined }; } };
  // in a daemon of its own with the default limit: under load the edges' 3 s cuts the first evaluation short, and a model cut short is not kept
  const turns = { ...env, ROFL_NB_SOCKET: path.join(tmp, 'turns.sock'), ROFL_NB_LIMIT: '120' }, load = async (f: string) => strip(await cli([f, '--json'], turns));
  const inTurn = [await load(small), await load(other), await load(REVIEW), await load(small)], fresh = strip(await cli([other, '--json']));
  try { process.kill(Number(readFileSync(`${turns.ROFL_NB_SOCKET}.pid`, 'utf8'))); } catch { /* gone */ }
  const pid = Number(readFileSync(`${sock}.pid`, 'utf8'));
  const waited = await cli([runaway], { ...env, ROFL_NB_TIMEOUT: '1' });
  await new Promise((r) => setTimeout(r, 500));
  const alive = (() => { try { process.kill(pid, 0); return true; } catch { return false; } })();
  const next = await cli([REVIEW], env);
  try { process.kill(Number(readFileSync(`${sock}.pid`, 'utf8'))); } catch { /* gone */ }
  return { first, garbage, notNb, climbed, after, inTurn, fresh, waited, alive, next };
})();
// the socket's directory: made 0700 and the user's own; one others may enter, or a link, is refused and the run is in-process
const sockDirs = (async () => {
  const uid = process.getuid!(), top = mkdtempSync('/tmp/nbsock-'), own = path.join(top, 'fresh'), open = path.join(top, 'open'), link = path.join(top, 'link');
  mkdirSync(path.join(open, `rofl-nb-${uid}`), { recursive: true }); chmodSync(path.join(open, `rofl-nb-${uid}`), 0o755);
  mkdirSync(path.join(link, 'target'), { recursive: true, mode: 0o700 }); symlinkSync(path.join(link, 'target'), path.join(link, `rofl-nb-${uid}`));
  const run = (dir: string) => cli([REVIEW], { ROFL_NB_DAEMON: '1', XDG_RUNTIME_DIR: dir, ROFL_NB_IDLE: '60' });
  const [made, opened, linked2] = await Promise.all([own, open, link].map((d) => { mkdirSync(d, { recursive: true }); return run(d); }));
  const d = path.join(own, `rofl-nb-${uid}`), st = lstatSync(d), socks = (x: string) => readdirSync(x).filter((f) => f.endsWith('.sock')).length;
  for (const f of readdirSync(d)) if (f.endsWith('.pid')) try { process.kill(Number(readFileSync(path.join(d, f), 'utf8'))); } catch { /* gone */ }
  return { made, opened, linked: linked2, mode: st.mode & 0o777, owner: st.uid === uid, socks: [socks(d), socks(path.join(open, `rofl-nb-${uid}`)), socks(path.join(link, 'target'))] };
})();

// H3 on the command line: a harness that keeps tools refused, one whose login fails said; started now, read with the rest of H3
const noLogin = path.join(tmp, 'no-login.sh'); writeFileSync(noLogin, '#!/bin/sh\ncat > /dev/null\nprintf "\\033[91mError:\\033[0m Incorrect API key provided\\n" >&2\nexit 1\n'); chmodSync(noLogin, 0o755);
const h3cli = Promise.all([cli(['translate', planted('tr-refused', 'review.rofl.md', withNatural), '--model', 'codex'], { ROFL_NB_CODEX: good }), cli(['translate', planted('tr-auth', 'review.rofl.md', withNatural)], { ROFL_NB_HARNESS: 'opencode', ROFL_NB_OPENCODE: noLogin })]);
// what a newcomer meets, each where the output could mislead: a bare word where a name goes, the engine's words in a proof, a list the reader does not claim,
// a what-if counted as answers, a natural cell answered by a cell in another section, a note that calls a cell above "further down", a world with no cells
const newcomer = path.join(tmp, 'newcomer/newcomer.rofl.md'), world = path.join(tmp, 'newcomer/world.rofl.md');
put(newcomer, `---
model: none
---

Declared as facts:

- <a id="on_the_line"></a>A car X is on the line
- <a id="short_of"></a>A car X is short of a part P
- <a id="in_stock"></a>A part P is in stock
- <a id="to_be_painted"></a>A car X is to be painted a colour C

The cars:

- \`car\` is on the line.
- \`van\` is on the line.
- \`van\` is short of \`door\`.
- \`car\` is to be painted \`pink\`.
- bike is on the line.
- \`level 1\` is on the line.

> The quoted cars:

- \`bus\` is on the line.

<a id="comes_out"></a>A car X comes out a colour C if X is to be painted C and C is in stock.

A car X passes the gate if X leaves the line.

\`\`\`rofl
A car X leaves the line if X is on the line, unless X is short of some part.
? X leaves the line
never X comes out white
why \`car\` leaves the line
whynot \`cab\` is in stock
excise \`van\` is short of \`door\`
\`\`\`

\`\`\`natural
list the cars
\`\`\`

## Later

\`\`\`rofl
? X passes the gate
\`\`\`
`);
put(world, readFileSync(path.join(ROOT, 'examples/review.rofl.md'), 'utf8'));
const newcomerRuns = Promise.all([cli([newcomer]), cli([newcomer, '--timing']), cli([world]), cli(['vocab']), cli(['vocab', 'unawaited']), cli([planted('review-fails', 'review.rofl.md', withCell('never C is blocked by T'))])]);
const layering = node('scripts/nb_layers.ts', []);
const layered = await layering;
const [keptOk, keptStale] = await keptRuns;

check('a cell edit over kept code answers what the whole world answers (scripts/nb_layers.ts)', layered.code === 0 && /^same$/m.test(layered.out), layered);
for (const g of ['model', 'asked', 'kernel', 'why']) check(`  and with its ${g} guard spoilt, it does not`, new RegExp(`^--break ${g}: differ: ${g}$`, 'm').test(layered.out), layered);
check('the kept kernel answers what a fresh process answers: first run, a cell edit, a code edit, after kill -9', keptOk.every((s) => s.daemon.r === s.fresh.r) && keptOk[1].daemon.loaded === false && keptOk[0].fresh.r !== keptOk[1].fresh.r && keptOk[1].fresh.r !== keptOk[2].fresh.r, { code: 0, out: JSON.stringify(keptOk.map((s) => [s.daemon.loaded, s.daemon.r === s.fresh.r, s.daemon.r.slice(0, 300), s.fresh.r.slice(0, 300)])) });
check('  and a kept kernel blind to the code files, it does not', keptStale[2].daemon.r !== keptStale[2].fresh.r && keptStale[1].daemon.r === keptStale[1].fresh.r, { code: 0, out: JSON.stringify(keptStale.map((s) => s.daemon.r === s.fresh.r)) });
const e = await edges;
check('L2 a request that is not JSON is answered, and the daemon goes on', e.garbage.includes('not a request') && is(e.climbed, 3), { code: 0, out: e.garbage });
check('L3 the daemon refuses a file that is not a .rofl.md', e.notNb.includes('not a notebook') && !e.notNb.includes('result'), { code: 0, out: e.notNb.slice(0, 300) });
check('H2 through the daemon a runaway stops at the limit, exit 3, and the next run is right and quick', is(e.first, 0) && is(e.climbed, 3) && has(e.climbed, 'the budget ran out') && e.climbed.ms! < 20_000 && is(e.after, 0) && has(e.after, '`c2` is blocked by `platform`') && e.after.ms! < 5_000, { code: e.after.code, out: `${e.climbed.ms} ms, then ${e.after.ms} ms\n${e.climbed.out}\n${e.after.out}` });
check('M3 a second notebook over the same code loads no model and evaluates no code, and answers what a fresh process does; one over other code evicts it', !!e.inTurn[0].loaded && e.inTurn[0].model === 'evaluated' && !e.inTurn[1].loaded && e.inTurn[1].model === 'kept' && e.inTurn[1].r === e.fresh.r && !!e.inTurn[3].loaded && e.inTurn[3].model === 'evaluated',
  { code: 0, out: `loaded, model: ${e.inTurn.map((x) => `${x.loaded}, ${x.model}`).join(' · ')}; the same as fresh: ${e.inTurn[1].r === e.fresh.r}` });
check('H2 a daemon that outwaits ROFL_NB_TIMEOUT is killed and said, exit 2, and the next run starts another', is(e.waited, 2) && has(e.waited, 'gave no answer in 1 s and was stopped') && !e.alive && is(e.next, 0), { code: e.waited.code, out: `${e.alive ? 'still alive; ' : ''}${e.waited.out}\n${e.next.out}` });
const sd = await sockDirs;
check('M2 the socket directory is made 0700 and the user\'s; one open to others or a link is refused, the run in-process', sd.mode === 0o700 && sd.owner && sd.socks.join() === '1,0,0'
  && [sd.made, sd.opened, sd.linked].every((o) => is(o, 0)) && has(sd.opened, 'open to others (mode 755), so the kept kernel is not used') && has(sd.linked, 'not a directory, so the kept kernel is not used'), { code: 0, out: JSON.stringify({ ...sd, made: sd.made.out, opened: sd.opened.out, linked: sd.linked.out }) });
const retire = await retired;
check('an engine edit leaves one daemon per tree: the new one retires the old, which says so in daemon.log', retire.code === 0 && retire.out === 'before the edit: 1 daemons, sockets 1; after: 1 daemons, sockets 1; the old one said so in daemon.log', retire);

// H3 each harness (notebook/model.ts) against a fake of its binary that records how it was started: the flags that leave it no tools, a directory of
// its own, removed after, the answer read; one that keeps tools refused unless allowed, one that fails said in a line. Each isolation, spoilt, turns it red.
const ISOLATION: Record<string, string[]> = {
  claude: ['[--tools][]', '[--strict-mcp-config]', '[--setting-sources][]', '[--no-session-persistence]'],
  codex: ['[--disable][shell_tool]', '[--disable][unified_exec]', '[--ignore-user-config]', '[--ignore-rules]', '[-s][read-only]', '[-c][web_search="disabled"]', '[--disable][apps]', '[--disable][plugins]'],
  opencode: ['OPENCODE_CONFIG_CONTENT={"permission":{"*":"deny"}}', 'OPENCODE_DISABLE_PROJECT_CONFIG=1', 'OPENCODE_DISABLE_CLAUDE_CODE=1', 'XDG_CONFIG_HOME=$CWD', 'XDG_DATA_HOME=$CWD/data', '[--pure]'],
  pi: ['[--no-tools]', '[--no-extensions]', '[--no-skills]', '[--no-context-files]'],
  copilot: ['[--no-custom-instructions]', '[--disable-builtin-mcps]', '--excluded-tools=bash,', ',view,', ',web_fetch'],
  hermes: ['[--safe-mode]', '[--ignore-user-config]', '[--ignore-rules]', '[--toolsets][safe]'],
};
const KEEPS = ['codex', 'copilot', 'hermes'];
/** A fake harness in node, which leaves PWD as it was given (a shell would correct it): it records cwd, argv, the variables that isolate, stdin's length. */
const recorder = (tag: string, name: string, tail = "process.stdout.write('```rofl\\nnever M is unowned\\n```\\n')") => {
  const f = path.join(tmp, 'h3', tag, name);
  put(f, `#!/usr/bin/env node\nconst fs = require('fs'); let i = '';\nprocess.on('SIGTERM', () => process.exit(143));\nprocess.stdin.on('data', (d) => { i += d; }).on('end', () => {\n  const project = require('path').join(process.env.CLAUDE_CONFIG_DIR, 'projects', fs.realpathSync('.').replace(/[^a-zA-Z0-9]/g, '-'));\n  if (${JSON.stringify(name)} === 'claude') fs.mkdirSync(require('path').join(project, 'memory'), { recursive: true });\n  const env = Object.entries(process.env).filter(([k]) => /^(OPENCODE_|XDG_CONFIG_HOME|XDG_DATA_HOME|PWD$)/.test(k)).sort().map(([k, v]) => k + '=' + v).join(' ');\n  fs.writeFileSync(${JSON.stringify(f + '.rec')}, [fs.realpathSync('.'), process.argv.slice(2).map((a) => '[' + a + ']').join(''), env, i.length, fs.existsSync('data/opencode'), project].join('\\n'));\n  ${tail};\n});\n`);
  chmodSync(f, 0o755); return f;
};
// what claude leaves in its config folder: the fakes make it where claude does, and a call must leave nothing there
process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'claude-config');
mkdirSync(path.join(tmp, 'claude-config/projects'), { recursive: true });
async function harnesses(src: string, tag: string): Promise<string[]> {
  const f = path.join(tmp, 'h3', `model-${tag}.ts`);
  put(f, src);
  const m = await import(f), bad: string[] = [];
  for (const name of Object.keys(ISOLATION)) {
    const bin = recorder(tag, name), env = { ...process.env, [`ROFL_NB_${name.toUpperCase()}`]: bin, ROFL_NB_ALLOW_TOOLS: '' }, rec = `${bin}.rec`;
    rmSync(rec, { force: true });
    const refused = await m.llm(m.choose(name, env))('the prompt');
    if (KEEPS.includes(name) !== (!refused.ok && /cannot be run without tools.*ROFL_NB_ALLOW_TOOLS=1/.test(refused.error)) || KEEPS.includes(name) && existsSync(rec)) { bad.push(`${name}: ${KEEPS.includes(name) ? 'not refused' : 'refused'} without ROFL_NB_ALLOW_TOOLS: ${JSON.stringify(refused)}`); continue; }
    const allowed = { ...env, ROFL_NB_ALLOW_TOOLS: '1' };
    // a model name is one word: one that reads as a flag (a workspace could set it) is refused before anything starts
    for (const evil of ['--attach=http://127.0.0.1:1', '-f /etc/hosts', 'x --file=/etc/hosts']) {
      rmSync(rec, { force: true });
      const r = await m.llm(m.choose(`${name}:${evil}`, allowed))('the prompt');
      if (r.ok || !/is not a model name/.test(r.error) || existsSync(rec)) bad.push(`${name}: the model name ${JSON.stringify(evil)} was ${existsSync(rec) ? 'passed on' : 'not refused as a name'}: ${JSON.stringify(r)}`);
    }
    rmSync(rec, { force: true });
    const r = await m.llm(m.choose(`${name}:gpt-5.5`, allowed))('the prompt');
    const [cwd = '', argv = '', vars = '', bytes = '', data = '', project = ''] = existsSync(rec) ? readFileSync(rec, 'utf8').split('\n') : [];
    const seen = `${argv} ${vars.replaceAll(cwd.replace(/^\/private(?=\/var\/)/, ''), '$CWD').replaceAll(cwd, '$CWD')}`;
    const lacks = [...ISOLATION[name], 'PWD=$CWD '].filter((x) => !`${seen} `.includes(x));
    if (!r.ok || !r.text.includes('never M is unowned')) bad.push(`${name}: the answer was not read: ${JSON.stringify(r)}`);
    if (lacks.length) bad.push(`${name}: started without ${lacks.join(' ')}: ${argv} ${vars}`);
    if (!/\[(--model=|--model\]\[)gpt-5\.5\]/.test(argv)) bad.push(`${name}: the model name is not passed as the model: ${argv}`);
    if (name === 'claude' && existsSync(project)) bad.push(`claude: the empty project folder it makes in its config folder is left: ${project}`);
    if (name === 'opencode' && data !== 'true') bad.push('opencode: its data directory was not made in the call\'s directory');
    if (!cwd.startsWith(`${realpathSync(os.tmpdir())}/rofl-nb-model-`) || existsSync(cwd)) bad.push(`${name}: run in ${cwd}, ${existsSync(cwd) ? 'which is still there' : 'not a directory of its own'}`);
    if (Number(bytes) + Number(argv.includes('[the prompt]')) * 10 !== 10) bad.push(`${name}: the prompt went neither on stdin nor in argv once: ${bytes} bytes on stdin, ${argv}`);
  }
  const odd = ['constructor', '__proto__', 'toString'].map((n) => { try { return m.choose(n, process.env).error ?? 'chosen'; } catch (e) { return `threw ${(e as Error).message}`; } });
  if (!odd.every((e: string) => e.includes('is not a harness'))) bad.push(`a name an object has is not refused as a harness: ${odd.join(' | ')}`);
  const fail = recorder(tag, 'fails', "process.stderr.write('\\x1b[91mError:\\x1b[0m Incorrect API key provided\\n'); process.exit(1)"), quiet = recorder(tag, 'quiet', "process.stderr.write('Error: the free tier cannot be used here\\n')");
  const hang = recorder(tag, 'hang', 'setTimeout(() => {}, 60_000)');
  const [f1, f2] = await Promise.all([fail, quiet].map((b) => m.llm(m.choose('opencode', { ...process.env, ROFL_NB_OPENCODE: b }))('p')));
  const f3 = await m.llm(m.choose('opencode', { ...process.env, ROFL_NB_OPENCODE: hang, ROFL_NB_MODEL_TIMEOUT: '1' }))('p');
  if (f1.ok || f1.error !== 'opencode exited with 1: Error: Incorrect API key provided') bad.push(`a harness that fails is not said in one line: ${JSON.stringify(f1)}`);
  if (f2.ok || f2.error !== 'opencode printed nothing; on stderr: Error: the free tier cannot be used here') bad.push(`a harness that prints nothing and exits 0 is taken as an answer: ${JSON.stringify(f2)}`);
  if (f3.ok || !f3.error.startsWith('opencode gave no answer in 1 s')) bad.push(`a harness stopped at the limit, which exits 143 on its TERM, is not said as stopped: ${JSON.stringify(f3)}`);
  return bad;
}
const MODEL_SRC = readFileSync(path.join(ROOT, 'notebook/model.ts'), 'utf8');
const H3_BREAKS: [string, RegExp, string][] = [
  ['claude', /'--tools', '', /, ''], ['codex', /'shell_tool', /, ''], ['opencode', /\{"permission":\{"\*":"deny"\}\}/, '{}'], ['pi', /'--no-tools', /, ''],
  ['copilot', /'--no-custom-instructions', /, ''], ['hermes', /'--safe-mode', /, ''], ['refusal', /!allow && HARNESSES\[name\]\.keeps/, 'false'],
  ['cwd', /cwd: dir,/, 'cwd: os.tmpdir(),'], ['empty', /^ *if \(!out\.trim\(\)\).*$/m, ''],
  ['model name', /^ *if \(model && !\/.*$/m, ''], ['PWD', /PWD: dir, /, ''], ['opencode data', /, XDG_DATA_HOME: path\.join\(dir, 'data'\)/, ''],
  ['session', /, '--no-session-persistence'/, ''], ['claude leaves', /for \(const d of \[path\.join\(project, 'memory'\), project\]\)/, 'for (const d of [])'], ['timeout', /if \(p\.killed\)/, 'if (false)'], ['own names', /Object\.hasOwn\(HARNESSES, name\)/, 'HARNESSES[name]'],
];
const h3 = await harnesses(MODEL_SRC, 'as-is');
check('H3 every harness is started with the flags that leave it no tools, in a directory of its own, and its answer read; one that keeps tools is refused', !h3.length, { code: 0, out: h3.join('\n') });
const spoilt = await Promise.all(H3_BREAKS.map(([name, at, plant]) => {
  const src = MODEL_SRC.replace(at, plant);
  if (src === MODEL_SRC) throw new Error(`H3 ${name}: the planted defect did not apply`);
  return harnesses(src, name.replace(/ /g, '-'));
}));
H3_BREAKS.forEach(([name], k) => check(`  and with ${name} spoilt, it is red`, spoilt[k].length > 0));
const [refusedCli, failedCli] = await h3cli;
check('H3 translate with a harness that keeps tools is refused in one line, exit 2, nothing written', refusedCli.code === 2 && refusedCli.out.trim().split('\n').length === 1 && has(refusedCli, 'codex cannot be run without tools') && !readFileSync(path.join(tmp, 'tr-refused/examples/notebook/review.rofl.md'), 'utf8').includes('```rofl\nA module'), refusedCli);
check('H3 a harness that fails its login is said in a line, exit 2, the natural cell kept', failedCli.code === 2 && has(failedCli, 'translation failed: opencode exited with 1: Error: Incorrect API key provided') && readFileSync(path.join(tmp, 'tr-auth/examples/notebook/review.rofl.md'), 'utf8').includes('No change touches a module nobody owns.'), failedCli);

const [nc, ncTimed, wd, vocab, vocab0, fails] = await newcomerRuns;
check('N1 a bare word where a name goes says to put it in backticks, in a question and in a list', has(nc, 'never X comes out white: white is not a sentence word here: names go in backticks: `white`') && has(nc, 'bike is on the line: bike is not a sentence word here'), nc);
check('N2 a proof has no engine variable: a blank is some <noun>, a relation is its sentence', has(nc, 'not `car` is short of some part (nothing says so)') && has(nc, 'nothing says `cab` is in stock, and no rule concludes it') && !/\?\d|no rule concludes '/.test(nc.out), nc);
check('N3 a list the reader does not claim, and a name with a space, are said in the writer\'s words', has(nc, 'a list of facts goes under a plain line of its own ending in a colon') && has(nc, '`level 1` is not a name') && !/LIST|FACT|line \d+: expected/.test(nc.out), nc);
check('N4 an excise counts the lines that move, and they are not answers', has(nc, 'excise `van` is short of `door`  ->  2 lines move') && has(nc, '\n    ? X leaves the line: 1 -> 2\n      now also: `van` leaves the line'), nc);
check('N5 a natural cell is not answered by a cell in another section; a prose rule over a cell above it is not "further down"', has(nc, 'note: not translated yet') && !has(nc, 'further down'), nc);
check('N6 the last line counts what was asked and, off exit 0, says why and the code; timings only with --timing', is(nc, 2) && /: 2 questions answered, 2 explained, 1 what-if — not everything was read \(exit 2; see npm run nb -- --help\)$/.test(nc.stdout!.trim())
  && !/^load \d+ ms/m.test(nc.out) && /^load \d+ ms/m.test(ncTimed.out) && has(fails, '— FAILS at line '), nc);
check('N7 a world with no cells says so, exit 0', is(wd, 0) && has(wd, '0 cells: this is a world (facts and rules), not a notebook'), wd);
check('N8 vocab starts with a few sentences to start from, then by area; a word it lacks names the nearest', vocab.code === 0 && vocab.stdout!.startsWith('Start here') && has(vocab, 'are not listed here') && has(vocab, '\ncallgraph: resolution\n') && has(vocab, '\n  a call C resolves to a function F   (resolves)\n')
  && vocab0.code === 0 && has(vocab0, '0 sentences with "unawaited"') && /The nearest: [^\n]*await/.test(vocab0.out), vocab0);

// the first contact: what the tool is, a file that is not there, a file that is not a notebook
const [help, bare, nope, prose, helpEnv, ver, v] = await Promise.all([cli(['--help']), cli([]), cli(['nope.rofl.md']), cli(['README.md']), cli(['--help', 'env']), cli(['--version']), cli(['-v'])]);
const pkgVersion = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
check('C4 --version and -v print the version and exit 0', [ver, v].every((o) => o.code === 0 && o.stdout === `rofl-nb ${pkgVersion}\n`), ver);
check('C1 --help is the cheat sheet in 230 words, the tutorial first, exit 0; no arguments, the same and exit 2; the environment in --help env', help.code === 0 && help.out.startsWith('New here? Play examples/tutorial') && help.out.split(/\s+/).filter(Boolean).length <= 230
  && ['```natural', 'whynot `c3` comes out `pink`', 'never X leaves unpainted', 'excise', 'Exit  0', '--help env', 'review.rofl.md'].every((w) => has(help, w)) && !has(help, 'ROFL_NB_') && bare.code === 2 && has(bare, 'whynot')
  && helpEnv.code === 0 && ['ROFL_NB_LIMIT', 'ROFL_NB_MEMORY', 'ROFL_NB_DAEMON=0', 'ROFL_NB_TIMEOUT'].every((w) => has(helpEnv, w)), help);
check('C2 a notebook that is not there is named, exit 2', nope.code === 2 && has(nope, 'nope.rofl.md: no such file') && !has(nope, 'ENOENT'), nope);
check('C3 a file that is not a .rofl.md is refused in one line, exit 2', prose.code === 2 && has(prose, 'not a notebook') && prose.out.split('\n').filter((l) => l.includes('README.md')).length === 1, prose);
const worldNames = new Set(worlds().map((w) => w.name));   // it reads every notebook, 13 s: once, and not while a run's output is read, which it would reorder
check('a notebook is a world the goldens load, each of them', ['notebook_review', 'notebook_small', 'notebook_self', 'notebook_xdir', 'notebook_cjs', 'tutorial_1-what-ships', 'tutorial_6-in-your-words'].every((n) => worldNames.has(n)));

// the tutorial: each level as shipped is unsolved by its own goal, and its file under solutions/ solves it
const TUT = path.join(ROOT, 'examples/tutorial'), levels = readdirSync(TUT).filter((f) => /^\d-.*\.rofl\.md$/.test(f)).sort();
const UNSOLVED: Record<string, [number, string]> = {
  '1-what-ships.rofl.md': [1, 'never L is missing an answer  ->  FAILS · 1'], '2-paint-shop.rofl.md': [1, 'never X leaves unpainted  ->  FAILS · 2'],
  '3-missing-part.rofl.md': [1, 'never X is late  ->  FAILS · 1'], '4-late-delivery.rofl.md': [1, 'never L is missing an answer  ->  FAILS · 1'],
  '5-quality-gate.rofl.md': [1, 'never X slips through  ->  FAILS · 2'], '6-in-your-words.rofl.md': [2, 'never X is kept by mistake  ->  not asked: it rests on goes to its customer, which nothing defines'],
};
const played = await Promise.all(levels.flatMap((f) => [cli([path.join(TUT, f)]), cli([path.join(TUT, 'solutions', f)])]));
check('the tutorial has its six levels, each with a solution', levels.join() === Object.keys(UNSOLVED).join() && levels.every((f) => existsSync(path.join(TUT, 'solutions', f))), { code: 0, out: levels.join(' ') });
levels.forEach((f, k) => {
  const [start, solved] = [played[2 * k], played[2 * k + 1]], [code, says] = UNSOLVED[f] ?? [-1, ''];
  check(`tutorial ${f}: unsolved as shipped`, is(start, code) && has(start, says), start);
  check(`  and its solution solves it`, is(solved, 0), solved);
});

// pictures: each example of examples/visual through its backend, and a defect planted in each backend's module that its check must see
const VIS = (root: string, f: string) => path.join(root, 'examples/visual', f);
const drawMutant = (name: string, file: string, at: RegExp, plant: (m: string) => string) => linked(name, file, mutate(file, at, plant));
const PICTURE: [string, string[], (o: Out) => boolean][] = [
  ['graph: mermaid draws the failing never\'s cars red and the dangling link dashed', ['paint-shop.rofl.md'], (g) => is(g, 1) && has(g, 'draw graph  ->  8 marks, 3 links, 3 failing, 1 dangling') && has(g, 'm3 -.-> m5') && has(g, 'class m3 failing') && has(g, 'subgraph g0["shop"]')],
  ['graph: DOT carries the tags as colour and style, and the provenance as a tooltip', ['paint-shop.rofl.md', '--format', 'dot'], (d) => has(d, '"c3" -> "pink" [color="#b91c1c", style=dashed];') && has(d, 'tooltip="`c3` is on the line')],
  ['time: a Gantt chart, a lane per person, the alone slots crit', ['spat-thursday.rofl.md'], (t) => is(t, 1) && has(t, '  section kit') && has(t, '$alone(kit,1060) [alone, failing] :crit, ') && has(t, 'acme :t13, 1080, 1230')],
  ['time: messages draw as a sequence diagram, the unanswered call crossed', ['checkout-sequence.rofl.md'], (q) => is(q, 1) && has(q, 'sequenceDiagram') && has(q, 'p1-xp3: c3 [unanswered, failing] at 4') && has(q, 'p2->>p1: $reply(c2) at 3')],
  ['table: a Markdown table, the cells the audits name marked', ['coverage.rofl.md'], (m) => is(m, 1) && has(m, '| k_a [failing] | done | open [failing] |') && has(m, '| k_b | claimed | waived |')],
  ['argument: Argdown, a refutation as -, the grade and the unknown as hashtags', ['deploy-argument.rofl.md'], (a) => is(a, 0) && has(a, '[safe_to_ship] #contested\n      + <canary_clean>\n      - <incident_4711>') && has(a, '[cheap_to_run] #unknown')],
  ['frames: small multiples, a Gantt chart a day, a bar new against the day before', ['spat-week.rofl.md'], (w) => is(w, 1) && has(w, '    frame 4:') && has(w, 'acme [new] :active, ') && has(w, 'dentist [gone] :done, ')],
];
const picMutants: [string, string][] = [
  ['draw-flow', drawMutant('draw-flow', 'notebook/draw-graph.ts', /ts\.includes\('dangling'\) \|\| ts\.includes\('gone'\) \? '-\.->' : '-->'/, () => `'-->'`)],
  ['draw-dot', drawMutant('draw-dot', 'notebook/draw-graph.ts', /tip\.length && `tooltip=\$\{q\(tip\.join\('\\n'\)\)\}`/, () => `''`)],
  ['draw-gantt', drawMutant('draw-gantt', 'notebook/draw-time.ts', /m\?\.tags\.some\(\(t\) => t === 'failing' \|\| t === 'dangling'\) && 'crit'/, () => `false`)],
  ['draw-sequence', drawMutant('draw-sequence', 'notebook/draw-time.ts', /\(ts\.includes\('gone'\) \? '--x' : '-x'\)/, () => `'->>'`)],
  ['draw-table', drawMutant('draw-table', 'notebook/draw-table.ts', /\(tags\(r, c\)\.length \? ` \[\$\{tags\(r, c\)\.join\(', '\)\}\]` : ''\)/, () => `''`)],
  ['draw-argdown', drawMutant('draw-argdown', 'notebook/draw-argument.ts', /\$\{attack \? '-' : '\+'\}/, () => '+')],
  ['draw-frames', drawMutant('draw-frames', 'notebook/draw.ts', /if \(!of\.size\) return null;/, () => 'return null;')],
];
const picture = ([, [f, ...rest]]: typeof PICTURE[number], root: string) => cli([VIS(root, f), ...rest], {}, root);
// a what-if drawn: a retraction adds marks as well as removing them; a head close to a declared sentence is said
const visNb = (name: string, cells: string) => { const f = path.join(tmp, name, 'n.rofl.md'); put(f, readFileSync(VIS(ROOT, 'paint-shop.rofl.md'), 'utf8').replace('../../visual/graph.rofl.md', path.join(ROOT, 'visual/graph.rofl.md')) + cells); return f; };
// zoom: a shut group drawn as one mark with its count, and the same run with a zoom that never shuts
const zoomNb = visNb('draw-zoom', '\n```datalog\ncollapsed(shop).\n```\n'), zoomed = (o: Out) => has(o, 'm5["shop (3)"]') && has(o, 'm0 --> m5') && !has(o, '["blue"]');
const zoomOff = drawMutant('draw-zoom', 'notebook/draw.ts', /if \(!shut\.size\) return v;/, () => 'return v;');
const [pics, mutantPics, [whatIf, near, zoomRun, zoomBroken]] = await Promise.all([Promise.all(PICTURE.map((p) => picture(p, ROOT))), Promise.all(PICTURE.map((p, k) => picture(p, picMutants[k][1]))),
  Promise.all([cli([visNb('draw-excise', '\n```rofl\nexcise `blue` is in the paint shop\ndraw graph\n```\n')]), cli([visNb('draw-near', '\n<a id="car_node"></a>A car X is a node if X is on the line.\n\nA mark X is tagged a colour `red` if X is on the line.\n')]),
    cli([zoomNb]), cli([zoomNb], {}, zoomOff)])]);
check('draw: zoom, a shut group is one mark with its count, the links into it end at it', zoomed(zoomRun), zoomRun);
check('  and a zoom that never shuts (draw-zoom) turns it red', !zoomed(zoomBroken), zoomBroken);
PICTURE.forEach(([name, , ok], k) => {
  check(`draw ${name}`, ok(pics[k]), pics[k]);
  check(`  and a defect planted in its backend (${picMutants[k][0]}) turns it red`, !ok(mutantPics[k]), mutantPics[k]);
});
check('draw: an excise in the cell draws what goes and what comes', has(whatIf, '1 gone, 1 new') && has(whatIf, 'class m0 gone') && has(whatIf, 'class m1 new'), whatIf);
check('a head with an anchor, or a name beside a hole\'s noun, close to a declared sentence is said, naming it', has(near, 'makes a new relation, car_node, close to the declared sentence "a mark is a node" (node)') && has(near, 'makes a new relation, tagged_colour, close to the declared sentence "a mark is tagged a tag" (tagged)'), near);

report('checks around the kernel and what a user meets first', t0);
