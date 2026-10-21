// keep.ts — AN ANSWER KEPT UNDER THE HASH OF EVERYTHING THAT DETERMINES IT.
//
// A world's answer is a function of its files, the files they name, its options, boot, the engine (the Rust binary
// by its bytes, the TypeScript engine by its sources) and the harness that asks. Hash all of it: an unchanged key is
// the same question, and its answer is read back instead of computed; anything changed is a new key and is computed.
// Nothing is judged from a kept answer that would not be judged from a computed one: the golden is compared afresh.
//
// The store is .cache/rofl in the checkout; deleting it costs one cold run and nothing else. CI may keep it by the
// same key or not at all.
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
export const KEEP = path.join(ROOT, '.cache', 'rofl');

export const sha = (...parts: (string | Buffer)[]): string => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p).update('\0');
  return h.digest('hex');
};

/** The parts a key is left without: empty but in scripts/keep_check.ts, which plants each omission to see its check go red. */
export const omitted = new Set<string>();
/** A key of named parts. */
export const keyOf = (kind: string, parts: [string, string | string[]][]): string =>
  sha(kind, ...parts.filter(([n]) => !omitted.has(n)).flatMap(([n, v]) => [n, ...(Array.isArray(v) ? v : [v])]));

/** A file's hash, by its bytes; read again whenever the file is not the one hashed (another inode, size or mtime). */
const hashed = new Map<string, { stamp: string; hash: string }>();
export function fileHash(f: string): string {
  let st: fs.BigIntStats;
  try { st = fs.statSync(f, { bigint: true }); } catch { return 'gone'; }
  const stamp = `${st.ino}:${st.size}:${st.mtimeNs}`;
  const was = hashed.get(f);
  if (was?.stamp === stamp) return was.hash;
  const hash = sha(fs.readFileSync(f));
  hashed.set(f, { stamp, hash });
  return hash;
}

/** A TypeScript file and every file it imports by a relative path, followed to the end, sorted. */
export function closure(entry: string): string[] {
  const seen = new Set<string>(), todo = [path.resolve(entry)];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f) || !fs.existsSync(f)) continue;
    seen.add(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+\.ts)['"]/g)) todo.push(path.resolve(path.dirname(f), m[1]));
  }
  return [...seen].sort();
}

/** The hash of files, each by its path from the tree and its bytes. */
export const filesHash = (files: string[]): string => sha(...files.flatMap((f) => [path.relative(ROOT, f), fileHash(f)]));

/** What is kept under `key`, or what `make` computes, then kept. A null key keeps nothing. */
export function keptOr<T>(kind: string, key: string | null, make: () => T): T {
  if (key === null) return make();
  const file = path.join(KEEP, kind, `${key.slice(0, 32)}.json`);
  const said = (c: string): void => { if (process.env.ROFL_KEEP_TALLY) fs.appendFileSync(process.env.ROFL_KEEP_TALLY, `${kind} ${c}\n`); };
  try { const v = JSON.parse(fs.readFileSync(file, 'utf8')) as T; said('kept'); return v; } catch { /* not kept yet */ }
  said('made');
  const v = make();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v));
  fs.renameSync(tmp, file);
  return v;
}

/** What is kept under `key` is dropped, so the next run computes it again. */
export const forget = (kind: string, key: string | null): void => { if (key) fs.rmSync(path.join(KEEP, kind, `${key.slice(0, 32)}.json`), { force: true }); };

/** A run's tally of answers read back and computed: `ROFL_KEEP_TALLY` names the file the pool's workers append to, set
 *  by the harness for its own workers and read back by it. */
export function tallied(file: string): string {
  const n = new Map<string, number>();
  for (const l of fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : []) n.set(l, (n.get(l) ?? 0) + 1);
  fs.rmSync(file, { force: true });
  const kinds = [...new Set([...n.keys()].map((l) => l.split(' ')[0]))].sort();
  return kinds.map((k) => `${k} ${n.get(`${k} kept`) ?? 0} kept, ${n.get(`${k} made`) ?? 0} computed`).join('; ') || 'nothing kept or computed';
}

/** A planted fault switched on: nothing is kept or read back while one is, so a harness that plants it sees it. */
export const planted = (): boolean => ['ROFL_BREAK', 'ROFL_KERNEL_OVERRIDE', 'ROFL_BOOT', 'ROFL_READER'].some((k) => process.env[k]);
