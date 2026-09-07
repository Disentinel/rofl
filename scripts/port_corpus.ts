// scripts/port_corpus.ts — THE CONFORMANCE CORPUS FOR A SECOND HOST.
//
// A second engine does not need the surface parser. `decodeRules`
// (src/reflect.ts) reads a program's RULES out of the store, so a snapshot
// taken with the derived layer cleared carries both the data and the program.
// The contract is therefore three lines long and mechanically checkable:
//
//     snapshot in  ->  evaluate  ->  canonicalState out
//
// Verified before this file was written: restoring such a seed and evaluating
// reproduces canonicalState BYTE FOR BYTE against a direct load, on sensors,
// tm, spat, goof and wtf. This script writes that pair for every world it can
// build, so an implementation in any language has an exact oracle per case
// rather than a description of one.
//
// usage: node --experimental-strip-types scripts/port_corpus.ts [--out DIR]

import { Rofl } from '../src/api.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
let out = path.join(ROOT, 'facts/port-corpus');
for (let i = 0; i < argv.length; i++) if (argv[i] === '--out') out = argv[++i];

const boot = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

/** Every world this repository can build from `.rofl` text alone: a single
 *  file under examples/, or a directory of them loaded together. A demo whose
 *  world is assembled in TypeScript is NOT here — the seed must be reachable
 *  from the corpus, not from a host program. */
function worlds(): [string, string[]][] {
  const ex = path.join(ROOT, 'examples');
  const out: [string, string[]][] = [];
  for (const e of fs.readdirSync(ex).sort()) {
    const p = path.join(ex, e);
    if (fs.statSync(p).isDirectory()) {
      const files = fs.readdirSync(p).sort().filter((x) => x.endsWith('.rofl')).map((x) => path.join(p, x));
      if (files.length > 0) out.push([e, files]);
    } else if (e.endsWith('.rofl')) out.push([e.replace(/\.rofl$/, ''), [p]]);
  }
  out.push(['boot_only', []]);
  return out;
}

fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) fs.rmSync(path.join(out, f));

const index: string[] = [];
let ok = 0, skipped = 0;
for (const [name, files] of worlds()) {
  let seed: string, want: string, facts: number, partial: boolean;
  try {
    const direct = new Rofl(); direct.load(boot);
    for (const f of files) {
      const res = direct.load(fs.readFileSync(f, 'utf8'));
      if (!res.ok) throw new Error(`load refused: ${JSON.stringify(res).slice(0, 90)}`);
    }
    const ev = direct.evaluate();
    partial = ev.partial;
    want = direct.store.canonicalState();
    facts = direct.store.allFactKeys().length;

    const seedR = new Rofl(); seedR.load(boot);
    for (const f of files) seedR.load(fs.readFileSync(f, 'utf8'));
    seedR.store.clearDerived();
    seed = seedR.store.snapshot();

    // THE CASE IS ONLY A CASE IF THE REFERENCE ITSELF ROUND-TRIPS IT. A world
    // this host cannot reproduce from its own seed is a defect here, not a
    // target for anyone else, and shipping it would hand a second engine an
    // oracle the first one fails.
    const replay = Rofl.fromSnapshot(seed);
    replay.evaluate();
    if (replay.store.canonicalState() !== want) throw new Error('reference does not round-trip its own seed');
  } catch (e) {
    console.log(`  skip ${name.padEnd(14)} ${(e as Error).message.slice(0, 70)}`);
    skipped++; continue;
  }
  fs.writeFileSync(path.join(out, `${name}.seed.json`), seed);
  fs.writeFileSync(path.join(out, `${name}.expected.txt`), want);
  index.push(`${name}\t${facts}\t${seed.length}\t${want.length}\t${partial ? 'partial' : 'complete'}`);
  ok++;
}
fs.writeFileSync(path.join(out, 'INDEX.tsv'),
  '-- name\tfacts\tseed_bytes\texpected_bytes\tevaluation\n' + index.join('\n') + '\n');
console.log(`\nport corpus: ${ok} cases, ${skipped} skipped -> ${path.relative(ROOT, out)}`);
console.log(index.map((l) => '  ' + l.split('\t').slice(0, 2).join('  ')).join('\n'));
