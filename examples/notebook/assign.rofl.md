---
world: assign-notebook
books: main
default: main
model: js
code:
  - assign/lib.js
  - assign/consumer.js
---

# Object.assign mutates its first argument and returns it

> `Object.assign(target, ...sources)` copies the members of the sources onto
> `target` and evaluates to `target`. The model reads it from the library
> member the callee IS (the global `Object`, here also through
> `const assign = Object.assign`), never from the name `assign`: `other.assign`
> on a plain object of the program is an ordinary method and moves nothing.
> Run it with `npm run nb -- examples/notebook/assign.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).
called(Name) :- call_site[code](C, _), resolves[code](C, F), fn_name[code](F, Name).

? seen(Tag, V)
? called(Name)

never seen("bystander.leak", 1)
```
