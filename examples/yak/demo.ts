// YAK — the practice, not the engine. This replays the scanners that can
// still be replayed against the repository as it stands, and says plainly
// which fragments cannot be replayed because their moment has passed.
//
// It does not reconstruct a single run. Where a scanner's subject has been
// repaired since, the replay shows the REPAIRED world and says so — a probe
// that returns a different number than it did when it was written is
// fragment 06's whole content, not a bug in this file.
//
//   node --experimental-strip-types examples/yak/demo.ts
import * as fs from 'node:fs';
import * as path from 'node:path';

import { run as sediment } from './fragments/01-sediment.ts';
import { run as scc } from './fragments/02-scc.ts';
import { run as metadep } from './fragments/03-metadep.ts';
import { run as falseMiss } from './fragments/04-false-miss.ts';
import { run as diverging } from './fragments/05-diverging-semiring.ts';
import { run as stale } from './fragments/06-stale-model.ts';
import { run as notNeeded } from './fragments/07-not-needed.ts';
import { run as goldenAccident } from './fragments/08-golden-accident.ts';
import { run as wrongPremise } from './fragments/09-wrong-premise.ts';
import { run as hygiene } from './fragments/hygiene.ts';

const WIDTH = 78;
const say = (s = '') => console.log(s);
const rule = (title: string) => {
  const t = `== ${title} `;
  say('');
  say(t + '='.repeat(Math.max(0, WIDTH - t.length)));
};

export interface Fragment {
  id: string;
  mode: string;
  label: 'caught' | 'provoked';
  fate: 'discarded' | 'kept' | 'corrected';
  title: string;
  run: (() => string[]) | null;
  /** What about this fragment is gone for good, in one line. Null when the
   *  whole thing replays. */
  unreplayable: string | null;
}

export const FRAGMENTS: Fragment[] = [
  {
    id: '01', mode: 'sedimentary success', label: 'caught', fate: 'kept',
    title: 'a rule left behind by one task fires on code written after it',
    run: sediment, unreplayable: null,
  },
  {
    id: '02', mode: 'redefining success', label: 'caught', fate: 'discarded',
    title: 'the definition dissolved the question; the enumerator was never written',
    run: scc, unreplayable: null,
  },
  {
    id: '03', mode: 'quick success', label: 'caught', fate: 'discarded',
    title: 'three minutes, four mutations, an exact invalidation key',
    run: metadep, unreplayable: null,
  },
  {
    id: '04', mode: 'FALSE MISS', label: 'provoked', fate: 'discarded',
    title: 'grep said "no exports" about a file with three',
    run: falseMiss,
    unreplayable: 'the original NUL byte in runtime/semirings.ts was removed; the mechanism is provoked here on a fresh pair of files',
  },
  {
    id: '05', mode: 'diverging semiring', label: 'provoked', fate: 'kept',
    title: 'a fact that cites nothing had infinitely many derivations, until the question was fixed',
    run: diverging, unreplayable: null,
  },
  {
    id: '06', mode: 'stale model', label: 'caught', fate: 'discarded',
    title: 'the probe survived; its subject did not',
    run: stale,
    unreplayable: 'the 5.4x spread itself cannot be reproduced: the fix landed in src/store.ts, which is the point of the fragment',
  },
  {
    id: '07', mode: 'THE SCANNER WAS NOT NEEDED', label: 'caught', fate: 'discarded',
    title: 'four minutes of control runs against one comment in src/store.ts',
    run: notNeeded, unreplayable: null,
  },
  {
    id: '08', mode: 'a rule that codes an accident', label: 'caught', fate: 'corrected',
    title: 'a byte-identical golden over three programs that stop at one stratum',
    run: goldenAccident,
    unreplayable: 'the nine failing tests are fixed; what replays is the measurement that explains them',
  },
  {
    id: '09', mode: 'the wrong premise', label: 'caught', fate: 'discarded',
    title: 'the probe refuted the symptom it was written to confirm',
    run: wrongPremise,
    unreplayable: 'the inflated support count is repaired, so both sides now return 1',
  },
  {
    id: '10', mode: 'yak shaving', label: 'caught', fate: 'discarded',
    title: 'a check built, briefed and enforced for work that was already covered',
    run: null,
    unreplayable: 'NOTHING TO REPLAY: no scanner was ever written. That is the fragment.',
  },
];

function main(): void {
  say('YAK — model as a by-product: scanners written mid-task.');
  say('Ten fragments from one working session. Every run below is real; where a');
  say('moment has passed, this says so instead of reconstructing it.');
  say('');
  const replayable = FRAGMENTS.filter((f) => f.run).length;
  say(`  ${FRAGMENTS.length} fragments, ${replayable} with a scanner that still runs, ` +
    `${FRAGMENTS.length - replayable} with none.`);
  say(`  ${FRAGMENTS.filter((f) => f.fate === 'discarded').length} of the rules were thrown away, ` +
    `${FRAGMENTS.filter((f) => f.fate === 'kept').length} kept, ` +
    `${FRAGMENTS.filter((f) => f.fate === 'corrected').length} corrected.`);

  for (const f of FRAGMENTS) {
    rule(`${f.id}. ${f.mode} — ${f.label}, rule ${f.fate}`);
    say(f.title);
    if (f.unreplayable) {
      say('');
      say(`  [not replayable] ${f.unreplayable}`);
    }
    if (f.run) {
      say('');
      for (const line of f.run()) say(line);
    }
  }

  rule('accumulation hygiene — MOOT over the accumulated set');
  for (const line of hygiene()) say(line);

  rule('what this catalogue does not show');
  say('Modes with no run behind them are listed in README.md and are NOT');
  say('written up as fragments. An empty cell is honest; a filled one that');
  say('nobody ran is not, and it would look better than the real ones.');
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(path.resolve(new URL(import.meta.url).pathname))) {
  main();
}
