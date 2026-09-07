// order_census.ts — WHICH OBSERVABLES ARE A FUNCTION OF THE SCHEDULE.
//
// The suite answers "did something go red". It cannot answer "did the ANSWER
// move or only the RECORD of how it was reached", because a test that reads a
// why-tree and a test that reads a fact set both go red the same way. This
// scanner separates them: it builds a corpus of worlds and digests four
// independent readings of each, so a run under a perturbed evaluation order
// can be diffed against a run under the stock one, reading by reading.
//
//   facts    every fact key, sorted.            <- THE ANSWER. If this moves,
//                                                  the order is a soundness
//                                                  break and nothing else
//                                                  matters.
//   firings  per fact, EVERY firing signature it accumulated, sorted. The
//            support hypergraph's edge SET, with no reference to which edge
//            arrived first. Schedule-independent iff the evaluator is complete
//            for rule instances however it is scheduled.
//   witness  per fact, the CANONICAL witness — `Store.witnessOf`, which is the
//            FIRST firing to arrive (src/store.ts:602). The one reading that
//            is a function of the schedule by construction.
//   minwit   per fact, the firing with the LEXICOGRAPHICALLY LEAST signature.
//            What `witnesses` would hold if `support()` selected by DATA
//            instead of by arrival. Recorded here so the question "would that
//            be schedule-independent" is measured rather than argued: it is
//            exactly `witnessesOf(key)[0]`, and `witnessesOf` already sorts.
//   canon    `canonicalState()`, the storage port's conformance oracle, which
//            folds facts, support counts and witnesses into one string.
//
// The scanner carries NO mutant of its own. A mutant is applied to `src/` for
// the length of one run and reverted; this file only says what changed. That
// keeps it usable as a plain census of the corpus's provenance shape, which is
// what the last section prints.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { sigOf } from '../src/engine.ts';
import type { Store } from '../src/store.ts';

const ROOT = path.join(import.meta.dirname, '..');
const read1 = (...p: string[]): string => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const sha = (s: string): string =>
  crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

interface Reading {
  name: string;
  ok: boolean;
  note: string;
  facts: string;
  firings: string;
  witness: string;
  minwit: string;
  canon: string;
  nFacts: number;
  nFirings: number;
  nMulti: number;      // facts supported by more than one firing
  nDiffer: number;     // facts whose canonical witness is NOT the min-sig one
}

/** The firing signature of a witness, built the way `Evaluation.conclude`
 *  builds it (src/engine.ts:1245). Rebuilt rather than looked up by object
 *  identity: `Store.restore` reconstructs the witness table and the firing
 *  table from separate JSON, so identity holds only in a store that was never
 *  round-tripped, and the first version of this file scored 1377 of `sus`'s
 *  facts as "canonical witness is not any firing" for that reason alone. */
function witSig(w: { ruleId: string; prems: Parameters<typeof sigOf>[0][] }): string {
  return w.ruleId + '|' + w.prems.map(sigOf).join('|');
}

function read(name: string, build: () => Rofl): Reading {
  const empty: Reading = {
    name, ok: false, note: '', facts: '-', firings: '-', witness: '-',
    minwit: '-', canon: '-', nFacts: 0, nFirings: 0, nMulti: 0, nDiffer: 0,
  };
  let st: Store;
  try {
    st = build().store;
  } catch (e) {
    return { ...empty, note: (e as Error).message.split('\n')[0].slice(0, 90) };
  }
  const keys = [...st.allFactKeys()].sort();
  const fLines: string[] = [];
  const wLines: string[] = [];
  const mLines: string[] = [];
  let nFirings = 0;
  let nMulti = 0;
  let nDiffer = 0;
  for (const k of keys) {
    const sigs = st.firings.get(k);
    if (!sigs || sigs.size === 0) continue;
    const sorted = [...sigs.keys()].sort();
    nFirings += sorted.length;
    if (sorted.length > 1) nMulti++;
    fLines.push(k + ' => ' + sorted.join(' ; '));
    const w = st.witnessOf(k);
    // The canonical witness's OWN signature: rebuilt from the firing table
    // rather than recomputed, so this reads what the store chose and not what
    // this file thinks it should have chosen.
    const chosen = w === undefined ? '?' : witSig(w);
    wLines.push(k + ' => ' + chosen);
    mLines.push(k + ' => ' + sorted[0]);
    if (chosen !== sorted[0]) nDiffer++;
  }
  return {
    name, ok: true, note: '',
    facts: sha(keys.join('\n')),
    firings: sha(fLines.join('\n')),
    witness: sha(wLines.join('\n')),
    minwit: sha(mLines.join('\n')),
    canon: sha(st.canonicalState()),
    nFacts: keys.length, nFirings, nMulti, nDiffer,
  };
}

/** The corpus. Chosen for provenance SHAPE rather than for size: a program
 *  where every fact has exactly one derivation cannot distinguish "first
 *  firing" from "least firing" at all, so `nMulti` below is the column that
 *  says whether an entry is carrying any signal. */
async function corpus(): Promise<Reading[]> {
  const out: Reading[] = [];
  const spat = await import('../examples/spat/spat.ts');
  const wtf = await import('../examples/wtf/demo.ts');
  const goof = await import('../examples/goof/demo.ts');
  const sus = await import('../examples/sus/demo.ts');
  const loot = await import('../examples/loot/demo.ts');
  const ring1 = await import('../examples/ring1/demo.ts');

  out.push(read('spat', () => spat.world()));
  out.push(read('wtf', () => wtf.world()));
  out.push(read('wtf/stock', () => wtf.stockWorld()));
  out.push(read('goof', () => goof.world()));
  // A TICKED world, because everything above settles inside one tick and the
  // staging table is a second place arrival order could hide: `@next` heads
  // are collected in a Map and sorted on the way out (src/rounds.ts:300).
  out.push(read('tm/50ticks', () => {
    const r = new Rofl();
    r.load(read1('boot.rofl'));
    r.load(read1('examples', 'tm.rofl'));
    r.run({ maxTicks: 50 });
    return r;
  }));
  out.push(read('sensors', () => {
    const r = new Rofl();
    r.load(read1('boot.rofl'));
    r.load(read1('examples', 'sensors.rofl'));
    r.evaluate();
    return r;
  }));
  out.push(read('sus', () => sus.world()));
  out.push(read('loot', () => loot.world()));
  // One ring 1 clause parsed in the steady state a front end runs in: the
  // world is built and warmed first, so what is digested is the PARSE.
  out.push(read('ring1/parse', () => {
    const img = ring1.image();
    const r = ring1.fromImage(img);
    ring1.parse('greeting(hello).', r);
    return r;
  }));
  return out;
}

function main(): void {
  corpus().then((rs) => {
    const cols = ['facts', 'firings', 'witness', 'minwit', 'canon'] as const;
    const w = Math.max(...rs.map((r) => r.name.length), 11);
    console.log([
      'world'.padEnd(w), 'facts'.padEnd(13), 'firings'.padEnd(13),
      'witness'.padEnd(13), 'minwit'.padEnd(13), 'canon'.padEnd(13),
      '#facts'.padStart(7), '#fire'.padStart(7), '#multi'.padStart(7),
      '#differ'.padStart(8),
    ].join(' '));
    for (const r of rs) {
      if (!r.ok) { console.log(r.name.padEnd(w) + ' FAILED: ' + r.note); continue; }
      console.log([
        r.name.padEnd(w), ...cols.map((c) => r[c].padEnd(13)),
        String(r.nFacts).padStart(7), String(r.nFirings).padStart(7),
        String(r.nMulti).padStart(7), String(r.nDiffer).padStart(8),
      ].join(' '));
    }
    // One line per reading, so a diff of two runs is a diff of this block.
    console.log('');
    for (const r of rs) {
      console.log(`DIGEST ${r.name} ok=${r.ok} `
        + cols.map((c) => `${c}=${r[c]}`).join(' ')
        + ` nFacts=${r.nFacts} nFirings=${r.nFirings} nMulti=${r.nMulti} nDiffer=${r.nDiffer}`
        + (r.ok ? '' : ` note=${r.note}`));
    }
  }).catch((e) => { console.error(e); process.exit(1); });
}

main();
