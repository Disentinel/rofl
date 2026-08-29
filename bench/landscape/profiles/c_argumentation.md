# Computational Argumentation Frameworks

## Prose Profile

Computational argumentation comprises a family of formal systems for modeling disputes between agents through abstract and structured argument representations. The field is anchored by Dung's Abstract Argumentation Frameworks (AAF, 1995), which represent arguments as nodes and attack relations as edges, with semantics (grounded, preferred, stable, complete) defining acceptable argument sets. ASPIC+ extends this with structured arguments built from strict and defeasible inference rules, premises, and preferences for resolving conflicts. Carneades formalizes argumentation as labeled graphs with proof standards, burden of proof, and explicit support/attack distinctions. Implementations include ASPARTIX (using Answer Set Programming), Tweety (comprehensive libraries for multiple formalisms), and various SAT/QBF-based solvers. The field is mature (30+ years), widely used in legal AI, policy analysis, and AI explainability, with active international competitions (ICCMA) and standardization efforts.

## Axes Assessment

```json
{
  "target": "c_argumentation",
  "system": "Computational Argumentation Frameworks (Dung/ASPIC+/Carneades)",
  "category": "Formal reasoning framework family",
  "axes": {
    "A1_perspectives": {
      "level": "lacks",
      "note": "No named ledgers or write-authority enforcement; arguments exist in unified abstract space with no perspective isolation or provenance tracking by ledger.",
      "source": "model-knowledge"
    },
    "A2_provenance": {
      "level": "partial",
      "note": "Recent work discusses provenance of stable solutions, but standard AAF/ASPIC+/Carneades systems do not emit kernel-level why-traces for derivations; solvers return extensions without mechanical derivation trails.",
      "source": "https://dl.acm.org/doi/full/10.1145/3736229.3736270"
    },
    "A3_epistemic_openworld": {
      "level": "partial",
      "note": "Carneades models proof standards and burden of proof; Dung semantics define acceptable vs. unacceptable arguments. However, state is not open-world; unknown is implicit in unacceptable, not explicit; contested (mutual attack) is modeled but not a first-class decision-blocking state.",
      "source": "https://www.sciencedirect.com/science/article/pii/S0004370207000677"
    },
    "A4_fixpoint_replay": {
      "level": "partial",
      "note": "ASPARTIX uses ASP (Datalog-based), which is deterministic and fixpoint-based. However, no incremental replay from fact journals; each invocation recomputes from scratch with no journal-based re-materialization.",
      "source": "https://www.dbai.tuwien.ac.at/research/argumentation/aspartix/"
    },
    "A5_incremental_materialization": {
      "level": "lacks",
      "note": "No content-addressed file storage, no incremental rebuilding, no unchanged-source skipping. Systems recompute extensions on each invocation with no caching discipline.",
      "source": "model-knowledge"
    },
    "A6_llm_admission_gate": {
      "level": "lacks",
      "note": "No untrusted-agent model or admission gates. Argumentation frameworks assume all input is trusted; no mechanism for attributing or validating assertions from external agents.",
      "source": "model-knowledge"
    },
    "A7_anytime_budgets": {
      "level": "lacks",
      "note": "Solvers compute complete extensions under requested semantics; no bounded work loops, stagnation detection, or anytime epistemic reports. All-or-nothing computation model.",
      "source": "model-knowledge"
    },
    "A8_typed_inquiry": {
      "level": "lacks",
      "note": "No inquiry types (decide/verify/explore/monitor) or typed intents. Frameworks compute extensions; work queue is not derived from epistemic state or inquiry type.",
      "source": "model-knowledge"
    },
    "A9_embeddable_kernel": {
      "level": "partial",
      "note": "Tweety has lightweight Python libraries. However, many systems (ASPARTIX, LabSAT) require external solvers (ASP solver, SAT solver). Not zero-dependency embeddable kernels.",
      "source": "https://www.semanticscholar.org/paper/The-Formal-Argumentation-Libraries-of-Tweety-Thimm/46c6780c933dfc59e3223d0333d8dcf45d0d1bd9"
    },
    "A10_rule_mutation_testing": {
      "level": "lacks",
      "note": "No concept of rule packs or mutation testing discipline. Frameworks define semantics mathematically; no standing green variant with deliberate breaks to validate correctness.",
      "source": "model-knowledge"
    }
  },
  "adjacent_capabilities": [
    "Formal semantics for attack/support relations with multiple extension semantics (grounded, preferred, stable, complete)",
    "Structured argumentation: arguments as inference trees with strict/defeasible rules, premises, and conclusions (ASPIC+)",
    "Explicit burden of proof and proof standards with dialogical aspects (Carneades)",
    "Preference-based and value-based conflict resolution between competing arguments",
    "Argument mapping and visual representation of dispute structure"
  ],
  "steal": [
    "Formal semantics for conflict resolution: the theory of acceptable extensions under multiple criteria mirrors how ROFL could formalize contested state and defeasible conclusions",
    "Structured argumentation with premises/inferences/conclusions: richer argument structure than flat facts enables hierarchical reasoning and attack at multiple levels",
    "Explicit burden of proof: formal treatment of who must provide evidence and how strong that evidence must be, orthogonal to open-world epistemic state"
  ],
  "positioning": "ROFL is a mutable-fact Datalog engine with incremental, journaled replay and LLM admission gates; computational argumentation is a static-input, complete-extension solver family with rich formal semantics for acceptable conclusions but no incremental replay, write authority, or untrusted-agent model.",
  "confidence": "high"
}
```

## Sources

- [The Formal Argumentation Libraries of Tweety](https://www.semanticscholar.org/paper/The-Formal-Argumentation-Libraries-of-Tweety-Thimm/46c6780c933dfc59e3223d0333d8dcf45d0d1bd9)
- [ASPARTIX - Answer Set Programming Argumentation Reasoning Tool](https://www.dbai.tuwien.ac.at/research/argumentation/aspartix/)
- [The ASPIC+ framework for structured argumentation: a tutorial](https://www.tandfonline.com/doi/abs/10.1080/19462166.2013.869766)
- [The Carneades Model of Argument and Burden of Proof](https://www.sciencedirect.com/science/article/pii/S0004370207000677)
- [Choices and their Provenance: Explaining Stable Solutions of Abstract Argumentation Frameworks](https://dl.acm.org/doi/full/10.1145/3736229.3736270)
- [System Descriptions of the First International Competition on Computational Models of Argumentation](https://arxiv.org/pdf/1510.05373)
