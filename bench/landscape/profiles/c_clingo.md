# Clingo: Answer Set Programming Solver (Potassco)

Clingo is the integrated grounder-solver system from the Potsdam Answer Set Solving Collection (Potassco). It combines gringo (grounder) and clasp (conflict-driven solver) into a monolithic tool for Answer Set Programming. Clingo models combinatorial problems as logic programs with negation-as-failure and choice rules, then computes stable models representing solutions. Mature and actively maintained (v5.4+), with wide adoption in configuration, scheduling, diagnosis, and resource allocation. Embeddable via Python API and C++ core; supported by ecosystem tools (Clorm ORM, Clingraph visualization, Clinguin interactive UI).

```json
{
  "target": "c_clingo",
  "system": "Clingo",
  "category": "Answer Set Programming (ASP) Solver",
  "axes": {
    "A1_perspectives": {
      "level": "lacks",
      "note": "No named ledgers or write-authority enforcement. Input is logic program + facts; no provenance tracking of fact sources or authority separation.",
      "source": "model-knowledge"
    },
    "A2_provenance": {
      "level": "partial",
      "note": "Core clingo emits answer sets but not derivation traces. xclingo extension adds causal-graph justifications via annotations. Not kernel-emitted.",
      "source": "https://github.com/bramucas/xclingo"
    },
    "A3_epistemic_openworld": {
      "level": "lacks",
      "note": "Answer set semantics yields true/false in each stable model; all models presented but no epistemic class (supported/contested/unknown). Not open-world.",
      "source": "model-knowledge"
    },
    "A4_fixpoint_replay": {
      "level": "has",
      "note": "Deterministic stratified-negation fixpoint semantics. Same facts + rules = same answer sets. Multi-shot solving enables replay by rerunning grounding/solving.",
      "source": "https://arxiv.org/pdf/1705.09811"
    },
    "A5_incremental_materialization": {
      "level": "lacks",
      "note": "No content-hash keyed materialization or selective re-extraction. Each query regrounds and resolves entire program; no unchanged-source caching.",
      "source": "model-knowledge"
    },
    "A6_llm_admission_gate": {
      "level": "lacks",
      "note": "Clingo is a declarative solver, not designed around LLM agents. No untrusted writer gates, ledger separation, or agent attribution framework.",
      "source": "model-knowledge"
    },
    "A7_anytime_budgets": {
      "level": "partial",
      "note": "Asynchronous solving and thread support available; can interrupt mid-solve. No explicit budgets, stagnation detection, or anytime epistemic reports.",
      "source": "model-knowledge"
    },
    "A8_typed_inquiry": {
      "level": "lacks",
      "note": "No inquiry-root system or work-queue generation from epistemic state. Users write rules; solver computes answer sets. Query-driven, not inquiry-driven.",
      "source": "model-knowledge"
    },
    "A9_embeddable_kernel": {
      "level": "partial",
      "note": "Embeddable via Python API and C++ core. Requires clingo library; not zero-dependency. Heavier than bare Node/Bun model.",
      "source": "https://potassco.org/clingo/python-api/5.4/"
    },
    "A10_rule_mutation_testing": {
      "level": "partial",
      "note": "Testing tools exist (ASPIDE unit testing, HARVEY random testing) but no systematic mutation-test discipline with standing green variants.",
      "source": "https://arxiv.org/pdf/1007.3223"
    }
  },
  "adjacent_capabilities": [
    "Answer set semantics with choice rules (non-determinism, branching)",
    "Integer constraint domains (clingcon extension)",
    "Theory solving for custom inference",
    "Optimization framework (minimize/maximize statements)",
    "Multi-shot incremental grounding and solving",
    "Rich ecosystem (Clorm ORM, Clingraph visualization, Clinguin UI)"
  ],
  "steal": [
    "Answer set semantics with choice operators for modeling non-deterministic decisions and branching search",
    "Multi-shot incremental paradigm: split programs, interleave grounding/solving, resume state",
    "Constraint domain integration: pluggable theory solvers for domain-specific reasoning"
  ],
  "positioning": "Clingo is a mature, performant solver for modeling and solving combinatorial problems declaratively via logic programs; ROFL is a Datalog-family engine for epistemically-structured reasoning within LLM coding workflows.",
  "confidence": "high"
}
```

Sources consulted:
- https://github.com/potassco/clingo
- https://github.com/bramucas/xclingo
- https://arxiv.org/pdf/1705.09811
- https://arxiv.org/pdf/1405.3694
- https://potassco.org/clingo/python-api/5.4/
- https://arxiv.org/pdf/1007.3223
