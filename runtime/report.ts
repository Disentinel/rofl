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
const INQUIRY_RULES = ['ontology.rofl', 'terminology.rofl', 'epistemic.rofl',
  'obligations.rofl', 'intents.rofl', 'perspectives.rofl']
  .map((f) => path.join(ROOT, 'rules', 'inquiry', f));
const FINDINGS_RULES = path.join(ROOT, 'rules', 'findings.rofl');

export function loadInquiryKernel(r: Rofl): void {
  const boot = path.join(ROOT, 'boot.rofl');
  for (const f of [boot, ...INQUIRY_RULES, FINDINGS_RULES]) {
    const res = r.load(fs.readFileSync(f, 'utf8'));
    if (!res.ok) throw new Error(`${f} REJECTED:\n` + res.diagnostics.join('\n'));
  }
}

/** Load a decision pack plus the shared policies (evidence, authority). */
export function loadDecisionPack(r: Rofl, name: string): void {
  const files = [
    path.join(ROOT, 'rules', 'policies', 'evidence.rofl'),
    path.join(ROOT, 'rules', 'policies', 'authority.rofl'),
    path.join(ROOT, 'rules', 'decisions', `${name}.rofl`),
  ];
  for (const f of files) {
    const res = r.load(fs.readFileSync(f, 'utf8'));
    if (!res.ok) throw new Error(`${f} REJECTED:\n` + res.diagnostics.join('\n'));
  }
}

function col(r: Rofl, q: string, v: string): string[] {
  return r.query(q).rows.map((row) => row.bindings[v]).sort();
}

function findingsSection(r: Rofl): string[] {
  const open = r.query('open_finding(F)').rows.map((row) => row.bindings.F).sort();
  const settled = r.query('settled(F)').rows.length;
  if (open.length + settled === 0) return [];
  const out = ['# Findings backlog', ''];
  if (open.length === 0) {
    out.push(`(all ${settled} findings settled — nothing demands a reaction)`);
    return out;
  }
  out.push(`${open.length} open, ${settled} settled. Every open finding demands a reaction:`,
    'address it, dismiss it with a reason, or knowingly defer it — never silence.', '');
  for (const f of open) {
    const kind = col(r, `finding(${f}, K)`, 'K').join(',');
    const wants = col(r, `finding_action(${f}, W)`, 'W').join(', ');
    const note = col(r, `finding_note(${f}, N)`, 'N').join(' ');
    out.push(`- **${f}** [${kind} → ${wants || 'unspecified'}] ${note.replace(/^"|"$/g, '')}`);
  }
  return out;
}

export function buildReport(r: Rofl): string {
  const out: string[] = [];
  const inquiries = r.query('inquiry(I, K)').rows;
  const findings = findingsSection(r);
  if (inquiries.length === 0 && findings.length === 0) {
    return '# Epistemic report\n\n(no inquiry framed, no findings recorded)\n';
  }
  for (const iq of inquiries) {
    const I = iq.bindings.I;
    const K = iq.bindings.K;
    out.push(`# Epistemic report: ${I} (${K})`);

    const recs = col(r, `recommendation(${I}, R)`, 'R');
    out.push('', `**recommendation:** ${recs.length ? recs.join(', ') : '(none yet — inquiry open)'}`);

    const states: [string, string][] = [
      ['supported', `resolved_obligation(${I}, C)`],
      ['refuted', `refuted_obligation(${I}, C)`],
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
  if (findings.length) out.push(...findings, '');
  return out.join('\n');
}

function main(): void {
  const argv = process.argv.slice(2);
  const files: string[] = [];
  let whoObs: string | undefined;
  const packs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--who-obs') whoObs = argv[++i];
    else if (argv[i] === '--pack') packs.push(argv[++i]);
    else files.push(argv[i]);
  }
  const r = new Rofl();
  loadInquiryKernel(r);
  for (const p of packs) loadDecisionPack(r, p);
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const who = whoObs && /\[obs\]/.test(text) ? whoObs : undefined;
    const res = r.load(text, { who });
    if (!res.ok) { console.error(`${f} REJECTED:\n` + res.diagnostics.join('\n')); process.exit(1); }
  }
  process.stdout.write(buildReport(r));
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) main();
