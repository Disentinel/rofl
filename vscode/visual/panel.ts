// A picture in an editor tab of its own: the notebook output's picture drawn by the same modules, sized to the tab; a wheel zooms, a drag pans, Fit fits.
// A graph pans and zooms as Cytoscape does; an SVG by its viewBox; a table scrolls. A why, a pin and a zoom work as in the notebook.
import { draw, graphLibs } from './pictures.ts';
import { fits } from './picture.ts';
import { talking } from './renderer.ts';
import type { View } from '../../notebook/draw.ts';

declare const acquireVsCodeApi: () => { postMessage(m: unknown): void };
const vs = acquireVsCodeApi(), { view, notebook } = JSON.parse(document.getElementById('view')!.textContent!) as { view: View; notebook: string };
const el = document.getElementById('pic')!, t = talking((m) => vs.postMessage(m), view, notebook, () => ({ panel: [innerWidth, innerHeight] }));
addEventListener('message', (e) => t.heard(e.data));

const svgOf = (e: Event) => (e.target as Element).closest<SVGSVGElement>('.stage svg');
const box = (svg: SVGSVGElement) => { svg.dataset.fit ??= svg.getAttribute('viewBox') ?? ''; return svg.viewBox.baseVal; };
el.addEventListener('wheel', (e) => {
  const svg = svgOf(e); if (!svg) return;
  e.preventDefault();
  const b = box(svg), p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse()), k = Math.exp(e.deltaY * 0.002);
  svg.setAttribute('viewBox', `${p.x - (p.x - b.x) * k} ${p.y - (p.y - b.y) * k} ${b.width * k} ${b.height * k}`);
}, { passive: false });
let drag: SVGSVGElement | null = null, moved = 0;
el.addEventListener('pointerdown', (e) => { drag = svgOf(e); moved = 0; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  const b = box(drag), s = drag.getScreenCTM()!.a;
  moved += Math.abs(e.movementX) + Math.abs(e.movementY);
  drag.setAttribute('viewBox', `${b.x - e.movementX / s} ${b.y - e.movementY / s} ${b.width} ${b.height}`);
});
el.addEventListener('click', (e) => { if (moved > 3) e.stopPropagation(); }, true);   // a drag is not a pick
document.getElementById('fit')!.addEventListener('click', () => {
  for (const s of el.querySelectorAll<HTMLElement>('.stage, .frame-stage')) fits.get(s)?.();
  for (const svg of el.querySelectorAll<SVGSVGElement>('svg[data-fit]')) svg.setAttribute('viewBox', svg.dataset.fit!);
});

await draw(el, view, { libs: () => graphLibs(document), ...t.hooks });
