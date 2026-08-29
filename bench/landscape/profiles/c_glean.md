# Glean: Code Facts Infrastructure Profile

Glean is Meta's open-source code indexing and fact-collection system for large-scale semantic code analysis. Released publicly in 2021 after years of internal use, it powers Meta's code search, code browsing, and documentation generation tools. Glean collects fine-grained code facts (definitions, references, types, call relationships, inheritance hierarchies) through language-specific indexers and stores them in an efficient RocksDB backend. It exposes facts via Angle, a Datalog-style query language, enabling developers and tools to ask complex questions about code structure and dependencies. Glean supports C++, Python, Hack, Haskell, JavaScript/Flow natively, plus Go, Rust, Java, TypeScript via SCIP/LSIF indexing format. The system is designed for scale—Meta uses it internally across massive polyglot codebases—and emphasizes immutable, schema-validated facts stored in a DAG structure. Maturity is production-grade; adoption spans large enterprises and open-source projects.

```json
{
  "target": "c_glean",
  "system": "Glean",
  "category": "code facts infrastructures",
  "axes": {
    "A1_perspectives": {
      "level": "lacks",
      "note": "Facts are collected and stored but no ledger-based write-authority enforcement; no forged/audit derivation.",
      "source": "model-knowledge"
    },
    "A2_provenance": {
      "level": "partial",
      "note": "Stores facts with schemas in DAG structure; Angle queries can traverse dependencies, but no kernel-emitted derivation why-traces.",
      "source": "https://github.com/facebookincubator/Glean"
    },
    "A3_epistemic_openworld": {
      "level": "lacks",
      "note": "Glean is a static fact store, not an epistemic reasoner; claims are facts or absent, not contested/supported/refuted states.",
      "source": "model-knowledge"
    },
    "A4_fixpoint_replay": {
      "level": "partial",
      "note": "Datalog-style queries via Angle; deterministic on stored facts, but explicit stratified-negation fixpoint and replay from journal not evident.",
      "source": "https://github.com/facebookincubator/Glean"
    },
    "A5_incremental_materialization": {
      "level": "lacks",
      "note": "RocksDB storage with efficient indexing; no evidence of content-hash keying or re-materialization from immutable fact journal.",
      "source": "model-knowledge"
    },
    "A6_llm_admission_gate": {
      "level": "lacks",
      "note": "No LLM integration or untrusted writer admission layer; facts come from language indexers only.",
      "source": "model-knowledge"
    },
    "A7_anytime_budgets": {
      "level": "lacks",
      "note": "Glean is a static indexing and query system, not an interactive work loop with budgets or anytime epistemic reporting.",
      "source": "model-knowledge"
    },
    "A8_typed_inquiry": {
      "level": "lacks",
      "note": "Query-driven system; users issue Angle queries, not system-generated typed inquiry frontiers (decide/verify/explore).",
      "source": "model-knowledge"
    },
    "A9_embeddable_kernel": {
      "level": "lacks",
      "note": "Full distributed system: indexers, RocksDB backend, server infrastructure; not embeddable or zero-dependency.",
      "source": "https://github.com/facebookincubator/Glean"
    },
    "A10_rule_mutation_testing": {
      "level": "lacks",
      "note": "No evidence of mutation-test discipline on indexer rules or Angle query definitions.",
      "source": "model-knowledge"
    }
  },
  "adjacent_capabilities": [
    "Multi-language indexing with native C++, Python, Hack, Haskell, JS/Flow plus SCIP/LSIF support",
    "Scalable RocksDB-backed storage for massive codebases at production scale",
    "Angle: mature Datalog-style query language with real-world adoption",
    "Pluggable language-specific indexer architecture for fact extraction"
  ],
  "steal": [
    "Architectural separation of fact collection (indexers) from fact querying (Angle DSL)",
    "Immutable schema-validated facts in DAG form as a spine for semantic reasoning",
    "Incremental indexing strategy to avoid re-scanning unchanged source"
  ],
  "positioning": "ROFL is an LLM-agent epistemic reasoner with provenance tracking and human/agent separation; Glean is a static semantic fact store optimized for multi-language code indexing and efficient querying at scale—complementary, not competitive.",
  "confidence": "medium"
}
```

---

### Sources
- https://github.com/facebookincubator/Glean
- https://x.com/MetaOpenSource/status/1920147520560202163
