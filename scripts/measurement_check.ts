// measurement_check.ts — a rate without its subject is not a measurement.
//
// WHAT THIS CATCHES, and it was paid for on 2026-08-30. Three claims in one
// evening stated a per-unit rate whose SUBJECT was narrower than the use made
// of it:
//
//   - `clone()` measured at 3 us/fact on a BARE store of one-integer facts,
//     published as the cost of forking, and used to declare two examples
//     unblocked. A realistic store — rules, derived facts, provenance,
//     witnesses — forks at 21.7-22.5 us/fact. An executor caught it, not the
//     author.
//   - 861 MB at 610309 facts recorded as 0.7M facts per GB, with no note of
//     which program produced those facts. A later re-run of the same benchmark
//     script derived 193037, and the original parameters were unrecoverable —
//     so the number could never be compared to anything again.
//   - a suite at 291 seconds read as the cost of the tests, when the machine
//     was carrying four agents at load average 24. On a quiet box the same
//     suite is 125 seconds.
//
// In every case the number was correct and the SENTENCE was wrong, because the
// conditions travelled in the author's head instead of in the text. A grep
// cannot check that a subject is the RIGHT one; it can check that a subject is
// THERE, which is the part that was missing all three times.
//
// THE RULE: a `finding_note` that states a per-unit rate must, in the same
// note, say what the rate was measured on.
//
// Run: npm run measurecheck

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Per-unit rates: the shape of claim that travels badly. A bare total ("the
 *  suite took 125 s") is not caught, because a total is usually read as the
 *  one-off it is; a RATE invites multiplication by somebody else's N. */
const RATE = new RegExp(
  [
    String.raw`\d[\d.,]*\s*(?:us|µs|microseconds?|ms|milliseconds?|bytes?|MB|GB)\s*(?:per|/)\s*(?:fact|tick|row|second|key)`,
    String.raw`ticks?\s+per\s+second`,
    String.raw`facts?\s+per\s+(?:GB|second)`,
    String.raw`per-(?:tick|fact|row)\s+cost`,
  ].join('|'),
  'i',
);

/** Any of these counts as naming the subject. Deliberately generous: the
 *  purpose is to catch a rate stated with NO conditions at all, not to police
 *  how the conditions are phrased. */
const SUBJECT = new RegExp(
  [
    'measured (?:on|with|at|against|here|rather)',
    're-?measur',
    'bare store',
    'real(?:istic)? store',
    'under load',
    'load average',
    'on a quiet',
    String.raw`at \d[\d,]* facts?`,
    String.raw`\d+ agents?`,
    String.raw`arity-\d`,
    String.raw`n\s*=\s*\d`,
    'sample',
    'this machine',
    'one laptop',
  ].join('|'),
  'i',
);

/** A decision recorded without saying what would overturn it is a preference
 *  with the interface of a finding.
 *
 *  WHAT THIS CATCHES, and it was paid for on 2026-08-30. The counting-under-
 *  ticks question was closed with "a query cannot name a tick, therefore
 *  counting should answer about the current one" — an argument that takes a
 *  LIMIT OF THE CURRENT API and presents it as a PRINCIPLE OF THE SEMANTICS.
 *  The owner caught it. Had the refuter been written, it would have read "if a
 *  query could name a tick" — and the absence of that surface is a decision
 *  nobody had taken, not a fact about the domain. Writing the refuter is what
 *  makes the difference visible, and it costs one sentence. */
const DECIDED = /DECIDED by/;
const REFUTER = /WHAT WOULD REFUTE THIS|what would refute|refuter|the observation that would/i;

export interface Violation { id: string; excerpt: string; }

export function checkDecisions(text: string): Violation[] {
  const out: Violation[] = [];
  const noteRe = /finding_note\((f_[a-z0-9_]+),\s*\n?\s*"([\s\S]*?)"\)\./g;
  let m: RegExpExecArray | null;
  while ((m = noteRe.exec(text))) {
    const [, id, body] = m;
    if (!DECIDED.test(body)) continue;
    if (REFUTER.test(body)) continue;
    out.push({ id, excerpt: body.slice(0, 90).replace(/\s+/g, ' ') });
  }
  return out;
}

export function checkMeasurements(text: string): Violation[] {
  const out: Violation[] = [];
  const noteRe = /finding_note\((f_[a-z0-9_]+),\s*\n?\s*"([\s\S]*?)"\)\./g;
  let m: RegExpExecArray | null;
  while ((m = noteRe.exec(text))) {
    const [, id, body] = m;
    const hit = RATE.exec(body);
    if (!hit) continue;
    if (SUBJECT.test(body)) continue;
    const from = Math.max(0, hit.index - 70);
    out.push({ id, excerpt: body.slice(from, hit.index + hit[0].length + 40).replace(/\s+/g, ' ') });
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).includes('measurement_check');
if (isMain) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const file = path.join(root, 'facts', 'findings.rofl');
  const text = fs.readFileSync(file, 'utf8');
  const total = (text.match(/finding_note\(/g) ?? []).length;
  const rates = checkMeasurements(text);
  const decisions = checkDecisions(text);
  for (const v of rates) {
    console.error(`${v.id}: a rate with no subject — ...${v.excerpt}...`);
  }
  for (const v of decisions) {
    console.error(`${v.id}: a DECISION with no refuter — ${v.excerpt}...`);
  }
  if (rates.length === 0 && decisions.length === 0) {
    console.log(`measurement check: clean (${total} notes scanned)`);
  } else {
    if (rates.length) {
      console.error(`${rates.length} rate(s) stated without saying what they were measured on.`);
      console.error('Add the conditions to the note: what store, what program, what load, what n.');
    }
    if (decisions.length) {
      console.error(`${decisions.length} decision(s) recorded without saying what would overturn them.`);
      console.error('Add a "WHAT WOULD REFUTE THIS:" clause naming an observation, not a doubt.');
    }
    process.exit(1);
  }
}
