// A graph (and its dialects) as a schema (schema.ts): a group is a frame that opens and shuts, a note an arrow of its own, a link's terms a
// small table on it; a placed mark stays where the pinned layout put it.
import { colourOf, linkTags, RESERVED, unquote, type View } from '../../notebook/draw.ts';
import { iconUri } from '../../notebook/icons.ts';
import type { Box, Line, Note } from './schema.ts';
import { schema } from './schema-layouts.ts';
import { colour, drawnTags, features, fits, layouts, looks, spills, tagsOf, type Hooks, type Picture } from './picture.ts';

/** What a dialect changes: the layout of the picture and of its groups, the kind of box a tag makes (its colour and shape), a word for a link tag,
 *  the size of a box a tag makes small (a shut group keeps its own), and an entry dot into the marks a tag names. */
export type Look = { layout?: string; groups?: string; kinds?: Record<string, string>; sizes?: Record<string, { w: number; h: number }>; says?: Record<string, string>; entry?: string };

/** The view's facts as a schema: its groups frames, its marks boxes, its links lines, its notes notes. */
export function toSchema(v: View, el: HTMLElement, look: Look = {}) {
  const is = (rel: string) => v.facts.filter((f) => f.rel === rel);
  const parent = new Map(is('inside').map((f) => [f.args[0], f.args[1]])), groups = new Set(parent.values());
  const placed = new Map(is('placed').map((f) => [f.args[0], { x: Number(f.args[1]), y: Number(f.args[2]) }]));
  const laidAs = new Map(is('laid_out').map((f) => [f.args[0], unquote(f.args[1])]));
  const sub = new Map(is('subtitled').map((f) => [f.args[0], unquote(f.args[1])])), heat = new Map(is('heat').map((f) => [f.args[0], Number(f.args[1]) / 100]));
  const c = (t: string) => colour(el, t), kindOf = (tags: string[]) => tags.map((t) => look.kinds?.[t]).find(Boolean);
  // a group is a frame whether or not it is a mark itself
  const nodes: Box[] = [...new Set([...Object.keys(v.marks), ...groups])].map((id) => {
    const tags = tagsOf(v, id), label = v.marks[id]?.label ?? unquote(id), size = tags.includes('collapsed') ? undefined : tags.map((t) => look.sizes?.[t]).find(Boolean);
    const paint = colourOf(v, tags), i = v.marks[id]?.icon, text = i && v.icons?.[i], src = text && iconUri(text, paint ?? c('--p-fg'));
    return { id, label, parent: parent.get(id) ?? null, tags, kind: kindOf(tags) ?? 'box',
      ...(groups.has(id) && { open: true, layout: laidAs.get(id) ?? look.groups }), ...(paint && { paint }), ...(src && { icon: src }),
      size: size ?? (src ? undefined : { w: Math.max(90, Math.min(260, (groups.has(id) ? 64 : 30) + 7.2 * label.length)), h: sub.has(id) ? 46 : 34 }), ...(sub.has(id) && { sub: sub.get(id) }), ...(heat.has(id) && { heat: heat.get(id) }) };
  });
  const box = new Map(nodes.map((n) => [n.id, n]));
  for (const f of is('level')) if (box.has(f.args[0])) box.get(f.args[0])!.level = Number(f.args[1]);
  for (const f of is('sits')) if (box.has(f.args[0])) { const val = unquote(f.args[2]); box.get(f.args[0])![unquote(f.args[1])] = val !== '' && !isNaN(Number(val)) ? Number(val) : val; }
  // a placed mark keeps its place, its centre where it was; then the picture's own boxes are laid out beside it
  for (const [id, p] of placed) { const n = box.get(id); if (n && !n.parent) { n.x = p.x - (n.size?.w ?? 190) / 2; n.y = p.y - (n.size?.h ?? 46) / 2; } }
  const terms = new Map<string, [string, string][]>();
  for (const f of is('contract')) { const k = f.args[0] + '\u0000' + f.args[1]; terms.set(k, [...terms.get(k) ?? [], [unquote(f.args[2]), unquote(f.args[3])]]); }
  const links: Line[] = is('link').map((f) => { const ts = linkTags(v, f), paint = colourOf(v, ts), label = ts.filter((t) => !RESERVED.includes(t)).map((t) => look.says?.[t] ?? t).join(', ');
    return { s: f.args[0], t: f.args[1], label, show: true, tags: ts, fact: f.literal, ...(paint && { paint }), ...(terms.has(f.args[0] + '\u0000' + f.args[1]) && { contract: terms.get(f.args[0] + '\u0000' + f.args[1]) }) }; });
  const entries = look.entry ? nodes.filter((n) => n.tags!.includes(look.entry!)).map((n, i) => ({ id: `entry${i}`, to: n.id, parent: n.parent })) : [];
  for (const e of entries) { nodes.push({ id: e.id, label: '', kind: 'entry', parent: e.parent, size: { w: 16, h: 16 } }); links.push({ s: e.id, t: e.to }); }
  const said = new Map(is('note').map((f) => [f.args[0], { title: unquote(f.args[1]), body: unquote(f.args[2]) }]));
  const notes: Note[] = [...said].map(([id, n]) => ({ id, ...n, to: is('points_at').filter((f) => f.args[0] === id).map((f) => f.args[1]), arrow: is('points_at').find((f) => f.args[0] === id)?.args[2] ?? '' }))
    .map((n) => ({ ...n, arrow: unquote(n.arrow) }));
  const top = laidAs.get('picture') ?? (placed.size ? 'placed' : look.layout ?? 'layered-right');
  return { data: { nodes, links, notes, layout: top }, entries };
}

export async function mount(el: HTMLElement, v: View, h: Hooks, detail: (id: string, fact?: string) => void, toggle: (group: string) => void, look: Look = {}): Promise<void> {
  el.innerHTML = '<div class="cy"></div>';
  const { data, entries } = toSchema(v, el, look), host = el.firstChild as HTMLElement;
  const s = await schema(host, data, {
    pick: (what) => { if (!what) return; if ('box' in what) { if (v.marks[what.box] || data.notes.some((n) => n.id === what.box)) detail(what.box); } else if (what.line[0]?.fact) detail(what.line[0].s, what.line[0].fact); },
    open: (id) => { if (!tagsOf(v, id).includes('collapsed')) return false; toggle(id); return true; },
  });
  fits.set(el, s.fit);
  spills.set(el, s.spill);
  layouts.set(el, () => s.placed().filter((f) => !/^placed\(entry\d+,/.test(f)));
  features.set(el, () => entries.map((e) => `entry(${e.to}).`));
  const id = (g: Element) => (g as SVGGElement).dataset.id!;
  looks.set(el, () => s.boxes().flatMap((g) => { const n = data.nodes.find((x) => x.id === id(g)); return [n?.icon && `${n.id} icon ${n.icon}`, n?.paint && `${n.id} colour ${n.paint}`].filter((x): x is string => !!x); }));
  drawnTags.set(el, () => s.boxes().flatMap((g) => RESERVED.filter((t) => g.classList.contains(t)).map((t) => `tagged(${id(g)}, ${t}).`)));
}

export const pictures: Picture[] = [{ kind: 'graph', mount }, { kind: 'argument', mount }];
