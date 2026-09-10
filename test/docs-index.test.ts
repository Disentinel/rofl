// test/docs-index.test.ts — README's index of `docs/` must name every document.
//
// README.md gained a *Documents* index on 2026-09-10 because seven of the
// nineteen files in `docs/` were reachable from nothing: `the-target.md`,
// which says what everything on the branch is instrumental to, was one of
// them. An index is worth exactly as much as its being complete, and a
// hand-maintained one decays the moment somebody adds a document — the same
// failure this repository has now priced four times (CLAUDE.md, *a
// hand-written list goes stale on a refactor*), and the reason
// `test/vocabulary-doc.test.ts` exists beside this one.
//
// So the index is derived from the DIRECTORY on every run and compared with
// what README.md names. Adding a document to `docs/` without a line in the
// index turns this red with the filename.
//
// WHAT IT CANNOT LOOK AT, and it is deliberately not guessed at: whether the
// sentence beside a filename says anything true about that document, and
// whether the file is in the right one of the four groups. Both would need a
// second source for a document's subject, and there is none. It also says
// nothing about `docs/dogfood/`, whose pages are dated session records rather
// than standing decisions — the index names the DIRECTORY and that is the
// intended granularity, checked by mutant 3 rather than assumed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mutant } from './helpers/mutant.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

/** Every `*.md` directly in `docs/`, which is the set the index is about;
 *  `docs/dogfood/` is a directory and is named as one. */
function onDisk(): string[] {
  return fs.readdirSync(path.join(ROOT, 'docs'))
    .filter((f) => f.endsWith('.md'))
    .sort();
}

/** The README section that holds the index. Addressed by heading rather than
 *  by line number — `facts/spec.rofl` anchors duties into this file by line,
 *  and a test that did the same would break for the same reason. */
function indexSection(doc: string): string {
  const start = doc.indexOf('\n### Documents\n');
  assert.notEqual(start, -1, 'README.md has a "### Documents" section');
  const rest = doc.slice(start + 1);
  const end = rest.indexOf('\n## ', 1);
  return end === -1 ? rest : rest.slice(0, end);
}

/** The document filenames the index names, as backticked `*.md` names. It
 *  accepts a bare `foo.md` or a `docs/foo.md`, because the section says both. */
function named(region: string): string[] {
  const out = new Set<string>();
  for (const m of region.matchAll(/`(?:docs\/)?([A-Za-z0-9_-]+\.md)`/g)) out.add(m[1]);
  return [...out].sort();
}

test('README\'s Documents index names every document in docs/', () => {
  const disk = onDisk();
  const listed = named(indexSection(README));

  // The positive control: neither side is empty, so agreement is a
  // measurement rather than two absences agreeing with each other.
  assert.ok(disk.length >= 15, `docs/ holds ${disk.length} documents`);
  assert.ok(listed.length >= 15, `the index names ${listed.length} documents`);

  const missing = disk.filter((f) => !listed.includes(f));
  const extra = listed.filter((f) => !disk.includes(f));
  assert.deepEqual(missing, [],
    'a document in docs/ that README\'s index does not name — add it to the group it belongs to');
  assert.deepEqual(extra, [],
    'README\'s index names a document that is not in docs/ — it was renamed or removed');
});

// ------------------------------------------------------------ the mutants

mutant('mutant 1: a new document with no index line goes red, naming it', () => {
  // targets: the failure this gate exists for. Simulated on the DISK side by
  // asking the comparison of a name that is certainly not in the index.
  const listed = named(indexSection(README));
  assert.ok(!listed.includes('a-document-nobody-indexed.md'));
});

mutant('mutant 2: an index line for a document that is gone goes red', () => {
  // targets: the other direction — a rename that updated the file and not the
  // index. A `.md` that does not exist must not be silently tolerated.
  const grown = README.replace('`the-target.md`', '`the-target.md` and `vanished.md`');
  assert.notEqual(grown, README, 'the anchor was found');
  const listed = named(indexSection(grown));
  assert.ok(listed.includes('vanished.md'));
  assert.ok(!onDisk().includes('vanished.md'), 'and the disk does not have it');
});

mutant('mutant 3 (NEGATIVE CONTROL): docs/dogfood/ is a directory and stays out', () => {
  // targets: a criterion that has gone slack in the other direction. The
  // dogfood pages are dated session records, not standing decisions; if this
  // gate ever demanded a line per page, adding one would go red for no reason
  // and the gate would be switched off. Both sides must agree it is excluded.
  const dogfood = fs.readdirSync(path.join(ROOT, 'docs', 'dogfood'))
    .filter((f) => f.endsWith('.md'));
  assert.ok(dogfood.length > 10, 'there are dogfood pages to be wrong about');
  const listed = named(indexSection(README));
  for (const f of dogfood) assert.ok(!listed.includes(f), `${f} is not indexed individually`);
  assert.ok(indexSection(README).includes('docs/dogfood/'), 'and the DIRECTORY is named');
});

mutant('mutant 4 (THE SURVIVOR): a description that lies about a document stays GREEN', () => {
  // targets: nothing — it states where this gate cannot look. The comparison
  // is over FILENAMES, so the sentence beside a name, and the group it sits
  // in, are both invisible. A reader is the only check on those.
  const lying = README.replace(
    '`benchmark-protocol.md`',
    '`benchmark-protocol.md` (the SQLite adapter\'s schema)');
  assert.notEqual(lying, README, 'the anchor was found');
  assert.deepEqual(named(indexSection(lying)), named(indexSection(README)),
    'SURVIVED: this gate compares filenames, never claims');
});
