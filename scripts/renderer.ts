// The notebook renderer as the browser JS VS Code loads (vscode/visual/out): the picture modules and the text backends they show, one flat directory.
// `npm run vscode`, test:vscode and dist build it; `--out DIR` elsewhere.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

const ROOT = new URL('..', import.meta.url).pathname;
export const RENDERER = ['vscode/visual/renderer.ts', 'vscode/visual/panel.ts', 'vscode/visual/pictures.ts', 'vscode/visual/picture.ts', 'vscode/visual/pic-graph.ts', 'vscode/visual/pic-time.ts', 'vscode/visual/pic-table.ts', 'vscode/visual/pic-moments.ts', 'vscode/visual/pic-charts.ts', 'vscode/visual/pic-space.ts', 'vscode/visual/pic-notation.ts', 'vscode/visual/pic-dialects.ts',
  'notebook/draw.ts', 'notebook/draw-text.ts', 'notebook/draw-graph.ts', 'notebook/draw-argument.ts', 'notebook/draw-time.ts', 'notebook/draw-table.ts', 'notebook/draw-space.ts', 'notebook/draw-notation.ts', 'notebook/draw-forms.ts', 'notebook/draw-dialects.ts', 'notebook/draw-proof.ts'];

export function buildRenderer(out = path.join(ROOT, 'vscode/visual/out')): string {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const names = new Set(RENDERER.map((f) => path.basename(f, '.ts')));
  for (const f of RENDERER) {
    const js = ts.transpileModule(readFileSync(path.join(ROOT, f), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replace(/from '(?:\.\.?\/)+(?:[\w-]+\/)*([\w-]+)\.ts'/g, (m, n) => { if (!names.has(n)) throw new Error(`${f} imports ${n}, which the renderer does not carry`); return `from './${n}.js'`; });
    writeFileSync(path.join(out, `${path.basename(f, '.ts')}.js`), js);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const oi = process.argv.indexOf('--out');
  console.log(`${buildRenderer(oi >= 0 ? path.resolve(process.argv[oi + 1]) : undefined)}: ${RENDERER.length} modules`);
}
