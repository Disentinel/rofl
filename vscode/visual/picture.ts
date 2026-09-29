// A picture drawn in a page: the contract between a kind's module and whoever shows it (the notebook renderer, the playground), and what every kind shares.
// Runs in a browser: no node, no VS Code API.
import { linkTags, unquote, type DrawKind, type View } from '../../notebook/draw.ts';

/** What the host of a picture does for it: explain a fact under a mark, keep a layout, load the graph libraries. */
export type Hooks = {
  /** `why` of a view fact, written into `into` */
  why?(literal: string, into: HTMLElement): void;
  /** the picture's layout as placed(M, X, Y) facts, to keep beside the notebook */
  pin?(facts: string): void;
  /** where a graph's marks were laid, as placed(M, X, Y) facts, each time it is drawn: what a test reads back */
  laid?(facts: string[]): void;
  /** what was drawn, once it is: the frames, each by its key, so a test can read the picture back */
  drawn?(what: { frames: string[]; labels: string[]; laid: string[]; features: string[] }): void;
  /** a notation's standard file, opened for the domain's own tool: `ext` its file name's ending */
  open?(text: string, ext: string): void;
  /** Cytoscape and ELK, loaded; false when they cannot be (offline, a blocked CDN) */
  libs(): Promise<boolean>;
};
/** A kind's module: `mount` draws the view into `el`, calls `detail` when a mark is picked and `toggle` when a group is (zoom). */
export type Picture = { kind: DrawKind; mount(el: HTMLElement, v: View, h: Hooks, detail: (id: string, fact?: string) => void, toggle: (group: string) => void): Promise<void> | void };

/** Each drawn picture's positions now, as facts (placed(M, X, Y) for a graph, at(M, X, Y) for space): what Pin layout writes and a test reads back. */
export const layouts = new WeakMap<HTMLElement, () => string[]>();
/** What a dialect's look put in a drawn picture beyond its marks, as facts (entry(M) for a state machine's entry dot): what a test reads back. */
export const features = new WeakMap<HTMLElement, () => string[]>();

export const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const tagsOf = (v: View, id: string) => v.marks[id]?.tags ?? [];
/** A colour of the picture's theme by its token (`--p-fail`), as its element resolves it: VS Code's colours in the editor, the page's in the playground. */
export const colour = (el: HTMLElement, token: string) => getComputedStyle(el).getPropertyValue(token).trim();

/** A mark picked: its tags, what its facts rest on, and each of its facts with a way to ask why. */
export function detail(box: HTMLElement, v: View, h: Hooks, id: string, fact?: string): void {
  const m = v.marks[id];
  const facts = fact ? v.facts.filter((f) => f.literal === fact) : v.facts.filter((f) => f.args[0] === id || f.rel === 'link' && f.args[1] === id);
  const from = fact ? facts[0]?.from ?? [] : m?.from ?? [];
  const tags = fact && facts[0] ? linkTags(v, facts[0]) : tagsOf(v, id);
  box.hidden = false;
  box.innerHTML = `<div><b>${esc(fact ?? m?.label ?? unquote(id))}</b> ${tags.map((t) => `<span class="tag ${esc(t)}">${esc(t)}</span>`).join(' ')}${m?.at && !fact ? ` <span class="mute">${esc(m.at.join(', '))}</span>` : ''}</div>`
    + `<div class="mute">${from.length ? `from: ${from.map(esc).join(' &middot; ')}` : facts.length ? 'given, not derived: it has no provenance' : 'no view fact names it: it is drawn because a link ends at it'}</div>`
    + `<ul class="facts">${facts.map((f) => `<li><code>${esc(f.literal)}</code>${f.change ? ` <span class="tag ${f.change}">${f.change}</span>` : ''}${h.why ? ` <button type="button" data-why="${esc(f.literal)}">why</button>` : ''}</li>`).join('')}</ul>`;
  for (const b of box.querySelectorAll<HTMLButtonElement>('button[data-why]')) b.onclick = () => {
    const at = document.createElement('div'); at.className = 'why'; at.textContent = 'asking why…'; b.closest('li')!.after(at); b.remove();
    h.why!(b.dataset.why!, at);
  };
}

/** The picture's stylesheet, once per document: every colour a token over the host's own (VS Code's, else the playground's). */
export function style(doc: Document): void {
  if (doc.getElementById('rofl-pic-style')) return;
  const s = doc.createElement('style'); s.id = 'rofl-pic-style';
  s.textContent = `
.rofl-pic { --p-fg: var(--vscode-editor-foreground, var(--fg, #1c2120)); --p-mute: var(--vscode-descriptionForeground, var(--mute, #66706b));
  --p-line: var(--vscode-panel-border, var(--line, #d9ddd6)); --p-bg: var(--vscode-editor-background, var(--code-bg, #fcfcfa)); --p-panel: var(--vscode-editorWidget-background, var(--panel, #fff));
  --p-soft: var(--vscode-editor-inactiveSelectionBackground, var(--soft, #eef0eb)); --p-accent: var(--vscode-focusBorder, var(--accent, #1d4ed8)); --p-accent-bg: color-mix(in srgb, var(--p-accent) 12%, transparent);
  --p-fail: var(--vscode-errorForeground, var(--fail, #b91c1c)); --p-fail-bg: color-mix(in srgb, var(--p-fail) 12%, transparent);
  --p-warn: var(--vscode-editorWarning-foreground, var(--warn, #a15c07)); --p-warn-bg: color-mix(in srgb, var(--p-warn) 14%, transparent); --p-pass: var(--vscode-testing-iconPassed, var(--pass, #047857));
  --p-mono: var(--vscode-editor-font-family, var(--mono, ui-monospace, Menlo, monospace));
  border: 1px solid var(--p-line); border-radius: 5px; background: var(--p-bg); color: var(--p-fg); min-width: 0; }
.rofl-pic .pbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 5px 8px; border-bottom: 1px solid var(--p-line); font: 12px/1.4 var(--p-mono); color: var(--p-mute); }
.rofl-pic .pbar .spacer { flex: 1; }
.rofl-pic button { font: 12px/1 inherit; padding: 4px 8px; color: var(--p-fg); background: var(--p-panel); border: 1px solid var(--p-line); border-radius: 4px; cursor: pointer; }
.rofl-pic .stage { overflow-x: auto; }
.rofl-pic .cy { height: 380px; }
.rofl-pic .frame { border-top: 1px dashed var(--p-line); }
.rofl-pic .frame-key { padding: 4px 8px; font: 12px var(--p-mono); }
.rofl-pic .frame .cy { height: 260px; }
.rofl-pic .detail { padding: 8px 10px; border-top: 1px solid var(--p-line); font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
.rofl-pic .detail pre, .rofl-pic .why { margin: 0; padding: 6px 8px; background: var(--p-panel); border: 1px solid var(--p-line); border-radius: 4px; font: 12px/1.5 var(--p-mono); white-space: pre-wrap; }
.rofl-pic .facts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.rofl-pic .facts code { font: 12.5px var(--p-mono); }
.rofl-pic .mute { color: var(--p-mute); }
.rofl-pic .note { color: var(--p-warn); background: var(--p-warn-bg); padding: 5px 10px; font-size: 13px; }
.rofl-pic details.as { padding: 4px 10px 8px; font-size: 12.5px; color: var(--p-mute); }
.rofl-pic details.as pre, .rofl-pic pre.fallback { margin: 6px 0 0; padding: 8px 10px; font: 12px/1.5 var(--p-mono); white-space: pre; overflow-x: auto; color: var(--p-fg); }
.rofl-pic .tag { font: 11px var(--p-mono); padding: 1px 6px; border-radius: 3px; background: var(--p-soft); color: var(--p-mute); }
.rofl-pic table.view { border-collapse: collapse; margin: 8px; font: 12.5px var(--p-mono); }
.rofl-pic table.view th, .rofl-pic table.view td { border: 1px solid var(--p-line); padding: 4px 9px; text-align: left; }
.rofl-pic [data-mark], .rofl-pic [data-group] { cursor: pointer; }
.rofl-pic svg text[data-group] { text-decoration: underline dotted; }
.rofl-pic svg { display: block; }
.rofl-pic svg text { font: 11px var(--p-mono); fill: var(--p-fg); }
.rofl-pic svg .axis text { fill: var(--p-mute); }
.rofl-pic svg .axis line, .rofl-pic svg .lanes line { stroke: var(--p-line); }
.rofl-pic svg [data-mark] { fill: var(--p-accent-bg); stroke: var(--p-accent); stroke-width: 1.2; }
.rofl-pic svg line[data-mark] { stroke-width: 1.6; }
.rofl-pic .failing, .rofl-pic .dangling, .rofl-pic svg .failing, .rofl-pic svg .dangling { color: var(--p-fail); background: var(--p-fail-bg); fill: var(--p-fail-bg); stroke: var(--p-fail); }
.rofl-pic .dangling, .rofl-pic svg .dangling { border-style: dashed; stroke-dasharray: 4 3; }
.rofl-pic .blind { background: repeating-linear-gradient(45deg, var(--p-warn-bg), var(--p-warn-bg) 4px, transparent 4px, transparent 8px); }
.rofl-pic svg .blind { fill: url(#rofl-hatch); stroke: var(--p-warn); stroke-dasharray: 5 3; }
.rofl-pic .unknown, .rofl-pic svg .unknown { color: var(--p-mute); stroke: var(--p-mute); stroke-dasharray: 2 3; }
.rofl-pic .gone, .rofl-pic svg .gone { opacity: .45; text-decoration: line-through; stroke-dasharray: 5 5; }
.rofl-pic .new { outline: 2px solid var(--p-pass); outline-offset: -2px; }
.rofl-pic svg .new { stroke: var(--p-pass); stroke-width: 3; }
.rofl-pic svg .region { fill: var(--p-soft); fill-opacity: .5; stroke: var(--p-mute); }
.rofl-pic svg line.link { stroke: var(--p-mute); stroke-width: 1.5; }
.rofl-pic svg .collapsed { stroke-width: 3; }`;
  doc.head.append(s);
}
