---
world: typed-notebook
books: main
default: main
model: js
code:
  - typed/typed.ts
---

# What TypeScript adds at run time: enums, parameter properties, namespaces

> An enum is an object of its members, each its initialiser or, with none in
> the enum, its position; `constructor(private name: string, public tag = 'pt')`
> sets a member per parameter from each `new`'s argument or the default; a
> namespace is an object of what it exports. The rest of typed/typed.ts
> (casts, `satisfies`, generics, an abstract class, tuples) are reads the model
> already had, kept as the control. `use(tag, v)` marks each read;
> `npm run test:nb` compiles the file with TypeScript, runs it in V8 and checks
> every value it observes is in the model's may-set. Run it with
> `npm run nb -- examples/notebook/typed.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).
silent(Tag) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
               arg_at[flow](C, 0, T), ast_value[code](T, Tag), not seen(Tag, _).

? seen(Tag, V)

never silent(Tag)
```
