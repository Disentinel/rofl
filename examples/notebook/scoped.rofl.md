---
world: scoped-notebook
books: main
default: main
model: js
code:
  - scoped/assign.js
---

# An assignment reaches the readers of its binding

> `x = v` used to reach every read of the NAME `x` in the file: two functions
> that each declare their own `v` handed each other their values, and on a real
> file the answers grew a hundredfold with no new signal. The assignment now
> reaches the readers of the binding its target names: a declarator in scope
> (a closure, a hoisted `var`, a `let;` with no initialiser) or a parameter.
> Run it with `npm run nb -- examples/notebook/scoped.rofl.md`.

> What each `use(x)` may see, per function. `sibOne` and `sibTwo` declare a `v`
> each; `shadowing` hides the top-level `shared`; `readShared` is the one place
> the top-level binding is read, and the one place `setShared` reaches.

```datalog
seen(F, Id, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                    arg_at[flow](C, 0, A), ast_name[code](A, Id),
                    nearest_fn[code](Fn, C), fn_name[code](Fn, F), may_be_lit[flow](A, V).

? seen(F, Id, V)

never seen("sibOne", "v", 4)
never seen("sibTwo", "v", 2)
never seen("shadowing", "shared", 0)
never seen("readShared", "shared", 5)
never seen("bare", "b", 1)
never seen("sum", "t", "b")
```

> What the model could not place. An assignment to a name no declarator or
> parameter owns, an implicit global and a catch parameter here, keeps the old
> over-approximation, by name and file, and is a row to ask for: the queue is
> `assign_unscoped`, the reach is `assign_reaches_unscoped`. A read that some
> binder claims is not reached.

```datalog
? assign_unscoped[flow](A)
? assign_reaches_unscoped[flow](E, Src)
```
