// A picture in an editor tab of its own: the notebook output's picture drawn by the same modules, sized to the tab; a wheel zooms, a drag pans, Fit fits.
// A graph pans and zooms as Cytoscape does; an SVG by its viewBox; a table scrolls. A why, a pin and a zoom work as in the notebook.
import { draw, graphLibs } from './pictures.ts';
import { panZoom } from './pan.ts';
import { talking } from './renderer.ts';
import type { View } from '../../notebook/draw.ts';

declare const acquireVsCodeApi: () => { postMessage(m: unknown): void };
const vs = acquireVsCodeApi(), { view, notebook, run } = JSON.parse(document.getElementById('view')!.textContent!) as { view: View; notebook: string; run?: string };
const el = document.getElementById('pic')!, t = talking((m) => vs.postMessage(m), view, notebook, run, () => ({ panel: [innerWidth, innerHeight] }));
addEventListener('message', (e) => t.heard(e.data));

const pz = panZoom(el);
document.getElementById('fit')!.addEventListener('click', pz.fit);

await draw(el, view, { libs: () => graphLibs(document), ...t.hooks });
