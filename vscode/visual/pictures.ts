// The pictures, each kind's module's list: a new kind or dialect is a module of its own and one line here. `draw` frames a view the same way
// wherever it is shown: what it holds counted, the picture, the mark picked, and the view as text in each backend it has.
import { counted, FAMILY, framesOf, GRAPHS, shutOf, unquote, zoom, type View } from '../../notebook/draw.ts';
import { backendOf, backendsOf } from '../../notebook/draw-text.ts';
import { detail, esc, features, layouts, spills, style, type Hooks, type Picture } from './picture.ts';
import { pictures as graph } from './pic-graph.ts';
import { pictures as space } from './pic-space.ts';
import { pictures as notation } from './pic-notation.ts';
import { pictures as dialects } from './pic-dialects.ts';
import { pictures as time } from './pic-time.ts';
import { pictures as table } from './pic-table.ts';
import { pictures as moments } from './pic-moments.ts';
import { pictures as charts } from './pic-charts.ts';

export const PICTURES: Picture[] = [...graph, ...time, ...table, ...space, ...notation, ...moments, ...charts, ...dialects];
/** The picture a view is drawn with: its kind's, else its family's. */
export const pictureOf = (v: View) => PICTURES.find((x) => x.kind === v.kind) ?? PICTURES.find((x) => x.kind === FAMILY[v.kind]);

/** A drawn picture's handle: its groups can be opened and shut from outside (the extension's zoom message), as a click does;
 *  `report` says again what is drawn, as it is now; `show` presses its Open in editor, false when it has none. */
export type Drawn = { toggle(group: string): Promise<void>; report(): void; show(): boolean };

export async function draw(el: HTMLElement, v: View, h: Hooks): Promise<Drawn> {
  style(el.ownerDocument);
  el.classList.add('rofl-pic');
  const graphs = GRAPHS.includes(v.kind), p = pictureOf(v), shut = shutOf(v);
  let report = () => {};
  const paint = async () => {
    const z = zoom(v, shut), frames = framesOf(z);
    const as = [...new Set(backendsOf(z).map((b) => b.format))].map((f) => [f, backendOf(z, f).write(z)]);
    if (graphs && v.kind !== 'graph') as.push(['mermaid (as a graph)', backendOf({ ...z, kind: 'graph' }).write(z)]);
    el.innerHTML = `<div class="pbar"><span>${esc(counted(z))}</span><span class="spacer"></span>${h.show ? '<button type="button" data-show title="open this picture in an editor tab, to pan and zoom">\u2922 Open in editor</button>' : ''}${graphs && v.kind !== 'proof' && h.pin && !frames ? '<button type="button" data-pin title="write where every mark is as placed(M, X, Y) facts">Pin layout</button>' : ''}</div>`
      + `${v.notes.map((n) => `<div class="note">${esc(n)}</div>`).join('')}<div class="stage"></div><div class="detail" hidden></div>`
      + as.map(([f, t]) => `<details class="as"><summary>as ${esc(f)}</summary><pre>${esc(t)}</pre></details>`).join('');
    const stage = el.querySelector<HTMLElement>('.stage')!, box = el.querySelector<HTMLElement>('.detail')!;
    stage.addEventListener('click', (e) => { const t = (e.target as Element).closest<HTMLElement>('[data-mark], [data-group]'); if (t?.dataset.group) void toggle(t.dataset.group); else if (t) detail(box, z, h, t.dataset.mark!); });
    // one picture, or one per frame in order, small multiples, each mark new or gone against the frame before
    const stages = frames ? frames.map((f) => { const d = el.ownerDocument.createElement('div'); d.className = 'frame'; d.innerHTML = `<div class="mute frame-key">frame ${esc(f.key)}</div><div class="frame-stage"></div>`; stage.append(d); return { el: d.lastElementChild as HTMLElement, view: f.view }; }) : [{ el: stage, view: z }];
    if (graphs && !await h.libs()) { el.querySelector('[data-pin]')?.remove(); stage.innerHTML = `<div class="note">The graph library did not load (offline, or its CDN is blocked), so the picture is its mermaid text, which GitHub and mermaid.live draw:</div><pre class="fallback">${esc(backendOf({ ...z, kind: 'graph' }).write(z))}</pre>`; }
    else for (const s of stages) { await p?.mount(s.el, s.view, h, (id, fact) => detail(box, s.view, h, id, fact), toggle); const laid = layouts.get(s.el)?.(); if (laid && !frames) h.laid?.(laid); }
    // the positions of the first frame alone, since each frame is laid out alone
    report = () => h.drawn?.({ size: [stage.clientWidth, stage.clientHeight], spill: stages.flatMap((s) => spilt(s.el)), laid: layouts.get(stages[0].el)?.() ?? [], features: stages.flatMap((s) => features.get(s.el)?.() ?? []), frames: frames?.map((f) => f.key) ?? [], labels: [...Object.values(z.marks).map((m) => m.label), ...z.facts.flatMap((f) => f.rel === 'lane' ? [unquote(f.args[1])] : f.rel === 'message' ? [unquote(f.args[1]), unquote(f.args[2])] : [])] });
    report();
    el.querySelector('[data-show]')?.addEventListener('click', () => h.show!());
    el.querySelector<HTMLButtonElement>('[data-pin]')?.addEventListener('click', () => { const facts = layouts.get(stage)?.(); if (facts) h.pin!(`-- pinned layout: placed(M, X, Y), written by Pin layout; commit it beside the notebook and name it under reads:\n${facts.join('\n')}\n`); });
  };
  // zoom: a group shut is one mark with its count; a click on it opens it, a click on an open group shuts it
  const toggle = async (g: string) => { if (!shut.delete(g)) shut.add(g); await paint(); };
  await paint();
  return { toggle, report: () => report(), show: () => { const b = el.querySelector<HTMLButtonElement>('[data-show]'); b?.click(); return !!b && el.isConnected; } };
}

/** What of a drawn picture reaches past its box: a graph's as Cytoscape draws it, an SVG's past its viewBox. */
const spilt = (el: HTMLElement) => !el.isConnected ? [] : [...spills.get(el)?.() ?? [], ...[...el.querySelectorAll('svg')].flatMap((svg) => {
  const v = svg.viewBox.baseVal, b = svg.getBBox(), r = svg.getBoundingClientRect();
  if (!v?.width || b.x >= v.x - 1 && b.y >= v.y - 1 && b.x + b.width <= v.x + v.width + 1 && b.y + b.height <= v.y + v.height + 1) return [];
  const out = [...svg.querySelectorAll(':not(defs, defs *)')].find((e) => { const q = e.getBoundingClientRect(); return q.width && (q.left < r.left - 1 || q.top < r.top - 1 || q.right > r.right + 1 || q.bottom > r.bottom + 1); });
  return [`drawn ${Math.round(b.x)}..${Math.round(b.x + b.width)} × ${Math.round(b.y)}..${Math.round(b.y + b.height)} in a viewBox ${v.x} ${v.y} ${v.width} ${v.height}${out ? `, past it a ${out.tagName} ${JSON.stringify(out.textContent?.slice(0, 40))}` : ''}`];
})];

/** Cytoscape from cdnjs and ELK from jsDelivr (cdnjs has no elkjs), into `doc`, once. */
const CDN = ['https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.2/cytoscape.min.js', 'https://cdn.jsdelivr.net/npm/elkjs@0.9.3/lib/elk.bundled.js'];
let loading: Promise<boolean> | undefined;
export const graphLibs = (doc: Document, urls = CDN): Promise<boolean> => loading ??= Promise.all(urls.map((src) => new Promise<boolean>((ok) => {
  const s = doc.createElement('script'); s.src = src; s.onload = () => ok(true); s.onerror = () => ok(false); setTimeout(() => ok(false), 10000); doc.head.append(s);
}))).then(() => 'cytoscape' in globalThis && 'ELK' in globalThis);
