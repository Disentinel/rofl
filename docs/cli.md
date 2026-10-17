# The `rofl` binary

One native binary, `rust/target/release/rofl` (built by `cargo build --release` in
`rust/`, shipped with every release). A world is the files named after the
flags, `boot.rofl` first.

```sh
rofl ask    'reaches(a, X)'      boot.rofl world.rofl    # the rows, one per line
rofl why    'reaches(a, c)'      boot.rofl world.rofl    # what proves it
rofl why --all 'total(a, 7)'     boot.rofl world.rofl    # every member of every cell
rofl whynot 'reaches(c, a)'      boot.rofl world.rofl    # what stops it; --depth N --nodes N bound the walk
rofl excise 'calls(a, b)'        boot.rofl world.rofl    # what taking the base fact out changes: - gone, + new
rofl load                        boot.rofl world.rofl    # the whole state
rofl serve                                               # one JSON request a line, one answer a line
rofl render --out DIR            world.rofl ...          # the sentence form
rofl render --out DIR            world.rofl.md           # back into rules: DIR/world.rofl, DIR/world.phrases.rofl, the report on stdout
rofl nb [--cell N] [--all]       notebook.rofl.md        # run a notebook, printed as `npm run nb` prints it
```

A question verb is `rofl load` with that one question, so every flag of
`rofl load` applies to it (`--ticks`, `--budget`, `--space`, `--strata`,
`--retract`, `--below`). `rofl load --ask L --why L --whynot L --excise F`
asks several in one run, the answers in that order with an empty line after
each.

**The text is the reference's.** `why`, `whynot` and `excise` print what
`src/api.ts` prints; `ask` prints what the REPL's `?` prints with the
sentences off: `V = x, W = y` a row, sorted, `(empty)` for none, `? row  line`
a shrug, and `[partial: ...]` when the rows may be short of an answer.
`npm run whycheck` holds every one of them to the TypeScript engine byte for
byte over every world `npm test` loads, refusals included.

**`--json`** prints each answer as one line in the shape `rofl serve` answers:
`{"ok":true,"vars","rows","keys","shrugs","partial"}` for an ask,
`{"ok":true,"text"}` for a why, `{"ok":true,"holds","text"}` for a whynot,
`{"ok":true,"removed","added"}` for an excise, `{"ok":false,"error"}` for a
refused question. With no question it prints `{"ok":true,"state","partial"}`.
A run that ends before answering prints `{"ok":false,"error","exit"}`.

**A `.rofl.md` file** is a world written as executable Markdown: wherever a file is named, the
binary reads it into rules natively, after the worlds its `reads:` names, as `scripts/read.ts` does
(`npm run mdcheck` holds the two to the byte). Its vocabulary comes from the tree: the nearest directory
above the file holding `boot.rofl` and `facts/phrases.rofl`, else the one above the binary. A plain `.md`
is a document and is refused (exit 2).

**`rofl nb`** runs a notebook the way `npm run nb -- FILE` does and prints the same text and exit code
(0 ok, 1 a never fails, 2 not everything was read, 3 blind or cut), with `--cell N` and `--all`. `draw`, a
notebook over code (`code:`, `model: js`) and `--json` are not native yet: it says so on stderr and exits 2.
`npm run nbcheck` holds it to the TypeScript kernel byte for byte over every notebook in its slice.

**`@LIST`** stands for the files LIST names, one a line, each read from LIST's
directory. `@rules/js.files` is the JS model, the files the notebook host
loads (`notebook/front.ts` `MODEL_FILES`; `npm test` fails when the two differ).

## Exit codes

| code | meaning |
|---|---|
| 0 | answered, whole |
| 1 | the call is wrong: a flag, a value, a file that cannot be read |
| 2 | a file is refused: it does not parse or does not load |
| 3 | the world is refused when evaluated: a broken promise, a negation through a cycle |
| 4 | a question is refused: not ground for a why, not a base fact for an excise, outside the cone |
| 5 | answered from a world the budget or the space cut short, or an ask whose rows may be short |
| 70 | a defect: the engine failed (a panic, or an evaluation that says `defect:`) |

A refusal wins over a partial answer: a run with a refused question exits 4.
A state dump of a cut world exits 0; its holes are in the dump.

## JS code, through the Rust engine

Two commands, a directory of JS or TS in, an answer out:

```sh
npm run scan -- path/to/src --out code.rofl
rofl why 'flows[code]("api/server.js", "api/users.js")' @rules/js.files code.rofl
```

| stage | runs on | reads | writes |
|---|---|---|---|
| `npm run scan` | node: `scanners/cli.ts` | every `.js .ts .tsx .mjs .cjs .jsx .mts .cts` under the directory, `node_modules`, dot directories, `.d.ts` and `.min.js` left out | `code.rofl` |
| the scanner | `scanners/js_ast.ts` (Babel) | one file's text, named by its path from the directory | `ast_node[code](Id, Kind, File, Line)`, `ast_child[code](Parent, Field, Index, Child)`, `ast_attr[code](Id, Key, Value)`, `ast_file[code](Root, File)`, `ast_parse_error[code](File, Message)`; the contract is the header of `scanners/js_ast.ts` |
| the host facts | `playground/host.ts` `codeFacts` | the paths, and every string a file holds | `fs_dir`, `fs_file`, `fs_parent`, `fs_dir_of`, `fs_dir_in`, `fs_file_in` (the files and directories, `"."` the root) and `str_segs`, `str_seg`, `str_char0`, `str_scheme` (each string cut the way a module specifier is read), all `[code]` |
| the model | `rofl`, Rust | `@rules/js.files` and `code.rofl` | the model's relations: `calls`, `flows`, `effect_of`, ... (`docs/js/` renders each file of it in sentences) |

`npm run scan` prints the facts to stdout without `--out`, names every file no
parser read on stderr and then exits 2. The facts are the ones the notebook
host gives a `.rofl.md` with `model: js` (`npm run nb`), so a question has the
same answer in a notebook and here.

Measured on `examples/services/src` (3 files, 1051 facts), five questions, two
whys, a whynot and two asks: every answer the same text as the TypeScript
engine's. The TypeScript engine took 12.4 s for the world and the five; the
Rust release build 1.5 s for the world and the five in one `rofl load` run,
and as much for each `rofl why` run alone, since each builds the world.

## A world that asks for its own input

A world can ask for facts it does not have yet. It names a scanner for a kind
of input and asks for paths; each evaluation runs every new request at once,
loads what the scanner prints, and evaluates again, until nothing new is asked.

```
scanner(js, "node --experimental-strip-types scanners/cli.ts examples/scan/src").
scan_request(js, "main.js").
scan_request(js, F) :- depends[code](_, F).
```

`rofl load @rules/js.files examples/checks/scan-world.rofl` scans `main.js`,
then `lib/greet.js` that it imports, then `lib/shout.js`, and never
`lib/unused.js`. A scanner is any command: the path is its last argument and
what it prints is loaded as ROFL, rules as well as facts. Each request runs
once and leaves `scan_done(Kind, Path, Clauses)`, or
`scan_failed(Kind, Path, Message)` when there is no scanner for the kind or the
command fails. It works wherever the world is evaluated: `rofl load`, the
question verbs and `rofl serve`.

**A scan is kept.** A scanner that names what it read, a `-- reads: PATH` line
for each file and directory (`scanners/cli.ts` names the file it parsed and
every directory it listed), has its output kept under
`$XDG_CACHE_HOME/rofl/scans` (else `~/.cache/rofl/scans`), each read stamped:
a file by its bytes, a directory by the names in it. The next run takes the
same command for the same path from there while every stamp holds, and runs
the scanner again when one does not. The world cannot tell the two apart. On
`examples/checks/scan-world.rofl` the second run is 2.4 -> 1.7 s, the rest
being the model's evaluation.

**Between two rounds the world goes cold.** While the scanners of a round run,
the evaluated world is kept as a volume in the temporary directory and mapped
back: what the rounds before brought in lies in the file, not on the heap, and
the heap it held is given back. The state is the same fact for fact. Measured
on a walk over this repository's `src/` from `repl.ts` (18 files, 4 rounds,
fast build): 75 -> 78 s, and the heap held between rounds falls from 0.6-0.8 GB
to about 0.15 GB. The peak, 2.9 GB, is not lowered: it is the round that adds
14 files at once. Adding them one a round lowers it to 1.4 GB, the largest file
alone, but each small file added to that world costs about 15 s
(`f_a_walk_goes_cold_between_rounds`).
