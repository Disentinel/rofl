// text_check.ts — every tracked source file must stay REVIEWABLE.
//
// Why this exists (2026-08-30): an agent wrote `const SEP = '<NUL>'` with a
// literal NUL byte instead of the escape sequence. The file typechecked,
// its own 11 tests passed, and `npm run grepcheck` was clean — because that
// check scans src/ only. What broke was invisible to every gate we had:
//
//   $ git diff --stat -- runtime/semirings.ts
//    runtime/semirings.ts | Bin 0 -> 7930 bytes
//   Binary files /dev/null and b/runtime/semirings.ts differ
//
// git classified a TypeScript source file as binary, so it could not be
// diffed, reviewed, or line-blamed. grep silently skipped it too, which is
// how the defect hid: probes came back empty and empty read as "nothing
// there" rather than "the instrument refused".
//
// WHY IT WAS WIDENED (2026-09-01): this gate had a hole exactly one byte
// wide, in the file written against exactly this class of defect. An agent
// writing test/js-ast.test.ts emitted a literal 0x01 as a map-key separator.
// It passed EVERYTHING: `tsc` clean, `npm run textcheck` said "clean", the
// test itself passed (the byte was on both sides of the comparison), `grep`
// found nothing because the byte splits the word it sits inside, and `sed`
// refused to match the line for the same reason. Only `od -c` saw it.
//
// The old rule keyed on NUL because NUL is what GIT keys on. But git's
// binary heuristic is not the property we care about; REVIEWABILITY is, and
// a 0x01 is exactly as unreadable, exactly as invisible to grep, and does not
// trip git at all. Keying a review gate on another tool's heuristic is how it
// came to be one byte wide.
//
// THE RULE, in full:
//   - no NUL (its own diagnostic: git refuses to diff the file at all)
//   - no other C0 control character, except TAB and LF, which are structure
//   - no DEL (0x7f)
//   - no LONE CR — see the decision below
//   - decodable as UTF-8
//
// CR (0x0d) IS DELIBERATELY SPLIT, because a lone CR and a CRLF are different
// questions and one answer for both would be wrong either way:
//
//   CRLF is a line ending. Windows uses it, `core.autocrlf=true` puts it in
//   the working tree of a perfectly honest checkout, and every reviewing tool
//   understands it. Banning it would turn this gate red on a legitimate file,
//   and a gate that is red on legitimate files gets switched off — after which
//   its absence is invisible, which is worse than the hole it was closing.
//
//   A LONE CR is not a line ending here. git, grep and diff all count lines by
//   LF, so a bare CR is a character INSIDE a line; a terminal seeing it returns
//   the cursor to column 0 and the rest of the line paints over what came
//   before. The reader sees two lines and one of them erased; grep sees one
//   line and matches neither. That is the same defect as the 0x01, wearing a
//   line ending's clothes, so it is banned.
//
// Measured before widening: 337 text files in this repository, zero offending
// bytes, and zero CR of either kind — so the new arms cost nothing today and
// exist for the next agent rather than for this tree.

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Extensions that must be reviewable text. Anything else is ignored, so
 *  adding a genuine binary asset does not require touching this file. */
const TEXT_EXT = new Set(['.ts', '.rofl', '.md', '.json', '.yml', '.yaml', '.html', '.txt']);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

export interface TextViolation { file: string; what: string; }

function walk(dir: string, root: string, out: string[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name.startsWith('.') && e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, root, out);
    } else if (TEXT_EXT.has(path.extname(e.name))) {
      out.push(path.relative(root, full));
    }
  }
}

/** The files this check considers, in the order it considers them. Exported
 *  so that "clean" can be told apart from "looked at nothing": a violation
 *  list is an empty result, and an empty result is a fact about the probe
 *  until the probe is shown to have run. */
export function listTextFiles(rootDir: string): string[] {
  const out: string[] = [];
  walk(rootDir, rootDir, out);
  return out;
}

const TAB = 0x09, LF = 0x0a, CR = 0x0d, DEL = 0x7f;

/** A byte that has no business in reviewable source. TAB and LF are
 *  structure; CR is judged by what follows it, in `firstOffence`. */
const banned = (b: number): boolean => (b < 0x20 && b !== TAB && b !== LF && b !== CR) || b === DEL;

type Offence = { at: number; kind: 'control' | 'lone_cr' };

/** The leftmost offending byte, or null. One left-to-right pass, so the
 *  offence reported is always the first one a reader would reach. */
function firstOffence(buf: Buffer): Offence | null {
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    // A CR is an offence only when it is NOT the first half of a CRLF. At the
    // very end of the file `buf[i + 1]` is undefined, so a trailing CR counts
    // as lone — which it is.
    if (b === CR) { if (buf[i + 1] !== LF) return { at: i, kind: 'lone_cr' }; continue; }
    if (banned(b)) return { at: i, kind: 'control' };
  }
  return null;
}

/** How many offending bytes the file holds, so the message can say whether
 *  fixing the reported one finishes the job. */
function countOffences(buf: Buffer): number {
  let n = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === CR) { if (buf[i + 1] !== LF) n++; continue; }
    if (banned(b)) n++;
  }
  return n;
}

/** Where a reader should look. Lines are counted by LF, the same way git,
 *  grep and every editor count them. */
function place(buf: Buffer, off: number): string {
  let line = 1, col = 1;
  for (let i = 0; i < off; i++) {
    if (buf[i] === LF) { line++; col = 1; } else col++;
  }
  return `line ${line}, column ${col}`;
}

const hex = (b: number): string => '0x' + b.toString(16).padStart(2, '0');

const decoder = new TextDecoder('utf8', { fatal: true });

export function checkSourceIsText(rootDir: string): TextViolation[] {
  const files = listTextFiles(rootDir);
  const out: TextViolation[] = [];
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(rootDir, rel));

    // NUL keeps its own arm and its own diagnostic, because its consequence is
    // specific and worse than the rest: the file stops being diffable at all.
    // The location was appended 2026-09-01, strictly additively — every word of
    // the original consequence stays, and the `NUL byte` prefix stays matchable
    // (test/example-yak.test.ts pins it). The fence round this message exists to
    // stop the wording DRIFTING, not to keep it less useful than its neighbours.
    const nul = buf.indexOf(0);
    if (nul >= 0) {
      // the exact trigger git uses to call a file binary
      out.push({ file: rel, what: `NUL byte at offset ${nul} (${place(buf, nul)}); git will treat this as binary and refuse to diff it` });
      continue;
    }

    const bad = firstOffence(buf);
    if (bad) {
      const n = countOffences(buf);
      const more = n > 1 ? ` (${n} such bytes in this file)` : '';
      out.push({
        file: rel,
        what: bad.kind === 'lone_cr'
          ? `lone CR ${hex(CR)} at offset ${bad.at} (${place(buf, bad.at)}); a bare carriage return is not a line break — a terminal paints over the line and grep sees one line where a reader sees two${more}`
          : `control byte ${hex(buf[bad.at])} at offset ${bad.at} (${place(buf, bad.at)}); it is invisible to a reader and it splits the token it sits inside, so grep will not match that token${more}`,
      });
      continue;
    }

    try {
      decoder.decode(buf);
    } catch {
      out.push({ file: rel, what: 'not decodable as UTF-8' });
    }
  }
  return out;
}

const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1] &&
  real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const scanned = listTextFiles(root).length;
  const violations = checkSourceIsText(root);
  if (violations.length === 0) {
    // The count is the positive control. "clean" over zero files is the same
    // sentence as "clean" over the whole tree, and only one of them is news.
    console.log(`source text check: clean (${scanned} files)`);
  } else {
    for (const v of violations) console.error(`${v.file}: ${v.what}`);
    console.error(`${violations.length} violation(s) in ${scanned} files`);
    process.exit(1);
  }
}
