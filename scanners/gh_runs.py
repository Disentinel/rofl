"""gh_runs.py — what GitHub Actions actually did: runs, their jobs and steps, and which run started which.

  python3 scanners/gh_runs.py OWNER/REPO ... [--since ISO] > runs.rofl
  scanner(gh, "python3 scanners/gh_runs.py").  scan_request(gh, "OWNER/REPO").   the same, run by a world

A SCAN NAMES ITS CODE AND ITS SOURCES (docs/cli.md): it prints `-- code:` for each file of its code and, for each
repository, `-- source: https://api.github.com/repos/OWNER/REPO/actions/runs TOKEN`, the token a sum of each
listed run's id and updated_at, so it moves when a run starts, changes or ends. With ROFL_SCAN_CHECK=1 it prints
only those source lines: one request a repository (the run list), where a scan makes one more for each run's jobs.

Reads the Actions API through `gh api`. A run says what started it in its name: the zoo's workflows set
`run-name` to the event and the cause (`repo/run_id` of the run that dispatched it, or the id of the run
a workflow_run follows), and the scanner turns that into run_cause. Times are seconds after the earliest
run read, so a cascade starts at 0.

  run(Run, Repo, Workflow, Event)           run_time(Run, Start, End)      run_end(Run, Conclusion)
  run_cause(Run, Cause)                     the run whose end or dispatch started this one
  job_run(Job, Run, Name)                   job_time(Job, Start, End)      job_end(Job, Conclusion)
  step_time(Job, Index, Name, Start, End)   step_end(Job, Index, Conclusion)
"""

import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys

from gh_actions import fact, facts
from own_code import code_lines

API = "https://api.github.com/repos"


def api(path: str) -> dict:
    return json.loads(subprocess.run(["gh", "api", path], capture_output=True, text=True, check=True).stdout)


def stamp(t: str | None) -> float | None:
    return datetime.datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp() if t else None


def token(listed: list[dict]) -> str:
    """The version of a repository's run list: its runs' ids and when each last changed."""
    return hashlib.sha256("".join(f"{r['id']}:{r['updated_at']}\n" for r in listed).encode()).hexdigest()[:16]


def main(args: list[str]) -> None:
    since = None
    if "--since" in args:
        i = args.index("--since")
        since, args = stamp(args[i + 1]), args[:i] + args[i + 2:]
    lists = {full: api(f"repos/{full}/actions/runs?per_page=50")["workflow_runs"] for full in args}
    sources = [f"-- source: {API}/{full}/actions/runs {token(listed)}" for full, listed in lists.items()]
    if os.environ.get("ROFL_SCAN_CHECK"):
        print("\n".join(sources))
        return
    runs = []
    for full, listed in lists.items():
        for r in listed:
            if since is None or stamp(r["created_at"]) >= since:
                r["jobs"] = api(f"repos/{full}/actions/runs/{r['id']}/jobs?per_page=100")["jobs"]
                runs.append(r)
    t0 = min((stamp(r["run_started_at"]) for r in runs), default=0)
    rel = lambda t: round(stamp(t) - t0) if t else -1
    by_id = {str(r["id"]): r for r in runs}
    # how to write it again, which a file of these facts is checked through (ROFL_SCAN_CHECK=1)
    again = " ".join(["python3", str(pathlib.Path(__file__).resolve()), *sys.argv[1:]])
    print("\n".join(code_lines("gh") + [f"-- again: {again}"] + sources))
    print(f"-- runs read by scanners/gh_runs.py from {', '.join(args)}")
    for r in sorted(runs, key=lambda r: r["run_started_at"]):
        run, repo = str(r["id"]), r["repository"]["name"]
        fact("run", run, repo, f"{repo}/{pathlib.Path(r['path']).stem}", r["event"])
        ends = [j["completed_at"] for j in r["jobs"] if j["completed_at"]]
        fact("run_time", run, rel(r["run_started_at"]), rel(max(ends)) if ends else -1)
        fact("run_end", run, r["conclusion"] or r["status"])
        cause = r["display_title"].split(" ")[-1].split("/")[-1]
        if cause in by_id and cause != run:
            fact("run_cause", run, cause)
        for j in r["jobs"]:
            job = str(j["id"])
            fact("job_run", job, run, j["name"])
            fact("job_time", job, rel(j["started_at"]), rel(j["completed_at"]))
            fact("job_end", job, j["conclusion"] or j["status"])
            for s in j.get("steps") or []:
                fact("step_time", job, s["number"], s["name"], rel(s["started_at"]), rel(s["completed_at"]))
                fact("step_end", job, s["number"], s["conclusion"] or s["status"])
    print("\n".join(facts))


if __name__ == "__main__":
    main(sys.argv[1:])
