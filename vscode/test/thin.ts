// The extension is a thin client: the process VS Code runs it in loads no file of the TypeScript engine (src/), asked of models/process/loads.rofl
// over the tree's imports (scanners/loads.ts) by the Rust engine; and the same facts with one import of the engine planted must say the breach.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { scan } from '../../scanners/loads.ts';
import { rustBin } from '../../playground/rofl-serve.ts';

const ROOT = new URL('../..', import.meta.url).pathname, MODEL = path.join(ROOT, 'models/process/loads.rofl');
const bin = rustBin();
if (!bin) throw new Error('thin: no Rust engine; cargo build --release in rust/');
const dir = mkdtempSync(path.join(os.tmpdir(), 'rofl-thin-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
const ask = (facts: string[], q: string): string => {
  const f = path.join(dir, `facts-${facts.length}.rofl`);
  writeFileSync(f, facts.join('\n') + '\n');
  const r = spawnSync(bin, ['ask', q, MODEL, f], { encoding: 'utf8', env: { ...process.env, XDG_CACHE_HOME: dir } });
  if (r.status !== 0) throw new Error(`thin: rofl ask ${q} exited ${r.status}: ${r.stderr}`);
  return r.stdout.trim();
};
const facts = scan(), breach = ask(facts, 'breach(P, G)'), count = ask(facts, 'loaded_count(extension_host, N)');
const planted = ask([...facts, 'loads("vscode/extension.ts", "src/api.ts", value).'], 'breach(extension_host, "src/api.ts")');
const ok = breach === '(empty)' && planted === 'true';
console.log(`${ok ? 'ok  ' : 'FAIL'} the extension host loads ${count.replace(/^N = /, '')} files of the tree and ${breach === '(empty)' ? 'none of the engine' : `the engine: ${breach.replace(/\n/g, '; ')}`}; an import of src/api.ts planted ${planted === 'true' ? 'is a breach' : 'is NOT seen'}`);
if (!ok) process.exit(1);
