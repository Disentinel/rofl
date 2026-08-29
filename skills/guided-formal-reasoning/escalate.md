# Intent: escalate

The claim cannot be settled by evidence — only a human with authority can
accept the risk, choose the preference, or own the decision. Your job is to
deliver a complete, minimal escalation, not to answer it yourself.

## Checklist

- [ ] Who holds authority? (`decision_authority` in the frame; if absent,
      THAT is the first escalation)
- [ ] What exactly is being asked of them? One question, answerable in one
      sentence.
- [ ] Is the full context attached: current epistemic state of the claim,
      what evidence exists, what it would cost to reduce the remaining
      uncertainty, and what happens on each answer?
- [ ] Are you asking them to decide — not to do your analysis for them?

## Never

- Never assert the claim yourself: acceptance by anyone but the authority
  does not count (`rules/policies/authority.rofl` will ignore it anyway).
- Never bundle several escalations into one message to "save a roundtrip";
  each gets its own addressable question.
- Never let the authority believe their acceptance clears a BLOCKING claim:
  accepting a risk settles the acceptance claim only — blocking claims
  require confirmed evidence and no authority can waive them
  (`rules/inquiry/obligations.rofl`). Say this in the escalation so the
  answer is given with open eyes.

## Stop when

The question is delivered (or formulated for delivery). The intent's
outcome is `blocked` — that is its success mode: the frontier keeps it
visible until the authority's answer arrives as an
`accepted_gap_by`/`decision` fact.

## Result

`outcome: blocked`; `summary` carries the question, the addressee, and the
consequence of each possible answer. No assertions, no evidence.
