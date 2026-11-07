---
world: declared-notebook
books: main
default: main
model: js
code:
  - declared/calls.ts
  - declared/bar.ts
---

# What a receiver is declared to be

> A type annotation is its own sort of answer: what the program DECLARES a
> receiver to be (`p: IFoo`, `private readonly foo: IFoo`), never mixed with
> what may reach it. `member_declared` says the declared type has the member,
> `missing_declared_member` that every type the receiver is declared as is
> known whole (its `extends` resolved, no index signature) and none has it.
> TypeScript narrows a declaration where the code tests it (`s instanceof Sub`),
> and a receiver tested so is not held to it. `npm run test:nb` compiles the
> files with TypeScript and checks that its "property does not exist" errors
> on calls are exactly the calls said missing here.
> Run it with `npm run nb -- examples/notebook/declared.rofl.md`.

```datalog
at(L, K, C) :- member_call[flow](C, _, K), ast_line[code](C, L).
missing_by_type(L, K) :- missing_declared_member[audit](C, _, K), at(L, K, C).
has_by_type(L, K)     :- member_declared[audit](C, _), at(L, K, C).

? missing_by_type(L, K)
? has_by_type(L, K)

never missing_by_type(_, "whatever")
never missing_by_type(25, "extra")
```
