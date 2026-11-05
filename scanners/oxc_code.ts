// oxc's facts of one file under the names the tools of scripts/js_lab, witness_check and volume_locality read, ast_node[code] and its kin:
// the same rows as `[ast_oxc]`, renamed. The model reads the roles (models/lang/js/oxc-roles.rofl), and a notebook reads these through oxc-to-code.rofl.
import { scanText } from './oxc_wasm.ts';

const RENAME: [RegExp, string][] = [[/^node\[ast_oxc\]/, 'ast_node[code]'], [/^line\[ast_oxc\]/, 'ast_line[code]'], [/^child\[ast_oxc\]/, 'ast_child[code]'],
  [/^attr\[ast_oxc\]/, 'ast_attr[code]'], [/^file\[ast_oxc\]/, 'ast_file[code]'], [/^parse_error\[ast_oxc\]/, 'ast_parse_error[code]']];

export function scan(src: string, opts: { file?: string } = {}): { facts: string[] } {
  const facts = scanText(src, opts.file ?? '<anonymous>').split('\n').filter((l) => l && !l.startsWith('--'));
  return { facts: facts.map((l) => RENAME.reduce((t, [re, to]) => t.replace(re, to), l)) };
}

/** The scans that go into ONE world: a label scanned twice into a world is refused. */
export class ScanSet {
  private labels = new Set<string>();
  scan(src: string, opts: { file?: string } = {}): { facts: string[] } {
    const file = opts.file ?? '<anonymous>';
    if (this.labels.has(file)) throw new Error(`scanner: "${file}" is scanned twice into one world; forget it before scanning it again`);
    this.labels.add(file);
    return scan(src, opts);
  }
  forget(file: string): void { this.labels.delete(file); }
}
