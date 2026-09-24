// The playground as static files: the engine, the JS scanner and part of the JS model, run in a browser. Publish the directory as an artifact or serve it as is.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { MODEL_FILES, PHRASE_FILES, booksOf } from '../playground/host.ts';
import { Vocabulary } from '../src/say.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const argv = process.argv.slice(2);
const oi = argv.indexOf('--out');
const OUT = oi >= 0 ? argv[oi + 1] : `${ROOT}playground/dist`;
const standalone = argv.includes('--standalone');
mkdirSync(`${OUT}/lib`, { recursive: true });

// Every module lands flat in lib/; a relative `x.ts` import becomes `./x.js`, and the two node modules the kernel's neighbours use get a browser stand-in.
const SHIMS: Record<string, string> = {
  'node:fs': 'export const existsSync = () => false;\nexport const readFileSync = () => { throw new Error("no files in a browser"); };\n',
  'node:crypto': 'export const createHash = () => { let h = 0x811c9dc5; const o = { update(s) { for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0; return o; }, digest: () => h.toString(16).padStart(8, "0") }; return o; };\n',
};
const emit = (src: string) => {
  const js = ts.transpileModule(readFileSync(`${ROOT}${src}`, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/from '(?:\.\.?\/)+(?:[\w-]+\/)*([\w-]+)\.ts'/g, "from './$1.js'")
    .replace(/from '@babel\/parser'/g, "from './babel-parser.js'")
    .replace(/from 'node:(fs|crypto)'/g, "from './shim-$1.js'");
  if (/from 'node:/.test(js)) throw new Error(`${src} still imports a node module`);
  writeFileSync(`${OUT}/lib/${src.replace(/^.*\//, '').replace(/\.ts$/, '.js')}`, js);
};
for (const f of readdirSync(`${ROOT}src`)) if (f.endsWith('.ts') && f !== 'repl.ts') emit(`src/${f}`);
for (const f of ['scanners/js_ast.ts', 'scripts/read_md.ts', 'scripts/md_blocks.ts', 'playground/host.ts', 'playground/worker.ts']) emit(f);
for (const [m, text] of Object.entries(SHIMS)) writeFileSync(`${OUT}/lib/shim-${m.slice(5)}.js`, text);
copyFileSync(`${ROOT}node_modules/@babel/parser/lib/index.js`, `${OUT}/lib/babel-parser.js`);
const modules = new Set(readdirSync(`${OUT}/lib`));
for (const m of modules) for (const [, dep] of readFileSync(`${OUT}/lib/${m}`, 'utf8').matchAll(/from '\.\/([\w-]+\.js)'/g)) if (!modules.has(dep)) throw new Error(`lib/${m} imports ${dep}, which the build did not emit`);

const read = (f: string) => readFileSync(`${ROOT}${f}`, 'utf8');
const model = MODEL_FILES.map(read).join('\n');
const phrases = PHRASE_FILES.map(read).join('\n');
writeFileSync(`${OUT}/model.txt`, model);
writeFileSync(`${OUT}/phrases.txt`, phrases);

// What the translator of a plain-language cell may say: each relation the scanner gives or the model's rules conclude, as the sentence the reader reads it in,
// with a noun before each variable, `a call C resolves to a function F`. The sentence of a signature first, where one is written.
const v = new Vocabulary(); v.addText(phrases);
const rels = new Set(['ast_node', 'ast_child', 'ast_attr', ...booksOf(model).keys()]);
const VALUE = new Set(['key', 'name', 'file', 'index', 'text', 'kind', 'line', 'attribute', 'number', 'score', 'value', 'child']);
const vocab: string[] = [];
for (const rel of [...rels].sort()) {
  const ts = v.templates.filter((t) => t.rel === rel);
  for (const t of rel.startsWith('ast_') ? ts.slice(1) : ts.slice(0, 1)) {
    const sig = /\((.*)\)$/.exec(t.src)?.[1].split(/,\s*/) ?? [];
    const holes = t.parts.filter((p) => p.t === 'hole') as { i: number; noun: string }[];
    const names = new Map<number, string>();
    for (const h of holes) {
      let n = /([A-Z]\w*)(?::\d+)?$/.exec(sig.find((x) => x.endsWith(`:${h.i}`)) ?? sig[h.i] ?? '')?.[1] ?? h.noun[0].toUpperCase();
      while ([...names.values()].includes(n)) n += String(h.i);
      names.set(h.i, n);
    }
    // a value (a name, a kind, a line) is written as its variable; anything else with the noun that says what it is
    const term = (h: { i: number; noun: string }) => VALUE.has(h.noun) ? names.get(h.i)! : `${/^[aeiou]/.test(h.noun) ? 'an' : 'a'} ${h.noun} ${names.get(h.i)}`;
    vocab.push(t.parts.map((p) => p.t === 'text' ? p.s : p.t === 'hole' ? term(p) : '').filter(Boolean).join(' '));
  }
}
writeFileSync(`${OUT}/vocab.txt`, vocab.join('\n') + '\n');

const page = read('playground/page.html');
writeFileSync(`${OUT}/index.html`, standalone ? `<!doctype html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${page}` : page);
const size = (p: string) => readFileSync(p).length;
console.log(`${OUT}: model ${Math.round(size(`${OUT}/model.txt`) / 1024)} KB, ${vocab.length} relations for the translator, ${readdirSync(`${OUT}/lib`).length} modules`);
