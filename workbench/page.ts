// The workbench page: one ROFL notebook, its cells run by the kernel in the page, its pictures drawn by the modules VS Code draws with.
// Alone it keeps the notebook in this browser. Where the page is an artifact, what resolves lights up: the shared notebook (db), who is here and
// in which cell (room, user), and a natural cell translated by the viewer's own Claude (sample). Each is null alone and the page works without it.
//
// THE SHARED NOTEBOOK, for anyone writing it (another page, or a session with write_db): one document per cell in the collection
// `notebooks/shared/cells`, its id any path segment (`c01`, `intro`), its fields
//   kind   "prose" | "rofl" | "datalog" | "natural"   (rofl: the sentence form; anything else is read as rofl)
//   text   the cell's text, without its fence
//   order  a number; cells are shown by it, ascending, a tie or a missing one by id
// Nothing else: no order document, no notebook document. Every open view hears a write live; no cell at all shows an empty rofl cell.
// With the Artifact tool, two cells, a sentences cell and one that draws it:
//   {action: "write_db", db_op: "set", collection: "notebooks/shared/cells", doc_id: "c010", data: {kind: "rofl", order: 10,
//    text: "Declared as facts:\n\n- <a id=\"calls\"></a>A service A calls a service B\n\nThe calls:\n\n- `web` calls `api`.\n- `api` calls `db`.\n\nA mark X is a node if X calls something.\n\nA mark X is a node if something calls X.\n\nA mark X links to a mark Y if X calls Y.\n\nnever X calls X"}}
//   {action: "write_db", db_op: "set", collection: "notebooks/shared/cells", doc_id: "c020", data: {kind: "rofl", order: 20, text: "draw graph"}}
// A notebook whose first cell is not prose opening with front matter reads rofl:visual/graph.rofl.md, so `draw graph` works in bare cells.
import { Bench, HINT, addWhere, answered, keyAction, shown, esc, prose, said, state, type Cell, type Kind, type Ran } from './bench.ts';
import { SAID } from '../notebook/kernel.ts';
import { draw, graphLibs } from '../vscode/visual/pictures.ts';
import { panZoom } from '../vscode/visual/pan.ts';
import type { View } from '../notebook/draw.ts';

type Pc = Cell & { order: number };
type Cap = any;   // a capability's namespace, as claude.use resolves it (artifact contract 0.2.56)
const KINDS: [Kind, string][] = [['rofl', 'sentences'], ['datalog', 'datalog'], ['natural', 'natural'], ['prose', 'prose']];
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const book = $('book'), bar = $('bar'), head = $('head');
const bench = new Bench((p) => fetch(p).then((r) => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.text(); }));
const newId = () => 'c' + Math.random().toString(36).slice(2, 10);

// newest first: this viewer's choice, the display reversed; the notebook's order and its run are the same
let newest = (() => { try { return localStorage.getItem('rofl-workbench:newest') === '1'; } catch { return false; } })();
let mode: 'local' | 'shared' = 'local', ran: Ran | null = null, editing: string | null = null;
// reading view: this viewer's choice, on unless they turned it off; a sentences or datalog cell shows its head and pictures until opened
let reading = (() => { try { return localStorage.getItem('rofl-workbench:reading') !== '0'; } catch { return true; } })();
const unfolded = new Set<string>();   // the cells this viewer opened in reading view, for this visit
// a cell's source shows apart from its output: in reading view only when opened, otherwise unless shut; for this visit
const srcOpen = new Set<string>(), srcShut = new Set<string>();
const kindName = (k: Kind) => KINDS.find(([x]) => x === k)?.[1] ?? k;
// what this viewer opened and hid: a question's answers by its line, kept across runs while the line reads the same; a cell's whole output
const opened = new Map<string, boolean>();
const hidden = new Set<string>((() => { try { return JSON.parse(localStorage.getItem('rofl-workbench:hidden') ?? '[]'); } catch { return []; } })());
const views = new Map<string, View[]>();   // each cell's pictures, as last drawn
const drawn = new Map<string, string>();   // each cell's output as last painted, so a run that says the same keeps its pictures

// ------------------------------------------------------------ the capabilities, each null alone
const use = (name: string): Promise<Cap> => (window as any).claude?.use ? (window as any).claude.use(name).catch(() => null) : Promise.resolve(null);
let db: Cap = null, room: Cap = null, user: Cap = null, sample: Cap = null;
let me: { id: string | null } = { id: null }, readOnly = false, sampleOff = false, sampleUntil = 0, sampleWait = 5_000;

// ------------------------------------------------------------ the notebook in this browser, and the empty one
const KEY = 'rofl-workbench:v2';
const blank = (): Pc[] => [{ id: newId(), kind: 'rofl', text: '', order: 1000 }];
let cells: Pc[] = (() => { try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (Array.isArray(s) && s.length) return s; } catch {} return blank(); })();
let saveT = 0;
const saveLocal = () => { clearTimeout(saveT); saveT = window.setTimeout(() => { if (mode === 'local') try { localStorage.setItem(KEY, JSON.stringify(cells)); } catch {} }, 400); };

// ------------------------------------------------------------ cells on the page
function cellEl(c: Pc): HTMLElement {
  const el = document.createElement('article');
  el.dataset.id = c.id;
  el.innerHTML = `<div class="head">
    <button type="button" class="fold-t" hidden></button>
    <button type="button" class="src-t" hidden></button>
    <select class="kind" aria-label="Cell kind">${KINDS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
    <span class="state"></span><span class="peers"></span><span class="spacer"></span>
    <button type="button" class="tr-go" title="Claude writes the cell that answers this one (Cmd/Ctrl+Enter in the cell). It runs on your own Claude account and uses your Claude usage." hidden>Translate</button>
    <button type="button" class="hide-out" title="Hide this cell's output, for you only">hide output</button>
    <button type="button" class="run" title="Run the notebook (Cmd/Ctrl+Enter; Shift+Enter in a sentences or datalog cell)">Run</button>
    <select class="add" aria-label="Add a cell after this one"><option value="">+ below</option>${KINDS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
    <button type="button" class="x" aria-label="Delete cell" title="Delete cell">&#x2715;</button>
  </div><div class="md" tabindex="0"></div><textarea rows="1" spellcheck="false" aria-label="Cell text"></textarea><div class="tr" hidden></div><div class="out"></div>`;
  return el;
}
const elOf = (id: string) => book.querySelector<HTMLElement>(`article[data-id="${id}"]`);
/** A textarea as tall as its text. Measuring collapses it for an instant, which can shorten the page and move it: the page is put back. */
const grow = (t: HTMLTextAreaElement) => { if (!t.offsetParent) {
  t.style.height = '';   // hidden (a folded cell): measured when it shows, since a hidden box has no height to measure
  return;
} const y = scrollY; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; if (scrollY !== y) scrollTo(scrollX, y); };
/** The line being typed stays where it is on screen while `fn` changes the page above it: its textarea's top, before and after. */
const focused = () => document.activeElement instanceof HTMLTextAreaElement && book.contains(document.activeElement) ? document.activeElement : null;
function steady<T>(fn: () => T): T {
  const t = focused(), top = t?.getBoundingClientRect().top;
  const r = fn();
  if (t && top !== undefined && t.isConnected) { const d = t.getBoundingClientRect().top - top; if (d) scrollBy(0, d); }
  return r;
}

/** Every cell's element in order, made or kept, its text and kind as the cell holds them. */
function paint() { steady(paintCells); }
function paintCells() {
  const keep = new Map([...book.querySelectorAll<HTMLElement>('article[data-id]')].map((e) => [e.dataset.id!, e]));
  shown(cells, newest).forEach((c, i) => {
    const el = keep.get(c.id) ?? cellEl(c);
    keep.delete(c.id);
    if (book.children[i] !== el) book.insertBefore(el, book.children[i] ?? null);
    fill(el, c);
  });
  for (const el of keep.values()) el.remove();
  paintBar(); paintPeers();
}
function fill(el: HTMLElement, c: Pc) {
  const foldable = reading && c.kind !== 'prose' && c.text.trim() !== '', folded = foldable && !unfolded.has(c.id) && editing !== c.id;
  const code = c.kind !== 'prose', empty = c.text.trim() === '';
  const src = !code || empty || editing === c.id || (reading ? !folded && srcOpen.has(c.id) : !srcShut.has(c.id));
  el.className = `cell ${c.kind}${editing === c.id ? ' editing' : ''}${hidden.has(c.id) ? ' out-hidden' : ''}${folded ? ' folded' : ''}${src ? '' : ' src-hidden'}`;
  const st = el.querySelector<HTMLButtonElement>('.src-t')!;
  st.hidden = !code || empty || folded;
  st.textContent = src ? '\u25BE source' : '\u25B8 source';
  st.title = src ? 'Hide the cell\'s sentences, keep its output' : 'Show the cell\'s sentences';
  st.setAttribute('aria-expanded', String(src));
  const ft = el.querySelector<HTMLButtonElement>('.fold-t')!;
  ft.hidden = !foldable;
  ft.textContent = folded ? `\u25B8 ${kindName(c.kind)}` : '\u25BE fold';
  ft.title = folded ? 'Show the whole cell' : 'Fold the cell to its head and pictures';
  ft.setAttribute('aria-expanded', String(!folded));
  el.querySelector('.hide-out')!.textContent = hidden.has(c.id) ? 'show output' : 'hide output';
  el.querySelector<HTMLSelectElement>('.kind')!.value = c.kind;
  el.querySelector<HTMLSelectElement>('.add')!.options[0].text = newest ? '+ above' : '+ below';
  const t = el.querySelector('textarea')!;
  const fresh = !t.style.height;
  if (t.value !== c.text && !(document.activeElement === t && writes.get(c.id)?.dirty)) {
    const [a, b] = [t.selectionStart, t.selectionEnd]; t.value = c.text;
    if (document.activeElement === t) t.setSelectionRange(Math.min(a, c.text.length), Math.min(b, c.text.length));
    grow(t);
  }
  t.readOnly = mode === 'shared' && readOnly;
  t.spellcheck = c.kind === 'natural' || c.kind === 'prose';
  const md = el.querySelector('.md')!, html = c.kind === 'prose' ? prose(c.text) || '<p class="mute">Empty prose: click to write.</p>' : '';
  if (c.kind === 'prose' && md.innerHTML !== html) md.innerHTML = html;
  el.querySelector<HTMLElement>('.tr-go')!.hidden = c.kind !== 'natural' || !sample || sampleOff;
  if (fresh) requestAnimationFrame(() => steady(() => grow(t)));
}

/** What the last run said under each cell; a cell whose output did not change keeps its drawn pictures. */
function paintOuts() { for (const d of steady(paintAnswers)) void settle(d); }
/** The outputs, and the pictures still to draw, drawn after the page is steady again. */
function paintAnswers(): (() => Promise<unknown>)[] {
  const later: (() => Promise<unknown>)[] = [];
  if (!ran) return later;
  for (const c of cells) {
    const el = elOf(c.id); if (!el) continue;
    const s = ran.byCell.get(c.id), key = JSON.stringify(s ?? null), st = state(s), stEl = el.querySelector<HTMLElement>('.state')!;
    stEl.textContent = c.kind === 'natural' ? answered(cells, c.id) ? `answered by the cell ${newest ? 'above' : 'below'}` : sample && !sampleOff ? 'not translated yet' : 'not translated: Claude is not reachable here' : st.text;
    stEl.className = `state ${st.cls}`;
    if (drawn.get(c.id) === key) continue;
    drawn.set(c.id, key);
    const vs: View[] = [], out = el.querySelector<HTMLElement>('.out')!;
    // a picture redrawn keeps its room until it is drawn, so the page does not shrink and grow back under the line being typed
    if (out.querySelector('.pic')) out.style.minHeight = `${out.offsetHeight}px`;
    out.innerHTML = c.kind === 'natural' ? '' : said(s, vs);
    for (const d of out.querySelectorAll<HTMLDetailsElement>('details.fold-line')) { const o = opened.get(`${c.id}\u0000${d.dataset.line}`); if (o !== undefined) d.open = o; }
    views.set(c.id, vs);
    const pics = [...out.querySelectorAll<HTMLElement>('.pic[data-view]')];
    later.push(async () => { await Promise.all(pics.map((p) => picture(p, vs[Number(p.dataset.view)]))); out.style.minHeight = ''; });
  }
  const r = ran.result, sign = r.status === 'ok' ? 'pass' : r.status === 'fails' ? 'fail' : 'warn';
  head.innerHTML = `<span class="verdict ${sign}">${r.status === 'ok' ? '✓' : r.status === 'fails' ? '✗' : '⚠'} ${esc(SAID[r.status])}</span><span class="mute">ran in ${r.ms.run} ms, in this page</span>`
    + [...ran.head.errors.map((e) => `<div class="err">${esc(e)}</div>`), ...ran.head.notes.map((n) => `<div class="note">${esc(n)}</div>`)].join('');
  return later;
}

/** A picture drawn later changes the page above the line being typed as well: the line is held where it was when the drawing began. */
async function settle(draw: () => Promise<unknown>) {
  const t = focused(), top = t?.getBoundingClientRect().top;
  await draw();
  if (t && top !== undefined && t === focused()) { const d = t.getBoundingClientRect().top - top; if (d) scrollBy(0, d); }
}

// ------------------------------------------------------------ pictures
const hooks = {
  libs: () => graphLibs(document),
  why: (literal: string, into: HTMLElement) => { into.textContent = bench.why(literal); },
  pin: (facts: string) => pin(facts),
};
const picture = (el: HTMLElement, v: View) => draw(el, v, { ...hooks, show: () => void overlay(v), showAs: ['Full screen', 'the picture over the whole page, to pan and zoom'] });
let pz: { fit(): void } | null = null;
async function overlay(v: View) {
  const o = $('overlay'), stage = $('ostage');
  o.hidden = false; document.body.classList.add('lock');
  stage.innerHTML = '<div></div>';
  pz ??= panZoom(stage);
  await draw(stage.firstElementChild as HTMLElement, v, hooks);
  $('oclose').focus();
}
const closeOverlay = () => { $('overlay').hidden = true; $('ostage').innerHTML = ''; document.body.classList.remove('lock'); };
// a pinned layout is placed(M, X, Y) facts: a datalog cell of its own, kept by the next run
function pin(facts: string) {
  const was = cells.find((c) => c.kind === 'datalog' && c.text.startsWith('-- pinned layout'));
  if (was) { was.text = facts; changed(was); } else add('datalog', cells.at(-1)?.id, facts);
}

// ------------------------------------------------------------ editing
function changed(c: Pc, soon = false) {
  if (mode === 'shared') write(c); else saveLocal();
  paint(); run(soon ? 0 : 700);
}
/** A new cell after the cell `after`, at the end when there is none, at the start when it is null. */
function add(kind: Kind, after: string | undefined | null, text = '') {
  const k = after === null ? -1 : after ? cells.findIndex((c) => c.id === after) : cells.length - 1;
  const next = cells[k + 1]?.order, a = k >= 0 ? cells[k].order : (next ?? 2000) - 2000, b = next ?? a + 2000;
  const c: Pc = { id: newId(), kind, text, order: (a + b) / 2 };
  cells.splice(k + 1, 0, c);
  changed(c);
  const t = elOf(c.id)?.querySelector('textarea');
  if (kind === 'prose') startProse(c.id); else t?.focus();
  elOf(c.id)?.scrollIntoView({ block: 'nearest' });
  return c;
}
function remove(id: string) {
  cells = cells.filter((c) => c.id !== id);
  if (!cells.length && mode === 'local') cells = blank();
  if (mode === 'shared') { clearTimeout(writes.get(id)?.timer); writes.delete(id); void db.doc(`notebooks/shared/cells/${id}`).delete().catch(refused); } else saveLocal();
  paint(); run(0);
}
const startProse = (id: string) => { const el = elOf(id); if (!el) return; editing = id; el.classList.add('editing'); const t = el.querySelector('textarea')!; grow(t); t.focus(); presence(); };

book.addEventListener('input', (e) => {
  const t = e.target as HTMLElement, id = t.closest<HTMLElement>('article')?.dataset.id, c = cells.find((x) => x.id === id);
  if (!c || !(t instanceof HTMLTextAreaElement)) return;
  c.text = t.value; grow(t);
  if (mode === 'shared') { const w = writes.get(c.id) ?? writes.set(c.id, { dirty: false, busy: false, last: '' }).get(c.id)!; w.dirty = true; }
  changed(c);
});
book.addEventListener('change', (e) => {
  const s = e.target as HTMLSelectElement, id = s.closest<HTMLElement>('article')?.dataset.id, c = cells.find((x) => x.id === id);
  if (!c) return;
  if (s.classList.contains('kind')) { c.kind = s.value as Kind; drawn.delete(c.id); changed(c, true); }
  if (s.classList.contains('add') && s.value) { const k = s.value as Kind; s.value = ''; add(k, c.id); }
});
book.addEventListener('click', (e) => {
  const t = e.target as HTMLElement, id = t.closest<HTMLElement>('article')?.dataset.id;
  if (!id) return;
  if (t.closest('.src-t')) { const s = reading ? srcOpen : srcShut; if (!s.delete(id)) s.add(id); return paint(); }
  if (t.closest('.fold-t')) { if (!unfolded.delete(id)) unfolded.add(id); return paint(); }
  if (t.closest('.x')) return remove(id);
  if (t.closest('.run')) return run(0);
  if (t.closest('.hide-out')) { if (!hidden.delete(id)) hidden.add(id); try { localStorage.setItem('rofl-workbench:hidden', JSON.stringify([...hidden])); } catch {} return paint(); }
  if (t.closest('.tr-go')) return void translate(id);
  if (t.closest('.tr-stop')) return stopping?.abort();
  if (t.closest('.md') && !(t.closest('a'))) return startProse(id);
  const why = t.closest<HTMLButtonElement>('button.why');
  if (why) {
    const li = why.closest('li')!, next = li.nextElementSibling;
    if (next?.classList.contains('why-row')) { next.remove(); return; }
    const row = document.createElement('li'); row.className = 'why-row'; row.innerHTML = `<pre class="why-tree">${esc(bench.why(why.dataset.why!))}</pre>`; li.after(row);
  }
});
book.addEventListener('toggle', (e) => {
  const d = e.target as HTMLDetailsElement, id = d.closest<HTMLElement>('article')?.dataset.id;
  if (id && d.classList?.contains('fold-line')) opened.set(`${id}\u0000${d.dataset.line}`, d.open);
}, true);
book.addEventListener('focusin', (e) => { const id = (e.target as HTMLElement).closest<HTMLElement>('article')?.dataset.id; if (id && (e.target as HTMLElement).tagName === 'TEXTAREA' && editing !== id) { editing = id; presence(); } });
book.addEventListener('focusout', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('article');
  setTimeout(() => {
    if (el && el.contains(document.activeElement)) return;
    if (el) { el.classList.remove('editing'); const c = cells.find((x) => x.id === el.dataset.id); if (c?.kind === 'prose') el.querySelector('.md')!.innerHTML = prose(c.text) || '<p class="mute">Empty prose: click to write.</p>'; }
    if (editing === el?.dataset.id) { editing = null; presence(); }
  });
});
book.addEventListener('keydown', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('article'), kind = cells.find((c) => c.id === el?.dataset.id)?.kind;
  const act = (e.target as HTMLElement).tagName === 'TEXTAREA' && kind ? keyAction(e, kind) : null;
  if (act === 'run') { e.preventDefault(); run(0); }
  if (act === 'translate') {
    e.preventDefault();
    const why = !sample || sampleOff ? 'not translated: Claude is not reachable here' : stopping ? 'a translation is already running' : Date.now() < sampleUntil ? 'Claude is busy: try again in a little while' : '';
    if (why) el!.querySelector('.state')!.textContent = why; else void translate(el!.dataset.id!);
  }
  if (e.key === 'Enter' && (e.target as HTMLElement).classList.contains('md')) { e.preventDefault(); startProse((e.target as HTMLElement).closest<HTMLElement>('article')!.dataset.id!); }
});

// ------------------------------------------------------------ running
let runT = 0, running = false, again = false;
function run(delay: number) {
  clearTimeout(runT);
  runT = window.setTimeout(async () => {
    if (running) { again = true; return; }
    running = true; again = false;
    $('runinfo').textContent = 'running…';
    try { ran = await bench.run(cells); paintOuts(); $('runinfo').textContent = ''; }
    catch (err) { $('runinfo').textContent = ''; head.innerHTML = `<div class="err">The run failed: ${esc((err as Error).message)}</div>`; }
    finally { running = false; if (again) run(0); }
  }, delay);
}

// ------------------------------------------------------------ translation: the viewer's own Claude, on a click
let stopping: AbortController | null = null;
async function translate(id: string) {
  const el = elOf(id); if (!el || !sample || sampleOff || stopping) return;
  if (Date.now() < sampleUntil) return;
  const box = el.querySelector<HTMLElement>('.tr')!, go = el.querySelector<HTMLButtonElement>('.tr-go')!;
  box.hidden = false; go.disabled = true;
  box.innerHTML = '<div class="thinking">Thinking…</div><button type="button" class="tr-stop">Stop</button>';
  const think = box.querySelector<HTMLElement>('.thinking')!;
  stopping = new AbortController();
  let last: { code: string; text?: string } | null = null;
  const ask = Object.assign(async (prompt: string) => {
    try {
      const r = await sample(prompt, { signal: stopping!.signal, onText: ({ text }: { text: string }) => { think.textContent = text; } });
      return { ok: true as const, text: r.text as string };
    } catch (err) { last = err as { code: string; text?: string }; return { ok: false as const, error: SAMPLE[last.code] ?? String((err as Error).message ?? last.code) }; }
  }, { who: 'Claude' });
  try {
    const r = await bench.translate(cells, id, ask, (s) => { think.textContent = s; });
    const partial = (last as { text?: string } | null)?.text;
    if (last && ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes((last as { code: string }).code)) sampleOff = true;
    if ((last as { code: string } | null)?.code === 'rate_limited') { sampleUntil = Date.now() + sampleWait; sampleWait = Math.min(sampleWait * 2, 120_000); setTimeout(() => { go.disabled = false; }, sampleUntil - Date.now()); }
    else sampleWait = 5_000;
    if (r.cell !== undefined) {
      const k = cells.findIndex((c) => c.id === id), under = answered(cells, id) ? cells[k + 1] : null;
      if (under) { under.text = r.cell; under.kind = 'rofl'; changed(under, true); } else add('rofl', id, r.cell);
    }
    box.innerHTML = `${r.reply ? `<div class="reply"><b>Claude:</b> ${esc(r.reply)}</div>` : ''}${partial ? `<div class="reply"><b>Claude, cut short:</b> ${esc(partial)}</div>` : ''}`
      + `<details class="as"${r.code ? ' open' : ''}><summary>${r.cell !== undefined ? `translated, and checked by the kernel${r.added ? ` · ${esc(r.added)}` : ''}` : 'no cell written'}</summary><pre>${esc(r.said.join('\n'))}</pre></details>`;
  } finally {
    stopping = null;
    if (Date.now() >= sampleUntil) go.disabled = false;
    paint();
  }
}
const SAMPLE: Record<string, string> = { not_granted: 'Claude was not allowed in this view', rate_limited: 'Claude is busy: try again in a little while', cancelled: 'stopped',
  prompt_too_large: 'the notebook is too long to send', refused: 'Claude declined', session_expired: 'the session expired: reload the page' };

// ------------------------------------------------------------ the shared notebook (db): one document per cell, placed by its order
type Write = { dirty: boolean; busy: boolean; last: string; again?: boolean; timer?: number };
const writes = new Map<string, Write>();
const KNOWN = new Set(['prose', 'rofl', 'datalog', 'natural']);
const refused = (err: { code?: string }) => { if (err?.code === 'invalid_argument') { readOnly = true; paint(); } };
/** One write at a time per cell, only when it changed, a pause after the last keystroke. */
function write(c: Pc) {
  const w = writes.get(c.id) ?? writes.set(c.id, { dirty: true, busy: false, last: '' }).get(c.id)!;
  w.dirty = true;
  clearTimeout(w.timer);
  w.timer = window.setTimeout(() => void flush(c.id), 500);
}
async function flush(id: string) {
  const w = writes.get(id), c = cells.find((x) => x.id === id);
  if (!w || !c || mode !== 'shared' || readOnly) return;
  if (w.busy) { w.again = true; return; }
  const body = { kind: c.kind, text: c.text, order: c.order }, j = JSON.stringify(body);
  if (j === w.last) { w.dirty = false; return; }
  w.busy = true;
  try { await db.doc(`notebooks/shared/cells/${id}`).set(body); w.last = j; } catch (err) { refused(err as { code?: string }); }
  finally { w.busy = false; w.dirty = !!w.again || JSON.stringify({ kind: c.kind, text: c.text, order: c.order }) !== w.last; if (w.again) { w.again = false; void flush(id); } }
}
/** The shared cells as they arrive: a cell someone else changed is taken in, one being typed in here keeps its text until its write lands. */
function heard(docs: { id: string; data(): any }[]) {
  const shared: Pc[] = docs.map((d) => { const x = d.data() ?? {}; return { id: d.id, kind: KNOWN.has(x.kind) ? x.kind : 'rofl', text: typeof x.text === 'string' ? x.text : '', order: typeof x.order === 'number' ? x.order : Infinity }; });
  const pending = (id: string) => { const w = writes.get(id); return !!w && (w.dirty || w.busy); };
  const next = [...shared.map((s) => { const mine = cells.find((c) => c.id === s.id); return mine && pending(s.id) ? mine : s; }),
    ...cells.filter((c) => pending(c.id) && !shared.some((s) => s.id === c.id))]
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // nothing shared yet: the empty cell stays, the same one, so typing into it is not interrupted
  cells = next.length ? next : cells.length === 1 && !cells[0].text ? cells : blank();
  paint(); run(300);
}
function paintBar() {
  const n = peers.filter((p) => p.presence?.nb === mode).length;
  const who = n ? `<span class="mute">${n === 1 ? '1 other person' : `${n} other people`} here</span>` : '';
  bar.innerHTML = mode === 'shared' ? `<span class="live">Shared notebook</span>${who}<span class="say mute">${readOnly ? 'You can read it; editing is not allowed for you here.' : 'Everyone here edits it; a cell someone is in shows their initials.'}</span>`
    : '<span class="say mute">This notebook is kept in this browser.</span>';
}

// ------------------------------------------------------------ who is here (room, user): ids only, names as each viewer's page resolves them
let peers: Cap[] = [];
const names = new Map<string, { name: string; color: string }>();
function presence() { if (room) void room.presence({ nb: mode, cell: editing, uid: me.id }).catch(() => {}); paintBar(); }
async function heardPeers(ps: Cap[]) {
  peers = ps.filter((p) => !p.sameTab);
  const ids = [...new Set(peers.map((p) => p.by ?? p.presence?.uid).filter((x): x is string => typeof x === 'string' && !names.has(x)))];
  if (ids.length && user) { try { const got = await user.profiles(ids); for (const [id, p] of Object.entries<any>(got)) names.set(id, { name: p.name || 'Someone', color: p.color }); } catch {} }
  paintPeers(); paintBar();
}
function paintPeers() {
  for (const el of book.querySelectorAll<HTMLElement>('.peers')) el.innerHTML = '';
  for (const p of peers) {
    if (p.presence?.nb !== mode || typeof p.presence?.cell !== 'string') continue;
    const at = elOf(p.presence.cell)?.querySelector('.peers'); if (!at) continue;
    const n = names.get(p.by ?? p.presence.uid) ?? { name: p.isMe ? 'You, in another tab' : 'Someone', color: '' };
    const initials = n.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
    at.insertAdjacentHTML('beforeend', `<span class="chip" title="${esc(n.name)} is editing this cell"${n.color ? ` style="--chip:${esc(n.color)}"` : ''}>${esc(initials)}</span>`);
  }
}

// ------------------------------------------------------------ the page's own controls
$('hint').innerHTML = `A sentences cell, its parts a blank line apart: ${HINT.split(/\n\n+/).map((p) => `<code>${esc(p)}</code>`).join(' ')}`;
$('runall').addEventListener('click', () => run(0));
const readingBox = $<HTMLInputElement>('reading');
readingBox.checked = reading;
document.body.classList.toggle('reading', reading);
readingBox.addEventListener('change', () => { reading = readingBox.checked; try { localStorage.setItem('rofl-workbench:reading', reading ? '1' : '0'); } catch {} document.body.classList.toggle('reading', reading); paint(); });
const newestBox = $<HTMLInputElement>('newest');
newestBox.checked = newest;
newestBox.addEventListener('change', () => { newest = newestBox.checked; try { localStorage.setItem('rofl-workbench:newest', newest ? '1' : '0'); } catch {} paint(); drawn.clear(); paintOuts(); });
for (const row of document.querySelectorAll<HTMLElement>('.adds')) row.addEventListener('click', (e) => {
  const k = (e.target as HTMLElement).closest<HTMLElement>('[data-add]')?.dataset.add;
  if (k) add(k as Kind, addWhere(row.dataset.row as 'top' | 'bottom', newest) === 'start' ? null : cells.at(-1)?.id);
});
$('oclose').addEventListener('click', closeOverlay);
$('ofit').addEventListener('click', () => pz?.fit());
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('overlay').hidden) closeOverlay(); });

paint(); run(0);

// each capability as it resolves; the page above already works without any of them
void use('sample').then((s) => { sample = s; paint(); if (ran) { drawn.clear(); paintOuts(); } });
void use('user').then(async (u) => {
  user = u; if (!u) return;
  try { me = { id: await u.id() }; } catch {}
  try { if (await u.can('data.write') === false) readOnly = true; } catch {}
  presence(); paintPeers();
});
void use('room').then((r) => { room = r; if (!r) return; r.onPeers((ch: { peers: Cap[] }) => void heardPeers([...ch.peers]), () => {}); presence(); });
void use('db').then((d) => {
  if (!d) return;
  db = d; mode = 'shared'; cells = blank(); drawn.clear(); presence(); paint();
  d.collection('notebooks/shared/cells').onSnapshot((snap: { docs: { id: string; data(): any }[] }) => heard(snap.docs), () => { db = null; mode = 'local'; paint(); });
});
