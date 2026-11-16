// The host facts of the JS scanner: the paths, and every string a file holds, cut the way a module specifier is read.

/** What the host tells the module graph and a scanner cannot: the files and directories there are, and each string cut the way a specifier is read. */
export function hostFacts(paths: string[], strings: Set<string>): string[] {
  // quoted the way the scanner quotes: ROFL has five escapes, and JSON's `\u0000` for a control character refuses the whole batch
  const q = (x: string) => '"' + x.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"', out: string[] = [], dirs = new Set(['.']);
  const dirOf = (p: string) => { const i = p.lastIndexOf('/'); return i < 0 ? '.' : p.slice(0, i); };
  for (const p of paths) for (let d = dirOf(p); d !== '.'; d = dirOf(d)) dirs.add(d);
  // the disk is a ledger of its own, [fs]: a directory, named by its path, has a file or a directory by its name
  const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);
  for (const d of dirs) if (d !== '.') out.push(`has_dir[fs](${q(dirOf(d))}, ${q(base(d))}).`);
  for (const p of paths) out.push(`has_file[fs](${q(dirOf(p))}, ${q(base(p))}).`);
  for (const s of strings) {
    // a specifier is one line and short; every segment repeats the string, so a long one costs its length times its slashes
    if (!s || s.includes('\n') || s.length > 4096) continue;
    const segs = s.split('/');
    out.push(`str_segs[code](${q(s)}, ${segs.length}).`, `str_char0[code](${q(s)}, ${q(String.fromCodePoint(s.codePointAt(0)!))}).`);
    segs.forEach((g, k) => out.push(`str_seg[code](${q(s)}, ${k}, ${q(g)}).`));
    if (s.indexOf(':') > 0) out.push(`str_scheme[code](${q(s)}, ${q(s.slice(0, s.indexOf(':')))}).`);
  }
  return out;
}
