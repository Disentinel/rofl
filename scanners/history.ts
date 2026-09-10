// scanners/history.ts — DOES THIS FILE LEAD OR DOES IT FOLLOW?
//
// The cleanup table asked, of every artifact, WHO POINTS AT THIS. It gave
// `scripts/kernel_grep.ts` a perfect score the morning of the day it was
// deleted as fifteen commits of appeasement. The defect was in the axis:
// reachability measures INTEGRATION, and integration and usefulness run
// opposite ways over time — the longer a useless thing survives, the more
// things point at it.
//
// The missing axis is EVIDENTIAL, and git is the half of it that is
// mechanical. Two questions, asked of EVERY file rather than only of gates,
// because both are about the shape of a file's history and every file has one:
//
//   1. DOES IT ONLY EVER GROW? A file whose commits are almost all insertion
//      and almost never deletion is a LIST BEING FED. That is what a whitelist
//      looks like from orbit, and it is what a ledger looks like too — so the
//      measure does not judge, it reports, and the rules decide which roles it
//      is damning for.
//
//   2. DOES IT CHANGE ONLY WHEN SOMETHING ELSE DOES? If A almost never appears
//      in a commit without B, while B appears often without A, then A FOLLOWS
//      B: it is a shadow, updated to keep up rather than because anybody
//      learned anything about it. A generated pack follows its generator
//      legitimately; a check that follows the code it checks is a check being
//      dragged.
//
// WHAT THIS CANNOT SEE, stated because the last axis was believed too readily:
//   * WHY a change was made. A commit that widens a whitelist and a commit
//     that fixes a real bug are both `+3 -0`. The shape is a smell, never a
//     verdict, and `rules/history.rofl` says so in the rule bodies.
//   * A file that is RIGHT and therefore never changes looks identical to a
//     file nobody has looked at. `commits` is reported so a reader can tell a
//     small denominator from a real pattern.
//   * Renames. `git log --numstat` without `--follow` breaks a file's history
//     at its rename, and `--follow` cannot be used with multiple paths. A
//     renamed file therefore reads as young. Measured on this tree: the count
//     of files whose history starts after the repository's first commit is
//     reported by the run, so the size of that blind spot is visible.
//
// Run: npm run history        (writes facts/history.rofl)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

interface Rec { commits: number; added: number; deleted: number; code: number; listy: number; }

/** Is this added line a LIST ELEMENT and nothing else? Strip the string
 *  literals out of it; if what remains is only commas, brackets and space,
 *  the line carried no logic — it carried a name somebody added to a list.
 *
 *  THIS IS THE MEASURE THAT SURVIVED, and two did not. `only ever grows` is
 *  dead: measured over this tree, `scripts/kernel_grep.ts` is 93% additions
 *  and so are `src/store.ts` and `boot.rofl`, while `src/unify.ts` is 97% and
 *  `scripts/text_check.ts` is 100%. In a young repository everything grows.
 *  Co-change was the second and it needs a longer history than 331 commits to
 *  separate anything.
 *
 *  This one separates on the first try and, more to the point, it finds
 *  independently what the tree already knew was wrong:
 *
 *    test/rule-shape.test.ts     39%   RULES_BASELINE — red in CI today
 *    scripts/kernel_grep.ts      29%   deleted the day this was written
 *    test/spec-coverage.test.ts  15%   the closed gate list, hand-edited twice
 *    test/skill-bundle.test.ts   14%   the ledger records it two behind its dir
 *    scanners/rule_shape.ts      11%   the same baseline, from the other side
 *    everything healthy         0-1%
 *
 *  Four of the top five were known bad for reasons nobody derived from this. */
export function isListElement(line: string): boolean {
  let probe = line.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '').replace(/`[^`]*`/g, '');
  probe = probe.replace(/[\s,\[\]]/g, '');
  return probe === '';
}

/** A line that carries no code at all: blank, or a comment in either syntax. */
function isProse(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('--') || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

export function scan(): { files: Map<string, Rec>; co: Map<string, number>; commits: number } {
  // `--no-merges` because a merge commit's numstat is a conflict resolution
  // and not a decision anybody made about a file.
  const log = execFileSync('git', ['log', '--format=C|%H', '--numstat', '--no-merges'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  // ONE PASS FOR THE ADDED LINES, `--unified=0` so no context line is counted
  // as an addition. Per-file `git log -p` would be 648 subprocesses.
  const patch = execFileSync('git',
    ['log', '--format=C|%H', '-p', '--unified=0', '--no-merges', '--no-color'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
  const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((l) => l.length > 0));

  const files = new Map<string, Rec>();
  const co = new Map<string, number>();
  let commits = 0;
  let touched: string[] = [];

  // THE PAIR KEY USES `|`, AND THAT IS A REPAIR OF A REPAIR. It was written as
  // a space, a NUL byte reached the file through a heredoc, and `npm run
  // textcheck` caught it correctly — then the OBVIOUS fix, deleting the byte,
  // silently joined the two paths into one string, broke every pair in the
  // model, and left the gate green. A separator is not a character you can
  // remove; it is a character that must not occur in the operands. `|` cannot
  // appear in a path here, a space can.
  const flush = (): void => {
    if (touched.length === 0) return;
    commits++;
    // CO-CHANGE IS CAPPED. A commit touching 200 files says nothing about any
    // pair in it — that is a sweep, not a relationship — and left uncapped it
    // would swamp every real pair with noise from the four big merges.
    if (touched.length <= 12) {
      const t = [...new Set(touched)].sort();
      for (let i = 0; i < t.length; i++) {
        for (let j = i + 1; j < t.length; j++) {
          const k = `${t[i]}|${t[j]}`;
          co.set(k, (co.get(k) ?? 0) + 1);
        }
      }
    }
    touched = [];
  };

  for (const line of log.split('\n')) {
    if (line.startsWith('C|')) { flush(); continue; }
    if (line.trim() === '') continue;
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (!m) continue;
    const file = m[3].includes(' => ') ? m[3].replace(/.*=> /, '').replace(/}$/, '') : m[3];
    if (!tracked.has(file)) continue;      // deleted or moved out; not our subject
    const rec = files.get(file) ?? { commits: 0, added: 0, deleted: 0, code: 0, listy: 0 };
    rec.commits++;
    rec.added += m[1] === '-' ? 0 : Number(m[1]);
    rec.deleted += m[2] === '-' ? 0 : Number(m[2]);
    files.set(file, rec);
    touched.push(file);
  }
  flush();

  // second pass: where the added lines LANDED
  let cur: string | null = null;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ b/')) { const f = line.slice(6); cur = files.has(f) ? f : null; continue; }
    if (line.startsWith('diff --git') || line.startsWith('C|')) { cur = null; continue; }
    if (!cur || !line.startsWith('+') || line.startsWith('+++')) continue;
    const body = line.slice(1);
    if (isProse(body)) continue;
    const rec = files.get(cur)!;
    rec.code++;
    if (isListElement(body)) rec.listy++;
  }
  return { files, co, commits };
}

const q = (s: string): string => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

export function render(a: ReturnType<typeof scan>): string {
  const L: string[] = [
    '-- facts/history.rofl — GENERATED by scanners/history.ts, do not edit.',
    '-- Run `npm run history` to rebuild; test/history.test.ts regenerates and',
    '-- compares.',
    '--',
    '-- The reasoning over these rows is rules/history.rofl; nothing here',
    '-- concludes anything. A number here is a SHAPE, never a verdict: a commit',
    '-- that widens a whitelist and a commit that fixes a bug are both `+3 -0`.',
    `-- ${a.files.size} tracked files over ${a.commits} non-merge commits.`,
    '',
  ];
  for (const f of [...a.files.keys()].sort()) {
    const r = a.files.get(f)!;
    L.push(`touched[hist](${q(f)}, ${r.commits}, ${r.added}, ${r.deleted}).`);
    if (r.code > 0) L.push(`landed[hist](${q(f)}, ${r.code}, ${r.listy}).`);
  }
  L.push('');
  // Only pairs seen more than once: a single co-occurrence is a coincidence
  // and there are tens of thousands of them.
  const pairs = [...a.co.entries()].filter(([, n]) => n >= 2).sort((x, y) => x[0].localeCompare(y[0]));
  for (const [k, n] of pairs) {
    const [x, y] = k.split('|');
    L.push(`together[hist](${q(x)}, ${q(y)}, ${n}).`);
  }
  L.push('');
  L.push(`history_commits[hist](${a.commits}).`);
  return L.join('\n') + '\n';
}

const isMain = process.argv[1] && path.basename(process.argv[1]) === 'history.ts';
if (isMain) {
  const a = scan();
  fs.writeFileSync(path.join(ROOT, 'facts/history.rofl'), render(a));
  const pairs = [...a.co.values()].filter((n) => n >= 2).length;
  console.log(`facts/history.rofl: ${a.files.size} files, ${a.commits} commits, ${pairs} co-change pairs`);
}
