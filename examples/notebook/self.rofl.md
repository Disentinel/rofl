---
world: notebook-self
books: main
default: main
model: js
code:
  - ../../notebook/kernel.ts
  - ../../notebook/world.ts
  - ../../notebook/book.ts
  - ../../notebook/front.ts
  - ../../notebook/cli.ts
  - ../../notebook/model.ts
  - ../../notebook/reader.ts
  - ../../notebook/serve.ts
  - ../../notebook/draw.ts
  - ../../playground/host.ts
  - ../../vscode/extension.ts
  - ../../vscode/worker.ts
  - ../../vscode/serial.ts
  - ../../vscode/render.ts
---

# The notebook, checked by a notebook

> The notebook's own acceptance, written the way a notebook is meant to be
> used: general invariants first, in plain language, each refined step by step
> into lines the JS model can answer over the notebook's own source. Where the
> model cannot say it, this file says so and names the behavioural check that
> stands for it (`scripts/nb_check.ts`, `npm run test:nb`).
>
> The code: the kernel (`notebook/kernel.ts`, `world.ts`, `book.ts`,
> `front.ts`), the page's host it runs on (`playground/host.ts`), and the
> command line (`notebook/cli.ts`). The engine under `src/` and the reader
> under `scripts/` are not scanned: a call into them is out of sight, and the
> invariants below say so rather than count it as clean.

## I1 · Nothing vanishes

```natural
I1 Nothing vanishes: every cell and every directive line yields an answer, a verdict, or a named error.
```

> Not expressible over the code with this model: "every path through the
> loop that answers a cell's lines pushes a line or an error" is a question
> about all paths of a loop body, and the model answers what a node may be,
> not what every path does. The behavioural checks stand for it:
> `I1 every directive line of review is answered` (as many answers in the
> JSON as there are directive lines), `I1 an untranslated natural cell is
> named, not dropped`, and the refused code below.
>
> Found while writing this file, by this invariant: `Host.run` asserted the
> scanned code with `f.assert(...)` and dropped its result. One string in
> `notebook/kernel.ts` held a control character, the host quoted it with
> JSON's `\u0000`, which ROFL does not read, the whole batch was refused, and
> every question was answered over no code at all, with every never green.
> Now a refused batch is the run's error, and the quoting is the scanner's.

## I2 · A gate can say no

```natural
I2 A gate can say no: a failing never is red / exit 1; an unread cell is exit 2; the two are distinct.
```

> Behavioural: `I2 a failing never is exit 1 and names its row`,
> `I2 an unread cell is exit 2 and named`, `I2 a failing never over code is
> exit 1`. Over the code the one thing to say is that the command line has
> three exits and maps each status to its own, which is a table and not a
> question for a model.
>
> A GATE RUN BY THE CODE IT CHECKS TRUSTS ONLY A VERDICT THE CODE COULD NOT
> HAVE FORGED BY EXITING EARLY. Found at acceptance: `new Function("return
> process")().exit(0)` as the first line of `Kernel.run` made this file print
> nothing and exit 0. So green is exit 0 AND the last line
> says `none fails` (in `--json`, a `status` field), and
> `npm run test:nb` reads the verdict of every run, never its exit code
> alone: `I2 a kernel that exits early is not green`.

## I3 · Silence is not green

```natural
I3 Silence is not green: when the model could not see something (unresolved calls, budget ran out, a relation nothing can populate) an invariant holds only "as far as it sees", never plain green.
```

> Behavioural, and this file is the demonstration: the I6 invariants below
> hold only as far as they see, because the engine under `src/` is not
> scanned and the model cannot attribute some calls, and each prints
> `holds as far as it sees · N out of sight` with what it could not follow.
> A relation nothing can populate is a failure with its reason, not a hold
> (`FAILS · 0 · nothing in the model can put a row here`).
>
> DECIDED BY THE TOP LEVEL (2026-09-28): a never that holds only as far as
> it sees makes the run exit 3, apart from 0, 1 and 2. So this file exits 3
> while `src/` is out of sight, and `npm run test:nb` asserts exactly that and
> that every row out of sight is of a kind named in I6 step 4, so a new blind
> spot changes the gate.

## I4 · The file is the truth

```natural
I4 The file is the truth: the notebook is the Markdown file; outputs are derived and never written into it; CLI and editor give the same answers because they call one kernel.
```

> Step 1. The kernel writes nothing (I6 below), so only the command line
> could write into the notebook. It writes a file in exactly one function,
> the translator, and nowhere a run passes through; the kept kernel
> (`notebook/serve.ts`) writes two more beside its socket, its pid and its
> log, neither of them a notebook. The editor's Pin layout, a click on a
> picture, and a notation's Open, write a file beside the notebook (a layout,
> a GEDCOM file), never the notebook.

```rofl
A call C writes a file either:
1. if C is a host site of `node` from "node:fs" at "writeFileSync";
2. if C is a host site of `node` from "node:fs" at "openSync", unless C opens only to read.

A call C opens only to read if C passes the argument a node X at 1 and X may be the literal "r".

A function F may write a file either:
1. if F answers to "translate";
2. if F answers to "writePid";
3. if F answers to "logOf";
4. if F answers to "besideNotebook".

A call C writes outside translation if C writes a file, a function F is the nearest function of C, and unless F may write a file.

never C writes outside translation
```

> What stays behavioural: that the file's bytes are the same after a run
> (`I4 a run writes nothing into the file`). "CLI and editor give the same
> answers" cannot be checked before there is an editor; what stands for it
> now is that the command line prints `Kernel.run`'s result and computes no
> verdict of its own: its exit is a lookup of the kernel's `status`.

## I5 · The LLM proposes, the book decides

```natural
I5 The LLM proposes, the book decides: a translation enters the file only after it ran against the kernel; the natural text is never removed; `run` never calls a model.
```

> Step 1. A model is called by starting a process; only the function that
> starts the harness (`notebook/model.ts`) may start one, the one that runs git to list and search the files the model may read (`notebook/reader.ts`), and the one that starts the kept kernel
> (`notebook/serve.ts`), whose command is node itself.

```rofl
A call C starts a process if C is a host site of `node` from "node:child_process" at some key.

A function F may start a process either:
1. if F answers to "runHarness";
2. if F answers to "viaDaemon";
3. if F answers to "runGit".

A call C starts a process outside the model call if C starts a process, a function F is the nearest function of C, and unless F may start a process.

never C starts a process outside the model call
```

> Step 2. The editor's host runs the kernel in a worker, which hands the
> model call to the translator only on the translate command's path: in the
> extension's files `llm` is passed to a call only inside a function that
> answers to "translate". The question beside it is the control: the name is
> there to be seen. A `llm` stored in a variable and passed on under
> another name would escape this; the call graph does not follow a value
> across this tree's directories yet.

```rofl
`editor_file` lists:

| file |
|---|
| "vscode/extension.ts" |
| "vscode/worker.ts" |

A call C is in translation if a function F is the nearest function of C and F answers to "translate".

A call C hands the model over outside translation if C passes the argument a node X at some index, X is named "llm", C is in file F, `editor_file`(F), and unless C is in translation.

never C hands the model over outside translation
? X is named "llm"
```

> Behavioural for the rest: `I5 a run never calls a model` (a run with the
> model command pointed at a spy leaves no trace),
> `I5 a translation that reads is inserted under its natural cell, which
> stays`, `I5 a translation that does not read after a retry is not written`,
> `I5 no model to call is exit 2 and said plainly`. That the only caller of
> `llm` is the translate branch is a question about where a value flows,
> and it stays behavioural: when this was written the model's call graph did
> not cross this tree's directories (`f_a_call_across_directories_is_not_resolved`);
> since notebook-xdir it does, and the refinement is still to be written.

## I6 · The kernel does no I/O and never exits

```natural
I6 The kernel does no I/O and never exits: reading files, calling models, printing and exiting live in hosts (CLI, extension).
```

> Step 1, by the translator (`npm run nb -- translate`, Claude Sonnet),
> kept as it wrote it except that its `never` and `unsure` are asked as
> questions here. It reads, and its never HELD, and it checks nothing: it
> names the files the way the front matter writes them (`../../notebook/...`)
> while the book names them from the deepest shared directory
> (`notebook/...`), so no call is ever in one of them; and it asks about
> globals (`console`, `process`) only, so a `node:fs` import would pass. A
> vacuous hold that looks green is the failure I3 is about, produced by the
> first step of the refinement. The translator is now told the files' names.

```rofl
the kernel calls a global Name from File either:
1. if a call C is a call site in File, File is "../../notebook/kernel.ts" and C calls the global Name;
2. if a call C is a call site in File, File is "../../notebook/world.ts" and C calls the global Name;
3. if a call C is a call site in File, File is "../../notebook/book.ts" and C calls the global Name;
4. if a call C is a call site in File, File is "../../notebook/front.ts" and C calls the global Name.

the kernel reaches Spec from File either:
1. if a call C is a call site in File, File is "../../notebook/kernel.ts", C reaches the surface a surface Spec and Spec has no origin;
2. if a call C is a call site in File, File is "../../notebook/world.ts", C reaches the surface a surface Spec and Spec has no origin;
3. if a call C is a call site in File, File is "../../notebook/book.ts", C reaches the surface a surface Spec and Spec has no origin;
4. if a call C is a call site in File, File is "../../notebook/front.ts", C reaches the surface a surface Spec and Spec has no origin.

? the kernel calls a global Name from File
? the kernel reaches Spec from File
```

> Step 2. What "the kernel" is, as data: the four notebook modules, the
> page's host they run on, and the editor's two pure modules (the cells of a
> file and back, a result as Markdown). What "I/O" is: a call the JS model gives the host
> effect `io`, whether by a global (`console`, `process`), a module
> (`node:fs`, `node:child_process`) or a member of one. Every call site in
> those files, reachable or not: stricter than "what a run reaches". It had
> to be when written, because the model did not follow a call from one of
> this tree's directories into another (`f_a_call_across_directories_is_not_resolved`,
> repaired by notebook-xdir); it is kept because it is the stronger claim.
> What it cannot see is every module the kernel imports and nobody scanned:
> the engine, the reader, the scanner, the proof folder.

```rofl
`kernel_file` lists:

| file |
|---|
| "notebook/kernel.ts" |
| "notebook/world.ts" |
| "notebook/book.ts" |
| "notebook/front.ts" |
| "playground/host.ts" |
| "vscode/serial.ts" |
| "vscode/render.ts" |

A call C does io in the kernel if C has the host effect `io` by some route, C is in file F, and `kernel_file`(F).

A node I is out of the kernel's sight at S if I is a dangling import of S, I is in file F, and `kernel_file`(F).

never C does io in the kernel
unsure I is out of the kernel's sight at S
```

> Step 3. Exiting is I/O by the rule above (`process` is an `io` global), and
> it is said once more by name, because a host that exits is the one thing
> an editor cannot survive. A control, in the same words: the command line
> exits, so the same sentence over its file must answer.

```rofl
A call C exits in the kernel if C is a host site of some host from "process" at "exit", C is in file F, and `kernel_file`(F).

A call C exits in the command line if C is a host site of some host from "process" at "exit" and C is in file "notebook/cli.ts".

never C exits in the kernel
unsure I is out of the kernel's sight at S
? C exits in the command line
```

> Step 4. Steps 2 and 3 were green over two planted lines that do I/O, a
> dynamic `import("node:fs")` and `globalThis["process"].stdout.write`: the
> first is no static import, the second a computed member on a global, and
> the model gives neither the effect `io`. What it does give is its own
> frontier, a call it could not attribute (`C has no surface`). All of those
> in the kernel's files are about two hundred: `text.split()` on a parameter
> the model has no type for. So the frontier here is narrowed by what could
> be I/O at all: a call the model could not attribute and could not resolve,
> whose key is the key of some member the host tables give the effect `io`
> (`write`, `readFileSync`, `get`), or with no key at all; and any dynamic
> import. The known rows are Map and engine calls named like I/O
> (`kid.get()`, `f.assert()`, `this.core.fork()`); `npm run test:nb` pins
> their keys, and a new key or a dynamic import changes the gate. Written in
> Datalog: the sentence form has no words for "a member with the effect io
> at some key" that read back unambiguously, and a head over two model
> relations read as one of them.

```datalog
io_key(K) :- member_effect[code](_, K, io).
imported_callee(C) :- callee_of[code](C, N), ident_in[code](N, Local, File), imports_name[code](Local, _, _, File).
member_call(C) :- callee_of[code](C, N), ast_child[code](N, object, 0, _).
unseen(C, K) :- ast_node[code](C, _, F, _), kernel_file(F), eff_call_unattributed[flow](C), not resolves[code](C, _), callee_of[code](C, N), selects[flow](N, K), io_key(K).
unseen(C, "()") :- ast_node[code](C, _, F, _), kernel_file(F), eff_call_unattributed[flow](C), not resolves[code](C, _), not imported_callee(C), not member_call(C).
unseen(I, "import()") :- ast_node[code](I, import_expression, F, _), kernel_file(F).
phrase(unseen, "<0:node> is out of the kernel's sight, a call of <1:key>").
kernel_io(C) :- host_call_effect[audit](C, io, _), ast_node[code](C, _, F, _), kernel_file(F).

never kernel_io(C)
unsure unseen(C, K)
```

> Behavioural, for the planted defects: `npm run test:nb` runs this file over
> copies of the kernel with one line added: a print, a `node:fs` import and
> read, an exit (each exit 1, named), a dynamic import of `node:fs` and a
> computed `globalThis["process"]` write (each named among the rows out of
> sight, which the boundary check then refuses).

## I7 · A cell cannot rewrite the model

```natural
I7 A cell cannot rewrite the model.
```

> Step 1, by the translator, kept with its `never` asked as a question: it
> read "rewrite the model" as "the kernel's code assigns to something", which
> is about the kernel's variables and not about a cell, and it answers 200
> times. Wrong subject, and the book says so at once.

```rofl
the kernel writes to a node L in File either:
1. if an assignment X writes to a node L, X is in file File and File is "../../notebook/kernel.ts";
2. if an assignment X writes to a node L, X is in file File and File is "../../notebook/world.ts";
3. if an assignment X writes to a node L, X is in file File and File is "../../notebook/book.ts";
4. if an assignment X writes to a node L, X is in file File and File is "../../notebook/front.ts".

? the kernel writes to a node L in File
```

> AS STATED IT DID NOT HOLD: a well-formed cell that concludes a model
> relation loads and extends the model, and the page teaches that on
> purpose (`A call C resolves to a function F if C emits E and F handles E.`
> makes the call graph follow an event bus).
>
> RESTATED BY THE TOP LEVEL (2026-09-28): a cell cannot rewrite the model BY
> ACCIDENT. A conclusion into a model relation with a variable the body never
> binds is refused; a deliberate extension with every variable bound is
> allowed, and the output says `extends the model's <relation>`.
>
> THAT WAS NOT ENOUGH, and a user paid for it: auditing another codebase,
> `A tool entry O is named T if ...` meant a new sentence and landed in the
> model's own `ast_name` ("O is named T"), every variable bound, so it was
> allowed as a deliberate extension and `? O is named T` answered 12366
> plausible rows, every named node of forty files. A deliberate extension and
> an accidental one look the same to the reader; only the writer knows. So
> now the writer says it: a rule whose conclusion lands in a relation the
> model already has is refused, naming the model's sentence and the
> relation, unless its cell carries the line `extends <relation>`. The page's
> event-bus cell carries `extends resolves`.
>
> Not expressible over the code with this model: it is a property of every
> path by which a cell's text reaches `load`. Behavioural:
> `I7 a cell concluding a model sentence with a loose variable is refused,
> exit 2`, `I7 a bound conclusion into a model relation, marked extends, is
> allowed and labelled` and `I7 the same conclusion without the marker is
> refused, naming the sentence it collided with`. Facts a cell writes into
> a model relation (the ledger notebook injects two `blocks` rows on purpose)
> are not covered: a ground fact names its relation outright.

## I8 · Every answer points at its evidence

```natural
I8 Every answer points at its evidence: a code node carries file:line; `why` gives a proof.
```

> Behavioural: `small: exit 0, an answer at its file:line` reads
> `[load() at small.js:7] is unawaited`, and `review: exit 0 and its answers`
> has the `why` tree down to the facts. Over the code it would be "every
> node id in a printed sentence was replaced by its label and place", a
> question about the strings a regular expression produces, which the model
> does not follow.
