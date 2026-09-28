---
world: review-notebook
books: main
default: main
model: none
reads:
  - ../review.rofl.md
---

# Who blocks a change

> A notebook over the review world, the file of the same name one directory
> up (`../review.rofl.md`), which holds the facts and rules and asks nothing:
> its sentences are loaded first, then the cells below ask about them. Run it with
> `npm run nb -- examples/notebook/review.rofl.md`.

## The questions

> Which change is blocked, and by which team.

```rofl
? C is blocked by T
why `c2` is blocked by `platform`
```

> A change that nobody can merge yet is stuck. The sentence is new, so the
> notebook names the relation after its words.

```rofl
A change C is stuck if C is written by some person and C is blocked by some team.

? C is stuck
whynot `c2` is mergeable
```

## The invariants

> Payments has approved everything it owns, so no change waits on it.

```rofl
never C is blocked by `payments`
```

> The same question in plain Datalog.

```datalog
waits_on(C, T) :- blocked(C, T).

never waits_on(C, payments)
```
