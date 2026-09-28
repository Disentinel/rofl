// A graph (and the argument dialect of one) as Cytoscape laid out by ELK; a placed mark stays where the pinned layout put it.
import { linkTags, RESERVED, unquote, type View } from '../../notebook/draw.ts';
import { colour, tagsOf, type Hooks, type Picture } from './picture.ts';

declare const cytoscape: (o: object) => { fit(e?: unknown, p?: number): void; on(ev: string, sel: string, f: (e: { target: { id(): string; data(k: string): string } }) => void): void;
  nodes(): { filter(f: (n: { hasClass(c: string): boolean }) => boolean): { map<T>(f: (n: { id(): string; position(a: 'x' | 'y'): number }) => T): T[] } } };
declare const ELK: new () => { layout(g: object): Promise<{ children: { id: string; x: number; y: number; width: number; height: number }[] }> };

async function mount(el: HTMLElement, v: View, h: Hooks, detail: (id: string, fact?: string) => void, toggle: (group: string) => void): Promise<void> {
  el.innerHTML = '<div class="cy"></div>';
  const parent = new Map(v.facts.filter((f) => f.rel === 'inside').map((f) => [f.args[0], f.args[1]])), groups = new Set(parent.values());
  const placed = new Map(v.facts.filter((f) => f.rel === 'placed').map((f) => [f.args[0], { x: Number(f.args[1]), y: Number(f.args[2]) }]));
  const level = new Map(v.facts.filter((f) => f.rel === 'level').map((f) => [f.args[0], f.args[1]]));
  const leaves = Object.keys(v.marks).filter((id) => !groups.has(id)), links = v.facts.filter((f) => f.rel === 'link');
  const size = (id: string) => ({ width: Math.max(56, Math.min(240, 16 + 7 * (v.marks[id]?.label ?? id).length)), height: 30 });
  const laid = await new ELK().layout({ id: 'root', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.spacing.nodeNode': '22', 'elk.layered.spacing.nodeNodeBetweenLayers': '46' },
    children: leaves.map((id) => ({ id, ...size(id), ...(level.has(id) && { layoutOptions: { 'elk.layered.layering.layerChoiceConstraint': level.get(id) } }) })),
    edges: links.filter((f) => leaves.includes(f.args[0]) && leaves.includes(f.args[1])).map((f, i) => ({ id: `e${i}`, sources: [f.args[0]], targets: [f.args[1]] })) });
  const pos = new Map(laid.children.map((c) => [c.id, placed.get(c.id) ?? { x: c.x + c.width / 2, y: c.y + c.height / 2 }]));
  const c = (t: string) => colour(el, t);
  const hatch = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><path d="M-2 2L2 -2M0 8L8 0M6 10L10 6" stroke="${c('--p-warn')}" stroke-width="1.4"/></svg>`)}`;
  const cy = cytoscape({
    container: el.firstChild, layout: { name: 'preset' }, wheelSensitivity: 0.3,
    elements: [
      ...[...groups].map((g) => ({ data: { id: g, label: v.marks[g]?.label ?? unquote(g), parent: parent.get(g) }, classes: ['group', ...tagsOf(v, g)].join(' ') })),
      ...leaves.map((id) => ({ data: { id, label: v.marks[id].label, parent: parent.get(id), ...size(id) }, position: pos.get(id), classes: tagsOf(v, id).join(' ') })),
      ...links.map((f, i) => { const ts = linkTags(v, f); return { data: { id: `l${i}`, source: f.args[0], target: f.args[1], fact: f.literal, label: ts.filter((t) => !RESERVED.includes(t)).join(', ') }, classes: ts.join(' ') }; }),
    ],
    style: [
      { selector: 'node', style: { label: 'data(label)', 'text-valign': 'center', 'text-halign': 'center', shape: 'round-rectangle', 'background-color': c('--p-panel'), 'border-width': 1.5, 'border-color': c('--p-mute'), color: c('--p-fg'), 'font-size': 11, 'font-family': 'ui-monospace, Menlo, monospace' } },
      { selector: 'node[width]', style: { width: 'data(width)', height: 'data(height)' } },
      { selector: 'node.group', style: { 'text-valign': 'top', 'text-halign': 'center', 'background-color': c('--p-bg'), 'border-style': 'dashed', padding: 12, color: c('--p-mute') } },
      { selector: 'edge', style: { width: 1.5, 'line-color': c('--p-mute'), 'target-arrow-color': c('--p-mute'), 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', label: 'data(label)', 'font-size': 10, color: c('--p-mute'), 'text-background-color': c('--p-bg'), 'text-background-opacity': 1 } },
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
  cy.fit(undefined, 16);
  cy.on('tap', 'node', (e) => groups.has(e.target.id()) || tagsOf(v, e.target.id()).includes('collapsed') ? toggle(e.target.id()) : detail(e.target.id()));
  cy.on('tap', 'edge', (e) => detail(e.target.data('source'), e.target.data('fact')));
  layouts.set(el, () => cy.nodes().filter((n) => !n.hasClass('group')).map((n) => `placed(${n.id()}, ${Math.round(n.position('x'))}, ${Math.round(n.position('y'))}).`).sort());
}

/** Each drawn graph's layout now, as placed(M, X, Y) facts: what Pin layout writes. */
export const layouts = new WeakMap<HTMLElement, () => string[]>();

export const pictures: Picture[] = [{ kind: 'graph', mount }, { kind: 'argument', mount }];
