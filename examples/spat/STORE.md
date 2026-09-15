# The store: one household, many books

How SPAT becomes multi-user without a server or a second set of rules. The
principle is ROFL's own: **a perspective is a ledger is a book, and a book
has one writer** (`authority(Book, Writer)`). The store makes that the letter
of the volume: a household's books are rows in one SQLite file, and the row's
`ledger` column is the book.

    $SPAT_ROOT/<tenant>.sqlite     the household's VOLUME — private, one file per tenant (volume.ts)
      users                        tg_user(User, ChatId, Tenant, Role).  the operator's hand; the tool only reads. Loaded as [main]
      world                        the household: person, constraint, usual, travel, current, ru_name …  never written. [main]
      p_<user>                     that user's book — edits, reports, confirm/retract. Loaded as [p_<user>]
      p_me                         the tool's own book — the operator's `roll`. Loaded as [p_me]

The rules of access — `examples/spat/access.rofl` — are code and live beside
`spat.rofl`. They are never copied into a tenant's volume: a copy is a
version drift between the image and the volume. What is particular to a
household is a fact in its `world` book, never a rule. Which books are
private and where they live is `examples/spat/volumes.rofl` — see «Тома»
below.

Identity and root come from the environment and nowhere else. `SPAT_ROOT`,
`SPAT_TZ` (and `SPAT_NOW` for tests, `SPAT_VIA` for the channel a bot writes
as — `telegram`; the default is `cli`), and EXACTLY ONE of two sources of
identity:

    SPAT_AS + SPAT_TENANT   a book by name — `me` (the scheduler) and the operator by hand
    SPAT_FROM_ID            the Telegram sender's id; the users book says who and which family

Both set, or neither, is code 5. A sender id no users book lists is
`stranger(N)` — a rule, not a string — and code 5 with «я вас не знаю;
добавить может владелец», decided over the users books alone (the named
tenant's, or every volume's under the root), before the world of any tenant
is opened. Under `SPAT_FROM_ID` the tenant comes from the users book;
`SPAT_TENANT` is optional and, if given, must agree (else 5); an id listed
in two families needs it. There is no `--as`, and the core knows nothing of
chats or message files — that is the bot's shim.

## The eight principles, and where each one is

1. **The ledger is the column.** `volume.ts` reads a book row by row and
   builds each fact from the row's typed terms (`args` is the kernel's own
   `termToJson`), stamped with the perspective the `ledger` column names.
   No text is parsed, so no row can say which book it is in: a row put into
   the base by hand under `ledger = 'p_alex'` IS in alex's book, whoever put
   it there, and the readers alex's book is closed to never see it; a row
   whose `pred` is not an atom (`e_skip[p_alex]`, a tag smuggled into the
   column) or whose `args` hold a term the parser would not read back
   refuses the whole book, code 6 with the file and the `seq`, at the
   loader and at `dump` alike. Text is
   parsed only where there is text — the program's own files, and a
   hand-written book on its way in through `spat volume load` — and there
   the old wall stands unchanged: the tag is the file name, a line that
   names another book (`e_skip[p_alex](...)` inside `robin.rofl`) or a rule
   refuses the whole file with the file and the line, code 6, and not one
   row is written. (`bookClauses`, `readBook`, `write`)

2. **Reading is the set of books `may_read` allows.** The loader first builds
   a small world — `access.rofl`, the `world` and `users` books, and its own
   facts `tenant(T)`, `caller(U)`, `authority(Book, User)` per book the
   volume registers — and asks `stranger(U)` and `may_read(U, L)`. Only then
   does it read the books that answered yes. The store asks the model which
   books to open. An adult reads every book of the family and the tool's; a
   helper reads their own and the tool's; `me` reads all; the operator
   reads all; a stranger is code 5 with two books opened (`users`, `world`)
   and no person's — one book (`users`) when the stranger is an unknown
   sender id.

3. **Writing is your own book, and only what `may_edit` allows.** `spat edit`
   turns text into facts, loads the world *with the candidate* marked
   `trial(E)`, and reads the verdict: `edit_without_right[audit](E)` → code
   4, nothing in the base; `breaks(E, Reason)` → code 3, written as
   `proposed(E)`, inert until `confirm`; else code 0, written. The effective
   `moved`, `skipped`, `added`, `absent_on` are *derived* from the books
   through `acts(E)`, which requires the entry to be within its right, not
   retracted, and not pending. The edit id is a constraint (`constraint(E,
   Author, household|external)`), so `why` names the person, `relax` can
   waive it and the unowned-lint holds for edits too.

4. **INSERT only, held by the base.** A retraction is `retracted(E, Iso, Via)`
   in the same book; a confirmation is `confirmed(E, Iso, Via)`. Every entry
   carries its moment and its channel as facts (`edit_at`, `edit_via`,
   `for_week`), so `why` sees them. A `BEFORE UPDATE` and a `BEFORE DELETE`
   trigger on `facts` raise — so "only addition" is what the base does, not
   what the tool promises, and a hand with `sqlite3` gets the same refusal
   the tool would. A confirm or retract written into another book is
   `stray[audit]` and inert — the join is on the book, always.

5. **Identity from the environment.** See above; `whoami` prints what the
   call is and which books it was given.

6. **Atomicity — the choice.** Every write is ONE TRANSACTION: the facts of
   an entry, and for `roll` the week in `meta`, land together or not at all.
   The volume is in WAL mode; a writer takes the lock with `BEGIN IMMEDIATE`
   and a second writer waits (`busy_timeout` 5 s) rather than fails, so two
   processes writing one book both land, whole, each entry's rows
   consecutive in `seq`. Readers never wait for a writer. No lock file, so
   no stale lock after a crash; SQLite's journal is the recovery. Measured
   in `demo.ts`: six `spat edit` processes started at once into one book,
   every one exits 0 or 3, the book holds all six entries, every entry's
   four rows are consecutive. What this replaces: the text book's one
   `O_APPEND` write per entry, argued the same way; what this does NOT
   cover is a network file system where SQLite's locking is unreliable
   (NFS); a PVC on one node is fine.

7. **The week changes by `spat roll <week>`, operator only.** The roll is
   `rolled(Week, Iso)` in `p_me`, and the same transaction sets `meta.week`;
   the loader reads the latest `rolled` and applies it exactly as
   `--week-of` is applied — one `current/1` fact, swapped before the first
   evaluation. The world is not written. `--week-of` still answers for any
   week, with that week's own edits, since every entry carries `for_week`.

8. **`spat init <tenant> --world <file> --users <file>`, operator only.** The
   operator first writes their own admission by hand — `tg_user(alex,
   100001, fam2, operator).` in the users file (that line *is* the
   admission; without `--users` there is nobody to be operator, code 2);
   `init` resolves the caller over THAT file, refuses a caller it does not
   make operator (4), and only then creates the volume: the users file and
   the world file become its first two books, and an empty book is
   registered per `person(_, adult|helper)` and for `me`. A second `init`
   is code 6, and a refused one leaves no file behind.

## The form of an entry

One entry is a handful of ROWS in `facts`, consecutive in `seq`, sharing the
trail columns `at`, `via`, `edit`:

    seq  ledger   pred      args                                              at                          via  edit
    37   p_robin  e_move    [{"k":"a","name":"e_7f397b19"},{"k":"a","name":"run_school"},{"k":"a","name":"all"},{"k":"i","v":445}]  2026-08-31T21:30:00+03:00  cli  move run_school 07:25
    38   p_robin  edit_at   [{"k":"a","name":"e_7f397b19"},{"k":"s","v":"2026-08-31T21:30:00+03:00"}]   …
    39   p_robin  edit_via  [{"k":"a","name":"e_7f397b19"},{"k":"a","name":"cli"}]                       …
    40   p_robin  for_week  [{"k":"a","name":"e_7f397b19"},{"k":"a","name":"w0831"}]                     …
    41   p_robin  proposed  [{"k":"a","name":"e_7f397b19"}]                        -- only when it broke the day (code 3)
         p_robin  confirmed [E, {"k":"s","v":"…"}, cli]                            -- later, by the same person
         p_robin  retracted [E, {"k":"s","v":"…"}, cli]                            -- later, by the same person

`spat volume dump` renders the same as text, which is what the text book
was — one fact per line, tagged as the loader stamps it, the trail as the
comment above the entry:

    -- 2026-08-31T21:30:00+03:00 cli robin: move run_school 07:25
    e_move[p_robin](e_7f397b19, run_school, all, 445).
    edit_at[p_robin](e_7f397b19, "2026-08-31T21:30:00+03:00").
    edit_via[p_robin](e_7f397b19, cli).
    for_week[p_robin](e_7f397b19, w0831).

The operations, one relation each: `e_move(E, Block, Day|all, Time)`,
`e_skip(E, Block, Day|all)`, `e_add(E, What, Day, From, To, Who, Where)`,
`e_sick(E, Person, Day|all)`, `e_car_out(E, Day, From, To)`,
`e_report(E, Constraint, Day, Time)`. The `edit` column is for a person
reading the dump; the tool reads the facts. A term is written as the kernel
writes it in a snapshot — `{"k":"a"}` an atom, `{"k":"i"}` an integer,
`{"k":"s"}` a string — so `robin` and `"robin"` are two rows that cannot be
confused, and a row holding a variable is refused at the writer and at the
reader.

`sick` and `car out` are one line each; what they do is rules: every block
of the person that day is skipped, every block with them in it is skipped,
the person is `absent_on`; the car is nowhere in its window, so a journey
that would take it has no car standing where it starts, walking is the only
mode, and `too_slow` says whether it still fits. A `report` changes nothing:
it is first-hand, in the reporter's book, for the operator to carry into
the `world` book.

## Nothing handed in becomes a second row

An edit's text is one line: a control character anywhere (newline, CR, tab,
NUL) is code 2, and so is any token after the grammar's last field. What is
written is the clauses the trial was asked about — the same objects, no
text in between — and the writer refuses a clause that is not a ground fact
in the ledger's own perspective, so a value that reached a fact as two
clauses is refused at the writer, not discovered by the next reader. The
trail goes into COLUMNS, not into a comment line, so it cannot hold a
clause whatever it was handed. The same rule at the door: `SPAT_AS`,
`SPAT_TENANT`, `SPAT_VIA` and `--week-of` are atoms or the call is refused
(5 for the environment, 2 for the flag). Measured on 33832b7 (text books):
one edit with a newline in it wrote `e_skip[p_alex](...)` into robin's book
and bricked it for every adult. With rows the second clause has nowhere to
go: `demo.ts` group 9 hands the same text in and asks the base for its row
count and its last `seq` after each refusal.

## A dated day is shown under its own week

`tomorrow` and `show` (with no day) are asked about a DATE. The loader
asserts `date_monday(today|tomorrow, "YYYY-MM-DD")` — the Monday of that date
in `SPAT_TZ` — and the rules answer `week_of(Which, W)` over `week_starts`,
`no_week(Which, Monday)` when the world has no such week, and
`stale_week(C, W)` when the week in force is not today's. The verb then reads
the world under the date's week — the same swap `--week-of` makes — so
Sunday evening's «завтра» is Monday of the NEXT week with that week's own
`moved`/`added` and the edits recorded `for_week` it, never the same weekday
of the week that is ending; a date with no `week_starts` is code 2 with the
Monday it needs, never a day of some other week under the heading. Edits
still land in the week in force: on Monday morning before the operator's
`roll`, `whoami` and every applied edit print «в силе неделя w0831, а сегодня
неделя w0907: нужен roll» from the `stale_week` row. Measured on 33832b7:
`SPAT_NOW=2026-09-06T21:30+03:00` printed w0831's Monday under «ЗАВТРА, пн».

## "Breaks the day" — what it means and how it is asked

An edit breaks a day it touches when that day has a defect it did not have
before: `uncovered`, `no_time`, `double_booked`, `missed_window`, `no_way`,
`cannot_get_there`, `no_way_on_foot`, `on_foot_unknown`. "Before" is the same
world without the candidate, which the writer has already evaluated; its
defects go in as `before(Day, Reason, Where)` — *where* is the slot, the
block, the run — and `breaks_on(E, D, R)` is a rule. So a Thursday that
already has a red block at 17:40 is not a licence to add a second one, and
`why breaks(E, uncovered)` shows the finite failure of `before(...)` in the
proof. One call reads the books once and evaluates twice.

## Тома: what is private is a property of the volume, not of the file

Decided 2026-09-15: «`.rofl`-файлы как программа мне нравятся. Именно
пользовательские приватные данные, которые не должны попадать в
репозиторий, хочу хранить иначе. Возможно, это свойство книги/тома.» So the
rules and the shipped example stay `.rofl`, privacy and residency become a
property of the VOLUME a book is in, and a private volume is SQLite.

**`volumes.rofl` declares the volumes and never their contents:**

    volume(program,   public,  repo).     -- spat.rofl, access.rofl, volumes.rofl, week.example.rofl
    volume(household, private, store).    -- one tenant: world, users, one book per account, the tool's
    book(rules, program).  book(example_world, program).
    book(world, household).  book(users, household).  book(L, household) :- ledger(L, _).
    lives_in(B, Kind, Where) :- book(B, V), volume(V, Kind, Where).
    private_book(B) :- lives_in(B, private, _).    public_book(B) :- lives_in(B, public, _).

Nothing in `spat.rofl` or `access.rofl` reads any of it: `git diff` over the
access rules is empty, which is the acceptance criterion of the separation.
The model does not know what a volume is (`docs/volumes-and-residency.md`);
this is the scanner's declaration of which unit of storage a book is in.

**The loader says what it did, so the declaration can be audited.** For
every book it read it asserts `book_source(B, repo|store)`, and it signs the
program's load — `spat.rofl` + `access.rofl` + `volumes.rofl` — with
`who: 'rules'`, the public book's name (`authority(main, rules)` is the
loader's own line). Two audits follow, both declared `alarm` so a world
raising one fails `npm test` whatever the golden says:

- `misplaced[audit](B, Where)` — a book read from somewhere its volume is
  not declared to be.
- `private_in_public[audit](A)` — WHO LIVES IN THE HOUSE IS NOT CODE: an
  atom that is a `person`, a `ru_name` or a `tg_user` (a private atom) named
  by a fact the PUBLIC book asserted. Read off the kernel's own trail —
  `asserted_by($fact(R, P, Args), rules, _)` — with the argument list walked
  as the `$cons` chain the kernel recorded; no text, no list of relations
  to keep. Planted `ru_name(robin, "Робин").` in the program: one row,
  `robin`. The honest program: none (its 94 facts are `hh`, `mm`, `grid`,
  `edb`, `role(me, me)`, `collects(main)`).

**The schema** (`volume.ts`, `PRAGMA journal_mode=WAL`, schema `1` in `meta`):

    facts(seq INTEGER PRIMARY KEY, ledger TEXT, pred TEXT, args TEXT /* JSON array of kernel terms */,
          at TEXT, via TEXT, edit TEXT)      -- INSERT only: BEFORE UPDATE / BEFORE DELETE → RAISE(ABORT)
    books(ledger TEXT PRIMARY KEY, user TEXT) -- which books exist and whose they are (init, volume load)
    meta(key TEXT PRIMARY KEY, value TEXT)    -- tenant, schema, week

**The operator's verbs** (`spat volume …`, code 4 for anyone else):

    spat volume load <tenant> <file.rofl> [--book <ledger>]   a hand-written book in, through bookClauses — the tag is the
                                                               file name (robin.rofl → p_robin, me.rofl → p_me, world.rofl → world,
                                                               users.rofl → users); a foreign tag or a rule refuses the whole file
    spat volume load <tenant> <dir>                            the legacy layout in one command: <dir>/ledgers/*.rofl and
                                                               <dir>/me.rofl, each into its own book; world and users are init's
    spat volume dump <tenant> [<book>]                         a book (or every book) out as .rofl text, deterministic: seq order,
                                                               no clock, no path; the same book dumps to the same bytes.
                                                               ITS FIRST CLAUSE SAYS WHAT IT IS: `dump_of(<tenant>, <book>, private).`

The round trip is a test, not a promise: `demo.ts` dumps every book of the
fixture, loads the dumps into a second volume and compares the books as
sets of terms — strings stay strings, numbers stay numbers, nothing
crosses a book. `load` strips the marker (it is a claim about the file,
not a fact of the book; `write` refuses it as one) and refuses a dump of
another book than the one it is read into.

**A dump in the public tree is refused, not blessed.** The marker is the
file's first clause — the way boot.rofl claims the kernel ring on line
one — and `scripts/goldens.ts` reads it by PARSING the file, never by
matching its text. A `.rofl` under `examples/` that opens with `dump_of`
is dropped from its world and `npm test` prints `FAIL spat: private dump
in public tree: examples/spat/<file> (dump_of(...))`; `bless` prints the
same as `REFUSED` and writes the golden without it. Measured 2026-09-15
before this: a dump planted as `examples/spat/leak-dump.rofl` moved the
census (`awake 2->3, may_edit 32->34`) with nothing saying why, and a
bless would have taken it. The gate plants its own dump on every run and
requires the refusal by name, with `week.example.rofl` still loaded as the
control. And the rule side has the same door: `private_in_public[audit](A)
:- dump_of(_, _, private), private_atom(A)` — a world that swallowed a
dump names every person of the household (demo group 11: eight).

**Migration of the stand.** The text layout (`users.rofl`,
`<tenant>/{world.rofl, ledgers/*.rofl, me.rofl}`) is not read by the tool
any more; it is imported in two commands: `spat init <tenant> --world
<tenant>/world.rofl --users users.rofl`, then `spat volume load <tenant>
<tenant>/` — every book under `ledgers/` and `me.rofl`, each into ITS OWN
ledger, never the operator's. `demo.ts` runs exactly that over
`store.example/` (group 7) and its `fresh()` is the same sequence
in-process.

**What CI reads.** `npm test` loads `.rofl` files alone, skips what git
ignores, and now also plants a `zzz-planted.sqlite` beside the shipped
example and asks two questions — the walk built the same `spat` world with
it as without, and `git check-ignore` names it (`.gitignore`: `*.sqlite`,
`*.sqlite-wal`, `*.sqlite-shm`) — with a tracked `.rofl` in the same call
as the control that the instrument can say "not ignored". Measured
2026-09-15 with the pattern removed: «zzz-planted.sqlite is not gitignored
— a household's volume copied into the tree would ride into a commit».
The fixture `store.example/` stays public text (a made-up household) and
is the SOURCE the demo imports; a real household is a `.sqlite` under
`$SPAT_ROOT` and nothing in the tree reads one.

**`node:sqlite` — a requirement on the host.** Built into Node ≥ 22.13
without a flag; this laptop is 22.22.0 with SQLite 3.50.4, and
`node:22-slim` resolved to 22.23.2 on 2026-09-15 (Docker Hub, built
2026-08-25). On every 22.x the module emits `ExperimentalWarning: SQLite is
an experimental feature … (node:<pid>)` to STDERR on first use — stdout is
clean (measured) — with the process id in the line. THE HOST THAT RUNS
`spat` MUST SET `NODE_OPTIONS=--disable-warning=ExperimentalWarning` (or
pass the flag): `demo.ts` does so on every spawn so its output hashes, and
the stand's shim must too, or the line rides into whatever reads stderr.

## What is deliberately not decided

- **A helper in two households.** The users book keys a user to one tenant
  per row; a nanny with two families is two rows under one sender id, in
  two volumes, and a call from that id without `SPAT_TENANT` is code 5 («в
  нескольких семьях: задайте SPAT_TENANT»). Which family a message is about
  is the shim's question, not the core's. Left there.
- **Revoking an admission.** The users book is INSERT only like every other,
  so a user once admitted cannot be struck out by deleting a row; today the
  operator's only lever is the volume itself. A `tg_user_gone(User,
  ChatId, Tenant)` row and a rule in `access.rofl` that reads it would be
  the honest shape; that is a change to the access rules and is not made
  here.
- **A row of another tenant in a users book.** `volume load` imports a
  users file verbatim, so `tg_user(mallory, 100004, elsewhere, adult)`
  lands in `example.sqlite`; the rules make it inert here
  (`role(U, R) :- tg_user(U, _, T, R), tenant(T)`) and `resolve` follows it
  to a volume `elsewhere.sqlite` that must exist (5 if it does not). Not
  refused at the import; it would be one more line of wall.
- **A person named `world`, `users` or `rules`.** The main book's three
  sources are named as principals (`who`) and `authority(main, rules)` is a
  fact; a household with a person of that name would make the name an
  account and a ledger. Not guarded.
- **The operator's own edits.** An operator who is not a member has no book;
  `edit` as operator is code 4. If the operator should also edit, they are
  an adult in the world and an operator in the users book — both roles hold.
- **`report` reaching the world.** The contract says "not into the world
  without the owner-operator's confirm"; the store records the report and
  derives `reported(C, D, T, U)` for the operator to read. How the operator
  carries it into the world (a new world file and `volume load --book
  world`, today) is not a verb.
- **Move to another day.** `move <block> [<day>] <time>` changes the time on
  a day; the grammar has no target day, as the contract wrote it.
- **Which week an edit made on Sunday evening is for.** `for_week` is the
  week in force, and `skip walk mon` typed on Sunday before the roll lands in
  the ending week's Monday. The warning above is printed; the operator's
  Sunday `roll` is the discipline. Deriving the week from the day named is
  not possible — a weekday has no date.
- **Same id twice in one book.** Possible only if the same person writes the
  same text at the same millisecond twice; the set semantics make it one
  edit. Two *different* entries under one id would need a collision of
  SHA-1 prefixes; not guarded.
- **SQLite on NFS.** Locking is unreliable there; see 6.

## What the gate holds

- `npm test`: worlds `spat` (the rules alone load clean, no `leak`, no
  `undefined_premise`, `book` 4, `lives_in` 4), `spat_store` (the shipped
  books, both engines: `may_read` 17, `may_edit` 72, `no_right` 8, `acts`
  16, `stray` 2, `skipped` 11, `moved` 3, `added` 3, `book` 9,
  `book_source` 8, `lives_in` 9, `private_book` 7, `public_book` 2,
  `private_atom` 10, `misplaced` 0, `private_in_public` 0 …) and
  `spat_trial` (the same store under a trial, `breaks_on` 1). Declared in
  `facts/checks.rofl`. Every entry of the fixture is there to discriminate
  a premise of `access.rofl`: one premise dropped moves this census
  (measured 2026-09-14, every premise of every rule, 149 drops: the 64
  that leave the rule range-restricted are all killed by the census; of
  the 85 that leave it unsafe, 71 move the census and 14 go silently inert
  — a rule with no binder is not refused, it is unfolded on demand and
  derives nothing — and those 14 are caught by the demo's own check that
  no rule of the store is demand-backed). Measured 2026-09-15 over
  `volumes.rofl` the same way, 20 drops: 20 killed — 9 by the file being
  refused (a body dropped to nothing is a fact with a variable), 5 by an
  `alarm` (`misplaced` 8 rows, `private_in_public` 10), 3 by the demo's
  signed check, and 3 — the two positive premises of `misplaced` and
  `private_atom` under the dump rule — rules left unsafe, deriving nothing,
  by the reflection census alone in `npm test` and by the demo's
  demand-backed check (measured: `misplaced` is the one unsafe rule the
  check names when its premise is dropped).
- `npm run test:hosts`: `examples/spat/demo.ts`, 108 scenarios in eleven
  groups run at once against volumes imported from `store.example/` in a
  temp dir — the tag wall at the import and a row planted by hand under
  another ledger (the loader puts it in that book; the nanny does not see
  it), a tag smuggled into `pred` (the loader and `dump` refuse the book
  by `seq`), the rights (including `volume` verbs refused to a non-operator),
  the stranger (by name: `users` and `world` opened; by sender id: `users`;
  both sources or neither: 5), breaks/confirm/retract with the base's row
  count as the proof that the book only grew, `tomorrow` under `SPAT_TZ`
  with the process in UTC, six writers at once, roll into `p_me` and
  `meta.week`, ics, init with `--users`, every injection door with the
  book's row count and last `seq` the same after each refusal, `tomorrow`
  across the week boundary, the volume itself (UPDATE and DELETE refused
  by the trigger with INSERT as the positive control, a rule in an
  imported file refused whole, dump → load → the same sets of terms in
  every book, the marker as the dump's first clause and stripped on the
  way back, a dump of one book refused into another, the signed program
  clean and red on a planted `ru_name`, a swallowed dump naming all eight
  people), the one-command migration of the legacy directory, the
  materialisation check and the reasons table. Exit 1 on any FAIL, so
  the golden's exit code is part of the answer; 66 s on a quiet laptop
  (the host's limit is 120 s per demo).
