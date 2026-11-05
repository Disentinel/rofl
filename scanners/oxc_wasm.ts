// The JS scanner of every host that is not the command line: rust/tools/oxc_scan compiled to wasm, the scan of `rofl scan --no-start` of one file
// at a time, the same facts byte for byte. A browser page hands it the bytes (`loadWasm` in a page, `useWasm` in a worker); node reads them
// from this tree's build or from beside the installed package, and builds them when the tree has none.
type Exports = { memory: WebAssembly.Memory; alloc(n: number): number; release(p: number, n: number): void; scan(s: number, sl: number, f: number, fl: number): number; out_ptr(): number; out_len(): number };
let wasm: Exports | undefined;

const WASM = 'rust/tools/oxc_scan/target/wasm32-unknown-unknown/release/oxc_scan.wasm';

export const useWasm = (bytes: BufferSource): void => { wasm = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as unknown as Exports; };
/** A page's main thread may not compile a module this size synchronously. */
export async function loadWasm(bytes: BufferSource): Promise<void> { wasm = (await WebAssembly.instantiate(bytes, {})).instance.exports as unknown as Exports; }

/** One file's facts, or its `parse_error` fact: oxc_scan's text. */
export function scanText(src: string, file: string): string {
  if (!wasm) throw new Error(`no scanner: the page loads oxc_scan.wasm (loadWasm), and node finds it at ${WASM} or beside the package`);
  const put = (t: string) => { const b = new TextEncoder().encode(t), p = wasm!.alloc(b.length); new Uint8Array(wasm!.memory.buffer, p, b.length).set(b); return [p, b.length] as const; };
  const [sp, sl] = put(src), [fp, fl] = put(file);
  wasm.scan(sp, sl, fp, fl);
  wasm.release(sp, sl); wasm.release(fp, fl);
  return new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, wasm.out_ptr(), wasm.out_len()));
}

// node: no import of a node module, so a page's build has nothing to stub
const node = (globalThis as { process?: { getBuiltinModule?: (m: string) => unknown } }).process?.getBuiltinModule;
if (node) {
  const fs = node('node:fs') as typeof import('node:fs'), path = node('node:path') as typeof import('node:path'), cp = node('node:child_process') as typeof import('node:child_process');
  const here = path.dirname(new URL(import.meta.url).pathname), root = path.resolve(here, '..');
  const built = path.join(root, WASM), beside = path.join(root, 'oxc_scan.wasm');
  const manifest = path.join(root, 'rust/tools/oxc_scan/Cargo.toml');
  if (!fs.existsSync(built) && !fs.existsSync(beside) && fs.existsSync(manifest))
    cp.spawnSync('cargo', ['build', '--release', '-q', '--lib', '--target', 'wasm32-unknown-unknown', '--manifest-path', manifest], { stdio: ['ignore', 2, 2] });
  const file = [built, beside].find((f) => fs.existsSync(f));
  if (file) useWasm(fs.readFileSync(file));
}
