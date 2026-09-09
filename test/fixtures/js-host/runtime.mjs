// runtime.mjs — THE CORPUS THE FIVE CALL FIXTURES DO NOT HAVE.
//
// MEASURED BEFORE THIS FILE EXISTED, 2026-09-09, over every module specifier
// in test/fixtures/js-call: `./alpha.mjs` x6, `./gamma.mjs` x4, `./trace.mjs`
// x3, `./delta.mjs` x3, `./x` x1. FIVE distinct specifiers, all relative, and
// NOT ONE import of a node builtin. Grepped the same corpus for the runtime
// globals — console, fetch, setTimeout, setInterval, queueMicrotask,
// structuredClone, URL, TextEncoder, AbortController, performance, process,
// Buffer, require, globalThis — and every hit was inside a COMMENT.
//
// So the runtime layer had no site at all, and this file is what a site has to
// look like. It lives in its own directory rather than in test/fixtures/js-call
// on purpose: appending a sixth file to the shared corpus moves every named set
// and every cost pin in the suite, which is the merge hazard HANDOFF records,
// and this layer needs none of the call graph's fixtures to have a question.

import * as fs from 'node:fs';                      // namespace import
import path from 'node:path';                       // default import (CJS shape)
import { readFile as rf, writeFile } from 'node:fs/promises';   // named, one renamed
import os from 'os';                                // THE BARE SPELLING, node_builtin_bare
import { join } from 'node:path';                   // named, called plainly
import { notAMemberOfPath } from 'node:path';       // host_import_unknown

// A MEMBER CALL ON A MODULE NAMESPACE — by_module, io.
export function readIt(p) {
  return fs.readFileSync(p, 'utf8');
}

// THE MEMBER THAT DIFFERS FROM ITS MODULE. `node:path` is total and
// `path.resolve` is io, because it reads process.cwd(). One file, both rows,
// so `host_call_effect`'s provenance column has something to distinguish.
export function where(p) {
  return path.resolve(p);
}

export function under(a, b) {
  return path.join(a, b);            // by_module, total
}

export function alsoUnder(a, b) {
  return join(a, b);                 // A PLAIN CALL OF A NAMED IMPORT — same effect,
}                                    // a different one of the four site shapes.

// A RENAMED NAMED IMPORT, called plainly. `rf` is not `readFile` anywhere in
// the source text, so a model that matched the LOCAL spelling against the
// surface would find nothing here.
export async function readLater(p) {
  return rf(p, 'utf8');
}

export async function writeLater(p, s) {
  return writeFile(p, s);
}

// THE BARE BUILTIN SPELLING. `os` is in node_builtin_bare, so this resolves;
// `node:sqlite` and `fs/promises` bare would not, which is what
// bare_builtin_unlisted[audit] reports.
export function cpus() {
  return os.cpus();                  // by_module, read
}

// VERSION-GATED MEMBERS, one per runtime boundary the scale can tell apart.
//   os.machine     @since v18.9.0   absent on node18
//   fs.statfs      @since v19.6.0   absent on node18
//   fs.globSync    @since v22.0.0   absent on node18 AND node20
export function arch() {
  return os.machine();
}

export function space(p) {
  return fs.statfs(p);
}

export function matches(pat) {
  return fs.globSync(pat);
}

// THE BRIDGE, EXERCISED. `Array.prototype.toSorted` is declared in
// lib.es2023.array.d.ts, so `lib_call[code]` dates it es2023 — and node18
// provides es2022. This one call is therefore a live
// `runtime_lib_unsupported[audit](node18, ...)` row and NOT one under node20 or
// node22, which is the whole of the bridge between the two axes doing work: an
// ECMAScript release, a runtime version, and one method that separates them.
export function ordered(xs) {
  return xs.toSorted();
}

// ...with a receiver whose prototype the model can name without a value, which
// is what `stdlib_member[audit]` needs. An array LITERAL answers by its kind.
export function orderedLiteral() {
  return [3, 1, 2].toSorted();
}

// A DEPRECATED MEMBER THAT NAMES ITS REPLACEMENT. `fs.exists` carries
// `@deprecated Since v1.0.0 - Use {@link stat} or {@link access} instead`, so
// this is one join from `host_call_remedy[audit](C, "node:fs", "exists",
// "stat")`. rules/js-env-api.rofl records that the ECMAScript axis has TWO
// named replacements in the whole standard library and that the place the
// relation would earn its keep is a runtime's API — "which is a source this
// repository does not have". This line is that source, exercised.
export function isThere(p, cb) {
  return fs.exists(p, cb);
}

// ---------------------------------------------------------------------------
// THE GLOBAL DOOR. None of these has a declaration, a specifier or a binding
// site anywhere in this program.

// A MEMBER CALL ON A GLOBAL.
export function say(x) {
  console.log(x);
  console.error(x);
}

// A PLAIN CALL OF A GLOBAL.
export async function get(u) {
  return fetch(u);
}

export function soon(f) {
  return setTimeout(f, 0);
}

export function copyOf(v) {
  return structuredClone(v);
}

export function now() {
  return performance.now();
}

// A GLOBAL WITH NO EFFECT ROW. `atob` is in BOTH hosts' surfaces and in
// neither's effect table, so this is the site `host_call_uneffected[audit]`
// exists to name — the frontier as a row in this corpus rather than a promise.
//
// `new TextDecoder().decode(b)` WAS THIS SITE AND COULD NOT BE. `new` is a
// `new_expression` and `call_kind` holds `call_expression` and
// `optional_call_expression` only, so the receiver is not an identifier the
// global door can see and the whole construct produced no site at all. Measured
// rather than assumed: `host_call_uneffected` was 0 with it and is 1 with
// `atob`. A fixture that cannot exercise the rule it was written for is the
// trap test/fixtures/js-call/shapes.ts records four times.
export function decode(s) {
  return atob(s);
}

// A BROWSER-ONLY GLOBAL IN A FILE THAT ALSO USES NODE ONES. `document` is in
// lib.dom.d.ts and absent from @types/node, so host_global_only_in[code] has a
// site — this is the one row that would be lost by a flat, hostless table.
export function title() {
  return document.title;
}
