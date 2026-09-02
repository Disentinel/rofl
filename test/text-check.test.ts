// text-check.test.ts — source files must stay reviewable, mechanically.
// Companion to the kernel vocabulary check: that one guards WHAT the kernel
// may name, this one guards that a human can read the diff at all.
//
// THE GATE MUST BE ABLE TO SAY BOTH WORDS. A check that has never said "no"
// is an assumption wearing a gate's interface; a check that says "no" to
// legitimate files gets switched off, and then its absence is invisible. So
// every arm below is measured in both directions, and every count is printed
// BEFORE and AFTER the plant — "caught it" and "the plant never landed" are
// the same empty output otherwise.
//
// The boundary is swept EXHAUSTIVELY rather than sampled: all 33 bytes of
// C0 plus DEL are planted one at a time and the reported set is compared
// with the intended one. A sample would show the gate is alive; only the
// sweep says where its edge actually is.

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkSourceIsText, listTextFiles } from '../scripts/text_check.ts';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

const TAB = 0x09, LF = 0x0a, CR = 0x0d, DEL = 0x7f;
/** every C0 control, and DEL */
const C0_AND_DEL: number[] = [...Array(0x20).keys(), DEL];

/** a source line with one arbitrary byte planted inside a token */
const planted = (b: number): Buffer =>
  Buffer.concat([Buffer.from('export const X = "a'), Buffer.from([b]), Buffer.from('b";\n')]);

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-textcheck-'));
}

// ---------------------------------------------------------------------------
// THE HONEST TREE — the "yes" that matters, with the control that makes it
// a measurement rather than a sentence.

test('every tracked source file in this repository is reviewable text', () => {
  const files = listTextFiles(ROOT);
  console.log(`honest tree: ${files.length} text files scanned`);

  // POSITIVE CONTROL. `violations` is an empty result, and an empty result is
  // a fact about the probe until the probe is shown to have run: a walker that
  // returned nothing would produce this same green.
  assert.ok(files.length > 200, `the walk found only ${files.length} files — clean would prove nothing`);
  assert.ok(files.includes('boot.rofl'), 'the walk reaches the repository root');
  assert.ok(files.includes(path.join('scripts', 'text_check.ts')), 'and reaches into subdirectories');

  const violations = checkSourceIsText(ROOT);
  assert.deepEqual(violations, [], violations.map((v) => `${v.file}: ${v.what}`).join('\n'));
});

// ---------------------------------------------------------------------------
// THE PLANTED DEFECT — the historical one, in the real tree, through the exact
// call the CLI and CI make.

test('the check fires on the defect it was written for, in the real tree', () => {
  // Planted as `.txt`: still a TEXT_EXT the check must read, but invisible to
  // `tsc -p tsconfig.json` and to the kernel grep, so a concurrent run of
  // either cannot trip over the few milliseconds this file exists.
  const probe = path.join(ROOT, 'test', 'fixtures', '_text_check_probe.txt');
  const before = checkSourceIsText(ROOT).length;
  fs.writeFileSync(probe, Buffer.from("export const X = 'a\0b';\n"));
  let during: ReturnType<typeof checkSourceIsText>;
  try {
    during = checkSourceIsText(ROOT);
  } finally {
    fs.unlinkSync(probe);
  }
  const after = checkSourceIsText(ROOT).length;
  console.log(`real tree findings — before ${before}, planted ${during.length}, after ${after}`);

  assert.equal(before, 0, 'the tree must start clean or the plant proves nothing');
  assert.equal(during.length, 1, 'exactly the planted file is reported');
  assert.match(during[0].file, /_text_check_probe\.txt$/);
  assert.match(during[0].what, /NUL byte/, 'NUL keeps its own diagnostic');
  assert.match(during[0].what, /refuse to diff/, 'and its own specific consequence');
  assert.equal(after, 0, 'clean again once removed');
});

// ---------------------------------------------------------------------------
// THE SWEEP — where the edge of the gate actually is.

test('EVERY C0 control and DEL is judged, and the verdicts are exactly the intended set', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'probe.ts');
  try {
    fs.writeFileSync(file, planted(0x41)); // an ordinary 'A' in the same slot
    const before = checkSourceIsText(dir).length;
    console.log(`sweep: findings before planting = ${before}`);
    assert.equal(before, 0, 'the fixture must start clean');

    const reported: number[] = [], allowed: number[] = [];
    for (const b of C0_AND_DEL) {
      fs.writeFileSync(file, planted(b));
      const v = checkSourceIsText(dir);
      assert.ok(v.length <= 1, `one file cannot yield ${v.length} findings`);
      if (v.length === 1) {
        reported.push(b);
        // An actionable message, required UNIFORMLY of every arm: which byte,
        // at what offset, on which line and column. No exemptions — a reader
        // who hits a NUL is looking for the same thing as a reader who hits a
        // 0x01, and the arm that reports the worse defect should not hand back
        // less.
        assert.match(v[0].what, /offset \d+/, `no offset for ${b}`);
        assert.match(v[0].what, /line \d+, column \d+/, `no line/column for ${b}`);
        // NUL additionally keeps the consequence no other byte has. This is the
        // anti-drift fence: the wording may be ADDED to, never traded away.
        if (b === 0x00) assert.match(v[0].what, /refuse to diff/, 'NUL keeps its own consequence');
      } else {
        allowed.push(b);
      }
    }
    const hex = (xs: number[]): string => xs.map((x) => '0x' + x.toString(16).padStart(2, '0')).join(' ');
    console.log(`sweep: ${reported.length} reported, ${allowed.length} allowed`);
    console.log(`  allowed: ${hex(allowed)}`);

    // TAB and LF are structure. Everything else in C0, plus DEL, is banned —
    // and CR is here because a lone CR is what `planted` produces.
    assert.deepEqual(allowed, [TAB, LF], `allowed set drifted: ${hex(allowed)}`);
    assert.equal(reported.length, C0_AND_DEL.length - 2);
    for (const b of [0x00, 0x01, 0x07, 0x0b, 0x0c, CR, 0x1b, DEL]) {
      assert.ok(reported.includes(b), `${hex([b])} must be reported`);
    }

    // and the fixture returns to clean, so the greens above are not a stuck probe
    fs.writeFileSync(file, planted(0x41));
    console.log(`sweep: findings after = ${checkSourceIsText(dir).length}`);
    assert.deepEqual(checkSourceIsText(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// CR, BOTH WAYS — the decision this check makes deliberately.

test('CRLF is a line ending and passes; a lone CR is a defect and fails', () => {
  const dir = tmpdir();
  try {
    const crlf = path.join(dir, 'windows.ts');
    fs.writeFileSync(crlf, Buffer.from('export const A = 1;\r\nexport const B = 2;\r\n', 'latin1'));
    const v1 = checkSourceIsText(dir);
    console.log(`CRLF file: ${v1.length} finding(s)`);
    assert.deepEqual(v1, [], 'a Windows checkout is not a defect; a gate red on it gets switched off');

    // same file, one CR promoted to a lone one
    fs.writeFileSync(crlf, Buffer.from('export const A = 1;\rexport const B = 2;\r\n', 'latin1'));
    const v2 = checkSourceIsText(dir);
    console.log(`lone-CR file: ${v2.length} finding(s) — ${v2[0]?.what}`);
    assert.equal(v2.length, 1, 'a bare carriage return is a character inside a line, not a line break');
    assert.match(v2[0].what, /lone CR/);
    assert.match(v2[0].what, /offset 19/, 'and it says exactly where');

    // a trailing CR at end of file has no LF after it, so it is lone
    fs.writeFileSync(crlf, Buffer.from('export const A = 1;\r', 'latin1'));
    assert.equal(checkSourceIsText(dir).length, 1, 'a CR at EOF is lone');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// THE MESSAGE — what a reader is handed.

test('the finding names the byte, the offset, the line and column, and how many', () => {
  const dir = tmpdir();
  try {
    const f = path.join(dir, 'probe.ts');
    // line 1 is 'aaa\n' (4 bytes), so offset 6 is line 2, column 3
    fs.writeFileSync(f, Buffer.concat([Buffer.from('aaa\nbb'), Buffer.from([0x01]), Buffer.from('cc\n')]));
    const one = checkSourceIsText(dir);
    console.log(`message: ${one[0].what}`);
    assert.equal(one.length, 1);
    assert.match(one[0].what, /control byte 0x01 at offset 6 \(line 2, column 3\)/);
    assert.ok(!/such bytes in this file/.test(one[0].what), 'no count when there is only one');

    // two of them: the reader is told that fixing the first is not the job
    fs.writeFileSync(f, Buffer.concat([Buffer.from('a'), Buffer.from([0x01]), Buffer.from('b'), Buffer.from([DEL]), Buffer.from('c\n')]));
    const two = checkSourceIsText(dir);
    console.log(`message: ${two[0].what}`);
    assert.match(two[0].what, /at offset 1 /, 'the LEFTMOST offence is the one reported');
    assert.match(two[0].what, /\(2 such bytes in this file\)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// THE "YES" ARMS — legitimate files the widened check must NOT turn red on.

test('tabs and newlines are structure, and genuine binary assets are not scanned', () => {
  const dir = tmpdir();
  try {
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.mkdirSync(path.join(dir, '.hidden'));
    fs.writeFileSync(path.join(dir, 'tabs.ts'), Buffer.from('function f() {\n\treturn 1;\n}\n'));
    fs.writeFileSync(path.join(dir, 'asset.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x7f]));
    fs.writeFileSync(path.join(dir, 'node_modules', 'vendor.ts'), Buffer.from([0x00, 0x01, 0x7f]));
    fs.writeFileSync(path.join(dir, '.hidden', 'x.ts'), Buffer.from([0x00, 0x01, 0x7f]));

    const files = listTextFiles(dir);
    console.log(`yes-arm: walked ${JSON.stringify(files)}`);
    // POSITIVE CONTROL for the three exclusions: the walk did happen, and it
    // found the one file it was supposed to find.
    assert.deepEqual(files, ['tabs.ts'], 'the walk must skip node_modules, dot-dirs and non-text extensions');
    assert.deepEqual(checkSourceIsText(dir), [], 'tabs and newlines are structure');

    // ...and the exclusions are exclusions, not blindness: the same bytes in a
    // scanned extension right next to them ARE reported.
    fs.writeFileSync(path.join(dir, 'sibling.ts'), Buffer.from([0x01]));
    assert.equal(checkSourceIsText(dir).length, 1, 'the check is not simply silent in this directory');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a file that is not decodable UTF-8 is still reported, and by that name', () => {
  const dir = tmpdir();
  try {
    // 0xff is not a legal UTF-8 lead byte, and it is not a control character,
    // so this arm is reached only if the widened check left it reachable.
    fs.writeFileSync(path.join(dir, 'mojibake.ts'), Buffer.from([0x61, 0xff, 0x62, 0x0a]));
    const v = checkSourceIsText(dir);
    console.log(`utf8 arm: ${v.length} finding(s) — ${v[0]?.what}`);
    assert.equal(v.length, 1);
    assert.match(v[0].what, /not decodable as UTF-8/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
