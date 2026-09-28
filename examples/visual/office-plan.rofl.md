---
reads:
  - ../../visual/space.rofl.md
---

# An office, drawn as a plan

> Rooms are boxes and desks are points on a floor plan, in centimetres from
> the north-west corner. A desk is in a room when its point falls inside the
> room's box; a desk in no room is the defect. On the plan the rooms hold
> their desks, so zooming shuts a room into one mark with its desk count.

Declared as facts:

- <a id="room"></a>A room R spans X Y W H
- <a id="desk"></a>A desk D stands at X Y

The floor:

- `studio` spans 0 0 600 400.
- `kitchen` spans 600 0 300 400.
- `library` spans 0 400 900 300.
- `d1` stands at 100 100.
- `d2` stands at 300 150.
- `d3` stands at 500 300.
- `d4` stands at 700 100.
- `d5` stands at 200 500.
- `d6` stands at 950 200.

<a id="desk_in"></a>A desk D is in a room R if all of:

  - D stands at X Y;
  - R spans RX RY W H;
  - X >= RX;
  - Y >= RY;
  - E is RX + W;
  - F is RY + H;
  - X < E;
  - Y < F.

<a id="roomed"></a>A desk D is roomed if D is in some room.

<a id="homeless"></a>A desk D is homeless if D stands at something something, unless D is roomed.

## The picture

The space is projected as `plan`.

A mark R covers X Y W H if R spans X Y W H.

A mark D is at X Y if D stands at X Y.

A mark D is inside a mark R if D is in R.

A mark D is tagged `homeless` if D is homeless.

```rofl
never D is homeless
draw space
```
