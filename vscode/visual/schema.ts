// A schema: a tree of boxes (who is inside whom, who shows whom), links between the most concrete boxes, notes with bright arrows,
// a small table of terms on a link, and a layout per frame. A box with children opens into a frame on a double click and shuts again;
// a dragged box pushes the others aside. The graph pictures draw with it (pic-graph.ts); its layouts beyond ELK's are schema-layouts.ts.
// Runs in a browser: no node, no VS Code API.
import { wheelPx } from './pan.ts';

export type Box = {
  id: string; parent?: string | null; label: string; kind?: string; sub?: string; by?: string; open?: boolean; layout?: string;
  heat?: number; metric?: string; badge?: string; size?: { w: number; h: number }; title?: string; body?: string;
  paint?: string; icon?: string; tags?: string[]; [k: string]: unknown;
};
export type Line = { s: string; t: string; label?: string; kind?: string; show?: boolean; tags?: string[]; paint?: string; fact?: string; contract?: [string, string][] };
export type Note = { id: string; title?: string; body?: string; to: string[]; arrow?: string; parent?: string | null };
export type Schema = { nodes: Box[]; links: Line[]; notes?: Note[]; layout?: string; heat?: { label: string }; [k: string]: unknown };
type At = { x: number; y: number };
type Size = { w: number; h: number };
export type Ctx = { scope: string | null; ids: string[]; pairs: [string, string][]; size(id: string): Size; node(id: string): Box; links: Line[]; data: Schema };
export type Placed = { pos: Record<string, At>; decor?: string; stretch?: number };
export type Layout = { place(c: Ctx): Placed | Promise<Placed>; keep?(c: Ctx): Placed };
/** What the host does for a schema: a box or a line picked (null: nothing), and a word on what changed. */
export type Opts = { pick?(what: { box: string } | { line: Line[] } | null): void; say?(what: string): void; open?(id: string): boolean };
export type Handle = { fit(): void; placed(): string[]; spill(): string[]; boxes(): Element[]; lines(): Element[] };

declare const ELK: new () => { layout(g: object): Promise<{ children: { id: string; x: number; y: number }[] }> };

export const layouts: Record<string, Layout> = {};
export const layout = (name: string, l: Layout) => { layouts[name] = l; };

const BW = 190, BH = 46, PAD = 16, HEAD = 46, GX = 26, GY = 56, NOTE_W = 250, ICON = 52, NS = 'http://www.w3.org/2000/svg';
const esc = (x: unknown) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const contractTable = (c: [string, string][]) => `<table>${c.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;

let elk: InstanceType<typeof ELK> | undefined;
const elkOpts = (dir: string) => ({ 'elk.algorithm': 'layered', 'elk.direction': dir, 'elk.layered.spacing.nodeNodeBetweenLayers': String(GY), 'elk.spacing.nodeNode': String(GX) });
/** ELK's layered layout of `ids` in direction `dir`; a box with a numeric `level` is in that rank, equal levels in one. */
export async function elkPlace({ ids, pairs, size, node }: Pick<Ctx, 'ids' | 'pairs' | 'size'> & { node?: Ctx['node'] }, dir: string): Promise<Placed> {
  const level = (id: string) => node?.(id).level, ranked = ids.some((id) => typeof level(id) === 'number');
  const r = await (elk ??= new ELK()).layout({ id: 'r', layoutOptions: { ...elkOpts(dir), ...(ranked && { 'elk.partitioning.activate': 'true' }) },
    children: ids.map((id) => ({ id, width: size(id).w, height: size(id).h, ...(typeof level(id) === 'number' && { layoutOptions: { 'elk.partitioning.partition': String(level(id)) } }) })), edges: pairs.map(([s, t], i) => ({ id: 'e' + i, sources: [s], targets: [t] })) });
  return { pos: Object.fromEntries(r.children.map((c) => [c.id, { x: c.x, y: c.y }])) };
}
layout('layered-down', { place: (c) => elkPlace(c, 'DOWN') });
layout('layered-right', { place: (c) => elkPlace(c, 'RIGHT') });
layout('layered-up', { place: (c) => elkPlace(c, 'UP') });
// columns: frames side by side with no gap, all as tall as the tallest, so together they make one rectangle
const tile = ({ ids, size }: Ctx): Placed => { let x = 0; const h = Math.max(...ids.map((id) => size(id).h)), pos: Record<string, At> = {}; for (const id of ids) { pos[id] = { x, y: 0 }; x += size(id).w; } return { pos, stretch: h }; };
layout('columns', { place: tile, keep: tile });
// placed: each box where `x` and `y` put it, and the rest laid out by ELK beside them
layout('placed', { async place(c) {
  const free = c.ids.filter((id) => typeof c.node(id).x !== 'number'), r = free.length ? await elkPlace({ ...c, ids: free, pairs: c.pairs.filter((p) => free.includes(p[0]) && free.includes(p[1])) }, 'RIGHT') : { pos: {} };
  const fixed = c.ids.filter((id) => !free.includes(id)), right = Math.max(0, ...fixed.map((id) => (c.node(id).x as number) + c.size(id).w)) + (fixed.length ? GX * 2 : 0);
  return { pos: Object.fromEntries(c.ids.map((id) => [id, free.includes(id) ? { x: r.pos[id].x + right, y: r.pos[id].y } : { x: c.node(id).x as number, y: c.node(id).y as number }])) };
} });

/** The schema's stylesheet, once per document: its colours are the picture's tokens (picture.ts), so it wears VS Code's theme. */
export function schemaStyle(doc: Document): void {
  if (doc.getElementById('rofl-schema-style')) return;
  const s = doc.createElement('style'); s.id = 'rofl-schema-style';
  s.textContent = `
.sch { --frame: color-mix(in srgb, var(--p-soft) 45%, var(--p-bg)); --edge: color-mix(in srgb, var(--p-mute) 75%, var(--p-bg)); --in: #d0452f; --out: #1f7a5a;
  --k-client: var(--vscode-charts-blue, #2f5bd3); --k-service: var(--vscode-charts-green, #2f8f6f); --k-part: var(--vscode-charts-purple, #7b4fc9);
  --k-store: var(--vscode-charts-yellow, #a5793a); --k-queue: var(--vscode-charts-orange, #c2410c); --k-finding: var(--vscode-charts-red, #be123c);
  --k-derived: var(--vscode-charts-blue, #0e7490); --k-fact: var(--p-mute); --k-ext: var(--p-mute); --k-cond: var(--vscode-charts-orange, #c2410c);
  --k-loop: var(--vscode-charts-blue, #0e7490); --k-exit: var(--vscode-charts-red, #be123c); --k-start: var(--vscode-charts-green, #2f8f6f);
  --callout: #e8590c; --note: color-mix(in srgb, #f0b429 22%, var(--p-panel)); --note-line: #f0b429; --heat: #e03131; --k-box: var(--p-accent);
  position: relative; height: 420px; touch-action: none; background: var(--p-panel); }
.sch svg { width: 100%; height: 100%; display: block; cursor: grab; user-select: none; }
.sch svg.drag { cursor: grabbing; }
.sch svg:focus { outline: none; }
.sch .node { cursor: pointer; transition: transform .45s ease, opacity .3s; }
.sch .node .box { fill: var(--p-panel); stroke: var(--paint, var(--k-box)); stroke-width: 1.5; transition: width .45s ease, height .45s ease; }
.sch .node.frame rect.box { fill: var(--frame); stroke-dasharray: 5 3; }
.sch .node rect.bar { fill: var(--paint, var(--k-box)); transition: height .45s ease; }
.sch .node.sel .box { stroke-width: 3; }
.sch .node text { fill: var(--p-fg); font: 12.5px var(--p-ui, system-ui, sans-serif); pointer-events: none; }
.sch .node text.sub { fill: var(--p-mute); font: 11px var(--p-mono); }
.sch .node text.badge { fill: var(--p-accent); font-size: 11px; font-weight: 600; }
.sch .node.born { opacity: 0; }
.sch .node .ghost { fill: none; stroke: none; }
.sch .node.icon .box { fill: none; stroke: none; }
.sch .edge { fill: none; stroke: var(--paint, var(--edge)); stroke-width: 1.3; }
.sch .edge.agg { stroke-width: 2.4; }
.sch .edge.head { stroke-dasharray: none; stroke-linejoin: round; stroke-linecap: round; stroke-width: 1.8; }
.sch .edge-hit { fill: none; stroke: transparent; stroke-width: 10; cursor: help; }
.sch .pill rect { fill: var(--p-panel); stroke: var(--edge); }
.sch .pill text, .sch .elab { fill: var(--p-mute); font: 10.5px var(--p-mono); pointer-events: none; }
.sch .elab { paint-order: stroke; stroke: var(--p-panel); stroke-width: 3px; }
.sch .edges, .sch .tables { transition: opacity .25s; }
.sch .hide { opacity: 0; }
.sch svg.focus .edge, .sch svg.focus .pill, .sch svg.focus .elab { opacity: .12; }
.sch svg.focus .edge.in { stroke: var(--in); opacity: 1; }
.sch svg.focus .edge.out { stroke: var(--out); opacity: 1; }
.sch svg.focus .pill.in, .sch svg.focus .pill.out { opacity: 1; }
.sch svg.focus .node:not(.frame):not(.note) { opacity: .35; }
.sch svg.focus .node.hot, .sch svg.focus .node.nb { opacity: 1; }
.sch .pick .edge, .sch svg.focus .pick .edge { stroke: var(--p-accent) !important; stroke-width: 3.2; opacity: 1 !important; }
.sch svg.focus .pick .pill, .sch svg.focus .pick .elab { opacity: 1; }
.sch .edge.callout { stroke: var(--callout); stroke-width: 4.5; stroke-linecap: round; }
.sch svg.focus .edge.callout { opacity: 1; }
.sch .clab { fill: var(--callout); font: 600 12px var(--p-ui, system-ui, sans-serif); pointer-events: none; paint-order: stroke; stroke: var(--p-panel); stroke-width: 4px; }
.sch .node.note rect.box { fill: var(--note); stroke: var(--note-line); stroke-width: 2; }
.sch .node.note rect.bar { display: none; }
.sch .node.note .nt { font: 600 13px/1.3 var(--p-ui, system-ui, sans-serif); color: var(--p-fg); margin: 0 0 4px; }
.sch .node.note .nb { font: 12.5px/1.4 var(--p-ui, system-ui, sans-serif); color: var(--p-fg); white-space: pre-wrap; overflow-wrap: anywhere; }
.sch .node.note foreignObject div { padding: 10px 12px; box-sizing: border-box; height: 100%; overflow: hidden; }
.sch .decor text { fill: var(--p-mute); font: 12px var(--p-ui, system-ui, sans-serif); }
.sch .decor .lane { fill: var(--frame); stroke: var(--p-line); }
.sch .decor .axis { stroke: var(--p-line); }
.sch .ctab-fo { overflow: visible; pointer-events: none; }
.sch .ctab-fo:not(.full) { display: none; }
.sch .ctab, .rofl-pic .ctab { display: inline-block; max-width: 240px; background: var(--p-panel); border: 1px solid var(--p-accent); border-radius: 6px; padding: 2px 4px; font: 10.5px/1.3 var(--p-ui, system-ui, sans-serif); color: var(--p-fg); box-shadow: 0 1px 3px rgb(0 0 0 / .12); }
.sch .ctab table, .rofl-pic .ctab table { border-collapse: collapse; }
.sch .ctab th, .rofl-pic .ctab th { text-align: left; font-weight: 600; color: var(--p-mute); padding: 1px 6px 1px 2px; vertical-align: top; white-space: nowrap; }
.sch .ctab td, .rofl-pic .ctab td { padding: 1px 2px; overflow-wrap: anywhere; }
.sch .cmark rect { fill: var(--p-panel); stroke: var(--p-mute); stroke-width: 1; }
.sch .cmark path { stroke: var(--p-mute); stroke-width: 1.2; }
.sch .cmark { cursor: pointer; }
.sch svg.focus g:not(.pick) > .cmark { opacity: .35; }
.sch .pick .cmark rect, .sch .pick .cmark path { stroke: var(--p-accent); }
.sch .failing .box, .sch .dangling .box, .sch g.failing .edge, .sch g.dangling .edge { stroke: var(--p-fail); stroke-width: 3; }
.sch .failing .bar, .sch .dangling .bar { fill: var(--p-fail); }
.sch .dangling .box, .sch g.dangling .edge { stroke-dasharray: 5 3; }
.sch .blind .box { fill: url(#sch-hatch); stroke: var(--p-warn); stroke-dasharray: 5 3; }
.sch g.blind .edge { stroke: var(--p-warn); stroke-dasharray: 5 3; }
.sch .unknown .box, .sch g.unknown .edge { stroke-dasharray: 2 3; }
.sch .unknown text { fill: var(--p-mute); }
.sch .gone { opacity: .45; }
.sch .gone .box, .sch g.gone .edge { stroke-dasharray: 5 5; }
.sch .new .box, .sch g.new .edge { stroke: var(--p-pass); stroke-width: 3; }
.sch .collapsed .box { stroke-width: 3.5; }
.sch .entry .box { fill: var(--p-fg); stroke: none; }
.sch g.attack .edge { stroke: var(--p-fail); stroke-dasharray: 5 3; }
.sch .final .box { stroke-width: 4; }
.sch .current .box { stroke: var(--p-accent); stroke-width: 3; }
.sch .given .box { stroke-dasharray: none; }
@media (prefers-reduced-motion: reduce) { .sch .node, .sch .node rect, .sch .edges { transition: none; } }`;
  doc.head.append(s);
}

/** Draws `data` into `host`, which it fills; what is drawn can be read back from the handle. */
export async function schema(host: HTMLElement, data: Schema, opts: Opts = {}): Promise<Handle> {
  const doc = host.ownerDocument;
  schemaStyle(doc);
  host.classList.add('sch');
  host.innerHTML = `<svg><defs><marker id="sch-ahc" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path d="M0,0L10,5L0,10z" style="fill:var(--callout)"></path></marker><pattern id="sch-hatch" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M-2 2L2 -2M0 8L8 0M6 10L10 6" stroke="var(--p-warn)" stroke-width="1.4"/></pattern></defs><g class="vp"><g class="decor"></g><g class="frames"></g><g class="edges"></g><g class="nodes"></g><g class="tables"></g></g></svg>`;
  const svg = host.querySelector('svg')!, vp = svg.querySelector<SVGGElement>('.vp')!, [gD, gF, gE, gN, gT] = ['decor', 'frames', 'edges', 'nodes', 'tables'].map((c) => vp.querySelector<SVGGElement>('.' + c)!);
  const N: Record<string, Box & { parent: string | null }> = {}, kids: Record<string, string[]> = {}, prem: Record<string, string[]> = {};
  const LINKS: Line[] = [...data.links], open = new Set<string>(), laid = new Set<string>(), els = new Map<string, SVGGElement>();
  const rel: Record<string, At> = {}, base: Record<string, At> = {}, shifts: Record<string, Record<string, At>> = {}, size: Record<string, Size> = {}, decor: Record<string, string> = {};
  type Shown = { key: string; s: string; t: string; kind?: string; list: Line[] };
  let view = { x: 0, y: 0, k: 1 }, hot: State = null, sel: State = null, busy = false, raf = 0, drawn = new Map<string, Shown>();
  type State = { box: string } | { link: string } | null;
  let boxDrag: { id: string; x: number; y: number; px: number; py: number; moved: boolean; pid: number } | null = null;

  const hidden = (id: string): boolean => !!N[id].by && !(open.has(N[id].by!) && visible(N[id].by!));
  const visible = (id: string): boolean => { if (hidden(id)) return false; for (let p = N[id].parent; p; p = N[p].parent) if (!open.has(p) || hidden(p)) return false; return true; };
  const rep = (id: string) => { if (!N[id]) return null; let r = id; for (let p = N[id].parent; p; p = N[p].parent) if (!open.has(p)) r = p; return visible(r) ? r : null; };
  const depth = (id: string) => { let d = 0; for (let p = N[id].parent; p; p = N[p].parent) d++; return d; };
  const within = (id: string, scope: string | null) => { for (let p: string | null = id; p; p = N[p].parent) if (N[p].parent === scope) return p; return null; };
  const isUnder = (d: string, a: string) => { for (let p = N[d].parent; p; p = N[p].parent) if (p === a) return true; return false; };
  let ruler: HTMLElement | undefined;
  const measure = (cls: string, html: string, style = '') => { ruler ??= doc.body.appendChild(Object.assign(doc.createElement('div'), { className: 'sch' }));
    ruler.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0;height:auto'; ruler.innerHTML = `<div class="${cls}" style="${style}">${html}</div>`;
    const r = (ruler.firstChild as HTMLElement).getBoundingClientRect(); return { w: Math.ceil(r.width), h: Math.ceil(r.height) }; };
  const natural = (id: string): Size => { const n = N[id]; if (n.size) return n.size; if (n.icon) return { w: ICON + 40, h: ICON + 18 };
    if (n.kind === 'note') return (n.size = { w: NOTE_W, h: measure('node note', `<p class="nt" style="${n.title ? '' : 'display:none'}">${esc(n.title)}</p><div class="nb">${esc(n.body)}</div>`, `width:${NOTE_W}px;padding:10px 12px;box-sizing:border-box`).h + 20 });
    return { w: BW, h: BH }; };
  const sz = (id: string) => size[id] ?? natural(id);
  const homeOf = (id: string) => { const h = { ...base[id] }; for (const f in shifts) { const s = shifts[f][id]; if (s) { h.x += s.x; h.y += s.y; } } return h; };
  const abs = (id: string): At => { const r = rel[id], p = N[id].parent; if (!p) return { ...r }; const a = abs(p); return { x: a.x + PAD + r.x, y: a.y + HEAD + r.y }; };
  const shown = () => Object.keys(N).filter((id) => rel[id] && visible(id));
  const shownIn = (scope: string | null) => (kids[scope ?? ''] ?? []).filter((id) => rel[id] && visible(id));
  const isFrame = (id: string) => open.has(id) && !!kids[id];
  const keyOf = (s: string, t: string, kind?: string) => s + '>' + t + '>' + (kind ?? '');
  const layoutOf = (scope: string | null) => (scope ? N[scope].layout : data.layout) ?? 'layered-down';
  const say = (what: string) => opts.say?.(`${what} · ${shown().filter((id) => !isFrame(id)).length} boxes in sight`);

  for (const n of data.nodes) N[n.id] = { ...n, parent: n.parent ?? null };
  for (const n of Object.values(N)) { (kids[n.parent ?? ''] ??= []).push(n.id); if (n.by) (prem[n.by] ??= []).push(n.id); }
  for (const n of data.notes ?? []) { const at = n.to.find((t) => N[t]);
    N[n.id] = { id: n.id, parent: n.parent !== undefined ? n.parent : at ? N[at].parent : null, label: n.title ?? '', title: n.title, body: n.body, kind: 'note' };
    (kids[N[n.id].parent ?? ''] ??= []).push(n.id);
    for (const t of n.to) if (N[t]) LINKS.push({ s: n.id, t, label: n.arrow ?? '', kind: 'callout' }); }

  const ctxOf = (scope: string | null, ids: string[]): Ctx => {
    const set = new Set(ids), pairs = new Set<string>();
    for (const { s, t } of LINKS) { if (!N[s] || !N[t]) continue; const a = within(s, scope), b = within(t, scope); if (a && b && a !== b && set.has(a) && set.has(b)) pairs.add(a + '\u0000' + b); }
    return { scope, ids, pairs: [...pairs].map((k) => k.split('\u0000') as [string, string]), size: sz, node: (id) => N[id], links: LINKS, data };
  };
  const stretch = (ids: string[], r: Placed) => { if (r.stretch) for (const id of ids) size[id] = { w: sz(id).w, h: r.stretch }; };
  async function layoutScope(scope: string | null): Promise<void> {
    const ids = (kids[scope ?? ''] ?? []).filter((id) => !hidden(id)), L = layouts[layoutOf(scope)] ?? layouts['layered-down'];
    const put = (r: Placed) => { for (const id of ids) { const p = r.pos[id] ?? { x: 0, y: 0 }; rel[id] = { ...p }; base[id] = { ...p }; } stretch(ids, r); decor[scope ?? ''] = r.decor ?? ''; };
    put(await L.place(ctxOf(scope, ids)));
    const inner = ids.filter((id) => N[id].open && kids[id]);
    for (const id of inner) { open.add(id); await layoutScope(id); fitFrame(id); }
    if (inner.length) put(await L.place(ctxOf(scope, ids)));
    laid.add(scope ?? '');
  }
  function fitFrame(id: string) {
    const cs = shownIn(id); if (!cs.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of cs) { const s = sz(c); x0 = Math.min(x0, rel[c].x); y0 = Math.min(y0, rel[c].y); x1 = Math.max(x1, rel[c].x + s.w); y1 = Math.max(y1, rel[c].y + s.h); }
    for (const c of cs) { rel[c].x -= x0; rel[c].y -= y0; base[c].x -= x0; base[c].y -= y0; }
    rel[id].x += x0; rel[id].y += y0; base[id].x += x0; base[id].y += y0;
    size[id] = { w: Math.max(natural(id).w, x1 - x0 + 2 * PAD), h: y1 - y0 + HEAD + PAD };
  }
  // boxes that overlap are pushed apart, each pulled back towards where the layout put it; a rigid box stays put
  function relax(scope: string | null, rigid: Set<string>) {
    const L = layouts[layoutOf(scope)], ids = shownIn(scope);
    if (L?.keep) { const r = L.keep(ctxOf(scope, ids)); for (const id of ids) if (r.pos[id]) { rel[id] = { ...r.pos[id] }; base[id] = { ...r.pos[id] }; } stretch(ids, r); if (r.decor != null) decor[scope ?? ''] = r.decor; return; }
    const home = Object.fromEntries(ids.map((id) => [id, homeOf(id)]));
    for (let it = 0; it < 600; it++) {
      const k = it < 400 ? 0.15 : 0, f = Object.fromEntries(ids.map((id) => [id, { x: 0, y: 0 }]));
      for (const id of ids) { f[id].x += (home[id].x - rel[id].x) * k; f[id].y += (home[id].y - rel[id].y) * k; }
      let any = false;
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j]; if (rigid.has(a) && rigid.has(b)) continue;
        const A = sz(a), B = sz(b), dx = rel[b].x + B.w / 2 - rel[a].x - A.w / 2, dy = rel[b].y + B.h / 2 - rel[a].y - A.h / 2;
        const ox = (A.w + B.w) / 2 + GX - Math.abs(dx), oy = (A.h + B.h) / 2 + GY / 2 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue; any = true;
        const wa = rigid.has(a) ? 0 : rigid.has(b) ? 1 : 0.5, wb = 1 - wa;
        if (Math.abs(dx) / (A.w + B.w) > Math.abs(dy) / (A.h + B.h)) { const s = (dx >= 0 ? 1 : -1) * ox; f[a].x -= s * wa; f[b].x += s * wb; } else { const s = (dy >= 0 ? 1 : -1) * oy; f[a].y -= s * wa; f[b].y += s * wb; }
      }
      for (const id of ids) if (!rigid.has(id)) { rel[id].x += f[id].x; rel[id].y += f[id].y; }
      if (k === 0 && !any) break;
    }
  }
  function ripple(id: string, keepPlace: boolean, block: string[] = []) {
    for (let cur = id; ; cur = N[cur].parent!) {
      const scope = N[cur].parent, rigid = new Set<string>();
      if (keepPlace || cur !== id) rigid.add(cur);
      if (cur === id) for (const b of block) rigid.add(b);
      relax(scope, rigid);
      if (!scope) break;
      fitFrame(scope);
    }
  }
  async function expand(id: string) {
    const old = sz(id);
    open.add(id); if (!laid.has(id)) await layoutScope(id); fitFrame(id);
    const now = sz(id); rel[id].x -= (now.w - old.w) / 2; base[id].x -= (now.w - old.w) / 2;
    const c = { x: rel[id].x + now.w / 2, y: rel[id].y }, gw = (now.w - old.w) / 2, gh = now.h - old.h, s: Record<string, At> = {};
    for (const o of shownIn(N[id].parent)) { if (o === id) continue; const q = sz(o), u = (rel[o].x + q.w / 2 - c.x) / (now.w + q.w), v = (rel[o].y + q.h / 2 - c.y - old.h / 2) / (old.h + q.h);
      s[o] = Math.abs(u) * 2 > Math.abs(v) ? { x: Math.sign(u) * gw, y: 0 } : { x: 0, y: v > 0 ? gh : 0 }; rel[o].x += s[o].x; rel[o].y += s[o].y; }
    shifts[id] = s;
    ripple(id, true); say(`opened ${N[id].label}`);
  }
  function collapse(id: string) {
    const old = sz(id);
    for (const d of Object.keys(N)) if (open.has(d) && d !== id && isUnder(d, id)) { open.delete(d); delete size[d]; delete shifts[d]; }
    open.delete(id); delete size[id]; delete shifts[id]; rel[id].x += (old.w - natural(id).w) / 2; base[id].x += (old.w - natural(id).w) / 2;
    ripple(id, false); say(`shut ${N[id].label}`);
  }
  // premises: boxes shown `by` another, revealed above it, laid out together with it
  async function reveal(id: string) {
    open.add(id);
    const fresh = Object.keys(N).filter((x) => !rel[x] && N[x].parent === N[id].parent && visible(x)), set = [...fresh, id];
    const r = await elkPlace({ ids: set, pairs: LINKS.filter(({ s, t }) => set.includes(s) && set.includes(t)).map(({ s, t }) => [s, t]), size: sz }, 'DOWN');
    const dx = rel[id].x - r.pos[id].x, dy = rel[id].y - r.pos[id].y;
    for (const x of fresh) { rel[x] = { x: r.pos[x].x + dx, y: r.pos[x].y + dy }; base[x] = { ...rel[x] }; }
    ripple(id, true, fresh); say(`premises of ${N[id].label}`);
  }
  function conceal(id: string) {
    open.delete(id);
    for (let more = true; more; ) { more = false;
      for (const x of Object.keys(N)) if (rel[x] && N[x].by && hidden(x)) { more = true; for (const d of [x, ...Object.keys(N).filter((d) => isUnder(d, x))]) { delete rel[d]; delete base[d]; delete size[d]; delete shifts[d]; open.delete(d); laid.delete(d); } } }
    ripple(id, true); say(`premises of ${N[id].label} hidden`);
  }
  async function toggle(id: string) {
    if (opts.open?.(id)) return;
    if (busy || !(kids[id] || prem[id])) return; busy = true;
    try {
      const was = open.has(id);
      if (kids[id]) { if (was) collapse(id); else await expand(id); } else if (was) conceal(id); else await reveal(id);
      render(true); if (!was && kids[id]) setTimeout(() => show([id]), 480);
    } finally { busy = false; }
  }

  function shownLinks(): Shown[] {
    const g = new Map<string, Shown>();
    for (const l of LINKS) { const s = rep(l.s), t = rep(l.t); if (!s || !t || s === t) continue; const k = keyOf(s, t, l.kind); if (!g.has(k)) g.set(k, { key: k, s, t, kind: l.kind, list: [] }); g.get(k)!.list.push(l); }
    return [...g.values()];
  }
  type Hit = [string, At, Size];
  let grid: Record<string, Hit[]> = {};
  const buildGrid = (boxes: Hit[]) => { grid = {}; for (const [id, q, s] of boxes) for (let gx = Math.floor((q.x - 8) / 200); gx <= Math.floor((q.x + s.w + 8) / 200); gx++) for (let gy = Math.floor((q.y - 8) / 100); gy <= Math.floor((q.y + s.h + 8) / 100); gy++) (grid[gx + ',' + gy] ??= []).push([id, q, s]); };
  const hit = (x: number, y: number, skip: Set<string>) => { for (const h of grid[Math.floor(x / 200) + ',' + Math.floor(y / 100)] ?? []) { const [id, q, s] = h; if (skip.has(id)) continue; if (x > q.x - 6 && x < q.x + s.w + 6 && y > q.y - 6 && y < q.y + s.h + 6) return h; } return null; };
  type End = At & { h?: boolean; up?: boolean };
  // each end leaves or enters along its own side, so the last stretch is square to the box and the arrow shows
  const bez = (a: End, b: End): At[] => {
    const dx = Math.max(30, Math.abs(b.x - a.x) / 2) * Math.sign(b.x - a.x || 1), dy = Math.max(30, Math.abs(b.y - a.y) / 2);
    return [a, a.h ? { x: a.x + dx, y: a.y } : { x: a.x, y: a.y + dy }, b.h ? { x: b.x - dx, y: b.y } : { x: b.x, y: b.y - dy }, b]; };
  const at = ([p0, p1, p2, p3]: At[], t: number) => { const u = 1 - t; return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y }; };
  const head = (d: string) => {
    const m = d.match(/(-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+)$/); if (!m) return '';
    const [cx, cy, ex, ey] = m.slice(1).map(Number), len = Math.hypot(ex - cx, ey - cy) || 1, ux = (ex - cx) / len, uy = (ey - cy) / len, L = 9, W = 5;
    return `M${ex - ux * L - uy * W},${ey - uy * L + ux * W} L${ex},${ey} L${ex - ux * L + uy * W},${ey - uy * L - ux * W}`; };
  // a line that would cross a box goes round it, by a waypoint beside the box
  const route = (a: End, b: End, skip: Set<string>, d: number): End[] => {
    if (d < 8) { const c = bez(a, b);
      for (let t = 0.04; t < 0.97; t += 0.04) { const q = at(c, t), h = hit(q.x, q.y, skip); if (!h) continue;
        const [id, p, s] = h, mid = (a.x + b.x) / 2, left = p.x - 12, right = p.x + s.w + 12;
        const wp: End = { x: Math.abs(left - mid) <= Math.abs(right - mid) ? left : right, y: p.y + s.h / 2 }, s2 = new Set(skip).add(id);
        if (a.h) { wp.x = q.x; wp.y = Math.abs(p.y - 12 - q.y) < Math.abs(p.y + s.h + 12 - q.y) ? p.y - 12 : p.y + s.h + 12; wp.h = true; }
        return [...route(a, wp, s2, d + 1), ...route(wp, b, s2, d + 1).slice(1)]; } }
    return [a, b];
  };
  const pathOf = (pts: End[]) => { let d = `M${pts[0].x},${pts[0].y}`; for (let i = 1; i < pts.length; i++) { const [, c1, c2, e] = bez(pts[i - 1], pts[i]); d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${e.x},${e.y}`; } return d; };
  const along = (pts: At[], f: number): At => {
    const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y)); let d = f * seg.reduce((a, b) => a + b, 0);
    for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const k = seg[i] ? Math.min(1, d / seg[i]) : 0; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k }; } d -= seg[i]; }
    return pts[0];
  };
  // a thing on a line (a contract's mark, a label) goes where along it it covers the least of the boxes and of what is already placed
  const placeOn = (curve: (f: number) => At, w: number, h: number, taken: (At & Size)[]) => {
    const over = (r: At & Size) => taken.reduce((n, o) => n + Math.max(0, Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x)) * Math.max(0, Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y)), 0);
    let best: { r: At & Size; n: number } | undefined;
    for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) { const q = curve(f), r = { x: q.x - w / 2, y: q.y - h / 2, w, h }, n = over(r); if (!best || n < best.n) best = { r, n }; if (!n) break; }
    taken.push(best!.r); return best!.r;
  };
  function drawDecor() {
    gD.textContent = '';
    for (const [scope, s] of Object.entries(decor)) { if (!s || (scope && !(isFrame(scope) && visible(scope)))) continue;
      const o = scope ? abs(scope) : { x: 0, y: 0 }, g = doc.createElementNS(NS, 'g');
      if (scope) g.setAttribute('transform', `translate(${o.x + PAD},${o.y + HEAD})`); g.innerHTML = s; gD.appendChild(g); }
  }
  function drawEdges() {
    gE.textContent = ''; gT.textContent = ''; drawn = new Map(); drawDecor();
    const ids = shown(), A = Object.fromEntries(ids.map((id) => [id, abs(id)]));
    buildGrid(ids.filter((id) => !isFrame(id)).map((id) => [id, A[id], sz(id)]));
    const taken = ids.filter((id) => !isFrame(id)).map((id) => ({ ...A[id], ...sz(id) }));
    const ls = shownLinks().filter((l) => A[l.s] && A[l.t]), out: Record<string, Shown[]> = {}, inn: Record<string, Shown[]> = {}, port = new Map<Shown, { sx: number; tx: number }>();
    for (const l of ls) { (out[l.s] ??= []).push(l); (inn[l.t] ??= []).push(l); }
    const cx = (id: string) => A[id].x + sz(id).w / 2;
    for (const [id, l] of Object.entries(out)) { l.sort((a, b) => cx(a.t) - cx(b.t)); l.forEach((e, k) => port.set(e, { sx: A[id].x + sz(id).w * (k + 1) / (l.length + 1), tx: 0 })); }
    for (const [id, l] of Object.entries(inn)) { l.sort((a, b) => cx(a.s) - cx(b.s)); l.forEach((e, k) => (port.get(e)!.tx = A[id].x + sz(id).w * (k + 1) / (l.length + 1))); }
    for (const l of ls) {
      const pr = port.get(l)!, S = sz(l.s), T = sz(l.t), below = A[l.t].y >= A[l.s].y + S.h + 16, above = A[l.t].y + T.h + 16 <= A[l.s].y, one = l.list.length === 1 ? l.list[0] : undefined;
      let a: End = { x: pr.sx, y: A[l.s].y + S.h }, b: End = { x: pr.tx, y: A[l.t].y - 2 };
      if (above && l.kind === 'callout') { a = { x: A[l.s].x + S.w / 2, y: A[l.s].y, up: true }; b = { x: A[l.t].x + T.w / 2, y: A[l.t].y + T.h + 4 }; }
      else if (!below) { const right = A[l.t].x + T.w / 2 > A[l.s].x + S.w / 2;
        a = { x: right ? A[l.s].x + S.w : A[l.s].x, y: A[l.s].y + S.h / 2, h: true }; b = { x: right ? A[l.t].x - 2 : A[l.t].x + T.w + 2, y: A[l.t].y + T.h / 2, h: true }; }
      if (l.kind === 'callout' && !a.h && !a.up) b.y -= 4;
      const pts = l.kind === 'callout' ? [a, b] : route(a, b, new Set([l.s, l.t]), 0), d = a.up ? `M${a.x},${a.y} C${a.x},${a.y - 40} ${b.x},${b.y + 40} ${b.x},${b.y}` : pathOf(pts);
      const curve = pts.length > 2 ? (f: number) => along(pts, f) : (f: number) => at(bez(a, b), f);
      const g = doc.createElementNS(NS, 'g'); g.dataset.s = l.s; g.dataset.t = l.t; g.dataset.key = l.key;
      g.setAttribute('class', ['line', ...one?.tags ?? []].join(' '));
      if (one?.paint) g.style.setProperty('--paint', one.paint);
      const kind = l.kind ? ' ' + l.kind : '';
      g.innerHTML = `<path class="edge${l.list.length > 1 ? ' agg' : ''}${kind}" d="${d}"${l.kind === 'callout' ? ' marker-end="url(#sch-ahc)"' : ''}></path>${l.kind === 'callout' ? '' : `<path class="edge head${kind}" d="${head(d)}"></path>`}<path class="edge-hit" d="${d}"></path>`;
      if (!one) { const q = curve(0.5);
        g.insertAdjacentHTML('beforeend', `<g class="pill"><rect x="${q.x - 15}" y="${q.y - 9}" width="30" height="18" rx="9"></rect><text x="${q.x}" y="${q.y + 4}" text-anchor="middle">×${l.list.length}</text></g>`); }
      else if (one.contract?.length) { const t = contractTable(one.contract), m = measure('ctab', t), r = placeOn(curve, 14, 14, taken), x = r.x + 7, y = r.y + 7;
        g.insertAdjacentHTML('beforeend', `<g class="cmark"><rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="3"></rect><path d="M${x - 4},${y - 2}h8M${x - 4},${y + 1}h8M${x - 4},${y + 4}h8"></path></g>`);
        gT.insertAdjacentHTML('beforeend', `<foreignObject class="ctab-fo" data-key="${esc(l.key)}" x="${x - m.w / 2 - 1}" y="${y + 10}" width="${m.w + 2}" height="${m.h + 2}"><div xmlns="http://www.w3.org/1999/xhtml" class="ctab">${t}</div></foreignObject>`); }
      else if (one.label && (l.kind === 'flow' || l.kind === 'callout' || one.show)) { const text = one.label.slice(0, 40), w = 6.2 * text.length + 8, r = l.kind === 'callout' ? { x: at(bez(pts[0], pts[pts.length - 1]), 0.5).x - w / 2, y: at(bez(pts[0], pts[pts.length - 1]), 0.5).y - 7, w, h: 14 } : placeOn(curve, w, 14, taken), e = doc.createElementNS(NS, 'text');
        e.setAttribute('class', l.kind === 'callout' ? 'clab' : 'elab'); e.setAttribute('x', String(r.x + 4)); e.setAttribute('y', String(r.y + 11)); e.textContent = text; g.appendChild(e); }
      for (const e of g.querySelectorAll('.edge-hit, .cmark')) { e.addEventListener('mouseenter', () => { if (!boxDrag) apply({ link: l.key }); }); e.addEventListener('mouseleave', () => { if (!boxDrag) apply(sel); }); }
      drawn.set(l.key, l); gE.appendChild(g);
    }
    apply(hot);
  }

  function cut(t: SVGTextContentElement, max: number) { const full = t.textContent ?? ''; for (let n = full.length; t.getComputedTextLength() > max && n > 3; n--) t.textContent = full.slice(0, n) + '…'; }
  function nodeEl(id: string) {
    const n = N[id], g = doc.createElementNS(NS, 'g'), hex = n.kind === 'cond' || n.kind === 'loop', pill = n.kind === 'start' || n.kind === 'exit' || n.kind === 'entry', s = natural(id), small = s.w < 80, x = small ? s.w / 2 : hex || pill ? 18 : 14;
    g.setAttribute('class', ['node', 'born', n.kind === 'note' ? 'note' : '', n.icon ? 'icon' : '', n.kind === 'entry' ? 'entry' : '', ...n.tags ?? []].filter(Boolean).join(' ')); g.dataset.id = id;
    if (n.paint) g.style.setProperty('--paint', n.paint); else if (n.kind && n.kind !== 'note') g.style.setProperty('--paint', `var(--k-${n.kind}, var(--k-box))`);
    if (n.kind === 'note') {
      g.innerHTML = `<rect class="box" rx="8"></rect><rect class="bar"></rect><foreignObject x="0" y="0" width="${s.w}" height="${s.h}"><div xmlns="http://www.w3.org/1999/xhtml"><p class="nt"></p><div class="nb"></div></div></foreignObject>`;
      g.querySelector('.nt')!.textContent = n.title ?? ''; g.querySelector('.nb')!.textContent = n.body ?? '';
    } else if (n.icon) {
      g.innerHTML = `<rect class="box" rx="6"></rect><image href="${esc(n.icon)}" x="${(s.w - ICON) / 2}" y="0" width="${ICON}" height="${ICON}"></image><text x="${s.w / 2}" y="${ICON + 13}" text-anchor="middle"></text><text class="badge" text-anchor="end" y="12"></text>`;
      g.querySelector('text')!.textContent = n.label;
    } else {
      g.innerHTML = (hex ? `<polygon class="box" points="12,0 ${s.w - 12},0 ${s.w},${s.h / 2} ${s.w - 12},${s.h} 12,${s.h} 0,${s.h / 2}"></polygon><rect class="box ghost" rx="6"></rect><rect class="bar ghost" width="6" rx="2"></rect>`
        : `<rect class="box" rx="${pill ? s.h / 2 : 6}"${n.heat != null ? ` style="fill:color-mix(in srgb, var(--heat) ${Math.round(Math.min(1, n.heat) * 60)}%, var(--p-panel))"` : ''}></rect><rect class="bar${pill ? ' ghost' : ''}" width="6" rx="2"></rect>`)
        + (n.kind === 'entry' ? '' : `<text x="${x}" y="${n.sub ? 19 : s.h / 2 + 4}"${small ? ' text-anchor="middle"' : ''}></text><text class="sub" x="${x}" y="36"></text><text class="badge" text-anchor="end" y="19"></text>`);
      const t = g.querySelectorAll('text'); if (t.length) { t[0].textContent = n.label; t[1].textContent = n.sub ?? ''; }
    }
    g.addEventListener('mouseenter', () => { if (!boxDrag) apply({ box: id }); }); g.addEventListener('mouseleave', () => { if (!boxDrag) apply(sel); });
    g.addEventListener('pointerdown', (ev) => { if (ev.button !== 0) return; ev.stopPropagation(); boxDrag = { id, x: ev.clientX, y: ev.clientY, px: rel[id].x, py: rel[id].y, moved: false, pid: ev.pointerId }; });
    return g;
  }
  function drawNodes() {
    const ids = new Set(shown());
    for (const [id, g] of els) if (!ids.has(id)) { g.remove(); els.delete(id); }
    for (const id of [...ids].sort((a, b) => depth(a) - depth(b))) {
      let g = els.get(id); if (!g) { g = nodeEl(id); els.set(id, g); }
      const fr = isFrame(id), parent = fr ? gF : gN; if (g.parentNode !== parent || fr) parent.appendChild(g);
      const a = abs(id), s = sz(id);
      g.style.transform = `translate(${a.x}px, ${a.y}px)`; g.classList.toggle('frame', fr);
      const poly = g.querySelector<SVGElement>('polygon.box'); if (poly) { poly.style.display = fr ? 'none' : ''; for (const r of g.querySelectorAll('rect')) r.classList.toggle('ghost', !fr); }
      const box = g.querySelector<SVGRectElement>('rect.box')!; box.style.width = s.w + 'px'; box.style.height = s.h + 'px';
      const bar = g.querySelector<SVGRectElement>('rect.bar'); if (bar) bar.style.height = (fr ? HEAD - 6 : s.h) + 'px';
      const b = g.querySelector('.badge');
      if (b) { b.setAttribute('x', String(s.w - 10)); b.textContent = kids[id] ? (fr ? (N[id].open ? '' : '▾') : `▸ ${kids[id].length}`) : prem[id] ? (open.has(id) ? '▼' : `▲ ${prem[id].length}`) : (N[id].badge ?? ''); }
      if (!g.dataset.fit && N[id].kind !== 'note' && natural(id).w >= 80) { g.dataset.fit = '1'; for (const t of g.querySelectorAll<SVGTextElement>('text:not(.badge)')) cut(t, natural(id).w - (N[id].icon ? 4 : kids[id] || prem[id] || N[id].badge ? 50 : 20)); }
    }
    requestAnimationFrame(() => { for (const g of els.values()) g.classList.remove('born'); });
  }
  function render(animate: boolean) {
    drawNodes();
    if (!animate) { drawEdges(); return; }
    gE.classList.add('hide'); gT.classList.add('hide'); gD.style.opacity = '0';
    setTimeout(() => { drawEdges(); gE.classList.remove('hide'); gT.classList.remove('hide'); gD.style.opacity = '1'; }, 470);
  }
  function apply(state: State) {
    if (state && 'box' in state && !(N[state.box] && rel[state.box] && visible(state.box))) state = null;
    if (state && 'link' in state && !drawn.has(state.link)) state = null;
    hot = state; svg.classList.toggle('focus', !!state);
    for (const g of gE.children) { g.classList.remove('pick'); g.querySelectorAll('.edge, .pill').forEach((e) => e.classList.remove('in', 'out')); }
    for (const g of els.values()) g.classList.remove('hot', 'nb', 'sel');
    if (sel && 'box' in sel) els.get(sel.box)?.classList.add('sel');
    const line = (k: string) => gE.querySelector(`g[data-key="${CSS.escape(k)}"]`);
    if (sel && 'link' in sel && drawn.has(sel.link)) line(sel.link)?.classList.add('pick');
    const full = new Set([sel, state].flatMap((x) => x && 'link' in x ? [x.link] : []));
    for (const fo of gT.children) fo.classList.toggle('full', full.has((fo as HTMLElement).dataset.key!));
    if (!state) return;
    if ('box' in state) { const id = state.box; els.get(id)?.classList.add('hot');
      for (const g of gE.children as HTMLCollectionOf<SVGGElement>) { const cls = g.dataset.t === id ? 'in' : g.dataset.s === id ? 'out' : null; if (!cls) continue;
        g.querySelectorAll('.edge, .pill').forEach((e) => e.classList.add(cls)); els.get(cls === 'in' ? g.dataset.s! : g.dataset.t!)?.classList.add('nb'); }
      return; }
    const l = drawn.get(state.link)!; line(l.key)?.classList.add('pick');
    els.get(l.s)?.classList.add('hot'); els.get(l.t)?.classList.add('hot');
  }

  // hovering only lights the canvas; a click picks, and the host is told what
  const picked = () => opts.pick?.(!sel ? null : 'box' in sel ? { box: sel.box } : { line: drawn.get(sel.link)?.list ?? [] });
  const applyView = () => { vp.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`; };
  const bounds = (ids: string[]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) { const a = abs(id), s = sz(id); x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y); x1 = Math.max(x1, a.x + s.w); y1 = Math.max(y1, a.y + s.h); }
    return { x0, y0, x1, y1 }; };
  function show(ids: string[]) {
    const r = svg.getBoundingClientRect(), { x0, y0, x1, y1 } = bounds(ids);
    if (x0 * view.k + view.x >= 0 && y0 * view.k + view.y >= 0 && x1 * view.k + view.x <= r.width && y1 * view.k + view.y <= r.height) return;
    const k = Math.min(view.k, r.width / (x1 - x0 + 60), r.height / (y1 - y0 + 60));
    vp.style.transition = 'transform .4s ease'; view = { k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: (r.height - (y1 - y0) * k) / 2 - y0 * k }; applyView();
    setTimeout(() => (vp.style.transition = ''), 420);
  }
  function fit() {
    const r = svg.getBoundingClientRect(); let { x0, y0, x1, y1 } = bounds(shown());
    try { const b = gD.getBBox(); if (b.width) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); } } catch { /* not drawn yet */ }
    if (!isFinite(x0) || !r.width) return;
    const k = Math.min(r.width / (x1 - x0 + 40), r.height / (y1 - y0 + 40), host.closest('.full, #ostage') ? 3 : 1.1);
    view = { k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: (r.height - (y1 - y0) * k) / 2 - y0 * k }; applyView();
  }

  // the left button picks and moves boxes, a double click opens and shuts them; the right or middle button moves the view; the wheel zooms
  svg.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey && !host.matches(':focus-within') && !host.closest('.pans')) return; e.preventDefault(); const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = Math.min(3, Math.max(0.1, view.k * Math.exp(-wheelPx(e, r.height) * (e.ctrlKey ? 0.0075 : 0.0015))));
    if (r.width) { view.x = mx - (mx - view.x) * (k / view.k); view.y = my - (my - view.y) * (k / view.k); view.k = k; applyView(); } }, { passive: false });
  let drag: { x: number; y: number; vx: number; vy: number; moved: boolean; pick: boolean; on?: string; pid: number } | null = null, tap = { id: '', t: 0 };
  svg.tabIndex = 0;
  svg.addEventListener('mouseleave', () => { if (!boxDrag && !drag) apply(sel); });
  svg.addEventListener('pointerdown', (e) => { svg.focus({ preventScroll: true }); if (e.button === 0 && (e.target as Element).closest('.node')) return; if (e.button === 1) e.preventDefault();
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, pick: e.button === 0, on: (e.target as Element).closest<SVGGElement>('g[data-key]')?.dataset.key, pid: e.pointerId }; });
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('pointermove', (e) => {
    if (boxDrag) { const dx = (e.clientX - boxDrag.x) / view.k, dy = (e.clientY - boxDrag.y) / view.k;
      if (!boxDrag.moved && Math.hypot(dx, dy) < 4) return;
      if (!boxDrag.moved) { for (const g of els.values()) g.style.transition = 'none'; svg.setPointerCapture(boxDrag.pid); }
      boxDrag.moved = true; rel[boxDrag.id] = { x: boxDrag.px + dx, y: boxDrag.py + dy }; drawNodes();
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawEdges(); }); return; }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
    if (!drag.moved) { drag.moved = true; svg.classList.add('drag'); svg.setPointerCapture(drag.pid); }
    view.x = drag.vx + e.clientX - drag.x; view.y = drag.vy + e.clientY - drag.y; applyView();
  });
  svg.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved && drag.pick) { sel = drag.on ? { link: drag.on } : null; apply(sel); picked(); }
    drag = null; svg.classList.remove('drag');
    if (boxDrag && !boxDrag.moved) { const id = boxDrag.id, now = Date.now(), r = svg.getBoundingClientRect(), y = (e.clientY - r.top - view.y) / view.k - abs(id).y;
      if (isFrame(id) && y > HEAD) tap = { id: '', t: 0 };
      else if (tap.id === id && now - tap.t < 450) { tap = { id: '', t: 0 }; void toggle(id); }
      else { tap = { id, t: now }; sel = { box: id }; apply(sel); picked(); } }
    if (boxDrag?.moved) { const id = boxDrag.id; for (const g of els.values()) g.style.transition = '';
      const h = homeOf(id); base[id].x += rel[id].x - h.x; base[id].y += rel[id].y - h.y; ripple(id, true); sel = { box: id }; hot = sel; render(true); say(`moved ${N[id].label}`); }
    boxDrag = null;
  });

  await Promise.race([doc.fonts?.ready, new Promise((ok) => setTimeout(ok, 1500))]);
  await layoutScope(null);
  render(false);
  fit();
  new ResizeObserver(() => fit()).observe(host);
  return {
    fit,
    placed: () => shown().filter((id) => !isFrame(id) && N[id].kind !== 'note').map((id) => { const a = abs(id), s = sz(id); return `placed(${id}, ${Math.round(a.x + s.w / 2)}, ${Math.round(a.y + s.h / 2)}).`; }).sort(),
    spill: () => { const r = host.getBoundingClientRect(), b = vp.getBoundingClientRect();
      return b.left < r.left - 1 || b.top < r.top - 1 || b.right > r.right + 1 || b.bottom > r.bottom + 1 ? [`laid ${Math.round(b.left - r.left)}..${Math.round(b.right - r.left)} × ${Math.round(b.top - r.top)}..${Math.round(b.bottom - r.top)} in a box ${Math.round(r.width)} × ${Math.round(r.height)}`] : []; },
    boxes: () => [...els.values()],
    lines: () => [...gE.children],
  };
}
