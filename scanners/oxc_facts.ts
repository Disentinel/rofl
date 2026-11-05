// The notebook host's code facts through oxc (node only): what playground/host.ts codeFacts gives from Babel, for a host that can run
// rust/tools/oxc_scan. The files are written to a directory of their own, scanned there, and named by their path from it.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { hostFacts, type Node } from '../playground/host.ts';
import { oxcScan } from './oxc_bin.ts';

export type CodeFacts = { facts: string[]; nodes: Record<string, Node>; parseErrors: Record<string, string>; host: string[] };

const unq = (q: string): string => q.replace(/^"|"$/g, '').replace(/\\(["\\])/g, '$1');

/** A node as the code writes it, `s.put()`, `new Store()`, `class Store`, from oxc's own facts. */
function labelNodes(kind: Map<string, string>, kid: Map<string, string>, attr: Map<string, string>, nodes: Record<string, Node>): void {
  const k = (id: string, field: string) => kid.get(`${id} ${field}`);
  const lab = (id: string | undefined, d = 0): string => {
    const kd = id && kind.get(id);
    if (!id || !kd || d > 4) return '…';
    const at = (key: string) => attr.get(`${id} ${key}`);
    switch (kd) {
      case 'identifier_reference': case 'binding_identifier': case 'identifier_name': return at('name') ?? 'name';
      case 'private_identifier': return '#' + (at('name') ?? '');
      case 'this_expression': return 'this';
      case 'string_literal': return JSON.stringify(at('value') ?? '');
      case 'numeric_literal': case 'boolean_literal': return String(at('value'));
      case 'static_member_expression': return lab(k(id, 'object'), d + 1) + '.' + lab(k(id, 'property'), d + 1);
      case 'computed_member_expression': return lab(k(id, 'object'), d + 1) + '[…]';
      case 'call_expression': return lab(k(id, 'callee'), d + 1) + '()';
      case 'new_expression': return 'new ' + lab(k(id, 'callee'), d + 1) + '()';
      case 'await_expression': return 'await ' + lab(k(id, 'argument'), d + 1);
      case 'parenthesized_expression': return lab(k(id, 'expression'), d + 1);
      case 'class': return 'class ' + (k(id, 'id') ? lab(k(id, 'id'), d + 1) : '');
      case 'function': return 'function ' + (k(id, 'id') ? lab(k(id, 'id'), d + 1) : '') + '()';
      case 'arrow_function_expression': return '() =>';
      case 'method_definition': return lab(k(id, 'key'), d + 1) + '()';
      case 'property_definition': case 'object_property': return lab(k(id, 'key'), d + 1);
      case 'variable_declarator': return lab(k(id, 'id'), d + 1) + (k(id, 'init') ? ' = ' + lab(k(id, 'init'), d + 1) : '');
      case 'assignment_expression': return lab(k(id, 'left'), d + 1) + ' = ' + lab(k(id, 'right'), d + 1);
      case 'program': return nodes[id]?.file ?? 'program';
      default: return kd.replace(/_(expression|declaration|statement)$/, '').replace(/_/g, ' ');
    }
  };
  for (const id of Object.keys(nodes)) { const l = lab(id); nodes[id].label = l.length > 40 ? l.slice(0, 39) + '…' : l; }
}

export function oxcFacts(files: Record<string, string>, data: string[] = []): CodeFacts {
  const bin = oxcScan();
  if (typeof bin !== 'string') throw new Error(bin.error);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-code-'));
  try {
    for (const [f, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); }
    const r = spawnSync(bin, ['--no-start', dir], { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });
    const facts: string[] = [], nodes: Record<string, Node> = {}, parseErrors: Record<string, string> = {}, strings = new Set<string>();
    const kind = new Map<string, string>(), kid = new Map<string, string>(), attr = new Map<string, string>();
    for (const l of r.stdout.split('\n')) {
      if (!l || l.startsWith('--')) continue;
      facts.push(l);
      let m = /^node\[ast_oxc\]\((\w+), (\w+), "((?:[^"\\]|\\.)*)"\)\.$/.exec(l);
      if (m) { kind.set(m[1], m[2]); nodes[m[1]] = { kind: m[2], file: unq(`"${m[3]}"`), line: 0, label: '' }; continue; }
      m = /^line\[ast_oxc\]\((\w+), (\d+)\)\.$/.exec(l);
      if (m) { if (nodes[m[1]]) nodes[m[1]].line = Number(m[2]); continue; }
      m = /^child\[ast_oxc\]\((\w+), (\w+), 0, (\w+)\)\.$/.exec(l);
      if (m) { kid.set(`${m[1]} ${m[2]}`, m[3]); continue; }
      m = /^attr\[ast_oxc\]\((\w+), (\w+), (.*)\)\.$/.exec(l);
      if (m) { attr.set(`${m[1]} ${m[2]}`, m[3].startsWith('"') ? unq(m[3]) : m[3]); if (m[2] === 'value' && m[3].startsWith('"')) strings.add(unq(m[3])); continue; }
      m = /^parse_error\[ast_oxc\]\("((?:[^"\\]|\\.)*)", "(.*)"\)\.$/.exec(l);
      if (m) parseErrors[m[1]] = m[2];
    }
    labelNodes(kind, kid, attr, nodes);
    return { facts, nodes, parseErrors, host: hostFacts([...Object.keys(files), ...data], strings) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
