# SMT Solvers (Z3, CVC5) — Profile vs ROFL

## Prose Profile

Z3 (Microsoft Research) and CVC5 are industrial-strength satisfiability modulo theories solvers: they determine whether a logical formula is satisfiable given combinations of background theories (arithmetic, bit-vectors, arrays, uninterpreted functions, strings). Z3 is freely available with bindings for .NET, C/C++, Java, Python, OCaml, and WebAssembly; CVC5 is the successor to CVC4, adding industrial-grade proof generation in AletheLF format and proof-based unsat core extraction. Both solvers implement the DPLL(T) framework, integrating SAT reasoning with theory-specific decision procedures. They are mature (Z3 since ~2008), widely used in program verification, security analysis, planning, and formal methods. Core capability: given constraints, return SAT (with model) or UNSAT (with proof/core), or UNKNOWN. Incremental solving via push/pop supports constraint sets modified across solver sessions, with proof generation increasingly central to trust and diagnosis in safety-critical domains.

```json
{"target": "c_smt",
 "system": "Z3 / CVC5",
 "category": "Satisfiability Modulo Theories (SMT) Solvers",
 "axes": {
   "A1_perspectives": {"level": "lacks", "note": "SMT solvers take formulas as atomic input; no named ledgers or write-authority model.", "source": "model-knowledge"},
   "A2_provenance": {"level": "partial", "note": "CVC5/Z3 produce proofs (LFSC, natural-deduction) and unsat cores post-hoc, not as kernel-emitted derivation metadata during solving.", "source": "https://www.researchgate.net/publication/359546891_cvc5_A_Versatile_and_Industrial-Strength_SMT_Solver"},
   "A3_epistemic_openworld": {"level": "partial", "note": "Return SAT/UNSAT/UNKNOWN; unknown is recognized but driven by solver capability, not evidence-derived claim status.", "source": "model-knowledge"},
   "A4_fixpoint_replay": {"level": "partial", "note": "Deterministic (same formula→same result), but no journal-based replay; state is internal, ephemeral.", "source": "https://github.com/Z3Prover/z3/discussions/5046"},
   "A5_incremental_materialization": {"level": "lacks", "note": "Incremental solving via push/pop but no content-hash-keyed file materialization; state is in-memory.", "source": "https://link.springer.com/chapter/10.1007/978-3-031-38499-8_3"},
   "A6_llm_admission_gate": {"level": "lacks", "note": "SMT solvers are pure constraint engines; no LLM integration, untrusted writer gates, or agent admission logic.", "source": "model-knowledge"},
   "A7_anytime_budgets": {"level": "partial", "note": "Timeouts available but not anytime budgets with per-tick epistemic reporting; run-to-completion or timeout.", "source": "model-knowledge"},
   "A8_typed_inquiry": {"level": "lacks", "note": "Single inquiry type: satisfiability. No work queue derived from epistemic state or typed intent frontier.", "source": "model-knowledge"},
   "A9_embeddable_kernel": {"level": "partial", "note": "Embeddable with language bindings (Python, C++, etc.) but carries external deps (theory solvers, algorithms); not zero-dependency.", "source": "https://docs.rs/z3/latest/z3/struct.Solver.html"},
   "A10_rule_mutation_testing": {"level": "lacks", "note": "Monolithic algorithms, not rule packs; no mutation testing discipline for reasoning rules.", "source": "model-knowledge"}
 },
 "adjacent_capabilities": [
   "Decidable satisfiability checking over rich theories (linear/nonlinear arithmetic, arrays, datatypes)",
   "Proof certificates and UNSAT core extraction for diagnosis and verification",
   "Theory-specific decision procedures (algebraic coverings, cylindrical decomposition)",
   "Industrial automation for constraint-heavy verification and synthesis"
 ],
 "steal": [
   "Proof-based reasoning: emit derivation certificates alongside conclusions for trust and diagnosis.",
   "Theory-specific decision procedures: plug specialized solvers for high-leverage domains.",
   "Incremental solving architecture: support efficient constraint set modification and backtracking."
 ],
 "positioning": "SMT solvers are single-purpose constraint oracles with no epistemic model; ROFL is a multi-perspective reasoning engine where claims are first-class epistemic entities derived from evidence.",
 "confidence": "high"}
```

## Sources

- [Z3: an efficient SMT solver — Microsoft Research](https://www.microsoft.com/en-us/research/publication/z3-an-efficient-smt-solver/)
- [CVC5: A Versatile and Industrial-Strength SMT Solver — NSF Repository](https://par.nsf.gov/biblio/10388056-cvc5-versatile-industrial-strength-smt-solver)
- [On Incremental Pre-processing for SMT — Springer](https://link.springer.com/chapter/10.1007/978-3-031-38499-8_3)
- [Z3 Solver Rust docs](https://docs.rs/z3/latest/z3/struct.Solver.html)
- [Z3 GitHub Discussion: push and pop](https://github.com/Z3Prover/z3/discussions/5046)
- [Computing Small Unsatisfiable Cores in Satisfiability Modulo Theories](https://arxiv.org/pdf/1401.3878)
- [A General Approach for SMT Proof Skeletons — Springer](https://link.springer.com/chapter/10.1007/978-3-032-32589-1_10)
