// The engine an installed @grafema/rofl runs: the `rofl` binary of the platform package npm put beside it
// (@grafema/rofl-<os>-<cpu>, an optional dependency pinned to this version), refused unless its version is this one.
import { accessSync, chmodSync, constants, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLATFORMS = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64'];
export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const RELEASES = 'https://github.com/Disentinel/rofl/releases';

/** The binary, or why there is none, in words that say what to install. */
export function engine(platform = `${process.platform}-${process.arch}`): { bin: string } | { error: string } {
  let version: string;
  try { version = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch (e) { return { error: (e as Error).message }; }
  const name = `@grafema/rofl-${platform}`;
  if (!PLATFORMS.includes(platform)) return { error: `ROFL ships no engine for ${platform}; it ships one for ${PLATFORMS.join(', ')} (${RELEASES})` };
  let dir: string;
  try { dir = path.dirname(createRequire(path.join(ROOT, 'package.json')).resolve(`${name}/package.json`)); }
  catch { return { error: `the engine for ${platform} is not installed: ${name}@${version} is missing beside @grafema/rofl@${version}. Install it: npm install ${name}@${version} (with -g for a global one); an install with --omit=optional leaves it out` }; }
  const theirs: string = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  if (theirs !== version) return { error: `the engine installed is ${name}@${theirs}, and this is @grafema/rofl@${version}: install ${name}@${version}, or both anew with npm i -g @grafema/rofl@latest` };
  const bin = path.join(dir, 'bin', `rofl${platform.startsWith('win32') ? '.exe' : ''}`);
  if (!platform.startsWith('win32')) try { accessSync(bin, constants.X_OK); } catch { try { chmodSync(bin, 0o755); } catch (e) { return { error: `${bin}: ${(e as Error).message}` }; } }
  return { bin };
}
