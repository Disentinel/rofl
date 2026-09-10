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
 *  file under examples/, a directory of them loaded together, or a rule pack
 *  beside the facts of the same name. A demo whose world is assembled in
 *  TypeScript is NOT here — the seed must be reachable from the corpus, not
 *  from a host program. */
function worlds(): [string, string[]][] {
  const out: [string, string[]][] = [];
  const ex = path.join(ROOT, 'examples');
  for (const e of fs.readdirSync(ex).sort()) {
    const p = path.join(ex, e);
    if (fs.statSync(p).isDirectory()) {
      const files = fs.readdirSync(p).sort().filter((x) => x.endsWith('.rofl')).map((x) => path.join(p, x));
      if (files.length > 0) out.push([e, files]);
    } else if (e.endsWith('.rofl')) out.push([e.replace(/\.rofl$/, ''), [p]]);
  }

  // THE RULE PACKS, added 2026-09-10, and they were the larger half of the
  // language all along: 46 packs and 12 464 lines against the examples' 40
  // files, and the ONLY user in the tree of `str_pre`, `str_seg` and
  // `str_segs`. Measured before adding them, the second engine had never
  // evaluated one — which is why rust/rofl/src/engine.rs carries the comments
  // "No corpus case exercises these" and "nothing in the corpus reaches
  // `atom_of`" without saying why.
  //
  // A pack's world is the pack plus `facts/<same name>.rofl` when there is
  // one; a pack whose inputs live elsewhere simply derives less, and a pack
  // that cannot stand alone is refused by the round-trip test below like any
  // other world.
  for (const r of glob('rules')) {
    const name = 'rules_' + path.relative(path.join(ROOT, 'rules'), r).replace(/\.rofl$/, '').replace(/[/]/g, '_');
    const facts = path.join(ROOT, 'facts', path.basename(r));
    out.push([name, fs.existsSync(facts) ? [facts, r] : [r]]);
  }

  out.push(['boot_only', []]);
  return out;
}

/** Every `.rofl` under a directory, one level of nesting included — `rules/`
 *  has `inquiry/`, `policies/` and `decisions/` under it. */
function glob(dir: string): string[] {
  const base = path.join(ROOT, dir);
  const out: string[] = [];
  for (const e of fs.readdirSync(base).sort()) {
    const p = path.join(base, e);
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p).sort()) if (f.endsWith('.rofl')) out.push(path.join(p, f));
    } else if (e.endsWith('.rofl')) out.push(p);
  }
  return out;
}

fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) fs.rmSync(path.join(out, f));

const index: string[] = [];
const TICKS = 3;
let ok = 0, skipped = 0, ticked = 0;
const provless: string[] = [];
for (const [name, files] of worlds()) {
  let seed: string, want: string, deriv: string, facts: number, partial: boolean;
  try {
    // A FILE THAT IS NOT A PROGRAM DROPS ITSELF, NOT THE WORLD. `examples/
    // ring1/l1.dense.rofl` is a dense ENCODING of l1.rofl's rules, checked for
    // reproducibility by test/example-ring1.test.ts and not loadable as a
    // program — and because this loop refused the whole directory on it,
    // `ring1` was absent from the corpus, taking with it the only user of
    // `str_char`, `str_sub` and `atom_of` among the examples. One file that is
    // data cost seven destructors their only conformance case.
    const dropped: string[] = [];
    const direct = new Rofl(); direct.load(boot);
    for (const f of files) {
      const res = direct.load(fs.readFileSync(f, 'utf8'));
      if (!res.ok) dropped.push(path.basename(f));
    }
    if (files.length > 0 && dropped.length === files.length) {
      throw new Error(`no file loaded: ${dropped.join(', ')}`);
    }
    if (dropped.length > 0) console.log(`  drop ${name.padEnd(14)} not a program: ${dropped.join(', ')}`);
    const ev = direct.evaluate();
    partial = ev.partial;

    const seedR = new Rofl(); seedR.load(boot);
    for (const f of files) if (!dropped.includes(path.basename(f))) seedR.load(fs.readFileSync(f, 'utf8'));
    seedR.store.clearDerived();
    const baseKeys = new Set(seedR.store.allFactKeys());
    seed = seedR.store.snapshot();

    // THE EXPECTATION COMES FROM THE INPUT THE PORT IS GIVEN, and until
    // 2026-09-10 it did not. `want` was `direct.canonicalState()` — the
    // reference run over the FILES — while the port is handed the SEED, so the
    // corpus compared two engines on two different inputs and papered over the
    // gap with an admission test: a world where the two disagreed was thrown
    // out with "reference does not round-trip its own seed". That threw out
    // `rules_js-controlflow` and told nobody why.
    //
    // Taking the expectation from the replay makes the comparison the one
    // anybody wanted — same input, two engines — and the round-trip question
    // becomes what it always was: a property OF THE REFERENCE, reported below
    // rather than used to hide a case.
    const replay = Rofl.fromSnapshot(seed);
    replay.evaluate();
    want = replay.store.canonicalState();
    deriv = derivations(replay.store);
    facts = replay.store.allFactKeys().length;

    // THE INVARIANT THAT MATTERS IS PRESENCE, NOT IDENTITY. This began as a
    // comparison of the two canonical states and reported `rules_js-controlflow`
    // as a reference defect. Measured, it is not one: both paths derive exactly
    // the same 433 facts, and the single differing row is a SURPLUS provenance
    // entry the direct run records for a fact that is BASE in the seed and that
    // a rule also happens to derive. Which support is recorded depends on
    // evaluation history; enumerating every support is a different job than
    // this one. What a store owes is that a fact it DERIVED can say why.
    const wit = new Set(want.split('\n').filter((l) => l.startsWith('wit '))
      .map((l) => l.slice(4, l.indexOf(' <- '))));
    const orphan = replay.store.allFactKeys()
      .filter((k) => !baseKeys.has(k) && !k.startsWith('derived_by') && !wit.has(k));
    if (orphan.length > 0) provless.push(`${name}: ${orphan.length} derived fact(s) with no provenance, e.g. ${orphan[0]}`);
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
// A DERIVED FACT THAT CANNOT SAY WHY IT HOLDS is the one provenance failure
// worth a line here. Reported by name so it cannot be a case that quietly is
// not there.
if (provless.length > 0) {
  console.log(`\n  DERIVED FACTS WITH NO PROVENANCE in ${provless.length} world(s):`);
  for (const r of provless) console.log(`    ${r}`);
}
console.log(`\nport corpus: ${ok} plain + ${ticked} ticked = ${ok + ticked} cases, ${skipped} skipped -> ${path.relative(ROOT, out)}`);
console.log(index.map((l) => '  ' + l.split('\t').slice(0, 2).join('  ')).join('\n'));
