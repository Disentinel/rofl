// The facts of a directory of code, as the notebook host and `npm run scan` give them (docs/cli.md): the scanner's
// of each file and the host's of the paths and the strings. Apart from playground/host.ts so that what a scan runs
// is this, scanners/js_ast.ts and its parser, and not the whole engine host.ts imports: a scan names its code
// (`-- code:`), and every edit of that code makes every kept scan stale.

import { scan } from './js_ast.ts';

export type Node = { kind: string; file: string; line: number; label: string };

/** A string as the scanner quotes it; a control character in it is left as it is, where JSON would refuse the whole run. */
const unquote = (q: string): string => { try { return JSON.parse(q); } catch { return q.slice(1, -1); } };

/** The facts of the code: the scanner's of each file, and the host's of the paths and of every string a file holds. */
export function codeFacts(files: Record<string, string>, data: string[] = []): { facts: string[]; nodes: Record<string, Node>; parseErrors: Record<string, string>; host: string[] } {
  const nodes: Record<string, Node> = {};
  const parseErrors: Record<string, string> = {};
  const facts: string[] = [], strings = new Set<string>();
  for (const [path, src] of Object.entries(files)) {
    for (const fact of scan(src, { file: path }).facts) {
      facts.push(fact);
      const m = /^ast_node\[code\]\((\w+), (\w+), "([^"]*)"\)/.exec(fact);
      if (m) nodes[m[1]] = { kind: m[2], file: m[3], line: 0, label: '' };
      const l = /^ast_line\[code\]\((\w+), (\d+)\)/.exec(fact);
      if (l) nodes[l[1]].line = Number(l[2]);
      const e = /^ast_parse_error\[code\]\("[^"]*", "(.*)"\)\.$/.exec(fact);
      if (e) parseErrors[path] = e[1];
      const v = /^ast_attr\[code\]\(\w+, value, (".*")\)\.$/.exec(fact);
      if (v) strings.add(unquote(v[1]));
    }
  }
  return { facts, nodes, parseErrors, host: hostFacts([...Object.keys(files), ...data], strings) };
}

/** What the host tells the module graph and a scanner cannot: the files and directories there are, and each string cut the way a specifier is read. */
function hostFacts(paths: string[], strings: Set<string>): string[] {
  // quoted the way the scanner quotes: ROFL has five escapes, and JSON's `\u0000` for a control character refuses the whole batch
  const q = (x: string) => '"' + x.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"', out: string[] = [], dirs = new Set(['.']);
  const dirOf = (p: string) => { const i = p.lastIndexOf('/'); return i < 0 ? '.' : p.slice(0, i); };
  for (const p of paths) for (let d = dirOf(p); d !== '.'; d = dirOf(d)) dirs.add(d);
  for (const d of dirs) {
    out.push(`fs_dir[code](${q(d)}).`);
    if (d !== '.') out.push(`fs_parent[code](${q(d)}, ${q(dirOf(d))}).`, `fs_dir_in[code](${q(dirOf(d))}, ${q(d.slice(d.lastIndexOf('/') + 1))}, ${q(d)}).`);
  }
  for (const p of paths) out.push(`fs_file[code](${q(p)}).`, `fs_dir_of[code](${q(p)}, ${q(dirOf(p))}).`, `fs_file_in[code](${q(dirOf(p))}, ${q(p.slice(p.lastIndexOf('/') + 1))}, ${q(p)}).`);
  for (const s of strings) {
    if (!s || s.includes('\n')) continue;
    const segs = s.split('/');
    out.push(`str_segs[code](${q(s)}, ${segs.length}).`, `str_char0[code](${q(s)}, ${q(String.fromCodePoint(s.codePointAt(0)!))}).`);
    segs.forEach((g, k) => out.push(`str_seg[code](${q(s)}, ${k}, ${q(g)}).`));
    if (s.indexOf(':') > 0) out.push(`str_scheme[code](${q(s)}, ${q(s.slice(0, s.indexOf(':')))}).`);
  }
  return out;
}
