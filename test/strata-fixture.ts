// strata-fixture.ts — the schedule pack, for tests that measure the stock path.
//
// The ten rules live in `rules/strata.rofl`; this reads them, so a test and a
// scanner cannot drift apart about what "the stratum table" is. See that file
// for why they left `boot.rofl` and why they are still worth loading.
import * as fs from 'node:fs';
import * as path from 'node:path';

export const STRATUM_RULES: string = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'rules', 'strata.rofl'), 'utf8');
