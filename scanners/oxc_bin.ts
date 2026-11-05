// Where the oxc scanner is: this tree's build (made when it is missing), else the one beside the installed engine (scanners/cli.ts, scanners/oxc_facts.ts).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { engine } from '../npm/platform.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The binary, or why there is none. */
export function oxcScan(): string | { error: string } {
  const manifest = path.join(ROOT, 'rust/tools/oxc_scan/Cargo.toml'), built = path.join(ROOT, 'rust/tools/oxc_scan/target/release/oxc_scan');
  if (fs.existsSync(manifest)) {
    if (!fs.existsSync(built)) spawnSync('cargo', ['build', '--release', '-q', '--manifest-path', manifest], { stdio: ['ignore', 2, 2] });
    if (fs.existsSync(built)) return built;
  }
  const exe = `oxc_scan${process.platform === 'win32' ? '.exe' : ''}`, e = engine();
  const beside = [path.join(ROOT, 'bin', exe), ...('bin' in e ? [path.join(path.dirname(e.bin), exe)] : [])].find((f) => fs.existsSync(f));
  return beside ?? { error: 'no oxc_scan: build it with cargo build --release --manifest-path rust/tools/oxc_scan/Cargo.toml, or install the engine of this platform (@grafema/rofl-<os>-<cpu>)' };
}
