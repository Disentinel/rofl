// npm run test:nb:product — the notebook's gate over what runs around the kernel: the kept kernel (notebook/serve.ts) and its socket,
// the kept model under a cell edit (scripts/nb_layers.ts), each model harness (notebook/model.ts); and what a user meets first: --help,
// the tutorial, every notebook a world the goldens load. npm run test:nb is the kernel's; both run, in that order.
import { spawnSync } from 'node:child_process';
import { connect, createServer } from 'node:net';
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
  // a request copilot would get as one argument past Linux's 128 KB: refused before anything starts
  const big = recorder(tag, 'big'), bigRec = `${big}.rec`;
  // on Linux the argument itself throws E2BIG from spawn, which crashed translate
  const tooBig = await (async () => { try { return await m.llm(m.choose('copilot', { ...process.env, ROFL_NB_COPILOT: big, ROFL_NB_ALLOW_TOOLS: '1' }))('x'.repeat(200_000)); } catch (e) { return { ok: false, error: `threw ${(e as Error).message}` }; } })();
  if (tooBig.ok || !/takes the request as one argument, at most 100 KB/.test(tooBig.error) || existsSync(bigRec)) bad.push(`a 200 KB request was put in copilot's argv: ${JSON.stringify(tooBig).slice(0, 200)}`);
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
  ['argv cap', /  if \(args\.includes\(prompt\) && Buffer\.byteLength\(prompt\) > ARG_BYTES\) .*\n/, ''],
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
  ['space: GeoJSON, a station a Point at its longitude and latitude, the stranded one failing', ['rail-map.rofl.md'], (m) => is(m, 1) && geo(m).some((f) => f.properties.mark === 'rome' && f.geometry.coordinates.join() === '12,42' && f.properties.tags.includes('failing')) && geo(m).filter((f) => f.geometry.type === 'LineString').length === 6],
  ['notation: GEDCOM 7, a family its partners and its child', ['family-tree.rofl.md'], (g) => is(g, 1) && has(g, '    0 @F1@ FAM\n    1 HUSB @I1@\n    1 WIFE @I2@\n    1 CHIL @I4@\n') && has(g, '    0 TRLR')],
  ['architecture: architecture-beta, a store a database in its group, a call an edge', ['shop-architecture.rofl.md'], (o) => is(o, 1) && has(o, 'architecture-beta') && has(o, 'service c3(database)[orders_db] in g0') && has(o, 'c0:B --> T:c4')],
  ['state: a stateDiagram, the entry and a transition by its event', ['order-states.rofl.md'], (o) => is(o, 1) && has(o, '      [*] --> s1\n') && has(o, 's3 --> s4: refund')],
  ['process: a flowchart in lanes, a decision a diamond, an event a stadium', ['claim-process.rofl.md'], (o) => is(o, 1) && has(o, 'm3{"covered"}') && has(o, 'm4(["filed"])') && has(o, 'subgraph g1["clerk"]')],
  ['causal: a loop with each link signed', ['burnout-loop.rofl.md'], (o) => is(o, 1) && has(o, 'm0 -->|+| m1') && has(o, 'm5 -->|-| m1')],
  ['proof: the proof of a why as a tree, a given fact so tagged', ['claim-proof.rofl.md'], (o) => has(o, '    pay is reached\n      covered leads to pay\n        covered is followed by pay when yes [given]\n')],
  ['frames: small multiples, a Gantt chart a day, a bar new against the day before', ['spat-week.rofl.md'], (w) => is(w, 1) && has(w, '    frame 4:') && has(w, 'acme [new] :active, ') && has(w, 'dentist [gone] :done, ')],
];
const picMutants: [string, string][] = [
  ['draw-flow', drawMutant('draw-flow', 'notebook/draw-graph.ts', /ts\.includes\('dangling'\) \|\| ts\.includes\('gone'\) \? '-\.->' : '-->'/, () => `'-->'`)],
  ['draw-dot', drawMutant('draw-dot', 'notebook/draw-graph.ts', /tip\.length && `tooltip=\$\{q\(tip\.join\('\\n'\)\)\}`/, () => `''`)],
  ['draw-gantt', drawMutant('draw-gantt', 'notebook/draw-time.ts', /m\?\.tags\.some\(\(t\) => t === 'failing' \|\| t === 'dangling'\) && 'crit'/, () => `false`)],
  ['draw-sequence', drawMutant('draw-sequence', 'notebook/draw-time.ts', /\(ts\.includes\('gone'\) \? '--x' : '-x'\)/, () => `'->>'`)],
  ['draw-table', drawMutant('draw-table', 'notebook/draw-table.ts', /\(tags\(r, c\)\.length \? ` \[\$\{tags\(r, c\)\.join\(', '\)\}\]` : ''\)/, () => `''`)],
  ['draw-argdown', drawMutant('draw-argdown', 'notebook/draw-argument.ts', /\$\{attack \? '-' : '\+'\}/, () => '+')],
  ['draw-space', drawMutant('draw-space', 'notebook/draw-space.ts', /out\.set\(f\.args\[0\], \{ point: \[num\(f\.args\[1\]\), num\(f\.args\[2\]\)\] \}\)/, () => 'out.set(f.args[0], { point: [num(f.args[2]), num(f.args[1])] })')],
  ['draw-notation', drawMutant('draw-notation', 'notebook/draw-notation.ts', /out\.push\(`1 CHIL \$\{id\(c, 'I', people\)\}`\)/, () => '0')],
  ['draw-arch', drawMutant('draw-arch', 'notebook/draw-dialects.ts', /has\(v, m, 'database'\) \? 'database'/, () => "has(v, m, 'database') ? 'server'")],
  ['draw-state', drawMutant('draw-state', 'notebook/draw-dialects.ts', /if \(has\(v, m, 'initial'\)\) out\.push/, () => 'if (false) out.push')],
  ['draw-process', drawMutant('draw-process', 'notebook/draw-dialects.ts', /has\(v, m, 'decision'\) \? \['\{', '\}'\]/, () => "has(v, m, 'decision') ? ['[', ']']")],
  ['draw-causal', drawMutant('draw-causal', 'notebook/draw-dialects.ts', /negative: '-'/, () => "negative: '+'")],
  // the text a proof is written in (a mutant of proofView would not reach the run: playground/host.ts imports it from the tree itself)
  ['draw-proof', drawMutant('draw-proof', 'notebook/draw-proof.ts', /\$\{m\?\.tags\.length \? ` \[\$\{m\.tags\.join\(', '\)\}\]` : ''\}/, () => '')],
  ['draw-frames', drawMutant('draw-frames', 'notebook/draw.ts', /if \(!of\.size\) return null;/, () => 'return null;')],
];
/** The features of the GeoJSON a run printed. */
const geo = (o: Out): { geometry: { type: string; coordinates: number[] }; properties: { mark: string; tags: string[] } }[] => { try { return JSON.parse(/```json\n([\s\S]*?)\n\s*```/.exec((o.stdout ?? '').replace(/^    /gm, ''))![1]).features; } catch { return []; } };
const picture = ([, [f, ...rest]]: typeof PICTURE[number], root: string) => cli([VIS(root, f), ...rest], {}, root);
// a what-if drawn: a retraction adds marks as well as removing them; a head close to a declared sentence is said
const visNb = (name: string, cells: string) => { const f = path.join(tmp, name, 'n.rofl.md'); put(f, readFileSync(VIS(ROOT, 'paint-shop.rofl.md'), 'utf8') + cells); return f; };
// zoom: a shut group drawn as one mark with its count, and the same run with a zoom that never shuts
const zoomNb = visNb('draw-zoom', '\n```datalog\ncollapsed(shop).\n```\n'), zoomed = (o: Out) => has(o, 'm5["shop (3)"]') && has(o, 'm0 --> m5') && !has(o, '["blue"]');
const zoomOff = drawMutant('draw-zoom', 'notebook/draw.ts', /if \(!shut\.size\) return v;/, () => 'return v;');
// a proof's zoom: a shut fact is one mark with the count of the facts under it, and the same run with a proof whose group is not its subproof
const foldNb = path.join(tmp, 'draw-fold', 'n.rofl.md');
put(foldNb, readFileSync(VIS(ROOT, 'claim-proof.rofl.md'), 'utf8').replace('  - claim-process.rofl.md', `  - ${VIS(ROOT, 'claim-process.rofl.md')}`) + '\n```datalog\ncollapsed("reached(covered)").\n```\n');
const folded = (o: Out) => has(o, 'covered is reached (7) [unknown, collapsed]') && !has(o, 'check is reached');
const foldOff = drawMutant('draw-fold', 'notebook/draw.ts', /f\.rel === \(v\.kind === 'proof' \? 'link' : 'inside'\)/, () => "f.rel === 'inside'");
const [pics, mutantPics, [whatIf, near, zoomRun, zoomBroken, foldRun, foldBroken]] = await Promise.all([Promise.all(PICTURE.map((p) => picture(p, ROOT))), Promise.all(PICTURE.map((p, k) => picture(p, picMutants[k][1]))),
  Promise.all([cli([visNb('draw-excise', '\n```rofl\nexcise `blue` is in the paint shop\ndraw graph\n```\n')]), cli([visNb('draw-near', '\n<a id="car_node"></a>A car X is a node if X is on the line.\n\nA mark X is tagged a colour `red` if X is on the line.\n')]),
    cli([zoomNb]), cli([zoomNb], {}, zoomOff), cli([foldNb]), cli([foldNb], {}, foldOff)])]);
check('draw: zoom, a shut group is one mark with its count, the links into it end at it', zoomed(zoomRun), zoomRun);
check('  and a zoom that never shuts (draw-zoom) turns it red', !zoomed(zoomBroken), zoomBroken);
check('draw: a proof zoomed, a shut fact is one mark with the count of the facts it rests on', folded(foldRun), foldRun);
check('  and a proof whose group is not its subproof (draw-fold) turns it red', !folded(foldBroken), foldBroken);
PICTURE.forEach(([name, , ok], k) => {
  check(`draw ${name}`, ok(pics[k]), pics[k]);
  check(`  and a defect planted in its backend (${picMutants[k][0]}) turns it red`, !ok(mutantPics[k]), mutantPics[k]);
});
check('draw: an excise in the cell draws what goes and what comes', has(whatIf, '1 gone, 1 new') && has(whatIf, 'class m0 gone') && has(whatIf, 'class m1 new'), whatIf);
check('a head with an anchor, or a name beside a hole\'s noun, close to a declared sentence is said, naming it', has(near, 'makes a new relation, car_node, close to the declared sentence "a mark is a node" (node)') && has(near, 'makes a new relation, tagged_colour, close to the declared sentence "a mark is tagged a tag" (tagged)'), near);
// R the read protocol (notebook/reader.ts), driven by a fake model through the command line: it lists, greps, shows and asks the kernel over
// the notebook's workspace, in a git repository or a plain folder alike; what it may not read (outside the workspace, a link out of it, a file
// its .gitignore names, a build or package folder, a secret-looking name, a workspace that is home) is refused in a line and never reaches a
// prompt; the rounds and the bytes are bounded, and every read is said. Each guard, spoilt, turns it red for its own reason.
const proto = (name: string, git = true, config?: string) => {
  // the request names files by their last part: a.ts to be read, and two links, one out of the workspace and one onto the .env
  const nbFile = planted(name, 'review.rofl.md', withCell('No change touches a module nobody owns; see a.ts, link.ts and cfg.ts.', 'natural')), repo = path.join(tmp, name), run = (...a: string[]) => spawnSync('git', a, { cwd: repo });
  put(path.join(repo, 'src/a.ts'), 'export function alpha() {\n  return 1;\n}\n' + Array.from({ length: 400 }, (_, i) => `// filler line ${i} of a long file, to spend a small budget`).join('\n') + '\n');
  put(path.join(repo, 'src/long.txt'), `${'a'.repeat(40)}!\n`); put(path.join(repo, 'src/.github/ci.yml'), 'on: push\n');
  put(path.join(repo, '.env'), 'ENV_TOKEN_9f2\n'); put(path.join(repo, 'conf/.npmrc'), 'NPMRC_TOKEN_9f2\n'); put(path.join(repo, 'keys/id_rsa'), 'KEY_TOKEN_9f2\n'); put(path.join(repo, 'new.ts'), 'NEW_TOKEN_9f2\n');
  put(path.join(repo, 'ignored.ts'), 'IGNORED_TOKEN_9f2\n'); put(path.join(repo, 'other.ts'), 'OTHER_TOKEN_9f2\n');
  if (config) put(path.join(repo, '.rofl/read.rofl'), config); put(path.join(repo, 'node_modules/x.js'), 'MODULES_TOKEN_9f2\n'); put(path.join(repo, 'examples/PARENT.txt'), 'PARENT_TOKEN_9f2\n');
  // with git, node_modules is in the .gitignore as a repository has it; without, the default skip list must leave it out on its own
  put(path.join(repo, '.gitignore'), git ? 'ignored.ts\nnode_modules/\n' : 'ignored.ts\n');
  put(path.join(tmp, 'outside.txt'), 'OUTSIDE_TOKEN_9f2\n');
  symlinkSync('../../outside.txt', path.join(repo, 'src/link.ts')); symlinkSync('../.env', path.join(repo, 'src/cfg.ts'));
  if (!git) return nbFile;
  run('init', '-q'); run('add', '-f', 'examples', 'src', '.env', 'keys', 'conf');
  // another repository whose index tracks other.ts, for GIT_DIR and GIT_WORK_TREE to point at
  const other = `${repo}-other`; mkdirSync(other); spawnSync('git', ['init', '-q'], { cwd: other });
  spawnSync('git', ['add', '-f', 'examples', 'other.ts'], { cwd: repo, env: { ...process.env, GIT_DIR: path.join(other, '.git'), GIT_WORK_TREE: repo } });
  return nbFile;
};
const READS = ['list src/**', 'list **/*.yml', 'grep TOKEN_9f2', 'grep alpha', 'grep (a+)+$ src/*.txt', 'show src/a.ts:1-3', 'show src/a.ts:1-400', 'show new.ts', 'show ../outside.txt:1-1', 'show ../PARENT.txt', 'show .env', 'show ignored.ts', 'show node_modules/x.js', 'show src/link.ts', 'show keys/id_rsa', 'show conf/.npmrc', 'show other.ts', '? C is blocked by T'];
/** The fake: each prompt kept as prompt.N; the first answer is the requests, later ones the cell, or requests for ever with `forever`. */
const reader = (name: string, forever = false) => { const f = path.join(tmp, `${name}-model`), dir = path.join(tmp, `${name}-prompts`); mkdirSync(dir, { recursive: true }); put(f, `#!/usr/bin/env node
const fs = require('fs'); let i = '';
process.stdin.on('data', (d) => { i += d; }).on('end', () => {
  const n = fs.readdirSync(${JSON.stringify(dir)}).length + 1; fs.writeFileSync(${JSON.stringify(dir)} + '/prompt.' + n, i);
  const reads = process.env.ROFL_FAKE_MANY ? ['show src/a.ts:16-20', ...${JSON.stringify(READS)}, ...Array(30).fill('list src/**')] : ${JSON.stringify(READS)};
  if (process.env.ROFL_FAKE_WORDS) console.log('Which modules count as owned? I would look at this first:\\nshow src/a.ts:1-3');
  else if (n === 1 || (${forever} && n < 12)) console.log(reads.join('\\n'));
  else console.log('\`\`\`rofl\\nA module M is unowned if some change touches M, unless some team owns M.\\n\\nnever M is unowned\\n\`\`\`');
});
`); chmodSync(f, 0o755); return { f, prompts: () => readdirSync(dir).sort((a, b) => Number(a.split('.')[1]) - Number(b.split('.')[1])).map((x) => readFileSync(path.join(dir, x), 'utf8')) }; };
/** A run of translate over a planted workspace, from `cwd` (by default the workspace, which then is the boundary). */
const protoRun = (name: string, env: Record<string, string>, root: string, forever: boolean, git: boolean, cwd?: string, config?: string) => { const nb = proto(name, git, config), m = reader(name, forever); return cli(['translate', nb], { ROFL_NB_CLAUDE: m.f, ...env }, root, cwd ?? path.join(tmp, name)).then((o) => ({ o, prompts: m.prompts(), nb })); };
const readerSrc = readFileSync(path.join(ROOT, 'notebook/reader.ts'), 'utf8'), cliSrc = readFileSync(path.join(ROOT, 'notebook/cli.ts'), 'utf8');
// a PATH with node on it and no git: grep falls back to a search in a process of its own
const noGit = path.join(tmp, 'no-git-path'); mkdirSync(noGit); symlinkSync(process.execPath, path.join(noGit, 'node'));
const RUNS = ['plain', 'nogit', 'nobin', 'small', 'forever', 'home', 'above', 'sub', 'gitenv', 'words', 'config'];
/** Each planted defect, the runs that can see it (the rest are not run for it), and what the red must say: red for another reason is not its. */
const R_BREAKS: [string, string, [RegExp, string][], string[], string][] = [
  ['outside', 'notebook/reader.ts', [[/  if \(rel\.startsWith\('\.\.'\) \|\| path\.isAbsolute\(rel\)\) return .*\n/, '']], ['plain'], 'was not refused as outside the workspace'],
  ['secret', 'notebook/reader.ts', [[/export const SECRET = [\s\S]*?'i'\);/, 'export const SECRET = /$^/;']], ['nogit'], 'ENV_TOKEN reached a prompt'],
  ['secret list of 0adee37', 'notebook/reader.ts', [[/export const SECRET = [\s\S]*?'i'\);/, 'export const SECRET = /(^|\\/)(\\.env[^/]*|[^/]*\\.(pem|key|p12|pfx)|id_[^/]*|[^/]*credential[^/]*|[^/]*secret[^/]*)$/i;']], ['nogit'], 'NPMRC_TOKEN reached a prompt'],
  ['home refusal', 'notebook/reader.ts', [[/  if \(dir === home\) return .*\n/, '']], ['home'], 'a workspace that is the home directory was read'],
  ['refusal of an ancestor of home', 'notebook/reader.ts', [[/  if \(within\(dir, home\) \|\| path\.dirname\(dir\) === dir\) return .*\n/, '']], ['above'], 'a workspace that holds the home directory was read'],
  ['the boundary widened to its parent', 'notebook/reader.ts', [[/dir = realpathSync\(root \?\? path\.dirname\(nb\)\)/, 'dir = path.dirname(realpathSync(root ?? path.dirname(nb)))']], ['sub'], 'PARENT_TOKEN reached a prompt'],
  ['default skip list', 'notebook/reader.ts', [[/const SKIP = new Set\(\[.*\]\);/, 'const SKIP = new Set<string>();']], ['nogit'], 'MODULES_TOKEN reached a prompt'],
  ['the .gitignore', 'notebook/reader.ts', [[/  try \{ text = readFileSync\(path\.join\(root, '\.gitignore'\), 'utf8'\); \} catch \{ \/\* none \*\/ \}\n/, '']], ['nogit'], 'IGNORED_TOKEN reached a prompt'],
  ['listed', 'notebook/reader.ts', [[/  if \(!repo\.files\.has\(rel\)\) return .*\n/, '']], ['plain'], 'IGNORED_TOKEN reached a prompt'],
  ['grep path check', 'notebook/reader.ts', [[/const hits = g\.lines\.filter\(.*$/m, 'const hits = g.lines;']], ['plain'], 'reached a prompt'],
  ['grep time limit', 'notebook/reader.ts', [[/\], GREP_MS, 16 \* 2 \*\* 20\)/, '], undefined, 16 * 2 ** 20)']], ['small'], 'a grep stopped at its time limit does not say so'],
  ['grep empty said', 'notebook/reader.ts', [[/hits\.length \? fit\(hits, SHOWN\.grep, 'lines'\) : '\(no line matches\)'/, "fit(hits, SHOWN.grep, 'lines')"]], ['plain'], 'a catastrophic pattern was not answered as no match'],
  ['first prompt reads around the check', 'notebook/cli.ts', [[/const r = readTracked\(cx\.repo, w\);/, "const r = (() => { try { return { file: w, lines: readFileSync(path.join(cx.repo.root, w), 'utf8').split('\\n') }; } catch { return { refused: w }; } })();"]], ['plain'], 'ENV_TOKEN reached a prompt'],
  ['git environment', 'notebook/reader.ts', [[/, env: Object\.fromEntries\(.*$/m, ' });']], ['gitenv'], 'OTHER_TOKEN reached a prompt'],
  ['list skips dotfiles', 'notebook/reader.ts', [[/\.filter\(\(f\) => under\(arg, f\)\)/, '.filter((f) => path.matchesGlob(f, arg))']], ['plain'], 'list ** left out a dotfile'],
  ['requests among words', 'notebook/reader.ts', [[/return lines\.every\(\(l\) => (.*?)\) \? lines : \[\];/, "return lines.filter((l) => $1);"]], ['words'], 'words with a request line in them were taken as requests'],
  ['requests a round', 'notebook/cli.ts', [[/        if \(i >= PER_ROUND\) return .*\n/, '']], ['forever'], 'answered past the 20th'],
  ['work after the budget', 'notebook/cli.ts', [[/        if \(left <= 0\) return .*\n/, '']], ['small'], 'a request after the budget was spent was still answered'],
  ['bytes read of a file', 'notebook/reader.ts', [[/Math\.min\(size, FILE_BYTES\)/, 'size']], ['forever'], 'a file was read past its cap'],
  ['budget', 'notebook/reader.ts', [[/if \(used \+ l\.length \+ 1 > room\) break; /, '']], ['small'], 'bytes of reading were not held to'],
  ['rounds', 'notebook/cli.ts', [[/round <= ROUNDS; round\+\+/, 'round <= 99; round++']], ['forever'], 'was not stopped after 3 rounds'],
  ['logging', 'notebook/cli.ts', [[/reads\.push\(x\.read\); /, '']], ['plain'], 'the reads were not said'],
  // the workspace's .rofl/read.rofl, asked in this process (configs below): each of its guards
  ['regular files only', 'notebook/reader.ts', [[/  if \(!statSync\(real\)\.isFile\(\)\) return .*\n/, '']], ['config'], 'a socket was not refused as not a regular file'],
  ['CVS/Entries ignored', 'notebook/reader.ts', [[/  if \(by === 'cvs'\) \{\n/, "  if (by === 'cvs') { return new Set(files);\n"]], ['config'], 'a file CVS does not list was read'],
  ['the config allowed to widen', 'notebook/reader.ts', [[/new Set\(values\('readable\(F\)'\)\.filter\(\(f\) => floor\.has\(f\)\)\)/, "new Set(values('readable(F)'))"]], ['config'], 'a config re-allowed a skipped folder'],
  ['a prefix out of the workspace', 'notebook/reader.ts', [[/  if \(out !== undefined\) return .*\n/, '']], ['config'], 'was not refused as reaching out'],
  ['the command accepted from the workspace', 'notebook/reader.ts', [[/  if \(values\('untracked_command\(C\)'\)\.length\) return .*\n/, ''], [/tracked\(by\[0\], dir, listed, command\)/, "tracked(by[0], dir, listed, command ?? values('untracked_command(C)')[0])"]], ['config'], "the workspace's command ran"],
  ['a broken config read as none', 'notebook/reader.ts', [[/  if \(!loaded\[1\]\.ok\) return .*\n/, '']], ['config'], 'a config that does not load let files be read'],
];
/** The workspace's .rofl/read.rofl, asked of reader.ts under `root` in this process: what it narrows, what it may not do, and a broken one. */
async function configs(tag: string, root: string): Promise<string[]> {
  const { workspace, answer } = await import(path.join(root, 'notebook/reader.ts')) as typeof import('../notebook/reader.ts');
  const bad: string[] = [], ws = mkdtempSync(`/tmp/nbrd-${tag.replace(/\W/g, "").slice(0, 6)}-`), marker = path.join(ws, 'ran');
  try {
    put0(ws, 'n.rofl.md', 'x'); put0(ws, 'src/a.ts', 'A'); put0(ws, 'src/b.ts', 'B'); put0(ws, 'new.ts', 'N'); put0(ws, '.env', 'E'); put0(ws, 'node_modules/x.js', 'M');
    put0(ws, 'src/CVS/Entries', '/a.ts/1.1/Mon Jan  1 00:00:00 2024//\nD/sub////\n');
    const as = (config: string | null, command?: string) => {
      rmSync(path.join(ws, '.rofl'), { recursive: true, force: true });
      if (config !== null) put0(ws, '.rofl/read.rofl', config);
      return workspace(path.join(ws, 'n.rofl.md'), { root: ws, command });
    };
    const reads = (r: ReturnType<typeof as>, f: string) => !answer(r, `show ${f}`, 10_000, () => '').text.startsWith('refused');
    const none = as(null);
    if (!reads(none, 'src/a.ts') || !reads(none, 'new.ts') || reads(none, 'node_modules/x.js')) bad.push(`with no config, not the whole workspace less the skip list: ${[...none.files]}`);
    const narrow = as('read_prefix("src/").\n');
    if (!reads(narrow, 'src/a.ts') || reads(narrow, 'new.ts')) bad.push(`read_prefix("src/") did not narrow to src/: ${[...narrow.files]}`);
    const cvs = as('untracked_by(cvs).\n');
    if (!reads(cvs, 'src/a.ts')) bad.push(`a file CVS lists was not read: ${cvs.refused ?? [...cvs.files]}`);
    if (reads(cvs, 'src/b.ts') || reads(cvs, 'new.ts')) bad.push(`a file CVS does not list was read: ${[...cvs.files]}`);
    const mine = as('untracked_by(command).\n', "printf 'src/b.ts\\n'");
    if (!reads(mine, 'src/b.ts') || reads(mine, 'src/a.ts')) bad.push(`the person's own untracked command was not used: ${mine.refused ?? [...mine.files]}`);
    const theirs = as(`untracked_by(command).\nuntracked_command("touch ${marker}").\n`);
    if (existsSync(marker)) bad.push("the workspace's command ran");
    if (!theirs.refused?.includes('a workspace may not name a command') || theirs.files.size) bad.push(`a command named by the workspace was not refused: ${theirs.refused}`);
    for (const p of ['../', '/', 'src/../../']) { const w = as(`read_prefix("${p}").\n`); if (!w.refused?.includes('reaches out of the workspace')) bad.push(`read_prefix("${p}") was not refused as reaching out: ${w.refused ?? [...w.files]}`); }
    const env = as('file(".env"). readable(".env"). file("node_modules/x.js"). readable("node_modules/x.js").\n');
    if (reads(env, '.env')) bad.push('a config re-allowed .env');
    if (reads(env, 'node_modules/x.js')) bad.push('a config re-allowed a skipped folder');
    const broken = as('read_prefix(\n');
    if (!broken.refused?.includes('.rofl/read.rofl: line ') || broken.files.size || reads(broken, 'src/a.ts')) bad.push(`a config that does not load let files be read: ${broken.refused ?? [...broken.files]}`);
    const svn = as('untracked_by(svn).\n');
    if (!svn.refused?.includes('not built in')) bad.push(`untracked_by(svn) was not refused as not built in: ${svn.refused}`);
    // a socket, which is not a regular file: listed, and refused when asked for
    const sock = createServer().listen(path.join(ws, 's.sock'));
    await new Promise((done) => sock.once('listening', done));
    try { if (!answer(as(null), 'show s.sock', 10_000, () => '').text.includes('not a regular file')) bad.push('a socket was not refused as not a regular file'); }
    catch (e) { bad.push(`a socket was not refused as not a regular file: ${(e as Error).message}`); }
    finally { sock.close(); }
    return bad;
  } finally { rmSync(ws, { recursive: true, force: true }); }
}
const put0 = (ws: string, f: string, text: string) => { mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); writeFileSync(path.join(ws, f), text); };
const BANNED = ['OUTSIDE_TOKEN', 'ENV_TOKEN', 'KEY_TOKEN', 'NPMRC_TOKEN', 'IGNORED_TOKEN', 'MODULES_TOKEN'];
/** What is wrong with the runs of the protocol named in `runs`: empty when every guard held. */
async function protocol(tag: string, root = ROOT, runs = RUNS): Promise<string[]> {
  const bad: string[] = [];
  const env: Record<string, [Record<string, string>, boolean, boolean, string?, string?]> = {
    plain: [{}, false, true], small: [{ ROFL_NB_READ_BUDGET: '600', ROFL_NB_GREP_MS: '1' }, false, true], forever: [{ ROFL_NB_READ_ROUNDS: '3', ROFL_NB_READ_FILE_BYTES: '1000', ROFL_FAKE_MANY: '1' }, true, true],
    // a folder with no git, and one on a machine with no git, named by ROFL_NB_ROOT from elsewhere
    nogit: [{}, false, false], nobin: [{ PATH: noGit, ROFL_NB_ROOT: path.join(tmp, `proto-${tag}-nobin`) }, false, false, ROOT],
    // the workspace is the home directory, or holds it: nothing is read
    home: [{ HOME: path.join(tmp, `proto-${tag}-home`) }, false, true], above: [{ HOME: path.join(tmp, `proto-${tag}-above/src`) }, false, true],
    // run from elsewhere: the workspace is the notebook's own folder, and its parent is not read
    sub: [{}, false, true, ROOT],
    // a workspace that reads only what git tracks, with git's own variables pointing at another repository, whose index tracks other.ts
    gitenv: [{ GIT_DIR: path.join(tmp, `proto-${tag}-gitenv-other/.git`), GIT_WORK_TREE: path.join(tmp, `proto-${tag}-gitenv`) }, false, true, undefined, 'untracked_by(git).\n'],
    // an answer of words with one request line in it is words to the person, and nothing is read
    words: [{ ROFL_FAKE_WORDS: '1' }, false, true],
  };
  const got = Object.fromEntries(await Promise.all(runs.filter((k) => k !== 'config').map(async (k) => [k, await protoRun(`proto-${tag}-${k}`, env[k][0], root, env[k][1], env[k][2], env[k][3], env[k][4])] as const)));
  if (runs.includes('config')) bad.push(...await configs(tag, root));
  const at = (s: string, from: string, n = 200) => s.slice(s.indexOf(from), s.indexOf(from) + n);
  for (const [k, r] of Object.entries(got)) for (const token of [...BANNED, ...k === 'sub' ? ['PARENT_TOKEN'] : [], ...k === 'gitenv' ? ['OTHER_TOKEN'] : []]) if (r.prompts.join('\n').includes(`${token}_9f2`)) bad.push(`${token} reached a prompt in the ${k} run`);
  const { plain, nogit, nobin, small, forever, home, above, sub, words, gitenv } = got;
  // what git tracks is read, what it does not is not
  if (gitenv && (!(gitenv.prompts[1] ?? '').includes('1  export function alpha') || !(gitenv.prompts[1] ?? '').includes('refused: other.ts: not among the files read here') || !(gitenv.prompts[1] ?? '').includes('refused: new.ts: not among'))) bad.push(`untracked_by(git) did not read the tracked file and only it: ${at(gitenv.prompts[1] ?? '', '> show src/a.ts:1-3', 600)}`);
  for (const [r, why] of [[home, 'is'], [above, 'holds']] as const)
    if (r && (!(r.prompts[1] ?? '').includes(`refused: src/a.ts: the workspace ${why} the home directory`) || (r.prompts[1] ?? '').includes('1  export function alpha') || (r.prompts[0] ?? '').includes('export function alpha'))) bad.push(`a workspace that ${why === 'is' ? 'is' : 'holds'} the home directory was read: ${at(r.prompts[1] ?? '', '> show src/a.ts:1-3')}`);
  if (sub && (sub.prompts.join('\n').includes('export function alpha') || !(sub.prompts[1] ?? '').includes('refused: ../PARENT.txt: outside the workspace'))) bad.push(`the parent of the notebook's folder was read, run from elsewhere: ${at(sub.prompts[1] ?? '', '> show ../PARENT.txt')}`);
  if (words && (words.o.code !== 2 || !words.o.out.includes('answered in words, not with a cell') || words.prompts.length !== 1 || /read: [^\n]*src\/a\.ts:1-3(?!\d)/.test(words.o.out))) bad.push(`words with a request line in them were taken as requests: exit ${words.o.code}, ${words.prompts.length} calls`);
  for (const [k, r] of Object.entries({ plain, nogit, nobin })) {
    if (!r) continue;
    const second = r.prompts[1] ?? '';
    if (!(r.prompts[0] ?? '').includes('The files the request names:\nsrc/a.ts:\n1  export function alpha')) bad.push(`${k}: a file the request names by its last part was not read into the first prompt`);
    if (r.o.code !== 0 || !readFileSync(r.nb, 'utf8').includes('never M is unowned')) bad.push(`${k}: the cell after reading was not written: exit ${r.o.code}\n${r.o.out.slice(-600)}`);
    if (!second.includes('> list **/*.yml\nsrc/.github/ci.yml')) bad.push(`${k}: list ** left out a dotfile: ${at(second, '> list **/*.yml', 100)}`);
    if (!second.includes('1  export function alpha() {') || !second.includes('> list src/**\nsrc/.github/ci.yml\nsrc/a.ts') || !second.includes('> grep alpha\nsrc/a.ts:1: export function alpha() {') || !second.includes('`c2` is blocked by `platform`')) bad.push(`${k}: list, grep, show or ? did not answer: ${at(second, 'You asked:', 1500)}`);
    // a file git does not track, and does not ignore, is read
    if (!second.includes('> show new.ts\n1  NEW_TOKEN_9f2')) bad.push(`${k}: a new file not ignored was not read: ${at(second, '> show new.ts')}`);
    for (const [asked, why] of [['../outside.txt', 'outside the workspace'], ['.env', 'looks like a secret'], ['ignored.ts', 'not among the files read here'], ['node_modules/x.js', 'not among the files read here'], ['src/link.ts', 'outside the workspace'], ['keys/id_rsa', 'looks like a secret'], ['conf/.npmrc', 'looks like a secret']])
      if (!second.includes(`refused: ${asked}: ${why}`)) bad.push(`${k}: show ${asked} was not refused as ${why}`);
    // a pattern that backtracks for ever in JavaScript (2^40 steps on that line) is answered at once by git, and stopped at its limit without it
    if (!second.includes(`> grep (a+)+$ src/*.txt\n${k === 'nobin' ? 'refused: grep (a+)+$: timed out after 5 s' : '(no line matches)'}`)) bad.push(`${k}: a catastrophic pattern was not answered as no match: ${at(second, '> grep (a+)')}`);
    if (!/read: .*src\/a\.ts:1-3/.test(r.o.out) || !r.o.out.includes('list src/** (')) bad.push(`${k}: the reads were not said: ${r.o.out.slice(-800)}`);
  }
  if (small) {
    // a grep stopped at its limit is a refusal, not no match
    if (!small.prompts[1]?.includes('refused: grep TOKEN_9f2: timed out after 0.001 s')) bad.push(`a grep stopped at its time limit does not say so: ${at(small.prompts[1] ?? '', '> grep TOKEN')}`);
    // none is answered once the budget is spent: the kernel is not asked
    const s2 = small.prompts[1] ?? '';
    if (!s2.includes('> ? C is blocked by T\nrefused: the read budget is spent')) bad.push(`a request after the budget was spent was still answered: ${at(s2, '> ? C')}`);
    if (!s2.includes('the read budget is spent') || s2.length - (small.prompts[0] ?? '').length > 600 + 1700) bad.push(`600 bytes of reading were not held to: the second prompt grew by ${s2.length - (small.prompts[0] ?? '').length}`);
  }
  if (forever) {
    // a request past the 20th is not answered, and a file is read only to its cap
    const f2 = forever.prompts[1] ?? '';
    if (!f2.includes('> list src/**\n(not answered: at most 20 requests a round)')) bad.push('a round of 49 requests was answered past the 20th');
    if (!f2.includes('only its first 1000 are read')) bad.push(`a file was read past its cap: ${at(f2, '> show src/a.ts:16-20', 300)}`);
    if (forever.o.code !== 2 || !forever.o.out.includes('still asked to read after 3 rounds') || forever.prompts.length !== 4) bad.push(`a model that only reads was not stopped after 3 rounds: exit ${forever.o.code}, ${forever.prompts.length} calls`);
  }
  return bad;
}
const r0 = await protocol('as-is');
check('R the translator reads the notebook\'s workspace, with git or without, by list, grep, show and ?, as its .rofl/read.rofl narrows it (a prefix, CVS, git, the person\'s command); outside, a link out, ignored, skipped and secret-looking files, a workspace that is home, a config that widens, names a command or does not load, are refused; the rounds and bytes are bounded; each read is said', !r0.length, { code: 0, out: r0.join('\n') });
const rSpoilt = await Promise.all(R_BREAKS.map(([name, file, plants, runs]) => {
  const src = file.endsWith('reader.ts') ? readerSrc : cliSrc, spoilt = plants.reduce((t, [at, plant]) => { const u = t.replace(at, plant); if (u === t) throw new Error(`R ${name}: the planted defect did not apply`); return u; }, src);
  return protocol(name.replace(/ /g, '-'), linked(`reader-${name.replace(/ /g, '-')}`, file, spoilt), runs);
}));
R_BREAKS.forEach(([name, , , , why], k) => check(`  and with ${name} spoilt, it is red: ${why}`, rSpoilt[k].some((b) => b.includes(why)), { code: 0, out: rSpoilt[k].join('\n') || 'green' }));

// V a never that holds over nothing: a rule with an exception whose conditions find no row BECAUSE OF A CONSTANT that looks like a slip of a
// value its column holds (`platfrom` where there is `platform`, the name `exit` where the model holds the string "exit") cannot fail, whatever
// its exceptions say: the kernel says so and the never is blind, and translate refuses such a cell and asks again. A relation that is empty
// because the work is done (no open cell, no item `open` when all are `done`) is the answer, and stays plain, as does a never with no exception.
const VACUOUS = 'A change C is held back if C is blocked by `platfrom`, unless C is approved by some person.\n\nnever C is held back';
const vacCell = (root = ROOT, name = 'vac') => cli([planted(`${name}-${path.basename(root)}`, 'review.rofl.md', withCell(VACUOUS))], {}, root);
const vacModel = (name: string) => { const f = path.join(tmp, `${name}-model`), n = path.join(tmp, `${name}-count`); put(f, `#!/usr/bin/env node
const fs = require('fs'); let i = '';
process.stdin.on('data', (d) => { i += d; }).on('end', () => {
  fs.appendFileSync(${JSON.stringify(n)}, 'x'); const first = fs.readFileSync(${JSON.stringify(n)}, 'utf8').length === 1;
  console.log('\`\`\`rofl\\n' + (first ? ${JSON.stringify(VACUOUS)} : ${JSON.stringify(VACUOUS.replace('`platfrom`', '`platform`'))}) + '\\n\`\`\`');
});
`); chmodSync(f, 0o755); return f; };
const vacTranslate = (root = ROOT, name = 'vac-tr') => { const nb = planted(`${name}-${path.basename(root)}`, 'review.rofl.md', withNatural); return cli(['translate', nb], { ROFL_NB_CLAUDE: vacModel(`${name}-${path.basename(root)}`) }, root).then((o) => ({ o, text: readFileSync(nb, 'utf8') })); };
const vacOk = (o: Out) => is(o, 3) && has(o, 'never C is held back  ->  holds as far as it sees · holds over nothing: its condition') && has(o, '`platfrom` is not a value there, `platform` is');
const trOk = (t: { o: Out; text: string }) => t.o.code === 0 && t.text.includes('C is blocked by `platform`') && !t.text.includes('`platfrom`') && has(t.o, 'the first try read, and checks nothing (') && has(t.o, 'holds over nothing') && !has(t.o, 'did not read');
// with no exception, a condition that finds nothing is the answer, not a vacuous never
const PLAIN = 'A change C is held up if C is blocked by `platfrom`.\n\nnever C is held up';
const plainOk = (o: Out) => is(o, 0) && has(o, 'never C is held up  ->  holds\n');
// the top level's shapes: a misspelt team in the condition, and given by an equality; a join with no constant to blame
const EQ = (team: string) => `bad(T, X) :- owns(T, X), T = ${team}, X != auth.\n\nnever bad(T, X)`;
const JOIN = 'bad(X) :- owns(T, X), approved(X, P), X != auth.\n\nnever bad(X)';
// a work matrix at 100%: every item done, so no open cell and no item open; its audits are empty because the work is done
const MATRIX = '```datalog\nkind(k1). kind(k2). lens(l1).\nwork(w1). work(w2).\nstate(w1, done). state(w2, done).\ndone(K, L) :- kind(K), lens(L).\nclaims(w1, k1, l1). claims(w2, k2, l1).\ncell(K, L) :- kind(K), lens(L).\nopen_cell(K, L) :- cell(K, L), not done(K, L).\nclaimed(K, L) :- claims(W, K, L), not state(W, done).\nunqueued(K, L) :- open_cell(K, L), not claimed(K, L).\nclaims_some(W) :- claims(W, _, _).\nidle(W) :- state(W, open), not claims_some(W).\n\nnever unqueued(K, L)\nnever idle(W)\n```\n';
const matrixAt = (root = ROOT) => { const f = path.join(tmp, `vac-matrix-${path.basename(root)}/m.rofl.md`); put(f, MATRIX); return cli([f], {}, root); };
// codex's held-out cell, over a small file that calls process.exit: the member and the module as names where the model holds strings
const CODEX = 'A call C is a forbidden process exit if a call C calls the host member `exit` of `process` in a host H, C is a call site in F, and F differs from "index.js".\n\nnever C is a forbidden process exit';
const exiting = readFileSync(path.join(ROOT, 'examples/notebook/small.js'), 'utf8') + '\nexport function stop() {\n  process.exit(1);\n}\n';
const codexCell = (root = ROOT) => cli([planted(`vac-codex-${path.basename(root)}`, 'small.rofl.md', withCell(CODEX), [['examples/notebook/small.js', exiting]])], {}, root);
const vacRoots = {
  kernel: linked('root-vac-kernel', 'playground/host.ts', mutate('playground/host.ts', / \|\| a\.kind === 'never' && !q\.rows\.length && vacuous\(relOf\(a\.lit\)\)/, () => '')),
  gate: linked('root-vac-gate', 'notebook/cli.ts', mutate('notebook/cli.ts', /, \.\.\.silent, \.\.\.vacuous\]/, () => ', ...silent]')),
  excepts: linked('root-vac-excepts', 'playground/host.ts', mutate('playground/host.ts', / \|\| !rs\.some\(\(r\) => r\.excepts\)/, () => '')),
  eq: linked('root-vac-eq', 'playground/host.ts', mutate('playground/host.ts', /\[put\(b\.lit\)\]/, () => '[b.lit]')),
  near: linked('root-vac-near', 'playground/host.ts', mutate('playground/host.ts', /const v = near\(c, held\);\n\s*if \(!v\) continue;/, () => 'const v = \'something\';')),
};
const eqCell = (team: string, root = ROOT) => cli([planted(`vac-eq-${team}-${path.basename(root)}`, 'review.rofl.md', withCell(EQ(team), 'datalog'))], {}, root);
const [vac, vacAtom, vacTr, vacKernelOff, vacGateOff, plain0, plainOff, eqTypo, eqRight, eqOff, direct, join, matrix, matrixOff, codexV, codexOff] = await Promise.all([
  vacCell(), cli([planted('vac-atom', 'review.rofl.md', withCell(VACUOUS.replace('`platfrom`', '`platform`')))]), vacTranslate(), vacCell(vacRoots.kernel), vacTranslate(vacRoots.gate),
  cli([planted('vac-plain', 'review.rofl.md', withCell(PLAIN))]), cli([planted('vac-plain-off', 'review.rofl.md', withCell(PLAIN))], {}, vacRoots.excepts),
  eqCell('platfrom'), eqCell('platform'), eqCell('platfrom', vacRoots.eq), cli([planted('vac-direct', 'review.rofl.md', withCell('bad(X) :- owns(platfrom, X), X != auth.\n\nnever bad(X)', 'datalog'))]),
  cli([planted('vac-join', 'review.rofl.md', withCell(JOIN, 'datalog'))]), matrixAt(), matrixAt(vacRoots.near), codexCell(), codexCell(vacRoots.kernel)]);
const flagged = (o: Out) => is(o, 3) && has(o, 'holds over nothing: its condition');
check('V a constant that looks like a slip of a value its column holds holds over nothing, blind: in the rule, given by an equality, or a name where the model holds a string (codex\'s held-out cell)', vacOk(vac) && flagged(direct) && flagged(eqTypo) && flagged(codexV) && /`(exit|process)` is not a value there, "(exit|process)" is/.test(codexV.out), codexV);
check('  spelt right, the never is asked as usual', !has(vacAtom, 'holds over nothing') && is(eqRight, 1), eqRight);
check('  and with the kernel\'s note removed, the held-out cell is green', !has(codexOff, 'holds over nothing') && is(codexOff, 0) && !vacOk(vacKernelOff), codexOff);
check('  and with the equalities\' constants not put into the conditions, the equality case is green', !flagged(eqOff), eqOff);
check('V a work matrix at 100% holds plainly: no open cell and no open item are the work done, not a slip', is(matrix, 0) && !has(matrix, 'holds over nothing') && has(matrix, 'never idle(W)  ->  holds\n'), matrix);
check('  and with any constant not held counted as a slip, `open` where all are `done` is said to hold over nothing', has(matrixOff, 'holds over nothing'), matrixOff);
check('V a join with no constant to blame, and a never with no exception, hold plainly', is(join, 0) && !has(join, 'holds over nothing') && plainOk(plain0), join);
check('  and with the kernel asking it of every never, the one with no exception is said to hold over nothing', !plainOk(plainOff), plainOff);
check('V translate refuses a cell whose never holds over nothing and asks again; the second cell is written', trOk(vacTr), vacTr.o);
check('  and with the translator\'s gate removed, the vacuous cell is written', !trOk(vacGateOff), vacGateOff.o);

report('checks around the kernel and what a user meets first', t0);
