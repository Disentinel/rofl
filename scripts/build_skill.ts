// scripts/build_skill.ts — assemble the self-contained marketplace bundle of
// the guided-formal-reasoning skill: instruction files at the bundle root,
// the engine (kernel + rules + runtime + schemas + the synthetic demo
// fixture) under engine/, zero runtime dependencies. The build smoke-tests
// the bundle by running a real pair session INSIDE it and fails unless the
// verdict derives — "self-contained" is proven, not assumed.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

const ENGINE_DIRS = ['src', 'rules', 'runtime', 'schemas', path.join('examples', 'atlas-launch')];

function copyDir(from: string, to: string, keep: (name: string) => boolean): void {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) copyDir(src, dst, keep);
    else if (keep(e.name)) fs.copyFileSync(src, dst);
  }
}

export function buildSkill(outDir: string): void {
  fs.rmSync(outDir, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'skills', 'guided-formal-reasoning'), outDir, (f) => f.endsWith('.md'));
  const engine = path.join(outDir, 'engine');
  fs.mkdirSync(engine, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'boot.rofl'), path.join(engine, 'boot.rofl'));
  for (const d of ENGINE_DIRS) {
    copyDir(path.join(ROOT, d), path.join(engine, d), (f) => /\.(ts|rofl|json)$/.test(f));
  }
  fs.writeFileSync(path.join(outDir, 'README.md'), [
    '# guided-formal-reasoning — skill bundle',
    '',
    'Generated from the ROFL repo by `scripts/build_skill.ts`; do not edit by',
    'hand. Requires Node >= 22.6 (built-in type stripping). The engine under',
    '`engine/` has zero runtime dependencies. Entry point:',
    '',
    '    node --experimental-strip-types engine/runtime/pair.ts',
    '',
    'Start with SKILL.md.',
    '',
  ].join('\n'));
  smoke(outDir);
}

function smoke(outDir: string): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gfr-smoke-'));
  const session = path.join(tmp, 's.snapshot.json');
  const pair = path.join(outDir, 'engine', 'runtime', 'pair.ts');
  const fixture = path.join(outDir, 'engine', 'examples', 'atlas-launch');
  const run = (args: string[]): string => {
    const r = spawnSync(process.execPath, ['--experimental-strip-types', pair, ...args],
      { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`bundle smoke failed at 'pair ${args[0]}':\n${r.stderr}`);
    return r.stdout;
  };
  const init = run(['init', '--session', session,
    path.join(fixture, 'frame.rofl'), path.join(fixture, 'evidence.rofl'),
    '--who-obs', 'runtime']);
  if (!init.includes('no_go')) throw new Error('bundle smoke: init report lacks the no_go verdict');
  const next = run(['next', '--session', session]);
  if (!next.includes('verify: aggregate_capacity_verified')) {
    throw new Error('bundle smoke: next lacks the verify intent');
  }
  if (!next.includes('verify.md')) {
    throw new Error('bundle smoke: intent instructions not resolved inside the bundle');
  }
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  const out = process.argv[2] ?? path.join(ROOT, 'dist', 'guided-formal-reasoning');
  buildSkill(out);
  console.log(`skill bundle built and smoke-tested: ${out}`);
}
