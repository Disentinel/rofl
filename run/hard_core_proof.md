# Track B — obligation graph and the hard_core derivation

Generated from the live store (driver queries), round 11. Source atoms are
from_memory (see round-010.rofl); the derivation itself is fully in-substrate.

## Obligation graph
```
needs:          B = no_cycles, C = collatz; B = no_divergence, C = collatz
branches:       B = no_cycles; B = no_divergence
covers:         B = no_cycles, S = cycle_diophantine; B = no_cycles, S = twoadic_ext; B = no_cycles, S = uniform_automata; B = no_divergence, S = density_tao; B = no_divergence, S = density_terras; B = no_divergence, S = drift_martingale; B = no_divergence, S = uniform_automata
obstacles:      S = cycle_diophantine, X = baker_bounds_finite_only; S = density_tao, X = measure_zero_gap; S = density_terras, X = measure_zero_gap; S = drift_martingale, X = expectation_not_certainty; S = twoadic_ext, X = conjugacy_loses_arithmetic; S = uniform_automata, X = conway_undecidability
partials:       B = no_cycles, E = eliahou_cycle_length_bound; B = no_cycles, E = simons_deweger_mcycles
dead:           S = cycle_diophantine; S = density_tao; S = density_terras; S = drift_martingale; S = twoadic_ext; S = uniform_automata
live:           (empty)
covered:        (empty)
uncovered:      B = no_cycles; B = no_divergence
hard_core:      B = no_divergence
sources:        S = src_baker_theory, X = baker_bounds_finite_only; S = src_conway_1972, X = conway_undecidability; S = src_eliahou_1993, X = eliahou_cycle_length_bound; S = src_lagarias_survey, X = conjugacy_loses_arithmetic; S = src_lagarias_survey, X = expectation_not_certainty; S = src_simons_deweger, X = simons_deweger_mcycles; S = src_tao_2019, X = measure_zero_gap; S = src_terras_1976, X = measure_zero_gap
```

## The shallow proof (why hard_core(no_divergence))
```
hard_core[main](no_divergence)  <= r97f2402a @tick 0
  uncovered[main](no_divergence)  <= r0b9f0845 @tick 0
    branch[main](no_divergence) [axiom]
    not covered[main](no_divergence) [finite failure]
      whynot covered[main](no_divergence):
        rule r5651d820: covered[main](?B)@now :- covers[main](?S,?B)@now, live[main](?S)@now
          failed premise: live[main](density_tao)
          failed premise: live[main](density_terras)
          failed premise: live[main](drift_martingale)
          failed premise: live[main](uniform_automata)
  not has_partial[main](no_divergence) [finite failure]
    whynot has_partial[main](no_divergence):
      rule r0b639f53: has_partial[main](?B)@now :- partial_result[lit](?B,?E)@now
        failed premise: partial_result[lit](no_divergence,?E#1)
```

Reading: every strategy covering no_divergence is dead under an uncontested
literature obstacle, and no_divergence (unlike no_cycles, which has the
Eliahou / Simons-de Weger partial results) has no partial results at all —
so the divergence branch is the hard core of the conjecture. This assembles
the expert-consensus state of the art by joins; it is not new mathematics.
