---
reads:
  - rofl:visual/time.rofl.md
---

# A checkout, drawn as a sequence

> Four services pass calls to each other, one tick at a time. A call that is
> sent and never answered is the defect: the `never` below fails on it, and
> the picture draws it as the message with no reply. Marks that go from lane
> to lane draw as a sequence diagram, not a Gantt chart.

## The calls

Declared as facts:

- <a id="sent"></a>A call C is sent by a service S to a service T at a tick N
- <a id="answered"></a>A call C is answered at a tick N

<a id="unanswered"></a>A call C is unanswered if C is sent by some service to some service at something, unless C is answered at something.

The trace:

- `c1` is sent by `web` to `api` at 1.
- `c2` is sent by `api` to `db` at 2.
- `c2` is answered at 3.
- `c3` is sent by `api` to `payments` at 4.
- `c1` is answered at 6.

## The picture

A mark C goes from S to T at N if C is sent by S to T at N.

$reply(C) goes from T to S at N if C is sent by S to T at something and C is answered at N.

A mark C is tagged `unanswered` if C is unanswered.

```rofl
never C is unanswered
draw time
```
