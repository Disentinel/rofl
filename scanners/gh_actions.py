"""gh_actions.py — GitHub Actions workflows become facts about what each job does.

  python3 scanners/gh_actions.py REPO_DIR ... > ci.rofl

A repository is named by its directory's base name; `owner/name` in a workflow
names the scanned repository of that base name. A job that calls a reusable
workflow of its repository, and a step that uses a composite action of it, are
read with their inputs put in: what the callee does, the caller does. A matrix
job is one job per combination, `#job[value,...]`. Steps whose `if:` compares
a matrix value are kept or dropped; any other `if:` is a guard, kept as text.

  ci_repo(R)                         ci_workflow(W, R, Name)
  ci_on(W, Event, Type)              ci_paths(W, Glob)
  ci_job(J, W)                       ci_needs(J, J2)          ci_job_if(J, Text)
  ci_status_if(J)                    the job's `if:` asks how its needs ended, so a skipped one does not skip it
  ci_env(J, Env)                     ci_step(S, J, Index)     ci_guard(S, Text)
  ci_uploads(S, Artifact)            ci_downloads(S, Artifact, From)   From: run | triggering_run
  ci_holds(S, File)                  a file the step makes or puts in an artifact
  ci_releases(S, Repo, Prefix, Draft)          ci_undrafts(S, Repo, Prefix)
  ci_fetches(S, Repo, Tag, Pattern)            Tag: payload | latest | output | literal
  ci_tries(S, Attempts, DelaySeconds)          a step that asks again until it gets an answer
  ci_retries(S, Attempts, Command)             a step whose command is run again when it fails
  ci_tool(Command, Tool)
  ci_sleeps(S, Seconds)              ci_dispatches(S, Repo, Type)
  ci_matches(Pattern, Name)          a fetched or downloaded pattern a held file or an artifact's name answers
"""

import fnmatch
import itertools
import pathlib
import re
import sys

import yaml


def q(s) -> str:
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


facts: list[str] = []
patterns: set[str] = set()
held: set[str] = set()


def fact(rel: str, *args) -> None:
    facts.append(f"{rel}({', '.join(str(a) if isinstance(a, int) else q(a) for a in args)}).")


def sub(text, env: dict) -> str:
    if not isinstance(text, str):
        return text
    def one(m):
        expr = m.group(1).strip()
        return str(env[expr]) if expr in env else m.group(0)
    return re.sub(r"\$\{\{\s*(.*?)\s*\}\}", one, text)


def tag_kind(tag: str) -> str:
    if tag in ("", "latest"):
        return "latest"
    if "client_payload" in tag:
        return "payload_or_latest" if "latest" in tag else "payload"
    if "needs." in tag or "steps." in tag:
        return "output"
    return "literal"


def pack_name(pkg_dir: pathlib.Path) -> str | None:
    pj = pkg_dir / "package.json"
    if not pj.exists():
        return None
    import json
    name = json.loads(pj.read_text())["name"]
    return name.lstrip("@").replace("/", "-") + "-*.tgz"


def script_of(root: pathlib.Path, cwd: str, cmd: str) -> str:
    m = re.fullmatch(r"npm run (\S+)", cmd.strip())
    pj = root / cwd / "package.json"
    if m and pj.exists():
        import json
        return json.loads(pj.read_text()).get("scripts", {}).get(m.group(1), cmd)
    return cmd.strip()


class Repo:
    def __init__(self, root: pathlib.Path, owner_map: dict):
        self.root, self.name, self.owner_map = root, root.name, owner_map
        self.workflows = {p.name: yaml.load(p.read_text(), Loader=yaml.BaseLoader) for p in sorted((root / ".github/workflows").glob("*.yml"))}

    def repo(self, full: str) -> str:
        full = full.strip()
        return self.owner_map.get(full.split("/")[-1], full)

    def scan(self) -> None:
        fact("ci_repo", self.name)
        for file, wf in self.workflows.items():
            w = f"{self.name}/{file[:-4]}"
            fact("ci_workflow", w, self.name, wf.get("name", file))
            on = wf.get("on", {})
            on = {on: {}} if isinstance(on, str) else on
            for event, spec in on.items():
                spec = spec or {}
                types = spec.get("types") if event == "repository_dispatch" else spec.get("workflows") if event == "workflow_run" else spec.get("branches")
                for t in types or [""]:
                    fact("ci_on", w, event, t)
                for g in spec.get("paths", []) if isinstance(spec, dict) else []:
                    fact("ci_paths", w, g)
            if "workflow_call" in on:
                continue
            self.names = {jid: self.combos(job) for jid, job in wf.get("jobs", {}).items()}
            for jid, job in wf.get("jobs", {}).items():
                self.job(w, jid, job)

    @staticmethod
    def combos(job: dict) -> list[dict]:
        matrix = (job.get("strategy") or {}).get("matrix") or {}
        keys = [k for k in matrix if isinstance(matrix[k], list)]
        return [dict(zip(keys, vals)) for vals in itertools.product(*(matrix[k] for k in keys))] or [{}]

    @staticmethod
    def jname(w: str, jid: str, combo: dict) -> str:
        return f"{w}#{jid}" + (f"[{','.join(combo.values())}]" if combo else "")

    def job(self, w: str, jid: str, job: dict) -> None:
        combos = self.names[jid]
        needs = job.get("needs", [])
        needs = [needs] if isinstance(needs, str) else needs
        for combo in combos:
            j = self.jname(w, jid, combo)
            env = {f"matrix.{k}": v for k, v in combo.items()}
            fact("ci_job", j, w)
            for n in needs:
                for c in self.names[n]:
                    fact("ci_needs", j, self.jname(w, n, c))
            if "if" in job:
                fact("ci_job_if", j, job["if"])
                if re.search(r"\b(success|failure|always|cancelled)\(\)", str(job["if"])):
                    fact("ci_status_if", j)
            uses = job.get("uses")
            if uses and uses.startswith("./"):
                callee = self.workflows[pathlib.Path(uses).name]
                inputs = {f"inputs.{k}": sub(v, env) for k, v in (job.get("with") or {}).items()}
                for k, spec in callee["on"]["workflow_call"].get("inputs", {}).items():
                    inputs.setdefault(f"inputs.{k}", spec.get("default", ""))
                for inner in callee.get("jobs", {}).values():
                    self.steps(j, inner, inputs)
            else:
                self.steps(j, job, env)

    def steps(self, j: str, job: dict, env: dict) -> None:
        if job.get("environment"):
            fact("ci_env", j, sub(job["environment"], env))
        start = sum(1 for f in facts if f.startswith("ci_step(") and f'"{j}"' in f)
        for i, step in enumerate(job.get("steps", []), start):
            cond = step.get("if")
            m = re.fullmatch(r"\s*matrix\.(\w+)\s*==\s*'([^']*)'\s*", cond or "")
            if m and env.get(f"matrix.{m.group(1)}", m.group(2)) != m.group(2):
                continue
            c = None if cond is None or m else env.get(cond.strip(), sub(cond, env))
            if c == "false":
                continue
            s = f"{j}/{i}"
            fact("ci_step", s, j, i)
            if c not in (None, "true"):
                fact("ci_guard", s, c)
            self.step(s, step, env)

    def step(self, s: str, step: dict, env: dict) -> None:
        uses, w = step.get("uses", ""), {k: sub(v, env) for k, v in (step.get("with") or {}).items()}
        if uses.startswith("./.github/actions/"):
            action = yaml.load((self.root / uses / "action.yml").read_text(), Loader=yaml.BaseLoader)
            inputs = {f"inputs.{k}": spec.get("default", "") for k, spec in (action.get("inputs") or {}).items()}
            inputs.update({f"inputs.{k}": v for k, v in w.items()})
            for inner in action["runs"]["steps"]:
                self.step(s, inner, {**env, **inputs})
            return
        name = uses.split("@")[0]
        if name == "actions/upload-artifact":
            fact("ci_uploads", s, w["name"])
            held.add(w["name"])
            for p in w.get("path", "").split():
                if "*" not in p:
                    self.hold(s, pathlib.Path(p).name)
        elif name == "actions/download-artifact":
            fact("ci_downloads", s, w.get("name") or w.get("pattern"), "triggering_run" if "run-id" in w else "run")
            patterns.add(w.get("name") or w.get("pattern"))
        elif name == "softprops/action-gh-release":
            fact("ci_releases", s, self.name, re.sub(r"\$\{\{.*?\}\}", "", w["tag_name"]), "draft" if w.get("draft") == "true" else "public")
        elif name == "peter-evans/repository-dispatch":
            fact("ci_dispatches", s, self.repo(w["repository"]), w["event-type"])
        run = sub(sub(step.get("run", ""), env), {"github.repository": self.name})
        if run:
            self.run(s, run, sub(step.get("working-directory", "."), env))

    def run(self, s: str, run: str, cwd: str) -> None:
        loop = re.search(r"for \w+ in \$\(seq 1 (\d+)\)", run)
        pause = [int(x) for x in re.findall(r"\bsleep (\d+)", run)]
        if loop and "bash -c" in run:
            cmd = re.search(r"bash -c '([^']*)'", run).group(1)
            real = script_of(self.root, cwd, cmd)
            fact("ci_retries", s, int(loop.group(1)), real)
            fact("ci_tool", real, " ".join(real.split()[:2]))
        elif loop:
            fact("ci_tries", s, int(loop.group(1)), pause[-1] if pause else 0)
        elif pause:
            fact("ci_sleeps", s, pause[0])
        for m in re.finditer(r"gh release (download)\s+(\S+)?[^\n]*?-R\s+\"?([\w./${}-]+)\"?(?:[^\n]*?-p\s+\"?([^\s\"]+)\"?)?", run):
            tag = m.group(2) if m.group(2) and not m.group(2).startswith("-") else "latest"
            var = re.fullmatch(r'"?\$(\w+)"?', tag)
            if var:
                a = re.search(rf'\b{var.group(1)}=("([^"]*)"|\$\(gh release view)', run)
                tag = "latest" if a and a.group(2) is None else a.group(2) if a else tag
            pat = m.group(4) or "*"
            fact("ci_fetches", s, self.repo(m.group(3)), tag_kind(tag), pat)
            patterns.add(pat)
        flat = re.sub(r"\$\{\{.*?\}\}", "", run)
        for m in re.finditer(r"gh release edit (\S+) -R (\S+) --draft=false", flat):
            fact("ci_undrafts", s, self.repo(m.group(2)), m.group(1))
        if "npm pack" in run:
            cd = re.search(r"\bcd (\S+) &&[^\n]*npm pack", run)
            f = pack_name(self.root / cwd / (cd.group(1) if cd else "."))
            if f:
                self.hold(s, f)
        for m in re.finditer(r"tar czf (\S+)", run):
            self.hold(s, m.group(1))

    def hold(self, s: str, f: str) -> None:
        fact("ci_holds", s, f)
        held.add(f)


def main(dirs: list[str]) -> None:
    roots = [pathlib.Path(d).resolve() for d in dirs]
    owner_map = {r.name: r.name for r in roots}
    for r in roots:
        Repo(r, owner_map).scan()
    for p in sorted(patterns):
        for h in sorted(held):
            if fnmatch.fnmatch(h.replace("*", "1.0.0"), p):
                fact("ci_matches", p, h)
    print("-- facts read by scanners/gh_actions.py from " + ", ".join(r.name for r in roots))
    print("\n".join(facts))


if __name__ == "__main__":
    main(sys.argv[1:])
