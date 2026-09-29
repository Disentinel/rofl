---
world: view-time
---

# The time view

> The words a notebook draws time with (docs/renderers.md, *Time*): a mark
> runs over an interval or happens at a point, in a lane, or goes from one
> lane to another. Time is an integer, a tick or a minute: atoms have no
> order, so order comes only from numbers. `draw time` draws marks with
> `runs from` as a Gantt chart, and marks that go from lane to lane as a
> sequence diagram; `draw timeline` draws the marks that happen at a point
> on one axis, and `draw timing` the intervals in a state, a lane's signal
> stepping from state to state.

Declared as facts:

- <a id="lane"></a>A mark M is in the lane L
- <a id="during"></a>A mark M runs from T1 to T2
- <a id="happens"></a>A mark M happens at T
- <a id="message"></a>A mark M goes from a lane P to a lane Q at T
- <a id="in_state"></a>A mark M is in the state S
- <a id="tagged"></a>A mark M is tagged a tag K
- <a id="frame"></a>A mark M is in the frame F
- <a id="collapsed"></a>A mark G is collapsed
- <a id="lane_group"></a>A lane L is in the group G
- <a id="labelled"></a>A mark M reads S
- <a id="reserved"></a>A tag K is reserved

The renderer's tags:

- `unknown` is reserved.
- `blind` is reserved.
- `gone` is reserved.
- `new` is reserved.
- `failing` is reserved.
- `dangling` is reserved.

## The checks any timeline can use

<a id="backwards"></a>A mark M runs backwards if M runs from T1 to T2 and T1 > T2.

<a id="on_the_axis"></a>A mark M is on the time axis either:

1. if M runs from something to something;
2. if M happens at something;
3. if M goes from some lane to some lane at something.

<a id="laneless"></a>A mark M is in no lane if M runs from something to something, unless M is in the lane something.

<a id="untimed"></a>A mark M is untimed if M is tagged something, unless M is on the time axis.

<a id="wears_reserved"></a>A mark M wears a reserved tag if M is tagged K and K is reserved.
