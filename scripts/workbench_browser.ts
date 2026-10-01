// The workbench in a real browser, for test:workbench: how far the line being typed moves while a person types into a long cell and the notebook
// runs under them, and what the reading view folds. Headless Chrome over its debugging protocol, the build served from a directory, a shared
// notebook given by a fake db.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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
/** The build in `dir` opened in headless Chrome, `script` run before the page's own, the page's cells loaded; `fn` drives it. */
async function opened<T>(dir: string, script: string, fn: (js: Js, send: (method: string, params?: object) => Promise<any>) => Promise<T>, bin: string): Promise<T> {
  const server = createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(new URL(req.url!, 'http://x').pathname).replace(/^\/$/, '/index.html'));
    try { const body = readFileSync(f); res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8' }); res.end(f.endsWith('index.html') ? `<!doctype html><meta charset="utf-8">${body}` : body); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port, profile = mkdtempSync(path.join(os.tmpdir(), 'wb-chrome-'));
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
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
    for (let i = 0; i < 100 && !(await js(`document.querySelectorAll('article').length === 6 && !!document.querySelector('article[data-id="c6"] textarea')?.value`)); i++) await sleep(100);
    await sleep(2500);   // the first run and its picture
    return await fn(js, send);
  } finally {
    const gone = new Promise((r) => proc.once('exit', r)); try { process.kill(-proc.pid!, 'SIGKILL'); } catch { proc.kill('SIGKILL'); } server.close();
    await Promise.race([gone, sleep(3000)]); await sleep(300);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}   // a helper process may still hold it: a temporary directory left behind
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
