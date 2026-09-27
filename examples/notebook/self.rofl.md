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
  - ../../playground/host.ts
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

## I3 · Silence is not green

```natural
I3 Silence is not green: when the model could not see something (unresolved calls, budget ran out, a relation nothing can populate) an invariant holds only "as far as it sees", never plain green.
```

> Behavioural, and this file is the demonstration: the I6 invariant below
> holds only as far as it sees, because the engine under `src/` is not
> scanned, and it prints `holds as far as it sees · N out of sight` with the
> modules it could not follow. A relation nothing can populate is a failure,
> not a hold (`nothing in the model can put a row here`).
>
> WHERE IT IS WEAKER THAN STATED: the distinction lives in the output and in
> the JSON (`verdict: blind`), not in the exit code. A never that holds as far
> as it sees exits 0 like one that holds. Giving it its own exit would make
> this very gate red for as long as `src/` is out of sight, which is the
> question for the owner, not one to settle here.

## I4 · The file is the truth

```natural
I4 The file is the truth: the notebook is the Markdown file; outputs are derived and never written into it; CLI and editor give the same answers because they call one kernel.
```

> Step 1. The kernel writes nothing (I6 below), so only the command line
> could write into the notebook. It writes a file in exactly one function,
> the translator, and nowhere a run passes through.

```rofl
A call C writes a file if C is a host site of `node` from "node:fs" at "writeFileSync".

A call C writes outside translation if C writes a file, a function F is the nearest function of C, and unless F answers to "translate".

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
> calls Claude may start one.

```rofl
A call C starts a process if C is a host site of `node` from "node:child_process" at some key.

A call C starts a process outside the model call if C starts a process, a function F is the nearest function of C, and unless F answers to "claude".

never C starts a process outside the model call
```

> Behavioural for the rest: `I5 a run never calls a model` (a run with the
> model command pointed at a spy leaves no trace),
> `I5 a translation that reads is inserted under its natural cell, which
> stays`, `I5 a translation that does not read after a retry is not written`,
> `I5 no model to call is exit 2 and said plainly`. That the only caller of
> `claude` is the translate branch is a question about where a value flows,
> and the model's call graph does not cross this tree's directories yet (see
> the ledger: `f_a_call_across_directories_is_not_resolved`).

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

> Step 2. What "the kernel" is, as data: the four notebook modules and the
> page's host they run on. What "I/O" is: a call the JS model gives the host
> effect `io`, whether by a global (`console`, `process`), a module
> (`node:fs`, `node:child_process`) or a member of one. Every call site in
> those files, reachable or not: stricter than "what a run reaches", and it
> has to be, because the model does not yet follow a call from one of this
> tree's directories into another (`f_a_call_across_directories_is_not_resolved`).
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

> Behavioural, for the planted defects: `I6 a print planted in the kernel
> turns self red` and `I6 an exit planted in the kernel turns self red` run
> this file over a copy of the kernel with one line added and expect exit 1.

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

> THIS INVARIANT IS FALSE AS STATED, and the file says so rather than
> narrowing it quietly. What the host refuses (`Host.run`, the `loose`
> branch) is narrower: a cell whose conclusion the reader took for one of the
> model's own sentences with a word of it standing as a variable nothing
> binds. A well-formed cell that concludes a model relation is loaded and
> extends the model, and the page teaches this on purpose: its second
> example adds `A call C resolves to a function F if C emits E and F handles
> E.` so the call graph follows an event bus. So "cannot rewrite" holds for a
> malformed conclusion and not for a deliberate one. Which one the owner
> means is open (`f_a_cell_can_extend_the_model_and_the_page_teaches_it`).
>
> Behavioural: `I7 a cell concluding a model sentence with a loose variable
> is refused, exit 2`, and `I7 as stated does not hold: a bound conclusion
> extends a model relation`, which passes today and would go red the day
> the invariant is made true.

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
