# ROFL 24h Sustained Reasoning Run — Protocol v1

(Verbatim from the Enox handoff package, artifact `_pocqGcuVP7i`,
sha256 40da1a58d4689230ef7d04eadf4dda5450ab68fd3f01b478c75878cc8be926f2.
Seed sources in this directory are sha-verified against the package:
audit-v0.2.rofl 78e373f4…, collatz-models.rofl 002c70ff….)

Target: one wall-clock day of autonomous reasoning on Collatz with the ROFL kernel as
substrate, executed by Claude Code in /loop mode inside the `rofl` repo. This continues
the 2026-08-19 10-round session — seed from the snapshot OR rebuild it: load
boot.rofl + audit-v0.2.rofl + collatz-models.rofl and evaluate (the snapshot is a cache;
the .rofl sources are the truth).

## Honest goal statement (paste into the agent's context verbatim)
You will not solve Collatz. Success is measured by the substrate ledger, not by mathematics:
(a) computational results checkable against literature, (b) caught inconsistencies,
(c) substrate limits found, (d) a saturation curve at scale. Any claim of novel mathematics
must be flagged `groundless` unless it carries a computed or cited ground.

## The round (repeat until wall clock expires; expect 100–300 rounds)
1. Restore the snapshot; run audit queries: open_risk, vocab_drift, groundless, shaky,
   split. The TOP open_risk item is the round's mandatory first target.
   (Round 1 target is standing: open_risk(slow_set_signals_divergence).)
2. Act: one of — (i) compute (extend the Terras table: full stopping-time classification
   mod 2^k, k = 4…20, densities of the exceptional set per k; values stay under 2^53 for
   n ≤ 10^6 — VERIFY overflow guard each round, the engine has no bignum);
   (ii) model (a strategy, an obstacle, a literature fact — with source atoms);
   (iii) repair or explicitly abandon an open_risk (abandonment = assert
   repair[a](C, abandoned_because(...)), never retract).
3. Audit: rerun the audit queries. Every new claim must have ground. Every modeling
   decision must be a decision[a](attach(...)) fact with a declared level.
4. Record: append round summary to RUN_LOG.md (round #, target, result, catches, new
   predicates born). Save snapshot to state/round-NNNN.json. Commit.
5. Degradation check, hourly: if groundless count > 3, or predicate births in the last
   10 rounds > 15, or open_risk grew 3 hours straight — STOP, write HALT.md with the
   audit dump, exit the loop. A stopped run with a clean ledger beats a full run of slop.
   (Precedent to avoid: the May vscode-debt corpus.)

## Discipline (each item is a lesson bought on 2026-08-19 — violating any voids the run)
- Universe-first: never write arithmetic on an unbound variable in a recursive rule;
  materialize num/gen universes with explicit bounds first (50M budget burned in 370ms
  otherwise).
- Assert-only revision: never retract a belief; supersede it (the amnesia lesson).
- Budgets are semantics: every evaluate/tick call carries an explicit budget; a hole is
  a result to record, not an error to retry blindly.
- No deep why through computation: witness trees through arithmetic chains are unreadable;
  query results and shallow whys only, until the kernel grows builtin-folding (log it as a
  kernel issue, do not fix mid-run).
- Vocabulary integrity: audit v0.2 ships vocab_drift and level/1; extend level/1 when
  introducing a new granularity — an undeclared level now FLAGS instead of silently
  missing (the R10 fix).

## Track A — the checkable core
Terras table: for k = 4…20, classify all residues mod 2^k by coefficient stopping time;
output density of undecided residues per k. External oracle: the classical published
fractions — divergence from literature = bug in the run, not a discovery.
Deliverable: terras_table.md + the deriving .rofl files.

## Track B — the audit at scale
Grow the strategy/obstacle/branch graph from real literature (each fact carries a source
atom; unsourced literature facts are groundless). Deliverable: the obligation graph and
the final hard_core derivation with its shallow proof.

## Final deliverables
RUN_LOG.md, terras_table.md, final snapshot, SUBSTRATE_ISSUES.md (every kernel limit hit,
with reproduction), SATURATION.md (predicate-birth curve over all rounds — n=1 modeler
caveat applies and must be stated), and if halted: HALT.md.

## Run-local adaptations (declared up front, 2026-08-19, this branch)

1. **Snapshots**: a full store snapshot is multi-MB; committing one per round for
   100–300 rounds would bloat the repo into GBs. The .rofl sources are the truth (the
   protocol's own words); therefore per-round state = `rounds/round-NNN.rofl` (tiny,
   committed, rebuilds exactly), plus a gzipped full snapshot `state/latest.json.gz`
   refreshed every round and long-term checkpoints `state/checkpoint-NNN.json.gz`
   roughly hourly. Raw .json is gitignored.
2. **Track A scale**: full in-substrate classification at k=20 is 2^20 residues × ≤20
   steps ≈ 21M derived facts + provenance — beyond the current engine's memory. Per-k
   computations run in scratch stores; each k's summary (undecided count, density)
   enters the main graph as evidence with the deriving .rofl as ground. The k at which
   the substrate breaks is a measured deliverable (SUBSTRATE_ISSUES.md), and the engine
   may be improved mid-run (owner's instruction) — any engine change is logged in
   RUN_LOG, kept behind the full test suite, and committed separately.
3. **Oracle honesty**: exact literature values for the Terras table are not reliably in
   the agent's memory. The bug-oracle is therefore an independent TypeScript
   implementation of the same classification (analogous to the busy-beaver cross-check
   in test/phase4). Literature comparisons are limited to facts the agent can state
   with confidence and are marked `from_memory` — no fabricated citations. Divergence
   ROFL vs TS = bug in the run, exactly as the protocol prescribes.
