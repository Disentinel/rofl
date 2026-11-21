// The host facts of the JS scanner: the paths, which no AST can see.

/** What the host tells the module graph and a scanner cannot: the files and directories there are. A string a file
 *  holds is cut by the rules themselves (models/lang/js/rules/js-modules.rofl), so it stays a fact of that file. */
export function hostFacts(paths: string[]): string[] {
  // quoted the way the scanner quotes: ROFL has five escapes, and JSON's `\u0000` for a control character refuses the whole batch
  const q = (x: string) => '"' + x.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"', out: string[] = [], dirs = new Set(['.']);
  const dirOf = (p: string) => { const i = p.lastIndexOf('/'); return i < 0 ? '.' : p.slice(0, i); };
  for (const p of paths) for (let d = dirOf(p); d !== '.'; d = dirOf(d)) dirs.add(d);
  // the disk is a ledger of its own, [fs]: a directory, named by its path, has a file or a directory by its name
  const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);
  for (const d of dirs) if (d !== '.') out.push(`has_dir[fs](${q(dirOf(d))}, ${q(base(d))}).`);
  for (const p of paths) out.push(`has_file[fs](${q(dirOf(p))}, ${q(base(p))}).`);
  return out;
}
