---
world: spat-week-whatif
books: main
default: main
model: none
reads:
  - ../spat/spat.rofl
  - ../spat/week.example.rofl
  - whatif_waive_swim.rofl
---

# What if robin's Thursday swim gives instead

> The "after" half of `examples/notebook/spat.rofl.md`'s R1 what-if. A
> notebook's cells share one flat, pre-assembled model — there is no
> "before this fact" inside one file — so the "before" lives in `spat.rofl.md`
> itself (unmodified `examples/spat` files, 4 rows of `uncovered`,
> `holds_together(week)` empty) and this sibling file is the "after": the
> same two `examples/spat` files, unedited, plus one added fact,
> `whatif_waive_swim.rofl`'s `waived(c_swim).` — robin's Thursday swim,
> the cheaper of the two constraints R1 found stacked on that evening,
> given instead of alex's external Acme commitment.

```datalog
? holds_together(week)
? uncovered(Ch, D, S)
? out_why(P, thu, 1080, C)
? out_why(P, thu, 1060, C)
? on_duty(P, thu, 1080)
```

> Against `spat.rofl.md`'s R1: `holds_together(week)` now holds (was empty),
> `uncovered` is 0 rows (was 4: kit/nico × 1060/1080), `out_why` at both
> slots now names only `alex`/`c_acme` (robin's row is gone — the swim span
> no longer exists to make her `out`), and `on_duty` at 1080 now names
> `robin`. Alex never stopped being at Acme; one adult on duty was enough.
