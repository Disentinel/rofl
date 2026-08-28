# Knowledge-Representation Reasoners: OWL/RDF & Cyc Profile

## Prose Profile

Knowledge-representation reasoners form a mature family spanning two decades: OWL 2 description-logic engines (HermiT, ELK, FaCT++, Pellet) implement W3C standards for ontology reasoning via tableau or consequence-based calculi, while SHACL layers validation constraints atop RDF graphs under closed-world assumption. At the maximalist end, Cyc (since 1984) hand-curates 1.5M+ facts and deploys 1,100+ inference engines working as a community of agents; its CycL representation extends first-order logic with default reasoning and second-order features. These systems dominate biomedical ontologies (SNOMED CT 300k classes), linked data validation, and knowledge-base-driven QA. HermiT emphasizes completeness; ELK specializes in lightweight OWL EL for speed (SNOMED in 4s); SHACL fills the data-quality niche orthogonal to inference. Cyc targets commonsense reasoning and remains proprietary. All are mature, battle-tested production systems with published reasoning guarantees.

## Axis Evaluation

```json
{
  "target": "c_kr_owl",
  "system": "Knowledge-Representation Reasoners (HermiT, ELK, SHACL, Cyc)",
  "category": "Description-Logic & Knowledge-Base Reasoning",
  "axes": {
    "A1_perspectives": {
      "level": "lacks",
      "note": "Stateless reasoners; no named ledgers with write-authority enforcement. Derivations are epiphenomenal to a single fact space.",
      "source": "model-knowledge"
    },
    "A2_provenance": {
      "level": "partial",
      "note": "ELK provides goal-directed tracing; HermiT & Cyc explain derivations. No kernel-emitted why-trace over mutable fact journals.",
      "source": "https://github.com/liveontologies/elk-reasoner/wiki"
    },
    "A3_epistemic_openworld": {
      "level": "partial",
      "note": "OWL makes open-world assumption; SHACL inverts to closed-world for validation. Cyc uses argumentation (pro/con weighing) but not first-class contested state.",
      "source": "model-knowledge"
    },
    "A4_fixpoint_replay": {
      "level": "lacks",
      "note": "Fixpoint semantics via tableau or consequence-based calculi, but not replayed from mutable fact journal. Deterministic only within a static ontology.",
      "source": "model-knowledge"
    },
    "A5_incremental_materialization": {
      "level": "partial",
      "note": "ELK explicitly supports incremental reasoning without bookkeeping. HermiT & Cyc are monolithic; no content-addressed materialization or cache invalidation.",
      "source": "https://github.com/liveontologies/elk-reasoner/wiki"
    },
    "A6_llm_admission_gate": {
      "level": "lacks",
      "note": "No LLM-specific validation layer. Reasoning is purely logical; cannot distinguish agent-attributed claims or attach blocking polarity.",
      "source": "model-knowledge"
    },
    "A7_anytime_budgets": {
      "level": "partial",
      "note": "Cyc uses best-first search with heuristics & micro-theories to bound search. Others (HermiT, ELK) are fully deterministic but lack budget-aware anytime reports.",
      "source": "model-knowledge"
    },
    "A8_typed_inquiry": {
      "level": "lacks",
      "note": "No query-root taxonomy (decide/verify/explain/explore). Reasoning is passive: user poses a query, reasoner exhausts entailment check. No work-queue derivation.",
      "source": "model-knowledge"
    },
    "A9_embeddable_kernel": {
      "level": "partial",
      "note": "HermiT & ELK are embeddable libraries (OWL API, Protégé plugins). Cyc is a large monolithic system. SHACL is a language, not a kernel.",
      "source": "https://www.semanticscholar.org/paper/ELK-Reasoner:-Architecture-and-Evaluation-Kazakov-Kr%C3%B6tzsch/928561aa86321b71db9fcf72b97d6dbe79bbf561"
    },
    "A10_rule_mutation_testing": {
      "level": "lacks",
      "note": "No rule-mutation testing discipline. Ontologies ship without broken-variant suites to validate reasoning coverage.",
      "source": "model-knowledge"
    }
  },
  "adjacent_capabilities": [
    "Tableau/consequence-based calculi: sound & complete reasoning over description-logic fragments at scale.",
    "Open-world vs closed-world semantics toggles: OWL assumes incompleteness; SHACL enforces completeness for validation.",
    "Specialized fragment reasoning: ELK's per-profile optimization (EL, QL, DL) trades expressiveness for speed on real-world ontologies.",
    "Argumentation & default reasoning: Cyc's pro/con weighing & micro-theory scoping to tame commonsense reasoning."
  ],
  "steal": [
    "Incremental reasoning without journal bookkeeping: ELK's techniques for updating conclusions when ontology edges change.",
    "Anytime reasoning budgets: Cyc's best-first + heuristic pruning model for bounding search in open queries.",
    "Tracing as a first-class reasoning service: ELK's goal-directed backward chaining to explain *why* an entailment holds."
  ],
  "positioning": "ROFL fuses Datalog-family fixpoint determinism with epistemic state machines and LLM-gated admission; OWL/SHACL reasoners are sound complete-reasoning engines over static logical languages, while Cyc maximizes real-world coverage via hand-curated facts and heuristic search.",
  "confidence": "high"
}
```

## Sources

- https://www.semanticscholar.org/paper/ELK-Reasoner:-Architecture-and-Evaluation-Kazakov-Kr%C3%B6tzsch/928561aa86321b71db9fcf72b97d6dbe79bbf561
- https://github.com/liveontologies/elk-reasoner/wiki
- https://link.springer.com/article/10.1007/s10817-014-9305-1 (HermiT: An OWL 2 Reasoner, Journal of Automated Reasoning)
- https://arxiv.org/pdf/2507.12286 (SHACL Validation in the Presence of Ontologies)
