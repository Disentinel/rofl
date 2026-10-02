---
world: spat-week-review
books: main
default: main
model: none
reads:
  - ../spat/spat.rofl
  - ../spat/week.example.rofl
  - spat_inferred_travel.rofl
---

# A parent's review of this week

> A notebook over `examples/spat` — the household week `week.example.rofl`
> read through the rules in `spat.rofl` — written the way a notebook is meant
> to be used: general invariants a parent would actually want of a week,
> first in plain language, then refined step by step into lines the engine
> answers, with `why`/`whynot` used on every failure to say whose constraint
> caused it. Run it with `npm run nb -- examples/notebook/spat.rofl.md`.
>
> This file only reads `examples/spat/spat.rofl` and
> `examples/spat/week.example.rofl` — neither is edited here. The one added
> fact file, `spat_inferred_travel.rofl`, is explained under R2, where it is
> needed. The what-if (R1) is an `excise` cell in this file.
>
> The sentences below give words to relations `spat.rofl` derives, so a
> `rofl` cell can ask them and answers read as sentences
> (`docs/md-world.md`, *Sentences for what a notebook reads*):

Reads:

- from spat:
  - <a id="uncovered"></a>A child Ch is alone on a day D at a minute S
  - <a id="out_why"></a>A person P is out on a day D at a minute S for a constraint C
  - <a id="on_duty"></a>A person P is on duty on a day D at a minute S
>
> First, the wide question, the one `spat check` answers in one word:

```datalog
? holds_together(week)
? broken(K)
```

> `holds_together(week)` has **0 answers** — it does not hold — and
> `broken(K)` names exactly one reason: `broken(uncovered)`. Not
> double-booked, not short on hours, not missing a way to get anywhere, not
> outside a window. One thing is wrong with this week, and the rest of this
> file is that one thing, plus six more questions the wide check does not
> ask at all.

## R1 · No child is ever alone while awake

```natural
R1 No child is ever alone while awake: whenever a child is not asleep and not somewhere supervised, somebody from the household is on duty to be with them.
```

> First attempt, the way the sentence form wants it — `uncovered/3` is
> already exactly this predicate, so name it as a sentence and ask a
> `never` of it, the way `docs/md-world.md`'s own worked example does for a
> fact declared elsewhere (kept as text: it does not load, for the reason
> below):

```text
<a id="alone"></a>A child Ch is left alone at day D slot S if uncovered(Ch, D, S).

never Ch is left alone at day D slot S
```

> **Does not load.** `error: not read: uncovered(Ch, D, S)` — `uncovered` is
> a relation `spat.rofl` derives with rules, not a sentence any `.rofl.md`
> has declared, and a `rofl`-fenced body condition only reads a declared
> sentence, never a bare `relation(Args)` (positional form is for `?`, `why`,
> `whynot` only — `docs/md-world.md` says "the positional form still works
> everywhere", which is not quite true, and R5 below hits the same wall from
> the other side). The `never` line does not silently pass either: it reports
> `FAILS · 0 · nothing in the model can put a row here: check the name, the
> book and the number of arguments` — the tool's own "silence is not green"
> discipline refusing to call an unpopulatable relation a hold. Moved to a
> `datalog` cell, where a line is read as a literal clause:

```datalog
alone(Ch, D, S) :- uncovered(Ch, D, S).

never alone(Ch, D, S)
```

> Since then the notebook can give `uncovered` a sentence of its own (the
> `Reads:` list at the top), and the same question reads as a parent would
> ask it:

```rofl
never Ch is alone on D at S
```

> **FAILS · 4.** Two children, one evening:

```datalog
? uncovered(Ch, D, S)
```

> `kit` and `nico`, Thursday, slots `1060` and `1080` — 17:40 and 18:00.
> Twenty minutes, both children, nobody on duty. `why` on one of the four
> gives the whole derivation down to the axioms (`awake_at`, `not at_sup`,
> `not minded`, then `not any_duty` failing because no `on_duty` row exists
> for anybody at that slot); what it does not itself say is *who* was
> supposed to be there and what took them — that is a separate relation,
> `out_why`, built for exactly this:

```datalog
why uncovered(nico, thu, 1080)

? out_why(P, thu, 1080, C)
? out_why(P, thu, 1060, C)
? here(P, thu, 1080)
```

> Both adults are `here` in the model's default sense (present unless
> travelling or away) and both are `out` at that exact slot, each for a
> named reason: `out_why(alex, thu, 1080, c_acme)` and
> `out_why(robin, thu, 1080, c_swim)` — identically at `1060`. Alex is at
> Acme, Robin is at the pool. This is not a surprise the model invented: the
> comment on `week.example.rofl`'s own `moved(c_dentist, swim, w0831, wed,
> thu, ...)` line says outright that Wednesday's swim was moved to
> "Thursday — which is the evening Алекс is at Acme and the няня does not
> come" (the няня's window is `nanny_days` = mon/wed/fri only). The model
> answers the same thing the household already half-knew, with the two
> exact minutes and the two exact constraint ids attached.

> Whose constraint is each one? `constraint(Id, Owner, Scope)` answers it,
> not an opinion:

```datalog
? owner(c_acme, O)
? external(c_acme)
? owner(c_swim, O)
? household(c_swim)
? give_cost(c_acme, N)
? give_cost(c_swim, N)
```

> `c_acme` is owned by `acme` (the employer) and is `external` — costed at
> the default `200` for an external constraint nobody in this house can
> renegotiate alone. `c_swim` is owned by `robin` and is `household` —
> costed explicitly at `40` (`give(c_swim, 40)` in the week file: the
> cheapest of the three costed constraints in the whole week). The hole has
> two named causes, and only one of them is the household's own to move.

> **The what-if**, in this file: `excise` takes a fact out of the world
> every line above was asked over, and says which lines answer differently,
> without changing any of their own answers. Waiving `c_swim`
> (`waived(c_swim)`, what `spat relax` does) adds a fact, which excise
> cannot; what it can take out is the fact that puts the swim on the week,
> robin's usual Wednesday swim (moved to Thursday by the dentist):

```datalog
excise usual(c_swim, swim, robin, pool, wed, 1020, 1080)
```

> Four rows of `uncovered` go, both children at 17:40 and 18:00, and only
> robin's `out_why` row goes: Alex never stopped being at Acme, and one
> adult on duty was enough. Giving the cheaper of the two constraints was
> enough on its own, which is the answer a parent asking "what would it
> take" wants, and not one either `out_why` row suggests by itself. Taking
> out `constraint(c_swim, robin, household)` instead moves nothing: the
> constraint's id is not what schedules the swim, its `usual` row is, so
> the unit a what-if takes out is the fact that puts an event on the week.

## R2 · No handover depends on a drive whose time is a guess

```natural
R2 No handover depends on a drive whose time is a guess: a chain with no time to spare never rests on a travel figure nobody actually measured.
```

> Not expressible over `spat.rofl`/`week.example.rofl` alone: "measured" and
> "guessed" are words in a `--` comment on nine of the ten `travel/3` lines
> in `week.example.rofl`, and a `.rofl` comment is stripped before the file
> is parsed — the model has no relation for "this number is a guess" at all,
> the same gap `examples/notebook/ledger.rofl.md`'s N3 hit over a dismissal's
> reason string. Bridged the same way: read once by a person, written down
> as facts, in `spat_inferred_travel.rofl` (`reads:` above), never inside
> `spat.rofl` or `week.example.rofl` themselves. If the comments in the week
> file ever change, this bridge goes stale silently — nothing here checks
> the two against each other, which is itself worth knowing.
>
> First, the chains with nothing to spare:

```datalog
? zero_slack(P, D, E1, E2)
? negative_slack(P, D, E1, E2)
```

> `negative_slack` is empty (matches R0's wide check: no `broken(no_time)`).
> `zero_slack` is not: `zero_slack(robin, mon, physio, pickup)` and
> `zero_slack(robin, fri, physio, pickup)` — the two physio days. Zero is
> not negative, but it is the whole invariant: any overrun at all, and the
> next block is late, with no report from the model saying so until it
> happens for real.

```datalog
chain_leg(P, D, E1, E2, Pl1, Pl2) :- zero_slack(P, D, E1, E2),
                                     span(_, E1, P, Pl1, D, _, _),
                                     span(_, E2, P, Pl2, D, _, _).
rests_on_a_guess(P, D, E1, E2) :- chain_leg(P, D, E1, E2, Pl1, Pl2), guessed(Pl1, Pl2).

never rests_on_a_guess(P, D, E1, E2)
```

> **FAILS · 2** — both zero-slack chains. `why slack(robin, fri, physio,
> pickup, 0)` walks the arithmetic down to `tt(physio, sadik, 5)`, which
> resolves to the bare axiom `travel(physio, sadik, 5)` — no `assume`/
> `travel_as` condition is in force anywhere in this week, so the figure
> used is the one `week.example.rofl` marks, in its own words, "INFERRED,
> and load-bearing: see `spat fragile`". The model computed the zero
> correctly; it is silent about the fact that the number it computed it
> from was never actually timed. `spat.rofl` was built with a mechanism for
> exactly this question — `assume(cautious). travel_as(cautious, physio,
> sadik, 8).` would ask "and if it's really eight minutes, not five?" — but
> that asks to ADD a fact, which `excise` cannot, so this notebook stops at
> naming the risk rather than running it.

## R3 · No one is asked to be in two places at once

```natural
R3 No one is asked to be in two places at once: nobody's week has two commitments that overlap.
```

```datalog
? overbooked(P, D, E1, E2)

never overbooked(P, D, E1, E2)
```

> **Holds.** Zero overlapping commitments for anyone, all week — the one
> invariant so far with nothing to explain, which is worth stating exactly
> because five of the other six do have something to explain: a clean
> answer here is not the absence of a check, it is a check that ran and
> found nothing, the same distinction R1's first attempt above exists to
> keep visible.

## R4 · Every hole names who could have covered it and what took them

```natural
R4 Every hole names who could have covered it and what took them: no red block is ever left with a cause the model itself cannot point to.
```

> This is not "is the week fine" (R1 already said it is not) — it is
> "when it is not fine, does the tool actually tell you why, for every
> constraint it leans on." Every constraint `out_why` ever cites has to
> exist as a declared `constraint(Id, Owner, Scope)`, or the attribution is
> a name with nobody behind it:

```datalog
unattributed(C) :- out_why(_, _, _, C), not constraint(C, _, _).

never unattributed(C)
```

> **Holds — 0.** Positive control in the same run, so the zero is a
> measurement and not a refusal (`examples/notebook/ledger.FRICTION.md`'s
> own lesson, applied here rather than just cited): `out_why(P, D, S, C)`
> itself is non-empty across the week (R1 already listed four rows of it),
> and `constraint/3` is the relation R1's `owner`/`external`/`household`
> queries read successfully — both sides of this rule are populated and
> exercised elsewhere in this file, so an empty `unattributed` here is a
> real all-clear, not the "nothing in the model can put a row here" shape
> R1's failed first attempt produced.

## R5 · Every child's transport has a backup

```natural
R5 Every child's transport has a backup: no school run works only because nothing else was tried.
```

```datalog
? run_fragile(T)
? run_stuck(T)

never run_fragile(T)
```

> `run_stuck` is empty (matches R0: no `broken(no_way)` — every run happens
> somehow). `run_fragile` — happens, but by exactly one way, so any single
> thing going wrong that day breaks it — is **4**: `go(school_kit, tue)`,
> `back(school_kit, mon)`, `back(school_kit, wed)`, `back(school_kit, thu)`.
> All four are Kit's, none are Nico's (Nico is driven both ways every day;
> Kit rides the bus home and, on the days it runs, has only the bus).
> `why run_fragile(back(school_kit, mon))` shows the one way in full —
> `way(back(school_kit, mon), lift(school_bus))` — and the failing premise
> underneath `run_alt` is literally `lift(school_bus) != lift(school_bus)`:
> there is nothing to compare it against, not a second option that lost.
> Trying `? way(back(school_kit, mon), W)` confirms it directly: one row.

## R6 · A constraint the household does not own is not the household's to fix

```natural
R6 A constraint the household does not own is not the household's to fix: the cheapest thing to give is not always the thing that actually caused the hole.
```

> Reads back R1's own numbers under a different question: not "why is
> Thursday evening uncovered" but "of the two named causes, which one could
> this household actually change without a conversation outside it."
> `owner`/`external`/`household`/`give_cost` (R1) already answer it:
> `c_acme` — external, owned by `acme`, costed at the unadjusted default of
> `200` — is not a lever this household holds at all; `c_swim` — household,
> owned by `robin`, explicitly costed at `40` — is. R1's what-if is the
> proof, not a repeat of the query: taking out the `40` constraint's swim alone
> closed the hole; the `200` one was never touched and did not need to be.
> A parent reading only `out_why`'s two rows, with no `owner`/`give_cost`
> beside them, would have no way to tell which of the two names is worth
> arguing about and which is not an argument at all — that distinction is
> the whole point `examples/spat/README.md` makes about the `Owner`/`Scope`
> field, and it is not visible from `uncovered`/`out_why` alone.

## R7 · Time marked as free is genuinely free, not solo watch

```natural
R7 Time marked as free is genuinely free, not solo watch: a gap in an adult's day only counts as rest if nobody else's coverage depends on that adult staying put.
```

> `spat free` gates a chunk of the model behind `asking(free)` because
> materialising it is not free itself (`spat.rofl`'s own comment: "a third
> of the model's cost"); asserted once, as a fact, it applies to the whole
> file, but nothing above reads `busy`/`sole`/`free_slot`/`on_call` at all,
> so none of R1–R6's numbers move by adding it here.

```datalog
asking(free).

? free_slot(P, D, S)
? on_call(P, D, S)
```

> `free_slot` — genuinely free, not the only person a child could turn to
> — is **411** slot-rows across the week for the two adults. `on_call` —
> alone in the house with nobody else backing them up, which the naive
> "not busy" reading would also call free — is **29**. Robin's Monday and
> Friday physio→pickup gap (R2's zero-slack chain) is inside `on_call`, not
> `free_slot`: the same twenty-five minutes that has no room for a slow
> drive also has no room to call it a break.

```datalog
never on_call(P, D, S)
```

> **FAILS · 29**, kept as a `never` on purpose, the way
> `examples/notebook/self.rofl.md` keeps I7 deliberately false: the point
> of this invariant is not that on-call time should not exist (it plainly
> must, for a two-adult household with one car and one nanny window a
> week) — it is that the 29 rows exist and are not the same 29 rows a
> "free time" report that only reads `raw_gap` would show.
>
> The stronger question a parent would actually ask — "is on-call time
> roughly even between the two adults" — is a `count` over these rows:

```datalog
on_call_min(P, M) :- on_call(P, _, _), grid(G), N is count(D, S : on_call(P, D, S)), M is N * G.

? on_call_min(P, M)
```

> No: Alex is on call 180 minutes of the week, Robin 400.

## Where this leaves the week

> One real hole (R1): Thursday 17:40–18:00, both children, caused by two
> constraints stacking — Alex's Thursday Acme evening (external, not the
> household's to move) and Robin's swim, moved onto the same evening by an
> unrelated dentist appointment earlier in the week (household, and cheap
> to move: R6). R1's `excise` confirms giving the
> cheap one alone is sufficient. A second, structural risk (R2): the
> household's tightest handover, physio straight into pickup twice a week,
> has exactly zero minutes of slack and rests on a travel figure the week
> file itself marks as never actually timed. A third (R5): two of Kit's
> four weekday school-run legs have no fallback if the bus or the one
> driver falls through. R3 and R4 are clean: nobody is double-booked, and
> every hole the model finds does name its cause. R7 separates real rest
> from on-call time (411 against 29 slot-rows) and answers
> the fairness question a parent would ask next with a `count`
> (`on_call_min`).
>
> This file's own run does not exit 0: R1's first attempt is a deliberately
> unread `rofl` cell (kept, not deleted, per the convention
> `examples/notebook/self.rofl.md` sets), and R1, R2, R5 and R7 each carry a
> `never` that genuinely fails, on purpose, because the week genuinely has
> these four problems. `examples/notebook/spat.FRICTION.md` has the tool's
> own rough edges found along the way, ordered by what they cost.
