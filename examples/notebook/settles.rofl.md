---
world: settles-notebook
books: main
default: main
model: js
code:
  - settles/settles.js
---

# What a promise settles to, what a static method's `this` is, and the reads that held already

> `new Promise(res => res(v))` settles to v, so its `then` and an `await` of
> it read v; `Promise.allSettled(xs)` gives an outcome per value whose `value`
> is it; a static method called on a subclass (`Sub.make()`) has the subclass
> as `this`, so `new this()` there is the subclass. The rest of
> settles/settles.js (for await, private methods, a getter through `super`,
> fluent setters, curried arrows) are reads the model already had, kept as the
> control. `use(tag, v)` marks each read; `npm run test:nb` runs the file in V8
> and checks every value it observes is in the model's may-set. Run it with
> `npm run nb -- examples/notebook/settles.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).
silent(Tag) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
               arg_at[flow](C, 0, T), ast_value[code](T, Tag), not seen(Tag, _).

? seen(Tag, V)

never silent(Tag)
```
