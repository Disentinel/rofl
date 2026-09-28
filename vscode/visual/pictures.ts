// The pictures, each kind's module's list: a new kind or dialect is a module of its own and one line here. `draw` frames a view the same way
// wherever it is shown: what it holds counted, the picture, the mark picked, and the view as text in each backend it has.
import { counted, type View } from '../../notebook/draw.ts';
import { BACKENDS, backendOf } from '../../notebook/draw-text.ts';
import { detail, esc, style, type Hooks, type Picture } from './picture.ts';
import { layouts, pictures as graph } from './pic-graph.ts';
import { pictures as time } from './pic-time.ts';
import { pictures as table } from './pic-table.ts';

export const PICTURES: Picture[] = [...graph, ...time, ...table];

export async function draw(el: HTMLElement, v: View, h: Hooks): Promise<void> {
  style(el.ownerDocument);
  el.classList.add('rofl-pic');
  const graphs = v.kind === 'graph' || v.kind === 'argument';
  const as = [...new Set(BACKENDS.filter((b) => b.kind === v.kind).map((b) => b.format))].map((f) => [f, backendOf(v, f).write(v)]);
  if (v.kind === 'argument') as.push(['mermaid', backendOf({ ...v, kind: 'graph' }).write(v)]);
  el.innerHTML = `<div class="pbar"><span>${esc(counted(v))}</span><span class="spacer"></span>${graphs && h.pin ? '<button type="button" data-pin title="write where every mark is as placed(M, X, Y) facts">Pin layout</button>' : ''}</div>`
    + `${v.notes.map((n) => `<div class="note">${esc(n)}</div>`).join('')}<div class="stage"></div><div class="detail" hidden></div>`
    + as.map(([f, t]) => `<details class="as"><summary>as ${esc(f)}</summary><pre>${esc(t)}</pre></details>`).join('');
  const stage = el.querySelector<HTMLElement>('.stage')!, box = el.querySelector<HTMLElement>('.detail')!;
  const pick = (id: string, fact?: string) => detail(box, v, h, id, fact);
  stage.addEventListener('click', (e) => { const t = (e.target as Element).closest<HTMLElement>('[data-mark]'); if (t) pick(t.dataset.mark!); });
  const p = PICTURES.find((x) => x.kind === v.kind);
  if (graphs && !await h.libs()) el.querySelector('[data-pin]')?.remove(), stage.innerHTML = `<div class="note">The graph library did not load (offline, or its CDN is blocked), so the picture is its mermaid text, which GitHub and mermaid.live draw:</div><pre class="fallback">${esc(backendOf({ ...v, kind: 'graph' }).write(v))}</pre>`;
  else { await p?.mount(stage, v, h, pick); const laid = layouts.get(stage)?.(); if (laid) h.laid?.(laid); }
  el.querySelector<HTMLButtonElement>('[data-pin]')?.addEventListener('click', () => { const facts = layouts.get(stage)?.(); if (facts) h.pin!(`-- pinned layout: placed(M, X, Y), written by Pin layout; commit it beside the notebook and name it under reads:\n${facts.join('\n')}\n`); });
}

/** Cytoscape from cdnjs and ELK from jsDelivr (cdnjs has no elkjs), into `doc`, once. */
const CDN = ['https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.2/cytoscape.min.js', 'https://cdn.jsdelivr.net/npm/elkjs@0.9.3/lib/elk.bundled.js'];
let loading: Promise<boolean> | undefined;
export const graphLibs = (doc: Document, urls = CDN): Promise<boolean> => loading ??= Promise.all(urls.map((src) => new Promise<boolean>((ok) => {
  const s = doc.createElement('script'); s.src = src; s.onload = () => ok(true); s.onerror = () => ok(false); setTimeout(() => ok(false), 10000); doc.head.append(s);
}))).then(() => 'cytoscape' in globalThis && 'ELK' in globalThis);
