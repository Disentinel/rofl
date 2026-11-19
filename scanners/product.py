#!/usr/bin/env python3
"""What models/product/rofl.rofl reads of the tree that no book of facts holds yet, as facts on stdout.
    product.py entries ENGINE.json    the entries: of the engine (the answers of models/engine/features.rofl to
                                      entry_kind(D,N,K) and cp_effect(P,K), of models/engine/gates.rofl to
                                      unsourced(N,T), --json), of the library (facts/feature-map.rofl), of the
                                      editor extension (vscode/package.json)
    product.py names ASKED.json       which view names which entry: the answers to reads(U,V) and entry(F,K,W)
    product.py asks | report ANSWERS  the questions of the holes as flags of `rofl load`, and their answers in lines"""
import json, pathlib, re, sys

def answers(path):
    for line in open(path):
        if line.startswith('{'):
            a = json.loads(line)
            if not a.get('ok', True): sys.exit(a['error'])
            yield [[c.strip('"') for c in r] for r in a['rows']]

q = lambda s: '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

def entries(engine):
    out = ['edb(engine_entry).', 'edb(library_entry).', 'edb(extension_entry).', 'edb(codepath_effect).', 'edb(unsourced_gate).']
    kinds, effects, gates = answers(engine)
    out += [f'engine_entry({k}, {q(n)}).' for _, n, k in kinds if n]
    out += [f'codepath_effect({p}, {k}).' for p, k in effects]
    out += [f'unsourced_gate({q(n)}, {t}).' for n, t in gates]
    for kind, name in re.findall(r'^feature\("(api|flag):([^"]+)"', open('facts/feature-map.rofl').read(), re.M):
        out.append(f'library_entry({"api" if kind == "api" else "knob"}, {q(name)}).')
    ext = json.load(open('vscode/package.json'))['contributes']
    out += [f'extension_entry(command, {q(c["title"])}).' for c in ext.get('commands', [])]
    conf = ext.get('configuration', {})
    for c in conf if isinstance(conf, list) else [conf]:
        out += [f'extension_entry(knob, {q(k)}).' for k in c.get('properties', {})]
    return out

# how an entry of a kind is written in a document; a kind not here is not looked for
SPELT = {
    ('cli', 'verb'): lambda w: rf'\brofl {re.escape(w)}\b',
    ('cli', 'flag'): lambda w: rf'(?<![\w-]){re.escape(w)}(?![\w-])',
    ('cli', 'op'): lambda w: rf'`{re.escape(w)}`|"op": ?"{re.escape(w)}"',
    ('cli', 'cell'): lambda w: rf'`{re.escape(w)} ',
    ('extension', 'cell'): lambda w: rf'`{re.escape(w)} ',
    ('web', 'cell'): lambda w: rf'`{re.escape(w)} ',
    ('cli', 'env'): lambda w: rf'\b{re.escape(w)}\b',
    ('tree', 'env'): lambda w: rf'\b{re.escape(w)}\b',
    ('tree', 'command'): lambda w: rf'\bnpm (run )?{re.escape(w)}(?![\w:-])',
    ('library', 'api'): lambda w: rf'\b{re.escape(w)}\(',
    ('library', 'knob'): lambda w: rf'\b{re.escape(w)}\b',
    ('extension', 'command'): lambda w: re.escape(w),
    ('extension', 'knob'): lambda w: re.escape(w),
}

def text(view):
    p = pathlib.Path(view)
    return '\n'.join(f.read_text() for f in sorted(p.rglob('*.md'))) if p.is_dir() else p.read_text()

def names(asked):
    reads, entry = answers(asked)
    views = sorted({v for _, v in reads} | {'docs/knobs.md'})
    out = ['edb(named).', 'edb(spelt).'] + [f'spelt({f}, {k}).' for f, k in SPELT]
    for v in views:
        t = text(v)
        out += [f'named({q(v)}, {f}, {k}, {q(w)}).' for f, k, w in entry if (f, k) in SPELT and re.search(SPELT[f, k](w), t)]
    return out

# the holes: the question, and what an answer to it says
HOLES = [
    ('no_entry(F)', 'a feature no entry offers'),
    ('not_for(F,U)', 'a feature that does not reach a user of the goal'),
    ('unplaced(Form,K,W)', 'an entry the goal is silent about: it offers no feature and no inventory of knobs names it'),
    ('unfound(Form,K,W,U)', 'an entry its user cannot find in what they read'),
    ('no_target(M)', 'a metric with no target'),
    ('small_only(M,O)', 'a target measured only below its world scale'),
    ('missed(M,O,V,T)', 'a target missed at its world scale: measured, aimed'),
    ('unbacked(C)', 'a contract no evidence backs'),
    ('engine_explodes(A,B,Fw,Ft)', 'the engine explodes where the rules do not: the explode factor of the work, of the seconds'),
    ('red(I,A,B)', 'an invariant of the owner broken and not accepted'),
    ('owed(I,N)', 'a red invariant no item of the worklist closes: the work it makes, and its red rows'),
]

def asks(_):
    return [' '.join(f"--ask {a}" for a, _ in HOLES)]

def report(path):
    out = []
    for (ask, says), rows in zip(HOLES, answers(path)):
        out.append(f'{len(rows):4}  {says}')
        groups = {}
        for r in rows: groups.setdefault(' '.join(r[:2]) if len(r) > 2 else '', []).append(' '.join(r[2:]) if len(r) > 2 else ' '.join(r))
        out += [f'        {k + ": " if k else ""}{", ".join(sorted(v))}' for k, v in sorted(groups.items())]
    return out

print('\n'.join({'entries': entries, 'names': names, 'asks': asks, 'report': report}[sys.argv[1]](sys.argv[2] if len(sys.argv) > 2 else None)))
