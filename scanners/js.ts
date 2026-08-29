// scanners/js.ts — JS/TS source → ROFL facts. A domain scanner, NOT part of
// the kernel (src/ stays zero-dependency and under the kernel grep test).
//
// All facts are emitted into the [code] perspective; the materializer grants
// authority(code, scanner) so that facts loaded with who=scanner pass the
// forged[audit] check while anyone else asserting into [code] is flagged.
//
// Fact vocabulary (v0):
//   src_file[code](Path, Hash12)          -- file identity, content hash prefix
//   src_func[code](Path, Name, Line)      -- function decls + named fn/arrow consts
//   src_class[code](Path, Name, Line)
//   src_method[code](Path, Class, Name, Line)
//   src_import[code](Path, Source)        -- import decls + require("...")
//   src_export[code](Path, Name)          -- named exports; default => "default"
//   src_call[code](Path, Caller, Callee)  -- approximate: identifier / obj.prop
//   src_parse_error[code](Path, Message)

import { parse } from '@babel/parser';

export const SCANNER_PERSP = 'code';

function str(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\t]/g, ' ') + '"';
}

function fact(rel: string, ...args: (string | number)[]): string {
  const rendered = args.map((a) => (typeof a === 'number' ? String(a) : str(a)));
  return `${rel}[${SCANNER_PERSP}](${rendered.join(', ')}).`;
}

type BabelPlugin = 'typescript' | 'jsx';

function pluginsFor(relPath: string): BabelPlugin[] {
  if (relPath.endsWith('.tsx')) return ['typescript', 'jsx'];
  if (/\.[cm]?ts$/.test(relPath)) return ['typescript'];
  return ['jsx'];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function calleeName(c: any): string | null {
  if (!c) return null;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed && c.property?.type === 'Identifier') {
    if (c.object?.type === 'Identifier') return `${c.object.name}.${c.property.name}`;
    if (c.object?.type === 'ThisExpression') return `this.${c.property.name}`;
    return c.property.name;
  }
  return null;
}

interface Ctx { fn: string; cls: string | null; }

export function extractFacts(relPath: string, code: string, hash12: string): string[] {
  const facts = new Set<string>();
  facts.add(fact('src_file', relPath, hash12));

  let ast: any;
  try {
    ast = parse(code, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: pluginsFor(relPath),
    });
  } catch (e) {
    facts.add(fact('src_parse_error', relPath, (e as Error).message.slice(0, 120)));
    return [...facts].sort();
  }

  const walk = (node: any, ctx: Ctx): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) walk(n, ctx); return; }
    if (typeof node.type !== 'string') return;
    const line: number = node.loc?.start?.line ?? 0;
    let next = ctx;

    switch (node.type) {
      case 'FunctionDeclaration':
      case 'TSDeclareFunction':
        if (node.id?.name) {
          facts.add(fact('src_func', relPath, node.id.name, line));
          next = { ...ctx, fn: node.id.name };
        }
        break;
      case 'VariableDeclarator':
        if (node.id?.type === 'Identifier' && node.init &&
            (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')) {
          facts.add(fact('src_func', relPath, node.id.name, line));
          next = { ...ctx, fn: node.id.name };
        }
        break;
      case 'ClassDeclaration':
      case 'ClassExpression':
        if (node.id?.name) {
          facts.add(fact('src_class', relPath, node.id.name, line));
          next = { ...ctx, cls: node.id.name };
        }
        break;
      case 'ClassMethod':
      case 'ClassPrivateMethod': {
        const name = node.key?.name ?? node.key?.id?.name ?? node.key?.value;
        if (typeof name === 'string' && ctx.cls) {
          facts.add(fact('src_method', relPath, ctx.cls, name, line));
          next = { ...ctx, fn: `${ctx.cls}.${name}` };
        }
        break;
      }
      case 'ImportDeclaration':
        if (typeof node.source?.value === 'string') {
          facts.add(fact('src_import', relPath, node.source.value));
        }
        break;
      case 'ExportNamedDeclaration': {
        const d = node.declaration;
        if (d?.id?.name) facts.add(fact('src_export', relPath, d.id.name));
        if (d?.type === 'VariableDeclaration') {
          for (const dec of d.declarations ?? []) {
            if (dec.id?.type === 'Identifier') facts.add(fact('src_export', relPath, dec.id.name));
          }
        }
        for (const s of node.specifiers ?? []) {
          const n = s.exported?.name ?? s.exported?.value;
          if (typeof n === 'string') facts.add(fact('src_export', relPath, n));
        }
        break;
      }
      case 'ExportDefaultDeclaration':
        facts.add(fact('src_export', relPath, 'default'));
        break;
      case 'CallExpression': {
        const callee = calleeName(node.callee);
        if (callee === 'require' && node.arguments?.[0]?.type === 'StringLiteral') {
          facts.add(fact('src_import', relPath, node.arguments[0].value));
        } else if (callee) {
          facts.add(fact('src_call', relPath, ctx.fn, callee));
        }
        break;
      }
    }

    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'range' || k === 'leadingComments' ||
          k === 'trailingComments' || k === 'innerComments') continue;
      walk(node[k], next);
    }
  };

  walk(ast.program, { fn: 'toplevel', cls: null });
  return [...facts].sort();
}
