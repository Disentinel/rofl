// A drawn picture that pans and zooms, wherever it is shown full size: an SVG by its viewBox, a wheel zooms around the pointer, a drag pans.
// A graph's schema keeps its own view (schema.ts) and is left to it; the class `pans` tells it that a plain wheel zooms here.
import { fits } from './picture.ts';

/** How far a view may zoom from the size it was drawn at, either way. */
const ZOOM = 50;
/** A wheel's turn in pixels, whatever unit it came in: pixels, lines, or pages of `page` pixels. */
export const wheelPx = (e: WheelEvent, page: number) => e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? page : 1);
const usable = (b: number[]) => b.length === 4 && b.every(Number.isFinite) && b[2] > 0 && b[3] > 0;

/** `el` holds a drawn picture; `fit` puts every stage of it back as it was drawn. */
export function panZoom(el: HTMLElement): { fit(): void } {
  const win = el.ownerDocument.defaultView!;
  el.classList.add('pans');
  const svgOf = (e: Event) => { const s = (e.target as Element).closest<SVGSVGElement>('.stage svg'); return s?.closest('.sch') ? null : s; };
  // an SVG drawn without a viewBox shows its own units one to a pixel from 0,0: that is its view, made explicit
  const view = (svg: SVGSVGElement) => { const b = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number), r = svg.getBoundingClientRect(); return usable(b) ? b : [0, 0, r.width, r.height]; };
  /** The view as drawn, kept the first time the picture moves: its width bounds the zoom, and Fit puts back its viewBox, or none. */
  const drawn = (svg: SVGSVGElement) => { svg.dataset.fit ??= svg.getAttribute('viewBox') ?? ''; return (svg.dataset.drawn ??= view(svg).join(' ')).split(' ').map(Number); };
  const move = (svg: SVGSVGElement, to: (b: number[], m: DOMMatrix) => number[]) => {
    const r = svg.getBoundingClientRect(), m = svg.getScreenCTM();
    if (!r.width || !r.height || !m?.a || !m.d) return;   // not shown, so not drawn at any size
    drawn(svg);
    const n = to(view(svg), m);
    if (usable(n)) svg.setAttribute('viewBox', n.join(' '));
  };
  el.addEventListener('wheel', (e) => {
    const svg = svgOf(e); if (!svg) return;
    e.preventDefault();
    move(svg, (b, m) => {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()), w0 = drawn(svg)[2];
      const w = Math.min(w0 * ZOOM, Math.max(w0 / ZOOM, b[2] * Math.exp(wheelPx(e, svg.clientHeight) * (e.ctrlKey ? 0.01 : 0.002)))), k = w / b[2];
      return [p.x - (p.x - b[0]) * k, p.y - (p.y - b[1]) * k, w, b[3] * k];
    });
  }, { passive: false });
  let drag: SVGSVGElement | null = null, moved = 0;
  el.addEventListener('pointerdown', (e) => { drag = svgOf(e); moved = 0; });
  win.addEventListener('pointerup', () => { drag = null; });
  win.addEventListener('pointermove', (e) => {
    if (!drag?.isConnected) return;
    moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    move(drag, (b, m) => [b[0] - e.movementX / m.a, b[1] - e.movementY / m.d, b[2], b[3]]);
  });
  el.addEventListener('click', (e) => { if (moved > 3) e.stopPropagation(); }, true);   // a drag is not a pick
  return { fit: () => {
    for (const s of el.querySelectorAll<HTMLElement>('.stage, .frame-stage')) fits.get(s)?.();
    for (const svg of el.querySelectorAll<SVGSVGElement>('svg[data-fit]')) if (svg.dataset.fit) svg.setAttribute('viewBox', svg.dataset.fit); else svg.removeAttribute('viewBox');
  } };
}
