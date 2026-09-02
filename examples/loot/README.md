# LOOT — rules as plunder

An NPC walks a swamp road, takes books off corpses, and reads them. **A book is
a rulepack.** Reading it puts its rules in the NPC's head, and the head is a
ROFL store — so "reading a book" is `load`, and nothing else.

Two NPCs walk the same road and find the same six books. One leafs through each
book before absorbing it; the other swallows. At the end of the road one of them
is alive.

The fiction is doing real work. *Leafing through a book before you absorb it* is
installing a package in a sandbox, diffing the result, and deciding — and in a
swamp nobody has to be persuaded that it is a reasonable thing to do.

This is **one spec and not three**. A rulepack without versioning is pointless;
versioning without foreign rules is uninteresting; foreign rules without a pack
format are a copy-paste. The three arrive together or not at all.

## How to run

```sh
node --experimental-strip-types examples/loot/demo.ts    # the transcript below
node --experimental-strip-types --test test/example-loot.test.ts
node --experimental-strip-types src/repl.ts examples/loot/loot.rofl
```

In the REPL (nothing is installed, so this is the native head):

```
? threat[mind](T)
? unjudged[audit](T)
whynot opens[mind](false_chest)
? produces[world](Rel)
```

## What it shows

| the spec asks for | where |
|---|---|
| pack = rules + vocabulary + extractor version; an incomplete pack does not install | `loot.rofl` §4, transcript §1 |
| `asserted_by` of a derived edge includes the pack | §6 — `derived_by` ⋈ the manifest, and the polynomial fold |
| quarantine: install in a fork, diff, decide | `loot.rofl` §6, transcript §2 and §3 |
| conservativity, with automatic acceptance when nothing is lost | §3, §5(b) |
| all four ways a pack makes you smarter | §5 |
| at least six of the eight poisonings, mute and trojan included | §4 — **all eight** |
| hanging caught by a budget, not by an outside timeout | §4, the Chant |
| unloading a pack transitively extinguishes what stood on it | §7 |
| MOOT finds dead books | §8 |
| two NPCs, one route, different fates | §2 |

## The three things this stands on, all already in the kernel

**Rules are facts.** `load` turns every clause into reflection facts, and the
evaluator reads rules *only* from the store (`src/reflect.ts`). So a pack is not
a new kind of object. Installing one is asserting facts; unloading one is
retracting them; **a fork of the store is a fork of the rule set**. Quarantine is
`Rofl.fromSnapshot(r.save())` and no new machinery at all.

**Rule identity is content-addressed.** `ruleIdOf(c)` is `r` + fnv1a of the
canonical clause serialization, so two rules are the same rule *iff they are
literally the same clause*. That gives versioning in its strongest form, free: a
manifest names its rules by hash, a tampered edition fails to match, and the diff
between two editions is a set difference on ids. It also has one sharp edge,
measured below and reported as a finding rather than papered over.

**Provenance is kernel-emitted.** Every firing writes `derived_by(Fact, RuleId,
Tick)`. Joining that with the manifest answers *which book is behind this
belief*, with no annotation anywhere and no cooperation from the pack. Four rules
in `loot.rofl` §5 do it.

## The pack format

Not rules. **Rules + the predicate vocabulary they need + the version of the
extractor that produces it.**

A rule is not self-standing: it names predicates, and predicates come out of the
thing that turns the world into facts. A pack works only if the vocabularies
line up. So a manifest is five relations, in the book's own ledger, signed by its
author:

```prolog
pack[codex_of_thorns](codex_of_thorns).
pack_title[codex_of_thorns](codex_of_thorns, "A Codex of Thorns").
pack_author[codex_of_thorns](codex_of_thorns, thornwood_of_the_low_fen).
pack_extractor[codex_of_thorns](codex_of_thorns, 2).
pack_needs[codex_of_thorns](codex_of_thorns, glows).
pack_rule[codex_of_thorns](codex_of_thorns, ra83754c7).
```

The rule list is content hashes, computed by the packer from the very text that
ships beside it. Nobody writes a hash by hand and nobody has to be trusted for
the check to work: **the hash is the name**, so a text that does not hash to the
name it was shipped under is not that rule.

Three ways a book is unusable before a single rule of it runs, and they are
different failures with different remedies:

```prolog
incomplete[audit](P)  :- known_pack[audit](P), not pack_extractor[P](P, _).
version_gap[audit](P, V, W) :- pack_extractor[P](P, V), extractor_version[world](W), V != W.
missing_predicate[audit](P, Rel) :- pack_needs[P](P, Rel), not produces[world](Rel).
mute[audit](P) :- missing_predicate[audit](P, _).
```

`pack[P](P)` reads the manifest through a **variable perspective**: "in whichever
book's ledger it lives". The pack's id and the name of its ledger are the same
atom on purpose, so `imports(mind, P)` is a sentence about the same thing the
manifest is about.

## Perspectives here

`docs/choosing-perspectives.md` says a perspective is a **ledger** — a truth
context with a named list of who may write into it — never a status and never a
modality. Five ledgers:

| ledger | what is in it | who may write |
|---|---|---|
| `[world]` | what the extractor saw | `authority(world, extractor)` |
| `[mind]` | the reader's own conclusions | rules only (a derived ledger) |
| `[<book>]` | one per book: its manifest and its outright claims | its author |
| `[quarantine]` | what a trial reading showed: `proposed`, `gained`, `lost` | the reader |
| `[audit]` | the verdicts, as in `boot.rofl` and `examples/moot` | rules only |

*"Rules I got off the dead wizard"* is a ledger, and it pays immediately: an
edition of the Codex signed by the wrong hand is `forged[audit]`, mechanically,
with no enforcement code — the same way an impostor scanner surfaces in
`test/scanner.test.ts`.

*"Books I trust"* is **not** a ledger. Trust here is derived, in `loot.rofl` §6,
from what the fork showed; a book can move from accepted to refused without
anything being re-filed.

`[quarantine]` deserves its own line, because it looks like it might be a status
and is not. It holds *measurements* — "installing this pack in a fork gained
these facts and lost those" — one entry per book leafed through, written by the
reader. The verdict computed from it (`accept`, `refuse`, `ruling`) is a derived
relation in `[audit]`, which is where a status belongs.

## The quarantine

The mechanism the whole example is for.

```
fork = Rofl.fromSnapshot(r.save())     -- a copy of the store IS a copy of the rules
install the pack in the fork
diff the reader's own ledger, both ways
assert the diff back into the real store as [quarantine] facts
let the rules rule
```

The diff is host arithmetic — two stores cannot be compared inside one — but
**everything decided about it is a rule**, so the policy is inspectable and
`why refuse[audit](grimoire_of_ash)` is an answer rather than a stack trace:

```text
refuse[audit](grimoire_of_ash)  <= rcb77ef2f @tick 0
  proposed[quarantine](grimoire_of_ash) [axiom]
  takes_away[audit](grimoire_of_ash)  <= rbec1c811 @tick 0
    lost[quarantine](grimoire_of_ash,opens,supply_chest) [axiom]
```

Conservativity is not a separate ritual. `accept` **is** "it took nothing away";
`refuse` is "it did". The reader's two extra clauses of `refuse` — a book that
concludes into a relation the reader keeps to itself, and a book that reverses a
verdict already held — sit on top of conservativity rather than weakening it.

### How a pack takes something away at all

Datalog is monotone in *facts*: adding facts only ever adds conclusions. It is
**not** monotone in *rules*, and negation is the door. The native head has
exactly one negated head-relation:

```prolog
suspect[mind](C) :- container[world](C), lure_sign[world](C).
safe[mind](C)    :- container[world](C), not suspect[mind](C).
opens[mind](C)   :- container[world](C), safe[mind](C), at[world](R), here[world](C, R).
```

The Grimoire of Ash adds one rule — `suspect[mind](C) :- container[world](C),
scorched[world](C).` — and a supply chest that survived a fire stops being
openable. Adding a rule cannot *add* a `safe` fact; it can only take one away.
Nothing in the native head anticipates the grimoire; the door is structural.

The other direction reads just as well. With four books swallowed, `whynot` names
both rules that could have opened the chest and why each failed — one native,
blocked by a foreign premise, one foreign, failing on its own terms:

```text
whynot opens[mind](supply_chest):
  rule r8f5f8191: opens[mind](?C)@now :- container[world](?C)@now, safe[mind](?C)@now, at[world](?R)@now, here[world](?C,?R)@now
    failed premise: safe[mind](supply_chest)
      rule r080165dd: safe[mind](?C)@now :- container[world](?C)@now, not suspect[mind](?C)@now
        failed premise: not suspect[mind](supply_chest) -- blocked: suspect[mind](supply_chest) holds
      rule r5dcbb40a: safe[mind](?C)@now :- container[world](?C)@now, ward_glyph[world](?C)@now
        failed premise: ward_glyph[world](supply_chest)
          no rule concludes 'ward_glyph' and no matching base fact exists
```

## The shelf

Thirteen books. "A bad rulepack" is not one failure mode, so each is bad in a
different way.

| book | on the road | what it is |
|---|---|---|
| A Codex of Thorns | 1 | closes a hole: a glowing thing in wet ground had no verdict at all |
| The Broken Seal | 2 | **mute** — needs a predicate this extractor cannot produce |
| The Grimoire of Ash | 3 | **non-conservative** — a thing you could do stops being derivable |
| The Hexer's Marginalia | 4 | **substituted meaning** + a split belief |
| A Dead Man's Ledger | 5 | **trojan** — you owe your sword to the man who wrote the book |
| The Fen Wardens' Primer | 6 | conservative extension, and it shares a rule with the codex |
| A Sighting on the Low Road | — | **cheaper proofs**, and therefore an empty diff |
| A Tongue of the Deep | — | **bridge** — worth nothing alone |
| A Bog Herbal | — | useless until the bridge arrives |
| The Chant of Endless Names | — | **hangs** — a recursion no budget finishes |
| An Old Bestiary | — | **version gap** — written when `hostile` meant something wider |
| The Dune Walker's Rule | — | **dead** — correct rules about a desert, carried through a swamp |
| The Weight of the World | — | **too dear** — correct, and it does not fit in one encounter |

### The mute pack is the worst of the eight

Read it and nothing happens. No error, no warning, no new belief — and *"found no
threats"* looks exactly the same. Silence is indistinguishable from an all-clear.

Two independent things catch it, and both were already in the repository:

- the **manifest check** — `pack_needs(broken_seal, heat_bloom)`, and
  `produces[world](heat_bloom)` does not hold;
- **`boot.rofl` itself**, if it is installed anyway — `undefined_premise[audit]`
  is exactly the audit for a positive premise on a relation nothing concludes
  and no fact populates.

### "Nothing gained and nothing lost" has two readings

This is the sharpest thing in the example, and it is the reason the four *good*
cases and the eight *bad* ones belong in one file.

A mute pack comes back from the fork with an empty diff. So does a pack that
reaches exactly the same conclusions by **shorter derivations** — and that one is
worth taking. The conservativity check cannot tell them apart, and `loot.rofl`
does not pretend it can: it returns `ruling[audit]`, which means *the fork has
nothing to say; ask something else*.

The something else is the tropical semiring. A shortcut lowers a proof cost; a
mute pack moves none:

```text
crosses[mind](troll_bridge)        2 -> 1 firings
treats[mind](wound)                3 -> 1 firings
```

## Hanging is caught by a budget, from inside

`name[mind](T, N1) :- name[mind](T, N), N1 is N + 1.` invents a new constant every
round, so there is no fixpoint to reach. The engine does not spin and nothing
outside it has to notice: it spends the reader's thinking budget, records
`hole($load(N), budget_exhausted)` as a **fact**, and hands back what it had.

The budget is a number the reader owns — 2000 firings per encounter, against a
native head that costs about 750. That makes the difference between two books
measurable rather than felt:

| | at 2000 firings | at 100000 firings |
|---|---|---|
| The Chant of Endless Names | partial, 624 names | partial, 49624 names |
| The Weight of the World | partial, 1322 of 2024 conclusions | complete, 2024 |

One is unpayable and the other is merely expensive, and the reader can tell them
apart by paying more once. In both cases the partial answer is still usable —
that is what `budget_exhausted` as a first-class term buys.

## Unloading, and the fade

A rule lives in the store as twelve reflection facts. Removing them is the whole
of unloading, and everything derived through the rule stops being derivable at
the next evaluation — not patched, not marked stale, simply not re-derived.
Excising the grimoire brings `safe[mind](supply_chest)` **back**, because with
the rule gone it is derived again. That is OOPS's un-retraction, read from the
other side.

Two things the mechanism forces, both in the transcript:

**Content addressing means a rule can have two owners.** The Codex and the
Wardens' Primer both ship
`threat[mind](T) :- beast[world](T), glows[world](T), wet[world](T).` — the same
text, therefore the same id, therefore **one rule**. Unloading one owner must
leave the rule standing for the other. Nothing had to be reference-counted: the
id *is* the rule and `pack_rule` already records both claims.

**`retract` cannot do it.** The reflection facts of a rule include reified premise
terms (`$lit`, `$cons`, `$var`), and `$` is not writable in ROFL source syntax, so
there is no text a caller could hand to `retract`. `unload` therefore works over
the public `Store` API in host code. `excise rule(R)` — which *is* writable, since
a rule id is an ordinary atom — gives the same blast radius as a **preview**, and
the transcript uses it as the oracle against the fork diff.

## The semirings

| semiring | what it answers here |
|---|---|
| Boolean | is this derivable with this pack installed |
| Polynomial | which books carry this belief — attribution, transitively |
| Counting | how many independent derivations; one, and that one foreign, is fragile |
| Tropical | did the proofs get cheaper |
| Best-derivation | *why do I believe this*, naming the book and the rule |

The polynomial fold is worth a sentence. The pack is passed as the **weight of a
firing**, not as the annotation of a base fact, so a monomial is *the set of
books one derivation used* and the value of a belief is the set of minimal such
sets. A belief with an empty monomial rests on no book at all. A belief every one
of whose monomials names a book dies when that book does — which §7 then does,
and the two answers agree.

The counting fold reads, in this domain, as **fragility of belief** — as in NOPE
and OOPS, not magnitude as in HUH. It counts derivations, never things in the
world: a belief scoring 2 has two ways to be reached, not two things behind it.

## Findings

### Rule identity keeps variable names

`canonClause` renders a variable as `?` + its **source name**, so the canonical
form of a clause keeps the letters the author happened to type, and `ruleIdOf`
hashes that. Two clauses that differ only in variable naming are different rules.

`canonVars` — which renames a term list to positional placeholders, and is
exactly the function this would need — exists in `src/unify.ts` and is used by the
engine for *rendering* only (`resolvedLitKey`, the builtin premise description).
`ruleIdOf` does not call it.

Measured, not asserted, in §9 of the transcript and in the test:

1. a diff between two editions that differ only in variable names reports **2
   rules removed and 2 added**, when nothing changed;
2. installing both editions installs **both**, and every conclusion they share
   now has **two derivations where it had one** — so the fragility number of the
   attribution section is inflated by a rename.

(2) is the half that reaches a conclusion somebody would act on: a reader looking
at "this belief has two independent supports" would conclude it is robust, and it
is not. The Boolean world is unchanged, so this is a provenance defect and not a
soundness one.

**Wildcards do not leak.** The parser numbers `_` per clause
(`freshCounter = 0` at the top of `clause()`), so two clauses written with `_` in
the same places hash alike. It is named variables only. The test carries a
positive control: moving a wildcard to a different argument position really does
change the id, so the "no leak" half is not vacuous.

### Reading provenance in a rule turns derived-relation reuse off

`loot.rofl` §5 reads `derived_by` in a rule body, and it is the first *model* in
this repository to do so. The kernel already anticipated it — a rule triggered by
derivations anywhere in the program is outside the cone argument reuse rests on,
so `src/engine.ts` declines to fingerprint anything rather than reuse something
it cannot promise, and `test/derived-reuse.test.ts` pins that behaviour. What is
new here is **paying for it**, and the price is visible in one number:

```text
fingerprinted derived relations, boot.rofl alone:  15
fingerprinted derived relations, boot + loot.rofl: 0
```

That is a real trade and worth stating as one: pack attribution and the dead-book
audit cost this program every later evaluation's reuse. A host that wanted both
would compute attribution outside the rules, from `store.witnessesOf`, exactly as
the polynomial fold in §6 already does — and would then have no `why` tree for
it, which is the whole reason §5 is in rules.

### The quarantine decision is a rule, and that was not free either

Putting `gained`/`lost` back into the store as facts is what makes
`why refuse[audit](P)` work. It also means the reader's store accumulates a
`[quarantine]` entry per book leafed through — which is correct (it is a journal)
but means a long road grows the store monotonically. Nothing here needs it
pruned; a real deployment would.

## What could not be modelled

**Semantic pack compatibility beyond the vocabulary check.** The manifest check
compares *predicate names*. Nothing here proves that two packs agree about what a
predicate **means** — the Hexer's Marginalia is caught only because it happens to
reverse a verdict the reader already held on a chest that is in front of it. A
book that redefined `safe` for objects the reader has not met yet would pass
quarantine cleanly and go off later. Detecting that needs a specification of the
predicate beyond its name, and there is none. This is the honest limit of "check
compatibility, do not resolve dependencies".

**A dependency resolver, deliberately.** Not attempted, and the spec says why:
resolution is SAT, distribution is solved elsewhere, and there are zero packs in
the world. What is here is the **format** and the **compatibility check** — the
half nobody else can do for you.

**Ticks.** The road is six worlds, each built from scratch, not six ticks of one
world. The reason recorded here was that `@next` carry rules make every carried
fact its own support one tick back, which is a self-loop, and the counting
semiring is `CLOSED` — so past tick 0 every count read `infinitely many` and the
fragility number of §6 would have been meaningless. **That reason has expired.**
`examples/oops` measured the mechanism and `examples/npc` could not route around
it, and it is fixed in the fold: a fact that arrived over a tick boundary is a
given in the tick that reads it, count one, so the boundary edge is not walked
(`docs/time-and-continuity.md`, `src/semiring.ts`). Ticks would now keep the
fragility number intact. What remains is a preference rather than a constraint:
rebuilding costs about 45 ms a world, and the thing that moves down the road —
where the reader is, what it carries, whether it is wounded — is a `State` the
host holds and re-seeds (`world(state)` in `demo.ts`), so a carry rule would be
restating what the harness already knows.

**Partial packs.** A book installs whole or not at all. Installing four rules of
a five-rule pack is expressible (`load` takes text) but there is no manifest-level
way to say "these four", and inventing one would be inventing a package manager.

## The transcript

Real output of `node --experimental-strip-types examples/loot/demo.ts`, pasted
verbatim.

```text
LOOT — rules as plunder.
an NPC takes books off corpses and loads them into its head. A book is a
rulepack; reading it is `load`; leafing through it first is a fork.

shelf    13 books, 18 rules between them
road     6 rooms, 6 of the books lying on it
rules    examples/loot/loot.rofl, loaded next to boot.rofl

== 0. hygiene: what the rest of this transcript rests on =====================
  59 rules loaded (boot.rofl + loot.rofl); every one range-restricted: true
  relations evaluated by demand (top-down unfolding): 0
  unstratified: (none)
  boot.rofl's audits over LOOT's own reflection: malformed 0, breach 0, leak 0, forged 0, unmoded 0, undefined_premise 0
  a full re-evaluation of the native head costs 758 firings; the
  wanderer's thinking budget for one encounter is 2000.

  the head it starts with, before a single book:
    ? threat[mind](T)      eel, troll
    ? harmless[mind](T)    bog_stump
    ? suspect[mind](C)     false_chest
    ? safe[mind](C)        supply_chest
    ? unjudged[audit](T)   marsh_light, wisp
  the wisp is moving and glowing but neither armed nor rooted, so no rule
  reaches a verdict on it. `unjudged` says so rather than defaulting to safe.

== 1. the shelf, judged before a single rule of it runs ======================
a pack is rules + the predicate vocabulary they need + the extractor version
they were written against. Shelving a book puts only its MANIFEST in the
store — five relations, in the book's own ledger, signed by its author.
Nothing executes; these verdicts are already answerable:

  book                    v  rules  verdict
  codex_of_thorns         2  2      installable
  broken_seal             2  1      MUTE (needs heat_bloom)
  grimoire_of_ash         2  1      installable
  hexers_marginalia       2  1      installable
  dead_mans_ledger        2  1      installable
  wardens_primer          2  2      installable
  low_road_sighting       2  2      installable
  tongue_of_the_deep      2  1      installable
  bog_herbal              2  1      installable
  chant_of_endless_names  2  2      installable
  old_bestiary            1  1      WRONG WORLD (wants v1)
  dune_walkers_rule       2  2      installable
  weight_of_the_world     2  1      installable

  and an incomplete pack does not install. The same codex with its extractor
  line torn out of the manifest:
    incomplete[audit](a_torn_codex)  -> true
    installable[audit](a_torn_codex) -> false
  oracle: AGREE — a manifest without an extractor version is not installable

== 2. the road, walked twice — one route, one set of books ===================
the same six rooms, the same six books, in the same order. The only
difference is whether a book is leafed through in a fork before it is
absorbed. Left column: the careful one. Right column: the reckless one.

  1. SWAMP_GATE  —  a dead botanist, and a stump that looks like a beast
     book: codex_of_thorns
       careful   read it
       reckless  swallowed it
  2. DROWNED_MILL  —  a drowned pilgrim; an eel in the race
     book: broken_seal
       careful   left it: says nothing here
                 · needs heat_bloom, which the extractor never produces
       reckless  swallowed it
  3. CORPSE_FIELD  —  a burnt sorcerer, and a scorched supply chest
     book: grimoire_of_ash
       careful   left it
                 · takes away opens(supply_chest)
                 · takes away safe(supply_chest)
                 -> opens supply_chest
       reckless  swallowed it
  4. WISP_HOLLOW  —  a wisp, and a chest that is not a chest
     book: hexers_marginalia
       careful   left it
                 · calls false_chest safe, and we hold it suspect
       reckless  swallowed it
                 -> opens false_chest
                 -> the chest bites — wounded
  5. TROLL_BRIDGE  —  a troll on the span; a ledger on the last traveller
     book: dead_mans_ledger
       careful   left it
                 · concludes into hand_over, which is the reader's own business
                 -> fights the troll and crosses — takes a wound
       reckless  swallowed it
                 -> hands over the sword to the_ashen_hand
                 -> cannot cross: nothing to fight the troll with
  6. DRY_SHRINE  —  a dead warden's primer, a marsh light, and the notches on the post
     book: wardens_primer
       careful   read it
                 -> treats the wound
       reckless  (never got here)

  the careful one:  alive at the shrine, carrying sword, bandage
  the reckless one: dead at troll_bridge, carrying nothing

  nothing in the road was arranged against the reckless one. It read the same
  books, in the same order, and every one of them did exactly what its rules
  say. The difference is four forks.
  oracle: AGREE — the careful one survives the road and the reckless one does not

== 3. quarantine, up close ===================================================
$ at corpse_field, before the grimoire:
    crosses[mind](troll_bridge)
    harmless[mind](bog_stump)
    holds[mind](sword)
    opens[mind](supply_chest)
    safe[mind](supply_chest)
    suspect[mind](false_chest)
    threat[mind](eel)
    threat[mind](troll)

$ leaf through the Grimoire of Ash  (install in a fork, diff, come back)
    gained: suspect[mind](supply_chest)
    lost:   opens[mind](supply_chest), safe[mind](supply_chest)
    verdict: refuse

and the verdict is a RULE, not a branch in TypeScript. The diff came back
into the store as [quarantine] facts and loot.rofl decided:

    refuse[audit](grimoire_of_ash)  <= rcb77ef2f @tick 0
      proposed[quarantine](grimoire_of_ash) [axiom]
      takes_away[audit](grimoire_of_ash)  <= rbec1c811 @tick 0
        lost[quarantine](grimoire_of_ash,opens,supply_chest) [axiom]

read the bottom line. `suspect[mind](supply_chest)` is what the grimoire
ADDS, and `safe[mind](C) :- container[world](C), not suspect[mind](C)` is a
native rule. Adding a rule cannot add a `safe` fact; it can only take one
away. That is the one door a foreign pack has into the reader's existing
conclusions, and nothing in the native head anticipates the grimoire.

ORACLE. The fork diff is one computation. `excise rule(R)` on the INSTALLED
world is a second one, by different machinery — a clean re-evaluation on the
store minus that one reflection fact:
    fork says the install loses:      opens[mind](supply_chest), safe[mind](supply_chest)
    excise says removing it restores: opens[mind](supply_chest), safe[mind](supply_chest)
    excise says removing it costs:    suspect[mind](supply_chest)
  oracle: AGREE — the fork diff and excise agree on what the grimoire takes away

== 4. the eight ways a book poisons you ======================================
  forgot what it knew  grimoire_of_ash         fork diff: loses opens, safe
  substituted meaning  hexers_marginalia       overrules[audit]: false_chest
  mute pack            broken_seal             missing_predicate: heat_bloom; and undefined_premise[audit] if installed anyway
  hangs                chant_of_endless_names  hole(_, budget_exhausted) at 2000 and at 100000 firings
  split belief         hexers_marginalia       split[audit]: hexers_marginalia calls false_chest calm
  trojan               dead_mans_ledger        trespass[audit]: hand_over
  version gap          old_bestiary            version_gap[audit]: wants v1, world is v2
  too dear             weight_of_the_world     partial at 2000 firings, complete at 100000

THE MUTE PACK IS THE WORST OF THE EIGHT, and the reason is in its row. Read
it and nothing happens. No error, no warning, no new belief — and "found no
threats" looks exactly the same. Two independent things catch it, and both
are already in the repository:
    the manifest check      pack_needs(broken_seal, heat_bloom), and
                            produces[world](heat_bloom) does not hold
    boot.rofl, if installed undefined_premise[audit] = 1: r2f762479 reads heat_bloom
  oracle: AGREE — the mute pack is caught by the manifest and again by boot.rofl

AND THE HANG IS CAUGHT FROM INSIDE. `name[mind](T, N1) :- name[mind](T, N),
N1 is N + 1` invents a new constant every round, so there is no fixpoint to
reach. The engine does not spin: it spends the budget, records
hole($load(N), budget_exhausted), and hands back what it had.

    at 2000 firings   load ok: true   partial: true   holes: 2   names derived: 615
    at 100000 firings load ok: true   partial: true   holes: 2   names derived: 49615
    a bigger budget buys more names and never buys an answer. That is the
    difference between this book and the next one:
    weight_of_the_world at 2000: partial true, 1310 conclusions
    weight_of_the_world at 100000: partial false, 2024 conclusions
    one is unpayable and the other is merely expensive, and the reader can
    tell them apart by paying more once.
  oracle: AGREE — the chant never settles and the heavy book settles at a larger budget

== 5. the four ways a book makes you smarter =================================
  (a) A HOLE CLOSED — a situation no rule covered
      before: unjudged[audit] -> marsh_light, wisp
      after:  unjudged[audit] -> (none)
              threat[mind]    -> eel, marsh_light, troll, wisp

  (b) A CONSERVATIVE EXTENSION — strictly more, nothing lost
      gained: imminent[mind](wisp)
      lost:   (nothing)
      verdict: accept  — accepted automatically, because it takes nothing away
  oracle: AGREE — a pack that takes nothing away is accepted without a ruling

  (c) CHEAPER PROOFS — the same conclusions, shorter derivations
      gained: (nothing)
      lost:   (nothing)
      verdict: ruling  — the fork diff is EMPTY, and the fork diff is
               all the conservativity check can see

      tropical (min-plus, 1 per firing) over the same store, before and after:
        crosses[mind](troll_bridge)        2 -> 1 firings
        treats[mind](wound)                3 -> 1 firings

      SO "NOTHING GAINED AND NOTHING LOST" HAS TWO READINGS, and the mute pack
      of §4 is the other one. Both come back from the fork as an empty diff;
      `ruling[audit]` is the rules refusing to guess which. The tropical fold
      settles it: a mute pack changes no cost, a shortcut lowers one.
  oracle: AGREE — the shortcut pack lowers a proof cost while changing no conclusion

  (d) A BRIDGE — a book worth nothing alone that makes two others work
      tongue + herbal, no codex:   antidote[mind] -> (nothing)
                                   undefined_premise[audit] -> venom_sign
      codex + herbal, no tongue:   antidote[mind] -> (nothing)
      all three:                   antidote[mind] -> wisp
      the tongue derives nothing of its own in any of the three worlds. It
      translates `venom_sign` in the codex's ledger into `toxic` in the
      herbal's, and that is its entire content. AKA, applied to rulepacks.
  oracle: AGREE — the bridge pack is inert alone and decisive in company

== 6. which book is behind this belief =======================================
five books swallowed, the version-gapped bestiary among them. Every belief
now in the head, and the minimal sets of
books each one rests on — folded from the kernel's own support records, with
the PACK as the annotation of a firing. No pack cooperates in this.

  crosses[mind](troll_bridge)            the reader's own
  hand_over[mind](sword,the_ashen_hand)  dead_mans_ledger
  harmless[mind](bog_stump)              the reader's own
  holds[mind](sword)                     the reader's own
  safe[mind](false_chest)                hexers_marginalia
  suspect[mind](false_chest)             the reader's own
  suspect[mind](supply_chest)            grimoire_of_ash
  threat[mind](bog_stump)                old_bestiary
  threat[mind](eel)                      the reader's own
  threat[mind](marsh_light)              codex_of_thorns
  threat[mind](troll)                    the reader's own
  threat[mind](wisp)                     codex_of_thorns

the trojan, asked directly:

    hand_over[mind](sword,the_ashen_hand)  <= r014844a8 @tick 0
      holds[mind](sword)  <= ra957e68d @tick 0
        carries[world](sword) [axiom]
      owed[dead_mans_ledger](the_ashen_hand) [axiom]

  the rule at the top of that tree is r014844a8, and it belongs to dead_mans_ledger
  — read off `pack_rule`, which the book itself wrote, and `derived_by`,
  which the kernel wrote. If either were missing the belief would still be
  there and there would be no way to ask where it came from.

and the other direction. Something this head could do at the gate, it can no
longer do; `whynot` names both rules that could have reached it and why each
one failed — one native, blocked by a foreign premise, one foreign outright:

    whynot opens[mind](supply_chest):
      rule r8f5f8191: opens[mind](?C)@now :- container[world](?C)@now, safe[mind](?C)@now, at[world](?R)@now, here[world](?C,?R)@now
        failed premise: safe[mind](supply_chest)
          rule r080165dd: safe[mind](?C)@now :- container[world](?C)@now, not suspect[mind](?C)@now
            failed premise: not suspect[mind](supply_chest) -- blocked: suspect[mind](supply_chest) holds
          rule r5dcbb40a: safe[mind](?C)@now :- container[world](?C)@now, ward_glyph[world](?C)@now
            failed premise: ward_glyph[world](supply_chest)
              no rule concludes 'ward_glyph' and no matching base fact exists

  the first rule is the reader's own and it fails on `not suspect`, which the
  grimoire made true. The second is the hexer's and it fails on its own terms:
  no ward glyph on this chest. Two books, two different ways of not helping,
  and neither of them had to be looked for.

and how FRAGILE each belief is — how many independent derivations it has:
  crosses[mind](troll_bridge)              1  has a native derivation
  hand_over[mind](sword,the_ashen_hand)    1  FOREIGN ONLY
  harmless[mind](bog_stump)                1  has a native derivation
  holds[mind](sword)                       1  has a native derivation
  safe[mind](false_chest)                  1  FOREIGN ONLY
  suspect[mind](false_chest)               1  has a native derivation
  suspect[mind](supply_chest)              1  FOREIGN ONLY
  threat[mind](bog_stump)                  1  FOREIGN ONLY
  threat[mind](eel)                        1  has a native derivation
  threat[mind](marsh_light)                1  FOREIGN ONLY
  threat[mind](troll)                      2  has a native derivation
  threat[mind](wisp)                       1  FOREIGN ONLY
  (8 facts on a cycle of the support graph)

  IN THIS DOMAIN THE COUNT IS FRAGILITY OF BELIEF, as in NOPE and OOPS, not
  magnitude as in HUH. It counts derivations, never things: a belief scoring
  2 has two ways to be reached, not two things behind it. A belief with one
  derivation and that one foreign is the fragile kind — it goes when the book
  goes, and §7 makes it go.

AND THE VERSION GAP, WHICH NOTHING ABOVE FLAGGED. The bestiary was written
when `hostile` meant "attacks on sight"; in this extractor it is a faction
mark and says nothing about danger. The rule still parses, still fires, and
the reader now holds two opposite verdicts about the same thing:
    threat[mind]    -> bog_stump, eel, marsh_light, troll, wisp
    harmless[mind]  -> bog_stump
    confused[audit] -> bog_stump
    threat[mind](bog_stump) rests on old_bestiary
  no explosion: the two facts are different facts and both stand. What the
  shelf check of §1 would have said, before any of this ran, is
  version_gap[audit](old_bestiary, 1, 2) — and the reckless reader did not ask.
  oracle: AGREE — the version-gapped book leaves the reader holding both verdicts at once

== 7. forgetting a book, and what fades with it ==============================
  with the codex and the grimoire both read:
    crosses[mind](troll_bridge)
    harmless[mind](bog_stump)
    holds[mind](sword)
    suspect[mind](false_chest)
    suspect[mind](supply_chest)
    threat[mind](eel)
    threat[mind](marsh_light)
    threat[mind](troll)
    threat[mind](wisp)

  $ forget grimoire_of_ash   (1 rules, 13 reflection facts removed)
    crosses[mind](troll_bridge)
    harmless[mind](bog_stump)
    holds[mind](sword)
    opens[mind](supply_chest)
    safe[mind](supply_chest)
    suspect[mind](false_chest)
    threat[mind](eel)
    threat[mind](marsh_light)
    threat[mind](troll)
    threat[mind](wisp)
    faded: suspect[mind](supply_chest)

  and `safe[mind](supply_chest)` is back — not restored, not patched. The
  rule that blocked it is not in the store, so the next evaluation simply
  derives it again. That is OOPS's un-retraction, read from the other side.
  oracle: AGREE — unloading the grimoire brings back what it took away

  A RULE TWO BOOKS SHIP. The codex and the warden's primer both carry
  `threat[mind](T) :- beast[world](T), glows[world](T), wet[world](T)`, and
  content addressing makes that one rule with two owners:
    ra83754c7  owned by codex_of_thorns and wardens_primer
    $ forget codex_of_thorns  -> removed 1, kept 1 (shared with another book)
    threat[mind] afterwards: eel, marsh_light, troll, wisp
    the wisp is still a threat, because the primer still says so. Unloading
    a pack that owns a rule ALONE removes the rule; unloading one of two
    owners removes only the ownership. Nothing had to be reference-counted:
    the id IS the rule, and `pack_rule` already records both claims.
  oracle: AGREE — unloading one of two owners of a shared rule leaves the rule standing

== 8. dead books, uninvited rules, and a forged edition ======================
  MOOT's faculty, over the kernel's provenance instead of over a config:
    dead_book[audit]  -> dune_walkers_rule
    dead_rule[audit]  -> dune_walkers_rule  r5abea488
                         threat[mind](?T)@now :- beast[world](?T)@now, sunlit[world](?T)@now, moving[world](?T)@now
    dead_rule[audit]  -> dune_walkers_rule  r86f06861
                         shelter[mind](?T)@now :- container[world](?T)@now, parched[world](?T)@now
    correct rules about surviving a desert, carried through a swamp. Nothing
    is wrong with them and nothing will ever come of them. They are found by
    four rules reading `derived_by`, which the kernel emits per firing.
  oracle: AGREE — the desert book is dead here and the codex is not

  A PAGE IN A POCKET. Rules loaded without the ledger entry that says this
  head read that book — the supply-chain case, where someone else's rule
  arrives with no manifest behind it:
    uninvited[audit](codex_of_thorns, ra83754c7)
    `writes_to(R, mind)` is kernel-emitted from the rule's own head. The
    audit needs nothing from the pack.
  oracle: AGREE — a rule installed without the import record is flagged uninvited

  A FORGED EDITION. The same text, the same title, signed by another hand:
    $ shelve codex_of_thorns   who = a_charlatan
    forged[audit] -> 9 facts, every one of them in [codex_of_thorns]:
      $fact(pack,codex_of_thorns,$cons(codex_of_thorns,$nil))
      $fact(pack_author,codex_of_thorns,$cons(codex_of_thorns,$cons(thornwood_of_the_low_fen,$nil)))
      $fact(pack_extractor,codex_of_thorns,$cons(codex_of_thorns,$cons(2,$nil)))
    `authority(codex_of_thorns, thornwood_of_the_low_fen)` is the whole list
    of who may write in that book. No enforcement code anywhere.
  oracle: AGREE — an edition signed by the wrong hand is forged

== 9. versioning: content-addressed identity, and its one sharp edge =========
a rule id is `r` + fnv1a of the canonical clause. Two rules are the same
rule iff they are literally the same clause, so the diff between editions is
a set difference on ids — no diff algorithm, no version numbers, no trusting
what the author wrote on the title page.

  codex v1 vs v2 (one premise added to the second rule)
    kept    1   ra83754c7
    removed 1   r6d470612
    added   1   r67cbff2c
    exactly right: one rule untouched, one replaced.

  codex v1 vs the SAME BOOK with every variable renamed ?T -> ?X
    kept    0   (none)
    removed 2   ra83754c7 r6d470612
    added   2   rc8968eff rc81176ce

  THAT IS A REAL LIMIT AND IT IS NOT PAPERED OVER HERE. `canonClause` renders
  a variable as `?` + its source name, so the canonical form of a clause
  keeps the letters the author happened to type. `canonVars` — which renames
  a term list to positional placeholders and is exactly the function this
  would need — exists in src/unify.ts and is used by the engine for RENDERING
  only; `ruleIdOf` does not call it. The consequences are two, both measured:

    1. a diff between two editions that differ only in variable names reports
       2 rules removed and 2 added, when nothing changed.
    2. installing both editions installs BOTH, and every conclusion they
       share now has two derivations where it had one:
         threat[mind](wisp) with the codex alone       1
         with the codex and its renamed twin           2
       so the fragility number of §6 is inflated by a rename, which is the
       one place this leak reaches a conclusion a reader would act on.
    Wildcards do NOT leak: the parser numbers `_` per clause, so two clauses
    written with `_` in the same places hash alike. It is named variables only.
  oracle: AGREE — a variable rename changes every rule id (the finding, measured not assumed)

  A TAMPERED EDITION, which content addressing does catch. Take the genuine
  manifest and ship it beside an altered text:
    manifest declares: r6d470612 ra83754c7
    the text hashes to: r3964a83f r6d470612
    unaccounted for:    ra83754c7
    a signature is not needed for this: the hash IS the name, so a text that
    does not hash to the name it was shipped under is not that rule.
  oracle: AGREE — an altered text no longer matches the ids its manifest declares

== 10. what this cost the engine =============================================
  loot.rofl §5 reads `derived_by` in a rule body, and it is the first MODEL in
  this repository to do so. The kernel already knew that would happen: a rule
  triggered by derivations anywhere in the program is outside the cone
  argument that derived-relation reuse rests on, so src/engine.ts declines to
  reuse anything at all rather than reuse something it cannot promise. The
  behaviour is pinned by test/derived-reuse.test.ts, "a rule that reads
  provenance turns reuse off entirely"; what is new here is paying for it.

    fingerprinted derived relations, boot.rofl alone:  15
    fingerprinted derived relations, boot + loot.rofl: 0
    zero is the engine saying it has nothing it may reuse next time.

    full re-evaluation with the provenance rules:    758 firings
    the same program with those four rules removed:  702 firings
    the difference is what the attribution of §6 and the dead-book audit of
    §8 cost, on this world, measured rather than argued.

  and the whole transcript, end to end:
    6 + 5 encounters on the road, 13 shelf checks, and every quarantine a fork of the store —
    45 worlds of boot.rofl + loot.rofl built from scratch in 21741 ms.

== summary ===================================================================
16 checks, each against a second computation of the same thing:
  AGREE     a manifest without an extractor version is not installable
  AGREE     the careful one survives the road and the reckless one does not
  AGREE     the fork diff and excise agree on what the grimoire takes away
  AGREE     the mute pack is caught by the manifest and again by boot.rofl
  AGREE     the chant never settles and the heavy book settles at a larger budget
  AGREE     a pack that takes nothing away is accepted without a ruling
  AGREE     the shortcut pack lowers a proof cost while changing no conclusion
  AGREE     the bridge pack is inert alone and decisive in company
  AGREE     the version-gapped book leaves the reader holding both verdicts at once
  AGREE     unloading the grimoire brings back what it took away
  AGREE     unloading one of two owners of a shared rule leaves the rule standing
  AGREE     the desert book is dead here and the codex is not
  AGREE     a rule installed without the import record is flagged uninvited
  AGREE     an edition signed by the wrong hand is forged
  AGREE     a variable rename changes every rule id (the finding, measured not assumed)
  AGREE     an altered text no longer matches the ids its manifest declares

no verdict in this transcript is refuted by the store it was computed from.
(21741 ms)
```

## Files

- `loot.rofl` — the ledgers, the extractor's vocabulary, the road, the native
  head (14 rules), the pack format and its audits, the quarantine verdicts.
- `demo.ts` — the transcript above; also exports the shelf, `world()`,
  `quarantine()`, `unload()`, `walk()` and the semiring folds for the tests.
- `page.html` — the same story for two audiences, one page, no build step.
- `../../test/example-loot.test.ts` — 37 tests, about 25 s.
