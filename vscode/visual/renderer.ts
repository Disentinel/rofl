// VS Code's notebook renderer for a draw line's output: the view drawn in the cell's output; a why and a pin go to the extension by message.
import { draw, graphLibs, type Drawn } from './pictures.ts';
import type { View } from '../../notebook/draw.ts';

type Ctx = { postMessage?(m: unknown): void; onDidReceiveMessage?(f: (m: { id?: number; text?: string; zoom?: string; notebook?: string }) => void): unknown };
type Item = { json(): { view: View; notebook: string } };

export const activate = (ctx: Ctx) => {
  const waiting = new Map<number, HTMLElement>();
  let asked = 0;
  const drawn = new Map<string, Drawn[]>();   // each notebook's pictures, which the extension can zoom as a click does
  ctx.onDidReceiveMessage?.((m) => {
    if (m.zoom !== undefined) { for (const d of drawn.get(m.notebook!) ?? []) void d.toggle(m.zoom); return; }
    const at = waiting.get(m.id!); if (at) { at.textContent = m.text!; waiting.delete(m.id!); }
  });
  const talk = ctx.postMessage?.bind(ctx);
  return {
    renderOutputItem(item: Item, el: HTMLElement) {
      const { view, notebook } = item.json();
      void draw(el, view, {
        libs: () => graphLibs(el.ownerDocument),
        ...(talk && {
          why: (literal: string, into: HTMLElement) => { const id = ++asked; waiting.set(id, into); talk({ why: literal, notebook, id }); },
          pin: (facts: string) => talk({ pin: facts, notebook }),
          open: (text: string, ext: string) => talk({ notation: text, ext, notebook }),
          laid: (facts: string[]) => talk({ laid: facts, notebook }),
          drawn: (what: { frames: string[]; labels: string[] }) => talk({ drawn: { kind: view.kind, ...what }, notebook }),
        }),
      }).then((d) => drawn.set(notebook, [...(drawn.get(notebook) ?? []), d]));
    },
  };
};
