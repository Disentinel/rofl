// A graph (and its dialects) as Cytoscape laid out by ELK; a placed mark stays where the pinned layout put it.
import { linkTags, RESERVED, unquote, type View } from '../../notebook/draw.ts';
import { colour, features, fits, layouts, spills, tagsOf, type Hooks, type Picture } from './picture.ts';

declare const cytoscape: (o: object) => { fit(e?: unknown, p?: number): void; resize(): void; elements(): { renderedBoundingBox(): { x1: number; y1: number; x2: number; y2: number } }; on(ev: string, sel: string, f: (e: { target: { id(): string; data(k: string): string } }) => void): void;
  nodes(): { filter(f: (n: { hasClass(c: string): boolean }) => boolean): { map<T>(f: (n: { id(): string; position(a: 'x' | 'y'): number }) => T): T[] } } };
declare const ELK: new () => { layout(g: object): Promise<{ children: { id: string; x: number; y: number; width: number; height: number }[] }> };

/** What a dialect changes: the direction of flow, its tags' styles (drawn under the status tags), a word for a link tag, an entry dot into the marks a tag names,
 *  each outermost group a band of its own (swimlanes), or the marks on a ring in the order the links go round (loops). */
export type Look = { direction?: string; style?: { selector: string; style: object }[]; says?: Record<string, string>; entry?: string; bands?: boolean; ring?: boolean };
type At = Map<string, { x: number; y: number }>;

function bands(at: At, parent: Map<string, string>): At {
  const top = (id: string): string => parent.has(id) ? top(parent.get(id)!) : id, of = new Map<string, string[]>();
  for (const id of at.keys()) of.set(top(id), [...(of.get(top(id)) ?? []), id]);
  const out: At = new Map();
  let y0 = 0;
  for (const ids of [...of.values()].sort((a, b) => Math.min(...a.map((i) => at.get(i)!.y)) - Math.min(...b.map((i) => at.get(i)!.y)))) {
    const ys = ids.map((i) => at.get(i)!.y), lo = Math.min(...ys);
    for (const i of ids) out.set(i, { x: at.get(i)!.x, y: y0 + at.get(i)!.y - lo });
    y0 += Math.max(...ys) - lo + 70;
  }
  return out;
}

function ring(ids: string[], next: (id: string) => string[]): At {
  const order: string[] = [], go = (id: string) => { if (order.includes(id)) return; order.push(id); next(id).forEach(go); };
  [...ids].sort().forEach(go);
  const r = Math.max(140, order.length * 42);
  return new Map(order.map((id, i) => [id, { x: r * Math.cos(2 * Math.PI * i / order.length - Math.PI / 2), y: r * Math.sin(2 * Math.PI * i / order.length - Math.PI / 2) }]));
}

export async function mount(el: HTMLElement, v: View, h: Hooks, detail: (id: string, fact?: string) => void, toggle: (group: string) => void, look: Look = {}): Promise<void> {
  el.innerHTML = '<div class="cy"></div>';
  const parent = new Map(v.facts.filter((f) => f.rel === 'inside').map((f) => [f.args[0], f.args[1]])), groups = new Set(parent.values());
  const placed = new Map(v.facts.filter((f) => f.rel === 'placed').map((f) => [f.args[0], { x: Number(f.args[1]), y: Number(f.args[2]) }]));
  const level = new Map(v.facts.filter((f) => f.rel === 'level').map((f) => [f.args[0], f.args[1]]));
  const leaves = Object.keys(v.marks).filter((id) => !groups.has(id)), links = v.facts.filter((f) => f.rel === 'link');
  const size = (id: string) => ({ width: Math.max(56, Math.min(240, 16 + 7.4 * (v.marks[id]?.label ?? id).length)), height: 30 });
  const entries = look.entry ? leaves.filter((id) => tagsOf(v, id).includes(look.entry!)).map((id, i) => ({ id: `entry${i}`, to: id })) : [];
  const laid = await new ELK().layout({ id: 'root', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': look.direction ?? 'RIGHT', 'elk.spacing.nodeNode': '22', 'elk.layered.spacing.nodeNodeBetweenLayers': '46', ...(level.size && { 'elk.partitioning.activate': 'true' }) },
    children: [...leaves.map((id) => ({ id, ...size(id), ...(level.has(id) && { layoutOptions: { 'elk.partitioning.partition': level.get(id) } }) })), ...entries.map((e) => ({ id: e.id, width: 14, height: 14 }))],
    edges: [...links.filter((f) => leaves.includes(f.args[0]) && leaves.includes(f.args[1])).map((f, i) => ({ id: `e${i}`, sources: [f.args[0]], targets: [f.args[1]] })), ...entries.map((e) => ({ id: `${e.id}e`, sources: [e.id], targets: [e.to] }))] });
  const elk: At = new Map(laid.children.map((c) => [c.id, { x: c.x + c.width / 2, y: c.y + c.height / 2 }]));
  const auto = look.ring ? ring(leaves, (id) => links.filter((f) => f.args[0] === id).map((f) => f.args[1]).filter((n) => leaves.includes(n))) : look.bands ? bands(elk, parent) : elk;
  const pos = new Map([...elk.keys()].map((id) => [id, placed.get(id) ?? auto.get(id) ?? elk.get(id)!]));
  const c = (t: string) => colour(el, t);
  const hatch = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><path d="M-2 2L2 -2M0 8L8 0M6 10L10 6" stroke="${c('--p-warn')}" stroke-width="1.4"/></svg>`)}`;
  const cy = cytoscape({
    container: el.firstChild, layout: { name: 'preset' }, wheelSensitivity: 0.3,
    elements: [
      ...[...groups].map((g) => ({ data: { id: g, label: v.marks[g]?.label ?? unquote(g), parent: parent.get(g) }, classes: ['group', ...tagsOf(v, g)].join(' ') })),
      ...leaves.map((id) => ({ data: { id, label: v.marks[id].label, parent: parent.get(id), ...size(id) }, position: pos.get(id), classes: tagsOf(v, id).join(' ') })),
      ...links.map((f, i) => { const ts = linkTags(v, f); return { data: { id: `l${i}`, source: f.args[0], target: f.args[1], fact: f.literal, label: ts.filter((t) => !RESERVED.includes(t)).map((t) => look.says?.[t] ?? t).join(', ') }, classes: ts.join(' ') }; }),
      ...entries.flatMap((e) => [{ data: { id: e.id, label: '' }, position: pos.get(e.id), classes: 'entry' }, { data: { id: `${e.id}e`, source: e.id, target: e.to, label: '' }, classes: 'entry' }]),
    ],
    style: [
      { selector: 'node', style: { label: 'data(label)', 'text-valign': 'center', 'text-halign': 'center', shape: 'round-rectangle', 'background-color': c('--p-panel'), 'border-width': 1.5, 'border-color': c('--p-mute'), color: c('--p-fg'), 'font-size': 11, 'font-family': 'ui-monospace, Menlo, monospace' } },
      { selector: 'node[width]', style: { width: 'data(width)', height: 'data(height)' } },
      { selector: 'node.group', style: { 'text-valign': 'top', 'text-halign': 'center', 'background-color': c('--p-bg'), 'border-style': 'dashed', padding: 12, color: c('--p-mute') } },
      { selector: 'edge', style: { width: 1.5, 'line-color': c('--p-mute'), 'target-arrow-color': c('--p-mute'), 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', label: 'data(label)', 'font-size': 10, color: c('--p-mute'), 'text-background-color': c('--p-bg'), 'text-background-opacity': 1 } },
      ...look.style ?? [],
      { selector: 'node.entry', style: { shape: 'ellipse', width: 14, height: 14, 'background-color': c('--p-fg'), 'border-width': 0 } },
      { selector: '.failing, .dangling', style: { 'border-color': c('--p-fail'), 'border-width': 3, color: c('--p-fail'), 'line-color': c('--p-fail'), 'target-arrow-color': c('--p-fail') } },
      { selector: '.dangling', style: { 'border-style': 'dashed', 'line-style': 'dashed' } },
      { selector: 'node.blind', style: { 'background-image': hatch, 'background-repeat': 'repeat', 'background-fit': 'none', 'border-style': 'dashed', 'border-color': c('--p-warn') } },
      { selector: 'edge.blind', style: { 'line-style': 'dashed', 'line-color': c('--p-warn') } },
      { selector: '.unknown', style: { 'border-style': 'dotted', 'line-style': 'dotted', color: c('--p-mute') } },
      { selector: '.gone', style: { opacity: 0.4, 'border-style': 'dashed', 'line-style': 'dashed' } },
      { selector: '.new', style: { 'border-color': c('--p-pass'), 'border-width': 3, 'line-color': c('--p-pass'), 'target-arrow-color': c('--p-pass') } },
      { selector: 'edge.attack', style: { 'line-color': c('--p-fail'), 'target-arrow-color': c('--p-fail'), 'target-arrow-shape': 'tee', 'line-style': 'dashed' } },
      { selector: '.collapsed', style: { 'border-style': 'double', 'border-width': 4, 'font-weight': 'bold' } },
      { selector: ':selected', style: { 'overlay-color': c('--p-accent'), 'overlay-opacity': 0.15 } },
    ],
  });
  // the box narrows and widens with the editor, and may have no size yet when drawn: the drawing is fitted to it whenever it changes
  const box = el.firstChild as HTMLElement, fit = () => { cy.resize(); cy.fit(undefined, 16); };
  fit();
  new ResizeObserver(fit).observe(box);
  fits.set(el, fit);
  spills.set(el, () => {
    const b = cy.elements().renderedBoundingBox(), w = box.clientWidth, h = box.clientHeight;
    return b.x1 < -1 || b.y1 < -1 || b.x2 > w + 1 || b.y2 > h + 1 ? [`laid ${Math.round(b.x1)}..${Math.round(b.x2)} × ${Math.round(b.y1)}..${Math.round(b.y2)} in a box ${w} × ${h}`] : [];
  });
  cy.on('tap', 'node[label != ""]', (e) => groups.has(e.target.id()) || tagsOf(v, e.target.id()).includes('collapsed') ? toggle(e.target.id()) : detail(e.target.id()));
  cy.on('tap', 'edge[fact]', (e) => detail(e.target.data('source'), e.target.data('fact')));
  features.set(el, () => entries.map((e) => `entry(${e.to}).`));
  layouts.set(el, () => cy.nodes().filter((n) => !n.hasClass('group') && !n.hasClass('entry')).map((n) => `placed(${n.id()}, ${Math.round(n.position('x'))}, ${Math.round(n.position('y'))}).`).sort());
}

export const pictures: Picture[] = [{ kind: 'graph', mount }, { kind: 'argument', mount }];
