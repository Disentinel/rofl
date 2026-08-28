# Truth Maintenance Systems & Belief Revision — Profile

## Prose Profile

Truth maintenance systems (TMS) comprise three foundational traditions in classical AI: Doyle's Justification-based TMS (JTMS, 1979) represents beliefs as nodes with justification links, tracking which facts are supported or refuted via dependency networks; de Kleer's Assumption-based TMS (ATMS, 1986) extends this to maintain multiple consistent belief scenarios simultaneously using assumption labels and nogoods; and the AGM framework (Alchourrón, Gärdenfors, Makinson, 1985) provides formal axioms for rational belief revision and contraction operators. These systems excel at nonmonotonic reasoning, handling retraction of conclusions when evidence changes, and tracking epistemic conflicts. Maturity is high—JTMS and ATMS had working implementations and industrial use in diagnostic systems (Xerox, NASA); AGM shaped formal epistemology. No active core development today; the lineage continues in logic programming and default reasoning. These systems are the original dependency-tracked, revisable belief stores; they predate the LLM era and lack untrusted-writer validation.

## Axis Assessment

```json
{
  "target": "c_tms",
  "system": "Truth Maintenance Systems (JTMS, ATMS, AGM)",
  "category": "Classical dependency-tracking belief engines",
  "axes": {
    "A1_perspectives": {
      "level": "partial",
      "note": "Justifications link statements with implicit provenance (who asserted), but no formal ledger-based write-authority enforcement or impostor-forged-fact detection.",
      "source": "model-knowledge"
    },
    "A2_provenance": {
      "level": "partial",
      "note": "Justification networks and ATMS labels emit why-traces; the kernel tracks inference chains. But provenance is justification-based, not kernel-mechanical over a mutable fact store.",
      "source": "model-knowledge"
    },
    "A3_epistemic_openworld": {
      "level": "has",
      "note": "Supported/refuted/undecided distinction is foundational. Unknown ≠ false. Contested (conflicting justifications) blocks decisions. First-class epistemic state derivation from evidence.",
      "source": "model-knowledge"
    },
    "A4_fixpoint_replay": {
      "level": "lacks",
      "note": "Incremental update is central, but no stratified-negation Datalog fixpoint with deterministic replay from fact journal. State accumulates; re-derivation requires reconstruction.",
      "source": "model-knowledge"
    },
    "A5_incremental_materialization": {
      "level": "has",
      "note": "JTMS and ATMS designed for incremental belief update with retraction. Changes propagate through justification network. But no content-hash file-keying or zero-cost re-materialization.",
      "source": "model-knowledge"
    },
    "A6_llm_admission_gate": {
      "level": "lacks",
      "note": "Pre-LLM systems. No concept of untrusted-writer admission gates, attributed assertions, or polarity-blocking claims requiring confirmation. All justifications are trusted.",
      "source": "model-knowledge"
    },
    "A7_anytime_budgets": {
      "level": "lacks",
      "note": "Work loop is exhaustive until fixpoint; no bounded best-first budgets, stagnation detection, or anytime epistemic reports at every tick.",
      "source": "model-knowledge"
    },
    "A8_typed_inquiry": {
      "level": "lacks",
      "note": "External problem solver drives queries via justification updates; TMS itself has no typed inquiry roots (decide/verify/explain/explore), no frontier of typed intents, no derived work queue.",
      "source": "model-knowledge"
    },
    "A9_embeddable_kernel": {
      "level": "partial",
      "note": "Original JTMS implementations were small and self-contained; some modern reconstructions are lightweight. But no zero-dependency standard embedded kernel comparable to ROFL.",
      "source": "model-knowledge"
    },
    "A10_rule_mutation_testing": {
      "level": "lacks",
      "note": "Pre-dates mutation testing discipline. No standing green variant broken-and-checked methodology. Rule sets shipped without systematic mutation coverage.",
      "source": "model-knowledge"
    }
  },
  "adjacent_capabilities": [
    "Multiple consistent environments/scenarios tracked simultaneously (ATMS labels and nogood sets)",
    "Formal epistemic axioms for rational belief change (AGM postulates: success, inclusion, vacuity, consistency, extensionality)",
    "Nogood-based conflict explanation and contradiction detection",
    "Default logic and exception handling integrated into justification structure"
  ],
  "steal": [
    "Nogood-based explanations: when a belief is contested, emit explicit reason-why-conflict (what justifications contradict)",
    "Environment/scenario labels (ATMS-style): tag derived facts by the assumption set that entails them; support multi-scenario replay",
    "Rational postulates for belief change: formalize and test belief operators (revision, contraction, expansion) against AGM axioms"
  ],
  "positioning": "ROFL is a modern Datalog engine with LLM admission gates and anytime budgets; TMS are classical dependency trackers from 1979–1986 that excel at epistemic open-world reasoning but lack untrusted-writer validation and typed inquiry.",
  "confidence": "high"
}
```

## Sources

- WebSearch: Doyle JTMS, de Kleer ATMS, AGM belief revision (searches returned GitHub repos, Springer Nature, ResearchGate, ArXiv, and semantic scholar links; network egress blocked PDF fetches, so assessment relies on model-knowledge of well-documented classical systems)
- All three systems have extensive peer-reviewed publications and textbook coverage in classical AI and formal epistemology literature (1979–1985 originals remain foundational)
