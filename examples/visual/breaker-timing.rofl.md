---
reads:
  - ../../visual/time.rofl.md
---

# Circuit breakers, drawn as a timing diagram

> Each service's circuit breaker is a signal: closed, open, or half open,
> minute by minute. A breaker that stays open for more than ten minutes is
> the defect; the `never` below fails on it, and the picture draws that
> stretch red. `draw timing` draws the intervals in a state, a lane per
> breaker stepping between its states.

## The breakers

Declared as facts:

- <a id="was"></a>A breaker B was in a state S from a minute F to a minute T

The trace:

- `payments` was in `closed` from 0 to 4.
- `payments` was in `open` from 4 to 17.
- `payments` was in `half_open` from 17 to 19.
- `payments` was in `closed` from 19 to 30.
- `search` was in `closed` from 0 to 9.
- `search` was in `open` from 9 to 14.
- `search` was in `half_open` from 14 to 16.
- `search` was in `open` from 16 to 20.
- `search` was in `half_open` from 20 to 22.
- `search` was in `closed` from 22 to 30.

<a id="stuck"></a>A breaker B is stuck from F if B was in `open` from F to T, D is F + 10 and T > D.

## The picture

$span(B, F) is in the lane B if B was in some state from F to something.

$span(B, F) runs from F to T if B was in some state from F to T.

$span(B, F) is in the state S if B was in S from F to something.

$span(B, F) is tagged `stuck` if B is stuck from F.

```rofl
never M is tagged `stuck`
draw timing
```
