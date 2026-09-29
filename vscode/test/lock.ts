// One VS Code test at a time on this machine: several agents share it, and two windows at once only slow both past their limits.
// The lock is a directory holding the owner's pid; a lock whose owner is gone (killed with -9) is taken over.
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';

export function vscodeLock(dir = '/tmp/rofl-vscode-test.lock'): void {
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  for (let said = false; ; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000)) {
    try { mkdirSync(dir); break; } catch {
      const pid = Number((() => { try { return readFileSync(`${dir}/pid`, 'utf8'); } catch { return '0'; } })());
      // a lock whose owner is gone is stale; so is one with no pid (a shell's mkdir) older than ten minutes, or the two could wait on each other
      const age = (() => { try { return Date.now() - statSync(dir).mtimeMs; } catch { return 0; } })();
      if (pid ? !alive(pid) : age > 600_000) { rmSync(dir, { recursive: true, force: true }); continue; }
      if (!said) { console.log(`waiting for ${dir}, held by pid ${pid || '?'}`); said = true; }
    }
  }
  writeFileSync(`${dir}/pid`, String(process.pid));
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
}
