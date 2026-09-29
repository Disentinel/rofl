// What a run says, per cell, as the Markdown a notebook output shows: answers as sentences, every code node a link to its line.
// The link is a bare path: VS Code's Markdown refuses `file:` links, and a notebook output opens `/path:line` at that line.
// A code file is named from the directory all of them share; a failing never is named `rofl-cell:K`, which the editor turns into its cell.
import { OUTSIDE } from '../notebook/cli.ts';
import { said, SIGN, VERDICT } from '../notebook/kernel.ts';
import { codeNames } from '../notebook/front.ts';
import type { NbCellOut, NbLine, NbResult } from '../notebook/kernel.ts';
import type { View } from '../notebook/draw.ts';

const FOLD = 10;   // answers shown under a line; the rest fold
/** `views`: the cell's pictures, each an output of its own that the notebook renderer draws (vscode/visual/renderer.ts). */
export type Shown = { md: string; err: string; ok: boolean; views?: View[] };
export type Run = NbResult & { paths: Record<string, string>; outside?: string[] };

/** `head`: what belongs to the notebook, not to one cell; `cells[k]` is the kernel's cell k + 1. */
export function render(r: Run): { head: Shown; cells: Shown[] } {
  const files = Object.keys(r.paths), short = codeNames(files[0] ?? '', files);
  // a sentence is text, a string from the code in it too: every bracket is escaped, then the kernel's `[label at file:line]` becomes the one link
  const link = (s: string) => s.replace(/[\\[\]()]/g, '\\$&').replace(/</g, '&lt;').replace(/\\\[((?:[^\\]|\\[^\]])*?) at ((?:[^\s\\]|\\.)+):(\d+)\\\]/g, (m, label, esc, k) => {
    const f = esc.replace(/\\(.)/g, '$1');
    return r.paths[f] ? `[${label} at ${short[f]}:${k}](<${r.paths[f]}:${k}>)` : m;
  });
  const list = (rows: { sentence: string }[], total: number, fold = FOLD) => {
    const items = rows.map((a) => `- ${link(a.sentence)}`), more = total > rows.length ? [`- … ${total - rows.length} more, not sent by the kernel`] : [];
    return items.length + more.length <= fold ? [...items, ...more].join('\n')
      : `${items.slice(0, FOLD).join('\n')}\n\n<details><summary>${total - FOLD} more</summary>\n\n${[...items.slice(FOLD), ...more].join('\n')}\n\n</details>`;
  };
  const line = (l: NbLine) => {
    const v = VERDICT(l), sign = SIGN[l.verdict], word = l.verdict === 'fails' ? `**${v}**` : v;
    const out = [`**${link(l.text)}**${v ? ` — ${sign ? `<span class="verdict ${sign[0]}">${sign[1]} ${word}</span>` : word}` : ''}`];
    // a question's answers fold whole under its line and count; a failing never's rows are the point and stay open
    if (l.answers.length) out.push(l.kind === 'answers' ? `<details><summary>${l.total} ${l.total === 1 ? 'answer' : 'answers'}</summary>\n\n${list(l.answers, l.total, Infinity)}\n\n</details>` : list(l.answers, l.total));
    if (l.unsure?.total) out.push(`**warning**, out of sight (${link(l.unsure.text)}):\n\n` + list(l.unsure.answers, l.unsure.total));
    if (l.why) out.push(`<details><summary>proof</summary>\n\n\`\`\`\n${l.why}\n\`\`\`\n\n</details>`);
    return out.join('\n\n');
  };
  const cell = (c: NbCellOut): Shown => ({
    md: [...c.notes.map((n) => `*${link(n)}*`), ...c.lines.map(line)].join('\n\n'),
    err: c.errors.join('\n'),
    ok: !c.errors.length && !c.lines.some((l) => l.verdict === 'fails'),
    views: c.lines.flatMap((l) => l.view ? [l.view] : []),
  });
  const prose = r.cells[0] ? cell(r.cells[0]) : { md: '', err: '', ok: true };
  return {
    head: { md: [`*${said(r, (cell, line) => `[cell ${cell}, line ${line}](<rofl-cell:${cell}>)`)}* · load ${r.ms.load} ms, run ${r.ms.run} ms`, r.outside?.length ? `**warning**: ${OUTSIDE(r.outside.map((p) => `\`${p}\``))}` : '', prose.md].filter(Boolean).join('\n\n'), err: [...r.errors, prose.err].filter(Boolean).join('\n'), ok: r.status === 'ok' },
    cells: r.cells.slice(1).map(cell),
  };
}
