// runtime/tick.ts — the bounded inquiry loop:
//   derive candidates -> schedule top-K -> execute -> admit -> recompute
// until the frontier is empty (quiescent), the tick budget is spent
// (budget_exhausted -> human checkpoint), or nothing moves (stalled ->
// human checkpoint). An epistemic report is available after every tick —
// the anytime guarantee.
//
// The executor is pluggable: an async function from a scheduled intent to
// an IntentResult (an LLM agent, a deterministic scanner, or a test stub).
// Returning null means "could not execute" and produces no admission.

import { Rofl } from '../src/api.ts';
import { admit, type AdmissionReport, type IntentRef, type IntentResult, type NewIntent } from './admission.ts';
import { scheduleIntents } from './scheduler.ts';
import { buildReport } from './report.ts';

export type Executor = (intent: IntentRef) => Promise<IntentResult | null> | IntentResult | null;

export interface TickLogEntry {
  tick: number;
  scheduled: IntentRef[];
  deferred: number;
  admitted: number;
  refused: string[];
}

export interface InquiryRun {
  status: 'quiescent' | 'budget_exhausted' | 'stalled';
  ticks: number;
  log: TickLogEntry[];
  suggested_intents: NewIntent[];
  report: string;
}

export interface RunOpts {
  agent: string;        // attribution for admissions — mandatory, no anonymity
  maxTicks?: number;    // tick budget (default 10 — roadmap §9.4 checkpoint)
  topK?: number;        // max scheduled intents per tick (default 3)
}

export async function runInquiry(r: Rofl, executor: Executor, opts: RunOpts): Promise<InquiryRun> {
  const maxTicks = opts.maxTicks ?? 10;
  const topK = opts.topK ?? 3;
  const log: TickLogEntry[] = [];
  const suggested: NewIntent[] = [];
  let stalledStreak = 0;

  for (let tick = 1; tick <= maxTicks; tick++) {
    const { scheduled, deferred } = scheduleIntents(r, topK);
    if (scheduled.length === 0) {
      return { status: 'quiescent', ticks: tick - 1, log, suggested_intents: suggested, report: buildReport(r) };
    }
    const entry: TickLogEntry = { tick, scheduled, deferred: deferred.length, admitted: 0, refused: [] };
    for (const intent of scheduled) {
      const result = await executor(intent);
      if (result === null) continue;
      const rep: AdmissionReport = admit(r, result, { agent: opts.agent });
      if (!rep.ok) { entry.refused.push(...rep.diagnostics); continue; }
      entry.admitted += rep.asserted;
      suggested.push(...rep.new_intents);
    }
    log.push(entry);
    if (entry.admitted === 0) {
      stalledStreak++;
      if (stalledStreak >= 2) {
        return { status: 'stalled', ticks: tick, log, suggested_intents: suggested, report: buildReport(r) };
      }
    } else {
      stalledStreak = 0;
    }
  }
  return { status: 'budget_exhausted', ticks: maxTicks, log, suggested_intents: suggested, report: buildReport(r) };
}
