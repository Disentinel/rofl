// skill-bundle.test.ts — the marketplace bundle is self-contained: building
// it runs a real pair session inside the bundle (the build's own smoke), and
// the layout carries no dependency-bearing parts.

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildSkill } from '../scripts/build_skill.ts';

const ROOT_SKILL = path.join(path.dirname(new URL(import.meta.url).pathname),
  '..', 'skills', 'guided-formal-reasoning');

test('the skill bundle builds, smokes, and stays dependency-free', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-bundle-')), 'gfr');
  buildSkill(out); // throws if the in-bundle session fails

  // THE PAGE LIST IS DERIVED, NOT TYPED. It was typed until 2026-09-09 and by
  // then it was two pages behind the directory — `normalise.md` and
  // `instruments.md` are copied by `copyDir`'s `.md` filter and nothing here
  // said so, so a change from that filter to a whitelist would have dropped
  // them silently and left this test green.
  const pages = fs.readdirSync(ROOT_SKILL).filter((f) => f.endsWith('.md'));
  // ...and a loop over nothing passes in silence, which is the shape this
  // whole file is about.
  assert.ok(pages.length >= 7, `only ${pages.length} skill pages found — wrong directory?`);
  for (const f of pages) {
    assert.ok(fs.existsSync(path.join(out, f)), `skill page ${f} reached the bundle`);
  }

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
