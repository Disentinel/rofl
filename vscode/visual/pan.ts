// A drawn picture that pans and zooms, wherever it is shown full size: a graph as Cytoscape does, an SVG by its viewBox, a wheel zooms, a drag pans.
import { fits } from './picture.ts';

/** `el` holds a drawn picture; `fit` puts every stage of it back as it was drawn. */
export function panZoom(el: HTMLElement): { fit(): void } {
  const win = el.ownerDocument.defaultView!;
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
  win.addEventListener('pointerup', () => { drag = null; });
  win.addEventListener('pointermove', (e) => {
    if (!drag || !drag.isConnected) return;
    const b = box(drag), s = drag.getScreenCTM()!.a;
    moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    drag.setAttribute('viewBox', `${b.x - e.movementX / s} ${b.y - e.movementY / s} ${b.width} ${b.height}`);
  });
  el.addEventListener('click', (e) => { if (moved > 3) e.stopPropagation(); }, true);   // a drag is not a pick
  return { fit: () => {
    for (const s of el.querySelectorAll<HTMLElement>('.stage, .frame-stage')) fits.get(s)?.();
    for (const svg of el.querySelectorAll<SVGSVGElement>('svg[data-fit]')) svg.setAttribute('viewBox', svg.dataset.fit!);
  } };
}
