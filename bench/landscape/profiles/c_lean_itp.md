# Interactive Theorem Provers: Lean 4, Coq/Rocq, Isabelle

Lean 4 is a dependently-typed interactive theorem prover and functional programming language combining a small trusted kernel with metaprogramming for proof automation; Coq/Rocq (the renamed Coq) offers similar capabilities via Calculus of Inductive Constructions; Isabelle provides a framework for multiple object logics with strong automation. All three are industrial-strength production systems used in mathematics (Lean via mathlib4), systems verification (Rocq), and foundational proofs (Isabelle). Maturity is high: Lean 4 reached production in 2024, Rocq is actively developed with two decades of history, Isabelle has a strong academic/industry user base. Their niche is certified formal proof, not epistemic reasoning or working memory.

```json
{"target": "c_lean_itp",
 "system": "Lean 4 / Coq-Rocq / Isabelle (ITP family)",
 "category": "Interactive theorem provers / proof assistants",
 "axes": {
   "A1_perspectives": {"level": "lacks", "note": "No named ledgers or write-authority enforcement; proofs are monolithic terms. No perspective/provenance distinction.", "source": "model-knowledge"},
   "A2_provenance": {"level": "partial", "note": "Proof terms encode derivation implicitly; typed kernel tracks type checking, but no explicit why-trace mechanism like ROFL's derived_by.", "source": "model-knowledge"},
   "A3_epistemic_openworld": {"level": "lacks", "note": "Closed-world: proven, refuted, or undecided. No contested state; claims resolve to true/false/unknown, not evidence-derived status.", "source": "model-knowledge"},
   "A4_fixpoint_replay": {"level": "lacks", "note": "Tactics and proof search are imperative; no stratified-negation Datalog fixpoint. Replaying requires re-executing tactic sequences, not re-deriving facts.", "source": "model-knowledge"},
   "A5_incremental_materialization": {"level": "lacks", "note": "No content-hash-keyed materialization or incremental cache. Proofs rebuild from source, not from immutable fact stores.", "source": "model-knowledge"},
   "A6_llm_admission_gate": {"level": "lacks", "note": "ITPs can consume LLM-generated proof sketches but lack a validated, attributed admission gate or agent ledger; claims enter the trusted kernel directly.", "source": "model-knowledge"},
   "A7_anytime_budgets": {"level": "partial", "note": "Tactic timeouts and search depth limits exist, but no bounded best-first loop or epistemic report at every tick. Work is explicit tactic sequence, not anytime queue.", "source": "model-knowledge"},
   "A8_typed_inquiry": {"level": "lacks", "note": "No typed inquiry roots (decide/verify/explain); proof goals are untyped obligations. No frontier of derived intents; work is manual or heuristic-driven tactic selection.", "source": "model-knowledge"},
   "A9_embeddable_kernel": {"level": "has", "note": "All three have small trusted kernels (type checking, reduction). Lean 4 and Rocq embed well; Isabelle's ML automation is less minimal but kernel is sound.", "source": "model-knowledge"},
   "A10_rule_mutation_testing": {"level": "lacks", "note": "No standing practice of shipping tactic/automation packs with mutation tests. Proofs and tactics verified manually, not via systematic break-and-flip.", "source": "model-knowledge"}
 },
 "adjacent_capabilities": ["dependently-typed proof terms as executable specifications", "extensible metaprogramming for automation (tactics, automation procedures)", "deep library ecosystems for mathematics and CS formalization", "interactive refinement of proof goals in real-time IDEs"],
 "steal": ["stratified-negation fixpoint for deterministic, replayable proof search; epistemic-openworld status (contested claims block decisions rather than resolving by tactic order)", "attributed admission gates for untrusted proof generators (LLM agents, automated search)"],
 "positioning": "ITPs certify individual proofs through type checking; ROFL derives conclusions from facts under epistemic uncertainty, admitting LLM agents via validated gates and replaying via stratified fixpoint.",
 "confidence": "high"}
```
