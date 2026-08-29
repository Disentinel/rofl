# Comparison frame — ROFL / guided-formal-reasoning vs the field

You are one researcher in a swarm. You profile ONE target system (named in
your instructions) against the ten axes below. Axes describe what ROFL —
a small Datalog-family engine used as a working-memory substrate for
LLM coding agents — actually does today. Judge whether your target has an
equivalent, not whether it is good.

## The ten axes (ROFL's actual properties)

- **A1_perspectives** — facts live in named ledgers (`[code]`, `[obs]`,
  `[s1]`) with write-authority: who may write where is enforced; an
  impostor write surfaces as a derived `forged[audit]` fact. Perspective =
  ledger (provenance of writes), never a status or modality.
- **A2_provenance** — the kernel emits derivation provenance itself
  (`derived_by`); any conclusion has a mechanical why-trace. Not an add-on
  library — emitted by evaluation.
- **A3_epistemic_openworld** — claim status (supported / refuted /
  contested / unknown) is DERIVED from evidence; unknown ≠ false; contested
  is a first-class state that blocks decisions rather than resolving by
  priority.
- **A4_fixpoint_replay** — stratified-negation Datalog fixpoint;
  deterministic: same facts + same rules = same conclusions, so a run can
  be replayed/re-derived from the fact journal at zero model cost.
- **A5_incremental_materialization** — facts materialize to files keyed by
  content hash; unchanged sources are never re-extracted; the store
  rebuilds from files (re-materialization beats trusting accumulated
  state).
- **A6_llm_admission_gate** — an LLM agent is a first-class but UNTRUSTED
  writer: results enter through a validated, attributed admission gate;
  agent assertions land in the agent's own ledger, never directly in the
  epistemic layer; agent-attached polarity on blocking claims needs
  human/tool confirmation.
- **A7_anytime_budgets** — bounded best-first work loop with budgets,
  stagnation detection, and an anytime epistemic report renderable at
  every tick.
- **A8_typed_inquiry** — typed inquiry roots (decide / verify / explain /
  explore / monitor...) generate a frontier of typed intents (verify,
  clarify, challenge, discriminate, escalate, confirm) — the work queue is
  derived from epistemic state.
- **A9_embeddable_kernel** — zero-dependency ~small TS kernel; runs on
  bare Node/Bun; no server, no build.
- **A10_rule_mutation_testing** — the discipline that rule packs ship with
  mutation tests: a standing green variant is manually broken several ways
  and each break must flip the verdict.

## Your deliverable

Write ONE file (path given in your instructions) containing:

1. A short prose profile of the target (5-15 lines): what it is, its
   actual niche, maturity, who uses it.
2. A fenced JSON block exactly in this shape:

```json
{"target": "<claim atom from instructions>",
 "system": "<name>",
 "category": "<family>",
 "axes": {
   "A1_perspectives": {"level": "has|partial|lacks", "note": "<=25 words", "source": "<url or model-knowledge>"},
   "A2_provenance": {...}, "A3_epistemic_openworld": {...},
   "A4_fixpoint_replay": {...}, "A5_incremental_materialization": {...},
   "A6_llm_admission_gate": {...}, "A7_anytime_budgets": {...},
   "A8_typed_inquiry": {...}, "A9_embeddable_kernel": {...},
   "A10_rule_mutation_testing": {...}
 },
 "adjacent_capabilities": ["what it has that ROFL lacks, 1-5 items"],
 "steal": ["what ROFL should learn/steal from it, 1-3 items"],
 "positioning": "<one sharp sentence: ROFL vs this system>",
 "confidence": "high|medium|low"}
```

## Sourcing rules (strict)

- Use WebSearch/WebFetch where you can; cite the URL you actually read.
- If the network fails or you rely on training knowledge, write
  `"source": "model-knowledge"` — that is honest and acceptable.
- NEVER invent a URL. An invented citation is worse than none.
- `level` compares against the axis AS DESCRIBED, not a loose theme: e.g.
  CodeQL has provenance-ish query results but no kernel-emitted why-trace
  over a mutable fact store — that is "partial", with the note saying why.
- Keep the whole file under ~120 lines.
