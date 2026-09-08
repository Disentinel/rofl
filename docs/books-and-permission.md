# Books and permission

The one place. What a book is, what each permission relation does, who may
write it, what each audit catches, what each audit **cannot** see, and what is
still open.

Before this file, the answer lived in twelve places. Measured 2026-09-08 over
`.ts`, `.rofl` and `.md`, files mentioning each name of the family:
`authority` 111 · `forged` 106 · `perspective` 102 · `leak` 100 · `imports` 83
· `sees` 78 · `flow`/`crossing` 59 · `collects` 47 · `exports` 32 ·
`collected` 31 · `flows_to` 28 · `gathered`/`exported` 19 · `loader` 18 ·
`widened`/`collects_from` 17 · `unattributed` 15 · `demands_authorship` 11 ·
`negated_under`/`exported_to` 8. The cost of that scatter has been paid three
times in one day — a gap left open for days that was a special case of a
finding the same person had listed that morning; a ceiling declared
unavoidable after checking four audits and missing the fifth because it is
opt-in; and a cluster of findings declared two-thirds dead on a measurement
that was itself wrong. All three are recorded in `facts/findings.rofl`.

**The inventory below is DERIVED, not written.** `scanners/permission_inventory.ts`
reads boot.rofl, the corpus and the hosts and emits facts;
`rules/permission-model.rofl` derives the family, the roles and the negatives
from them; `test/permission-doc.test.ts` re-derives both sides live and fails
if this document's tables and boot.rofl disagree as SETS. A new relation added
to boot.rofl's permission machinery without a row here turns that test red.
Rebuild with `npm run perminv`, read the derivation with `npm run whyperm`.

Every number below carries its date. Nothing here is recalled.

---

## 1. What a book is

A **book** (the code says *perspective*, the design notes say *ledger*) is a
named partition of the store. `docs/choosing-perspectives.md` fixes what it is
allowed to mean: a book is a LEDGER — *who says so* — never a status, never a
modality. Every fact lives in exactly one; the store is laid out along that
axis (`idx: rel -> persp -> KeyRun`, `src/store.ts`).

A book exists once something claims authority over it. That is the whole of
the definition, and it is one rule:

```rofl
perspective(P)     :- authority(P, _).
```

Which is why `perspective` is the anchor the derived inventory hangs off: it
is boot.rofl's sentence for *a book exists*.

### The three jobs `[main]` does, measured

`f_main_carries_the_kernels_own_reflection_and_that_is_ring_zero` named three
jobs on one name. Re-measured 2026-09-08:

| job | state | measurement |
|---|---|---|
| **kernel's own data** — the reflection the kernel writes ABOUT a program | **separated for 17 of 21** | `KERNEL_BOOK` holds 17 of the 21 `RESERVED` names. The four left out — `authority`, `edb`, `mode`, `reserved` — are co-written on purpose: the kernel writes some rows and a program's preamble writes the rest, and `undefined_premise[audit]` reads `not edb(Rel)` once and must see both. |
| **unbracketed default** — where a literal with no `[book]` lands | **separated for the same 17** | `resolveBook` (`src/reflect.ts`, at the END of the file — cite the FUNCTION, the line moved from 680 to 775 while the old citation stood) rewrites an unbracketed literal over a `KERNEL_BOOK` relation to `[$kernel]`, and leaves an explicit bracket alone including a wrong one. |
| **the program's principal content** | **not separated, and not separable by that mechanism** | Of the 20 permission relations, 13 land in `[main]` and none is in `KERNEL_BOOK`, so `resolveBook` does not move any of them. |

So two of three jobs are separated **for the kernel's reflection** and for
nothing else. The residue is exactly the open decision in §5.1: a helper
relation nobody gave a bracket to is indistinguishable, in the flow graph,
from content leaving the main book.

Measured the same day, `examples/sensors.rofl` loaded on bare boot.rofl:

```
leak[audit]  4 rows:  main -> trust   main -> verified
                      $kernel -> trust   $kernel -> verified
crossing     8 rows
```

The first two are the rows `f_main_is_a_namespace_and_a_ledger_at_the_same_time`
recorded as irreducible, and the file says so in its own comments. The other
two are the same walk seen from one hop further back, surfaced when the
reflection moved to `[$kernel]`. **The claim that this symptom is gone is
false**, and it is false both for sensors alone and for the
`spat+goof+wtf+loot+sensors` combination it was measured against; see §5.4.

Bare boot.rofl with nothing else loaded reports `crossing` 0 and `leak` 0.

---

## 2. The permission relations

### 2.1 Declarations — what a PROGRAM writes by hand

Four relations. Each is declared `edb` in boot.rofl so that
`undefined_premise[audit]` does not read an empty table as a misspelling, and
three of the four are re-stated `@next` so the declaration outlives the tick
that made it (`f_a_ledger_declaration_expires_at_the_tick_boundary`; without
those clauses the corpus goes from 17 leak rows at load to 237 after one
tick).

| relation | who may write it | what it permits | corpus, 2026-09-08 |
|---|---|---|---|
| `imports`/2 | any program; **unauthenticated** — see §4 | `imports(To, From)`: the book `To` declares that it reads `From`. Both ends must be REGISTERED books. Closes into `sees`, which is its reflexive-transitive closure. Carried `@next`. | 45 facts across 15 programs, including boot.rofl's own 3 |
| `exports`/2 | in principle only a holder of `authority` over the source — the reason this is the AUTHENTICATED half; **not enforced today** | `exports(From, To)`: permission from the side being taken from. Only the nameless-reader case `exports(A, anyone)` is built: it licenses a crossing into a reader that has no name to be granted, and `not perspective(B)` keeps it from being an off switch for a book's named readers. Carried `@next`. | 2 facts, 2 programs (`exports(main, anyone)` in goof, `exports(world, anyone)` in npc) |
| `collects`/1 | any program | `collects(X)`: X deliberately gathers from books it does not name. The mirror of `exports`: here the GATHERER is the only named party, so the declaration is the gatherer's. Narrow by construction — `collects_from` requires `not perspective(A)`, so declaring it never silences a crossing FROM a book that has a name. Carried `@next`. | 9 facts, 9 programs |
| `demands_authorship`/1 | any program | `demands_authorship(P)`: the book P asks for every unsigned fact in it to be named. Opt-in: a book that says nothing keeps exactly what it had. | **0 facts in 0 programs.** Written once, in `test/authorship.test.ts`. See §3.3. |

### 2.2 Standing

| relation | who may write it | what it permits | corpus, 2026-09-08 |
|---|---|---|---|
| `authority`/2 | the KERNEL (`registerPersp`, `src/reflect.ts`) on a book's first use, and any program in its preamble | `authority(Book, Who)`: Who may write into Book without forging. It is `RESERVED` kernel vocabulary and boot.rofl neither concludes it nor declares it `edb` — boot.rofl only READS it. It is one of the four `RESERVED` names deliberately kept out of `KERNEL_BOOK` so a program can co-write it. | 83 facts across 14 programs; 300 rows across 26 example worlds |

### 2.3 The derived machinery

Nobody writes these. boot.rofl concludes all ten in this tick.

| relation | what it says | read by |
|---|---|---|
| `perspective`/1 | this book exists (something claims authority over it) | `sees`, and negatively by `collects_from` and `exported_to` |
| `sees`/2 | reflexive-transitive closure of `imports` — what a book is licensed to read | `crossing` (negated), `gathered`, itself |
| `flow`/2 | one rule's signature: it reads book A and writes book B | `flows_to`, `collects_from`, `exported_to` |
| `flows_to`/2 | the transitive closure of `flow`. The property the leak audit guards is transitive: every step separately licensed does not license the walk | `crossing`, `gathered`, itself |
| `crossing`/2 | a walk between two DIFFERENT books that `sees` does not cover | `leak` |
| `collects_from`/2 | the collection EVENT: X gathered from A, where A is not a registered book | `collected`, `gathered` |
| `exported_to`/2 | the export EVENT: A's content reached B, where B is not a registered book | `exported`, `gathered` |
| `gathered`/2 | a walk a declaration discharges. Transitive on both sides, and only over walks that were themselves licensed — the `exports` clause premises on `sees(X, A)` and not `flows_to(A, X)`, so a publication cannot launder a crossing that was already a violation | `leak` (negated) |
| `negated_under`/2 | relation R is negated in book P. The book-aware half of `safety.rofl`'s book-blind `neg_relation` | `widened` |
| `loader`/3 | R in book P took an asserted fact from principal Who, excluding `$kernel` | `widened` |

### 2.4 The evidence the audits judge

Five kernel relations. boot.rofl neither concludes them nor declares them
`edb`; it only reads them, and the derived model calls them `evidence`. They
are in `KERNEL_BOOK`, so they land in `[$kernel]` and an unbracketed read of
one is rewritten there — which is why `imports(audit, $kernel)` exists and is
revocable on its own. No program can write them: `src/api.ts` refuses a clause
that writes a `$` book, and `src/engine.ts` refuses to instantiate a
perspective VARIABLE to one.

| relation | what it supplies | read by |
|---|---|---|
| `asserted_by`/3 | who asserted a fact, and when. A call that named no author is signed `user` (`ANON_WHO`, `src/reflect.ts`) — **not** `$anon`, which is what boot.rofl's own comments and about twenty sites in `src/` still say | `forged`, `unattributed`, `loader` |
| `in_perspective`/2 | which book a fact landed in | `forged`, `unattributed` |
| `reads_from`/2 | which book a rule's body reads | `flow` |
| `writes_to`/2 | which book a rule's head writes | `flow` |
| `premise_lit`/3 | a premise reified, carrying the literal's book — the only place a negation's book is recorded | `negated_under` |

---

## 3. The audits

Six rows. **All six are terminal**: derived 2026-09-08, no rule anywhere in
this repository — not in boot.rofl, not in the corpus — reads any of them.
They exist to be looked at by a person or asserted on by a test. That is the
right state for a report and would be a smell anywhere else, and the model
reports it as `terminal_non_audit` = 0.

Three land empty across all 26 example worlds. **An empty audit is the
required result, not a dead relation**, and the model keeps those two states
apart (`quiet_audit` against `dead`).

| relation | what it catches | rows over 26 worlds | what it structurally CANNOT see |
|---|---|---|---|
| `leak`/2 | a crossing between two books that nothing licensed | 7 rows in 3 worlds (sensors 4, iffy 2, cram 1) | (a) it cannot tell an honest `imports` from a self-granted one, because `imports` is unauthenticated — the program declares what it reads and the source is never asked (`f_self_licensing_is_not_gone_it_is_now_a_line_someone_typed`); (b) a crossing that does not exist until a book is READ AT RUNTIME — `examples/loot` installs books from `demo.ts` and is clean on a bare world (`f_a_corpus_sweep_that_only_loads_misses_what_a_runtime_load_makes`); (c) a walk whose start is `[main]` cannot be distinguished from a helper relation nobody bracketed (§5.1) |
| `forged`/1 | a fact signed by a principal with no standing in the book it landed in | 0 | (a) **who granted the standing.** Nothing authenticates an anonymous load, so the operator and an attacker are one principal, `user`; a laundered self-grant is indistinguishable from an honest one, pinned by the second test in `test/authority-grant.test.ts`. (b) **rules.** `encodeRule` writes reflection facts directly and bypasses the signing path, so `who` does not apply to a rule under any value. (c) anonymity: an unsigned fact is signed `user`, and `user` has standing over every ordinary book by a measured decision (§4). |
| `collected`/1 | the declared gathers, as a positive row with a `why` — a licence nobody can ask about is an invisible absence | 6 rows in 6 worlds | whether the gather was APPROPRIATE. It reports that a declaration was exercised, never that it was warranted. |
| `exported`/1 | the declared exports to nameless readers, same shape and same reason | 2 rows in 2 worlds | the NAMED half of `exports` is not built, so it says nothing about `exports(A, some_named_book)` (§5.3). |
| `unattributed`/2 | unsigned facts in a book that asked to have them named | 0 | it is **opt-in and nothing in the corpus opts in**. Zero `.rofl` files declare `demands_authorship`. A survey that enumerates audits and reads silence as absence will miss it, which happened on 2026-09-08 (`f_i_measured_a_ceiling_with_the_instrument_switched_off`): with `demands_authorship(main).` declared, this audit names the laundering grant `forged` cannot see, exactly. **A survey of gates must ask which are OFF, not only which are quiet.** |
| `widened`/2 | one relation, negated in one book, taking asserted facts from more than one named loader — file A's `not p(X)` silently ranging over file B's `p` | 0 | (a) only ASSERTED base facts carry `asserted_by`, so a relation two files DERIVE into is outside it; (b) a negation reached through a rule chain — `not q(X)` where `q` comes from a co-written `p` — names `q` while the writers are `p`'s; (c) it is exactly as sharp as the host's discipline about `who`: two files loaded with no `who` are both `user`, and by that definition they are ONE writer. |

### 3.1 Which book each audit reads

An audit's `imports` line has to cover the book its premises read. Derived:

| audit | reads |
|---|---|
| `forged`, `unattributed` | `[$kernel]` (the trail) **and** `[main]` (`authority`, `demands_authorship`) |
| `leak`, `collected`, `exported`, `widened` | `[main]` only |

boot.rofl writes both lines and says which rules each covers:
`imports(audit, $kernel).` is revocable on its own — delete it and the audits
that need the trail go red by name while the rest stay green.

### 3.2 The structural audits are NOT part of this family

boot.rofl also holds `malformed`, `breach`, `unmoded`, `undefined_premise` and
their helper `rule_known`. The derived model puts them in `outside` — they
read the SHAPE of a program's rules and never a book or a principal. That set
is the control: if the family closure ever swallows them, the criterion has
gone slack.

### 3.3 The one negative worth stating twice

`demands_authorship` is declared in boot.rofl, audited by `unattributed`,
documented in `src/reflect.ts` — and **written by no `.rofl` program in this
repository**. The derived model reports it as `never_declared` and
`untaken_offer`. A grep for the name finds it in 11 files and cannot tell you
that.

---

## 4. The standing model

Read `test/authority-grant.test.ts`; it is the executable form of this
section.

1. **`registerPersp` (`src/reflect.ts`) grants two principals on a book's
   first use**: `authority(Book, $kernel)` and `authority(Book, user)`. An
   ordinary book is the user's, the way a home directory belongs to whoever is
   logged in. Measured on bare boot.rofl: `authority(main, W)` is exactly
   `$kernel` and `user`.
2. **`$kernel` is registered by hand and gets ONE principal.** Its writer list
   is `authority($kernel, $kernel)` and that is the whole of it. The anonymous
   principal is deliberately not granted there, so an anonymous row in the
   kernel's book is `forged` mechanically as well as refused at the door.
3. **A named author has standing NOWHERE by default.** `who: 'alice'` gets
   alice nothing until someone grants it.
4. **A grant must come from a principal that already has standing.** A single
   NAMED load carrying both the grant and the write is self-licensing and is
   refused: `authority(mybook, alice).` plus `p[mybook](x).` under
   `who: 'alice'` gives `forged` 1, and the row named is the grant itself.
5. **The operator loading anonymously is that principal.** The sanctioned path
   is TWO LOADS: the operator grants anonymously (signed `user`), then alice
   writes. `forged` 0. *Naming yourself is possible; granting yourself is not.*
6. **Standing is per book.** A named author with `mybook` still forges on
   `[main]`.
7. **Anonymity is RECORDED, not judged.** Every asserted fact carries
   `asserted_by`; a call that named no author is signed **`user`** — the
   constant is `ANON_WHO` in `src/reflect.ts` and its value is `'user'`, not
   `$anon`; boot.rofl's own comments and roughly twenty sites in `src/` still
   say `$anon` and are stale (finding
   `f_the_anonymous_principal_was_renamed_and_the_comments_were_not`). `user`
   is granted standing over ordinary books. Withholding it would make anonymity a
   forgery with no new rule at all, and was refused on a measurement: the
   honest corpus is anonymous end to end, so `forged` would be red on the first
   load of every program here and green on nothing. **The kernel records and a
   LEDGER judges** — that is what `demands_authorship` is for, and see §3.3
   for the state of that offer.
8. **The ceiling.** Nothing authenticates `who`. The sanctioned path of (5)
   and a laundering attack are the same path. `forged` separates *wrote a book
   nobody gave you* from *wrote a book someone gave you*, and cannot ask who
   that someone was. Authenticating `who` is a host concern — but see §3.3
   before concluding, as was concluded once and corrected, that no audit here
   sees it.

---

## 5. The open decisions — ONE list

Each entry: what is undecided, what would settle it, and the finding that
holds it.

### 5.1 Should the DEFAULT book be distinct from the PRINCIPAL one?

`f_main_is_a_namespace_and_a_ledger_at_the_same_time` (defect) ·
`f_main_carries_the_kernels_own_reflection_and_that_is_ring_zero` (insight).

A literal with no bracket lands in `[main]` because that is the DEFAULT;
`[main]` is also where a program's principal content lives. So the flow graph
cannot tell *this fact has no book of its own* from *this fact belongs to the
main book*, and an arithmetic helper looks exactly like content leaving the
main book.

**LIVE, and larger than recorded.** `examples/sensors.rofl` on bare boot.rofl,
measured 2026-09-08 and stable across the last four commits: 4 leak rows, not
the 2 the finding names. The extra two, `$kernel -> trust` and
`$kernel -> verified`, are the same walk one hop further back, exposed when
the reflection moved to `[$kernel]`.

**What would settle it:** a decision on a nameless, file-local default book
that no rule may cross out of, against today's `[main]` which is both. The
mechanism already exists and has been used once — `perspExplicit` records
whether the bracket was written and `resolveBook` is a first use of that flag.
The genuinely open half is what the local book is CALLED: minted from the file
name by the host, or anonymous. The narrow repair (give sensors' two helpers a
book of their own) was refused on the right grounds — it changes what every
program over that layer computes.

The second finding is the parent: it names all three jobs and its decision
contains this one. Two of the three are now separated for the kernel's
reflection (§1) and this is the residue.

### 5.2 Should an unresolved import be a REFUSAL at load rather than an audit row?

`f_export_precedes_import_so_the_check_belongs_at_load` (insight).

Loading here is ringed — boot, then rules, then facts — so a source is always
loaded before its consumer, and when a program declaring `imports(Q, P)`
arrives, P exists and its exports are already stated. A compiler refuses an
unresolved import; this reports one in a row someone may not read.

**LIVE.** One third of the finding is built: the nameless-reader half
`exports(A, anyone)` shipped 2026-09-08. Two thirds are not.

**What would settle it:** a decision on the load-time refusal. `load` already
refuses programs for other reasons, so the machinery is present. The finding
priced the cost as "27 declarations become 54"; **that number is stale** —
measured 2026-09-08, `imports` is 45 facts across 15 programs, so the real
cost of requiring both halves is 45 -> 90.

### 5.3 Should `exports` carry a NAMED reader?

`f_export_precedes_import_so_the_check_belongs_at_load` (same finding, second
half).

`exports(A, anyone)` is the nameless-reader case of one relation, not a second
mechanism: when the reader has a name the second argument carries it. The
named half is not built. `not perspective(B)` in `exported_to` keeps `anyone`
from covering named readers deliberately — widening it would turn one
declaration into an off switch for a book's outgoing crossings.

**What would settle it:** a decision that a book's own permission may
substitute for the reader's `imports` declaration. Both halves do different
work — `exports` is the permission and protects, `imports` is the declared
intent and makes the program readable — so the decision is whether to require
both, and that is the same decision as §5.2.

### 5.4 The re-measurement that declared this cluster dead was itself half wrong

`f_two_thirds_of_the_main_cluster_is_stale_and_the_third_resists_the_obvious_fix`
(insight).

Re-measured 2026-09-08, claim by claim:

| its claim | verdict |
|---|---|
| `KERNEL_BOOK` holds 17 of 21 reserved names | **holds** |
| `resolveBook` at `src/reflect.ts:680` rewrites unbracketed kernel literals | **the mechanism holds; the line number does not** — it is 775, and citing a line rather than a name is the defect boot.rofl already records against `facts/spec.rofl` |
| bare boot reports `crossing` 0 and `bridge_decl` 0 | **holds** (crossing 0, leak 0) |
| examples/sensors over boot now reports every audit 0, `crossing` 0, `leak` 0 | **false.** 4 leak rows and 8 crossing rows, both for sensors alone and for the `spat+goof+wtf+loot+sensors` set it names |
| naming yourself is a forgery, and adding `V.authority` to `KERNEL_BOOK` makes it worse | **holds**, and is the live third |

So §5.1 is NOT settled by it. **What would settle the remaining question** —
where a grant of standing should live, given that the grant is subject to the
standing check — is one of the three routes the finding lists, none yet
measured: exempt `authority` facts from `forged`; derive standing from the
host's `load(text, {who})` so a program's authority line is a request rather
than a fact; or make a claim of standing a claim, `claims(alice, authority(...))`,
so what is judged is the claim and not the act of writing it.

### 5.5 What does a perspective returned as a VARIABLE mean?

`f_an_unsafe_rule_with_a_variable_perspective_answers_with_the_variable`
(question).

**LIVE, reproduces exactly.** 2026-09-08: `m3[P](A) :- edge(A, _).` loads;
`classify` marks it unsafe because the head's perspective variable is bound by
nothing; querying `m3[Q](X)` answers `Q = ?Q, X = a` — a row whose book is a
variable, returned to the caller.

It is defensible as *for any book*, and it is the only place in this system
where a book comes back unnamed.

**What would settle it:** the decision in §5.1 plus a statement of what a
perspective IS. `docs/choosing-perspectives.md` fixes it as a ledger and never
a status; a variable ledger is not a ledger anyone can be answerable for, so
either the answer is a universally quantified one and should say so in its
rendering, or the rule should be refused at the door as unsafe in the head's
book position.

### 5.6 Should a `timeless(Rel)` interface replace the three carry rules?

`f_carrying_the_import_graph_costs_six_relations_of_reuse` (insight).

The three `@next` carry clauses make `imports`, `collects` and `exports`
opaque to `src/engine.ts`'s reuse plan — *the head stages instead of
materialising* — and everything downstream goes with them.

**LIVE, and the number in its title is stale by two.** Re-measured 2026-09-08
by diffing `derivedKeys` with and without the three clauses, over bare
boot.rofl, npc, sus, goof, loot, wtf, iffy and the six-file `js-*` stack: the
loss is **eight** relations, the same eight every time — `sees`, `crossing`,
`leak`, `gathered`, `collects_from`, `collected`, **`exported_to` and
`exported`**. The last two arrived with the `exports` carry on the same day
the finding was written. `flows_to` — the transitive closure, the one that
would actually cost something — is still not among them, and no relation
belonging to any program is. examples/npc loses only 2, because its own carry
rules for `imports` and `collects` were already in the file.

**What would settle it:** a decision on a kernel interface relation,
`timeless(imports).` beside `semantics` and `sealed`, letting a program
declare generically that a relation's facts outlive the tick — no rule,
therefore no opacity. It is a documented API addition with a `LIMITS.md` entry
and a new name in the closed vocabulary. The wall-clock half of the finding
(wtf, 1.06x) was NOT re-measured here.

### 5.7 Two findings in the standing group are not about this at all

Recorded so the next reader does not re-derive it.
`f_counting_reads_oppositely_by_domain` is about semiring instance
documentation — how many derivations means robust in one domain and ambiguous
in another. `f_afk_needs_incremental_maintenance` is about write rate and
incremental maintenance. Neither names a relation in this inventory. They stay
open on their own merits and belong to other documents.

### 5.8 Three worlds still leak at load, and two of them say nothing about it

`f_three_worlds_still_leak_at_load_and_nothing_says_so` (defect), recorded by
this work.

Derived by the scanner, which loads each `examples/` world on bare boot.rofl,
evaluates once at tick 0, and asks each audit IN THE BOOK IT LANDS IN. 26
worlds built, `leak[audit]` non-empty in three:

| world | rows |
|---|---|
| examples/sensors | 4 — declared open in its own comments, and the standing example of §5.1 |
| examples/iffy | 2 — `record -> audit`, `record -> main`. No comment, no declaration, no test. |
| examples/cram | 1 — `$kernel -> log`. Same. |

Two earlier sweeps recorded that the tree was brought to `leak` 0. It is not,
and the reason is the class one of them already names: **a sweep that reports
"the whole tree is at zero" must say which worlds it built, and print the rows
rather than the count.**

**What would settle it:** per world, and each is small — either the crossing
is real and wants an `imports` line, or it is the default-book case of §5.1
and wants a comment saying so, which is what sensors did.

---

## 6. Three hazards this model found

**A demo may conclude into a boot.rofl relation NAME and only the book keeps
them apart.** Derived as `name_collision`, 2 rows: `examples/aka` concludes
`crossing[recon]/1` against boot's `crossing[main]/2`, and `examples/ditto`
concludes `exported[main]/3` against boot's `exported[audit]/1`. Neither
collides today, because a relation is keyed by name AND book. Nothing prevents
the next one from being written without the bracket. `breach[audit]` refuses a
rule concluding into a RESERVED relation; none of boot.rofl's own vocabulary
is reserved.

**`scripts/kernel_grep.ts` keeps a hand-copied list of boot.rofl's relation
names** and has fallen behind it once already, by three names. The list is
derivable from exactly the facts this scanner emits.

**A constant was renamed and about twenty-five paragraphs explaining it were
not.** `ANON_WHO` is `'user'`; boot.rofl said `$anon` four lines above a rule
that reads `user`, and `src/reflect.ts` and `src/api.ts` carry fourteen more
such sites. The three in boot.rofl are corrected; the rest are a separate piece
of work, and some of the test ones are correct prose ABOUT the rename and must
not be swept. `f_the_anonymous_principal_was_renamed_and_the_comments_were_not`.
This is the same disease as the twelve-places problem, one level down: the
comments are the twelve places for the kernel.

---

## 7. Where the pieces are

| piece | path |
|---|---|
| the program | `boot.rofl` |
| the kernel side | `src/reflect.ts` (`V`, `RESERVED`, `KERNEL_BOOK`, `resolveBook`, `registerPersp`) |
| the scanner | `scanners/permission_inventory.ts` — `npm run perminv` |
| the derivation | `rules/permission-model.rofl` — `npm run whyperm` |
| the generated facts | `facts/permission-inventory.rofl` |
| the gate | `test/permission-doc.test.ts` |
| the standing model, executable | `test/authority-grant.test.ts` |
| the crossing audits, executable | `test/bridges.test.ts`, `test/exports.test.ts`, `test/flow-closure.test.ts` |
| authorship, executable | `test/authorship.test.ts` |
| the widened negation, executable | `test/widened-negation.test.ts` |
| what a book may MEAN | `docs/choosing-perspectives.md` |
