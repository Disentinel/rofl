---
world: runs-notebook
books: main
default: main
model: js
code:
  - runs/runs.js
---

# A call runs the function a host calls back, and does what it does

> `[1, 2].forEach(cb)` calls `cb` before it returns, as `map`, `sort`, a
> destructured getter, `f.call` and `f.apply` do, and `new C()` calls what the
> initialisers of C's fields call: the call graph has the edge, and the caller
> does what the callee does, its throw included. `new Promise(executor)` calls
> the executor at once and catches its throw. A callback called later
> (`setTimeout`, `then`) is not a frame of the caller: no edge, no throw, but
> what it writes it still writes. A function only handed over is not called.
> A declared function and a class have the members of `Function.prototype`.
> `probe(P)` is each function of runs/runs.js; `hit(Tag)` marks the code that
> ran. Checked against what V8 runs by `npm run test:nb`. Run it with
> `npm run nb -- examples/notebook/runs.rofl.md`.

```datalog
probe(P, F) :- fn_name[code](F, P), hoisted[value](F, _), P != "hit".
hit_in(G, Tag) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "hit"),
                  arg_at[flow](C, 0, T), ast_value[code](T, Tag), nearest_fn[code](G, C).
reach(F, F) :- probe(_, F).
reach(F, H) :- reach(F, G), calls[code](G, H).
ran(P, Tag)  :- probe(P, F), reach(F, G), hit_in(G, Tag).
may_fail(P)    :- probe(P, F), may_throw[code](F).
writes(P)    :- probe(P, F), eff_latent[flow](F, write, local).
builtin(Obj, Key) :- selects[flow](N, Key), object_of[code](N, O), ast_name[code](O, Obj),
                     prototype_of[flow](O, function), lib_member(function, Key, _).

? ran(P, Tag)
? may_fail(P)
? writes(P)
? builtin(Obj, Key)

never ran(P, "never")
never ran(P, "timeout")
never ran(P, "then")
never may_fail("viaThen")
never may_fail("catchesForEach")
never may_fail("rejectsInExecutor")
```
