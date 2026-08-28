# Intent: discriminate

Two claims, hypotheses, or agent positions conflict. Find the cheapest
observation that tells them apart.

## Checklist

- [ ] What exactly conflicts? (journal evidence vs journal evidence =
      `contested`; agent vs agent = `agent_disputed` — name the pair)
- [ ] Do the sides predict DIFFERENT observations? If they predict the same
      observations, the disagreement is semantic or scope-level — return a
      `clarify` proposal instead, do not run experiments.
- [ ] What is the cheapest experiment or lookup that distinguishes them?
- [ ] Does the experiment itself depend on either disputed side? (it must not)
- [ ] How will an inconclusive result be represented? (as `inconclusive` —
      never rounded toward the side you find more plausible)

## Localize before you experiment

Roadmap §2.5 — find the address of the disagreement first: factual, semantic,
scope, assumptions, risk preference, or authority. Only a factual
disagreement is yours to discriminate; risk preference and authority route
to `escalate`, semantic and scope route to `clarify`.

## Stop when

You have run (or precisely specified) one discriminating observation and
recorded which side it favors — or established that the disagreement is not
factual and returned the re-routing proposal.

## Result

Evidence items for what was actually observed, an assertion only if the
observation settles the claim, and `new_intents` for the re-routed cases.
The disagreement's address goes in `summary`.
