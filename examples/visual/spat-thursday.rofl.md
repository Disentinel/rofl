---
reads:
  - ../spat/spat.rofl
  - ../spat/week.example.rofl
  - ../../visual/time.rofl.md
---

# Thursday of the SPAT week, drawn

> The household week of `examples/spat` read through its rules, and one
> day of it drawn as a Gantt chart: a lane per person, a bar per thing they
> do, and a red bar wherever a child is alone while awake. The picture is
> one day because a Gantt chart is one axis of time; a week is seven of
> them (the *frames* modifier of docs/renderers.md, not built).

Reads:

- from spat:
  - <a id="span"></a>A constraint C puts an event E on a person W at a place P on a day D from F to T
  - <a id="uncovered"></a>A child Ch is alone on a day D at a minute S

## The picture

A mark E is in the lane W if some constraint puts E on W at some place on `thu` from something to something.

A mark E runs from F to T if some constraint puts E on some person at some place on `thu` from F to T.

$alone(Ch, S) is in the lane Ch if Ch is alone on `thu` at S.

$alone(Ch, S) runs from S to E if Ch is alone on `thu` at S and E is S + 20.

$alone(Ch, S) is tagged `alone` if Ch is alone on `thu` at S.

```rofl
never M is tagged `alone`
draw time
```

> `why` on a red bar is SPAT's answer to whose constraint left the child
> alone: `why $alone(kit, 1060) is tagged alone` walks from the bar into
> `spat.rofl`.
