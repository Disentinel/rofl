// Where an answer's nodes stand (the Rust engine's rust/rofl/src/bin/rofl/place.rs, byte for byte): a value the
// world's plan places, `site[fixpointplan](Rel, Book)` (`at[tree](N, File, Line)`), said under its row as
// `  V: File:Line  text`, the text read from the file as named, else where a file of facts says its scan read it.
import * as fs from 'node:fs';
import type { Rofl } from './api.ts';

export class Places {
  private reads: string[] = [];
  private lines = new Map<string, string[] | null>();
  private sites: [string, string][] | null = null;
  private at = new Map<string, string[] | null>();
  private rofl: Rofl;

  constructor(rofl: Rofl, files: string[]) {
    this.rofl = rofl;
    for (const f of files.filter((f) => !f.endsWith('.md'))) {
      let text: string;
      try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
      for (const l of text.split('\n').map((l) => l.replace(/\r$/, ''))) {
        if (l.startsWith('-- reads: ')) this.reads.push(l.slice('-- reads: '.length));
        else if (!l.startsWith('--') && l.trim() !== '') break;
      }
    }
  }

  private site(v: string): string[] | null {
    if (!/^[a-z][A-Za-z0-9_]*$/.test(v)) return null;
    if (!this.at.has(v)) {
      this.sites ??= this.rofl.query('site[fixpointplan](R, B)').rows.map((r) => [r.bindings.R, r.bindings.B]);
      let found: string[] | null = null;
      for (const [r, b] of this.sites) {
        const row = this.rofl.query(`${r}[${b}](${v}, Site_1, Site_2)`).rows[0];
        if (row) { found = [row.bindings.Site_1, row.bindings.Site_2].map((t) => (t.startsWith('"') ? JSON.parse(t) as string : t)); break; }
      }
      this.at.set(v, found);
    }
    return this.at.get(v)!;
  }

  private text(file: string, line: number): string | null {
    if (!this.lines.has(file)) {
      const path = [file, ...this.reads.filter((p) => p.endsWith(`/${file}`))].find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
      this.lines.set(file, path === undefined ? null : fs.readFileSync(path, 'utf8').split('\n').map((l) => l.replace(/\r$/, '')));
    }
    const l = this.lines.get(file)?.[line - 1]?.trim();
    if (l === undefined) return null;
    const cs = Array.from(l);
    return cs.length > 100 ? `${cs.slice(0, 100).join('')}…` : l;
  }

  /** The lines a row's places add under it, each `\n  V: File:Line  text`. */
  under(bindings: Record<string, string>): string {
    return Object.entries(bindings).map(([v, x]) => {
      const at = this.site(x);
      if (at === null) return '';
      const t = at.length === 2 && /^\d+$/.test(at[1]) ? this.text(at[0], Number(at[1])) : null;
      return `\n  ${v}: ${at.join(':')}${t ? `  ${t}` : ''}`;
    }).join('');
  }
}
