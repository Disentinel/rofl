// The workbench page: a ROFL notebook, its cells run by the kernel in the page, its pictures drawn by the modules VS Code draws with.
// Alone it keeps the notebook in this browser. Where the page is an artifact, what resolves lights up: a shared notebook (db), who is here and in
// which cell (room, user), and a natural cell translated by the viewer's own Claude (sample). Each is null alone and the page works without it.
import { Bench, EXAMPLES, answered, esc, prose, said, split, state, type Cell, type Kind, type Ran } from './bench.ts';
import { SAID } from '../notebook/kernel.ts';
import { draw, graphLibs } from '../vscode/visual/pictures.ts';
import { panZoom } from '../vscode/visual/pan.ts';
import type { View } from '../notebook/draw.ts';

type Pc = Cell & { pos: number };
type Cap = any;   // a capability's namespace, as claude.use resolves it (artifact contract 0.2.56)
const KINDS: [Kind, string][] = [['rofl', 'sentences'], ['datalog', 'datalog'], ['natural', 'natural'], ['prose', 'prose']];
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const book = $('book'), bar = $('bar'), head = $('head');
const bench = new Bench((p) => fetch(p).then((r) => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.text(); }));
const newId = () => 'c' + Math.random().toString(36).slice(2, 10);
const tab = newId();

const asked = location.hash.slice(1);   // `#shared`, an example's name, or nothing: the shared notebook when there is one
let cells: Pc[] = [], example = EXAMPLES.some((e) => e.name === asked) ? asked : 'platform';
let mode: 'local' | 'shared' = 'local', ran: Ran | null = null, editing: string | null = null;
const views = new Map<string, View[]>();   // each cell's pictures, as last drawn
const drawn = new Map<string, string>();   // each cell's output as last painted, so a run that says the same keeps its pictures

// ------------------------------------------------------------ the capabilities, each null alone
const use = (name: string): Promise<Cap> => (window as any).claude?.use ? (window as any).claude.use(name).catch(() => null) : Promise.resolve(null);
let db: Cap = null, room: Cap = null, user: Cap = null, sample: Cap = null;
let me: { id: string | null } = { id: null }, readOnly = false, sampleOff = false, sampleUntil = 0, sampleWait = 5_000;

// ------------------------------------------------------------ the notebook in this browser
const KEY = (ex: string) => `rofl-workbench:v1:${ex}`;
const local = { get(ex: string): Pc[] | null { try { const s = JSON.parse(localStorage.getItem(KEY(ex)) ?? 'null'); return Array.isArray(s) ? s : null; } catch { return null; } },
  set(ex: string, cs: Pc[]) { try { localStorage.setItem(KEY(ex), JSON.stringify(cs)); } catch {} },
  drop(ex: string) { try { localStorage.removeItem(KEY(ex)); } catch {} } };
const fromText = (text: string): Pc[] => split(text).map((c, i) => ({ id: newId(), kind: c.kind, text: c.text, pos: (i + 1) * 1000 }));

async function open(ex: string, fresh = false) {
  example = ex; mode = 'local';
  const saved = !fresh && local.get(ex), text = saved ? '' : await bench.example(ex) ?? '';
  cells = saved || fromText(text);
  if (fresh) local.drop(ex);
  history.replaceState(null, '', `#${ex}`);
  presence();
  paint(); run(0);
}
let saveT = 0;
const saveLocal = () => { clearTimeout(saveT); saveT = window.setTimeout(() => { if (mode === 'local') local.set(example, cells); }, 400); };

// ------------------------------------------------------------ cells on the page
function cellEl(c: Pc): HTMLElement {
  const el = document.createElement('article');
  el.dataset.id = c.id;
  el.innerHTML = `<div class="head">
    <select class="kind" aria-label="Cell kind">${KINDS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
    <span class="state"></span><span class="peers"></span><span class="spacer"></span>
    <button type="button" class="tr-go" title="Claude writes the cell under this one. It runs on your own Claude account and uses your Claude usage." hidden>Translate</button>
    <button type="button" class="run" title="Run the notebook (Shift+Enter)">Run</button>
    <select class="add" aria-label="Add a cell below"><option value="">+ below</option>${KINDS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
    <button type="button" class="x" aria-label="Delete cell" title="Delete cell">&#x2715;</button>
  </div><div class="md" tabindex="0"></div><textarea rows="1" spellcheck="false" aria-label="Cell text"></textarea><div class="tr" hidden></div><div class="out"></div>`;
  return el;
}
const elOf = (id: string) => book.querySelector<HTMLElement>(`article[data-id="${id}"]`);
const grow = (t: HTMLTextAreaElement) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };

/** Every cell's element in order, made or kept, its text and kind as the cell holds them. */
function paint() {
  const keep = new Map([...book.querySelectorAll<HTMLElement>('article[data-id]')].map((e) => [e.dataset.id!, e]));
  cells.forEach((c, i) => {
    const el = keep.get(c.id) ?? cellEl(c);
    keep.delete(c.id);
    if (book.children[i] !== el) book.insertBefore(el, book.children[i] ?? null);
    fill(el, c);
  });
  for (const el of keep.values()) el.remove();
  paintBar(); paintPeers();
}
function fill(el: HTMLElement, c: Pc) {
  el.className = `cell ${c.kind}${editing === c.id ? ' editing' : ''}`;
  el.querySelector<HTMLSelectElement>('.kind')!.value = c.kind;
  const t = el.querySelector('textarea')!;
  if (t.value !== c.text && !(document.activeElement === t && writes.get(c.id)?.dirty)) {
    const [a, b] = [t.selectionStart, t.selectionEnd]; t.value = c.text;
    if (document.activeElement === t) t.setSelectionRange(Math.min(a, c.text.length), Math.min(b, c.text.length));
  }
  t.readOnly = mode === 'shared' && readOnly;
  t.spellcheck = c.kind === 'natural' || c.kind === 'prose';
  if (c.kind === 'prose') el.querySelector('.md')!.innerHTML = prose(c.text) || '<p class="mute">Empty prose: click to write.</p>';
  el.querySelector<HTMLElement>('.tr-go')!.hidden = c.kind !== 'natural' || !sample || sampleOff;
  requestAnimationFrame(() => grow(t));
}

/** What the last run said under each cell; a cell whose output did not change keeps its drawn pictures. */
function paintOuts() {
  if (!ran) return;
  for (const c of cells) {
    const el = elOf(c.id); if (!el) continue;
    const s = ran.byCell.get(c.id), key = JSON.stringify(s ?? null), st = state(s), stEl = el.querySelector<HTMLElement>('.state')!;
    stEl.textContent = c.kind === 'natural' ? answered(cells, c.id) ? 'answered by the cell below' : sample && !sampleOff ? 'not translated yet' : 'not translated: Claude is not reachable here' : st.text;
    stEl.className = `state ${st.cls}`;
    if (drawn.get(c.id) === key) continue;
    drawn.set(c.id, key);
    const vs: View[] = [], out = el.querySelector<HTMLElement>('.out')!;
    out.innerHTML = c.kind === 'natural' ? '' : said(s, vs);
    views.set(c.id, vs);
    for (const p of out.querySelectorAll<HTMLElement>('.pic[data-view]')) void picture(p, vs[Number(p.dataset.view)]);
  }
  const r = ran.result, sign = r.status === 'ok' ? 'pass' : r.status === 'fails' ? 'fail' : 'warn';
  head.innerHTML = `<span class="verdict ${sign}">${r.status === 'ok' ? '✓' : r.status === 'fails' ? '✗' : '⚠'} ${esc(SAID[r.status])}</span><span class="mute">ran in ${r.ms.run} ms, in this page</span>`
    + [...ran.head.errors.map((e) => `<div class="err">${esc(e)}</div>`), ...ran.head.notes.map((n) => `<div class="note">${esc(n)}</div>`)].join('');
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
function add(kind: Kind, after: string | undefined, text = '') {
  const k = after ? cells.findIndex((c) => c.id === after) : cells.length - 1;
  const a = cells[k]?.pos ?? 0, b = cells[k + 1]?.pos ?? a + 2000;
  const c: Pc = { id: newId(), kind, text, pos: (a + b) / 2 };
  cells.splice(k + 1, 0, c);
  changed(c);
  const t = elOf(c.id)?.querySelector('textarea');
  if (kind === 'prose') startProse(c.id); else t?.focus();
  return c;
}
function remove(id: string) {
  cells = cells.filter((c) => c.id !== id);
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
  if (t.closest('.x')) return remove(id);
  if (t.closest('.run')) return run(0);
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
  if (e.key === 'Enter' && e.shiftKey && (e.target as HTMLElement).tagName === 'TEXTAREA') { e.preventDefault(); run(0); }
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
      + `<details class="as"${r.code ? ' open' : ''}><summary>${r.cell !== undefined ? 'translated, and checked by the kernel' : 'no cell written'}</summary><pre>${esc(r.said.join('\n'))}</pre></details>`;
  } finally {
    stopping = null;
    if (Date.now() >= sampleUntil) go.disabled = false;
    paint();
  }
}
const SAMPLE: Record<string, string> = { not_granted: 'Claude was not allowed in this view', rate_limited: 'Claude is busy: try again in a little while', cancelled: 'stopped',
  prompt_too_large: 'the notebook is too long to send', refused: 'Claude declined', session_expired: 'the session expired: reload the page' };

// ------------------------------------------------------------ the shared notebook (db): one document per cell, placed by its pos
type Write = { dirty: boolean; busy: boolean; last: string; again?: boolean; timer?: number };
const writes = new Map<string, Write>();
let shared: Pc[] = [], sharedSeen = false;
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
  const body = { kind: c.kind, text: c.text, pos: c.pos }, j = JSON.stringify(body);
  if (j === w.last) { w.dirty = false; return; }
  w.busy = true;
  try { await db.doc(`notebooks/shared/cells/${id}`).set(body); w.last = j; } catch (err) { refused(err as { code?: string }); }
  finally { w.busy = false; w.dirty = !!w.again || JSON.stringify({ kind: c.kind, text: c.text, pos: c.pos }) !== w.last; if (w.again) { w.again = false; void flush(id); } }
}
/** The shared cells as they arrive: a cell someone else changed is taken in, the one being typed in here keeps its text until its write lands. */
function heard(docs: { id: string; data(): any }[]) {
  shared = docs.map((d) => ({ id: d.id, kind: d.data().kind, text: d.data().text, pos: d.data().pos })).filter((c) => typeof c.text === 'string').sort((a, b) => a.pos - b.pos);
  sharedSeen = true;
  if (mode === 'shared') {
    const pending = (id: string) => { const w = writes.get(id); return !!w && (w.dirty || w.busy); };
    cells = [...shared.map((s) => { const mine = cells.find((c) => c.id === s.id); return mine && pending(s.id) ? mine : { ...s }; }),
      ...cells.filter((c) => pending(c.id) && !shared.some((s) => s.id === c.id))].sort((a, b) => a.pos - b.pos);
    paint(); run(300);
  }
  paintBar();
}
function joinShared() {
  mode = 'shared'; cells = shared.map((s) => ({ ...s })); drawn.clear();
  history.replaceState(null, '', '#shared');
  presence(); paint(); run(0);
}
/** Seeded from the example on screen, only when no cell is there yet, one person at a time. */
async function startShared() {
  const meta = db.doc('notebooks/shared');
  try {
    const lease = await meta.acquire({ holder: tab, ttlMs: 20_000 });
    if (!lease.acquired) { bar.querySelector('.say')!.textContent = 'Someone is starting the shared notebook: a moment.'; return; }
    const now = await db.collection('notebooks/shared/cells').get();
    if (now.empty) {
      const seed = cells.map((c) => ({ ...c, id: newId() }));
      for (const c of seed) await db.doc(`notebooks/shared/cells/${c.id}`).set({ kind: c.kind, text: c.text, pos: c.pos });
      await meta.set({ example, started: Date.now() });
      shared = seed;
    }
    joinShared();
  } catch (err) { refused(err as { code?: string }); bar.querySelector('.say')!.textContent = 'The shared notebook could not be started.'; }
}
function paintBar() {
  const n = peers.filter((p) => p.presence?.nb === here()).length;
  const who = n ? `<span class="mute">${n === 1 ? '1 other person' : `${n} other people`} here</span>` : '';
  if (!db) { bar.innerHTML = `<span class="say mute">This notebook is kept in this browser.</span>`; return; }
  if (mode === 'shared') { bar.innerHTML = `<span class="live">Shared notebook</span>${who}<span class="say mute">${readOnly ? 'You can read it; editing is not allowed for you here.' : 'Everyone here edits it; a cell someone is in shows their initials.'}</span>`; return; }
  bar.innerHTML = shared.length ? `<button type="button" class="primary" id="join">Open the shared notebook</button><span class="say mute">You are looking at an example on your own.</span>`
    : sharedSeen ? `<button type="button" class="primary" id="start">Start shared notebook from this example</button><span class="say mute">No shared notebook yet: this makes one everyone here edits.</span>` : '<span class="say mute">Looking for a shared notebook…</span>';
  bar.querySelector('#join')?.addEventListener('click', joinShared);
  bar.querySelector('#start')?.addEventListener('click', () => void startShared());
}

// ------------------------------------------------------------ who is here (room, user): ids only, names as each viewer's page resolves them
let peers: Cap[] = [];
const names = new Map<string, { name: string; color: string }>();
const here = () => mode === 'shared' ? 'shared' : `ex:${example}`;
function presence() { if (room) void room.presence({ nb: here(), cell: editing, uid: me.id }).catch(() => {}); paintBar(); }
async function heardPeers(ps: Cap[]) {
  peers = ps.filter((p) => !p.sameTab);
  const ids = [...new Set(peers.map((p) => p.by ?? p.presence?.uid).filter((x): x is string => typeof x === 'string' && !names.has(x)))];
  if (ids.length && user) { try { const got = await user.profiles(ids); for (const [id, p] of Object.entries<any>(got)) names.set(id, { name: p.name || 'Someone', color: p.color }); } catch {} }
  paintPeers(); paintBar();
}
function paintPeers() {
  for (const el of book.querySelectorAll<HTMLElement>('.peers')) el.innerHTML = '';
  for (const p of peers) {
    if (p.presence?.nb !== here() || typeof p.presence?.cell !== 'string') continue;
    const at = elOf(p.presence.cell)?.querySelector('.peers'); if (!at) continue;
    const n = names.get(p.by ?? p.presence.uid) ?? { name: p.isMe ? 'You, in another tab' : 'Someone', color: '' };
    const initials = n.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
    at.insertAdjacentHTML('beforeend', `<span class="chip" title="${esc(n.name)} is editing this cell"${n.color ? ` style="--chip:${esc(n.color)}"` : ''}>${esc(initials)}</span>`);
  }
}

// ------------------------------------------------------------ the page's own controls
const picker = $<HTMLSelectElement>('example');
picker.innerHTML = EXAMPLES.map((e) => `<option value="${e.name}">${esc(e.title)}</option>`).join('');
picker.value = example;
picker.addEventListener('change', () => void open(picker.value));
$('reset').addEventListener('click', () => void open(mode === 'shared' ? example : picker.value, true));
$('runall').addEventListener('click', () => run(0));
document.querySelector('.adds')!.addEventListener('click', (e) => { const k = (e.target as HTMLElement).closest<HTMLElement>('[data-add]')?.dataset.add; if (k) add(k as Kind, cells.at(-1)?.id); });
$('oclose').addEventListener('click', closeOverlay);
$('ofit').addEventListener('click', () => pz?.fit());
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('overlay').hidden) closeOverlay(); });

await open(example);

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
  db = d; paintBar(); if (!d) return;
  d.collection('notebooks/shared/cells').onSnapshot((snap: { docs: { id: string; data(): any }[] }) => {
    const first = !sharedSeen; heard(snap.docs);
    if (first && shared.length && (asked === '' || asked === 'shared') && mode === 'local') joinShared();
  }, () => { db = null; paintBar(); });
});
