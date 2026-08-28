# Intent: clarify

Resolve what an ambiguous term or claim actually means — before anyone
spends budget verifying the wrong reading.

## Checklist

- [ ] Which term or claim is ambiguous, exactly?
- [ ] What plausible interpretations exist? (list them — two minimum, or it
      was not ambiguous)
- [ ] Would the interpretations affect the decision differently? If not,
      pick one, note it, and return — clarification that changes nothing is
      not worth a question.
- [ ] What is the MINIMUM question that distinguishes them?
- [ ] Who has the authority to answer? Can a document answer instead of a
      person?

## Stop when

You have either the settled meaning (with its source) or the one minimal
question routed to the one right person. Do not verify the claim — that is
a separate intent that becomes possible after yours.

## Result

If settled from documents: an assertion on a SPLIT claim — propose the
disambiguated claims via `new_intents` (e.g. `pdf_dedup_required` splits
into `pdf_dedup_blocking_for_launch` vs `pdf_dedup_fast_follow`), and say in
`summary` which reading the source supports. If a human must answer:
`outcome: blocked`, with the minimal question and its addressee in
`summary`.
