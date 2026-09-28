// The pictures, each kind's module's list: a new kind or dialect is a module of its own and one line here. `draw` frames a view the same way
// wherever it is shown: what it holds counted, the picture, the mark picked, and the view as text in each backend it has.
import { counted, framesOf, shutOf, unquote, zoom, type View } from '../../notebook/draw.ts';
import { BACKENDS, backendOf } from '../../notebook/draw-text.ts';
import { detail, esc, layouts, style, type Hooks, type Picture } from './picture.ts';
import { pictures as graph } from './pic-graph.ts';
import { pictures as space } from './pic-space.ts';
import { pictures as notation } from './pic-notation.ts';
import { pictures as time } from './pic-time.ts';
import { pictures as table } from './pic-table.ts';

export const PICTURES: Picture[] = [...graph, ...time, ...table, ...space, ...notation];

/** A drawn picture's handle: its groups can be opened and shut from outside (the extension's zoom message), as a click does. */
export type Drawn = { toggle(group: string): Promise<void> };

export async function draw(el: HTMLElement, v: View, h: Hooks): Promise<Drawn> {
  style(el.ownerDocument);
  el.classList.add('rofl-pic');
  const graphs = v.kind === 'graph' || v.kind === 'argument', p = PICTURES.find((x) => x.kind === v.kind), shut = shutOf(v);
  const paint = async () => {
    const z = zoom(v, shut), frames = framesOf(z);
    const as = [...new Set(BACKENDS.filter((b) => b.kind === v.kind && (b.when?.(z) ?? true)).map((b) => b.format))].map((f) => [f, backendOf(z, f).write(z)]);
    if (v.kind === 'argument') as.push(['mermaid', backendOf({ ...z, kind: 'graph' }).write(z)]);
    el.innerHTML = `<div class="pbar"><span>${esc(counted(z))}</span><span class="spacer"></span>${graphs && h.pin && !frames ? '<button type="button" data-pin title="write where every mark is as placed(M, X, Y) facts">Pin layout</button>' : ''}</div>`
      + `${v.notes.map((n) => `<div class="note">${esc(n)}</div>`).join('')}<div class="stage"></div><div class="detail" hidden></div>`
      + as.map(([f, t]) => `<details class="as"><summary>as ${esc(f)}</summary><pre>${esc(t)}</pre></details>`).join('');
    const stage = el.querySelector<HTMLElement>('.stage')!, box = el.querySelector<HTMLElement>('.detail')!;
    stage.addEventListener('click', (e) => { const t = (e.target as Element).closest<HTMLElement>('[data-mark], [data-group]'); if (t?.dataset.group) void toggle(t.dataset.group); else if (t) detail(box, z, h, t.dataset.mark!); });
    // one picture, or one per frame in order, small multiples, each mark new or gone against the frame before
    const stages = frames ? frames.map((f) => { const d = el.ownerDocument.createElement('div'); d.className = 'frame'; d.innerHTML = `<div class="mute frame-key">frame ${esc(f.key)}</div><div class="frame-stage"></div>`; stage.append(d); return { el: d.lastElementChild as HTMLElement, view: f.view }; }) : [{ el: stage, view: z }];
    if (graphs && !await h.libs()) { el.querySelector('[data-pin]')?.remove(); stage.innerHTML = `<div class="note">The graph library did not load (offline, or its CDN is blocked), so the picture is its mermaid text, which GitHub and mermaid.live draw:</div><pre class="fallback">${esc(backendOf({ ...z, kind: 'graph' }).write(z))}</pre>`; }
    else for (const s of stages) { await p?.mount(s.el, s.view, h, (id, fact) => detail(box, s.view, h, id, fact), toggle); const laid = layouts.get(s.el)?.(); if (laid && !frames) h.laid?.(laid); }
    h.drawn?.({ frames: frames?.map((f) => f.key) ?? [], labels: [...Object.values(z.marks).map((m) => m.label), ...z.facts.flatMap((f) => f.rel === 'lane' ? [unquote(f.args[1])] : f.rel === 'message' ? [unquote(f.args[1]), unquote(f.args[2])] : [])] });
    el.querySelector<HTMLButtonElement>('[data-pin]')?.addEventListener('click', () => { const facts = layouts.get(stage)?.(); if (facts) h.pin!(`-- pinned layout: placed(M, X, Y), written by Pin layout; commit it beside the notebook and name it under reads:\n${facts.join('\n')}\n`); });
  };
  // zoom: a group shut is one mark with its count; a click on it opens it, a click on an open group shuts it
  const toggle = async (g: string) => { if (!shut.delete(g)) shut.add(g); await paint(); };
  await paint();
  return { toggle };
}

/** Cytoscape from cdnjs and ELK from jsDelivr (cdnjs has no elkjs), into `doc`, once. */
const CDN = ['https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.2/cytoscape.min.js', 'https://cdn.jsdelivr.net/npm/elkjs@0.9.3/lib/elk.bundled.js'];
let loading: Promise<boolean> | undefined;
export const graphLibs = (doc: Document, urls = CDN): Promise<boolean> => loading ??= Promise.all(urls.map((src) => new Promise<boolean>((ok) => {
  const s = doc.createElement('script'); s.src = src; s.onload = () => ok(true); s.onerror = () => ok(false); setTimeout(() => ok(false), 10000); doc.head.append(s);
}))).then(() => 'cytoscape' in globalThis && 'ELK' in globalThis);
