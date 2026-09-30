// VS Code's notebook renderer for a draw line's output: the view drawn in the cell's output; a why and a pin go to the extension by message.
// A cell's answers are Markdown drawn by VS Code's own Markdown renderer, each verdict in the theme's colour for its meaning.
import { draw, graphLibs, type Drawn } from './pictures.ts';
import type { Hooks, Report } from './picture.ts';
import type { View } from '../../notebook/draw.ts';

type Heard = { id?: number; text?: string; zoom?: string; notebook?: string; measure?: boolean; show?: boolean; why?: string; rows?: boolean };
type Ctx = { postMessage?(m: unknown): void; onDidReceiveMessage?(f: (m: Heard) => void): unknown; getRenderer?(id: string): Promise<{ renderOutputItem(item: unknown, el: HTMLElement): void } | undefined> };
type Item = { id: string; mime: string; metadata?: unknown; text(): string; json(): { view: View; notebook: string; run?: string } };

const SAID = 'application/vnd.rofl.said+markdown';
const VERDICT_STYLE = `.verdict { font-weight: 600; } .verdict.pass { color: var(--vscode-testing-iconPassed); }
.verdict.fail { color: var(--vscode-testing-iconFailed, var(--vscode-errorForeground)); } .verdict.warn { color: var(--vscode-editorWarning-foreground); }
button.rofl-why { margin-left: .6em; padding: 0 .5em; font: inherit; font-size: 85%; color: var(--vscode-textLink-foreground); background: none; border: 1px solid currentColor; border-radius: 3px; cursor: pointer; }
pre.rofl-why-tree { margin: .3em 0 .6em; padding: .4em .6em; white-space: pre-wrap; background: var(--vscode-textCodeBlock-background); }`;

let asked = 0;
/** A picture's hooks when `talk` reaches the extension: a why, asked of the `run` that drew it, is answered by `heard` with its id. Shared by the notebook and the editor tab. */
export function talking(talk: (m: object) => void, view: View, notebook: string, run?: string, where: () => object = () => ({})) {
  const waiting = new Map<number, HTMLElement>();
  const hooks: Omit<Hooks, 'libs'> = {
    why: (literal, into) => { const id = ++asked; waiting.set(id, into); talk({ why: literal, notebook, id, run }); },
    pin: (facts) => talk({ pin: facts, notebook }),
    open: (text, ext) => talk({ notation: text, ext, notebook }),
    laid: (facts) => talk({ laid: facts, notebook }),
    drawn: (what: Report) => talk({ drawn: { kind: view.kind, ...what, ...where() }, notebook }),
  };
  return { hooks, heard: (m: Heard) => { const at = waiting.get(m.id!); if (at) { at.textContent = m.text!; waiting.delete(m.id!); } } };
}

export const activate = (ctx: Ctx) => {
  const drawn = new Map<string, Drawn[]>();   // each notebook's pictures, which the extension can zoom as a click does
  const talk = ctx.postMessage?.bind(ctx), rows = talk && asking(talk);
  const heard: ((m: Heard) => void)[] = rows ? [rows.heard] : [];
  ctx.onDidReceiveMessage?.((m) => {
    const ds = drawn.get(m.notebook!) ?? [];
    if (m.why !== undefined) return rows?.press(m.why);
    if (m.rows) return rows?.census();
    if (m.zoom !== undefined) return void ds.forEach((d) => d.toggle(m.zoom!));
    if (m.measure) return ds.forEach((d) => d.report());
    if (m.show) return void ds.some((d) => d.show());
    heard.forEach((f) => f(m));
  });
  return {
    async renderOutputItem(item: Item, el: HTMLElement) {
      if (item.mime === SAID) return void rows?.add(await said(ctx, item, el, talk));
      const { view, notebook, run } = item.json(), t = talk && talking(talk, view, notebook, run);
      if (t) heard.push(t.heard);
      const d = await draw(el, view, { libs: () => graphLibs(el.ownerDocument), ...(t && { ...t.hooks, show: () => talk!({ show: view, notebook, run }) }) });
      drawn.set(notebook, [...(drawn.get(notebook) ?? []), d]);
    },
  };
};

/** The cell's Markdown, drawn by VS Code's Markdown renderer, with the verdicts' colours; the colours each verdict was drawn in go to the extension, for a test to read back. */
async function said(ctx: Ctx, item: Item, el: HTMLElement, talk?: (m: object) => void): Promise<ParentNode | undefined> {
  const md = await ctx.getRenderer?.('vscode.markdown-it-renderer');
  if (!md) { el.textContent = item.text(); return; }
  md.renderOutputItem({ id: item.id, mime: 'text/markdown', metadata: item.metadata, text: () => item.text(), json: () => undefined, data: () => new TextEncoder().encode(item.text()), blob: () => new Blob([item.text()]) }, el);
  const root = el.shadowRoot ?? el;
  if (!root.querySelector('style.rofl-verdict')) { const s = document.createElement('style'); s.className = 'rofl-verdict'; s.textContent = VERDICT_STYLE; root.append(s); }
  const vs = [...root.querySelectorAll<HTMLElement>('.verdict')];
  if (vs.length) talk?.({ verdicts: vs.map((v) => ({ text: v.textContent, colour: getComputedStyle(v).color, around: getComputedStyle(v.parentElement!).color })) });
  return root;
}

/** Each answer row's why: its mark in the Markdown becomes a button that shows the proof under the row, and hides it again.
 *  The proof is asked of the run the row names; what the extension answers is shown as it is, a proof or why there is none.
 *  Without a way to the extension no mark becomes a button, and a mark alone shows nothing. */
function asking(talk: (m: object) => void) {
  const roots: ParentNode[] = [], waiting = new Map<number, { pre: HTMLElement; row: string }>();
  const text = (li: Element) => [...li.childNodes].filter((n) => !(n instanceof HTMLElement && (n.matches('button.rofl-why, pre.rofl-why-tree')))).map((n) => n.textContent).join('').trim();
  const live = () => roots.filter((r) => (r as Node).isConnected);
  const buttons = () => live().reverse().flatMap((r) => [...r.querySelectorAll<HTMLButtonElement>('button.rofl-why')]);
  return {
    add(root?: ParentNode) {
      if (!root) return;
      for (const mark of root.querySelectorAll<HTMLElement>('span.rofl-why')) {
        const li = mark.closest('li'), literal = (mark.dataset.why ?? '').replace(/_([0-9a-f]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))), run = mark.dataset.run;
        if (!li) { mark.remove(); continue; }
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'rofl-why'; b.textContent = 'why'; b.title = `why ${literal}`;
        b.addEventListener('click', () => {
          const row = text(li), open = li.querySelector(':scope > pre.rofl-why-tree');
          if (open) { open.remove(); talk({ whyShown: { row, tree: null } }); return; }
          const pre = document.createElement('pre');
          pre.className = 'rofl-why-tree'; pre.textContent = 'asking the kernel\u2026';
          li.append(pre);
          const id = ++asked;
          waiting.set(id, { pre, row });
          talk({ why: literal, run, id });
        });
        mark.replaceWith(b);
      }
      roots.push(root);
    },
    heard(m: Heard) {
      const w = waiting.get(m.id!);
      if (!w) return;
      waiting.delete(m.id!);
      w.pre.textContent = m.text!;
      if (w.pre.isConnected) talk({ whyShown: { row: w.row, tree: m.text } });
    },
    press: (row: string) => buttons().find((b) => text(b.closest('li')!) === row)?.click(),
    census: () => talk({ rows: live().flatMap((r) => [...r.querySelectorAll('li')]).map((li) => ({ row: text(li), why: !!li.querySelector(':scope > button.rofl-why') })) }),
  };
}
