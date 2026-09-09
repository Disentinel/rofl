# Reading the complement — the two ambient surface items

2026-09-09, `w_ambient_prototype_effects` and `w_ambient_es_intrinsic_effects`.
Both ask the same question from two sides — a surface reaches a call site and no
table says what its members do — and the two answers are opposite. That is why
they were two items, and it is the only reason this note is worth writing.

## The question each item asked, and the answer

**The prototypes: YES, and the source had already written it down.** The item's
own note lists the nine array mutators — `push`, `pop`, `splice`, `sort`,
`reverse`, `fill`, `copyWithin`, `shift`, `unshift` — and asks whether that list
can be READ from a declaration file rather than typed, saying *the honest answer
may be no*. TypeScript declares a `Readonly` TWIN of every mutable collection
interface in `lib.es*.d.ts`, and the twin is the same surface with the mutating
members removed. So the closed list is a SET DIFFERENCE over two interfaces in
files `scanners/ts_lib.ts` already parses:

```
Array minus ReadonlyArray   copyWithin fill pop push reverse shift sort splice unshift
Map   minus ReadonlyMap     clear delete set
Set   minus ReadonlySet     add clear delete
```

The first line is the item's list, member for member, and the other two are the
same construction on the two collections whose instance surface this model does
not carry. The reverse difference is EMPTY in all three, which is the property
the subtraction rests on rather than a curiosity: the readonly view declares
nothing the mutable interface does not, so a member missing from the view is
missing *because it mutates*.

**The intrinsics: NO for the members, and the founding finding is confirmed
rather than worked around.** `Math.max` and `Math.random` are the same
`MethodSignature` in every declaration file there is. No scan separates `total`
from `ndet`.

## The transferable move: ask whether the source states the COMPLEMENT

Three of the four attributions this branch derived came from a complement rather
than from the thing itself:

- the mutating half of a prototype, from the READONLY view that omits it;
- `new Math()` throws, from the ABSENCE of a `MathConstructor` interface;
- `Error.captureStackTrace` is not the ECMAScript surface's debt, from the
  ABSENCE of a `lib_static` row for it.

Each of those is a fact about a declaration file that nobody thought to
subtract, because the question was always put as "does the source say what this
member DOES" — and it never does. Before concluding a semantic property is not
in the source, ask whether the source states its complement somewhere.

## Where the subtraction lives, and why it is not in the scanner

`facts/js-lib-surface.rofl` carries what the declaration SAYS —
`lib_readonly_view(array, "ReadonlyArray")` and the thirty members that view
declares. `lib_mutator` in `rules/js-ambient.rofl` is the difference. A scanner
emitting the mutators directly would have put the one inference of the whole
item in the layer with no query surface, which is CLAUDE.md's own *a filter's
danger is that its criterion is invisible while you look through it*. As two
generated tables plus a rule, the criterion is a rule body and
`lib_readonly_only[audit]` — the reverse difference — can go red.

And what the source CANNOT say is a row rather than a silence.
`amb_proto_unsplit[flow]` is the five builtin prototypes with no twin at all:
`string`, `number`, `boolean`, `regexp`, `bigint`. That is not "they have no
mutators"; the rule is guarded on `lib_readonly_view(P, _)` having a row for
exactly that reason, and MUTANT M10 removes the guard and watches
`RegExp.prototype.test` become a mutator.

## The heap is why this could not be more rows in section 4

`ambient_effect(Surface, Member, Name)` has no heap column, and section 3 of the
ambient pack decides the ambient heap once and defends it in a sentence: an
ambient surface is BY DEFINITION not allocated in this program, so an ambient
read is `read<global>` with no arm and no exception.

**A builtin prototype breaks that argument.** The surface is ambient and the
RECEIVER is a value in this program: `[3,1,2].sort()` writes a cell this program
made. There is no single heap a surface-grain row could name.

The answer is not a site rule. It is that the heap is decidable PER PROTOTYPE
and structurally, for some of them. `eff_heap_of` says `local` exactly when
`may_be_node[flow]` reaches the receiver; every arm of `prototype_of[flow]`
except the first IS a `may_be_node` join, so the only untraced receiver comes
from the receiver's own KIND — and a prototype every one of whose
`kind_prototype` kinds is a `node_value_kind` can have none. `array` and
`regexp` are those two. `"ab".concat(x)` really is a read of an untraced
receiver, and MUTANT M11 — every prototype heap-decided — SURVIVES the four
fixtures and dies on a two-line probe, because this world reaches the `string`
prototype only through `new String(s)`.

The generalisation it paid for: section 3's landmark closure was written over an
ATOM and is now written over `(label, heap)`, because two callers needed the
same Moore closure on a heap the first one refuses. `wr_local` appears nowhere
in the pack — `eff_of_label(write, H, E)` computes it.

## The refusals, and both are measurements

**The data-static floor.** The intrinsic item proposes one: `lib_static_shape`
separates a `PropertySignature` from a `MethodSignature`, so *a data static of a
frozen intrinsic is `total` with no judgement at all*. It would have been 87
rows and NOT ONE would ever join. An OPERATION here comes from `selects[flow]`
on the CALLEE of a call, so a data static can only be an operation if a program
calls `Math.PI(...)` — the very thing the data/method split exists to say nobody
does. Measured: of the operations a call site reaches on an ES surface, every
one is `callable` and none is `data`.

**`alloc` for a construction.** `new Map()` allocates; `new Array(n)`,
`new String(s)` and `new RegExp(src)` allocate AND throw, on a bad length, a
symbol and a bad pattern. The lattice's least name containing both `alloc` and
`exn` is `io` — `eff_join(alloc, exn, io)`, measured — so the two available
answers are an under-approximation of a constructor whose body is not in this
program, and a claim that `new Map()` does input and output. Naming a landmark
between them is the effect layer's move. Four surfaces stay owed and the reason
is a row.

## The in-tray was strengthened BEFORE anything was attributed

`ambient_owed[flow]` read `not amb_surface_attributed(S)` — no member of this
surface is attributed — and that form can be emptied without answering anything.
The refused floor above is exactly the shape that empties it: eight ECMAScript
surfaces would have left the in-tray while `Math.max`, `JSON.parse` and
`Object.keys` stayed as unanswered as before.

So the relation now ranges over `concrete_unmapped[flow](S, Op)` — a surface
with at least one operation A CALL SITE REACHES and no map. **Measured first: on
the tree before any attribution the two forms agree ROW FOR ROW, sixteen
surfaces**, so the redefinition is not what moves the set. That control is the
whole difference between a repair and a redefinition that hides its own effect.

They disagree in both directions now, and printing the difference is the point:
`JSON`, `Math`, `Reflect` and `array` are attributed in part and still owe;
`Error` is unattributed and owes nobody anything.

The general form, and this repository already has half of it: a COUNT that two
branches move is not a pin. This is the other half — **a SET whose membership
test is coarser than the thing it is a set of will shrink for work nobody did,
and it shrinks silently, because every row in it is still true.**

## A debt discharged by showing it belongs to somebody else

One surface left `ambient_owed[flow]` and nothing about it was attributed.
`es_intrinsic/Error` was owed for exactly one operation,
`Error.captureStackTrace` — V8's, declared in `@types/node` and nowhere in
`lib.es*.d.ts`. No table of ECMAScript effects will ever map it, and reporting
the ECMAScript surface as owing an effect for a member it does not declare is
false about the surface and hides whose debt it is.
`ambient_off_surface[flow](S, Op)` is the relation and that pair is its one row.

This repository already knows that an item can be BLOCKED on somebody else and
that a blindness can have no cell. What it did not have was the third move: a
debt discharged by showing the creditor was wrong. It needs a relation of its
own, because a row that simply disappears from an in-tray is indistinguishable
from a row that was answered.
