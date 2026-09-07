// key_coupling.ts — HOW TIGHTLY IS THIS KERNEL BOUND TO THE FACT KEY BEING A
// STRING?
//
// The question is a porting question. A fact's IDENTITY and the STRING that
// spells it are the same object here, and everything that would have to change
// to separate them is a site where the spelling, the lexicographic order, or
// the string-ness of a key is load-bearing. Tier 2 of the memory plan is the
// cheapest instrument that finds them, because interning forces exactly that
// separation and every place it hurts is a place the port will hurt.
//
// WHY A SCANNER AND NOT A LIST. A hand-written list of sites is an impression
// with line numbers on it: it is stale the first time anyone edits, and it
// cannot say what it MISSED. This is a grep with categories, so the count is
// reproducible, the pattern that produced each row is printed beside it, and a
// new coupling of a known kind shows up without anyone remembering to look.
//
// WHAT IT CANNOT SEE, stated because a census that does not say so is being
// read as complete: a coupling with no textual tell. `Map<string, FactRec>` is
// found; a helper that takes `k: string` and is only ever passed a fact key is
// not, unless its parameter is named for one. C4's count is therefore a floor.
//
//   npm run keycoupling

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');

interface Cat { id: string; what: string; re: RegExp; }

/** The six ways a key's being a string is load-bearing. Ordered by what a port
 *  would have to do about each: C1 and C2 are a SPELLING contract, C3 is an
 *  ORDER contract, C4 is only "it hashes", C5 is a string built out of keys
 *  and retained, C6 is the published surface. */
const CATS: Cat[] = [
  { id: 'C1-spell', what: 'builds the rel[persp](args) text',
    re: /(factKey\(|\[rel, '\[', persp|\$\{[a-zA-Z.]*rel\}\[|\[lit\.rel, '\[',|\[l\.rel, '\[',|`\$\{rel\}\[\$\{persp\}\]|\$\{l\.rel\}\[|\$\{lit\.rel\}\[)/ },
  { id: 'C2-parse', what: 'reads a key\'s TEXT (startsWith / slice / includes / regex)',
    re: /((\bkey|\bk|\bsig|p\.key|f\.key|\.key)\s*\.\s*(startsWith|slice|indexOf|split|match|includes|substring|replace)\(|\.startsWith\(['"`][a-z_]+\[|factKeys\(\)[^\n]*\.(filter|map)\()/ },
  { id: 'C3-order', what: 'lexicographic key order IS the canonical order',
    re: /(facts\.keys\(\)\]\.sort|firings\.keys\(\)\]\.sort|allFactKeys|lowerBound|fresh\.sort|absorb\(|sigs\.keys\(\)\]\.sort|best === undefined \|\| sig < best|\[\.\.\.only\]\.sort)/ },
  { id: 'C4-hash', what: 'a key is a Map/Set member or an array element',
    re: /(Map<string, (FactRec|Witness|Map<string, Witness>|FactRec\[\]|string\[\]|Sup|number)>|\bkeys: (Read(only)?)?Set<string>|visited: Set<string>|allFactKeys\(\)\)|canon: string\[\]|arrived: string\[\]|loose: string\[\]|staged: string\[\]|\[string, Map<string, Witness>\])/ },
  { id: 'C5-embed', what: 'a key is CONCATENATED into a longer string that is kept',
    re: /(\.id \+ '\|' \+|prems\.map\(sigOf\)|p\.t \+ ':' \+|parts\.push\(f\.key\)|lines\.push\(`\$\{k\}|`wit \$\{|key: k,|whyText\()/ },
  { id: 'C6-surface', what: 'a key crosses the published FactStore / Rofl surface',
    re: /(store\.(has|get|remove|support|supportCount|witnessesOf|witnessOf)\(|\b(whyText|renderWhy)\(|\bfactKeys\(|\ballFactKeys\(|\bkey: string[;,)]|\bkey\??: string\b|t: 'fact'; key|t: 'neg'; key)/ },
];

const LAYERS: [string, string[]][] = [
  ['src/ (kernel)', ['src']],
  ['adapters/', ['adapters']],
  ['runtime/ + scanners/', ['runtime', 'scanners']],
  ['examples/', ['examples']],
  ['test/', ['test']],
];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts')) out.push(p);
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}

/** A comment line is not a coupling. The repository's own census rule: the
 *  count is CODE, with comments stripped, because a line that MENTIONS a key
 *  and a line that depends on one look identical to grep otherwise. */
function codeLines(text: string): { n: number; line: string }[] {
  const out: { n: number; line: string }[] = [];
  let block = false;
  text.split('\n').forEach((line, i) => {
    let l = line;
    if (block) { const e = l.indexOf('*/'); if (e < 0) return; l = l.slice(e + 2); block = false; }
    const b = l.indexOf('/*');
    if (b >= 0) { const e = l.indexOf('*/', b); if (e < 0) { block = true; l = l.slice(0, b); } else l = l.slice(0, b) + l.slice(e + 2); }
    const c = l.indexOf('//');
    if (c >= 0) l = l.slice(0, c);
    if (l.trim() !== '') out.push({ n: i + 1, line: l });
  });
  return out;
}

interface Hit { cat: string; file: string; n: number; line: string; }

function main(): void {
  const verbose = process.argv.includes('--sites');
  const hits: Hit[] = [];
  const perLayer = new Map<string, Map<string, number>>();
  const perFile = new Map<string, Map<string, number>>();
  for (const [layer, dirs] of LAYERS) {
    const counts = new Map<string, number>();
    for (const c of CATS) counts.set(c.id, 0);
    for (const dir of dirs) {
      for (const f of filesUnder(dir)) {
        const rel = path.relative(ROOT, f);
        for (const { n, line } of codeLines(fs.readFileSync(f, 'utf8'))) {
          for (const c of CATS) {
            if (!c.re.test(line)) continue;
            counts.set(c.id, counts.get(c.id)! + 1);
            hits.push({ cat: c.id, file: rel, n, line: line.trim().slice(0, 96) });
            if (!perFile.has(rel)) perFile.set(rel, new Map());
            const m = perFile.get(rel)!;
            m.set(c.id, (m.get(c.id) ?? 0) + 1);
          }
        }
      }
    }
    perLayer.set(layer, counts);
  }

  const w = Math.max(...LAYERS.map(([l]) => l.length));
  console.log('THE FACT KEY IS A STRING: where that is load-bearing\n');
  console.log(['layer'.padEnd(w), ...CATS.map((c) => c.id.padStart(11)), 'total'.padStart(6)].join(' '));
  for (const [layer] of LAYERS) {
    const counts = perLayer.get(layer)!;
    const tot = [...counts.values()].reduce((a, b) => a + b, 0);
    console.log([layer.padEnd(w), ...CATS.map((c) => String(counts.get(c.id)).padStart(11)),
      String(tot).padStart(6)].join(' '));
  }
  console.log('');
  for (const c of CATS) console.log(`  ${c.id.padEnd(11)} ${c.what}`);

  console.log('\nBY KERNEL FILE (src/ and adapters/ only — what a port has to move)\n');
  const kfiles = [...perFile.keys()].filter((f) => f.startsWith('src/') || f.startsWith('adapters/')).sort();
  const fw = Math.max(...kfiles.map((f) => f.length));
  console.log(['file'.padEnd(fw), ...CATS.map((c) => c.id.padStart(11)), 'total'.padStart(6)].join(' '));
  for (const f of kfiles) {
    const m = perFile.get(f)!;
    const tot = [...m.values()].reduce((a, b) => a + b, 0);
    console.log([f.padEnd(fw), ...CATS.map((c) => String(m.get(c.id) ?? 0).padStart(11)),
      String(tot).padStart(6)].join(' '));
  }

  if (verbose) {
    console.log('\nSITES\n');
    for (const c of CATS) {
      console.log(`--- ${c.id}: ${c.what}`);
      for (const h of hits.filter((x) => x.cat === c.id)) console.log(`  ${h.file}:${h.n}  ${h.line}`);
    }
  }
}

main();
