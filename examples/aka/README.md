# AKA — bridges between perspectives

Two systems describe the same money. Billing knows **accounts** and the legal
entities it invoices; the CRM knows **customers**. Neither is a renaming of the
other: one customer has several accounts, one account covers several legal
entities, some accounts are in no CRM at all and some customers have no
account.

The mapping between them is not data either system holds. It is a set of
**assertions by people** — and this example models them as such, with an
author, a confidence, a ledger of their own, and everything that follows from
that: two authors may map one account differently and both mappings stand, a
conclusion that travelled through a mapping is **marked** as having crossed a
boundary, and withdrawing a mapping transitively marks everything derived
through it.

```
$ aka trace revenue_q3 --from billing --to crm
1.42M

  within billing: 1.42M   [12 invoices, $1,420,000, no mapping involved]
  bridge invoice.account -> crm.customer
    author: finance, confidence b7 0.85  b8 0.90
    author: integration, confidence b1 0.95  b2 0.80  b3 0.90  b4 0.60  b5 0.55  b6 0.70
    author: sales, confidence b9 0.75
    3 invoices map ambiguously (2+ candidates): inv_08 inv_09 inv_10
  in crm: 1.15M — 0.17M ambiguous, 0.11M maps to nothing

  result marked: crossed a perspective boundary — 9 bridge assertions
  of one mapping kind, by 3 authors (finance, integration, sales).
```

The last two lines are the product. A discrepancy between two systems is
normally found at quarter end and reconciled by hand; here it is **derived**,
with the place it leaks named and whose mapping it leaked through.

## The pair with SUS

Deliberately paired with `examples/sus/`. **SUS — perspectives diverge and that
is data; AKA — perspectives are stitched and the seam stays visible. Together
they cover the model; separately each gives half and leaves a false impression
of it.**

The metaphor the whole project is built on is double entry. Several books over
the same events are perspectives; **the reconciliations between books are
bridges**. Without reconciliations double entry does not work — they are not
ornament, and until this example the second half was shown nowhere.

Structurally the two files are the same file: SUS has one ledger per player and
derives the contradiction between two claims; AKA has one ledger per mapping
author and derives the contradiction between two mappings. `forged[audit]`,
`rests_on`, `at_risk`/`shaken`, the counting fold and `whynot` are the same
machinery in both, pointed at the other half of the model.

## A bridge is not a merge

It is an explicit mapping **with an author and a confidence**, itself an
assertion that can be disputed, dated and withdrawn.

```prolog
maps[integration](b6, acct_adv_a, adventure, 70).   -- the integration team's book
maps[finance](b7,    acct_adv_a, contoso,   85).    -- finance ops' book
```

Both hold. Both are facts. Nothing was ranked, resolved or dropped — and what
the engine derives from the pair is the finding:

```prolog
disputed[recon](acct_adv_a, contoso, adventure)
  ->  acct_adv_a has two candidate customers, and its money is held back
```

Three shapes, all derived, none asserted:

| shape | who | what it means |
|---|---|---|
| `corroborated` | two authors, the **same** target | independent agreement — reassuring |
| `split` | **one** author, two targets | the account really does cover both, and the vocabulary cannot say in what proportion |
| `disputed` | two authors, **different** targets | a genuine disagreement, and both entries stand |

Who wrote a mapping is the **load identity** checked against `authority`, never
a column. Withdrawing a bridge is an entry in the withdrawing author's own
book, so finance cannot retract the integration team's mapping without it
surfacing as `forged[audit]` — with no enforcement code anywhere.

## How to run

```sh
node --experimental-strip-types examples/aka/demo.ts       # the transcript below
node --experimental-strip-types --test test/example-aka.test.ts
node --experimental-strip-types src/repl.ts examples/aka/aka.rofl
```

The REPL loads a file under one identity, so it cannot reproduce the
per-author `authority` split; `demo.ts` splits `aka.rofl` on its `-- @who X`
markers and loads each author's mappings under that author's name. That is the
whole forgery story.

## What it shows

| the spec asks for | where |
|---|---|
| two ontologies not reducible by renaming | `aka.rofl` §1–2, transcript §2 |
| a bridge as an assertion with author, confidence and provenance | §3, transcript §3 |
| competing bridges from different authors coexisting | §3, transcript §3 |
| derivation marked as having crossed a boundary, naming the bridge | §9, transcript §5 |
| withdrawing a bridge transitively marking what rested on it | §10, transcript §7 |
| an ambiguous mapping never resolved silently | §6, transcript §4, §6 |
| `whynot` as a list of missing or unsharpened bridges | §8, transcript §8 |

## The one number that does not reconcile, and why

The two systems are **$82,000 apart** on Q3, and that is not a mystery:

```
    billing $1,420,000 vs crm $1,338,000: $82,000 apart.
    It is exactly the money no bridge can absorb:
      acct_adv_a $60,000 + acct_orphan_eu $22,000 = $82,000.
```

- `acct_adv_a` holds $60,000 that two authors map to two different customers,
  and **the reconciliation refutes both of them**: contoso already closes to
  the dollar and adventure books nothing at all, so neither can absorb the
  money without breaking a total that balances. A confidence is a number its
  author chose; the reconciliation is not, and it overrules 0.85 and 0.70.
- `acct_orphan_eu` holds $22,000 that nobody has ever mapped to anything.

The identity `billing - crm == the money no bridge can absorb` is checked in
three different worlds by the oracle. It is checked, not proved: it holds when
each shortfall is matched by exactly one account whose loose money equals it,
which is a property of this data and not a theorem.

## `whynot`: a list of bridges, not "the data does not match"

```
  $ aka -n tailspin
  tailspin does not reconcile. billing says $135,000, crm says $240,000 — short by $105,000.

    the mapping that would close it:
      SHARPEN  acct_wingtip -> tailspin   (bridge b5)
               acct_wingtip holds $105,000 the engine refused to
               attribute, because b5 is not the only candidate: fabrikam also claims it.
               Settling that one ambiguity in tailspin's favour closes the gap exactly.

  $ aka -n litware
  litware does not reconcile. billing says $0, crm says $88,000 — short by $88,000.

    the mapping that would close it:
      ADD      acct_ghost_ops -> litware
               acct_ghost_ops holds $88,000 that maps to nothing at all,
               and $88,000 is exactly what litware is short. Nobody has
               ever asserted a mapping for this account.
```

Two rules, and the whole answer:

```prolog
would_close[recon](C, A) :- short[recon](C, N), total[recon](loose(A), N), N > 0.
sharpen[recon](C, A, B)  :- would_close[recon](C, A), bridge[recon](B, _, A, C, _).
add_bridge[recon](C, A)  :- would_close[recon](C, A), not mapped_acct[recon](A).
```

Note which candidate the money points at for the reseller account: **b5, at
confidence 0.55**, against b4's 0.60. The confident answer is the wrong one,
and the tool says so rather than picking the higher number.

## Counting reads a SIXTH way here, and the number does not say which

Across this example set the same count means robustness (NOPE, OOPS),
fragility (SPAT), launderability (BLEEP), suspicion as a share of worlds (SUS),
margin loss (DITTO) — and here **AMBIGUITY**: more than one mapping path to the
same result is a defect, not reassurance. **The metric is identical and only
the domain fixes its sign.**

This example sharpens that, because in this domain the domain alone is not
enough. Measured, in the same fold:

```
    invoice   amount     paths  lands on                 reading
    inv_05     $210,000      2  contoso                corroborated
    inv_08      $60,000      2  fabrikam, tailspin     AMBIGUOUS
```

Two mapping paths in both cases. **Read the numbers alone and they are the same
fact.** inv_05's two paths land on one customer — that is corroboration, and it
is reassuring. inv_08's two land on two — that is ambiguity, and it is a
defect. So here the sign is fixed **per relation**, not per domain:

```
    count route[recon](inv_05, contoso)  = 2   authors who agree
    count paths[recon](inv_08)           = 2   customers it could be
```

The rules derive the classification (`ambiguous`, `corroborated`, `split`,
`disputed`); the fold supplies the number. Neither is enough alone, and an
instance that ships a bare count invites a tool to report robustness where it
should report ambiguity.

The counts here are about the mappings and not about the shape of the rule set,
and that is checked rather than assumed: **43 facts lie on a support cycle and
every one of them is `boot.rofl`'s own relation-reachability closure** (this
program has recursive relations). No domain fact counts `infinitely many`. No
ticks are run anywhere in this example — `@next` would put every carried fact
on a support cycle and the metric would die silently, which `examples/oops`
found and `examples/sus` pays for.

## The mark, and the fold that catches you forgetting it

A conclusion that travelled through a doubtful mapping must not look like one
derived inside a single ontology. Viterbi over the bridge confidences is what
makes that concrete: a total derived inside one book scores 1.000, a total that
crossed bridges scores the product of the confidences it crossed.

```
    conclusion              value       certainty  crossed              source books
    total(ambiguous)          $165,000    0.06480  b4 b5 b6 b7          [billing] [finance] [integration] [main]
    total(attributed)       $1,145,000     0.3509  b1 b2 b3 b8 b9       [billing] [finance] [integration] [main] [sales]
    total(cust(northwind))    $645,000     0.5776  b1 b2                [billing] [crm] [integration] [main]
    total(cust(tailspin))     $135,000     0.7500  b9                   [billing] [crm] [main] [sales]
    total(cust(contoso))      $365,000     0.8100  b3 b8                [billing] [crm] [finance] [integration] [main]
    total(billing)          $1,420,000      1.000  nothing              [billing] [main]
    total(unmapped)           $110,000      1.000  nothing              [billing] [main]
```

Three different mechanisms produce that table and none of them agrees with the
others by construction: the `crossed` column is written by rules in `aka.rofl`
§9, the certainty is a Viterbi fold over the recorded support, and the source
books come out of the provenance semiring reading the perspective off each base
fact key.

**The first draft of §9 marked the per-customer totals and forgot
`total(attributed)` and `total(ambiguous)`.** The fold caught both, because a
fold follows the support graph and cannot be forgotten while a hand-written
mark can. The test now pins the two against each other: a total is marked as
crossed **exactly** when its Viterbi certainty is below 1, which holds because
no bridge in this file is asserted at 100%.

The standard of proof — 0.60, "clear and convincing" — is a **policy** and
lives in `demo.ts`, not in the rules, exactly as SUS keeps its three-worlds-in-
four out of `sus.rofl`. Under it `total(cust(northwind))` at 0.5776 does not
clear, and it fails because of b2 (`acct_nw_eu`, confidence 0.80), the weakest
bridge carrying real money. Three sections later the integration team withdraws
exactly that bridge.

### The trap in that table

`total(unmapped)` scores 1.000, crosses nothing and is filed under
`within_one_book`. It is also **the number in the whole report most sensitive
to the bridge set**: withdraw b2 and it moves from $110,000 to $335,000.

It rests on the *absence* of a bridge, finite failure carries no annotation, so
no mark can reach it. Its provenance names six base facts and zero bridges.
That is honest — there genuinely is no positive source — and it is why the
tool has to say it in words. (Known: `f_provenance_blind_to_negation`, recorded
independently by the MOOT demo; this is a second domain where a verdict phrased
as "X unless Y" loses its provenance, and here the verdict is a money figure a
finance team would act on.)

## Withdrawal marks; excision erases

```
  $ integration_team: withdrawn[integration](b2).   -- acct_nw_eu is not northwind

    AT RISK  attribution(inv_03,northwind)      every support gone: b2
    AT RISK  attribution(inv_04,northwind)      every support gone: b2
    SHAKEN   reconciliation(northwind)          gone: b2   still standing: b1
    SHAKEN   total(cust(northwind))             gone: b2   still standing: b1
```

The mark reaches `reconciliation(northwind)` — the conclusion a finance team
acts on — transitively, exactly as `examples/oops` reaches a paper that
depended on a retraction and `examples/sus` reaches the ejection the table
voted on.

The support graph is drawn on `link`, which survives the retraction, and never
on `attributed`, which does not. **Measured while building this**: with the
graph drawn on `attributed`, the withdrawal leaves `shaken` empty, because
northwind's total no longer admits that it was ever built on the two invoices
it just lost. A support that has already vanished cannot be marked — it has
taken the record with it. SUS states the same lesson about `clash` versus
`conflict`; it is worth stating twice because the wrong version silently
produces an empty report rather than an error.

Excision is the other operation and the tool needs both:

```
  $ excise maps[integration](b2, acct_nw_eu, northwind, 80)
    105 facts removed, 78 added
    removed: gap[recon](northwind,0), total[recon](cust(northwind),645000)
    added:   gap[recon](northwind,-225000), total[recon](cust(northwind),420000),
             unmapped[recon](inv_03), unmapped[recon](inv_04), unmapped_acct[recon](acct_nw_eu)
```

Excision is the **counterfactual** — what would we believe if this mapping had
never been asserted — and it produces no `at_risk` and no `shaken`, because in
that world there is nothing to mark. Withdrawal is the **history**: it was
asserted, it was acted on, and it has been taken back.

## The kernel's `bridge_decl` is a different thing with the same name

This is the finding this example most wants to hand back to the kernel.

`boot.rofl` audits cross-ledger flow:

```prolog
flow(A, B)        :- reads_from(R, A), writes_to(R, B).
leak[audit](A, B) :- flow(A, B), not sees(B, A), not bridge_decl(R, A, B).
```

and `src/reflect.ts` emits `bridge_decl(RuleId, From, To)` when a rule's head
perspective is explicit and differs from a premise's. It is **per rule**, and
it is real machinery that works: this example's rules read six ledgers and
write one, and the crossings are on the record —

```
    billing -> recon         8 rules
    crm -> recon             6 rules
    finance -> recon         2 rules
    integration -> recon     2 rules
    main -> recon            9 rules
    sales -> recon           2 rules
```

— and an undeclared crossing surfaces without a line of enforcement code:

```
    $ shadow(Inv, A) :- invoice[billing](Inv, A, _, _).
      leak[audit](billing, main)
```

**But it is about RULES crossing perspectives, not about entity mappings.** It
answers "may the reconciliation book read the integration team's book"; it has
nothing to say about whether `acct_adv_a` is `adventure` or `contoso`, and it
cannot: which account is which customer is not a property of the rule set.
`bridge_decl(R, integration, recon)` is one fact for the whole of the
integration team's mapping table, whatever is in it.

So this example uses both, and they are two different licences at two
different levels:

| | licenses | granularity | emitted by | disputable |
|---|---|---|---|---|
| `bridge_decl` | a rule to read a ledger | one per rule per source ledger | the kernel, automatically | no |
| `maps[X](B, A, C, Conf)` | one entity to stand for another | one per mapping | its author, by hand | yes — that is the point |

No parallel machinery was built and nothing was worked around: the kernel's
audit is used as it stands and keeps `leak[audit]` empty, and the data bridges
sit on top of it as ordinary domain facts. What the kernel does **not** supply
is the second row, and nothing about the way `bridge_decl` is emitted suggests
it ever could.

There is a smaller finding underneath. A rule with a **variable** perspective
in its body (`maps[X](B, A, C, Conf)`) reduces to `$any` in the audit, so it
emits `bridge_decl(R, $any, recon)` — a blanket licence to read *every* ledger
at once. That is why the bridge index in §4 of `aka.rofl` is written out one
rule per author rather than once with a variable, and it is a stricter version
of the reason `examples/sus` gives for its eight carry rules.

## The model in one page

The kernel has no aggregation, so **a sum is a scan**, and this is what that
costs:

```prolog
tag[recon](cust(C))      :- customer[crm](C, _).
counts[recon](cust(C), Inv) :- attributed[recon](Inv, C).
tagged[recon](T, N, Amt) :- counts[recon](T, Inv), inv_no[billing](Inv, N),
                            invoice[billing](Inv, _, Amt, _).

scan[recon](T, 0, 0) :- tag[recon](T).
scan[recon](T, N, S) :- scan[recon](T, M, S0), N is M + 1, tagged[recon](T, N, Amt), S is S0 + Amt.
scan[recon](T, N, S) :- scan[recon](T, M, S), N is M + 1, rows[billing](L), N <= L,
                        not at[recon](T, N).
total[recon](T, S)   :- scan[recon](T, L, S), rows[billing](L).
```

One chain serves every pot at once because the pot is a term — `billing`,
`attributed`, `ambiguous`, `unmapped`, `cust(C)`, `loose(A)`, `crm_booked`.
Doing it in the rules rather than in TypeScript is not decoration: **it is what
makes the oracle mean anything.** A sum computed in `demo.ts` and checked
against a sum computed in `demo.ts` checks nothing.

The refusal, which is the point of the whole file:

```prolog
ambiguous[recon](Inv)     :- route[recon](Inv, C1), route[recon](Inv, C2), C1 != C2.
attributed[recon](Inv, C) :- route[recon](Inv, C), not ambiguous[recon](Inv).
```

An ambiguous invoice is attributed to nobody. It is not resolved by picking the
confident candidate, and its money is not lost either — it sits in a named pot
that the report prints and `whynot` reads.

## The oracle

Both systems' own reported totals are hard numbers: a reconciliation either
closes or it does not, and by how much. Every invoice classification, every
per-customer gap, every headline total and the residual identity is decided
once by the engine and once by a direct computation over the same base facts in
plain TypeScript — no engine, no rules, no shared code beyond reading the
ledgers.

```
    decisions compared:  90
    disagreements:       0

    arm            quarter   billing        crm       residual   identity
    as shipped     q3        $1,420,000 $1,338,000      $82,000   holds
    as shipped     q2          $440,000   $440,000           $0   holds
    b2 withdrawn   q3        $1,420,000 $1,338,000      $82,000   holds
```

**Sample size: 90 decisions** over three worlds — the books as shipped at Q3
and at Q2, and the books with one bridge withdrawn. 15 invoices, 9 accounts, 10
legal entities, 7 customers, 9 bridges by 3 authors.

Two things the oracle does *not* establish, stated because an oracle that
agrees with everything proves nothing:

1. It shares the **definition** of `would_close` with the rules (an account
   whose loose money equals a customer's shortfall), so it checks the
   arithmetic of that definition and not the definition itself.
2. It is small enough to check by hand, which is the point of a demo and also
   the reason none of it is evidence about scale.

What it *is* discriminating about is checked: the test hands the oracle a
bridge the engine has never seen and asserts the two part company on
`inv_11`, on `total(unmapped)` and on litware's gap.

## The data

Synthetic and hand-built. There is no public corpus of paired CRM and billing
exports annotated with a ground-truth mapping — the mapping is precisely what
nobody has — and scraping one would not help: the value here is in a quarter
arranged so that the confident candidate is the wrong one and the money says
so, which is a thing you construct rather than find.

Three ingredients would make it real, and they are not equally solid:

- **The two exports — easy.** Any Salesforce/HubSpot account object and any
  Stripe/Zuora/NetSuite invoice export give exactly the shapes in §1 and §2,
  with the totals the systems themselves report. No modelling required.
- **Bridges with authors — easy, and already exists in a worse form.** Every
  company that runs both systems has a mapping table. It is a spreadsheet with
  no author column, no confidence and no history, which is the entire problem
  this example is about; the migration is to keep the same rows and record who
  put each one there.
- **Confidences — soft, and this is the weak point.** Nobody writes 0.55 next
  to a mapping today. Two honest options: elicit them once per author and
  accept that they are opinions (which is how this file treats them — see the
  reconciliation refuting two of them), or derive a prior from how often each
  author's mappings have needed correcting, which is data an integration team
  does have.

The baseline this replaces is not a straw man, and the transcript measures it:
matching the legal entity name against the customer id resolves 6 of 9 accounts
to exactly one customer, and resolves them *correctly*. It reproduces the
reseller's ambiguity honestly. What it cannot do is the whole argument — it has
no author, no confidence, nothing to dispute and nothing to withdraw, it maps
`acct_adv_a` to `adventure` with one confident answer where a second author
says otherwise and the arithmetic refutes both, and it finds `litware` on
`acct_litware_x`, an account that raised no invoice, while the $88,000 that
actually belongs to litware sits on an account it cannot see.

## The transcript

Real output of `node --experimental-strip-types examples/aka/demo.ts`, pasted
verbatim.

```text
AKA — two ontologies over one stream of money, and the seam between them.

── 1. the model loads, and boot.rofl audits it ───────────────────────────
  ? unstratified(X)                    -> 0 rows
  ? malformed[audit](R)                -> 0 rows
  ? breach[audit](R)                   -> 0 rows
  ? leak[audit](A, B)                  -> 0 rows
  ? forged[audit](F)                   -> 0 rows
  ? unmoded[audit](R)                  -> 0 rows
  ? undefined_premise[audit](R, Rel)   -> 0 rows
  rules not range-restricted: 0
  relations evaluated top-down: 0
  facts in the store: 5593
  ledgers: audit, billing, crm, finance, integration, recon, sales

── 2. two books, and why one is not a renaming of the other ──────────────
  billing:  9 accounts, 10 legal entities, 15 invoices. It has never heard of a customer.
  crm:      7 customers with booked revenue. It has never heard of an account.

    acct_adv_a        1 inv     $60,000   entities: adventure_works_gmbh
    acct_contoso      2 inv    $365,000   entities: contoso_ltd
    acct_ghost_ops    1 inv     $88,000   entities: ghost_operations_ltd
    acct_litware_x    0 inv          $0   entities: litware_x_ag
    acct_nw_eu        2 inv    $225,000   entities: northwind_traders_bv
    acct_nw_prod      2 inv    $420,000   entities: northwind_traders_ltd
    acct_orphan_eu    1 inv     $22,000   entities: orphan_holdings_sarl
    acct_tailspin     1 inv    $135,000   entities: tailspin_toys_llc
    acct_wingtip      2 inv    $105,000   entities: fabrikam_inc + tailspin_toys

  one customer, several accounts:  northwind <- acct_nw_eu, acct_nw_prod
  one account, several customers:  acct_wingtip -> fabrikam and tailspin (a reseller account)
  accounts in no crm at all:       acct_ghost_ops, acct_litware_x, acct_orphan_eu
  customers with nothing attributed: litware

  the baseline this replaces — match the entity name against the customer id:
    6 of 9 accounts resolve to exactly one customer, 1 to more than one, 2 to none.
      acct_adv_a       -> adventure
      acct_contoso     -> contoso
      acct_ghost_ops   -> (nothing)
      acct_litware_x   -> litware
      acct_nw_eu       -> northwind
      acct_nw_prod     -> northwind
      acct_orphan_eu   -> (nothing)
      acct_tailspin    -> tailspin
      acct_wingtip     -> fabrikam | tailspin
    It gets most of them right. What it cannot do is the whole argument:
    it has no author, no confidence, nothing to dispute and nothing to
    withdraw — and where it is wrong (acct_adv_a) it is silently wrong.

── 3. a bridge is an assertion: author, confidence, and a ledger of its own 
  every mapping, in its author's own book:

    b1  maps[integration](acct_nw_prod, northwind)      confidence 0.95
    b2  maps[integration](acct_nw_eu, northwind)        confidence 0.80
    b3  maps[integration](acct_contoso, contoso)        confidence 0.90
    b4  maps[integration](acct_wingtip, fabrikam)       confidence 0.60
    b5  maps[integration](acct_wingtip, tailspin)       confidence 0.55
    b6  maps[integration](acct_adv_a, adventure)        confidence 0.70
    b7  maps[finance](acct_adv_a, contoso)              confidence 0.85
    b8  maps[finance](acct_contoso, contoso)            confidence 0.90
    b9  maps[sales](acct_tailspin, tailspin)            confidence 0.75

  two authors, the same account, DIFFERENT customers — and both stand:
    maps[finance](b7, acct_adv_a, contoso, 85)
    maps[integration](b6, acct_adv_a, adventure, 70)
    both hold. Nothing was ranked, resolved or dropped — different ledgers,
    so acct_adv_a has two candidate customers and the money on it is held back.

  and the three shapes a bridge set takes, all derived, none asserted:
    CORROBORATED  acct_contoso -> contoso, by two authors independently
    SPLIT         acct_wingtip -> fabrikam and tailspin, by ONE author: the account really does cover both
    DISPUTED      acct_adv_a -> contoso or adventure, by two authors who disagree

  who wrote a mapping is the load identity, not a column:
    finance_ops withdraws the integration team's bridge, and asks nobody:
      forged[audit] -> 1 row
        $fact(withdrawn,integration,$cons(b9,$nil))
    The same forgery in one mapping table with an "author" column is a
    well-formed row, and no audit in any kernel can see it.

── 4. the trace: 1.42M goes in, and less comes out ───────────────────────
  $ aka trace revenue_q3 --from billing --to crm
  1.42M

    within billing: 1.42M   [12 invoices, $1,420,000, no mapping involved]
    bridge invoice.account -> crm.customer
      author: finance, confidence b7 0.85  b8 0.90
      author: integration, confidence b1 0.95  b2 0.80  b3 0.90  b4 0.60  b5 0.55  b6 0.70
      author: sales, confidence b9 0.75
      3 invoices map ambiguously (2+ candidates): inv_08 inv_09 inv_10
    in crm: 1.15M — 0.17M ambiguous, 0.11M maps to nothing

    result marked: crossed a perspective boundary — 9 bridge assertions
    of one mapping kind, by 3 authors (finance, integration, sales).

  1.42M = 1.15M attributed + 0.17M ambiguous + 0.11M unmapped, exactly.
  A policy that resolved every ambiguity by picking the confident candidate
  would report 1.31M instead. That policy is not in the rules,
  and section 8 shows the money refusing it.

  and the reconciliation, customer by customer:

    customer     billing->crm        crm booked          gap  verdict
    tailspin         $135,000          $240,000    -$105,000  DOES NOT CLOSE
    litware                $0           $88,000     -$88,000  DOES NOT CLOSE
    adventure              $0                $0           $0  closes
    contoso          $365,000          $365,000           $0  closes
    fabrikam               $0                $0           $0  closes
    northwind        $645,000          $645,000           $0  closes
    wingtip                $0                $0           $0  closes

    billing $1,420,000 vs crm $1,338,000: $82,000 apart.
    and the difference is not a mystery. It is exactly the money no bridge
    can absorb: acct_adv_a $60,000 + acct_orphan_eu $22,000
    = $82,000.

── 5. the mark: a number that crossed a boundary must not look like one that did not 
  Viterbi over the bridge confidences. A total derived inside one book scores
  1.000; a total that crossed bridges scores the product of their confidences.

    conclusion              value       certainty  crossed              source books
    total(ambiguous)          $165,000    0.06480  b4 b5 b6 b7          [billing] [finance] [integration] [main]
    total(attributed)       $1,145,000     0.3509  b1 b2 b3 b8 b9       [billing] [finance] [integration] [main] [sales]
    total(cust(northwind))    $645,000     0.5776  b1 b2                [billing] [crm] [integration] [main]
    total(cust(tailspin))     $135,000     0.7500  b9                   [billing] [crm] [main] [sales]
    total(cust(contoso))      $365,000     0.8100  b3 b8                [billing] [crm] [finance] [integration] [main]
    total(billing)          $1,420,000      1.000  nothing              [billing] [main]
    total(crm_booked)       $1,338,000      1.000  nothing              [billing] [crm] [main]
    total(cust(adventure))          $0      1.000  nothing              [billing] [crm]
    total(cust(fabrikam))           $0      1.000  nothing              [billing] [crm]
    total(cust(litware))            $0      1.000  nothing              [billing] [crm]
    total(cust(wingtip))            $0      1.000  nothing              [billing] [crm]
    total(unmapped)           $110,000      1.000  nothing              [billing] [main]

  The "crossed" column is written by a rule in aka.rofl §9; the certainty is
  a fold over the support graph and the source books come out of the provenance
  semiring. Nothing here agrees by construction: the first draft of §9 marked
  the per-customer totals and forgot total(attributed) and total(ambiguous),
  and the fold is what caught it. The test now pins the two against each other.

  standard of proof on a crossed number: 0.60. Which totals clear it:
    total(ambiguous)       DOES NOT CLEAR
    total(attributed)      DOES NOT CLEAR
    total(cust(northwind)) DOES NOT CLEAR
    total(cust(tailspin))  clears
    total(cust(contoso))   clears

  northwind is the one that fails, and it fails because of b2 (acct_nw_eu,
  confidence 0.80) — the weakest bridge carrying real money. Section 7 is the
  integration team withdrawing exactly that bridge, three sections later.

  THE TRAP IN THIS TABLE. total(unmapped) scores 1.000 and crosses nothing,
  and it is the number in the whole report most sensitive to the bridge set:
    provenance of total[recon](unmapped,110000):
      6 base facts, of which 0 are bridges.
    It rests on the ABSENCE of a bridge, finite failure carries no annotation,
    so no mark can reach it. The tool has to say this in words. (Known:
    f_provenance_blind_to_negation.)

── 6. counting: the same number, read in opposite directions ─────────────
  counting semiring over the support hypergraph: 27 rounds, converged=true, discipline held=true
  facts on a support cycle: 43, and every one of them is boot.rofl's
  own relation-reachability closure — this program has recursive relations.
  domain facts counted INFINITE: 0. No ticks are run here.

    invoice   amount     paths  lands on                 reading
    inv_01     $240,000      1  northwind              the only reading
    inv_02     $180,000      1  northwind              the only reading
    inv_03     $130,000      1  northwind              the only reading
    inv_04      $95,000      1  northwind              the only reading
    inv_05     $210,000      2  contoso                corroborated
    inv_06     $155,000      2  contoso                corroborated
    inv_07     $135,000      1  tailspin               the only reading
    inv_08      $60,000      2  fabrikam, tailspin     AMBIGUOUS
    inv_09      $45,000      2  fabrikam, tailspin     AMBIGUOUS
    inv_10      $60,000      2  adventure, contoso     AMBIGUOUS
    inv_11      $88,000      0  (nothing)              unmapped
    inv_12      $22,000      0  (nothing)              unmapped

  inv_05 and inv_08 both have TWO mapping paths. Read the numbers alone and
  they are the same fact. inv_05's two paths land on ONE customer — that is
  corroboration, and it is reassuring. inv_08's two land on TWO — that is
  ambiguity, and it is a defect. The metric is identical; only the domain
  fixes its sign, and here the domain fixes it PER RELATION:
    count route[recon](inv_05, contoso)  = 2   authors who agree
    count paths[recon](inv_08)           = 2   customers it could be

── 7. withdrawing a bridge: marked, not silently rewritten ───────────────
  $ integration_team: withdrawn[integration](b2).   -- acct_nw_eu is not northwind

    money that no longer maps: $110,000 -> $335,000
    northwind's total:         $645,000 -> $420,000
    northwind's gap:           $0 -> -$225,000

    AT RISK  attribution(inv_03,northwind)      every support gone: b2
    AT RISK  attribution(inv_04,northwind)      every support gone: b2
    SHAKEN   reconciliation(northwind)          gone: b2   still standing: b1
    SHAKEN   total(cust(northwind))             gone: b2   still standing: b1

  the mark reaches the CONCLUSION the finance team acts on, transitively:
    rests_on(reconciliation(northwind), b2) = true
    shaken(reconciliation(northwind))       = true
  The support graph is drawn on `link`, which survives the retraction, and
  not on `attributed`, which does not. A support that has already vanished
  cannot be marked — it has taken the record with it.

  and the same withdrawal as an EXCISION, which erases instead of marking:
    $ excise maps[integration](b2, acct_nw_eu, northwind, 80)
      105 facts removed, 78 added
      removed: gap[recon](northwind,0), total[recon](cust(northwind),645000)
      added:   gap[recon](northwind,-225000), total[recon](cust(northwind),420000), unmapped[recon](inv_03), unmapped[recon](inv_04), unmapped_acct[recon](acct_nw_eu)
    Excision is the counterfactual: what would we believe if this mapping had
    never been asserted. Withdrawal is the history: it was asserted, it was
    acted on, and it has been taken back. The tool needs both and they are
    not the same operation.

── 8. whynot: not "the data does not match" but a list of missing bridges 
  $ aka -n tailspin
  tailspin does not reconcile. billing says $135,000, crm says $240,000 — short by $105,000.

    the mapping that would close it:
      SHARPEN  acct_wingtip -> tailspin   (bridge b5)
               acct_wingtip holds $105,000 the engine refused to
               attribute, because b5 is not the only candidate: fabrikam also claims it.
               Settling that one ambiguity in tailspin's favour closes the gap exactly.

  $ aka -n litware
  litware does not reconcile. billing says $0, crm says $88,000 — short by $88,000.

    the mapping that would close it:
      ADD      acct_ghost_ops -> litware
               acct_ghost_ops holds $88,000 that maps to nothing at all,
               and $88,000 is exactly what litware is short. Nobody has
               ever asserted a mapping for this account.

  $ aka -n northwind
  northwind reconciles: $645,000 in billing, $645,000 in crm.

  and the two the arithmetic REFUSES to propose:
    b6  maps[integration](acct_adv_a, adventure) at confidence 0.70 — REFUTED:
        adventure books nothing at all this quarter,
        so it cannot absorb acct_adv_a's $60,000 without breaking a total that balances.
    b7  maps[finance](acct_adv_a, contoso) at confidence 0.85 — REFUTED:
        contoso books $365,000 and billing already accounts for every dollar of it,
        so it cannot absorb acct_adv_a's $60,000 without breaking a total that balances.
    Both candidates for acct_adv_a are refuted, by the money, at 0.85 and 0.70
    confidence. A confidence is a number its author chose. The reconciliation
    is not, and it overrules both.

  the kernel's own whynot underneath the rendering:

    whynot reconciles[recon](tailspin):
      rule r373a2bbb: reconciles[recon](?C)@now :- gap[recon](?C,0)@now
        failed premise: gap[recon](tailspin,0)
          rule r45255821: gap[recon](?C,?G)@now :- total[recon](cust(?C),?A)@now, booked[crm](?C,?B,?Q)@now, quarter[main](?Q)@now, ?G is -(?A,?B)
            failed premise: 0 is -(135000,240000) [builtin fails]
            failed premise: quarter[main](q2)
              [depth limit 2 reached]

── 9. the kernel's bridges, which are a different thing with the same name 
  A `bridge_decl` is emitted when a RULE reads one ledger and writes another.
  It licenses the class of crossing; `maps` licenses one entity to stand for
  another. Both are needed, and the kernel supplies only the first:

    billing -> recon         8 rules
    crm -> recon             6 rules
    finance -> recon         2 rules
    integration -> recon     2 rules
    main -> audit            7 rules
    main -> recon            9 rules
    sales -> recon           2 rules

  data bridges in the same model: 9 entity mappings by 3 authors.
  The kernel has nothing to say about any of them. It cannot: which account
  is which customer is not a property of the rule set.

  and the audit that makes the first kind real — one rule with an implicit
  head perspective, reading [billing] and writing [main]:
    $ shadow(Inv, A) :- invoice[billing](Inv, A, _, _).
      leak[audit](billing, main)   -- an undeclared crossing, and nobody wrote a check for it
    Naming the head perspective is the whole fix, and it is what every rule
    in aka.rofl does.

── 10. the same books, the quarter before ────────────────────────────────
  swap quarter[main](q3) for quarter[main](q2) and evaluate once:

    billing $440,000, crm $440,000, ambiguous $0, unmapped $0
    every customer reconciles: true
    Q2 closes. The same rules, the same bridges, the same two ontologies —
    what changed is which accounts were invoiced. The quarter that does not
    close is the one where a reseller account and a ghost account were.

── 11. the oracle: every classification, gap and total, decided twice ────

  Both systems' own reported totals are hard numbers, so a reconciliation
  either closes or it does not, and by how much. Every invoice classification,
  every per-customer gap, every headline total and the residual identity is
  decided once by the engine and once by a direct computation over the same
  base facts in plain TypeScript — no engine, no rules, no shared code.

    decisions compared:  90
    disagreements:       0

    arm            quarter   billing        crm       residual   identity
    as shipped     q3        $1,420,000 $1,338,000      $82,000   holds
    as shipped     q2          $440,000   $440,000           $0   holds
    b2 withdrawn   q3        $1,420,000 $1,338,000      $82,000   holds

    billing - crm == the money no bridge can absorb. That identity is the
    whole claim of the example, and it is checked in three different worlds.

(7994 ms for everything above.)
```

## Files

- `aka.rofl` — two ledgers of record, three ledgers of mappings, one derived
  ledger — 88 base facts, 72 rules.
- `demo.ts` — the transcript above; also exports `world()`, `asOf(quarter)`,
  `withoutBridge(id, author)` and the oracle for the tests.
- `page.html` — the same story for two audiences, one page, no build step.
- `../../test/example-aka.test.ts` — 19 tests, 9.7 s wall clock on an idle
  machine (12.4 s measured with three other agents on the box).
