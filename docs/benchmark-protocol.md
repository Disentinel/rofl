# Benchmark protocol — measuring the ledger claim honestly

Binding discipline (finding `f_self_authored_benchmarks_circular`):
**evidence comes only from externally authored benchmarks with published
degradation for the model under test.** Self-designed tests are demos, not
evidence — the author of the traps is the author of the trap-catchers.
Registered hypothesis: *an agent that keeps a materialized fact ledger
holds coherence longer into a long horizon than the same model without
one.*

## Suites

| suite | what it measures | published anchor | role |
|---|---|---|---|
| microsoft/lost_in_conversation | multi-turn underspecification (sharded prompts) | −39% avg, +112% unreliability across 15 models incl. Claude 3 Haiku | primary; its recap/snowball variants are ready-made controls for a ledger arm |
| tau2-bench | agentic reliability, pass^k over k trials | published pass^k decay curves | reliability axis: does a ledger raise pass^k, not just pass^1 |
| Vending-Bench class | long-horizon coherence collapse (days-scale) | 3.5 Haiku collapse narrative published | grant-scale stretch goal |

## Arms

Every experiment runs the same model, same turn stream, three ways:

1. **bare** — the suite's own degradation condition, unmodified.
2. **suite control** — the suite's published mitigation (LIC: snowball /
   recap), so the ledger must beat the *cheap* fix, not just the baseline.
3. **ledger** — facts extracted per turn into a Rofl store; the rendered
   ledger replaces (or augments) raw history.

## Ledger rendering rules (learned 2026-08-28, the hard way)

The pilot slice (`docs/dogfood/2026-08-28-lic-haiku45.md`) showed a naive
rendering *doubles* premature wrong answers and even induces fabrication of
missing quantities. A conforming rendering MUST:

- carry the **open-world marker**: "more statements may arrive; a fact
  absent from the ledger is unknown, not false" — never "complete";
- **not** force a per-turn answer ("if answerable, answer now" is a
  pressure variable, not a memory variable); the decision to answer stays
  with the suite's own system prompt, identical across arms;
- render facts verbatim with provenance ids, no summarization — the
  ledger's value claim is *lossless* accumulation.

## Scoring and controls

- The suite's own evaluator, byte-for-byte. No reimplemented scoring.
- The suite's own user simulator where it has one (LIC paraphrases shards;
  verbatim delivery measurably eases the task — pilot deviation, now
  banned for evidence runs).
- ≥ the suite's published run count per sample (LIC: 8) before claiming a
  delta; report unreliability (spread), not only the mean.
- Report token cost per arm alongside accuracy: the honest ledger claim is
  "coherence per dollar", and the pilot already shows ~5% overhead.
- Negative results are results: "the floor moved above the slice" (Haiku
  4.5 solved all sharded-GSM8K at n=6) is recorded, not discarded — the
  next run moves to tasks where the model under test still degrades.

## Status

- 2026-08-28: harness proven end-to-end on the LIC slice (18 conversations,
  zero API keys, evaluator verbatim); rendering rules extracted from its
  failure. Next: LIC simulator loop + full math set on Haiku 4.5, then a
  4.5-hard task family.
