# The store: one household, many books

How SPAT becomes multi-user without a database, a server or a second set of
rules. The principle is ROFL's own: **a perspective is a ledger is a book,
and a book has one writer** (`authority(Book, Writer)`). The store makes that
the letter of the file system.

    $SPAT_ROOT/
      users.rofl                 tg_user(User, ChatId, Tenant, Role).  the operator's hand; the tool only reads
      <tenant>/
        world.rofl               the household: person, constraint, usual, travel, current, ru_name …
        ledgers/<user>.rofl      that user's book — edits, reports, confirm/retract. Loaded as [p_<user>]
        me.rofl                  the tool's own book — the operator's `roll`. Loaded as [p_me]

The rules of access — `examples/spat/access.rofl` — are code and live beside
`spat.rofl`. They are never copied into a tenant's directory: a copy is a
version drift between the image and the volume. What is particular to a
household is a fact in `world.rofl`, never a rule.

Identity and root come from the environment and nowhere else: `SPAT_ROOT`,
`SPAT_TENANT`, `SPAT_AS`, `SPAT_TZ` (and `SPAT_NOW` for tests, `SPAT_VIA`
for the channel a bot writes as — `telegram`; the default is `cli`). There is
no `--as`. A call with no identity or no tenant is code 5 and writes nothing.

## The eight principles, and where each one is

1. **The tag is the file name.** `store.ts` parses a book one line at a time
   and stamps every fact with the book's perspective. A line that names
   another book — `e_skip[p_alex](...)` inside `robin.rofl` — is refused with
   the file and the line, code 6, and *nothing* from that file is loaded: the
   whole file is checked before one fact of it is asserted. A rule in a book
   is refused the same way; a book holds facts. (`bookClauses`)

2. **Reading is the set of books `may_read` allows.** The loader first builds
   a small world — `access.rofl`, `world.rofl`, `users.rofl`, and its own
   facts `tenant(T)`, `caller(U)`, `authority(Book, User)` per file it found —
   and asks `stranger(U)` and `may_read(U, L)`. Only then does it open the
   books that answered yes. The store asks the model which files to open. An
   adult reads every book of the family and the tool's; a helper reads their
   own and the tool's; `me` reads all; the operator reads all; a stranger is
   code 5 with two files opened (`world.rofl`, `users.rofl`) and no book.

3. **Writing is your own book, and only what `may_edit` allows.** `spat edit`
   turns text into facts, loads the world *with the candidate* marked
   `trial(E)`, and reads the verdict: `edit_without_right[audit](E)` → code
   4, nothing on disk; `breaks(E, Reason)` → code 3, written as `proposed(E)`,
   inert until `confirm`; else code 0, written. The effective `moved`,
   `skipped`, `added`, `absent_on` are *derived* from the books through
   `acts(E)`, which requires the entry to be within its right, not retracted,
   and not pending. The edit id is a constraint (`constraint(E, Author,
   household|external)`), so `why` names the person, `relax` can waive it and
   the unowned-lint holds for edits too.

4. **Append only.** A retraction is `retracted(E, Iso, Via)` in the same book;
   a confirmation is `confirmed(E, Iso, Via)`. Every entry carries its moment
   and its channel as facts (`edit_at`, `edit_via`, `for_week`), so `why`
   sees them. A confirm or retract written into another book is
   `stray[audit]` and inert — the join is on the book, always.

5. **Identity from the environment.** See above; `whoami` prints what the
   call is and which books it was given.

6. **Atomicity — the choice.** Every write is one `write()` on a descriptor
   opened `O_APPEND`, one entry (a few hundred bytes, capped at 4096) per
   call. Two processes appending to the same book both land, whole, in some
   order: the kernel positions each `O_APPEND` write at the current end
   atomically. No lock file, so a crash leaves no stale lock; no
   read-modify-write, so no lost update; the second writer neither waits nor
   fails — the brief allowed "code 6 or wait", and the honest answer is that
   neither is needed for an append-only book. The id of an edit is a hash of
   (author, moment, text), so the same person saying the same thing at the
   same instant is one edit, not two. Measured in `demo.ts`: six `spat edit`
   processes started at once into one book, every one exits 0 or 3, the book
   parses, all six entries are present. What this does NOT cover: a network
   file system where `O_APPEND` is not atomic (NFS); a PVC on one node is.

7. **The week changes by `spat roll <week>`, operator only.** The roll is
   `rolled(Week, Iso)` in `me.rofl`; the loader reads the latest one and
   applies it exactly as `--week-of` is applied — one `current/1` fact,
   swapped before the first evaluation. `world.rofl` is not written.
   `--week-of` still answers for any week, with that week's own edits, since
   every entry carries `for_week`.

8. **`spat init <tenant> --world <file>`, operator only.** The operator first
   admits themself for the new tenant in `users.rofl` by hand (that line *is*
   the admission); `init` then lays out the directory, copies the world,
   creates an empty book per `person(_, adult|helper)` and an empty
   `me.rofl`. A second `init` is code 6.

## The form of an entry

    -- 2026-08-31T21:30:00+03:00 cli robin: move run_school 07:25
    e_move[p_robin](e_7f397b19, run_school, all, 445).
    edit_at[p_robin](e_7f397b19, "2026-08-31T21:30:00+03:00").
    edit_via[p_robin](e_7f397b19, cli).
    for_week[p_robin](e_7f397b19, w0831).
    proposed[p_robin](e_7f397b19).                 -- only when it broke the day (code 3)
    confirmed[p_robin](e_7f397b19, "…", cli).      -- later, by the same person
    retracted[p_robin](e_7f397b19, "…", cli).      -- later, by the same person

The operations, one relation each: `e_move(E, Block, Day|all, Time)`,
`e_skip(E, Block, Day|all)`, `e_add(E, What, Day, From, To, Who, Where)`,
`e_sick(E, Person, Day|all)`, `e_car_out(E, Day, From, To)`,
`e_report(E, Constraint, Day, Time)`. The comment line is for a person
reading the file; the tool reads the facts. The tag is written out because a
file that says what it is can be checked against what it is.

`sick` and `car out` are one line each; what they do is rules: every block
of the person that day is skipped, every block with them in it is skipped,
the person is `absent_on`; the car is nowhere in its window, so a journey
that would take it has no car standing where it starts, walking is the only
mode, and `too_slow` says whether it still fits. A `report` changes nothing:
it is first-hand, in the reporter's book, for the operator to carry into
`world.rofl`.

## "Breaks the day" — what it means and how it is asked

An edit breaks a day it touches when that day has a defect it did not have
before: `uncovered`, `no_time`, `double_booked`, `missed_window`, `no_way`,
`cannot_get_there`, `no_way_on_foot`, `on_foot_unknown`. "Before" is the same
world without the candidate, which the writer has already evaluated; its
defects go in as `before(Day, Reason, Where)` — *where* is the slot, the
block, the run — and `breaks_on(E, D, R)` is a rule. So a Thursday that
already has a red block at 17:40 is not a licence to add a second one, and
`why breaks(E, uncovered)` shows the finite failure of `before(...)` in the
proof. One call reads the files once and evaluates twice.

## What is deliberately not decided

- **A helper in two households.** `users.rofl` keys a user to one tenant per
  row; a nanny with two families is two rows and two identities, and nothing
  here says they are the same person. Left open.
- **The operator's own edits.** An operator who is not a member has no book;
  `edit` as operator is code 4. If the operator should also edit, they are an
  adult in `world.rofl` and an operator in `users.rofl` — both roles hold.
- **`report` reaching the world.** The contract says "not into the world
  without the owner-operator's confirm"; the store records the report and
  derives `reported(C, D, T, U)` for the operator to read. How the operator
  carries it into `world.rofl` (by hand, today) is not a verb.
- **Move to another day.** `move <block> [<day>] <time>` changes the time on
  a day; the grammar has no target day, as the contract wrote it.
- **The comment line's timestamp.** Written from `SPAT_NOW`/the clock in
  ISO; nothing parses it — the fact `edit_at` is the record.
- **Same id twice in one book.** Possible only if the same person writes the
  same text at the same millisecond twice; the set semantics make it one
  edit. Two *different* entries under one id would need a collision of
  SHA-1 prefixes; not guarded.
- **`O_APPEND` on NFS.** Not atomic there; see 6.

## What the gate holds

- `npm test`: worlds `spat` (the rules alone load clean, no `leak`, no
  `undefined_premise`), `spat_store` (the shipped books, both engines:
  `may_read` 17, `may_edit` 72, `no_right` 8, `acts` 16, `stray` 2,
  `skipped` 11, `moved` 3, `added` 3 …) and `spat_trial` (the same store
  under a trial, `breaks_on` 1). Declared in `facts/checks.rofl`. Every
  entry of the fixture is there to discriminate a premise of `access.rofl`:
  one premise dropped moves this census (measured 2026-09-14, every premise
  of every rule, 149 drops: the 64 that leave the rule range-restricted are
  all killed by the census; of the 85 that leave it unsafe, 71 move the
  census and 14 go silently inert — a rule with no binder is not refused,
  it is unfolded on demand and derives nothing — and those 14 are caught by
  the demo's own check that no rule of the store is demand-backed).
- `npm run test:hosts`: `examples/spat/demo.ts`, 51 scenarios in seven
  groups run at once against copies of `store.example/` in a temp dir — the
  tag wall, the rights, the stranger's two opened files, breaks/confirm/
  retract, `tomorrow` under `SPAT_TZ` with the process in UTC, six writers at
  once, roll, ics, init, the materialisation check and the reasons table.
  Exit 1 on any FAIL, so the golden's exit code is part of the answer; 47 s
  on a quiet laptop.
