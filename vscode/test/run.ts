// npm run vscode:test — the extension in the installed VS Code, once as it is and once per planted defect, each of which must turn it red.
// `-- --only` runs it as it is and nothing else; `-- --break NAME` one planted defect.
import { runTests } from '@vscode/test-electron';
import { spawn } from 'node:child_process';
import { cpSync, createWriteStream, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname, EXT = path.join(ROOT, 'vscode');
const CODE = process.env.ROFL_VSCODE ?? '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const tmp = mkdtempSync(path.join(os.tmpdir(), 'rofl-vscode-'));
const t0 = performance.now();

// The notebooks: review with a never planted to fail, review as it is, small with a function that calls itself.
const put = (to: string, text: string) => { mkdirSync(path.dirname(to), { recursive: true }); writeFileSync(to, text); return to; };
const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
put(path.join(tmp, 'nb/examples/review.rofl.md'), src('examples/review.rofl.md'));
const review = put(path.join(tmp, 'nb/examples/notebook/review.rofl.md'), `${src('examples/notebook/review.rofl.md')}\n\`\`\`rofl\nnever C is blocked by T\n\`\`\`\n`);
const small = put(path.join(tmp, 'nb/examples/notebook/small.rofl.md'), src('examples/notebook/small.rofl.md'));
const smallJs = put(path.join(tmp, 'nb/examples/notebook/small.js'), `${src('examples/notebook/small.js')}\nexport function spin(n) {\n  return n ? spin(n - 1) : 0;\n}\n`);

const cli = (file: string, out: string) => new Promise<string>((done) => {
  const p = spawn(process.execPath, ['--experimental-strip-types', path.join(ROOT, 'notebook/cli.ts'), file, '--json']);
  let s = ''; p.stdout.on('data', (d) => { s += d; });
  p.on('close', () => done(put(out, s)));
});
const clean = path.join(ROOT, 'examples/notebook/review.rofl.md');
const [a, b, c] = await Promise.all([cli(review, path.join(tmp, 'review.json')), cli(clean, path.join(tmp, 'clean.json')), cli(small, path.join(tmp, 'small.json'))]);
const cases = [
  { file: review, cli: a, fails: { text: 'never C is blocked by T' } },
  { file: clean, cli: b },
  { file: small, cli: c, fails: { text: 'never C recurses', code: [smallJs, 12] } },
];

// A planted defect is a copy of the extension beside it, one line changed; a pattern that no longer matches plants nothing, so it throws.
// Each runs the notebooks until the first that goes red; `codeline` only the one with code lines.
const BREAKS: Record<string, [string, RegExp, string, typeof cases?]> = {
  codeline: ['extension.ts', /Number\(at\.slice\(i \+ 1\)\) - 1/, 'Number(at.slice(i + 1))', cases.slice(2)],
  marks: ['extension.ts', /for \(const \[uri, ds\] of by\.values\(\)\) coll\.set\(uri, ds\);/, ''],
  cells: ['extension.ts', /r\.shown\.cells\[runs\.indexOf\(c\)\]/, 'r.shown.cells[runs.indexOf(c) + 1]'],
  prose: ['extension.ts', /metadata: c\.metadata \}\)\), metadata: nb\.metadata/, 'metadata: c.metadata })).filter((c) => c.kind === CODE), metadata: nb.metadata'],
};
const bi = process.argv.indexOf('--break');
const variants = bi >= 0 ? [process.argv[bi + 1]] : process.argv.includes('--only') ? ['as it is'] : ['as it is', ...Object.keys(BREAKS)];
if (bi >= 0 && !BREAKS[variants[0]]) throw new Error(`--break takes one of ${Object.keys(BREAKS).join(', ')}`);

const one = async (v: string) => {
  const t = performance.now();
  let dir = EXT;
  if (BREAKS[v]) {
    const [file, at, plant] = BREAKS[v];
    dir = path.join(ROOT, `vscode-break-${v}`);
    cpSync(EXT, dir, { recursive: true, filter: (s) => !s.includes('node_modules') });
    const text = readFileSync(path.join(EXT, file), 'utf8');
    if (!at.test(text)) throw new Error(`${v}: the planted defect did not apply`);
    writeFileSync(path.join(dir, file), text.replace(at, plant));
  }
  let red = '';
  const report = path.join(tmp, `report-${v.replace(/ /g, '-')}`), log = createWriteStream(path.join(tmp, `${v.replace(/ /g, '-')}.log`));
  try {
    await runTests({
      vscodeExecutablePath: CODE, extensionDevelopmentPath: dir, extensionTestsPath: path.join(dir, 'test/suite.ts'),
      stdout: log, stderr: log,
      launchArgs: [path.join(tmp, 'nb'), '--extensions-dir', path.join(tmp, 'ext'), '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--user-data-dir', path.join(tmp, `user-${v.replace(/ /g, '-')}`)],
      extensionTestsEnv: { ROFL_NB_CASES: JSON.stringify(BREAKS[v]?.[3] ?? cases), ROFL_NB_REPORT: report },
    });
  } catch (e) { red = (() => { try { return readFileSync(report, 'utf8'); } catch { return ''; } })() || (e as Error).message; }
  finally { if (dir !== EXT) rmSync(dir, { recursive: true, force: true }); }
  return { v, red, s: ((performance.now() - t) / 1000).toFixed(1) };
};
// Two at a time: each window loads the JS model, and more of them at once only share the same cores.
const results: Awaited<ReturnType<typeof one>>[] = [], queue = [...variants];
await Promise.all([0, 1].map(async () => { for (let v; (v = queue.shift()); ) results.push(await one(v)); }));

results.sort((x, y) => variants.indexOf(x.v) - variants.indexOf(y.v));
let failed = 0;
for (const { v, red, s } of results) {
  const ok = v === 'as it is' ? !red : !!red;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${v === 'as it is' ? 'as it is: green' : `planted "${v}": red`} (${s} s)${red ? `\n     ${red.replace(/\n/g, '\n     ')}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} VS Code runs as expected, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
if (failed) console.log(`VS Code's own output is in ${tmp}`); else rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
