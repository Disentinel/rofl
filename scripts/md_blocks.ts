// The blocks of a Markdown file, as the reader reads them and the viewer shows them: one parser, so the two never disagree about structure.
export type Item = { text: string; sub: string[] };
export type Block =
  | { type: 'front'; kv: Record<string, string> }
  | { type: 'h'; level: number; text: string }
  | { type: 'p' | 'q' | 'code'; text: string }
  | { type: 'ul' | 'ol'; items: Item[] }
  | { type: 'table'; head: string[]; rows: string[][] };

export function parseMd(md: string): Block[] {
  const lines = md.replace(/^\n+/, '').split('\n'); const blocks: Block[] = []; let i = 0, para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
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
      flush(); const rows: string[][] = [];
      for (; i < lines.length && /^\|/.test(lines[i]); i++) { const c = lines[i].replace(/^\||\|$/g, '').split('|').map((s) => s.trim()); if (!c.every((x) => /^:?-+:?$/.test(x))) rows.push(c); }
      i--; blocks.push({ type: 'table', head: rows[0], rows: rows.slice(1) }); continue;
    }
    if ((m = /^( {0,3})(-|\d+\.) (.*)$/.exec(l))) {
      flush(); const base = m[1].length, type = m[2] === '-' ? 'ul' : 'ol', items: Item[] = [];
      for (; i < lines.length; i++) {
        const mm = /^( *)(-|\d+\.) (.*)$/.exec(lines[i]); if (!mm) break;
        if (mm[1].length <= base) { if ((mm[2] === '-') !== (type === 'ul')) break; items.push({ text: mm[3], sub: [] }); }
        else if (items.length) items[items.length - 1].sub.push(mm[3]);
        else break;
      }
      i--; blocks.push({ type, items }); continue;
    }
    para.push(l.trim());
  }
  flush(); return blocks;
}
