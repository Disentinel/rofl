# Intent: confirm

An agent attached a polarity (supports/refutes) to evidence on a BLOCKING
claim. The link is real evidence plus agent interpretation — and blocking
verdicts refuse to move on interpretation alone (decision b). A human or a
deterministic tool must confirm that the evidence really means what the
agent read into it.

## If you are the agent executing this intent

You cannot confirm your own attachment — that is the whole point. Your job
is delivery: present to the confirmer, side by side,

- the evidence item (`evidence_source`, content, scope, `observed_at`),
- the claim it was attached to, exactly as scoped,
- the polarity the attaching agent chose, and its stated basis,
- what flips when confirmed (the verdict chain — run `why`).

Then `outcome: blocked`; the confirmation itself arrives as a fact:

```sh
npm run pair -- assert --session S 'confirmed_polarity(EVIDENCE, CLAIM).'
```

## If a deterministic tool can settle it

A tool run that re-derives the polarity mechanically (the test actually
failing, the metric actually below threshold) may be admitted by the runtime
as the confirmation. Reading the same document again with the same eyes is
NOT a tool run.

## Checklist for the confirmer (human)

- [ ] Does the evidence actually refer to THIS claim, at THIS scope?
- [ ] Is the polarity right — does it support or refute, or merely mention?
- [ ] Could the source have meant something narrower, older, or ironic?
- [ ] Refuse by doing nothing: an unconfirmed link never moves a blocking
      verdict, and the confirm intent keeps it visible.
