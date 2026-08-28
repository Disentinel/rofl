// scanners/cli.ts — scan a source tree into materialized facts, then
// (optionally) load boot + facts + rule files into a Rofl instance and query.
//
// usage:
//   node --experimental-strip-types scanners/cli.ts <srcDir> [--out DIR]
//        [--rules FILE]... [--query 'lit']... [--why 'fact'] [--whynot 'lit']
//
// With no --query/--why/--whynot/--rules this only (re)materializes facts.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { materialize, SCANNER_WHO, PREAMBLE_FILE } from './materialize.ts';

function usage(): never {
  console.error('usage: cli.ts <srcDir> [--out DIR] [--rules FILE]... ' +
    "[--query 'lit']... [--why 'fact'] [--whynot 'lit']");
  process.exit(2);
}

function main(): void {
  const argv = process.argv.slice(2);
  let srcDir: string | null = null;
  let out = 'facts/generated';
  const rules: string[] = [];
  const queries: string[] = [];
  const whys: string[] = [];
  const whynots: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out = argv[++i] ?? usage();
    else if (a === '--rules') rules.push(argv[++i] ?? usage());
    else if (a === '--query') queries.push(argv[++i] ?? usage());
    else if (a === '--why') whys.push(argv[++i] ?? usage());
    else if (a === '--whynot') whynots.push(argv[++i] ?? usage());
    else if (a.startsWith('--')) usage();
    else if (srcDir === null) srcDir = a;
    else usage();
  }
  if (!srcDir) usage();

  const t0 = Date.now();
  const report = materialize(srcDir, out);
  console.log(`scanned ${report.scanned.length}, unchanged ${report.unchanged.length}, ` +
    `removed ${report.removed.length} (${Date.now() - t0}ms) -> ${out}`);

  if (rules.length + queries.length + whys.length + whynots.length === 0) return;

  const r = new Rofl();
  const bootPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'boot.rofl');
  if (fs.existsSync(bootPath)) {
    const res = r.load(fs.readFileSync(bootPath, 'utf8'));
    if (!res.ok) { console.error('boot.rofl REJECTED:\n' + res.diagnostics.join('\n')); process.exit(1); }
  }
  for (const f of report.factFiles) {
    const who = f.endsWith(PREAMBLE_FILE) ? undefined : SCANNER_WHO;
    const res = r.assert(fs.readFileSync(f, 'utf8'), { who });
    if (!res.ok) { console.error(`${f} REJECTED:\n` + res.diagnostics.join('\n')); process.exit(1); }
  }
  for (const f of rules) {
    const res = r.load(fs.readFileSync(f, 'utf8'));
    if (!res.ok) { console.error(`${f} REJECTED:\n` + res.diagnostics.join('\n')); process.exit(1); }
  }
  for (const q of queries) {
    console.log(`? ${q}`);
    const res = r.query(q);
    if (res.error) { console.log('error: ' + res.error); continue; }
    if (res.rows.length === 0) console.log('(empty)');
    for (const row of res.rows) console.log(row.text);
    if (res.partial) console.log('[partial: budget exhausted, hole emitted]');
  }
  for (const w of whys) { console.log(`why ${w}`); console.log(r.why(w).text); }
  for (const w of whynots) { console.log(`whynot ${w}`); console.log(r.whynot(w).text); }
}

main();
