---
reads:
  - ../spat/spat.rofl
  - ../spat/week.example.rofl
  - rofl:visual/time.rofl.md
---

# The SPAT week, a day a frame

> The week of `examples/spat`, drawn as small multiples: a Gantt chart per
> day, in the week's order, each bar a thing someone does that day and a red
> bar wherever a child is alone while awake. A bar that was not there the
> day before is new; one that was and is not, gone.

Reads:

- from spat:
  - <a id="span"></a>A constraint C puts an event E on a person W at a place P on a day D from F to T
  - <a id="uncovered"></a>A child Ch is alone on a day D at a minute S
  - <a id="day"></a>A day D is the day number N of the week

## The picture

$on(E, D) is in the lane W if some constraint puts E on W at some place on D from something to something.

$on(E, D) runs from F to T if some constraint puts E on some person at some place on D from F to T.

$on(E, D) is in the frame N if some constraint puts E on some person at some place on D from something to something and D is the day number N of the week.

$on(E, D) is labelled E if some constraint puts E on some person at some place on D from something to something.

$alone(Ch, D, S) is in the lane Ch if Ch is alone on D at S.

$alone(Ch, D, S) runs from S to E if Ch is alone on D at S and E is S + 20.

$alone(Ch, D, S) is tagged `alone` if Ch is alone on D at S.

$alone(Ch, D, S) is in the frame N if Ch is alone on D at S and D is the day number N of the week.

```rofl
never M is tagged `alone`
draw time
```
