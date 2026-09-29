// VS Code's notebook renderer for a draw line's output: the view drawn in the cell's output; a why and a pin go to the extension by message.
// A cell's answers are Markdown drawn by VS Code's own Markdown renderer, each verdict in the theme's colour for its meaning.
import { draw, graphLibs, type Drawn } from './pictures.ts';
import type { Hooks, Report } from './picture.ts';
import type { View } from '../../notebook/draw.ts';

type Heard = { id?: number; text?: string; zoom?: string; notebook?: string; measure?: boolean; show?: boolean };
type Ctx = { postMessage?(m: unknown): void; onDidReceiveMessage?(f: (m: Heard) => void): unknown; getRenderer?(id: string): Promise<{ renderOutputItem(item: unknown, el: HTMLElement): void } | undefined> };
type Item = { id: string; mime: string; metadata?: unknown; text(): string; json(): { view: View; notebook: string } };

const SAID = 'application/vnd.rofl.said+markdown';
const VERDICT_STYLE = `.verdict { font-weight: 600; } .verdict.pass { color: var(--vscode-testing-iconPassed); }
.verdict.fail { color: var(--vscode-testing-iconFailed, var(--vscode-errorForeground)); } .verdict.warn { color: var(--vscode-editorWarning-foreground); }`;

let asked = 0;
/** A picture's hooks when `talk` reaches the extension: a why is answered by `heard` with its id. Shared by the notebook and the editor tab. */
export function talking(talk: (m: object) => void, view: View, notebook: string, where: () => object = () => ({})) {
  const waiting = new Map<number, HTMLElement>();
  const hooks: Omit<Hooks, 'libs'> = {
    why: (literal, into) => { const id = ++asked; waiting.set(id, into); talk({ why: literal, notebook, id }); },
    pin: (facts) => talk({ pin: facts, notebook }),
    open: (text, ext) => talk({ notation: text, ext, notebook }),
    laid: (facts) => talk({ laid: facts, notebook }),
    drawn: (what: Report) => talk({ drawn: { kind: view.kind, ...what, ...where() }, notebook }),
  };
  return { hooks, heard: (m: Heard) => { const at = waiting.get(m.id!); if (at) { at.textContent = m.text!; waiting.delete(m.id!); } } };
}

export const activate = (ctx: Ctx) => {
  const drawn = new Map<string, Drawn[]>();   // each notebook's pictures, which the extension can zoom as a click does
  const heard: ((m: Heard) => void)[] = [];
  ctx.onDidReceiveMessage?.((m) => {
    const ds = drawn.get(m.notebook!) ?? [];
    if (m.zoom !== undefined) return void ds.forEach((d) => d.toggle(m.zoom!));
    if (m.measure) return ds.forEach((d) => d.report());
    if (m.show) return void ds.some((d) => d.show());
    heard.forEach((f) => f(m));
  });
  const talk = ctx.postMessage?.bind(ctx);
  return {
    async renderOutputItem(item: Item, el: HTMLElement) {
      if (item.mime === SAID) return said(ctx, item, el, talk);
      const { view, notebook } = item.json(), t = talk && talking(talk, view, notebook);
      if (t) heard.push(t.heard);
      const d = await draw(el, view, { libs: () => graphLibs(el.ownerDocument), ...(t && { ...t.hooks, show: () => talk!({ show: view, notebook }) }) });
      drawn.set(notebook, [...(drawn.get(notebook) ?? []), d]);
    },
  };
};

/** The cell's Markdown, drawn by VS Code's Markdown renderer, with the verdicts' colours; the colours each verdict was drawn in go to the extension, for a test to read back. */
async function said(ctx: Ctx, item: Item, el: HTMLElement, talk?: (m: object) => void) {
  const md = await ctx.getRenderer?.('vscode.markdown-it-renderer');
  if (!md) { el.textContent = item.text(); return; }
  md.renderOutputItem({ id: item.id, mime: 'text/markdown', metadata: item.metadata, text: () => item.text(), json: () => undefined, data: () => new TextEncoder().encode(item.text()), blob: () => new Blob([item.text()]) }, el);
  const root = el.shadowRoot ?? el;
  if (!root.querySelector('style.rofl-verdict')) { const s = document.createElement('style'); s.className = 'rofl-verdict'; s.textContent = VERDICT_STYLE; root.append(s); }
  const vs = [...root.querySelectorAll<HTMLElement>('.verdict')];
  if (vs.length) talk?.({ verdicts: vs.map((v) => ({ text: v.textContent, colour: getComputedStyle(v).color, around: getComputedStyle(v.parentElement!).color })) });
}
