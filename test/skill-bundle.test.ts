// skill-bundle.test.ts — the marketplace bundle is self-contained: building
// it runs a real pair session inside the bundle (the build's own smoke), and
// the layout carries no dependency-bearing parts.

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildSkill } from '../scripts/build_skill.ts';

test('the skill bundle builds, smokes, and stays dependency-free', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-bundle-')), 'gfr');
  buildSkill(out); // throws if the in-bundle session fails

  for (const f of ['SKILL.md', 'verify.md', 'clarify.md', 'challenge.md',
    'discriminate.md', 'escalate.md', 'confirm.md', 'README.md',
    'engine/boot.rofl', 'engine/runtime/pair.ts', 'engine/src/api.ts',
    'engine/rules/inquiry/epistemic.rofl', 'engine/rules/findings.rofl',
    'engine/schemas/intent-result.json',
    'engine/examples/atlas-launch/frame.rofl']) {
    assert.ok(fs.existsSync(path.join(out, f)), `${f} present`);
  }
  assert.ok(!fs.existsSync(path.join(out, 'engine', 'scanners')),
    'the babel-dependent scanner stays out of the bundle');
  assert.ok(!fs.existsSync(path.join(out, 'engine', 'package.json')),
    'nothing to install: the bundle runs on bare Node');
});
