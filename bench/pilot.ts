// bench/pilot.ts — the cheap predictable pilot ("Atlas-N"): synthetic
// decide-inquiries with known ground truth, two arms on a small model.
//
//   baseline arm: the model reads memos + rubric and assigns claim states
//                 in its head (one call).
//   engine arm:   the model only EXTRACTS per-memo polarity (one call, no
//                 rubric); the ROFL engine derives the states.
//
// The engine's edge here is mechanical by construction — staleness,
// aliases, contested-both-sides, and no-evidence-means-unknown are rules,
// not judgment — so the predicted result is registered before running:
// engine-arm accuracy limited only by extraction fidelity; baseline decays
// on the trap claims. This is a harness pilot / demo, NOT the science —
// the science is the long-horizon suites.
//
// usage:
//   pilot.ts gen    --out DIR [--n 8] [--k 8] [--seed 7]
//   pilot.ts derive --ep DIR/ep_3 --extraction FILE.json   > states.json
//   pilot.ts score  --ep DIR/ep_3 --states FILE.json
//
// NB: derive admits extractor polarity as runtime facts — the pilot
// measures DERIVATION value, not the admission/confirmation gate (all
// claims are non-blocking here on purpose).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { loadInquiryKernel } from '../runtime/report.ts';

// deterministic PRNG (mulberry32)
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLAIM_POOL = ['capacity_ok', 'billing_ok', 'rollback_ready', 'monitoring_live',
  'auth_hardened', 'quota_enforced', 'backup_tested', 'alerting_wired',
  'export_stable', 'import_clean'];
const ALIAS_POOL: Record<string, string> = {
  capacity_ok: 'throughput_headroom', billing_ok: 'invoicing_path',
  rollback_ready: 'revert_procedure', monitoring_live: 'telemetry_feed',
  auth_hardened: 'login_lockdown', quota_enforced: 'usage_ceiling',
  backup_tested: 'restore_drill', alerting_wired: 'pager_hookup',
  export_stable: 'outbound_dump', import_clean: 'inbound_sync',
};
const SUPPORT_T = [
  (t: string, b: string) => `QA note: the ${t} check passed cleanly on ${b}.`,
  (t: string, b: string) => `Ops review: ${t} verified during the drill (${b}).`,
  (t: string, b: string) => `Report: ${t} confirmed by the acceptance run, ${b}.`,
];
const REFUTE_T = [
  (t: string, b: string) => `Incident ticket: ${t} failed under peak on ${b} — still open.`,
  (t: string, b: string) => `QA note: the ${t} run came back red (${b}).`,
  (t: string, b: string) => `Postmortem draft: ${t} did not hold in production, ${b}.`,
];
const DISTRACT_T = [
  () => 'Reminder: the offsite is moved to Thursday.',
  () => 'FYI: cafeteria menu rotates next week.',
  () => 'Note: repo mirror migration finished, no action needed.',
  () => 'Heads-up: badge printer is flaky again.',
];

type Truth = Record<string, 'supported' | 'refuted' | 'contested' | 'unknown'>;

function genEpisode(dir: string, k: number, rand: () => number): void {
  const claims = [...CLAIM_POOL].sort(() => rand() - 0.5).slice(0, k);
  const CUR = 'build_104';
  const OLD = 'build_100';
  const truth: Truth = {};
  const memos: string[] = [];
  const frame: string[] = ['inquiry(ep, decide).', `current_version("${CUR}").`];
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  // state plan: 2 supported, 2 refuted, 1 contested, 1 pure-unknown,
  // 1 stale-trap (looks supported, truth unknown), 1 alias-supported.
  const plan: [string, string][] = [
    [claims[0], 'supported'], [claims[1], 'supported'],
    [claims[2], 'refuted'], [claims[3], 'refuted'],
    [claims[4], 'contested'], [claims[5], 'unknown'],
    [claims[6], 'stale'], [claims[7], 'alias'],
  ];
  for (const [c, kind] of plan) {
    frame.push(`claim(${c}).`, `requires(ep, ${c}).`, `observable(${c}).`);
    if (kind === 'supported') { memos.push(pick(SUPPORT_T)(c, CUR)); truth[c] = 'supported'; }
    if (kind === 'refuted') { memos.push(pick(REFUTE_T)(c, CUR)); truth[c] = 'refuted'; }
    if (kind === 'contested') {
      memos.push(pick(SUPPORT_T)(c, CUR), pick(REFUTE_T)(c, CUR));
      truth[c] = 'contested';
    }
    if (kind === 'unknown') truth[c] = 'unknown';
    if (kind === 'stale') { memos.push(pick(SUPPORT_T)(c, OLD)); truth[c] = 'unknown'; }
    if (kind === 'alias') {
      const a = ALIAS_POOL[c];
      frame.push(`alias_of(${a}, ${c}).`);
      memos.push(pick(SUPPORT_T)(a.replace(/_/g, ' '), CUR));
      truth[c] = 'supported';
    }
  }
  for (let i = 0; i < 6; i++) memos.push(pick(DISTRACT_T)());
  const shuffled = memos.map((m, i) => ({ m, r: rand(), i }))
    .sort((x, y) => x.r - y.r)
    .map((x, n) => `[m${n + 1}] ${x.m}`);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'frame.rofl'), frame.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'memos.md'), shuffled.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'truth.json'), JSON.stringify(truth, null, 2) + '\n');
}

interface ExtractionRow { memo: string; about: string | null; polarity: 'supports' | 'refutes' | null; version: string | null; }

function derive(epDir: string, extractionFile: string): Record<string, string> {
  const r = new Rofl();
  loadInquiryKernel(r);
  const frame = fs.readFileSync(path.join(epDir, 'frame.rofl'), 'utf8');
  if (!r.load(frame).ok) throw new Error('frame rejected');
  const rows = JSON.parse(fs.readFileSync(extractionFile, 'utf8')) as ExtractionRow[];
  const ATOM = /^[a-z][A-Za-z0-9_]*$/;
  let i = 0;
  for (const row of rows) {
    if (!row.about || !row.polarity) continue;
    const term = row.about.trim().replace(/ /g, '_');
    if (!ATOM.test(term)) continue;
    const ev = `pm${++i}`;
    r.assert(`${row.polarity}[obs](${ev}, ${term}).`, { who: 'runtime' });
    r.assert(`evidence_kind[obs](${ev}, document).`, { who: 'runtime' });
    if (row.version && ATOM.test(row.version)) {
      r.assert(`evidence_version[obs](${ev}, "${row.version}").`, { who: 'runtime' });
    }
  }
  const truth = JSON.parse(fs.readFileSync(path.join(epDir, 'truth.json'), 'utf8')) as Truth;
  const out: Record<string, string> = {};
  for (const c of Object.keys(truth)) {
    if (r.holds(`contested[epistemic](${c})`)) out[c] = 'contested';
    else if (r.holds(`supported[epistemic](${c})`)) out[c] = 'supported';
    else if (r.holds(`refuted[epistemic](${c})`)) out[c] = 'refuted';
    else out[c] = 'unknown';
  }
  return out;
}

function score(epDir: string, statesFile: string): { ok: number; total: number; misses: string[] } {
  const truth = JSON.parse(fs.readFileSync(path.join(epDir, 'truth.json'), 'utf8')) as Truth;
  const got = JSON.parse(fs.readFileSync(statesFile, 'utf8')) as Record<string, string>;
  let ok = 0;
  const misses: string[] = [];
  for (const [c, t] of Object.entries(truth)) {
    const g = (got[c] ?? 'MISSING').toLowerCase();
    if (g === t) ok++;
    else misses.push(`${c}: truth=${t} got=${g}`);
  }
  return { ok, total: Object.keys(truth).length, misses };
}

function main(): void {
  const [cmd, ...argv] = process.argv.slice(2);
  const opt = (name: string, dflt?: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : dflt;
  };
  if (cmd === 'gen') {
    const out = opt('out')!;
    const n = parseInt(opt('n', '8')!, 10);
    const seed = parseInt(opt('seed', '7')!, 10);
    const rand = rng(seed);
    for (let i = 1; i <= n; i++) genEpisode(path.join(out, `ep_${i}`), 8, rand);
    console.log(`generated ${n} episodes in ${out}`);
  } else if (cmd === 'derive') {
    const states = derive(opt('ep')!, opt('extraction')!);
    console.log(JSON.stringify(states, null, 2));
  } else if (cmd === 'score') {
    const s = score(opt('ep')!, opt('states')!);
    console.log(JSON.stringify(s));
  } else {
    console.error('usage: pilot.ts gen|derive|score ...');
    process.exit(2);
  }
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) main();
