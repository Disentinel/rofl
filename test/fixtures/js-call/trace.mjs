// trace.mjs — THE ORACLE'S PROBE.
//
// THE RUNTIME IS THE ORACLE; THIS INSTRUMENTATION IS OURS. Nothing in this
// file reads a ROFL fact, a rule, or a scanner output — it asks V8 who is on
// the stack and writes down what V8 says. That independence is the whole
// point: a call graph checked against something derived from the same rules
// that built it measures nothing.
//
// `trace()` called as the first statement of a function F records the edge
// (caller of F) -> F, with the caller's line number, from a captured
// CallSite[] rather than from a parsed stack string.

/** every distinct edge V8 reported, in arrival order */
const edges = [];
const seen = new Set();
/** every function name that ever reported — the MEASURED set. A name absent
 *  from here is either never called or never instrumented, and telling those
 *  two apart is the census's job, not this file's. */
const measured = new Set();

/** The declared name, as V8 reports it. Documented as lossy: two same-named
 *  functions on different objects collapse, so fixture names are kept unique.
 *
 *  SWEPT 2026-09-07 rather than assumed, because this comment said `V8 gives
 *  Box.get, Object.hello, new Box` and that is not what this V8 gives. Sixteen
 *  shapes measured on Node 22, and the qualified names are nearly all gone:
 *
 *    function / arrow / object method / class method / static / async /
 *    generator / inherited / bound / named or anonymous fn expression
 *                                              -> the bare name, no dots
 *    new Box(), new Sub()                      -> `Box`, `Sub`; no `new ` prefix
 *    a getter                                  -> `get acc`
 *    a key that CONTAINS a dot, obj['a.b']     -> `dotted.a.b`  (still qualified)
 *    a computed key                            -> `[Symbol.iterator]`
 *    an arrow passed to a host API             -> null, so `<top>`
 *
 *  So the last-dot rule fires on exactly two shapes today. On `dotted.a.b` it
 *  is doing its job. On `[Symbol.iterator]` it was CORRUPTING the name to
 *  `iterator]` — a case it was never designed for, arriving at a rule written
 *  for a V8 that no longer names things that way.
 *
 *  THE BRACKETS SAY THE WHOLE THING IS ONE KEY, so they are stripped first and
 *  the dot rule then names the property: `[Symbol.iterator]` -> `iterator`,
 *  which is what the model calls it too — every other method is named by its
 *  key rather than by its receiver, and a computed key is still a key. */
function frameName(cs) {
  let n = null;
  try { n = cs.getFunctionName() ?? cs.getMethodName(); } catch { n = null; }
  if (!n) return '<top>';
  if (n.startsWith('[') && n.endsWith(']')) n = n.slice(1, -1);
  const dot = n.lastIndexOf('.');
  return dot < 0 ? n : n.slice(dot + 1);
}

export function trace() {
  const prev = Error.prepareStackTrace;
  Error.prepareStackTrace = (_e, st) => st;
  const holder = {};
  // omits `trace` and everything above it: st[0] is the function that called
  // trace, st[1] is that function's caller.
  Error.captureStackTrace(holder, trace);
  const st = holder.stack;
  Error.prepareStackTrace = prev;
  if (!st || st.length === 0) return;

  const callee = frameName(st[0]);
  const caller = st[1] ? frameName(st[1]) : '<top>';
  const line = st[1] ? (st[1].getLineNumber() ?? 0) : 0;
  const file = st[1] ? (st[1].getFileName() ?? '') : '';
  measured.add(callee);
  const key = caller + ' -> ' + callee;
  if (!seen.has(key)) { seen.add(key); edges.push({ caller, callee, line, file }); }
}

export const oracle = {
  edges: () => edges.slice(),
  pairs: () => edges.map((e) => e.caller + ' -> ' + e.callee).sort(),
  measured: () => new Set(measured),
  reset: () => { edges.length = 0; seen.clear(); measured.clear(); },
};
