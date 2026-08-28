// runtime/admission.ts — the gate between agent output and the fact base.
// Validates an IntentResult (shape mirrored from schemas/intent-result.json,
// hand-rolled to keep the runtime dependency-free) and admits it:
//
//   - agent assertions land in the agent's OWN ledger [agent_<name>]
//     (authority granted on first admission) — they never touch [epistemic];
//   - evidence entries land in the [obs] journal, written by the runtime as
//     who=runtime after validation; their kind can never be 'measured'
//     (the schema has no such member — measured is minted only by runtime
//     tool executions, outside this path);
//   - admission REFUSES an unattributed call: no agent name, no admission
//     (finding f_admission_requires_who — anonymity must not bypass audit);
//   - new_intents and model_extensions are returned to the caller, never
//     asserted: candidate intents are derived, not asserted, and model
//     extensions await their own admission path (Phase 8).
//
// Injection safety: every value interpolated into program text is either a
// validated atom (^[a-z][A-Za-z0-9_]*$) or an escaped string literal.

import { Rofl } from '../src/api.ts';

export interface IntentRef { kind: string; inquiry: string; target: string; }
export interface Assertion { claim: string; state: 'supported' | 'refuted' | 'inconclusive'; based_on?: string[]; }
export interface EvidenceItem {
  id: string; kind: string; source: string;
  content?: string; scope?: string; observed_at?: string;
}
export interface NewIntent { kind: string; target: string; rationale?: string; }
export interface IntentResult {
  intent: IntentRef;
  outcome: 'progress' | 'no_progress' | 'blocked';
  assertions?: Assertion[];
  evidence?: EvidenceItem[];
  new_intents?: NewIntent[];
  model_extensions?: unknown[];
  summary: string;
}

export interface AdmissionReport {
  ok: boolean;
  diagnostics: string[];
  asserted: number;
  new_intents: NewIntent[];
  model_extensions: unknown[];
}

const ATOM = /^[a-z][A-Za-z0-9_]*$/;
const INTENT_KINDS = new Set(['verify', 'clarify', 'discriminate', 'escalate', 'challenge']);
const OUTCOMES = new Set(['progress', 'no_progress', 'blocked']);
const STATES = new Set(['supported', 'refuted', 'inconclusive']);
const EVIDENCE_KINDS = new Set(['human_assertion', 'document', 'log_excerpt', 'agent_claim']);

function esc(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\t]/g, ' ') + '"';
}

export function validateResult(x: unknown): string[] {
  const d: string[] = [];
  const o = x as IntentResult;
  if (typeof o !== 'object' || o === null) return ['result is not an object'];
  if (typeof o.intent !== 'object' || o.intent === null) d.push('intent missing');
  else {
    if (!INTENT_KINDS.has(o.intent.kind)) d.push(`intent.kind '${o.intent.kind}' not in closed vocabulary`);
    for (const f of ['inquiry', 'target'] as const) {
      if (!ATOM.test(o.intent?.[f] ?? '')) d.push(`intent.${f} is not a valid atom`);
    }
  }
  if (!OUTCOMES.has(o.outcome)) d.push(`outcome '${o.outcome}' not in closed vocabulary`);
  if (typeof o.summary !== 'string' || o.summary.length === 0) d.push('summary missing');
  for (const a of o.assertions ?? []) {
    if (!ATOM.test(a.claim ?? '')) d.push(`assertion claim '${a.claim}' is not a valid atom`);
    if (!STATES.has(a.state)) d.push(`assertion state '${a.state}' not in closed vocabulary`);
    for (const b of a.based_on ?? []) if (!ATOM.test(b)) d.push(`based_on '${b}' is not a valid atom`);
  }
  for (const e of o.evidence ?? []) {
    if (!ATOM.test(e.id ?? '')) d.push(`evidence id '${e.id}' is not a valid atom`);
    if (!EVIDENCE_KINDS.has(e.kind)) {
      d.push(`evidence kind '${e.kind}' not admissible from an agent (measured is runtime-only)`);
    }
    if (typeof e.source !== 'string' || e.source.length === 0) d.push(`evidence ${e.id}: source missing`);
  }
  for (const n of o.new_intents ?? []) {
    if (typeof n.kind !== 'string' || typeof n.target !== 'string') d.push('new_intent missing kind/target');
  }
  return d;
}

export function admit(r: Rofl, result: IntentResult, opts: { agent?: string }): AdmissionReport {
  const out: AdmissionReport = { ok: false, diagnostics: [], asserted: 0, new_intents: [], model_extensions: [] };
  if (!opts.agent || !ATOM.test('agent_' + opts.agent)) {
    out.diagnostics.push('admission refused: no attributed agent (anonymity must not bypass the forged audit)');
    return out;
  }
  const diags = validateResult(result);
  if (diags.length > 0) { out.diagnostics = diags; return out; }

  const persp = 'agent_' + opts.agent;
  const facts: { text: string; who?: string }[] = [];

  // one-time authority grant for the agent's own ledger (sensors idiom)
  if (!r.holds(`authority(${persp}, ${opts.agent})`)) {
    facts.push({ text: `authority(${persp}, ${opts.agent}).` });
  }

  const knownEvidence = new Set((result.evidence ?? []).map((e) => e.id));
  for (const e of result.evidence ?? []) {
    facts.push({ text: `evidence_kind[obs](${e.id}, ${e.kind}).`, who: 'runtime' });
    facts.push({ text: `evidence_source[obs](${e.id}, ${esc(e.source)}).`, who: 'runtime' });
    if (e.scope) facts.push({ text: `evidence_scope[obs](${e.id}, ${esc(e.scope)}).`, who: 'runtime' });
    if (e.observed_at) facts.push({ text: `evidence_time[obs](${e.id}, ${esc(e.observed_at)}).`, who: 'runtime' });
  }

  for (const a of result.assertions ?? []) {
    facts.push({ text: `agent_state[${persp}](${a.claim}, ${a.state}).`, who: opts.agent });
    for (const b of a.based_on ?? []) {
      facts.push({ text: `agent_basis[${persp}](${a.claim}, ${b}).`, who: opts.agent });
      // polarity enters the journal only for evidence carried by this result
      // (or already present in it); the runtime is the accountable writer.
      const known = knownEvidence.has(b) || r.holds(`evidence_kind[obs](${b}, K)`);
      if (a.state !== 'inconclusive' && known) {
        const rel = a.state === 'supported' ? 'supports' : 'refutes';
        facts.push({ text: `${rel}[obs](${b}, ${a.claim}).`, who: 'runtime' });
      }
    }
  }

  for (const f of facts) {
    const res = r.assert(f.text, { who: f.who });
    if (!res.ok) { out.diagnostics.push(...res.diagnostics); return out; }
    out.asserted++;
  }
  out.ok = true;
  out.new_intents = result.new_intents ?? [];
  out.model_extensions = result.model_extensions ?? [];
  return out;
}
