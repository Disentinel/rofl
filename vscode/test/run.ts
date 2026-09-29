// npm run test:vscode — the extension in the installed VS Code, as it is and with the planted defect that proves one kernel, which must turn it red.
// `-- --mutants` codeline, marks, cells and lsp; `translate`, `revert`, `wrap`, `startup` and `stop` run by name, which keeps each run under two minutes; `-- --only` as it is and nothing else; `-- --group core|pictures|whatif|forms` over one group of cases; `-- --planted` the two windows that are not as it is; `-- --break NAME` one planted defect.
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
type Visual = { look?: string; f: string; kinds: string[]; fails?: string; status: [string, string]; why: [string, string]; whatif?: [string, string, string]; frames?: string; notation?: string; zoom?: [string, string, string, string]; laid?: string; below?: [string, string] };
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
  { look: 'entry', f: 'order-states', kinds: ['state'], fails: 'never S is stuck', status: ['refund_pending', 'failing'], why: ['tagged(shipped, current)', 'is now in `shipped`'], whatif: ['excise `paid` moves to `refund_pending` on `refund`\ndraw state', 'refund_pending', 'gone'],
    frames: 'frame(cart, 1). frame(delivered, 2).', zoom: ['inside(paid, fulfilment). inside(shipped, fulfilment). collapsed(fulfilment).', 'fulfilment', 'fulfilment (2)', 'shipped'] },
  { look: 'down', f: 'shop-architecture', kinds: ['architecture'], fails: 'never A calls up to B', status: ['billing', 'failing'], why: ['link_tagged(billing, session, upward)', '`billing` calls up to `session`'], whatif: ['excise `billing` calls `session`\ndraw architecture', 'billing', 'gone'],
    frames: 'frame(customer, 1). frame(stripe, 2).', zoom: ['collapsed(shop).', 'shop', 'shop (5)', 'web'] },
  { look: 'bands', f: 'claim-process', kinds: ['process'], fails: 'never A is unreachable', status: ['appeal', 'failing'], why: ['link_tagged(covered, pay, yes)', '`covered` is followed by `pay` when `yes`'], whatif: ['excise `appeal` is followed by `review`\ndraw process', 'appeal', 'gone'],
    frames: 'frame(filed, 1). frame(closed, 2).', zoom: ['collapsed(manager).', 'manager', 'manager (2)', 'review'] },
  { look: 'ring', f: 'burnout-loop', kinds: ['causal'], fails: 'never an influence from A to B is unsigned', status: ['morale', 'failing'], why: ['link_tagged(overtime, backlog, negative)', '`overtime` lowers `backlog`'], whatif: ['excise `morale` moves `attrition`\ndraw causal', 'morale', 'gone'],
    frames: 'frame(overtime, 1). frame(attrition, 2).', zoom: ['inside(bugs, quality). inside(fatigue, quality). collapsed(quality).', 'quality', 'quality (2)', 'bugs'] },
  { look: 'up', f: 'claim-proof', kinds: ['proof'], status: ['next[main](check,covered)', 'unknown'], why: ['reached[main](pay)', '`covered` is reached'], whatif: ['why `pay` is reached\nexcise `covered` is followed by `pay` when `yes`\ndraw proof', 'next[main](covered,pay)', 'gone'],
    zoom: ['collapsed("reached(covered)").', 'reached[main](covered)', 'covered is reached (7)', 'check is reached'] },
  { f: 'family-tree', kinds: ['notation'], fails: 'never C is born before a parent', status: ['lena', 'failing'], why: ['child($family(boris, anna), lena)', '`lena` was born to `boris` and `anna`'], notation: 'ged' },
];
// the second wave, a draw kind each: only its what-if, which holds its picture's status, why, frames and zoom too, drawn by the renderer's module in that form
const FORMS: (Visual & { form: string })[] = [
  { f: 'outage-timeline', form: 'timeline', kinds: ['timeline'], fails: 'never A is late', status: ['error_alert', 'failing'], why: ['happens(error_alert, 11)', '`error_alert` happened at 11'], whatif: ['excise `error_alert` happened at 11\ndraw timeline', 'error_alert', 'gone'], frames: 'frame(deploy, 1). frame(errors_rise, 1). frame(acked, 2). frame(rollback, 2).' },
  { f: 'breaker-timing', form: 'timing', kinds: ['timing'], fails: 'never M is tagged `stuck`', status: ['$span(payments,4)', 'failing'], why: ['in_state($span(payments,4), open)', '`payments` was in `open` from 4 to 17'], whatif: ['excise `search` was in `open` from 9 to 14\ndraw timing', '$span(search,9)', 'gone'], frames: 'frame($span(payments,0), 1). frame($span(search,0), 1). frame($span(payments,19), 2). frame($span(search,22), 2).', zoom: ['lane_group(payments, breakers). lane_group(search, breakers). collapsed(breakers).', 'breakers', 'breakers (2)', 'payments'] },
  { f: 'suite-chart', form: 'chart', kinds: ['chart'], fails: 'never M is tagged `over_budget`', status: ['vscode', 'failing'], why: ['value(vscode, seconds, 142)', '`vscode` took 142 seconds'], whatif: ['excise `unit` took 11 seconds\ndraw chart', 'unit', 'gone'], frames: 'frame(hosts, 1). frame(unit, 1). frame(vscode, 2).' },
  { f: 'coverage-heatmap', form: 'heatmap', kinds: ['heatmap'], fails: 'never unqueued(K, L)', status: ['k_space', 'failing'], why: ['value(k_space, l_test, open)', 'open_cell'], whatif: ['excise done(k_graph, l_test, "test/graph.ts")\ndraw heatmap', 'k_graph', 'new'], frames: 'frame(k_graph, 1). frame(k_time, 1). frame(k_space, 2).' },
  { f: 'access-upset', form: 'upset', kinds: ['upset'], fails: 'never M is tagged `two_duties`', status: ['eli', 'failing'], why: ['value(eli, billing, yes)', '`eli` is in `billing`'], whatif: ['excise `hal` is in `audit`\ndraw upset', 'hal', 'gone'], frames: 'frame(ana, 1). frame(ben, 1). frame(eli, 2). frame(hal, 2).' },
  { f: 'oncall-euler', form: 'euler', kinds: ['euler'], fails: 'never M is tagged `overloaded`', status: ['fay', 'failing'], why: ['value(fay, web, yes)', '`fay` is on `web`'], whatif: ['excise `ana` is on `web`\ndraw euler', 'ana', 'gone'], frames: 'frame(ana, 1). frame(ben, 1). frame(fay, 2). frame(gus, 2).' },
  { f: 'shipping-decision', form: 'decision', kinds: ['decision'], fails: 'never M is tagged `gap`', status: ['r1', 'failing'], why: ['value(r1, free_shipping, x)', '`r1` does `free_shipping`'], whatif: ['excise `r2` does `free_shipping`\ndraw decision', 'r2', 'gone'], frames: 'frame(r1, 1). frame(r2, 1). frame(r3, 2).' },
];
cpSync(path.join(ROOT, 'visual'), path.join(tmp, 'nb/visual'), { recursive: true });
cpSync(path.join(ROOT, 'examples/visual'), path.join(tmp, 'nb/examples/visual'), { recursive: true });   // an example may read another (claim-proof reads claim-process)
for (const f of ['spat/spat.rofl', 'spat/week.example.rofl', 'visual/deploy-case.rofl']) put(path.join(tmp, 'nb/examples', f), src(`examples/${f}`));
for (const f of ['rules/inquiry/terminology.rofl', 'rules/inquiry/epistemic.rofl']) put(path.join(tmp, 'nb', f), src(f));
// the what-if and the frames go in one copy of each notebook, to keep the run under its two minutes
const WHATIF: Visual[] = [...VISUAL.filter((x) => x.whatif), ...FORMS];
const whatifs = WHATIF.map(({ f, whatif, frames, zoom }) => put(path.join(tmp, `nb/examples/visual/${f}-whatif.rofl.md`), `${src(`examples/visual/${f}.rofl.md`)}\n\`\`\`rofl\n${whatif![0]}\n\`\`\`\n${frames || zoom ? `\n\`\`\`datalog\n${frames ?? ''}\n${zoom?.[0] ?? ''}\n\`\`\`\n` : ''}`));
// a pinned layout: Pin layout writes the facts, and a notebook that reads them draws its marks there
const pinned = put(path.join(tmp, 'nb/examples/visual/paint-pinned.rofl.md'), src('examples/visual/paint-shop.rofl.md').replace('  - rofl:visual/graph.rofl.md', '  - rofl:visual/graph.rofl.md\n  - paint-pinned.layout.rofl'));
// a dialect is held to everything in its what-if copy alone, whose first picture is the notebook's own: one window less a dialect keeps test:vscode under two minutes
const based = VISUAL.filter((x) => !x.look), pictures = based.map(({ f }) => put(path.join(tmp, `nb/examples/visual/${f}.rofl.md`), src(`examples/visual/${f}.rofl.md`)));
const clean = path.join(ROOT, 'examples/notebook/review.rofl.md');
const cases = [
  { file: review, cli: path.join(tmp, 'review.json'), fails: { text: 'never C is blocked by T' } },
  { file: clean, cli: path.join(tmp, 'clean.json') },
  { file: small, cli: path.join(tmp, 'small.json'), fails: { text: 'never C recurses', code: [smallJs, 12] } },
  ...pictures.map((file, k) => ({ file, cli: path.join(tmp, `picture-${k}.json`), pictures: based[k].kinds, status: based[k].status, why: based[k].why, laid: based[k].laid, below: based[k].below, notation: based[k].notation, look: based[k].look, ...(based[k].fails && { fails: { text: based[k].fails } }) })),
  { file: pinned, pin: 'placed(c1, 300, 260).\n', fails: { text: VISUAL[0].fails! } },
  ...whatifs.map((file, k) => { const x = WHATIF[k]; return { file, cli: path.join(tmp, `whatif-${k}.json`), pictures: [...x.kinds, x.whatif![0].split(' ').pop()!], status: x.status, why: x.why, compare: x.whatif!.slice(1) as [string, string], ...(x.frames && { frames: ['1', '2'] }), look: x.look, ...(x.zoom && { zoom: x.zoom.slice(1) }), ...(x.fails && { fails: { text: x.fails } }), ...('form' in x && { form: x.form as string }) }; }),
];
// `--group`: the run as it is over one group of cases, each window under two minutes; `core` also holds the checks that are not a case
const GROUPS: Record<string, typeof cases> = {
  core: cases.filter((c) => !('pictures' in c) && !('pin' in c)),
  pictures: cases.filter((c) => ('pictures' in c || 'pin' in c) && !('compare' in c)),
  whatif: cases.filter((c) => 'compare' in c && !('form' in c)),
  forms: cases.filter((c) => 'form' in c),
};
const gi = process.argv.indexOf('--group'), group = gi >= 0 ? process.argv[gi + 1] : undefined;
if (group !== undefined && !GROUPS[group]) throw new Error(`--group takes one of ${Object.keys(GROUPS).join(', ')}`);

// A planted defect is a copy of the extension beside it, one line changed; a pattern that no longer matches plants nothing, so it throws.
// Each runs the notebooks until the first that goes red; `codeline` only the one with code lines.
const of = (form: string) => cases.filter((c) => 'form' in c && c.form === form);
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
  // a dialect's look, planted in the built renderer: each must turn its own case red
  'd-arch': ['visual/out/pic-dialects.js', /direction: 'DOWN'/, "direction: 'RIGHT'", cases.filter((c) => c.file.includes('shop-architecture'))],
  'd-state': ['visual/out/pic-dialects.js', /entry: 'initial'/, "entry: 'none'", cases.filter((c) => c.file.includes('order-states'))],
  'd-proc': ['visual/out/pic-dialects.js', /bands: true/, 'bands: false', cases.filter((c) => c.file.includes('claim-process'))],
  'd-loop': ['visual/out/pic-dialects.js', /ring: true/, 'ring: false', cases.filter((c) => c.file.includes('burnout-loop'))],
  'd-proof': ['visual/out/pic-dialects.js', /direction: 'UP'/, "direction: 'DOWN'", cases.filter((c) => c.file.includes('claim-proof'))],
  'd-fold': ['visual/out/draw.js', /f\.rel === \(v\.kind === 'proof' \? 'link' : 'inside'\)/, "f.rel === 'inside'", cases.filter((c) => c.file.includes('claim-proof'))],
  space: ['visual/out/pic-space.js', /const up = proj !== 'plan';/, 'const up = proj === \'plan\';', cases.slice(3)],
  notation: ['extension.ts', /besideNotebook\(nb, `\.\$\{ext\.replace\(\/\\W\/g, ''\)\}`, text\)/, "besideNotebook(nb, '.txt', text)", cases.slice(3)],
  zoom: ['visual/out/pictures.js', /const toggle = async \(g\) => \{ if \(!shut\.delete\(g\)\)/, 'const toggle = async (g) => { if (true)', cases.slice(3)],
  frames: ['visual/out/pictures.js', /frames = framesOf\(z\)/, 'frames = null', cases.slice(3)],
  pin: ['extension.ts', /writeFileSync\(file, text\);/, "writeFileSync(file, '');", cases.slice(3)],
  // a form's status class dropped from the element the renderer draws its mark with, each run on that form's what-if alone
  timeline: ['visual/pic-moments.ts', /class="\$\{cls\(v, e\.id\)\}" cx=/, 'class="" cx=', of('timeline')],
  timing: ['visual/pic-moments.ts', /class="\$\{cls\(v, s\.id\)\}" x=/, 'class="" x=', of('timing')],
  chart: ['visual/pic-charts.ts', /\? `<rect data-mark="\$\{esc\(p\.id\)\}" class="\$\{esc\(tagsOf\(v, p\.id\)\.join\(' '\)\)\}"/, '? `<rect data-mark="${esc(p.id)}" class=""', of('chart')],
  heatmap: ['visual/pic-charts.ts', /cls = \(ts: string\[\]\) => esc\(ts\.join\(' '\)\)/, "cls = (ts: string[]) => ''", of('heatmap')],
  upset: ['visual/pic-charts.ts', /g\.rows\.slice\(0, MAX\)\.map\(\(r, k\) => chip\(v, r, x, under \+ k \* 18 \+ 10\)\)\.join\(''\)/, "''", of('upset')],
  euler: ['visual/pic-charts.ts', /g\.rows\.forEach\(\(row, k\) => out\.push\(chip\(/, 'g.rows.forEach((row, k) => void (chip(', of('euler')],
  decision: ['visual/pic-charts.ts', /<th data-mark="\$\{esc\(r\)\}" class="\$\{esc\(tagsOf\(v, r\)\.join\(' '\)\)\}">/, '<th data-mark="${esc(r)}" class="">', of('decision')],
  prose: ['extension.ts', /metadata: c\.metadata \}\)\), metadata: nb\.metadata/, 'metadata: c.metadata })).filter((c) => c.kind === CODE), metadata: nb.metadata'],
};
// VS Code's language model: a copy of the extension that also declares one, which the suite registers and Translate must ask, the command-line model failing.
const LM: [string, RegExp, string] = ['package.json', /"configuration": \{/, '"languageModelChatProviders": [{ "vendor": "rofl-test", "displayName": "ROFL test" }],\n    "configuration": {'];
const failing = put(path.join(tmp, 'no-model.sh'), '#!/bin/sh\necho "the command-line model was asked" >&2\nexit 1\n');
chmodSync(failing, 0o755);
const bi = process.argv.indexOf('--break');
const variants = bi >= 0 ? [process.argv[bi + 1]] : process.argv.includes('--only') ? ['as it is'] : process.argv.includes('--lm') ? ['vscode lm'] : process.argv.includes('--planted') ? ['prose', 'vscode lm'] : process.argv.includes('--mutants') ? ['codeline', 'marks', 'cells', 'lsp', 'picture', 'why', 'pin', 'placed', 'frames', 'zoom', 'space', 'notation', 'd-arch', 'd-state', 'd-proc', 'd-loop', 'd-proof', 'd-fold', 'timeline', 'timing', 'chart', 'heatmap', 'upset', 'euler', 'decision'] : ['as it is', 'prose', 'vscode lm'];
if (bi >= 0 && !BREAKS[variants[0]]) throw new Error(`--break takes one of ${Object.keys(BREAKS).join(', ')}`);
const casesOf = (v: string) => BREAKS[v]?.[3] ?? (group ? GROUPS[group] : cases);
// the command line's answer for each case a window will hold it against
await Promise.all([...new Set(variants.flatMap(casesOf))].flatMap((c) => c.cli ? [cli(c.file, c.cli)] : []));

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
  let red = '', said = '';   // `said`: what the suite found; a planted defect is caught only when the suite says so, not when VS Code fails to start
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
      extensionTestsEnv: { ROFL_NB_CASES: mine(JSON.stringify(casesOf(v))), ...(v === 'as it is' && group && group !== 'core' && { ROFL_NB_CASES_ONLY: '1' }), ROFL_NB_REPORT: report, ROFL_NB_TRANSLATE: mine(natural), ROFL_NB_STARTUP: mine(review), ROFL_NB_RUNAWAY: mine(runaway), ROFL_NB_CLAUDE: v === 'vscode lm' ? failing : fake, ...(shooting && { ROFL_NB_SHOT: shot! }), ...(v === 'vscode lm' && { ROFL_NB_FAKE_LM: '1' }), ROFL_NB_PID: path.join(tmp, 'claude.pid'), ROFL_LSP_FILES: mine(JSON.stringify([broken, late])) },
    });
  } catch (e) { said = (() => { try { return readFileSync(report, 'utf8'); } catch { return ''; } })(); red = said || (e as Error).message; }
  finally { if (dir !== EXT) rmSync(dir, { recursive: true, force: true }); log.end(); clearInterval(shooting); }
  if (v === 'as it is') for (const l of readFileSync(path.join(tmp, 'as-it-is.log'), 'utf8').split('\n')) if (/: (run after .*: )?\d+ ms$/.test(l)) console.log(`     ${l.replace(tmp, '')}`);
  return { v, red, said, s: ((performance.now() - t) / 1000).toFixed(1) };
};
// Two at a time: each window loads the JS model, and more of them at once only share the same cores.
const results: Awaited<ReturnType<typeof one>>[] = [], queue = [...variants];
await Promise.all([0, 1].map(async () => { for (let v; (v = queue.shift()); ) results.push(await one(v)); }));

results.sort((x, y) => variants.indexOf(x.v) - variants.indexOf(y.v));
let failed = 0;
for (const { v, red, said, s } of results) {
  const ok = BREAKS[v] ? !!said : !red;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${!BREAKS[v] ? `${v}: green` : `planted "${v}": red`} (${s} s)${red ? `\n     ${red.replace(/\n/g, '\n     ')}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} VS Code runs as expected, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
