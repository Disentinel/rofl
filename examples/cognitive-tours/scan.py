#!/usr/bin/env python3
"""Cognitive Tours map + repo -> ROFL facts.

usage: scan.py MAP.json REPO SINCE > map-facts.rofl

MAP.json is a Cognitive Tours map as its /api/data endpoint serves it (or one of
the repo's backups/*.json). REPO is a checkout of the code the map describes.
SINCE (YYYY-MM-DD) bounds the git history read for coverage.

Everything here is lookup, none of it judgment: what the map says, which files
exist, which files git says changed, what each ADR's Status line says. The
rules in cognitive-tours.rofl decide what is wrong with that.
"""
import json, os, re, subprocess, sys

def q(s):
    return json.dumps(s if s is not None else "", ensure_ascii=False)

def anchor(path):
    p = (path or "").strip().removeprefix("./")
    return p if p and not p.startswith(("http://", "https://")) else None

def main(map_file, repo, since):
    d = json.load(open(map_file))
    out = []
    for w in d["waypoints"]:
        wid = q(w["id"])
        out.append(f"waypoint({wid}, {q(w['label'])}).")
        out.append(f"wtype({wid}, {q(w['type'])}).")
        fp = anchor(w.get("filePath"))
        if fp:
            out.append(f"anchored({wid}, {q(fp)}).")
            if os.path.exists(os.path.join(repo, fp)):
                out.append(f"file_exists({q(fp)}).")
        text = ((w.get("description") or "") + (w.get("notes") or "")).lower()
        if "drafted by claude" in text or "written by claude" in text:
            out.append(f"drafted({wid}).")
        if w["label"].strip().lower().startswith("(deferred)"):
            out.append(f"map_status({wid}, deferred).")
    for e in d["edges"]:
        out.append(f"edge({q(e['source'])}, {q((e.get('label') or '').strip())}, {q(e['target'])}).")
    labels = {w["id"]: w["label"] for w in d["waypoints"]}
    for t in d["tours"]:
        tid = q(t["id"])
        out.append(f"tour({tid}, {q(t['name'])}).")
        for i, s in enumerate(t["stops"], 1):
            out.append(f"stop({tid}, {i}, {q(s['waypointId'])}).")
            n = (s.get("narrative") or "").lower()
            if n.strip():
                out.append(f"narrative({tid}, {i}).")
            # a bridge that names another waypoint by its label, verbatim
            for wid, lab in labels.items():
                if wid != s["waypointId"] and len(lab) > 4 and lab.lower() in n:
                    out.append(f"bridge_mentions({tid}, {i}, {q(wid)}).")
    adr = os.path.join(repo, "docs", "adr")
    if os.path.isdir(adr):
        for f in sorted(os.listdir(adr)):
            m = re.search(r"^\*\*Status:?\*\*:?\s*(\w+)", open(os.path.join(adr, f)).read(), re.M)
            if m:
                out.append(f"adr_doc({q('docs/adr/' + f)}, {m.group(1).lower()}).")
    log = subprocess.run(["git", "-C", repo, "log", f"--since={since} 00:00", "--name-only", "--format="],
                         capture_output=True, text=True, check=True).stdout.split()
    for f in sorted(set(log)):
        if f.startswith(("app/", "prisma/schema", "scripts/", "tests/", "plugins/")) \
                and "generated" not in f and os.path.exists(os.path.join(repo, f)):
            out.append(f"changed_since({q(f)}).")
    print("\n".join(out))

if __name__ == "__main__":
    main(*sys.argv[1:4])
