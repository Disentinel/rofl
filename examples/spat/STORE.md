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
`e_report(E, Constraint, Day, Time)`, `e_usual`/`e_unusual` (every week),
`e_place(E, Atom, "Name")` with `e_travel(E, Home, Atom, Min)` (a place of
the world). The `edit` column is for a person
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
    clauses(seq INTEGER PRIMARY KEY, book TEXT, head TEXT, body TEXT /* the kernel's AST, terms as termToJson */,
          at TEXT, via TEXT, id TEXT)        -- the household's rules (schema 2); INSERT only the same way
    books(ledger TEXT PRIMARY KEY, user TEXT) -- which books exist and whose they are (init, volume load, maybe)
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

## A date is a fact of the environment

Decided 2026-09-15, after the owner said «сегодня у ребёнка греческий в
16:00» on a Tuesday and the model wrote Monday: the model had computed the
weekday itself. `сегодня`/`today`, `завтра`/`tomorrow`, `послезавтра`,
`15.09` (this year) and `2026-09-15` are accepted wherever the edit grammar
takes a day, and by `show`, and are resolved by the CLI in `SPAT_TZ` (and
`SPAT_NOW` for tests) — never by the person or the model. A dated edit lands
in the DATE's own week (`for_week`), is tried under that week, and `show
<date>` shows the date under its week; a date whose week the world does not
know is code 2 with the Monday it needs (`edits.ts`, `dateToken`, `weekOf`).
Measured in demo group 12: `SPAT_NOW` Tuesday 01.09 + «сегодня» → `tue`,
`w0831`; Sunday 06.09 21:30 + «завтра» → `mon`, `w0907`; `28.09` → 2.

## The schedule as the human sees it

Amendment 2026-09-15: «убери греческий по понедельникам» on the stand was
code 2 «блок greek не известен миру», because `skip`/`move` knew only the
world's `usual` and greek was a one-off `e_add` in a book. Now a name is
resolved over the schedule AS THE HUMAN SEES IT: the typical week, a
recurring line, and what a book added this week (`added`, so only what
acts). `skip <name> [<day>]` on an added block is that entry taken back —
the author writes `retracted(E, …)` into their own book, exactly as
`retract <id>`; another member writes `retracts(E, Iso, Via)` into THEIR
book, and access.rofl honours it by the right that lets them edit the entry
(`may_edit(U, E)`: an adult over a household edit, nobody but the helper over
the helper's) — the entry's book is not theirs to write, and a row without
the right is `retract_without_right[audit]` and never acts. `move <name>
[<day>] <time>` on an added block is the take-back plus the same block
written again under a new id through the ordinary trial (0 or 3). The
answer names what happened: «отозвана e_3a5414ea (chess пн)», «отозвана по
праву семьи e_… (chess ср, правка robin)». A recurring block skipped on one
day is that week's `skipped`; named with no day, the recurrence itself is
taken back («отозвана e_greek (greek вт)»). An unknown name is code 2 with
the blocks that stand that day — the world's and a book's, the latter marked
`[правка e_…]` — and no grammar, so the model need not ask. `rule add`'s
preview counts per extension point («warn[hh]: 7 строк, первые 3: …»), so a
person confirms a volume, not two lines of it. Fixture: alex's `retracts` of robin's
`e_skipclean` (by right: `retracted_edit`, `skipped` 13→12), of the nanny's
`e_nannyadd` (no right: audit, the evening stands) and of `e_nowhere` (audit).

## Every week: a recurring line is one more line of the typical week

`add <what> every <days> <from>-<to> [who] [where]` writes
`e_usual(E, What, Days, From, To, Who, Where)`, `skip <block> every <days>`
writes `e_unusual(E, Block, Days)`; `<days>` is a day, `weekdays`, `alldays`
or a day group the world names (`in_group`). access.rofl derives
`usual/7` from an accepted recurring line — the same three questions `acts`
asks (within the right, not retracted, not waiting), asked as
`acts_recurring` WITHOUT going through `no_right`: `touches` reads `usual`
to name a block's constraints, so `usual :- acts` would close a negative
cycle and the program would be refused (measured: the rounds evaluator
stalls with 22 relations unsettled) — and `skipped/4` from a recurring
skip on whichever week is in force. A retraction takes the line off every
week; `whoami` lists recurring lines apart. Rights are `add`'s (a helper
speaks only for themself). The fixture carries robin's `e_greek` (every
Tuesday), `e_nowalkfri`, `e_noclean` (a skip on `alldays` of a block that
stands on Saturday only — one skipped day, not seven), a retracted and a
proposed recurring line, the nanny's `e_nannyusual` refused by right and
robin's `e_noschoolfri` refused by the school's constraint; every premise of
the new rules moves the census when dropped (measured 2026-09-15, 38
mutants: 37 killed by the census or by the demand-backed check, `busy`'s
bridge only by the demo's `free`).

## The family's book extends the world

«Весь пойнт ROFL — грамматика расширяется на ходу под задачу, и нижележащие
книги не ломают ранее определённого.» Measured on the stand 2026-09-15 (v4):
`rule add 'place(american_academy). ru_name(american_academy, "American
Academy"). travel(home, american_academy, 15).'` was accepted into `hh` — and
`add math every thu 15:00-16:30 kit american_academy` was still «мир такого не
знает»: only the four extension points crossed from the book into main, and
the grammar checked names against the world as loaded. Now a FACT of the
family's book on a relation declared `edb` in spat.rofl is one more line of
the world — MONOTONE: added, never overriding — and the grammar resolves a
place, a person, a block over the world as it stands, `main` and the book
together (`names()` reads the evaluated relations; a quoted place by its
`ru_name` or by its slug).

**The mechanism is generated, the decisions are declared.** spat.rofl §14
says, per edb relation, one line each: `key_of(R, N)` (the first N arguments
identify a fact — 0 for a singleton like `base`/`current`, the arity for a
set like `with`/`ride`), `not_extended(R, Why)`, `extends_unless(R, I, V)`,
`speaks_for(R, I)`, `key_owned(R, G)`. `examples/spat/bridge.ts` turns the
section into `bridge.rofl` — the arity read off the rules' own use of the
relation (and the shipped example for `week/1`, which only the CLI reads) —
loaded with the program and signed `rules`; an edb relation with neither
`key_of` nor `not_extended` stops the generator, and demo group 21 refuses a
stale file. Per relation:

    world_travel(A, B) :- asserted_by($fact(travel, main, $cons(A, $cons(B, _))), _, _).
    travel(A, B, M)    :- travel[hh](A, B, M), not world_travel(A, B).
    overrides[audit](travel, k(A, B)) :- travel[hh](A, B, M), world_travel(A, B), not travel(A, B, M).

`world_R` is what the world book ASSERTED, read off the kernel's own trail —
so a key the world has keeps the world's value, the identical fact is neither
a second row nor a conflict, and a different value is `overrides[audit]` and
ignored: `travel(home, school, 5)` against the world's 20 leaves 20. No cycle:
`world_R` reads a kernel relation, and the audit's negation is over a relation
that depends on base facts only (measured: leak 0, undefined_premise 0,
demand-backed 0 with the bridge loaded; the stratification check of `rule
add` still stands at the door for a family RULE that concludes an edb
relation through a negation).

**What the book does not put into the world**, and why — `withheld[audit](R,
k(...))` for a fact, the reason in `rule add`'s answer:
- `not_extended(_, books)`: `usual`, `usual_on`, `moved`, `skipped`, `added`,
  `absent_on` are the members' books through access.rofl's rights; a family
  fact there would skip the school without the right to.
- `not_extended(_, query)`: `want`, `asking`, `waived` are a verb's switch for
  one call (`place`, `free`, `relax`), not a fact of the household.
- `extends_unless(person, 2, adult|helper)`: an adult or a helper is an
  ACCOUNT. Who may read which book is decided over `world` + `users` before
  any book is opened (2 above), and `person(uncle, adult)` in a family rule
  would make the guest read every book. Children, neighbours, services and
  visitors are the schedule's people and extend; accounts stay the
  operator's (`init`, `volume load --book world`).
- `speaks_for(R, I)`: `driver`, `walks_alone`, `with`, `present_window`,
  `absent`, `awake`, `lift`, `work_needed`, `never_alone`, `hosted` speak for
  a person; the book is an adult's (`rule add`), and an adult speaks for
  adults and children, never for a helper (§3 of access.rofl) — the nanny's
  hours are hers to report.
- `key_owned(constraint, edit_by)`: an edit's id has its constraint from its
  book; `constraint(e_skipwalk, nanny, external)` would give the nanny
  `may_edit` over robin's edit. The guard reads `edit_by`, i.e. the books the
  caller reads: a reader who cannot see the entry sees the row enter, and
  cannot use it either — `retract <id>` needs the entry, `skip` needs the
  block, and every other reader's world withholds it.

**`rule add` says what each fact did**: «в мир семьи: place(american_academy)»,
«travel(home, school, 5) — НЕ ДЕЙСТВУЕТ: мир уже задаёт travel(home, school,
20)», «person(uncle, adult) — книга семьи не заводит: adult — учётная запись»,
«work_needed(nanny, 300) — … за помощника (няня) книга семьи не говорит»,
«person(nico, child) — уже в мире», «needs(x, y) — факт правил семьи, миру не
виден (needs не edb)», «want(…) — миру не передаётся: переключатель одного
вызова»; the four points' preview follows for a rule.

**A place is three of those facts.** `spat place add [<atom>] "<Название>"
[<минут> от дома]` (`место добавить …`) is sugar over `rule add 'place(a).
ru_name(a, "Название"). travel(home, a, M).'`: the atom given or slugged from
the quoted name («American Academy» → `american_academy`; a name that slugs
to nothing asks for the atom — the model transliterates nothing), the name
refused when the world already calls something so (a place, a person, a
block: code 2 naming it; the raw `rule add` is monotone and answers «уже в
мире»). `whoami` lists the author's places apart; `rule retract` of a place is
2 with the list while a block stands there. What the rules do with a place
without travel was measured, not guessed, and the sugar says it at the door:
no minutes → no `tt` → a child's run there is `no_way` («некому везти … дом →
American Academy», a block there is code 3) and an adult's chain into it has
no slack — NOT `on_foot_unknown`, which needs a `leg`, which needs `tt`. With
the minutes the number is in the chain («обед → yoga −5 мин» for 15:00 after
a lunch ending 14:45) and a child is driven — from home only; the owner's
Thursday block is code 3 by `no_way` because school → academy is a number
nobody gave, and `rule add 'travel(school, american_academy, 10).'` is that
number: the same block is then 0. Any pair is one more line.

Fixture (`store.example/hh.rofl`): robin's `r_gym` (place 10→11, ru_name
0→1, travel 11→12, tt 32→35), alex's `r_shortcut` (`travel(home, school, 5)`:
`overrides` 0→1; the identical `travel(home, sadik, 15)` nothing), robin's
`r_people` (a visitor and her own hours and constraint in: person 8→9,
work_needed 0→1, constraint 53→54; uncle adult, aunt helper, the nanny's
hours, an edit's constraint withheld: 4; kit as visitor an override; nico as
the world has him neither). The generated shapes, 32 mutants (whole rule and
each premise of the travel, place, ru_name, person, work_needed and
constraint blocks and their audits): 31 killed by this census; the one
survivor is `world_travel` inside `overrides(travel)`, redundant by
construction for a relation with no other guard (`not travel(...)` already
implies it) and discriminated on `person`, where a withheld fact is not an
override. Demo groups 18 and 21, `examples/spat_places/demo.ts`.

## A hypothesis is a book

«Понедельник или среда», «где-нибудь на следующей неделе» are `whatif` and
`place` — but WRITTEN. `spat maybe '<правка>' [--as-of <day>]` parses the
edit and writes its facts into a book of its own, `[m_<id>]`, registered in
the volume for its author; the loader lists `m_` books apart (`Store.maybes`)
and never gives one to the rules, so `show` is the same world and no rule of
access.rofl reads a hypothesis. `spat maybe compare [<id>…]` builds the world
under each live hypothesis of the caller (not applied, `edit_at` within 24
hours) in a FORK of the store — the book given its author's `authority`,
`trial(M)` and `before(...)` beside it, exactly as `edit` tries a candidate —
and prints two columns (day, what breaks, holes, slack) and, per hypothesis,
the day's problems and the kernel's own `why` down to the axiom in `[m_…]`.
`spat maybe apply <id>` re-tags the facts into the author's own book under a
new edit id through `commit()` — the wall, the trial, code 0/3/4 — and
appends `applied(M, E, Iso)` to the hypothesis, which stays as history.
`spat place <what> <minutes> [who] [where] [--week-of W]` over the store:
the rules' `admissible`/`cand_bad` over `want/4`, the best start of each of
three days tried as a hypothesis, the three best printed with breaks, holes
and slack and the `maybe` line to write one; nothing is kept.

## The day and the week for a phone

The owner got the week in Telegram as a `pre` block — 87 lines of the
terminal grid, columns fifty characters wide, unreadable on a phone. The
terminal stays as it is (the CLI, A4 through html.ts); `--format tg` on
`show`/`tomorrow` (and on the day an `edit` reports as broken, and on
`maybe compare`'s days) renders the same relations for a proportional font
(`tg.ts`, 74 lines): short lines, no padding, no table; the only markup is
`*…*` on the day's name and on each person's name. A day is «*Чт 03.09* —
сходится» or the problems first, one per line, then a blank line and each
person's «• 17:00–18:00 плавание (бассейн)» lines — the place only when the
name does not already say it and never the base, «(с kit, nico)» for who is
with whom, «везёт kit: школа → дом» for a trip, « [правка e_…]» kept for a
book's block. The week is a summary — «*Неделя w0831* (31.08–06.09)» and one
line per day, «Пн — сходится» / «Чт — !! 2 дыры: kit 17:40–18:20, …» — then
«Подробно: show <день>». The two texts for the shipped fixture are held
verbatim in demo group 17 as the golden. Escaping for MarkdownV2 is the
sender's: the shim's egress escapes everything it is handed, `*` included, so
the two bold markers survive only if the shim passes those lines unescaped —
S1e's call, not the renderer's. Russian inflection («с Китом») is not done:
the world carries a name's nominative (`ru_name`) and nothing else.

## The household's own rules, without a release

«Когда я начну вводить новые constraints (нужен ноутбук, согласовать время)
— потребуется новый релиз» — a new KIND of constraint is a rule, and a rule
is data. `spat rule add '<clauses>'` (adult or operator) parses with the
kernel's parser and stores the AST — `clauses(seq, book, head, body, at,
via, id)`, terms as `termToJson`, INSERT only, schema 2; a schema-1 volume
gets the table on open — under an id `r_<hash>`, with the trail and the
status as facts of the book `hh` (`rule_by`, `rule_at`, `rule_via`,
`rule_proposed`, `rule_confirmed`, `rule_retracted`). The loader asserts the
book for every member's call, like the world, signed `hh`.

**The wall.** Every head of the book gets `[hh]` from the loader whatever
the text said: `may_edit[main](nanny, c_pickup) :- …` concludes
`may_edit[hh]`, which nothing reads — `may_edit` in main does not move and
the nanny's edit is still 4. A body reads the world (unbracketed or
`[main]`), the book (`[hh]`) or the author's own book (`[p_<author>]`,
declared `imports(hh, p_<author>)` by the loader per active author); any
other tag is 2 at the door and 6 at the loader. An unbracketed body literal
whose relation the same submission concludes reads `[hh]` — `needs(B,
laptop)` in the laptop rule reads the `needs(work_am, laptop).` written
beside it — except the four extension points, which always mean the whole
picture.

**Four extension points for RULES — and every edb relation for FACTS** (see
«The family's book extends the world» above). `defect[hh](Kind, Block, Day)`
→ `defect`/`breaks` (access.rofl §6), `busy[hh](P, D, S)` → `busy` and
`needs_cover[hh](Ch, D, S)` → `needs_cover` (spat.rofl §12, `imports` both
ways so the flow audit is quiet), `warn[hh](Kind, Text, Day)` → a «!!» line
of `tomorrow`/`show`. `uncovered(kit, mon, 600).` in a family rule is
accepted and inert (`uncovered` is derived, not edb).

**The checks are the kernel's**, on a fork of the week in force, each a code
2 with the diagnostic verbatim: an unstratified program («program rejected:
round N settled nothing while … remained»), a new `leak[audit]` or
`undefined_premise[audit]` row, a rule the engine would only demand-back
(`Evaluation.rules[].safe`), the budget/space wall (`hole` rows,
`space_exhausted`/`budget_exhausted`). A rule that passes answers with what
it derives today at the four points. A rule that came through the bot
(`SPAT_VIA=telegram`) is `rule_proposed` and code 3 until its author
confirms (`spat rule confirm`); `spat rule retract` is the author's or the
operator's; `spat rule list` renders the AST as text, and so does `volume
dump hh` (a dump with rules is not loadable by `volume load`, which refuses
a rule in a text book — `rule add` is the way in).

The fixture `store.example/hh.rofl` holds four rules for the golden worlds
(not read by the tool): the laptop rule with `acme` at the office —
`defect` 5→6, and in `spat_trial` one more reason `e_schoolmv` breaks
Thursday (`breaks` 1→2) — a confirmed `warn` from the bot, a `needs_cover`
row for the Friday guest (468→469), a `busy` row the census cannot see
(gated) and the forged `may_edit[hh]`.

## Two defects of v4, from the stand, and a line of 194

- `skip <added block> every <day>` was code 0 «отменён каждую неделю» with no
  effect: `block()` accepted a book's one-off, `e_unusual` was written, and
  the recurring skip found no `usual` to act on. A one-off of this week is on
  no other week, so it is code 2 naming the entry and the take-back («chess —
  разовая правка этой недели (пн [правка e_…]) … отзыв: skip chess <день>»);
  a recurring line and a world block are as before (demo group 19).
- `rule add` with a body reading the author's OWN book (`e_skip[p_robin]`) was
  refused as `leak[audit]` for an author with no rule in force: the loader
  declares `imports(hh, p_<author>)` per author of an ACTIVE rule, and the
  trial fork had none for a first rule. The trial now declares it for the
  candidate's author; a body reading another member's book is still 2 at the
  door (demo group 20).
- The owner's «!! не покрыт …» in Telegram was one line of 194 characters. The
  hole is its own line and who was where the next, indented «  — alex: c_acme
  (внешнее); няня: не в эти часы; …», and `tg.ts` folds every line at 120 —
  after a «;» where there is one, at a space otherwise, never inside a name
  (a 130-character name stays whole on its line). Group 17's golden text moved
  from 20 lines to 22 for that reason and no other.

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
- **`DD.MM` is this year.** `02.01` typed on 30 December means the January
  that has passed; write `2027-01-02`.
- **Travel between two places is a line, not a verb.** `place add` takes the
  minutes from home only; any other pair is `rule add 'travel(gym, pool, M).'`
  — the book extends the world — and a pair nobody wrote is the lint's
  silence («НЕТ ВРЕМЕНИ В ПУТИ»).
- **A person of the family's book is a person of the schedule, never an
  account.** `extends_unless(person, 2, adult|helper)`: read rights are decided
  over world + users before any book is opened, and a rule that could make a
  guest read every book is not the household's to write. A new adult or
  helper is the operator's `volume load --book world` and a users line.
- **`key_owned` reads the caller's books.** `constraint(e_…, …)` is withheld
  where the entry is visible; a reader without that book sees the row and
  can do nothing with it (see above). A reader-independent guard would need
  the loader to name every entry id; not done.
- **A rule that reads another member's book.** `imports(hh, p_<author>)` is
  the author's own book only; a rule over everyone's edits reads `main`,
  where `acts`, `edit_by`, `moved`, `added` already are.
- **Loading a dump of `hh`.** `volume dump hh` renders the rules; `volume
  load` refuses a rule in a text book, so a book of rules moves by `rule
  add` of each rule's text.
- **`busy[hh]` in the census.** Behind `deep(slots)` like every busy row;
  only the demo's `free` sees the bridge.
- **A helper does not see an adult's added block.** `may_read` closes the
  adults' books to a helper, so `skip <that block>` from the helper is
  code 2 with the blocks of the day as the helper sees them — not 4; the
  block is not in the schedule the call was given.
- **`skip <added block>` with no day** takes back every entry of that name
  this week; **`move`** with no day re-adds each under its own id.

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
- `npm run test:hosts`: `examples/spat_places/demo.ts`, 39 scenarios in four
  groups (18–21: places, the one-off «every», the author's own book at the
  door, the book extending the world) in 50–75 s; `examples/spat_edits/demo.ts` (groups 12–17); and
  `examples/spat/demo.ts`, 108 scenarios in eleven
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
