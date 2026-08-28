// runtime/report.ts — the anytime epistemic report: the universal output of
// any inquiry (docs/inquiry-kinds.md), renderable after every tick. The
// decision certificate is this report under the `decide` closure policy.
//
// usage:
//   node --experimental-strip-types runtime/report.ts FILE.rofl [FILE.rofl ...]
//        [--who-obs NAME]   -- who to attribute [obs]-perspective files to
//
// boot.rofl and rules/inquiry/*.rofl load automatically, then the given
// files (a file whose facts target [obs] should be listed after the frame).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const INQUIRY_RULES = ['ontology.rofl', 'epistemic.rofl', 'obligations.rofl', 'intents.rofl']
  .map((f) => path.join(ROOT, 'rules', 'inquiry', f));

export function loadInquiryKernel(r: Rofl): void {
  const boot = path.join(ROOT, 'boot.rofl');
  for (const f of [boot, ...INQUIRY_RULES]) {
    const res = r.load(fs.readFileSync(f, 'utf8'));
    if (!res.ok) throw new Error(`${f} REJECTED:\n` + res.diagnostics.join('\n'));
  }
}

function col(r: Rofl, q: string, v: string): string[] {
  return r.query(q).rows.map((row) => row.bindings[v]).sort();
}

export function buildReport(r: Rofl): string {
  const out: string[] = [];
  const inquiries = r.query('inquiry(I, K)').rows;
  if (inquiries.length === 0) return '# Epistemic report\n\n(no inquiry framed)\n';
  for (const iq of inquiries) {
    const I = iq.bindings.I;
    const K = iq.bindings.K;
    out.push(`# Epistemic report: ${I} (${K})`);

    const recs = col(r, `recommendation(${I}, R)`, 'R');
    out.push('', `**recommendation:** ${recs.length ? recs.join(', ') : '(none yet — inquiry open)'}`);

    const states: [string, string][] = [
      ['supported', `resolved_obligation(${I}, C)`],
      ['refuted', `violated_blocking(${I}, C)`],
      ['contested', `contested_obligation(${I}, C)`],
      ['unknown', `open_obligation(${I}, C)`],
    ];
    out.push('', '## Obligations');
    for (const [label, q] of states) {
      const cs = col(r, q, 'C');
      if (cs.length) out.push(`- ${label}: ${cs.join(', ')}`);
    }

    const blocked = col(r, `go_blocked(${I}, C)`, 'C');
    if (blocked.length) out.push('', '## Blocking GO', ...blocked.map((c) => `- ${c}`));

    const intents = r.query(`candidate_intent(K, ${I}, C)`).rows
      .map((row) => `- ${row.bindings.K}: ${row.bindings.C}`).sort();
    out.push('', '## Candidate intents');
    out.push(...(intents.length ? intents : ['- (frontier empty)']));

    for (const rec of recs) {
      const why = r.why(`recommendation(${I}, ${rec})`);
      if (why.ok) out.push('', `## Why ${rec}`, '```', why.text, '```');
    }
    out.push('');
  }
  return out.join('\n');
}

function main(): void {
  const argv = process.argv.slice(2);
  const files: string[] = [];
  let whoObs: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--who-obs') whoObs = argv[++i];
    else files.push(argv[i]);
  }
  const r = new Rofl();
  loadInquiryKernel(r);
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const who = whoObs && /\[obs\]/.test(text) ? whoObs : undefined;
    const res = r.load(text, { who });
    if (!res.ok) { console.error(`${f} REJECTED:\n` + res.diagnostics.join('\n')); process.exit(1); }
  }
  process.stdout.write(buildReport(r));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).includes('report');
if (isMain) main();
