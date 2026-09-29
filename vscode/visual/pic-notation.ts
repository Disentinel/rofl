// A notation: a pedigree drawn from its facts with the graph's layout, generations down; and the domain's standard file, opened for its own tool.
import { backendOf } from '../../notebook/draw-text.ts';
import { unquote, type Fact, type View } from '../../notebook/draw.ts';
import { mount } from './pic-graph.ts';
import { esc, type Picture } from './picture.ts';

/** The pedigree as a graph: each partner above the family, the family above each child. A person is named with the year of birth, a family is a small ring,
 *  or its partners and a count when shut. A link keeps the partner or child fact it stands for, so a click on it asks why of that fact. */
export function pedigree(v: View): View {
  const of = (rel: string) => v.facts.filter((f) => f.rel === rel), about = (rel: string, m: string) => of(rel).find((f) => f.args[0] === m)?.args[1];
  const name = (p: string) => unquote(about('named', p) ?? p).replace(/\//g, '').replace(/\s+/g, ' ').trim();
  const families = new Set([...of('partner'), ...of('child')].map((f) => f.args[0]));
  const partners = (f: string) => of('partner').filter((x) => x.args[0] === f).map((x) => name(x.args[1]).split(' ')[0]).sort();
  const label = (id: string, tags: string[], was: string) => !families.has(id) ? [name(id), about('born', id)].filter(Boolean).join(' \u00b7 ')
    : tags.includes('collapsed') ? `${partners(id).join(' + ')} ${/\(\d+\)$/.exec(was)?.[0] ?? ''}`.trim() : '\u26ad';
  const link = (f: Fact, a: string, b: string): Fact => ({ ...f, rel: 'link', args: [a, b] });
  return { ...v,
    facts: [...of('partner').map((f) => link(f, f.args[1], f.args[0])), ...of('child').map((f) => link(f, f.args[0], f.args[1]))],
    marks: Object.fromEntries(Object.entries(v.marks).map(([id, m]) => [id, { ...m, label: label(id, m.tags, m.label), tags: families.has(id) ? [...m.tags, 'family'] : m.tags }])) };
}

const LOOK = { direction: 'DOWN', style: [
  { selector: 'node.family', style: { shape: 'ellipse', width: 22, height: 22, 'font-size': 13 } },
  { selector: 'node.family.collapsed', style: { shape: 'round-rectangle', width: 'data(width)', height: 30, 'font-size': 11 } },
  { selector: 'edge', style: { 'curve-style': 'taxi', 'taxi-direction': 'downward', 'target-arrow-shape': 'none' } },
] };

export const pictures: Picture[] = [{ kind: 'notation', mount: async (el, v, h, detail, toggle) => {
  const b = backendOf(v), text = b.write(v), ext = b.fence === 'gedcom' ? 'ged' : b.format, p = pedigree(v);
  if (await h.libs()) await mount(el, p, h, (id, fact) => !fact && p.marks[id]?.tags.includes('family') ? toggle(id) : detail(id, fact), toggle, LOOK);
  else el.innerHTML = `<div class="note">The graph library did not load (offline, or its CDN is blocked), so the pedigree is its ${esc(b.format)} file:</div><pre class="fallback">${esc(text)}</pre>`;
  if (!h.open) return;
  const bar = el.ownerDocument.createElement('div');
  bar.className = 'pbar';
  bar.innerHTML = `<span class="mute">a click on \u26ad shuts or opens a family</span><span class="spacer"></span><button type="button" data-open>Open as .${esc(ext)}</button>`;
  bar.querySelector('button')!.addEventListener('click', () => h.open!(text, ext));
  el.prepend(bar);
} }];
