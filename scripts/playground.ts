// The playground as static files: the engine, the JS scanner and part of the JS model, run in a browser. Publish the directory as an artifact or serve it as is.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { MODEL_FILES, PHRASE_FILES, translatorVocab, concernsOf } from '../playground/host.ts';
import { NPC_FILES } from '../playground/npc_host.ts';
import { parseProgram } from '../src/parser.ts';
import { ruleIdOf } from '../src/reflect.ts';
import { cellsOf, parseFront } from '../notebook/front.ts';

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
for (const f of ['scanners/js_ast.ts', 'scripts/read_md.ts', 'scripts/md_blocks.ts', 'playground/fold.ts', 'notebook/front.ts', 'notebook/book.ts', 'notebook/draw.ts', 'playground/host.ts', 'playground/worker.ts',
  'runtime/semirings.ts', 'examples/npc/sim.ts', 'playground/npc_host.ts', 'playground/npc_worker.ts']) emit(f);
for (const [m, text] of Object.entries(SHIMS)) writeFileSync(`${OUT}/lib/shim-${m.slice(5)}.js`, text);
copyFileSync(`${ROOT}node_modules/@babel/parser/lib/index.js`, `${OUT}/lib/babel-parser.js`);
const modules = new Set(readdirSync(`${OUT}/lib`));
for (const m of modules) for (const [, dep] of readFileSync(`${OUT}/lib/${m}`, 'utf8').matchAll(/from '\.\/([\w-]+\.js)'/g)) if (!modules.has(dep)) throw new Error(`lib/${m} imports ${dep}, which the build did not emit`);

const read = (f: string) => readFileSync(`${ROOT}${f}`, 'utf8');
const model = MODEL_FILES.map(read).join('\n');
const phrases = PHRASE_FILES.map(read).join('\n');
writeFileSync(`${OUT}/model.txt`, model);
writeFileSync(`${OUT}/phrases.txt`, phrases);

const { vocab, functions } = translatorVocab(model, phrases);
writeFileSync(`${OUT}/vocab.txt`, vocab.join('\n') + '\n');
writeFileSync(`${OUT}/functions.txt`, functions.join('\n') + '\n');

const concerns = concernsOf(MODEL_FILES.filter((x) => x.startsWith('rules/')).map((f) => [f, read(f)]));
writeFileSync(`${OUT}/concerns.json`, JSON.stringify(concerns));

// The NPC yard: the kernel's boot, the yard's rules and phrases, and the section of npc.rofl each rule sits in.
writeFileSync(`${OUT}/npc-boot.txt`, NPC_FILES.boot.map(read).join('\n'));
const npcText = read(NPC_FILES.npc);
writeFileSync(`${OUT}/npc.txt`, npcText);
writeFileSync(`${OUT}/npc-phrases.txt`, read(NPC_FILES.phrases));
const npcConcerns: Record<string, string> = {};
for (const part of npcText.split(/^-- (?=\d+\. )/m).slice(1)) {
  const t = part.slice(0, part.indexOf('\n')).replace(/^\d+\. /, '').split(/ — |: |, /)[0].trim();
  for (const c of parseProgram(part.slice(part.indexOf('\n') + 1))) if (c.body.length) npcConcerns[ruleIdOf(c)] ??= `yard: ${t}`;
}
writeFileSync(`${OUT}/npc-concerns.json`, JSON.stringify(npcConcerns));
const npcPage = read('playground/npc.html');
writeFileSync(`${OUT}/npc.html`, standalone ? `<!doctype html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${npcPage}` : npcPage);

// the pictures: each notebook of examples/visual as the page's cells, the worlds it reads first, each in a cell of its own
const body = (t: string) => t.replace(/^---\n[\s\S]*?\n---\n/, '');
const pictures = readdirSync(`${ROOT}examples/visual`).filter((f) => f.endsWith('.rofl.md')).sort().map((f) => {
  const text = read(`examples/visual/${f}`), dir = 'examples/visual/';
  const reads = parseFront(text).reads.map((r) => {
    const t = read(new URL(r, `file://${ROOT}${dir}`).pathname.slice(ROOT.length));
    return r.endsWith('.rofl.md') ? { kind: 'formal', text: body(t) } : { kind: 'rofl', text: t };
  });
  const cells = cellsOf(text).slice(1).map((c) => ({ kind: c.kind === 'datalog' ? 'rofl' : c.kind === 'natural' ? 'natural' : 'formal', text: c.text }));
  return { name: f.replace(/\.rofl\.md$/, ''), title: /^# (.*)$/m.exec(text)?.[1] ?? f, cells: [...reads, { kind: 'formal', text: body(text).replace(/^```\w*\n[\s\S]*?^```\n?/gm, '') }, ...cells] };
});
writeFileSync(`${OUT}/pictures.json`, JSON.stringify(pictures));

const page = read('playground/page.html');
writeFileSync(`${OUT}/index.html`, standalone ? `<!doctype html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${page}` : page);
const size = (p: string) => readFileSync(p).length;
console.log(`${OUT}: model ${Math.round(size(`${OUT}/model.txt`) / 1024)} KB, ${vocab.length} relations for the translator, ${readdirSync(`${OUT}/lib`).length} modules`);
