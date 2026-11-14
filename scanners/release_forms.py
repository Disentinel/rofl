#!/usr/bin/env python3
"""The forms the product is released in and the versions each holds, as facts: tags from the remote, npm from the
registry, the extension from the VS Code Marketplace and Open VSX, GitHub releases by `gh` where it is signed in.
    python3 scanners/release_forms.py > .cache/product/forms.rofl"""
import json, re, subprocess, sys, urllib.error, urllib.request

PLATFORMS = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64']
EXT = json.load(open('vscode/package.json'))
EXT_ID = f"{EXT['publisher']}.{EXT['name']}"

def get(url, body=None, headers={}):
    req = urllib.request.Request(url, data=body and json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404: return {}
        print(f'-- {url}: {e}', file=sys.stderr); return None
    except Exception as e:
        print(f'-- {url}: {e}', file=sys.stderr); return None

out = ['edb(tagged).', 'edb(published).', 'edb(asked).']
tags = subprocess.run(['git', 'ls-remote', '--tags', '--refs', 'origin', 'rofl-nb-*'], capture_output=True, text=True).stdout
vs = sorted({m.group(1) for m in re.finditer(r'rofl-nb-(\d+\.\d+\.\d+)$', tags, re.M)}, key=lambda v: [int(x) for x in v.split('.')])
out += [f'tagged("{v}", {i}).' for i, v in enumerate(vs)]

def pub(form, piece, versions):
    out.append(f'asked({form}).')
    out.extend(f'published({form}, "{piece}", "{v}").' for v in sorted(versions))

for p in ['@grafema/rofl'] + [f'@grafema/rofl-{x}' for x in PLATFORMS]:
    d = get('https://registry.npmjs.org/' + p)
    if d is not None: pub('npm', p, [v for v in d.get('versions', {}) if re.fullmatch(r'\d+\.\d+\.\d+', v)])

d = get('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',
        {'filters': [{'criteria': [{'filterType': 7, 'value': EXT_ID}]}], 'flags': 1},
        {'Content-Type': 'application/json', 'Accept': 'application/json;api-version=7.2-preview.1'})
if d is not None:
    out.append('asked(marketplace).')
    for e in d['results'][0]['extensions']:
        for v in e['versions']: out.append(f'published(marketplace, "{v.get("targetPlatform", "universal")}", "{v["version"]}").')

d = get(f"https://open-vsx.org/api/{EXT['publisher']}/{EXT['name']}")
if d is not None: pub('open_vsx', 'universal', d.get('allVersions', {}).keys() - {'latest'})

r = subprocess.run(['gh', 'release', 'list', '--limit', '200', '--json', 'tagName'], capture_output=True, text=True)
if r.returncode == 0:
    pub('github', 'release', [m.group(1) for x in json.loads(r.stdout) if (m := re.fullmatch(r'rofl-nb-(\d+\.\d+\.\d+)', x['tagName']))])
else: print('-- gh release list: ' + r.stderr.strip()[:200], file=sys.stderr)
print('\n'.join(sorted(set(out), key=out.index)))
