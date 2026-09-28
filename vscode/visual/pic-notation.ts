// A notation drawn by the domain's own tool: the standard file as written, and a button that opens it as a file for that tool.
import { backendOf } from '../../notebook/draw-text.ts';
import { esc, type Picture } from './picture.ts';

export const pictures: Picture[] = [{ kind: 'notation', mount: (el, v, h) => {
  const b = backendOf(v), text = b.write(v);
  el.innerHTML = `${h.open ? `<div class="pbar"><span class="mute">${esc(b.format)}: the domain's own standard, for its own tool</span><span class="spacer"></span><button type="button" data-open>Open as .${esc(b.fence === 'gedcom' ? 'ged' : b.format)}</button></div>` : ''}<pre class="fallback">${esc(text)}</pre>`;
  el.querySelector<HTMLButtonElement>('[data-open]')?.addEventListener('click', () => h.open!(text, b.fence === 'gedcom' ? 'ged' : b.format));
} }];
