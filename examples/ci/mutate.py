"""mutate.py — break the zoo's CI one way at a time and see what the model says.

  python3 examples/ci/mutate.py ZOO_DIR [ROFL_BIN]

ZOO_DIR holds the four repositories (ci-zoo-platform, -backend, -web, -deploy).
Each mutation is one text edit; the zoo is copied, edited, scanned, and the
model's problems are compared with the clean zoo's: what appeared, what went.
A mutation passes when exactly the problems it names appeared or went.
"""

import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
REPOS = ["ci-zoo-platform", "ci-zoo-backend", "ci-zoo-web", "ci-zoo-deploy"]

# (name, [(file, old, new)], appears, goes)
MUTATIONS = [
    ("artifact renamed on upload",
     [("ci-zoo-backend/.github/workflows/ci.yml", "with: { name: utils-tgz, path: pkgs/*.tgz }", "with: { name: utils-pkg, path: pkgs/*.tgz }")],
     {"orphan_download"}, set()),
    ("contract dispatch without its check",
     [("ci-zoo-backend/.github/workflows/contract.yml", "      - if: steps.diff.outputs.same == 'false'\n        uses: peter-evans", "      - uses: peter-evans")],
     {"endless_ring"}, set()),
    ("notify before the release is seen",
     [("ci-zoo-platform/.github/workflows/packages.yml", "    needs: index\n", "    needs: publish\n")],
     {"told_early"}, set()),
    ("notify early and backend asks only twice",
     [("ci-zoo-platform/.github/workflows/packages.yml", "    needs: index\n", "    needs: publish\n"),
      ("ci-zoo-backend/.github/actions/fetch-package/action.yml", "attempts: { required: false, default: '5' }", "attempts: { required: false, default: '2' }")],
     {"told_early", "gives_up_early"}, set()),
    ("production auth right after the gate",
     [("ci-zoo-deploy/.github/workflows/rollout.yml", "  prod-auth:\n    needs: [gate, staging-web]", "  prod-auth:\n    needs: gate")],
     {"skips_stage"}, set()),
    ("web asks for a package nobody makes",
     [("ci-zoo-web/.github/workflows/web.yml", "pattern: zoo-*.tgz", "pattern: zoo-client-*.tgz")],
     {"orphan_fetch"}, set()),
    ("web no longer told about new packages",
     [("ci-zoo-web/.github/workflows/web.yml", "  repository_dispatch:\n    types: [packages-published]\n", "")],
     {"stale_consumer"}, set()),
    ("billing does not wait for the build",
     [("ci-zoo-backend/.github/workflows/ci.yml", "    needs: [utils, build]", "    needs: [utils]")],
     {"artifact_race"}, set()),
    ("lint without the retry",
     [("ci-zoo-web/.github/workflows/web.yml", "      - uses: ./.github/actions/retry\n        with: { run: npm run lint }", "      - run: npm run lint")],
     set(), {"useless_retry"}),
    ("publish without its status check",
     [("ci-zoo-platform/.github/workflows/packages.yml", "  publish:\n    if: ${{ !failure() && !cancelled() }}\n", "  publish:\n")],
     {"skipped_by_ancestor"}, set()),
]


def problems(zoo: pathlib.Path, rofl: str) -> set[tuple[str, ...]]:
    facts = zoo / "facts.rofl"
    with open(facts, "w") as out:
        subprocess.run([sys.executable, str(ROOT / "scanners/gh_actions.py"), *(str(zoo / r) for r in REPOS)],
                       stdout=out, check=True)
    res = subprocess.run([rofl, "ask", "problem(K, W, X)", str(ROOT / "boot.rofl"), str(HERE / "ci.rofl"),
                          str(HERE / "knowledge.rofl"), str(facts)], capture_output=True, text=True, timeout=110)
    if res.returncode != 0:
        sys.exit(f"rofl failed ({res.returncode}): {res.stderr or res.stdout}")
    rows = set()
    for line in res.stdout.splitlines():
        if line.startswith("K = "):
            parts = dict(p.split(" = ", 1) for p in line.split(", ", 2))
            rows.add((parts["K"], parts["W"], parts.get("X", "")))
    return rows


def main(zoo_dir: str, rofl: str) -> None:
    src = pathlib.Path(zoo_dir)
    with tempfile.TemporaryDirectory() as tmp:
        clean_dir = pathlib.Path(tmp) / "clean"
        for r in REPOS:
            shutil.copytree(src / r, clean_dir / r, ignore=shutil.ignore_patterns(".git"))
        clean = problems(clean_dir, rofl)
        print("clean zoo:")
        for p in sorted(clean):
            print("  ", *p)
        failed = 0
        for name, edits, appears, goes in MUTATIONS:
            d = pathlib.Path(tmp) / "m"
            shutil.rmtree(d, ignore_errors=True)
            shutil.copytree(clean_dir, d)
            for f, old, new in edits:
                text = (d / f).read_text()
                if text.count(old) != 1:
                    sys.exit(f"{name}: edit not found once in {f}")
                (d / f).write_text(text.replace(old, new))
            got = problems(d, rofl)
            new_rows, gone_rows = got - clean, clean - got
            ok = {r[0] for r in new_rows} == appears and {r[0] for r in gone_rows} == goes
            failed += not ok
            print(f"\n{'ok  ' if ok else 'FAIL'} {name}")
            for r in sorted(new_rows):
                print("   +", *r)
            for r in sorted(gone_rows):
                print("   -", *r)
        print(f"\n{len(MUTATIONS) - failed} of {len(MUTATIONS)} mutations seen as expected")
        sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else str(ROOT / "rust/target/release/rofl"))
