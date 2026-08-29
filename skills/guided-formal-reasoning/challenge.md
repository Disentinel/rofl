# Intent: challenge

Attack the current derivation: find the weakest premise and the cheapest
observation that would break it. This is falsification duty, not contrarianism.

## Checklist

- [ ] What is the weakest premise in the current derivation? (run `why` on
      the verdict; the weakest axiom in the tree is your target)
- [ ] What is the smallest plausible counterexample?
- [ ] How could it be OBSERVED? (a challenge with no observable consequence
      is an essay — drop it)
- [ ] Would confirming it change the recommendation? If not, drop it.
- [ ] Does it duplicate an existing contested/open branch?
- [ ] Is the challenge proportionate to the stakes?

## Remember

A passing happy-path test does not prove the absence of a failure mode the
test could not observe. Your job is to name the failure mode and the test
that COULD observe it.

## Stop when

You have either one concrete counterexample path with its observation
(return it as evidence + a refuting assertion, or as a `new_intent` to run
the discriminating test), or an honest `no_progress`: the derivation
survived your best attack — say which attacks it survived.
