# grafema-rofl

A Rust implementation of the **ROFL** evaluator — *Relation-Oriented Fixpoint
Language*, a Datalog-family engine with perspectives (first-class truth
contexts), explicit time, kernel-emitted provenance, structured terms, and
budgets as part of the semantics.

The reference host is the TypeScript kernel published as
[`@grafema/rofl`](https://www.npmjs.com/package/@grafema/rofl); this crate is a
port of it, and the contract between the two is three lines long and
mechanically checkable:

```text
snapshot in  ->  evaluate  ->  canonicalState out
```

Every module cites the JS file and line it ports, and the oracle is a
byte-identical `canonicalState()` over a generated corpus. `npm test` in the
repository loads 94 worlds with **both** engines and compares a hash and a
per-relation census against one committed golden.

## What a caller reaches

`Session` is the surface: `load`, `assert`, `evaluate`, `tick`, `run`, `save`,
`open`, `fork`, `why`, `whynot`, `retract`, `excise`, `holds`, `fact_keys`,
plus the residency verbs that are the port's alone. `rust/rofl/tests/explain.rs`
holds the explanation verbs to the reference host's own output, string for
string.

## Status

Version 0.1.0 and honest about it. Measured differences against the reference
host, the conformance ladder, and what the port does **not** answer are in the
repository's ledger (`facts/findings.rofl`, rendered by `npm run findings`) and
in `docs/port-surface.md` — not summarised here, because a summary of a
measurement is where the measurement goes stale.

## Licence

MIT. See `LICENSE`.
