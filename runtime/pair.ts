// runtime/pair.ts — the pair-work protocol: this engine plus a coding agent
// executing intents in-session (the agent is Claude working in this repo —
// no external LLM plumbing). State persists as a store snapshot between CLI
// invocations (kernel round-trip is acceptance-tested); the human-readable
// view is always the report.
//
// usage:
//   pair.ts init   --session S.snapshot.json [--pack NAME]... [--who-obs W] FILE.rofl...
//   pair.ts next   --session S.snapshot.json [--top K]
//   pair.ts admit  --session S.snapshot.json --agent NAME RESULT.json
//   pair.ts assert --session S.snapshot.json [--who W] 'fact_text.'
//   pair.ts report --session S.snapshot.json
//
// The loop: init once; then `next` hands the agent its top-K intents (each
// pointing at its typed instruction file); the agent executes ONE intent and
// writes an intent-result JSON; `admit` validates, admits, recomputes, saves,
// and prints the fresh report; repeat until the frontier empties or a
// checkpoint asks the human. `assert` is for human/runtime facts arriving
// outside intent execution (an escalation answer, a frame amendment).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { buildReport, loadDecisionPack, loadInquiryKernel } from './report.ts';
import { admit, type IntentResult } from './admission.ts';
import { scheduleIntents } from './scheduler.ts';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

export function initSession(
  sessionPath: string, files: string[],
  opts: { packs?: string[]; whoObs?: string } = {},
): Rofl {
  const r = new Rofl();
  loadInquiryKernel(r);
  for (const p of opts.packs ?? []) loadDecisionPack(r, p);
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const who = opts.whoObs && /\[obs\]/.test(text) ? opts.whoObs : undefined;
    const res = r.load(text, { who });
    if (!res.ok) throw new Error(`${f} REJECTED:\n` + res.diagnostics.join('\n'));
  }
  saveSession(r, sessionPath);
  return r;
}

export function restoreSession(sessionPath: string): Rofl {
  return Rofl.fromSnapshot(fs.readFileSync(sessionPath, 'utf8'));
}

export function saveSession(r: Rofl, sessionPath: string): void {
  fs.mkdirSync(path.dirname(path.resolve(sessionPath)), { recursive: true });
  fs.writeFileSync(sessionPath, r.save());
}

function instructionFor(kind: string): string {
  const f = path.join(ROOT, 'skills', 'guided-formal-reasoning', `${kind}.md`);
  return fs.existsSync(f)
    ? path.relative(process.cwd(), f)
    : 'skills/guided-formal-reasoning/SKILL.md';
}

export function renderNext(r: Rofl, topK: number): string {
  const { scheduled, deferred } = scheduleIntents(r, topK);
  if (scheduled.length === 0) {
    return 'Frontier empty — nothing to execute.\n\n' + buildReport(r);
  }
  const out = [`# Next intents (top ${scheduled.length}, ${deferred.length} deferred)`, ''];
  for (const it of scheduled) {
    out.push(`## ${it.kind}: ${it.target}  (inquiry: ${it.inquiry})`);
    out.push(`instructions: ${instructionFor(it.kind)}`);
    out.push('result template:');
    out.push('```json');
    out.push(JSON.stringify({
      intent: { kind: it.kind, inquiry: it.inquiry, target: it.target },
      outcome: 'progress | no_progress | blocked',
      assertions: [], evidence: [], new_intents: [], model_extensions: [],
      summary: '',
    }, null, 2));
    out.push('```', '');
  }
  out.push('Execute ONE intent, write the result JSON, then:');
  out.push('  npm run pair -- admit --session <S> --agent <you> result.json');
  return out.join('\n');
}

function main(): void {
  const [cmd, ...argv] = process.argv.slice(2);
  let session = '';
  let agent = '';
  let whoObs: string | undefined;
  let who: string | undefined;
  let topK = 3;
  const packs: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--session') session = argv[++i];
    else if (argv[i] === '--agent') agent = argv[++i];
    else if (argv[i] === '--pack') packs.push(argv[++i]);
    else if (argv[i] === '--who-obs') whoObs = argv[++i];
    else if (argv[i] === '--who') who = argv[++i];
    else if (argv[i] === '--top') topK = parseInt(argv[++i], 10);
    else rest.push(argv[i]);
  }
  if (!session) {
    console.error('usage: pair.ts init|next|admit|assert|report --session S.snapshot.json ...');
    process.exit(2);
  }
  if (cmd === 'init') {
    const r = initSession(session, rest, { packs, whoObs });
    console.log(`session initialized: ${session}\n`);
    console.log(buildReport(r));
    return;
  }
  const r = restoreSession(session);
  if (cmd === 'next') {
    console.log(renderNext(r, topK));
  } else if (cmd === 'admit') {
    if (!agent || rest.length !== 1) { console.error('admit needs --agent NAME and one RESULT.json'); process.exit(2); }
    const result = JSON.parse(fs.readFileSync(rest[0], 'utf8')) as IntentResult;
    const rep = admit(r, result, { agent });
    if (!rep.ok) { console.error('ADMISSION REFUSED:\n' + rep.diagnostics.join('\n')); process.exit(1); }
    saveSession(r, session);
    console.log(`admitted ${rep.asserted} facts from ${agent}`);
    if (rep.new_intents.length) console.log(`suggested (not asserted): ${JSON.stringify(rep.new_intents)}`);
    console.log('');
    console.log(buildReport(r));
  } else if (cmd === 'assert') {
    if (rest.length !== 1) { console.error("assert needs one 'fact_text.' argument"); process.exit(2); }
    const res = r.assert(rest[0], { who });
    if (!res.ok) { console.error('REJECTED:\n' + res.diagnostics.join('\n')); process.exit(1); }
    saveSession(r, session);
    console.log('ok\n');
    console.log(buildReport(r));
  } else if (cmd === 'report') {
    console.log(buildReport(r));
  } else {
    console.error(`unknown command '${cmd}'`);
    process.exit(2);
  }
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) main();
