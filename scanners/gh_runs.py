"""gh_runs.py — what GitHub Actions actually did: runs, their jobs and steps, and which run started which.

  python3 scanners/gh_runs.py OWNER/REPO ... [--since ISO] > runs.rofl

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
import json
import pathlib
import subprocess
import sys

from gh_actions import fact, facts


def api(path: str) -> dict:
    return json.loads(subprocess.run(["gh", "api", path], capture_output=True, text=True, check=True).stdout)


def stamp(t: str | None) -> float | None:
    return datetime.datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp() if t else None


def main(args: list[str]) -> None:
    since = None
    if "--since" in args:
        i = args.index("--since")
        since, args = stamp(args[i + 1]), args[:i] + args[i + 2:]
    runs = []
    for full in args:
        for r in api(f"repos/{full}/actions/runs?per_page=50")["workflow_runs"]:
            if since is None or stamp(r["created_at"]) >= since:
                r["jobs"] = api(f"repos/{full}/actions/runs/{r['id']}/jobs?per_page=100")["jobs"]
                runs.append(r)
    t0 = min((stamp(r["run_started_at"]) for r in runs), default=0)
    rel = lambda t: round(stamp(t) - t0) if t else -1
    by_id = {str(r["id"]): r for r in runs}
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
