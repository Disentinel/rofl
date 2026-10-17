---
world: packages-notebook
books: main
default: main
model: js
code:
  - packages/runner.js
---

# Which package a value came from, and what its contract says

> A value from outside the corpus names its package: `co`, the scoped
> `@acme/etask` (not `@acme/etask/lib`), node's `node:fs`. A file the slice
> left out (`./left-out.js`) is no package and gives no value.
> Run it with `npm run nb -- examples/notebook/packages.rofl.md`.

```datalog
? external_package[code](Spec, Pkg, Origin)

left_out_external(N) :- dangling_import[code](I, _), may_be_node[flow](I, N).
never left_out_external(N)
```

> A library's contract is a row of the package, not a method's name. `co` runs
> a generator as a coroutine: `yield 8080` is 8080, and the call is what the
> generator returns. A company's own runner is declared where it is used, as
> here: `@acme/etask` runs a generator the same way, and its `_class` hands
> back the class it is given.

```datalog
runs_coroutine("@acme/etask", call, 0).
returns_argument("@acme/etask", "_class", 0).

seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).

? seen(Tag, V)
? contract_call[flow](C, Pkg, Key)
```
