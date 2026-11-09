# Asking about your code from the command line

[WHAT.md](WHAT.md) asked its question in a notebook, in sentences. The same
question can be asked from a shell, by you or by an agent, with the `rofl`
command: one question in, one answer out, `--json` when a program is
reading. The facts are the same, so the answer is the same. What changes is
the language: the command line speaks Datalog, the notebook's sentences with
the words taken out. `rofl-nb vocab` lists both forms side by side, the
Datalog name in parentheses after each sentence:

<!-- BEGIN run examples/start: rofl-nb vocab throw | head -4 -->
```
$ rofl-nb vocab throw | head -4
controlflow: a call is an exit
  a function F always throws   (always_throws)
  a call C is a throwing call   (throwing_call)
  a function F throws at the top   (top_throw)
```
<!-- END run -->

`a function F may throw` is `may_throw(F)`. The shop of WHAT.md,
`guide/examples/first`, serves here too.

## A world file

The command line reads a world: a file of facts and rules. This one names the
code to scan and defines the question:

<!-- BEGIN file guide/examples/first/shop.rofl -->
```rofl
-- The shop, for the command line. The scanner reads checkout.js and every file it imports.
scanner(js, "rofl scan .").
scan_request(js, "checkout.js").
scan_request(js, F) :- depends[code](_, F).

-- an exported function that may throw at its caller
risky(N) :- fn_name[code](F, N), exported_fn[code](F), may_throw[code](F).
```
<!-- END file -->

It begins with where the facts come from. `scanner` names the
command that turns a JavaScript file into facts, `rofl scan`, run in this
directory. `scan_request` asks for `checkout.js`, and then for every file a
scanned file depends on, so `pay.js` is scanned because `checkout.js` imports
it, and a file nothing imports is never read. The last line is the rule from
WHAT.md in Datalog: `[code]` after a name says which *book* the facts are in,
the one the JavaScript model writes to.

## Ask

<!-- BEGIN run guide/examples/first: rofl ask 'risky(N)' @rules/js.files shop.rofl -->
```
$ rofl ask 'risky(N)' @rules/js.files shop.rofl
N = "charge"
N = "checkout"
```
<!-- END run -->

One row a line, the variable and its value. `@rules/js.files` is the
JavaScript model, the twenty-odd rule files that say what `may_throw` means;
the `rofl` command finds them in its own package, so the line works from any
directory. The world is the model plus `shop.rofl`, and `shop.rofl` fetches
the code.

For a program, `--json` prints the same answer as one object a line:

<!-- BEGIN run guide/examples/first: rofl ask 'risky(N)' --json @rules/js.files shop.rofl -->
```
$ rofl ask 'risky(N)' --json @rules/js.files shop.rofl
{"keys":["risky[main](\"checkout\")","risky[main](\"charge\")"],"ok":true,"partial":false,"rows":[["\"checkout\""],["\"charge\""]],"shrugs":[],"vars":["N"]}
```
<!-- END run -->

`partial` is `false`: every row that follows from the facts is there. It is
`true`, and the exit code 5, when the evaluation was cut short by a budget or
by the memory the process may use, or a scan failed; then the rows may be
short of an answer, and the output says so rather than passing a short list
off as the whole one.

## Why

<!-- BEGIN run guide/examples/first: rofl why 'risky("checkout")' @rules/js.files shop.rofl | head -23 -->
```
$ rofl why 'risky("checkout")' @rules/js.files shop.rofl | head -23
risky[main]("checkout")  <= re667b5bf @tick 0
  fn_name[code](n017f49dbfbe9e0a8_en4a19n90pa5f,"checkout")  <= rb448fa01 @tick 0
    fn_node[code](n017f49dbfbe9e0a8_en4a19n90pa5f)  <= r631ec945 @tick 0
      body[value](n017f49dbfbe9e0a8_en4a19n90pa5f,n017f49dbfbe9e0a8_einjg9erj696f)  <= rc5fd0cdb @tick 0
        ox_fn_node[main](n017f49dbfbe9e0a8_en4a19n90pa5f,n017f49dbfbe9e0a8_en4a19n90pa5f)  <= r6e736128 @tick 0
          oxc_k[ast_oxc](n017f49dbfbe9e0a8_en4a19n90pa5f,function)  <= r30763fea @tick 0
            node[ast_oxc](n017f49dbfbe9e0a8_en4a19n90pa5f,function,"checkout.js") [axiom]
          not ox_wrapped_fn[main](n017f49dbfbe9e0a8_en4a19n90pa5f) [finite failure]
            whynot ox_wrapped_fn[main](n017f49dbfbe9e0a8_en4a19n90pa5f):
              rule r8433a96c: ox_wrapped_fn[main](?Fn)@now :- ox_method_member[main](?_$0,?Fn)@now
                failed premise: ox_method_member[main](?_$0#0,n017f49dbfbe9e0a8_en4a19n90pa5f)
              rule r295bcd7b: ox_wrapped_fn[main](?Fn)@now :- ox_type_only_method[main](?_$0,?Fn)@now
                failed premise: ox_type_only_method[main](?_$0#1,n017f49dbfbe9e0a8_en4a19n90pa5f)
        oxc_c[ast_oxc](n017f49dbfbe9e0a8_en4a19n90pa5f,body,0,n017f49dbfbe9e0a8_einjg9erj696f)  <= rce71f102 @tick 0
          child[ast_oxc](n017f49dbfbe9e0a8_en4a19n90pa5f,body,0,n017f49dbfbe9e0a8_einjg9erj696f) [axiom]
          unwrapped[ast_oxc](n017f49dbfbe9e0a8_einjg9erj696f,n017f49dbfbe9e0a8_einjg9erj696f)  <= r89ad7666 @tick 0
            node[ast_oxc](n017f49dbfbe9e0a8_einjg9erj696f,function_body,"checkout.js") [axiom]
            not ox_wrapper_kind[main](function_body) [finite failure]
              whynot ox_wrapper_kind[main](function_body):
                no rule concludes 'ox_wrapper_kind' and no matching base fact exists
    target[value](n017f49dbfbe9e0a8_en4a19n90pa5f,n017f49dbfbe9e0a8_5dtpbvqf99hq1)  <= rc88cb927 @tick 0
      oxc_k[ast_oxc](n017f49dbfbe9e0a8_en4a19n90pa5f,function) [above]
      oxc_c[ast_oxc](n017f49dbfbe9e0a8_en4a19n90pa5f,id,0,n017f49dbfbe9e0a8_5dtpbvqf99hq1)  <= rce71f102 @tick 0
```
<!-- END run -->

The same proof as the notebook's, in the engine's own form. Each line is a
fact; `<= re667b5bf @tick 0` names the rule that derived it; the lines
indented under it are the facts that rule used; `[axiom]` is a fact that was
given, by the scanner or by a rule file, and nothing is under an axiom. A node of the code is its id,
not a name: `n017f49dbfbe9e0a8_en4a19n90pa5f` is the function `checkout`, and
the `fn_name` line right under it is what ties the two together. The whole
proof runs to some 150 lines. The notebook's sentence form, with
`[function checkout() at checkout.js:4]` where the id is, is the one to
read; the command line's is the one to parse.

## Why not

<!-- BEGIN run guide/examples/first: rofl whynot 'risky("safeCheckout")' @rules/js.files shop.rofl -->
```
$ rofl whynot 'risky("safeCheckout")' @rules/js.files shop.rofl
whynot risky[main]("safeCheckout"):
  rule re667b5bf: risky[main](?N)@now :- fn_name[code](?F,?N)@now, exported_fn[code](?F)@now, may_throw[code](?F)@now
    failed premise: may_throw[code](n017f49dbfbe9e0a8_0o34j1j12he7d)
      rule rbef6bec0: may_throw[code](?F)@now :- may_throw[code](?G)@now, sync_body[code](?G)@now, resolves[code](?C,?G)@now, nearest_fn[code](?F,?C)@now, not caught_here[code](?C)@now
        failed premise: not caught_here[code](n017f49dbfbe9e0a8_fr031il3tivb6) -- blocked: caught_here[code](n017f49dbfbe9e0a8_fr031il3tivb6) holds
  (every failure: --all)
```
<!-- END run -->

The one rule that could conclude `risky("safeCheckout")` and the premise that
fails in it: `may_throw` of the node that is `safeCheckout`. One rule further
down is why that fails. A function may throw when it calls one that may
throw, unless the call is caught, and here it is: `not caught_here(C)` is
blocked because `caught_here(C)` holds, the call to `checkout` being inside a
`try`.

`whynot` follows every way a rule could have held and prints the one that
came nearest, the one with the fewest conditions left unmet. The last line,
`(every failure: --all)`, says there were others; `rofl whynot --all` prints
every one. `--depth N` and `--nodes N` bound how far the walk goes.

## What it could not see

The notebook prints a note about `./log.js` before anything else. On the
command line the gap is a relation like any other, and you ask for it:

<!-- BEGIN run guide/examples/first: rofl ask 'unresolved_relative[code](F,L,S)' @rules/js.files shop.rofl -->
```
$ rofl ask 'unresolved_relative[code](F,L,S)' @rules/js.files shop.rofl
F = "checkout.js", L = 2, S = "./log.js"
```
<!-- END run -->

A relative import that names no file of the code, with its file and line.
An agent that asks a question about code should ask this one too: an answer
over a world with an unresolved import holds only as far as the model sees.

An import is not the only place the model can lose the thread, and each of
the others is a relation of its own, asked the same way:

| relation | holds for |
|---|---|
| `unresolved_call[code](C, Shape)` | a call the model could not tie to the function it runs, with the shape of its callee |
| `may_call[code](A, F)` | function `A` makes a call `o[k]()` whose key the model could not trace, and `F` is one of the functions `o` holds, so the call may run it; this is kept apart from `calls`, which holds only what is certain |
| `merged_param[audit](F, I, N)` | parameter `I` of function `F` is handed `N` different functions across its callers, so what it calls is their union, not the one each caller passed |

Code under `if (require.main === module)` runs only when its file is started
as a script. By default the model reads every file as a library, so that code
counts as never run. A world that means otherwise says so in a fact:
`runs_as_script("bin/cli.js")` reads that one file as node runs it, and
`reads_the_file_as(script)` reads every file so.

## The second question costs nothing

The first `rofl ask` over the shop scanned two files, evaluated the model and
answered in about a second. It also kept the world it built, under
`~/.cache/rofl/worlds`, named by its files and the engine. The second
question over the same files, this one or another, is answered from the kept
world without evaluating: 0.03 s on the same machine. Change the `<=` in
`pay.js` to `<` and ask again: the run scans that one file again, takes the
change by delta instead of starting over, and says so on stderr:

```
the kept world took 1 file by delta: pay.js (scanned again) (1 facts out, 4 overdeleted or derived again; opened and taken in 285 ms, kept again in 0 ms, 220396 bytes written over the world it was kept from)
```

Nothing to turn on. The cache holds at most `ROFL_CACHE_GB` gigabytes (50 by
default) and drops the least recently used world first. A world too large for
it is answered and not kept, said on stderr; a world that grows past the cap
while evaluating stops there, answers what it has as partial (exit 5), and
goes on from where it stopped when asked under a larger cap. The same holds
for memory: a world that outgrows the memory the process may use (its
container's limit, or what the machine has free) stops there, answers partial
with exit 5, says so on stderr and is not kept. The engine reports it; it is
not killed halfway through.

A question evaluates only the part of the model it needs: `rofl ask`, `why`
and `whynot` run the rules their question can reach and no others, and a later
question about something else grows the kept world by what that one needs. On
700 files of VS Code with the JavaScript model, the first question takes 49 s
and 2.1 GB, where evaluating the whole model takes 104 s and 3.4 GB.

## Exit codes

| code | meaning |
|---|---|
| 0 | answered, whole |
| 1 | the call is wrong: a flag, a value, a file that cannot be read |
| 2 | a file is refused: it does not parse or does not load; or a `--kept` world is stale |
| 3 | the world is refused when evaluated: a declared structure does not hold, or a negation runs through a cycle |
| 4 | the question is refused: `why` of a literal with a variable in it, `excise` of a fact that is not given, a question outside the world's declared cone |
| 5 | answered, but from a world cut short by its budget, its space, the memory the process may use, or a failed scan; the rows may be short |
| 70 | a defect in the engine itself |

A refusal wins over a partial answer: a run with a refused question exits 4
whatever else happened.

## The rest

`rofl excise F` answers what changes without the given fact F: the rows that
go and the rows that come. `rofl load --ask L --why L --whynot L --excise F`
asks several questions in one evaluation, the answers in that order with a
blank line after each. `--kept F` keeps the world at a path of your own, under
a stricter rule: computed once, asked any number of times, refused rather than
recomputed once a file it was built from changes. Every flag, the JSON shapes,
`rofl serve` for a long-running process and `rofl render` for the sentence
form are in [docs/cli.md](../docs/cli.md).

Next: [QUICKSTART.md](QUICKSTART.md) for the notebook, and
[CONCEPTS.md](CONCEPTS.md) for the sentence form it speaks.
