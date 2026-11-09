# Cognitive Tours — the audit that is lookup

[Cognitive Tours](https://github.com/margaretstorey/cognitive-tours)
(Storey, [arXiv 2611.08456](https://arxiv.org/abs/2611.08456)) is a map of a
project that people write themselves: typed waypoints (goals, needs, ADRs,
code, tests, risks, open questions), edges with free-text labels between
them, and tours, ordered paths through the waypoints with a bridge narrative
from each stop to the next. Its Claude Code skills `audit-tours` and
`audit-waypoints` look for drift between the map and the code, and never write
to the map: the author decides and writes.

Part of what those skills look for is judgment: a bridge that does not
bridge, a description that no longer matches its file. That stays with the
model and the author. The rest is lookup, and a lookup should give the same
answer every run and say why. That part is `cognitive-tours.rofl`, about
fifteen rules.

## The files

- `scan.py` turns a map (the site's `/api/data`, or one of the repo's
  `backups/*.json`), a checkout and a date into facts: what the map says,
  which anchored files exist, what git says changed since the date, and the
  first word of each `docs/adr/*.md` Status line. No judgment in it.
- `map.rofl` is that, run once over `backups/demo-canonical.json` and the repo
  at `1427b14`, coverage since 2026-10-20. It is a snapshot of the demo map,
  not of the live site, so its coverage findings say as much about the
  snapshot's age as about the map.
- `cognitive-tours.rofl` is the rules. Each says which part of the skills it
  stands for.

## What it finds in the demo map

- `dead_anchor`: the waypoint "Import Markdown Tours into Graph" is anchored
  to `cognitive-tours-skill.md`, deleted in `73d0eed`.
- `unverified`: one waypoint still says it was written by Claude.
- `orphan`: fifteen waypoints with no edge and in no tour.
- `no_waypoint`: files changed since the date that no waypoint is anchored to,
  among them the five SKILL.md files of the skills themselves.
- Nothing for `redundant_edge`, `missing_stop`, `wrong_place`,
  `silent_stop`, `adr_status_drift` or `adr_unmapped`.

Not a rule, but read off the facts: the edge labels drift ("implemented by",
"implemented in", "implements" the other way round, "addressed by" and
"address by"). `redundant_edge` reads labels as they are spelled, so the
drift hides redundancy from it. Typing the edges, an open question in the
paper, would fix that at the source.

## Run it

    node --experimental-strip-types src/repl.ts \
      examples/cognitive-tours/map.rofl examples/cognitive-tours/cognitive-tours.rofl

then `? dead_anchor[audit](W, F)`, `why dead_anchor[audit]("w-1780409255110", "cognitive-tours-skill.md")`,
or `whynot adr_unmapped[audit]("docs/adr/008-one-site-per-team.md")`
(it is not unmapped: a waypoint is anchored to it).

On your own map:

    curl -sS <site>/api/data > map.json
    python3 examples/cognitive-tours/scan.py map.json <checkout> 2026-10-20 > my-map.rofl

and load `my-map.rofl` in place of `map.rofl`.
