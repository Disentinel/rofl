# LLM x Formal Hybrids Profile

## Overview

LLM x formal hybrids integrate language models with formal reasoning systems in two distinct architectural patterns: *solver pipelines* (Logic-LM, LINC, AlphaProof) that translate NL problems to formal specifications and invoke verifying solvers, and *structured memory systems* (MemGPT/Letta, Zep/Graphiti) that layer persistent, temporal knowledge graphs as an LLM's external working memory. These represent the closest competitive neighborhood to ROFL — they attempt to ground LLM reasoning in formal structure, but through runtime adaptation (memory) or external orchestration (solvers) rather than through a fixed-point derivation kernel. Maturity ranges from academic prototypes (Logic-LM, 2023) to deployed agent platforms (Letta, 2024; Zep, 2025). Adoption spans research labs (AlphaProof at DeepMind), startups (Letta, Zep), and enterprises seeking agentic reasoning that retains memory and formal grounding.

## Axiom Ratings

```json
{
  "target": "c_llm_hybrids",
  "system": "LLM x Formal Hybrids (Logic-LM, LINC, AlphaProof; MemGPT/Letta, Zep/Graphiti)",
  "category": "Neuro-symbolic agent reasoning",
  "axes": {
    "A1_perspectives": {
      "level": "partial",
      "note": "Solver pipelines (Logic-LM) assign facts to agent/symbolic ledgers; memory systems (Letta) separate in-context vs archival tiers. Write authority not enforced; no forgery detection.",
      "source": "https://arxiv.org/pdf/2305.12295"
    },
    "A2_provenance": {
      "level": "partial",
      "note": "AlphaProof emits Lean proof state traces; Logic-LM shows solver derivations. But provenance is not kernel-level: it's library output, not systematic why-trace over mutable facts.",
      "source": "https://arxiv.org/html/2605.22763v1"
    },
    "A3_epistemic_openworld": {
      "level": "lacks",
      "note": "LLMs assign confidence scores; solvers return satisfiable/unsat. No first-class contested state blocking decisions; unknown defaults to retry or refusal.",
      "source": "model-knowledge"
    },
    "A4_fixpoint_replay": {
      "level": "lacks",
      "note": "LLMs are non-deterministic; no stratified negation. Memory systems accumulate state incrementally but not from a deterministic fact journal.",
      "source": "model-knowledge"
    },
    "A5_incremental_materialization": {
      "level": "lacks",
      "note": "Solver pipelines re-invoke on each call; memory systems persist to vector DBs or graph stores but not via content-hash incremental rebuilds.",
      "source": "https://help.getzep.com/graph-overview"
    },
    "A6_llm_admission_gate": {
      "level": "partial",
      "note": "AlphaProof gates proofs through Lean; Logic-LM gates through solver verification. Memory systems (Letta) run entirely in-LLM with memory-bound validation only.",
      "source": "https://www.letta.com/blog/letta-v1-agent/"
    },
    "A7_anytime_budgets": {
      "level": "partial",
      "note": "Solver pipelines implement search budgets (timeout, proof attempts). Memory systems lack anytime epistemic reporting; they serve best-effort retrieval only.",
      "source": "https://arxiv.org/html/2605.22763v1"
    },
    "A8_typed_inquiry": {
      "level": "lacks",
      "note": "Both subfamilies execute agent loops but generate no typed inquiry frontiers (verify, clarify, challenge). Work items are implicit in the LLM's loop.",
      "source": "model-knowledge"
    },
    "A9_embeddable_kernel": {
      "level": "partial",
      "note": "Solver pipelines (Logic-LM) compose modularly but depend on external solvers. Letta is a framework; Zep is a service. None are zero-dependency kernels.",
      "source": "https://medium.com/@piyush.jhamb4u/stateful-ai-agents-a-deep-dive-into-letta-memgpt-memory-models-a2ffc01a7ea1"
    },
    "A10_rule_mutation_testing": {
      "level": "lacks",
      "note": "No mutation discipline. Solver correctness rests on external verifiers; memory systems have no rule pack to mutate.",
      "source": "model-knowledge"
    }
  },
  "adjacent_capabilities": [
    "Temporal reasoning: Zep/Graphiti track entity relationships and fact evolution over time, with historical provenance per edge.",
    "Runtime learning: MemGPT/Letta self-edit memory via LLM decisions; agents adapt internal state without retraining.",
    "Formal solver integration: Logic-LM/AlphaProof compose SMT and proof solvers as verifying oracles with structured feedback loops.",
    "Memory hierarchy: Letta's core/archival pattern manages context windows as a resource; LLM operates on in-memory core while delegating to persistent storage.",
    "Agent loop feedback: AlphaProof's multi-agent search over proof states, with Lean error traces fed back to guide next attempts."
  ],
  "steal": [
    "Temporal knowledge graphs with time-stamped edges and entity evolution: Zep's model of tracking when facts become/cease true is orthogonal to ROFL's perspectives and would enrich temporal reasoning.",
    "Structured solver-as-oracle pattern: Logic-LM's three-stage (formulate→solve→interpret) pipeline is more modular than monolithic translation.",
    "Anytime best-first search with early stopping: AlphaProof's parallel proof attempts and stagnation detection inform anytime epistemic budgets."
  ],
  "positioning": "ROFL is a fixed-point derivation kernel with mechanical provenance and epistemic stratification; LLM x formal hybrids are runtime-adaptive orchestrators that pair LLM agents with formal verification or persistent memory, sacrificing determinism and provenance for flexibility and learning.",
  "confidence": "high"
}
```

## Sources

- [Logic-LM paper](https://arxiv.org/pdf/2305.12295)
- [LOGIC-LM++ Multi-Step Refinement](https://arxiv.org/pdf/2407.02514)
- [AlphaProof: Formal Proof Search](https://arxiv.org/html/2605.22763v1)
- [Letta Agent Memory](https://www.letta.com/blog/agent-memory/)
- [Letta v1 Architecture](https://www.letta.com/blog/letta-v1-agent/)
- [Zep Documentation](https://help.getzep.com/graph-overview)
- [Zep Temporal Knowledge Graph](https://arxiv.org/abs/2501.13956)
- [Graphiti Blog](https://blog.getzep.com/graphiti-knowledge-graphs-for-agents/)
