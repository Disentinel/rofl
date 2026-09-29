// The blocks of a Markdown file, as the reader reads them and the viewer shows them: one parser, so the two never disagree about structure.
// `at`, `end`: the block's lines, [at, end) from 0, in the text as given.
export type Item = { text: string; sub: string[] };
export type Block = { at?: number; end?: number } & (
  | { type: 'front'; kv: Record<string, string> }
  | { type: 'h'; level: number; text: string }
  | { type: 'p' | 'q' | 'code'; text: string; lines?: string[] }
  | { type: 'ul' | 'ol'; items: Item[] }
  | { type: 'table'; head: string[]; rows: string[][] });

export function parseMd(md: string): Block[] {
  const off = /^\n*/.exec(md)![0].length, lines = md.slice(off).split('\n'), blocks: Block[] = []; let i = 0, para: string[] = [];
  const flush = () => { if (para.length) { push(i - para.length, { type: 'p', text: para.join(' '), lines: para }); para = []; } };
  const push = (at: number, b: Block, end = i) => blocks.push({ ...b, at: at + off, end: end + off });
  if (lines[0] === '---') {
    const kv: Record<string, string> = {}; i = 1;
    while (i < lines.length && lines[i] !== '---') { const m = /^(\w+):\s*(.*)$/.exec(lines[i]); if (m) kv[m[1]] = m[2]; i++; }
    i++; blocks.push({ type: 'front', kv });
  }
  for (; i < lines.length; i++) {
    const l = lines[i]; let m;
    if (!l.trim()) { flush(); continue; }
    if ((m = /^(#+) (.*)$/.exec(l))) { flush(); blocks.push({ type: 'h', level: m[1].length, text: m[2] }); continue; }
    if (/^>/.test(l)) { flush(); const q: string[] = []; while (i < lines.length && /^>/.test(lines[i])) q.push(lines[i++].replace(/^> ?/, '')); i--; blocks.push({ type: 'q', text: q.join('\n') }); continue; }
    if (/^```/.test(l)) { flush(); const c: string[] = []; i++; while (i < lines.length && !/^```/.test(lines[i])) c.push(lines[i++]); blocks.push({ type: 'code', text: c.join('\n') }); continue; }
    if (/^\|/.test(l)) {
      flush(); const rows: string[][] = [], at = i;
      for (; i < lines.length && /^\|/.test(lines[i]); i++) { const c = lines[i].replace(/^\||\|$/g, '').split('|').map((s) => s.trim()); if (!c.every((x) => /^:?-+:?$/.test(x))) rows.push(c); }
      push(at, { type: 'table', head: rows[0], rows: rows.slice(1) }); i--; continue;
    }
    if ((m = /^( {0,3})(-|\d+\.) (.*)$/.exec(l))) {
      flush(); const base = m[1].length, type = m[2] === '-' ? 'ul' : 'ol', items: Item[] = [], at = i;
      for (; i < lines.length; i++) {
        const mm = /^( *)(-|\d+\.) (.*)$/.exec(lines[i]); if (!mm) break;
        if (mm[1].length <= base) { if ((mm[2] === '-') !== (type === 'ul')) break; items.push({ text: mm[3], sub: [] }); }
        else if (items.length) items[items.length - 1].sub.push(mm[3]);
        else break;
      }
      push(at, { type, items }); i--; continue;
    }
    para.push(l.trim());
  }
  flush(); return blocks;
}
