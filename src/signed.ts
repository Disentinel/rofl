// A FILE OF SCANNED FACTS IS SIGNED (docs/cli.md, "A scan names its code" and "A scan names its sources"), held to
// its scanner's code and its sources as rust/rofl/src/session.rs `signed_file` holds it: here for a host of the
// TypeScript engine. A host that can read the scanner's code (Node) checks and refuses as the Rust engine does; one
// that cannot (a browser) loads the file and says, once, that its signature was not checked.

/** The engine's sum of bytes (rust/rofl/src/arena.rs `Sum::of`): eight bytes at a time, as sixteen hex digits. */
const M64 = (1n << 64n) - 1n;
export function sum(b: Uint8Array): string {
  let h = 0x6a09e667f3bcc908n;
  const mix = (w: bigint): void => { h = ((h ^ w) * 0x9e3779b97f4a7c15n) & M64; h = ((h << 29n) | (h >> 35n)) & M64; };
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength), whole = b.length - (b.length % 8);
  for (let i = 0; i < whole; i += 8) mix(view.getBigUint64(i, true));
  let w = 0n;
  for (let i = whole; i < b.length; i++) w |= BigInt(b[i]) << BigInt(8 * (i - whole));
  mix(w);
  mix(BigInt(b.length));
  return (h ^ (h >> 31n)).toString(16).padStart(16, '0');
}

/** The sum of a scanner's code: of its files' sums, sorted, each on its line. */
export const codeSign = (sums: string[]): string => sum(new TextEncoder().encode([...sums].sort().map((s) => `${s}\n`).join('')));

/** What a file's opening comments say of the scan that wrote it; undefined for a file no scanner wrote. */
export type Head = { name?: string; sign?: string; code: [string, string | undefined][]; sources: string[]; ttl?: number; again?: string };
export function headOf(text: string): Head | undefined {
  const h: Head = { code: [], sources: [] };
  let reads = false;
  for (const l of text.split('\n')) {
    if (l !== '' && !l.startsWith('--')) break;
    const after = (p: string) => (l.startsWith(p) ? l.slice(p.length) : undefined);
    let r: string | undefined;
    if ((r = after('-- scanner: ')) !== undefined) { const i = r.lastIndexOf(' '); if (i > 0) { h.name = r.slice(0, i); h.sign = r.slice(i + 1); } }
    else if ((r = after('-- code: ')) !== undefined) { const i = r.lastIndexOf(' '), s = r.slice(i + 1); h.code.push(i > 0 && /^[0-9a-f]{16}$/.test(s) ? [r.slice(0, i), s] : [r, undefined]); }
    else if ((r = after('-- source: ')) !== undefined) h.sources.push(r);
    else if ((r = after('-- ttl: ')) !== undefined) h.ttl = Number(r.trim());
    else if ((r = after('-- again: ')) !== undefined) h.again = r;
    else if (l.startsWith('-- reads: ')) reads = true;
  }
  return h.name || h.code.length || h.sources.length || reads ? h : undefined;
}

/** What a host gives the check: the bytes of a path (a scanner's code file, from the file's directory), and the
 *  check mode of the command that wrote the file run (`ROFL_SCAN_CHECK=1`), its stdout, or a throw. */
export type SignHost = { read(path: string): Uint8Array | undefined; check?(command: string): string; now?(): number };

/** `YYYY-MM-DDTHH:MM:SSZ` as seconds since 1970. */
const epoch = (t: string): number | undefined => { const ms = Date.parse(t); return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(t) && !Number.isNaN(ms) ? ms / 1000 : undefined; };

/** The planted faults of this check (scripts/signed_check.ts): its code, its sources, its as-of not held. */
export const planted = new Set<'code' | 'sources' | 'asof'>();

/** The file `name` (its text), held to its scanner's code and its sources: why it is refused, or when its facts are
 *  as of. `dir` joins a code path to the file's directory; `ttl` is the world's for the scanner, if any. */
export function checkSigned(text: string, name: string, dir: (p: string) => string, host: SignHost, ttl?: (scanner: string) => number | undefined): { refused?: string; asOf?: string } {
  const h = headOf(text);
  if (!h) return {};
  const again = h.again ? `scan again: ${h.again}` : 'run its scanner again';
  if (!h.name || !h.sign || !h.code.length || h.code.some(([, s]) => s === undefined))
    return { refused: `${name} is a scanner's output not signed by its code (\`-- scanner: NAME SUM\` and \`-- code: PATH SUM\`, docs/cli.md "A scan names its code"), written before scans were signed, so its facts may be an older scanner's; ${again}` };
  const now: string[] = [], moved: string[] = [];
  for (const [p, s] of h.code) {
    const b = host.read(dir(p)), st = b ? sum(b) : 'gone';
    if (st !== s) moved.push(p);
    now.push(st);
  }
  if (!planted.has('code')) {
    if (moved.length) return { refused: `${name} was written by the scanner \`${h.name}\` from code that has changed since: ${moved.join(', ')}; its facts would outlive that code. ${again}` };
    if (codeSign(now) !== h.sign) return { refused: `${name}: its \`-- scanner: ${h.name} ${h.sign}\` is not the sum of the code it names; ${again}` };
  }
  const limit = h.ttl ?? ttl?.(h.name), at = (host.now ?? (() => Date.now() / 1000))();
  const versioned: [string, string][] = [];
  let asOf: string | undefined;
  for (const s of h.sources) {
    const i = s.lastIndexOf(' ');
    if (i < 0) return { refused: `${name}: \`-- source: ${s}\` names no token; ${again}` };
    const [uri, tok] = [s.slice(0, i), s.slice(i + 1)];
    if (!tok.startsWith('@')) { versioned.push([uri, tok]); continue; }
    const t = tok.slice(1), e = epoch(t);
    if (e === undefined) return { refused: `${name}: ${uri}: \`@${t}\` is not a time; ${again}` };
    if (!planted.has('sources') && limit !== undefined && at - e > limit) return { refused: `${name}: ${uri} was taken at ${t}, past its TTL of ${limit} s; ${again}` };
    if (asOf === undefined || t < asOf) asOf = t;
  }
  if (versioned.length && !planted.has('sources')) {
    let out: string;
    try {
      if (!h.again) throw new Error('the file names no command to ask it with (`-- again:`)');
      if (!host.check) throw new Error('this host cannot run the command that wrote it');
      out = host.check(h.again);
    } catch (e) { return { refused: `${name}: the check of its sources failed (${(e as Error).message}), so what was kept is not known to be current; ${again}` }; }
    const said = new Map(out.split('\n').flatMap((l) => { if (!l.startsWith('-- source: ')) return []; const r = l.slice(11), i = r.lastIndexOf(' '); return i < 0 ? [] : [[r.slice(0, i), r.slice(i + 1)] as const]; }));
    for (const [uri, tok] of versioned) {
      const t = said.get(uri);
      if (t === undefined) return { refused: `${name}: the check of its sources did not name ${uri}, so what was kept is not known to be current; ${again}` };
      if (t !== tok) return { refused: `${name}: ${uri} moved: ${tok} then, ${t} now; ${again}` };
    }
  }
  return planted.has('asof') || asOf === undefined ? {} : { asOf: `the facts of ${name} (the scanner \`${h.name}\`) are as of ${asOf}: a snapshot of a source with no version` };
}

/** What a host that cannot read a scanner's code says of a signed file, once. */
export const notChecked = (name: string): string => `the signature of ${name} was not checked in this host (the scanner's code is not here)`;
