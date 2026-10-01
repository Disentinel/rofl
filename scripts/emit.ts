// TypeScript modules as the browser modules a static page loads: each flat in lib/, a relative `x.ts` import becoming `./x.js`, and the two node
// modules the kernel's neighbours use given a browser stand-in. The playground and the workbench are built with it.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const SHIMS: Record<string, string> = {
  'node:fs': 'export const existsSync = () => false;\nexport const readFileSync = () => { throw new Error("no files in a browser"); };\n',
  'node:crypto': 'export const createHash = () => { let h = 0x811c9dc5; const o = { update(s) { for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0; return o; }, digest: () => h.toString(16).padStart(8, "0") }; return o; };\n',
};

const nameOf = (src: string) => src.replace(/^.*\//, '').replace(/\.ts$/, '.js');

/** `src`, from `root`, into `lib`; its text back. */
export function emit(root: string, lib: string, src: string): string {
  const js = ts.transpileModule(readFileSync(`${root}${src}`, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/from '(?:\.\.?\/)+(?:[\w-]+\/)*([\w-]+)\.ts'/g, "from './$1.js'")
    .replace(/from '@babel\/parser'/g, "from './babel-parser.js'")
    .replace(/from 'node:(fs|crypto)'/g, "from './shim-$1.js'");
  if (/from 'node:/.test(js)) throw new Error(`${src} still imports a node module`);
  writeFileSync(`${lib}/${nameOf(src)}`, js);
  return js;
}

/** The node stand-ins, and a check that every module of `lib` imports only modules that are there. */
export function finish(lib: string): void {
  for (const [m, text] of Object.entries(SHIMS)) writeFileSync(`${lib}/shim-${m.slice(5)}.js`, text);
  const modules = new Set(readdirSync(lib));
  for (const m of modules) for (const [, dep] of readFileSync(`${lib}/${m}`, 'utf8').matchAll(/from '\.\/([\w-]+\.js)'/g)) if (!modules.has(dep)) throw new Error(`lib/${m} imports ${dep}, which the build did not emit`);
}

/** `entries` and every module they import, from `root`; a module `stubs` names by its path is written as that text instead, and what it imports is not followed. */
export function emitAll(root: string, lib: string, entries: string[], stubs: Record<string, string> = {}): string[] {
  const done = new Set<string>(), todo = [...entries], names = new Map<string, string>();
  while (todo.length) {
    const src = todo.pop()!;
    if (done.has(src)) continue;
    done.add(src);
    const was = names.get(nameOf(src)); if (was) throw new Error(`${src} and ${was} would both be lib/${nameOf(src)}`);
    names.set(nameOf(src), src);
    if (src in stubs) { writeFileSync(`${lib}/${nameOf(src)}`, stubs[src]); continue; }
    const text = readFileSync(`${root}${src}`, 'utf8');
    emit(root, lib, src);
    for (const [, spec] of text.matchAll(/^import (?!type )[^'\n]*from '(\.\.?\/[^']+\.ts)'/gm)) todo.push(new URL(spec, `file:///${src}`).pathname.slice(1));
  }
  finish(lib);
  return [...done].sort();
}
