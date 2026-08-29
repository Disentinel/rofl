# Intent: verify

Establish whether one claim holds, with admissible evidence, within scope.

## Before you start

- [ ] Which exact claim? (the intent's `target` — verify THAT, not a cousin)
- [ ] What evidence is admissible for it? (measured beats document beats
      human assertion beats agent claim — and yours is always the last)
- [ ] What scope must the evidence cover? (isolated load does not prove
      aggregate capacity — a weaker claim needs its own atom)
- [ ] Is there a direct source (CI, monitoring, a test run, a document)?

## While working

- Prefer running a deterministic tool over reading about one. A tool run the
  runtime executes may be admitted as `measured`; anything you merely read
  or infer may not.
- Check freshness: does the evidence refer to the current version? Stale
  evidence supports nothing (`rules/policies/evidence.rofl`) — record
  `evidence_version` when you know it.
- If the evidence supports only a weaker claim, say so: return the weaker
  claim as a `new_intent` proposal, do not silently strengthen.

## Stop when

The claim is supported or refuted by admissible evidence in scope — or you
can say precisely what is missing. Then stop. `inconclusive` with a named
gap beats a stretched conclusion.

## Result

`schemas/intent-result.json`: assertions with `based_on` linking to the
evidence items you actually collected; every evidence item carries `source`
and, when known, `scope` and `observed_at`. Remaining assumptions go in
`summary`.
