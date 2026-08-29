# Prolog Family Profile

## Prose Profile

Prolog is a logic programming language built on first-order logic and SLD resolution, foundational to symbolic AI and automated reasoning. **SWI-Prolog** is the dominant industrial implementation (40+ years mature, widely deployed), offering multithreading, constraint logic programming, web frameworks, and bindings to C/Java/Python. **Scryer Prolog**, a modern ISO-compliant implementation in Rust (started 2017), pursues standards purity with integrated constraint libraries (CLP(B), CLP(ℤ)), cryptographic primitives, and WebAssembly support. Both serve knowledge representation, constraint solving, symbolic AI, and academic research. SWI-Prolog dominates production; Scryer targets correctness-critical and research workloads. Prolog systems reason over a global predicate database via proof search, offering Turing-completeness and direct logical inference—a fundamentally different substrate than Datalog-family materialization systems.

## Evaluation

```json
{
  "target": "c_prolog",
  "system": "Prolog (SWI-Prolog, Scryer Prolog)",
  "category": "Logic Programming",
  "axes": {
    "A1_perspectives": {
      "level": "lacks",
      "note": "Single global predicate database; modules namespace but do not track write-authority or emit forged-write audits.",
      "source": "model-knowledge"
    },
    "A2_provenance": {
      "level": "partial",
      "note": "Can generate proof traces via debugger/tracer; provenance is introspectable but not kernel-emitted as first-class fact alongside derivations.",
      "source": "model-knowledge"
    },
    "A3_epistemic_openworld": {
      "level": "lacks",
      "note": "Prolog assumes Closed World: not provable = false. Unknown and false are identical; no contested state.",
      "source": "model-knowledge"
    },
    "A4_fixpoint_replay": {
      "level": "partial",
      "note": "SLD resolution is deterministic and fixpoint-based; tabling (SWI, Scryer) improves termination. But proof search ≠ materialization; replay requires re-execution.",
      "source": "https://news.ycombinator.com/item?id=28966133"
    },
    "A5_incremental_materialization": {
      "level": "lacks",
      "note": "In-memory reasoning engine; no built-in content-hash-keyed materialization to disk or incremental rebuild from fact journals.",
      "source": "model-knowledge"
    },
    "A6_llm_admission_gate": {
      "level": "lacks",
      "note": "No concept of untrusted agent ledgers or admission gates; predates LLM-era reasoning architectures.",
      "source": "model-knowledge"
    },
    "A7_anytime_budgets": {
      "level": "lacks",
      "note": "Supports depth/time limits and can timeout; lacks designed anytime algorithm with stagnation detection and epistemic reports at each tick.",
      "source": "model-knowledge"
    },
    "A8_typed_inquiry": {
      "level": "lacks",
      "note": "General-purpose logic engine; no built-in typed inquiry roots or derived work-queue based on epistemic state.",
      "source": "model-knowledge"
    },
    "A9_embeddable_kernel": {
      "level": "lacks",
      "note": "SWI-Prolog requires GMP and external libraries; Scryer (Rust) is modern but both are full systems, not zero-dep embedded kernels.",
      "source": "https://www.freshports.org/lang/scryer-prolog/"
    },
    "A10_rule_mutation_testing": {
      "level": "lacks",
      "note": "Testing frameworks exist; rule-mutation-testing as a standing discipline is not built into Prolog systems.",
      "source": "model-knowledge"
    }
  },
  "adjacent_capabilities": [
    "Constraint Logic Programming (CLP(FD), CLP(B), CLP(ℤ)) for structured search over discrete domains",
    "Tabling/memoization for guaranteed termination and avoiding infinite loops in recursive predicates",
    "Direct logical inference: reasoning happens in the language itself, not reified as mutable facts",
    "Proof tracing and debugging infrastructure integrated into the runtime",
    "Large ecosystem: web servers, multithreading, RDF/Linked Data, cryptographic libraries"
  ],
  "steal": [
    "Tabling: systematize memoization and termination guarantees for recursive inquiry work",
    "Proof tracing as first-class kernel output: emit why-traces for all derived conclusions, not just on demand",
    "Constraint integration: encode search-space reduction declaratively, not just in imperative inquiry heuristics"
  ],
  "positioning": "Prolog is a Turing-complete proof-search engine for symbolic reasoning; ROFL is a stratified Datalog materialization engine with epistemic layers and LLM-agent coordination—complementary substrates: one for open-ended logical inference, one for bounded, audited fact derivation.",
  "confidence": "high"
}
```

## Source Attribution

- SWI-Prolog capabilities and architecture: [SWI-Prolog features](https://www.swi-prolog.org/features.html), [SWI-Prolog Directions](https://www.swi-prolog.org/Directions.html)
- Scryer Prolog design and ISO conformance: [Scryer Prolog GitHub](https://github.com/mthom/scryer-prolog), [FreshPorts Scryer entry](https://www.freshports.org/lang/scryer-prolog/)
- Architectural comparison: Model knowledge (Prolog semantics, CWA vs OWA, SLD resolution fundamentals)
