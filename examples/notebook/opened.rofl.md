---
world: opened-notebook
books: main
default: main
model: js
code:
  - opened/opened.js
---

# A value the model cannot name is open, not missing

> `n++`, `m += 1`, `k = k + 1`, `Math.random()`, `'ab'.toUpperCase()`,
> `JSON.parse(s)`, a template with an expression, an operator: the model
> computes none of them. Before, such a write added nothing, so the may-set of
> the read was SHORT (`n` was {1}, where V8 reads 2) and a `never` over it held
> where it is false. Now each is `may_be(E, open, open)`, carried where the
> value goes as any other kind is: a read answers what it knows AND that it may
> be a value the model does not compute; which place made it, `rofl why --all`
> says, so a read keeps one such row, not one per place. An index the
> model cannot name (`arr[i]`, `arr[arr.length - 1]`) reads every element.
> So is a member of a value whose members the model does not keep (a
> parameter's `p.x`, a literal's `.length`, `Math.PI`), what a `catch` takes
> from a call, `arguments`, what a for-of walks over an open value, and what
> `new f()` of a plain function makes. A name nothing declares is the global
> of that name, `may_be(E, global, Name)`.
> The reads `plain`, `cond`, `find` and `arr[i]` are the control: known values, nothing open.
> `use(tag, v)` marks each read; `npm run test:nb` checks it against V8.
> Run it with `npm run nb -- examples/notebook/opened.rofl.md`.

```datalog
use_arg(Tag, A) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                   arg_at[flow](C, 0, T), ast_value[code](T, Tag), arg_at[flow](C, 1, A).
seen(Tag, V) :- use_arg(Tag, A), may_be_lit[flow](A, V).
opened(Tag) :- use_arg(Tag, A), may_be[flow](A, open, _).
known(Tag) :- seen(Tag, _).
known(Tag) :- opened(Tag).
silent(Tag) :- use_arg(Tag, _), not known(Tag).

? seen(Tag, V)
? opened(Tag)

never silent(Tag)
never opened("plain")
never opened("cond")
never opened("find")
never opened("arr[i]")
```
