# The third value, and where it lives

What is decided and built, on 2026-08-31. Read this before writing a program
whose negation is genuinely circular, or before changing how negation is
evaluated.

## The decision

**`semantics(well_founded).` runs an alternating fixpoint instead of the
phase-ordered run, and the atoms it leaves undefined get an `unknown(Atom)`
row of their own.** Decided over the two cheaper options (argument-indexed
local stratification, and bounded manual unrolling) for one reason:

> Unknown is a completely valid value and we would rather show it explicitly
> and explain WHY it is unknown than blur it.

In the cheaper options the third category is obtained by SUBTRACTION —
everything neither yes nor no — which silently merges "genuinely depends on
luck" with "the engine ran out of budget". Telling those two apart is the
product, so a third value computed as a leftover imitates the product rather
than delivering it.

## What is computed

Two sequences from one operator, run with negation judged against a FROZEN set
rather than against the store being built. A round that assumes little derives
much (every negation succeeds); a round that assumes much derives little. The
generous rounds decrease, the mean rounds increase, and they close on each
other:

| what both limits agree on | **true** |
| what neither limit reaches | **false** — no round derives it, however generous |
| the gap between them | **undefined** — derivable only by assuming itself |

Which value is a leftover is not a stylistic choice. **False must be an
absence** (the Herbrand base is infinite; the false atoms cannot be
enumerated), and **undefined must be explicit** (it is finite, it is small, and
it is the answer). Both are what they have to be, and they are the opposite way
round from the cheap options.

## Where the third value lives

In the store, as an ordinary derived fact: `unknown[P](win(a))`, written in the
atom's own perspective, with the atom as an ordinary term rather than the
`$fact` reification. Three consequences, all wanted:

- **It can be asked about.** `$` is unwritable in surface syntax, so a `$fact`
  argument would have made `why unknown(...)` untypeable — a third value nobody
  can interrogate is the refusal it was meant to replace.
- **Rules can read it.** `dlq_candidate(S) :- state(S), unknown(win(S)).` is
  the sentence the whole decision exists for. Reading rules get one pass over
  the settled model, under the same assumption the last round ran under.
- **It carries provenance.** The row keeps the firing that derived the atom
  under the generous assumption, with every premise that is itself undefined
  redirected to that premise's own row. Following them walks the unfounded set
  and closes on a `[cycle]` — which is the whole answer: nothing here rests on
  anything founded. A negated premise that never settled prints `[undefined]`
  and not `[finite failure]`, and `why` on an `unknown` row ends with
  `unfounded set: ...`, naming it flatly as well as showing its shape.

That the tree is always informative is a theorem, not a hope: an atom in the
gap cannot have a derivation made only of true premises and false negations,
or the mean round would have derived it too. So its canonical firing always
names another member of the gap.

## What the budget does, and what it must never do

A budget cut short is not a fixpoint, so it has no unknown set to report. The
alternation never reaches the comparison, `hole(Id, budget_exhausted)` is
written as always, and **no `unknown` row is emitted at all**. The two answers
stay distinguishable in the only way that matters: the store either names the
undefined atoms or says it ran out, never both and never neither.

## What happens to the stratum table

It survives, untouched, on the evaluator that reads it — and the alternating
fixpoint is an additional path rather than a replacement either way. When this
was written the phase-ordered run WAS the default and read `stratum/2` out of
the store; the default now peels its phase order off the decoded rules
(`src/rounds.ts`), and `semantics(well_founded)` is delegated to the
phase-ordered code unchanged, because an alternating fixpoint orders no phases
and so has nothing for rounds to replace. Both statements have the same
content: this document's subject is the third value, and nothing here depends
on where the schedule came from.

The one visible difference is who gets warned. `stratum/2 is not computed under
well_founded semantics` is emitted for a program whose own rules CONCLUDE
`stratum` — it is being told its rules will not run under this semantics.
boot.rofl was such a program until the ten schedule rules left it, so the
warning used to appear on every well-founded load and now appears only where
there is something to warn about.

An accidental negative cycle should still be refused loudly; the declaration is
how a program says the cycle is the subject. What reports the cycle when the
declaration IS present is now the peel, and it reaches further than
`unstratified/1` did: it names every relation that can never settle, including
those that merely negate something on the cycle.

Under the alternation the table is **not computed**, and this is not an
optimisation. `stratum(Rel,N) :- dep_neg(Rel,Q), stratum(Q,M), N is M+1`
DIVERGES on a negative cycle: the number does not exist there, which is exactly
what a negative cycle means for a stratum number. The phase-ordered run
survives that because the budget cuts the divergence and `unstratified/1`
rejects the program a moment later; here there is nothing to reject, so the
rules that build the table are not run and `? stratum(R,N)` is empty. A
diagnostic says so, because an empty relation that is silently not computed is
the same invisible absence `undefined_premise` exists to catch.

`unstratified/1` is unaffected — `dep_neg` and `reach` are finite closures —
and still answers. It stops being a verdict and stays a fact about the program.

## Limits, measured

- **Demand-backed relations are refused, not assumed.** A relation unfolded at
  its call sites materialises as a side effect of matching, so no round can
  hold it fixed. `examples/sensors.rofl` has three (`close`, `corroborated`,
  `temp`) and is refused under the declaration; it loads normally without it.
- **Reuse is off.** Every round clears the derived layer, so the fingerprint
  cache has nothing to stand on. On `examples/wtf` the alternation costs
  5.0 s against 0.6 s for the phase-ordered run of the same 16220 facts.
- **The canonical witness may differ, the hypergraph does not.** On
  `examples/wtf` both runs derive the same 16220 facts with the same support
  count and the same set of firings for every one of them; for 6 facts the
  FIRST firing — the single tree `why` prints — is a different, equally true
  derivation, because phase order is part of what picks it. That is worth
  knowing about the stratum table: it was silently choosing which proof you
  see, not only which answers you get.
- **`whynot` is still two-valued.** It walks the store as it stands, so a
  premise that is undefined reads there as absent. `why` knows the difference;
  `whynot` does not yet.
