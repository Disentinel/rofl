---
reads:
  - ../../visual/space.rofl.md
---

# A rail network, drawn on a map

> Stations at their longitude and latitude, and the lines between them,
> drawn on a map: the geometry is the data, so nothing is laid out. A
> station no line reaches is the defect; the `never` fails on it and the map
> draws it red where it stands.

Declared as facts:

- <a id="station_at"></a>A station S stands at longitude X and latitude Y
- <a id="line"></a>A line runs from a station A to a station B

The stations:

- `paris` stands at longitude 2 and latitude 49.
- `berlin` stands at longitude 13 and latitude 52.
- `prague` stands at longitude 14 and latitude 50.
- `vienna` stands at longitude 16 and latitude 48.
- `warsaw` stands at longitude 21 and latitude 52.
- `madrid` stands at longitude -4 and latitude 40.
- `lisbon` stands at longitude -9 and latitude 39.
- `rome` stands at longitude 12 and latitude 42.

The lines:

- A line runs from `paris` to `berlin`.
- A line runs from `berlin` to `warsaw`.
- A line runs from `berlin` to `prague`.
- A line runs from `prague` to `vienna`.
- A line runs from `paris` to `madrid`.
- A line runs from `madrid` to `lisbon`.

<a id="served"></a>A station S is served either:

1. if a line runs from S to some station;
2. if a line runs from some station to S.

<a id="stranded"></a>A station S is stranded if S stands at longitude something and latitude something, unless S is served.

## The picture

The space is projected as `lonlat`.

A mark S is at X Y if S stands at longitude X and latitude Y.

A mark A links to a mark B if a line runs from A to B.

A mark S is tagged `stranded` if S is stranded.

```rofl
never S is stranded
never N dangles
draw space
```
