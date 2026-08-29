# CodeQL Profile

CodeQL (acquired by GitHub from Semmle in 2019) is an industrial static code analysis platform that converts source code into a queryable relational database. It extracts semantic representations—abstract syntax trees, control flow graphs, data flow graphs—into a queryable format, then uses QL (a SQL-like query language) to find vulnerabilities, code quality issues, and security patterns. CodeQL supports 11+ languages (C/C++, C#, Go, Java, Kotlin, JavaScript, Python, Ruby, TypeScript, Swift) and has identified 400+ CVEs through variant analysis. It is deeply integrated into GitHub Advanced Security and widely used in both commercial and open-source security workflows. Maturity: production, industry-standard; Users: Fortune 500 enterprises, security researchers, open-source maintainers.

```json
{
  "target": "c_codeql",
  "system": "CodeQL",
  "category": "Semantic static analysis database",
  "axes": {
    "A1_perspectives": {
      "level": "lacks",
      "note": "No ledger-based perspective system; facts extracted from code but no write-authority or forgery detection.",
      "source": "model-knowledge"
    },
    "A2_provenance": {
      "level": "partial",
      "note": "Query results are deterministic; static provenance in QL text. No kernel-emitted derivation traces over mutable facts.",
      "source": "model-knowledge"
    },
    "A3_epistemic_openworld": {
      "level": "lacks",
      "note": "Pattern-matching engine; no epistemic states (supported/refuted/contested/unknown) or evidence-based reasoning.",
      "source": "model-knowledge"
    },
    "A4_fixpoint_replay": {
      "level": "partial",
      "note": "Deterministic, reproducible (same code+queries yield same results). Not Datalog fixpoint; uses QL (first-order logic + aggregation).",
      "source": "model-knowledge"
    },
    "A5_incremental_materialization": {
      "level": "partial",
      "note": "Database extracted once, reused for queries. Not content-hash keyed; caching strategy rather than incremental rebuild.",
      "source": "model-knowledge"
    },
    "A6_llm_admission_gate": {
      "level": "lacks",
      "note": "Static analysis tool; no agent writer, no untrusted-writer isolation, no polarity-checking on findings.",
      "source": "model-knowledge"
    },
    "A7_anytime_budgets": {
      "level": "partial",
      "note": "Resource budgets (query timeout, memory). No anytime epistemic reporting or stagnation detection.",
      "source": "model-knowledge"
    },
    "A8_typed_inquiry": {
      "level": "lacks",
      "note": "Manual query writing; no typed inquiry roots that auto-generate work queues from epistemic state.",
      "source": "model-knowledge"
    },
    "A9_embeddable_kernel": {
      "level": "partial",
      "note": "Has CLI and libraries; database extraction is heavyweight. Not a minimal zero-dependency kernel.",
      "source": "model-knowledge"
    },
    "A10_rule_mutation_testing": {
      "level": "lacks",
      "note": "No standard discipline shipping mutation tests with query packs; not a built-in practice.",
      "source": "model-knowledge"
    }
  },
  "adjacent_capabilities": [
    "Multi-language semantic extraction (11+ languages unified)",
    "Sophisticated taint and data-flow analysis",
    "Mature security vulnerability detection ecosystem (400+ CVEs)",
    "Variant analysis (finding similar vulnerabilities across codebases)",
    "GitHub Advanced Security platform integration"
  ],
  "steal": [
    "Multi-language semantic extraction pipeline and unified queryable representation",
    "Mature taint/data-flow analysis patterns and optimizations",
    "Industrial-grade database indexing for large codebases"
  ],
  "positioning": "CodeQL is industrial semantic static analysis via queryable code databases; ROFL is agent-aware epistemic reasoning over provenance-traced derivations.",
  "confidence": "high"
}
```
