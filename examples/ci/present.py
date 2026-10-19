"""present.py — the CI zoo as one page: a real cascade on a time axis with its critical chain, who wakes whom,
and every mutation next to what the model said about it.

  python3 examples/ci/present.py ZOO_DIR OUT.html [ROFL_BIN]

Reads examples/ci/zoo-runs.rofl (scanners/gh_runs.py) and zoo-facts.rofl (scanners/gh_actions.py) through
the models runs.rofl and ci.rofl, runs mutate.py's mutations over ZOO_DIR, and fills zoo.html with the answers.
"""

import json
import pathlib
import subprocess
import sys

import mutate

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def ask(rofl: str, q: str, *files: str) -> list[list]:
    res = subprocess.run([rofl, "ask", "--json", q, str(ROOT / "boot.rofl"), *(str(HERE / f) for f in files)],
                         capture_output=True, text=True, timeout=110)
    out = json.loads(res.stdout)
    if not out.get("ok"):
        sys.exit(f"{q}: {out}")
    return [[json.loads(v) for v in row] for row in out["rows"]]


def main(zoo_dir: str, out: str, rofl: str) -> None:
    runs = lambda q: ask(rofl, q, "runs.rofl", "zoo-runs.rofl")
    static = lambda q: ask(rofl, q, "ci.rofl", "knowledge.rofl", "zoo-facts.rofl")
    cause = dict(runs("run_cause(R, C)"))
    end = dict(runs("run_end(R, X)"))
    times = {r: (s, e) for r, s, e in runs("run_time(R, S, E)")}
    clean, muts = mutate.results(zoo_dir, rofl)
    data = {
        "runs": [{"id": r, "repo": repo, "wf": wf, "event": ev, "start": times[r][0], "end": times[r][1],
                  "status": end[r], "cause": cause.get(r)} for r, repo, wf, ev in runs("run(R, Repo, W, Ev)")],
        "jobs": [{"id": j, "run": r, "name": n, "start": s, "end": e}
                 for (j, r, n), (_, s, e) in zip(sorted(runs("job_run(J, R, N)")), sorted(runs("job_time(J, S, E)")))],
        "crit": [j for (j,) in runs("crit_job(J)")],
        "total": runs("cascade_time(E)")[0][0],
        "queued": runs("queue_wait(R, D)"),
        "held": runs("held_by(R, R2)"),
        "polled": runs("polled(J, R)"),
        "steps": runs("crit_step(J, Step, D)"),
        "fires": static("fires(W1, W2, T)"),
        "drops": static("queue_drops(W, W1)"),
        "clean": clean,
        "mutations": [{"name": name, "edits": [{"file": f, "old": o, "new": n} for f, o, n in edits],
                       "added": added, "gone": gone, "ok": ok} for name, edits, added, gone, ok in muts],
    }
    page = (HERE / "zoo.html").read_text().replace("/*DATA*/null", json.dumps(data, ensure_ascii=False))
    pathlib.Path(out).write_text(page)
    print(f"wrote {out}: {len(data['runs'])} runs, {len(data['jobs'])} jobs, {len(muts)} mutations")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else str(ROOT / "rust/target/release/rofl"))
