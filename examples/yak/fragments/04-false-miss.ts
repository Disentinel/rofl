// FRAGMENT 04 — FALSE MISS. The dangerous one, because it is invisible.
//
// TASK      review a newly written runtime/semirings.ts before landing it.
// QUESTION  what does this file export?
// SCANNER   grep.
// RETURNED  nothing.
//
// Read as "no exports". It was false. The file held a literal NUL byte — a
// separator constant written as the raw character instead of the escape — and
// a grep that skips binary files skips it, silently: no "binary file matches",
// no warning, nothing on stdout, just exit 1. Meanwhile tsc was clean, the
// file's own eleven tests were green, and `npm run grepcheck` was clean
// because that check scans src/ only. git alone objected, calling a
// TypeScript source `Bin 0 -> 7930 bytes` and refusing to diff it.
//
// This file PROVOKES the same moment: two files identical but for one NUL,
// and the SAME QUESTION put to three greps. The run is real; only the
// going-there was deliberate.
//
// The sting is in the third row. Typing `grep` does not name a program — it
// names whatever the environment has bound. Here it is ugrep with -I already
// applied, so the silent answer is the DEFAULT one.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkSourceIsText } from '../../../scripts/text_check.ts';

/** Put the review's question to one instrument and report what came back —
 *  the count, or what it did instead of counting. */
function ask(bin: string, args: string[], file: string): string {
  try {
    const o = execFileSync(bin, [...args, 'export', file], { encoding: 'utf8' }).trim();
    return `${o || '(nothing)'}  [exit 0]`;
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string; code?: string };
    if (err.code === 'ENOENT') return '(not installed here)';
    const said = ((err.stdout ?? '') + (err.stderr ?? '')).trim();
    return `${said || '(NOTHING AT ALL)'}  [exit ${err.status}]`;
  }
}

const INSTRUMENTS: [string, string, string[]][] = [
  ['/usr/bin/grep -c', '/usr/bin/grep', ['-c']],
  ['/usr/bin/grep -I -c', '/usr/bin/grep', ['-I', '-c']],
];

export function run(): string[] {
  const out: string[] = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yak-'));
  const body = (sep: string) =>
    `export const SEP = "a${sep}b";\nexport function parse() {}\nexport const VERSION = 3;\n`;
  const withNul = path.join(dir, 'withnul.ts');
  const clean = path.join(dir, 'clean.ts');
  fs.writeFileSync(withNul, Buffer.from(body('\0')));
  fs.writeFileSync(clean, Buffer.from(body('')));
  try {
    out.push('two files, three exports each, identical but for one NUL byte:');
    out.push(`   clean.ts   ${fs.statSync(clean).size} bytes`);
    out.push(`   withnul.ts ${fs.statSync(withNul).size} bytes`);
    out.push('');
    out.push('the same question, put to each instrument:');
    out.push(`   ${'instrument'.padEnd(22)} ${'clean.ts'.padEnd(16)} withnul.ts`);
    for (const [label, bin, args] of INSTRUMENTS) {
      out.push(`   ${label.padEnd(22)} ${ask(bin, args, clean).padEnd(16)} ${ask(bin, args, withNul)}`);
    }
    out.push('');
    out.push('one of those rows says "no exports" about a file with three, and says it');
    out.push('with an empty stdout. That is not a finding about the file.');
    out.push('');
    const v = checkSourceIsText(dir);
    out.push(`the gate that replaced it — scripts/text_check.ts — over the same directory:`);
    out.push(`   ${v.length} violation(s)`);
    for (const x of v) out.push(`   ${path.basename(x.file)}: ${x.what}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  console.log(run().join('\n'));
}
