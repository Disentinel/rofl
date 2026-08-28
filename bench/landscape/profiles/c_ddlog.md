# DDlog & Differential Dataflow Profile

Differential Datalog (DDlog) is a declarative programming language for incremental computation that compiles to Differential Dataflow, a Rust-based framework built on Timely Dataflow for distributed streaming analytics. Materialize is the commercial flagship of differential dataflow, a cloud-native streaming database that maintains SQL views incrementally. All three systems address incremental view maintenance over relational data, enabling sub-millisecond latency updates as input changes arrive. DDlog targets single-machine in-memory databases and cloud management systems; Differential Dataflow provides a lower-level programming model for data-parallel computation; Materialize offers SQL front-end to differential computation. Maturity: DDlog was archived by VMware in 2021 after proving concepts but facing production scaling challenges; Differential Dataflow remains actively maintained; Materialize is commercially deployed since 2019.

```json
{"target": "c_ddlog",
 "system": "Differential Datalog / Differential Dataflow / Materialize",
 "category": "incremental-view-maintenance",
 "axes": {
   "A1_perspectives": {"level": "lacks", "note": "No named ledgers with write-authority enforcement; Materialize has sources/sinks but no perspective-based write control.", "source": "model-knowledge"},
   "A2_provenance": {"level": "partial", "note": "Datalog family supports why-provenance in principle; DDlog/Differential Dataflow do not emit kernel-level derivation traces; provenance is external add-on research.", "source": "https://github.com/vmware-archive/differential-datalog/blob/master/README.md, model-knowledge"},
   "A3_epistemic_openworld": {"level": "lacks", "note": "Query engines with deterministic output; no claim-status derivation or contested-state semantics.", "source": "model-knowledge"},
   "A4_fixpoint_replay": {"level": "has", "note": "DDlog enforces stratified negation and fixpoint Datalog semantics; deterministic evaluation enables replay from input streams.", "source": "https://github.com/vmware-archive/differential-datalog/blob/master/README.md, model-knowledge"},
   "A5_incremental_materialization": {"level": "has", "note": "Core innovation: both DDlog and Differential Dataflow compute only deltas; store changes indexed by key/time; reconstruct from update logs.", "source": "https://www.cidrdb.org/cidr2013/Papers/CIDR13_Paper111.pdf, model-knowledge"},
   "A6_llm_admission_gate": {"level": "lacks", "note": "No notion of untrusted writers or attributed admission gates; all data assumed trustworthy.", "source": "model-knowledge"},
   "A7_anytime_budgets": {"level": "lacks", "note": "Event-driven streaming model; no bounded work loops, stagnation detection, or epistemic reports on demand.", "source": "model-knowledge"},
   "A8_typed_inquiry": {"level": "lacks", "note": "No inquiry-driven work frontier; user submits queries, system computes answers; no epistemic intents.", "source": "model-knowledge"},
   "A9_embeddable_kernel": {"level": "partial", "note": "DDlog compiles to Rust libraries; Differential Dataflow is Rust crate; Materialize is cloud service or self-managed deployment; none are lightweight zero-dep TS.", "source": "https://github.com/vmware-archive/differential-datalog/blob/master/README.md, model-knowledge"},
   "A10_rule_mutation_testing": {"level": "lacks", "note": "No evidence of mutation testing discipline as shipped standard in rule packs.", "source": "model-knowledge"}
 },
 "adjacent_capabilities": ["Partial-order versioning with time-stamped deltas enable efficient multi-version state reconstruction", "Arrangement index data structure for O(log n) lookup of changes by key over time intervals", "Distributed execution across threads/processes/clusters via Timely Dataflow scheduler", "SQL query front-end with standard relational operators (joins, aggregations, recursive CTEs)"],
 "steal": ["Indexed delta storage keyed by (key, time) rather than content-hash, reducing query latency on hot facts", "Automatic incremental derivation of all transitive closures and joins without manual algorithm design", "Concrete implementations proving stratified-negation fixpoint semantics scale to real systems (OVS, cloud management)"],
 "positioning": "DDlog/Differential Dataflow are high-performance incremental query engines; ROFL is an epistemic reasoning substrate that treats incrementality as one layer atop provenance, authority, and typed inquiry.",
 "confidence": "high"}
```
