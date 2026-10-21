// The workbench in a real browser, for test:workbench: how far the line being typed moves while a person types into a long cell and the notebook
// runs under them, what the reading view folds, and how a picture pans and zooms full screen. Headless Chrome over its debugging protocol, the
// build served from a directory, a shared notebook given by a fake db.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { own as owning, reap } from './own.ts';

/** Chrome, where it is: CHROME names it, else the usual places; undefined when there is none. */
export function chrome(): string | undefined {
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.env.CHROME) return process.env.CHROME;
  if (existsSync(mac)) return mac;
  for (const b of ['google-chrome', 'chromium', 'chromium-browser']) if (spawnSync('which', [b]).status === 0) return b;
}

const LONG = ['More flows:', '', ...Array.from({ length: 58 }, (_, i) => `- \`m${i}\` leads to \`m${i + 1}\`.`)].join('\n');
const CELLS = [
  { id: 'c1', kind: 'rofl', text: 'Declared as facts:\n\n- <a id="leads"></a>A thing A leads to a thing B\n\nThe flows:\n\n- `a1` leads to `b1`.\n\nA mark X is a node if X leads to something.\n\nA mark X is a node if something leads to X.\n\nA mark X links to a mark Y if X leads to Y.' },
  { id: 'c2', kind: 'rofl', text: 'draw graph' },
  { id: 'c3', kind: 'rofl', text: '? A thing A leads to a thing B' },
  { id: 'c4', kind: 'datalog', text: 'seen(1).' },
  { id: 'c5', kind: 'prose', text: 'The long cell below is edited by hand.' },
  { id: 'c6', kind: 'rofl', text: LONG },
];

/** A window.claude with only a db, seeded with the cells; `__db` is how the page script plays a peer. */
const FAKE = (cells: object[]) => `(() => {
  const docs = new Map(${JSON.stringify(cells.map((c: any) => [`notebooks/shared/cells/${c.id}`, { kind: c.kind, text: c.text, order: c.order }]))}), subs = [];
  const snap = (col) => { const ds = [...docs].filter(([k]) => k.startsWith(col + '/') && k.split('/').length === col.split('/').length + 1).map(([k, v]) => ({ id: k.split('/').pop(), exists: true, data: () => v })); return { docs: ds }; };
  const notify = () => setTimeout(() => subs.forEach(([c, f]) => f(snap(c))), 5);
  const doc = (p) => ({ set: async (d) => { docs.set(p, d); notify(); }, delete: async () => { docs.delete(p); notify(); }, get: async () => ({ exists: docs.has(p), data: () => docs.get(p) }), acquire: async () => ({ acquired: true }) });
  const db = { doc, collection: (c) => ({ doc: (id) => doc(c + '/' + id), get: async () => snap(c), onSnapshot: (f) => { subs.push([c, f]); setTimeout(() => f(snap(c)), 5); return () => {}; } }) };
  window.__db = db;
  window.claude = { use: (n) => Promise.resolve(n === 'db' ? db : null) };
})();`;

export type Drift = { max: number; line: number; samples: number; regrown?: number; error?: string };

type Js = (expression: string) => Promise<any>;
type Send = (method: string, params?: object) => Promise<any>;
/** The build in `dir` opened in headless Chrome, `script` run before the page's own, the page's cells loaded; `fn` drives it. `own`: no page
 *  opened and nothing waited for, `fn` goes where it needs. */
export async function opened<T>(dir: string, script: string, fn: (js: Js, send: Send, at: (page: string) => Promise<void>) => Promise<T>, bin: string, own = false): Promise<T> {
  const server = createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(new URL(req.url!, 'http://x').pathname).replace(/^\/$/, '/index.html'));
    try { const body = readFileSync(f); res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8' }); res.end(f.endsWith('index.html') ? `<!doctype html><meta charset="utf-8">${body}` : body); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  reap();
  const port = (server.address() as { port: number }).port, profile = mkdtempSync(path.join(os.tmpdir(), 'wb-chrome-')), release = owning(profile);
  const cdp = 9200 + Math.floor(Math.random() * 700);
  const proc = spawn(bin, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });   // a group of its own: its helpers go with it
  try {
    let targets: { type: string; webSocketDebuggerUrl: string }[] = [];
    for (let i = 0; i < 60 && !targets.length; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cdp}/json`)).json(); } catch { await sleep(200); } }
    const ws = new WebSocket(targets.find((t) => t.type === 'page')!.webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });
    let id = 0; const wait = new Map<number, (m: any) => void>();
    ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); wait.get(m.id)?.(m); wait.delete(m.id); };
    const send = (method: string, params = {}) => new Promise<any>((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const js = async (expression: string) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: script });
    const go = async (page: string) => { await send('Page.navigate', { url: `http://127.0.0.1:${port}/${page}` }); for (let i = 0; i < 50 && await js('document.readyState') !== 'complete'; i++) await sleep(100); };
    if (own) return await fn(js, send, go);
    await go('index.html');
    for (let i = 0; i < 100 && !(await js(`document.querySelectorAll('article').length === 6 && !!document.querySelector('article[data-id="c6"] textarea')?.value`)); i++) await sleep(100);
    await sleep(2500);   // the first run and its picture
    return await fn(js, send, go);
  } finally {
    const gone = new Promise((r) => proc.once('exit', r)); try { process.kill(-proc.pid!, 'SIGKILL'); } catch { proc.kill('SIGKILL'); } server.close();
    await Promise.race([gone, sleep(3000)]); await sleep(300);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}   // a helper process may still hold it: a temporary directory left behind
    release();
  }
}

/** The largest move of the long cell's line under the caret, in pixels, over typing 30 characters (a line that breaks a sentence for a run,
 *  then mends it) and the runs landing after. `how`: `plain`; `newest` first; `end`, typed at the very end of the long cell; `peer`, another
 *  cell above rewritten by someone else meanwhile. The reading view is off: it folds the cell typed in. */
export async function drift(dir: string, how: 'plain' | 'newest' | 'end' | 'peer', bin = chrome()!): Promise<Drift> {
  const order = (k: number) => (how === 'newest' ? CELLS.length - k : k + 1) * 1000;
  // Chrome's own scroll anchoring off, as Safari has none: the page must hold the line by itself
  const script = FAKE(CELLS.map((c, k) => ({ ...c, order: order(k) }))) + `\ndocument.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '* { overflow-anchor: none !important; }'; document.head.append(s); });`
    + `\ntry { localStorage.setItem('rofl-workbench:reading', '0');${how === 'newest' ? ` localStorage.setItem('rofl-workbench:newest', '1');` : ''} } catch {}`;
  try { return await opened(dir, script, async (js, send) => {
    const line: number = await js(`parseFloat(getComputedStyle(document.querySelector('article[data-id="c6"] textarea')).lineHeight)`);
    // the caret in the middle of the long cell (or at its end), that line at 400 px from the top of the viewport
    const at = how === 'end' ? LONG.length : LONG.split('\n').slice(0, 31).join('\n').length;
    const k = how === 'end' ? LONG.split('\n').length - 1 : 30;
    await js(`(() => { const t = document.querySelector('article[data-id="c6"] textarea'); t.focus(); t.setSelectionRange(${at}, ${at}); window.scrollBy(0, t.getBoundingClientRect().top + ${k} * ${line} - 400); })()`);
    await sleep(300);
    const top = () => js(`document.querySelector('article[data-id="c6"] textarea').getBoundingClientRect().top`) as Promise<number>;
    // every textarea but the one typed in whose height is set while typing: fill growing what it did not change
    await js(`window.__regrown = 0; new MutationObserver((ms) => { for (const m of ms) if (m.target instanceof HTMLTextAreaElement && m.target !== document.activeElement) window.__regrown++; }).observe(document.getElementById('book'), { subtree: true, attributes: true, attributeFilter: ['style'] })`);
    const start = await top(), seen: number[] = [];
    const watch = async (ms: number) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(40)) seen.push(await top()); };
    const type = async (s: string) => { for (const ch of s) { await send('Input.insertText', { text: ch }); seen.push(await top()); await sleep(25); } };
    await type('\n- `zz` leads');
    if (how === 'peer') await js(`window.__db.doc('notebooks/shared/cells/c3').set({ kind: 'rofl', order: 3000, text: '? A thing A leads to a thing B\\n\\n' + Array.from({ length: 12 }, (_, i) => '? A thing \`m' + i + '\` leads to a thing B').join('\\n') })`);
    await watch(1500);
    await type(' to `a1`.');
    await watch(1500);
    await type('\n- `yy` to');
    await watch(2000);
    // a line typed into a textarea that is not there moves nothing: the typing must have landed
    if (!(await js(`document.querySelector('article[data-id="c6"] textarea').value.includes('\`yy\` to')`))) throw new Error('the typing did not reach the long cell');
    return { max: Math.max(...seen.map((y) => Math.abs(y - start))), line, samples: seen.length, regrown: await js('window.__regrown') };
  }, bin); } catch (e) { return { max: Infinity, line: 0, samples: 0, error: (e as Error).message }; }
}

/** The reading view, turned on by its box and off again: what it folds and shows, and a folded cell opened by a click. Each wrong thing, said. */
export async function reading(dir: string, bin = chrome()!): Promise<string[]> {
  const script = FAKE(CELLS.map((c, k) => ({ ...c, order: (k + 1) * 1000 }))) + `\ntry { localStorage.setItem('rofl-workbench:reading', '0'); } catch {}`;
  try { return await opened(dir, script, async (js) => {
    const cell = (id: string) => js(`(() => { const a = document.querySelector('article[data-id="${id}"]'), seen = (s) => [...a.querySelectorAll(s)].some((e) => e.offsetParent && e.offsetHeight > 0);
      return { folded: a.classList.contains('folded'), source: seen('textarea'), pic: seen('.pic'), rows: seen('.out .rows, .out .said'), prose: seen('.md') }; })()`);
    const all = async () => Object.fromEntries(await Promise.all(CELLS.map(async (c) => [c.id, await cell(c.id)])));
    const bad: string[] = [], code = CELLS.filter((c) => c.kind !== 'prose').map((c) => c.id);
    const before = await all();
    if (!before.c2.pic || !before.c3.rows) return ['the picture of `draw graph` or the answers of `?` were not shown, so what folding keeps cannot be seen'];
    for (const id of code) if (before[id].folded || !before[id].source) bad.push(`reading view off: ${id} is folded or shows no source`);
    await js(`document.getElementById('reading').click()`); await sleep(300);
    const on = await all();
    for (const id of code) if (!on[id].folded || on[id].source) bad.push(`reading view on: ${id} is not folded to its head`);
    if (!on.c2.pic) bad.push('reading view on: the picture of a folded cell is gone');
    if (on.c3.rows) bad.push('reading view on: the answers of a folded cell still show');
    if (on.c5.folded || !on.c5.prose) bad.push('reading view on: the prose cell is folded');
    await js(`document.querySelector('article[data-id="c3"] .fold-t').click()`); await sleep(300);
    const open1 = await all();
    if (open1.c3.folded || !open1.c3.rows) bad.push('reading view on: a click on a folded cell does not open it to its answers');
    if (!open1.c4.folded) bad.push('reading view on: a click on one cell opened another');
    await js(`document.querySelector('article[data-id="c3"] .src-t').click()`); await sleep(300);
    if (!(await cell('c3')).source) bad.push('reading view on: an opened cell does not show its source on a click');
    await js(`document.getElementById('reading').click()`); await sleep(300);
    const off = await all();
    for (const id of code) if (off[id].folded || !off[id].source) bad.push(`reading view off again: ${id} is still folded`);
    return bad;
  }, bin); } catch (e) { return [(e as Error).message]; }
}

/** One notebook of examples/visual for each kind of picture that pans and zooms; `graph frames`, the graph drawn a picture per frame.
 *  A table and a decision are HTML that scrolls, and a fallback is text: none pans. `bare`, an SVG drawn with no viewBox, in the panel's page. */
export const PANS: Record<string, string> = { graph: 'paint-shop', argument: 'deploy-argument', notation: 'family-tree', architecture: 'shop-architecture', state: 'order-states',
  process: 'claim-process', causal: 'burnout-loop', proof: 'claim-proof', gantt: 'spat-thursday', 'gantt frames': 'spat-week', sequence: 'checkout-sequence', timeline: 'outage-timeline',
  timing: 'breaker-timing', chart: 'suite-chart', heatmap: 'coverage-heatmap', upset: 'access-upset', euler: 'oncall-euler', space: 'office-plan', 'graph frames': '', bare: '' };
const QUARTERS = 'Declared as facts:\n\n- <a id="leads"></a>A thing A leads to a thing B\n- <a id="quarter"></a>A thing A is in the quarter Q\n\nThe facts:\n\n- `a` leads to `b`.\n- `b` leads to `c`.\n- `c` leads to `d`.\n- `a` is in the quarter `q1`.\n- `b` is in the quarter `q1`.\n- `c` is in the quarter `q2`.\n- `d` is in the quarter `q2`.\n\n'
  + 'A mark X is a node if X leads to something.\n\nA mark X is a node if something leads to X.\n\nA mark X links to a mark Y if X leads to Y.\n\nA mark X is in the frame Q if X is in the quarter Q.\n\ndraw graph';
const ROOT = new URL('..', import.meta.url).pathname;

/** Each kind's picture full screen, in the workbench's overlay and in VS Code's panel (the page vscode/extension.ts writes, over the renderer as
 *  built): wheeled in and out, by ±1000 at once, pinched, in lines and pages, dragged, and Fit. Its view stays drawable and within 1/50..50 of
 *  its fitted scale, a notch of the wheel zooms in about the point under it, a picture not shown is not an error, Fit gives back the view as
 *  drawn, and the picture fills the height it is given. Each wrong thing, said with its kind and host; `numbers`, the graph's view before and after. */
export async function panned(dir: string, kinds = Object.keys(PANS), bin = chrome()!): Promise<{ bad: string[]; numbers: string[] }> {
  const { buildRenderer } = await import('./renderer.ts');
  writeFileSync(path.join(dir, 'lib/package.json'), '{"type":"module"}');
  const wb = await import(path.join(dir, 'lib/bench.js')), bench = new wb.Bench((p: string) => Promise.resolve(readFileSync(path.join(dir, p), 'utf8')));
  const file = (f: string) => readFileSync(path.join(ROOT, 'examples/visual', f), 'utf8');
  // what a notebook reads beside it goes in as cells, the page given no folder: a .rofl as a datalog cell, a .rofl.md its cells first
  const cellsIn = (t: string): object[] => {
    const near = [...t.matchAll(/^ {2}- ([\w./-]+\.rofl(?:\.md)?)\n/gm)].map((m) => m[1]);
    return [...near.filter((f) => f.endsWith('.md')).flatMap((f) => cellsIn(file(f))), ...wb.split(near.reduce((x, f) => x.replace(`  - ${f}\n`, ''), t)),
      ...near.filter((f) => !f.endsWith('.md')).map((f) => ({ kind: 'datalog', text: file(f) }))];
  };
  const cellsOf = (k: string) => (PANS[k] ? cellsIn(file(`${PANS[k]}.rofl.md`)) : [{ kind: 'rofl', text: QUARTERS }]).map((c, i) => ({ id: `c${i + 1}`, order: (i + 1) * 1000, ...c }));
  const page = (k: string) => k.replace(/\W/g, '-');
  // the panel: the page vscode/extension.ts writes, its policy left out and VS Code's API a stub, one page per kind
  const panel = path.join(dir, 'panel');
  if (!existsSync(panel)) {
    buildRenderer(panel);
    const ext = readFileSync(path.join(ROOT, 'vscode/extension.ts'), 'utf8'), style = /<style>html, body[\s\S]*?<\/style>/.exec(ext)![0], body = /<body><div class="tools">[\s\S]*?<div id="pic"><\/div>/.exec(ext)![0];
    const head = `<!doctype html><html><head><meta charset="utf-8">${style}<script>window.acquireVsCodeApi = () => ({ postMessage() {} });</script></head>`;
    for (const k of Object.keys(PANS).filter((x) => x !== 'bare')) {
      const ran = await bench.run(cellsOf(k)), view = ran.result.cells.flatMap((c: { lines: { kind: string; view?: object }[] }) => c.lines).find((l: { kind: string }) => l.kind === 'draw')?.view;
      writeFileSync(path.join(panel, `${page(k)}.html`), `${head}${body}<script type="application/json" id="view">${JSON.stringify({ view, notebook: 'file:///x.rofl.md' }).replace(/</g, '\\u003c')}</script><script type="module" src="panel.js"></script></body></html>`);
    }
    writeFileSync(path.join(panel, 'bare.html'), `${head}${body.replace('<div id="pic"></div>', '<div id="pic"><div class="stage"><svg width="400" height="300"><rect x="20" y="20" width="200" height="120" fill="#888"/><text x="40" y="200">bare</text></svg></div></div>')}`
      + `<script type="module">import { panZoom } from './pan.js'; const pz = panZoom(document.getElementById('pic')); document.getElementById('fit').onclick = pz.fit;</script></body></html>`);
  }
  const fakes = kinds.filter((k) => k !== 'bare').map((k) => `if (location.search === '?pan=${page(k)}') ${FAKE(cellsOf(k))}`).join('\n');
  const script = `window.__errs = []; addEventListener('error', (e) => window.__errs.push(String(e.message))); window.__wheels = 0; addEventListener('wheel', () => { window.__wheels++; }, { capture: true, passive: true });\n${fakes}`;
  const bad: string[] = [], numbers: string[] = [];
  const drawnIn = (root: string) => `(() => { const s = document.querySelector('${root} .stage svg'); return !!s && (!s.closest('.sch') || !!s.querySelector('.nodes > *')) && s.getBoundingClientRect().width > 0; })()`;
  // the pages shared among a few browsers, each going through its own
  const all = kinds.flatMap((k) => [...k === 'bare' ? [] : [[k, 'workbench']], [k, 'panel']] as [string, string][]), n = Math.min(all.length, Number(process.env.ROFL_JOBS) || 4);
  await Promise.all(Array.from({ length: n }, (_, j) => opened(dir, script, async (js, send, go) => {
    for (const [k, host] of all.filter((_, i) => i % n === j)) {
      const say = (s: string) => bad.push(`${k}, ${host}: ${s}`), R = host === 'workbench' ? '#ostage' : '#pic', S = `document.querySelector('${R} .stage svg')`;
      if (host === 'workbench') {
        await go(`index.html?pan=${page(k)}`);
        if (!await until(js, `!!document.querySelector('.pic [data-show]') && ${drawnIn('.pic')}`, 40_000)) { say(`the notebook drew no picture to open full screen: ${await js(`document.getElementById('head').textContent + ' | ' + document.querySelector('.pic')?.innerHTML.slice(0, 300)`)}`); continue; }
        await js(`document.querySelector('.pic [data-show]').click()`);
      } else await go(`panel/${page(k)}.html`);
      if (!await until(js, drawnIn(R), 20_000)) { say(`the picture was not drawn: ${await js(`document.querySelector('${R}')?.innerHTML.slice(0, 400)`)}`); continue; }
      await sleep(700);   // the schema fits itself once its fonts and size settle
      const state = async () => await js(`(() => { const s = ${S}, g = s.querySelector('.vp') ?? s, m = g.getScreenCTM(), r = s.getBoundingClientRect();
        const seen = [...s.querySelectorAll('text, rect, path, circle, line, polygon, ellipse, polyline')].some((e) => { if (e.closest('defs, marker, pattern')) return false; const q = e.getBoundingClientRect(); return q.width + q.height > 0 && q.right > r.left && q.left < r.right && q.bottom > r.top && q.top < r.bottom; });
        return { vb: s.getAttribute('viewBox'), m: m && [m.a, m.b, m.c, m.d, m.e, m.f], r: [r.left, r.top, r.width, r.height], seen, errs: window.__errs.length }; })()`) as { vb: string | null; m: number[] | null; r: number[]; seen: boolean; errs: number };
      const s0 = await state(), given: number = await js(host === 'workbench' ? `document.getElementById('overlay').clientHeight` : 'innerHeight');
      if (!s0.m) { say('the picture has no screen matrix'); continue; }
      // a picture not shown has no size: a wheel and a drag on it are nothing, not an error, and it is shown again as it was drawn
      await js(`(() => { const s = ${S}; s.style.display = 'none'; s.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 50, clientY: 50, bubbles: true, cancelable: true }));
        s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); dispatchEvent(new PointerEvent('pointermove', { movementX: 5, movementY: 5 })); dispatchEvent(new PointerEvent('pointerup')); s.style.display = ''; })()`);
      await sleep(300);
      const hid = await state();
      if (hid.errs) say(`a wheel or a drag on a picture not shown threw: ${await js('window.__errs.join("; ")')}`);
      if (hid.vb !== s0.vb || hid.m?.some((x, i) => Math.abs(x - s0.m![i]) > 0.5)) say(`a wheel on the picture while it was not shown moved it: viewBox "${s0.vb}" to "${hid.vb}", matrix ${JSON.stringify(s0.m)} to ${JSON.stringify(hid.m)}`);
      if (!k.includes('frames') && s0.r[3] < 0.6 * given) say(`the picture fills ${Math.round(s0.r[3])} px of the ${given} px it is given`);
      const at = [s0.r[0] + 0.3 * s0.r[2], s0.r[1] + 0.4 * s0.r[3]];
      // a wheel from the browser's input, acknowledged before the page has it: each waited for until the page has counted it
      const turn = async (dy: number, ctrl = false) => { const c: number = await js('window.__wheels'); await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at[0], y: at[1], deltaX: 0, deltaY: dy, modifiers: ctrl ? 2 : 0 }); if (!await until(js, `window.__wheels > ${c}`, 3000)) say('a wheel from the input never reached the page'); };
      // many turns at once, given to what is under the pointer as the browser would
      const wheel = (n: number, dy: number, ctrl = false, mode = 0) => js(`(() => { const t = document.elementFromPoint(${at[0]}, ${at[1]}); for (let i = 0; i < ${n}; i++) t.dispatchEvent(new WheelEvent('wheel', { deltaY: ${dy}, deltaMode: ${mode}, ctrlKey: ${ctrl}, clientX: ${at[0]}, clientY: ${at[1]}, bubbles: true, cancelable: true })); })()`);
      const check = async (what: string) => {
        const s = await state(), b = s.vb === null ? null : s.vb.trim().split(/[\s,]+/).map(Number), q = s.m ? s.m[0] / s0.m![0] : NaN;
        if (b && !(b.length === 4 && b.every(Number.isFinite) && b[2] > 0 && b[3] > 0)) say(`after ${what} the viewBox is "${s.vb}"`);
        if (!s.m || !s.m.every(Number.isFinite) || !(s.m[0] > 0)) say(`after ${what} the screen matrix is ${JSON.stringify(s.m)}`);
        else if (!(q >= 1 / 50.5 && q <= 50.5)) say(`after ${what} the scale is ${q.toPrecision(3)} of the fitted one, outside 1/50..50`);
        if (s.errs) say(`after ${what} the page threw: ${await js('window.__errs.join("; ")')}`);
        return s;
      };
      // the honest case: one notch of the wheel zooms in, and the point under the pointer stays under it
      const ctm = `(${S}.querySelector('.vp') ?? ${S}).getScreenCTM()`;
      await js(`window.__u = new DOMPoint(${at[0]}, ${at[1]}).matrixTransform(${ctm}.inverse())`);
      await turn(-120);
      const s1 = await check('one notch'), back: number[] = await js(`(() => { const p = window.__u.matrixTransform(${ctm}); return [p.x, p.y]; })()`), off = Math.hypot(back[0] - at[0], back[1] - at[1]);
      if (!(s1.m && s1.m[0] > s0.m[0] * 1.05)) say(`one notch of the wheel did not zoom in: the scale went ${s0.m[0].toPrecision(4)} to ${s1.m?.[0].toPrecision(4)}`);
      if (!(off <= 1)) say(`one notch moved the point under the pointer ${off.toFixed(1)} px`);
      for (const [dy, ctrl] of [[-100, false], [-100, false], [100, false], [-10, true], [10, true]] as const) await turn(dy, ctrl);
      await check('wheels and pinches from the input');
      await wheel(30, -100); const up = await check('30 wheel-ups');
      if (k === 'graph') numbers.push(`${host}: drawn viewBox ${JSON.stringify(s0.vb)}, scale ${s0.m[0].toPrecision(3)}; after 30 wheel-ups viewBox ${JSON.stringify(up.vb)}, scale ${up.m?.[0].toPrecision(3)}`);
      await wheel(60, 100); await check('60 wheel-downs');
      await wheel(5, 1000); await wheel(5, -1000); await check('±1000');
      await wheel(40, -10, true); await check('40 pinches in');
      await wheel(80, 10, true); await check('80 pinches out');
      for (const [mode, dy] of [[1, -3], [1, 3], [2, -1], [2, 1], [1, 1e6], [2, -1e6]]) await wheel(1, dy, false, mode);
      await check('wheels in lines and pages');
      const fit = async (what: string) => {
        await js(`document.querySelector('${host === 'workbench' ? '#ofit' : '#fit'}').click()`); await sleep(150);
        const s = await check(what);
        if (s.vb !== s0.vb) say(`${what} gives the viewBox "${s.vb}", not the drawn "${s0.vb}"`);
        if (!s.m || s.m.some((x, i) => Math.abs(x - s0.m![i]) > 0.5)) say(`${what} gives the screen matrix ${JSON.stringify(s.m)}, not the drawn ${JSON.stringify(s0.m)}`);
        if (!s.seen) say(`${what}: nothing drawn is in sight`);
      };
      await fit('Fit');
      // a drag from the corner, which a fit leaves empty, pans
      const from = [s0.r[0] + 4, s0.r[1] + 4];
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from[0], y: from[1], button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 10; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0] + 8 * i, y: from[1] + 5 * i, button: 'left', buttons: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from[0] + 80, y: from[1] + 50, button: 'left', buttons: 0, clickCount: 1 });
      const dragged = await check('a drag');
      if (!dragged.m || Math.abs(dragged.m[4] - s0.m[4]) < 20) say(`a drag of 80 px did not pan: the matrix went ${JSON.stringify(s0.m)} to ${JSON.stringify(dragged.m)}`);
      await fit('Fit after the drag');
      if (host === 'workbench') await js(`document.getElementById('oclose').click()`);
    }
  }, bin, true).catch((e) => { bad.push((e as Error).message); })));
  return { bad, numbers };
}

const until = async (js: Js, expr: string, ms: number) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) if (await js(expr)) return true; return false; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
