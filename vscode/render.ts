// What a run says, per cell, as the Markdown a notebook output shows: answers as sentences, every code node a link to its line.
// The link is a bare path: VS Code's Markdown refuses `file:` links, and a notebook output opens `/path:line` at that line.
import { SAID, VERDICT } from '../notebook/cli.ts';
import type { NbCellOut, NbLine, NbResult } from '../notebook/kernel.ts';

export type Shown = { md: string; err: string; ok: boolean };
export type Run = NbResult & { paths: Record<string, string> };

/** `head`: what belongs to the notebook, not to one cell; `cells[k]` is the kernel's cell k + 1. */
export function render(r: Run): { head: Shown; cells: Shown[] } {
  const link = (s: string) => s.replace(/</g, '&lt;').replace(/\[([^\]]*?) at ([^\]\s]+):(\d+)\]/g, (m, label, f, n) =>
    r.paths[f] ? `[${label} at ${f}:${n}](<${r.paths[f]}:${n}>)` : m);
  const line = (l: NbLine) => {
    const out = [`**${link(l.text)}**${VERDICT(l) ? ` — ${l.verdict === 'fails' ? `**${VERDICT(l)}**` : VERDICT(l)}` : ''}`];
    if (l.answers.length) out.push(l.answers.map((a) => `- ${link(a.sentence)}`).join('\n') + (l.total > l.answers.length ? `\n- … ${l.total - l.answers.length} more` : ''));
    if (l.unsure?.total) out.push(`**warning**, out of sight (${link(l.unsure.text)}):\n` + l.unsure.answers.map((a) => `- ${link(a.sentence)}`).join('\n'));
    if (l.why) out.push(`<details><summary>proof</summary>\n\n\`\`\`\n${l.why}\n\`\`\`\n\n</details>`);
    return out.join('\n\n');
  };
  const cell = (c: NbCellOut): Shown => ({
    md: [...c.notes.map((n) => `*${link(n)}*`), ...c.lines.map(line)].join('\n\n'),
    err: c.errors.join('\n'),
    ok: !c.errors.length && !c.lines.some((l) => l.verdict === 'fails'),
  });
  const prose = r.cells[0] ? cell(r.cells[0]) : { md: '', err: '', ok: true };
  return {
    head: { md: [`*${SAID[r.status]}* · load ${r.ms.load} ms, run ${r.ms.run} ms`, prose.md].filter(Boolean).join('\n\n'), err: [...r.errors, prose.err].filter(Boolean).join('\n'), ok: r.status === 'ok' },
    cells: r.cells.slice(1).map(cell),
  };
}
