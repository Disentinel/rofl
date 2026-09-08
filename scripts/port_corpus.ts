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
// TICKED CASES, AND WHY THEY EXIST. The first version of this corpus ran
// `evaluate` once per case and stopped. A Rust engine built against it passed
// all 27 byte for byte -- and its own mutant set then showed the oracle was
// BLIND to `@next` staging: deleting the staging path entirely survived,
// because seven cases carried `@next` rules and not one of them advanced a
// tick. So a second family is emitted for every world that has a `@next` rule
// of its own (beyond the two boot.rofl carries): the same seed, `ticks` ticks
// of `tickAdvance`, and the canonical state at the end. A case that cannot
// fail is not an oracle, and this is the cheapest thing that makes staging
// observable from outside.
//
// usage: node --experimental-strip-types scripts/port_corpus.ts [--out DIR]

import { Rofl } from '../src/api.ts';
import { derivations } from './derivations.ts';
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
const TICKS = 3;
let ok = 0, skipped = 0, ticked = 0;
for (const [name, files] of worlds()) {
  let seed: string, want: string, deriv: string, facts: number, partial: boolean;
  try {
    const direct = new Rofl(); direct.load(boot);
    for (const f of files) {
      const res = direct.load(fs.readFileSync(f, 'utf8'));
      if (!res.ok) throw new Error(`load refused: ${JSON.stringify(res).slice(0, 90)}`);
    }
    const ev = direct.evaluate();
    partial = ev.partial;
    want = direct.store.canonicalState();
    deriv = derivations(direct.store);
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
  // THE CONTRACT, beside the byte-exact state. `expected.txt` is
  // `canonicalState` and holds a second engine to this one's key spelling and
  // collation; `derivations.txt` holds it to the CONSEQUENCES -- which facts
  // hold and which derivations produced them -- and to nothing else. See
  // scripts/derivations.ts for why the second is the one a columnar store
  // that spills to disk can be held to.
  fs.writeFileSync(path.join(out, `${name}.derivations.txt`), deriv + '\n');
  index.push(`${name}\t${facts}\t${seed.length}\t${want.length}\t${partial ? 'partial' : 'complete'}\t0`);
  ok++;

  // THE TICKED TWIN. Only for a world with a `@next` rule of its own: every
  // program has two, which are boot.rofl's carries of `imports` and
  // `collects`, and a case whose only staging is the kernel's own would
  // exercise the boundary without exercising the program.
  try {
    const probe = Rofl.fromSnapshot(seed);
    probe.evaluate();
    const nextRules = probe.query('conclusion_tense(R, next)').rows.length;
    if (nextRules <= 2) continue;

    const t = Rofl.fromSnapshot(seed);
    let ran = 0;
    for (let i = 0; i < TICKS; i++) {
      const res = t.tickAdvance();
      if (res.partial) break;
      ran++;
      if (res.quiescent) break;          // a settled world ticks no further
    }
    const tWant = t.store.canonicalState();

    // The same admission test the plain case gets: the REFERENCE must
    // reproduce this from the seed, or it is not an oracle anyone else can be
    // held to.
    const check = Rofl.fromSnapshot(seed);
    for (let i = 0; i < ran; i++) check.tickAdvance();
    if (check.store.canonicalState() !== tWant) throw new Error('ticked reference does not round-trip');

    const tname = `${name}.t${ran}`;
    fs.writeFileSync(path.join(out, `${tname}.seed.json`), seed);
    fs.writeFileSync(path.join(out, `${tname}.expected.txt`), tWant);
    fs.writeFileSync(path.join(out, `${tname}.derivations.txt`), derivations(t.store) + '\n');
    index.push(`${tname}\t${t.store.allFactKeys().length}\t${seed.length}\t${tWant.length}\tticked\t${ran}`);
    ticked++;
  } catch (e) {
    console.log(`  skip ${name}.tN`.padEnd(22) + (e as Error).message.slice(0, 60));
  }
}
fs.writeFileSync(path.join(out, 'INDEX.tsv'),
  '-- name\tfacts\tseed_bytes\texpected_bytes\tevaluation\tticks\n' + index.join('\n') + '\n');
console.log(`\nport corpus: ${ok} plain + ${ticked} ticked = ${ok + ticked} cases, ${skipped} skipped -> ${path.relative(ROOT, out)}`);
console.log(index.map((l) => '  ' + l.split('\t').slice(0, 2).join('  ')).join('\n'));
