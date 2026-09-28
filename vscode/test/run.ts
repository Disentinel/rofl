// npm run test:vscode — the extension in the installed VS Code, as it is and with the planted defect that proves one kernel, which must turn it red.
// `-- --mutants` codeline, marks, cells and lsp; `translate`, `revert`, `wrap`, `startup` and `stop` run by name, which keeps each run under two minutes; `-- --only` as it is and nothing else; `-- --break NAME` one planted defect.
import { runTests } from '@vscode/test-electron';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { vscodeLock } from './lock.ts';

const ROOT = new URL('../..', import.meta.url).pathname, EXT = path.join(ROOT, 'vscode');
const CODE = process.env.ROFL_VSCODE ?? '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const tmp = mkdtempSync(path.join(os.tmpdir(), 'rofl-vscode-'));
const made = new Set([tmp]);
process.on('exit', () => made.forEach((d) => rmSync(d, { recursive: true, force: true })));
// a VS Code left running would write its user dir back after the removal
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => { spawnSync('pkill', ['-9', '-f', tmp]); process.exit(1); });
vscodeLock();
const t0 = performance.now();
spawnSync(process.execPath, ['--experimental-strip-types', path.join(ROOT, 'scripts/renderer.ts')], { stdio: 'inherit' });   // the notebook renderer the extension declares

// The notebooks: review with a never planted to fail, review as it is, small with a function that calls itself.
const put = (to: string, text: string) => { mkdirSync(path.dirname(to), { recursive: true }); writeFileSync(to, text); return to; };
const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
put(path.join(tmp, 'nb/examples/review.rofl.md'), src('examples/review.rofl.md'));
const review = put(path.join(tmp, 'nb/examples/notebook/review.rofl.md'), `${src('examples/notebook/review.rofl.md')}\n\`\`\`rofl\nnever C is blocked by T\n\`\`\`\n`);
const small = put(path.join(tmp, 'nb/examples/notebook/small.rofl.md'), src('examples/notebook/small.rofl.md'));
const smallJs = put(path.join(tmp, 'nb/examples/notebook/small.js'), `${src('examples/notebook/small.js')}\nexport function spin(n) {\n  return n ? spin(n - 1) : 0;\n}\n`);

const broken = put(path.join(tmp, 'nb/examples/broken.rofl'), 'a(1).\nb(X) :- a(X).\nc(X) :- a(X) b(X).\n');
const late = put(path.join(tmp, 'nb/examples/late.rofl.md'), `${src('examples/review.rofl.md')}\nA change C is late if C touches a module M and M is frozen by a team T.\n`);
const runaway = put(path.join(tmp, 'nb/examples/notebook/runaway.rofl.md'), '```datalog\nn(0).\nn(Y) :- n(X), Y is X + 1.\n\n? n(5)\n```\n');
const natural = put(path.join(tmp, 'nb/examples/notebook/natural.rofl.md'), `${src('examples/notebook/review.rofl.md')}\n\`\`\`natural\nNo change touches a module nobody owns.\n\`\`\`\n\nA cell after it, which no edit of the cell above may take.\n`);
// the model: a question, a cell that does not read, or no answer until stopped when told to; the cell as a question once told something else; and else the cell as an invariant
const fake = put(path.join(tmp, 'claude.sh'), `#!/bin/sh
p=$(cat)
rule='A module M is unowned if some change touches M, unless some team owns M.'
case "$p" in
  *"The person says: ask me"*) echo 'Which modules count as owned?' ;;
  *"The person says: break it"*) printf '%s\\n' '\`\`\`rofl' 'A module M is gloriously unowned whenever nobody.' '\`\`\`' ;;
  *"The person says: wait"*) echo $$ > ${path.join(tmp, 'claude.pid')}; exec sleep 60 ;;
  *"The person says"*) printf '%s\\n' '\`\`\`rofl' "$rule" '' '? M is unowned' '\`\`\`' ;;
  *) printf '%s\\n' 'Here it is.' '\`\`\`rofl' "$rule" '' 'never M is unowned' '\`\`\`' ;;
esac
`);
chmodSync(fake, 0o755);

const cli = (file: string, out: string) => new Promise<string>((done) => {
  const p = spawn(process.execPath, ['--experimental-strip-types', path.join(ROOT, 'notebook/cli.ts'), file, '--json'], { env: { ...process.env, ROFL_NB_DAEMON: '0' } });
  let s = ''; p.stdout.on('data', (d) => { s += d; });
  p.on('close', () => done(put(out, s)));
});
// the pictures: each example of examples/visual beside the vocabularies it reads, and the kinds its cells draw
// each with a mark's status its picture must carry, and a fact of it whose why must say a sentence
// and a what-if: a cell that excises a fact and draws again, whose picture must tag a mark gone or new
// and frames: a datalog cell that puts its marks in frames 1 and 2, drawn as small multiples
// and zoom: facts that shut a group, which must draw as one mark with its count, and open when the extension zooms it as a click would
// and, for space, a point the renderer must report at the data's own position
type Visual = { f: string; kinds: string[]; fails?: string; status: [string, string]; why: [string, string]; whatif: [string, string, string]; frames: string; zoom?: [string, string, string, string]; laid?: string; below?: [string, string] };
const VISUAL: Visual[] = [
  { f: 'paint-shop', kinds: ['graph'], fails: 'never M is tagged `unpainted`', status: ['pink', 'dangling'], why: ['tagged(c3, unpainted)', '`c3` leaves unpainted'], whatif: ['excise `blue` is in the paint shop\ndraw graph', 'c1', 'new'], frames: 'frame(c1, 1). frame(c2, 1). frame(c3, 2). frame(c4, 2).', zoom: ['collapsed(shop).', 'shop', 'shop (3)', 'blue'] },
  { f: 'spat-thursday', kinds: ['time'], fails: 'never M is tagged `alone`', status: ['$alone(kit,1060)', 'failing'], why: ['during($alone(kit, 1060), 1060, 1080)', '`kit` is alone on `thu` at 1060'], whatif: ['excise moved(c_dentist, swim, w0831, wed, thu, 1020, 1080)\ndraw time', 'swim', 'gone'], frames: 'frame(work_am, 1). frame(work_pm, 2). frame(acme, 2).', zoom: ['lane_group(kit, children). lane_group(nico, children). collapsed(children).', 'children', 'children (2)', 'kit'] },
  { f: 'checkout-sequence', kinds: ['time'], fails: 'never C is unanswered', status: ['c3', 'failing'], why: ['message(c3, api, payments, 4)', '`c3` is sent by `api` to `payments` at 4'], whatif: ['excise `c3` is sent by `api` to `payments` at 4\ndraw time', 'c3', 'gone'], frames: 'frame(c1, 1). frame(c2, 1). frame(c3, 2).', zoom: ['lane_group(api, backend). lane_group(db, backend). collapsed(backend).', 'backend', 'backend (2)', 'db'] },
  { f: 'coverage', kinds: ['table'], fails: 'never unqueued(K, L)', status: ['k_a', 'failing'], why: ['value(k_a, l_y, open)', 'open_cell'], whatif: ['excise done(k_c, l_y, "test/c_y.test.ts")\ndraw table', 'k_c', 'new'], frames: 'frame(k_a, 1). frame(k_b, 2). frame(k_c, 2).' },
  { f: 'deploy-argument', kinds: ['argument', 'graph'], status: ['cheap_to_run', 'unknown'], why: ['link_tagged(incident_4711, safe_to_ship, attack)', 'refutes'], whatif: ['excise refutes[obs](incident_4711, safe_to_ship)\ndraw argument', 'incident_4711', 'gone'], frames: 'frame(bench_p99, 1). frame(canary_clean, 2). frame(incident_4711, 2).', zoom: ['inside(suite_green, evidence). inside(canary_clean, evidence). collapsed(evidence).', 'evidence', 'evidence (2)', 'suite_green'] },
  { f: 'rail-map', kinds: ['space'], fails: 'never S is stranded', status: ['rome', 'failing'], why: ['at(rome, 12, 42)', '`rome` stands at longitude 12 and latitude 42'], laid: 'at(rome, 12, 42).', below: ['rome', 'berlin'],
    whatif: ['excise `rome` stands at longitude 12 and latitude 42\ndraw space', 'rome', 'gone'], frames: 'frame(paris, 1). frame(madrid, 1). frame(berlin, 2).',
    zoom: ['corner(west, 1, -10, 38). corner(west, 2, 5, 38). corner(west, 3, 5, 50). corner(west, 4, -10, 50). inside(paris, west). inside(madrid, west). inside(lisbon, west). collapsed(west).', 'west', 'west (3)', 'paris'] },
  { f: 'office-plan', kinds: ['space'], fails: 'never D is homeless', status: ['d6', 'failing'], why: ['at(d6, 950, 200)', '`d6` stands at 950 200'], laid: 'at(d6, 950, 200).', below: ['d5', 'd1'],
    whatif: ['excise `d6` stands at 950 200\ndraw space', 'd6', 'gone'], frames: 'frame(d1, 1). frame(d4, 2).', zoom: ['collapsed(studio).', 'studio', 'studio (3)', 'd1'] },
  { f: 'wardley', kinds: ['space'], fails: 'never A is upside down', status: ['payments', 'failing'], why: ['at(payments, 70, 70)', '`payments` has evolved to 70 and is visible to 70'], laid: 'at(payments, 70, 70).', below: ['compute', 'payments'],
    whatif: ['excise `payments` needs `fraud_model`\ndraw space', 'payments', 'gone'], frames: 'frame(checkout, 1). frame(compute, 2).',
    zoom: ['corner(platform, 1, 75, 0). corner(platform, 2, 100, 0). corner(platform, 3, 100, 40). corner(platform, 4, 75, 40). inside(database, platform). inside(compute, platform). collapsed(platform).', 'platform', 'platform (2)', 'compute'] },
];
cpSync(path.join(ROOT, 'visual'), path.join(tmp, 'nb/visual'), { recursive: true });
for (const f of ['spat/spat.rofl', 'spat/week.example.rofl', 'visual/deploy-case.rofl']) put(path.join(tmp, 'nb/examples', f), src(`examples/${f}`));
for (const f of ['rules/inquiry/terminology.rofl', 'rules/inquiry/epistemic.rofl']) put(path.join(tmp, 'nb', f), src(f));
// the what-if and the frames go in one copy of each notebook, to keep the run under its two minutes
const whatifs = VISUAL.map(({ f, whatif: [cell], frames, zoom }) => put(path.join(tmp, `nb/examples/visual/${f}-whatif.rofl.md`), `${src(`examples/visual/${f}.rofl.md`)}\n\`\`\`rofl\n${cell}\n\`\`\`\n\n\`\`\`datalog\n${frames}\n${zoom?.[0] ?? ''}\n\`\`\`\n`));
// a pinned layout: Pin layout writes the facts, and a notebook that reads them draws its marks there
const pinned = put(path.join(tmp, 'nb/examples/visual/paint-pinned.rofl.md'), src('examples/visual/paint-shop.rofl.md').replace('  - ../../visual/graph.rofl.md', '  - ../../visual/graph.rofl.md\n  - paint-pinned.layout.rofl'));
const pictures = VISUAL.map(({ f }) => put(path.join(tmp, `nb/examples/visual/${f}.rofl.md`), src(`examples/visual/${f}.rofl.md`)));
const clean = path.join(ROOT, 'examples/notebook/review.rofl.md');
const [a, b, c, ...pics] = await Promise.all([cli(review, path.join(tmp, 'review.json')), cli(clean, path.join(tmp, 'clean.json')), cli(small, path.join(tmp, 'small.json')),
  ...pictures.map((f, k) => cli(f, path.join(tmp, `picture-${k}.json`))), ...whatifs.map((f, k) => cli(f, path.join(tmp, `whatif-${k}.json`)))]);
const cases = [
  { file: review, cli: a, fails: { text: 'never C is blocked by T' } },
  { file: clean, cli: b },
  { file: small, cli: c, fails: { text: 'never C recurses', code: [smallJs, 12] } },
  ...pictures.map((file, k) => ({ file, cli: pics[k], pictures: VISUAL[k].kinds, status: VISUAL[k].status, why: VISUAL[k].why, laid: VISUAL[k].laid, below: VISUAL[k].below, ...(VISUAL[k].fails && { fails: { text: VISUAL[k].fails } }) })),
  { file: pinned, pin: 'placed(c1, 300, 260).\n', fails: { text: VISUAL[0].fails! } },
  ...whatifs.map((file, k) => ({ file, cli: pics[VISUAL.length + k], pictures: [...VISUAL[k].kinds, VISUAL[k].whatif[0].split(' ').pop()!], status: VISUAL[k].status, why: VISUAL[k].why, compare: VISUAL[k].whatif.slice(1) as [string, string], frames: ['1', '2'], ...(VISUAL[k].zoom && { zoom: VISUAL[k].zoom!.slice(1) }), ...(VISUAL[k].fails && { fails: { text: VISUAL[k].fails } }) })),
];

// A planted defect is a copy of the extension beside it, one line changed; a pattern that no longer matches plants nothing, so it throws.
// Each runs the notebooks until the first that goes red; `codeline` only the one with code lines.
const BREAKS: Record<string, [string, RegExp, string, typeof cases?]> = {
  codeline: ['extension.ts', /Number\(at\.slice\(i \+ 1\)\) - 1/, 'Number(at.slice(i + 1))', cases.slice(2)],
  marks: ['extension.ts', /for \(const \[uri, ds\] of by\.values\(\)\) coll\.set\(uri, ds\);/, ''],
  cells: ['extension.ts', /r\.shown\.cells\[runs\.indexOf\(c\)\]/, 'r.shown.cells[runs.indexOf(c) + 1]'],
  translate: ['extension.ts', /await vscode\.workspace\.applyEdit\(edit\);/, ''],
  revert: ['extension.ts', /NotebookRange\(arg\.index, arg\.index \+ 1\)/, 'NotebookRange(natural.index, natural.index + 1)'],
  stop: ['extension.ts', / e\.token\.onCancellationRequested\(restart\);/, ''],
  startup: ['extension.ts', /void vscode\.window\.tabGroups\.close\(tab\)[^\n]*;/, ''],
  wrap: ['package.json', /"\[natural\]": \{ "editor\.wordWrap": "on" \}/, '"[natural]": {}'],
  lsp: ['lsp.ts', /else if \(m\.method === 'textDocument\/publishDiagnostics'\)/, "else if (m.method === 'none')"],
  picture: ['extension.ts', /\.\.\.\(s\.views \?\? \[\]\)\.map\(/, '...[].map(', cases.slice(3)],
  why: ['extension.ts', /ask<string>\('why', nb\.fsPath, literal\)/, "Promise.resolve('')", cases.slice(3)],
  placed: ['visual/out/pic-graph.js', /placed\.get\(c\.id\) \?\? /, '', cases.slice(3)],
  space: ['visual/out/pic-space.js', /const up = proj !== 'plan';/, 'const up = proj === \'plan\';', cases.slice(3)],
  zoom: ['visual/out/pictures.js', /const toggle = async \(g\) => \{ if \(!shut\.delete\(g\)\)/, 'const toggle = async (g) => { if (true)', cases.slice(3)],
  frames: ['visual/out/pictures.js', /frames = framesOf\(v\)/, 'frames = null', cases.slice(3)],
  pin: ['extension.ts', /writeFileSync\(file, facts\);/, "writeFileSync(file, '');", cases.slice(3)],
  prose: ['extension.ts', /metadata: c\.metadata \}\)\), metadata: nb\.metadata/, 'metadata: c.metadata })).filter((c) => c.kind === CODE), metadata: nb.metadata'],
};
// VS Code's language model: a copy of the extension that also declares one, which the suite registers and Translate must ask, the command-line model failing.
const LM: [string, RegExp, string] = ['package.json', /"configuration": \{/, '"languageModelChatProviders": [{ "vendor": "rofl-test", "displayName": "ROFL test" }],\n    "configuration": {'];
const failing = put(path.join(tmp, 'no-model.sh'), '#!/bin/sh\necho "the command-line model was asked" >&2\nexit 1\n');
chmodSync(failing, 0o755);
const bi = process.argv.indexOf('--break');
const variants = bi >= 0 ? [process.argv[bi + 1]] : process.argv.includes('--only') ? ['as it is'] : process.argv.includes('--lm') ? ['vscode lm'] : process.argv.includes('--mutants') ? ['codeline', 'marks', 'cells', 'lsp', 'picture', 'why', 'pin', 'placed', 'frames', 'zoom', 'space'] : ['as it is', 'prose', 'vscode lm'];
if (bi >= 0 && !BREAKS[variants[0]]) throw new Error(`--break takes one of ${Object.keys(BREAKS).join(', ')}`);

const one = async (v: string) => {
  const t = performance.now();
  let dir = EXT;
  if (BREAKS[v] || v === 'vscode lm') {
    const [file, at, plant] = BREAKS[v] ?? LM;
    dir = path.join(ROOT, `vscode-break-${v.replace(/ /g, '-')}`);
    made.add(dir);
    cpSync(EXT, dir, { recursive: true, filter: (s) => !s.includes('node_modules') });
    const text = readFileSync(path.join(EXT, file), 'utf8');
    if (!at.test(text)) throw new Error(`${v}: the planted defect did not apply`);
    writeFileSync(path.join(dir, file), text.replace(at, plant));
  }
  // each window its own copy of the notebooks, since the suite edits a code file under them
  const nb = path.join(tmp, `nb-${v.replace(/ /g, '-')}`), mine = (s: string) => s.split(path.join(tmp, 'nb') + '/').join(nb + '/');
  cpSync(path.join(tmp, 'nb'), nb, { recursive: true });
  // a workspace that names a model: only the person's own settings may, so this one must be ignored and VS Code's model asked
  if (v === 'vscode lm') put(path.join(nb, '.vscode/settings.json'), JSON.stringify({ 'rofl.model': 'claude' }));
  let red = '';
  // `--shot F`: the window screenshotted as each picture is drawn, F-<case>.png
  const shot = v === 'as it is' ? process.argv[process.argv.indexOf('--shot') + 1] : undefined, shooting = process.argv.includes('--shot') && shot ? setInterval(() => {
    for (let k = 0; k < cases.length; k++) if (existsSync(`${shot}-${k}.ready`) && !existsSync(`${shot}-${k}.done`)) { spawnSync('screencapture', ['-x', `${shot}-${k}.png`]); writeFileSync(`${shot}-${k}.done`, ''); }
  }, 300) : undefined;
  const report = path.join(tmp, `report-${v.replace(/ /g, '-')}`), log = createWriteStream(path.join(tmp, `${v.replace(/ /g, '-')}.log`));
  try {
    await runTests({
      vscodeExecutablePath: CODE, extensionDevelopmentPath: dir, extensionTestsPath: path.join(dir, 'test/suite.ts'),
      stdout: log, stderr: log,
      launchArgs: [nb, mine(review), '--extensions-dir', path.join(tmp, 'ext'), '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--user-data-dir', path.join(tmp, `user-${v.replace(/ /g, '-')}`)],
      extensionTestsEnv: { ROFL_NB_CASES: mine(JSON.stringify(BREAKS[v]?.[3] ?? cases)), ROFL_NB_REPORT: report, ROFL_NB_TRANSLATE: mine(natural), ROFL_NB_STARTUP: mine(review), ROFL_NB_RUNAWAY: mine(runaway), ROFL_NB_CLAUDE: v === 'vscode lm' ? failing : fake, ...(shooting && { ROFL_NB_SHOT: shot! }), ...(v === 'vscode lm' && { ROFL_NB_FAKE_LM: '1' }), ROFL_NB_PID: path.join(tmp, 'claude.pid'), ROFL_LSP_FILES: mine(JSON.stringify([broken, late])) },
    });
  } catch (e) { red = (() => { try { return readFileSync(report, 'utf8'); } catch { return ''; } })() || (e as Error).message; }
  finally { if (dir !== EXT) rmSync(dir, { recursive: true, force: true }); log.end(); clearInterval(shooting); }
  if (v === 'as it is') for (const l of readFileSync(path.join(tmp, 'as-it-is.log'), 'utf8').split('\n')) if (/: (run after .*: )?\d+ ms$/.test(l)) console.log(`     ${l.replace(tmp, '')}`);
  return { v, red, s: ((performance.now() - t) / 1000).toFixed(1) };
};
// Two at a time: each window loads the JS model, and more of them at once only share the same cores.
const results: Awaited<ReturnType<typeof one>>[] = [], queue = [...variants];
await Promise.all([0, 1].map(async () => { for (let v; (v = queue.shift()); ) results.push(await one(v)); }));

results.sort((x, y) => variants.indexOf(x.v) - variants.indexOf(y.v));
let failed = 0;
for (const { v, red, s } of results) {
  const ok = BREAKS[v] ? !!red : !red;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${!BREAKS[v] ? `${v}: green` : `planted "${v}": red`} (${s} s)${red ? `\n     ${red.replace(/\n/g, '\n     ')}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} VS Code runs as expected, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
