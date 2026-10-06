---
world: decorated-notebook
books: main
default: main
model: js
code:
  - decorated/deco.ts
---

# A decorator runs when the class is defined

> `@shelve(mark()) stock() {...}` puts the call of `mark` inside the subtree of
> `stock`, and it runs once, when `Shelf` is defined, not when `stock` is called.
> `stock`'s body is `return 2`: nothing happens in it. `mark` writes a registry
> and calls `boot`, which calls `stock`, so a model that files the decorator
> under `stock` reads a loop through it. The call graph already files the
> decorator's call under the function around the class (`nearest_fn` steps over
> the functions that hold a site in their own decorator); the effect layer read
> `nearest_v` and did not.
> Run it with `npm run nb -- examples/notebook/decorated.rofl.md`.

> The decorator's call belongs to nobody that is a function: `calls` has it
> from the file's root, and the effect layer's call edges agree.

```datalog
named(F, Name) :- fn_name[code](F, Name).
calls_from(Name, X) :- named(F, Name), calls[code](F, G), fn_name[code](G, X).
eff_calls_from(Name, X) :- named(F, Name), eff_calls[code](F, G), fn_name[code](G, X).

root_calls(X) :- calls[code](R, G), ast_file[code](R, _), fn_name[code](G, X).

? root_calls(X)
? calls_from("mark", X)
? calls_from("boot", X)
never calls_from("stock", "mark")
never eff_calls_from("stock", "mark")
never eff_calls_from("stock", "shelve")
```

> What `stock` may do when called is nothing. What the decorator does is the
> class's, and `plain` next to it is as pure as `stock`.

```datalog
latent_of(Name, L, H) :- named(F, Name), eff_latent[flow](F, L, H).
defined_by_class(L, H) :- class_define_eff[flow](CD, L, H).

? latent_of("mark", L, H)
? defined_by_class(L, H)
never latent_of("stock", L, H)
never latent_of("plain", L, H)
```

> The call of `mark` in the decorator is not a recursion: its caller is not
> `stock`, so `mark` reaching `stock` closes no loop.

```datalog
decorator_div(C) :- eff_here[flow](C, div, none), in_own_decorator[code](_, C).

never decorator_div(C)
```
