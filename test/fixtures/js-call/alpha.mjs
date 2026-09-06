// alpha.mjs — a call-shape zoo that RUNS. Every function whose edge the
// oracle is meant to see calls `trace()` as its first statement; the
// instrumentation is ours, the names on the stack are V8's.
//
// ONE CALL PER LINE, deliberately. V8 reports the LINE of the call site, so
// the test can attribute a missed edge to the exact unresolved site rather
// than to its enclosing function. Packed onto one line, the `trace()` call
// would sit at the same line as the call under study and act as a universal
// alibi — every function would have an unresolved s_identifier to point at,
// and the attribution would pass without discriminating anything.
//
// Function names are unique across the fixture set on purpose, EXCEPT `run`,
// which beta.mjs also defines: that collision is what the file-scoped
// resolution mutant is measured against.
import { trace } from './trace.mjs';

// ---- tier 1: identifier callee, function declared in this file
export function leaf(x) {
  trace();
  return x + 1;
}

function mid(x) {
  trace();
  return leaf(x) + leaf(x);
}

// nested functions: `leaf(y)` belongs to `inner`, never to `outer`
function outer(x) {
  trace();
  function inner(y) {
    trace();
    return leaf(y);
  }
  return inner(x);
}

// arrow bound to a const — a function target that is not a declaration
const dbl = (z) => {
  trace();
  return z * 2;
};
function useArrow(n) {
  trace();
  return dbl(n);
}

// ---- tier 2: ident.method() on a local object literal
const ns = {
  hello(n) {
    trace();
    return leaf(n);
  },
  bye: function (n) {
    trace();
    return n * 2;
  },
};
function useNs(n) {
  trace();
  return ns.hello(n) + ns.bye(n);
}

// ---- a.b.c(): member on member
const deep = {
  layer: {
    dig(n) {
      trace();
      return n;
    },
  },
};
function useDeep(n) {
  trace();
  return deep.layer.dig(n);
}

// ---- f().g(): member on call
function mkBox(n) {
  trace();
  return {
    peek() {
      trace();
      return n;
    },
  };
}
function useCall(n) {
  trace();
  return mkBox(n).peek();
}

// ---- this.m() inside a class, and `new C()`
class Box {
  // a STATIC method: reached on the class itself, not on an instance. It also
  // constructs, so one site exercises the class lookup, the constructor edge
  // and a return value that is an instance.
  static make(n) {
    trace();
    return new Box(n);
  }

  constructor(v) {
    trace();
    this.v = v;
  }
  get(n) {
    trace();
    return this.v + n;
  }
  both(n) {
    trace();
    return this.get(n);
  }
}
function useClass(n) {
  trace();
  const b = new Box(1);
  return b.both(n);
}
function useStatic(n) {
  trace();
  return Box.make(n).get(n);
}

// ---- a SECOND class with the SAME method names. `this.get()` inside Box must
// resolve to Box.get and not to Crate.get: with one class in the file the two
// readings are indistinguishable, which is what made an unscoped `this` rule
// survive its own mutant.
class Crate {
  get(n) {
    trace();
    return n * 2;
  }
  both(n) {
    trace();
    return this.get(n);
  }
}
function useCrate(n) {
  trace();
  const c = new Crate();
  return c.both(n);
}

// ---- `super()`, THE CALL. Three levels on purpose: `Keg` has no constructor
// of its own, so `super()` inside `Cask` must reach `Barrel`'s and skip the
// synthesised one. MEASURED FIRST, with a throwaway runnable file, because the
// two constructions that reach a constructor do not agree and no reading of the
// spec would have said which: V8 reports `Cask -> Barrel` here, SKIPPING the
// synthesised `Keg` frame, while `new C()` on a constructor-less class CREATES
// a frame named after the class and makes it the caller. The first is modelled;
// the second is a finding.
class Barrel {
  constructor(v) {
    trace();
    this.v = v;
  }
  hold(n) {
    trace();
    return this.v + n;
  }
}
class Keg extends Barrel {}
class Cask extends Keg {
  constructor(v) {
    trace();
    super(v);
  }
  // `super.hold` is a member READ on a receiver that is a different class from
  // the one you are in — the third face of what a class-shaped node denotes,
  // and the only one the corpus had no site for.
  pour(n) {
    trace();
    return super.hold(n);
  }
}
function useSuper(n) {
  trace();
  const c = new Cask(n);
  return c.hold(n);
}
function useSuperMember(n) {
  trace();
  return new Cask(n).pour(n);
}

// ---- THE GENERATOR PROTOCOL, and the value travels the OTHER WAY. Every other
// edge in the value layer runs from a definition outwards; the value of a
// `yield` EXPRESSION arrives from the consumer's `.next(v)`, into the middle of
// a suspended body. Measured against V8 before any rule was written:
//   `g.next(pickedA)` makes `yield` evaluate to `pickedA`, and calling it works;
//   `yield* inner()` passes the sent value THROUGH to inner's own yield, and
//   the delegating expression evaluates to inner's RETURN value.
function pickedA(n) {
  trace();
  return n + 1;
}
function pickedB(n) {
  trace();
  return n + 2;
}
function* chooser() {
  trace();
  // NOT `chosen` and NOT `f`: both are taken elsewhere in this file — `chosen`
  // by a for-of head at line 305, `f` by three parameters — and `binder` is
  // FILE-scoped. Until this rule existed a yield expression had no value, so
  // the collision carried nothing; giving it one made an old blindness produce
  // three edges the runtime never takes. The rule did not create the defect, it
  // gave the defect something to carry.
  const sentIn = yield 'ready';
  return sentIn(1);
}
function useSent(n) {
  trace();
  // NOT `g`: `binder` is file-scoped, so a second `const g` below would make
  // both generators receive both sent values and manufacture two edges the
  // runtime never takes. The fixture's own header warns about this and it
  // still caught me — `next_send` went to six rows before the rename.
  const gs = chooser();
  gs.next();
  return gs.next(pickedA).value + n;
}
// ...and the CALL-GRAPH half of the same question: a yield expression in
// CALLEE position. It has a value now, so it should resolve — asserted by a
// site rather than claimed.
function* callsSent() {
  trace();
  return (yield 'go')(3);
}
function useYieldCallee(n) {
  trace();
  const gy = callsSent();
  gy.next();
  return gy.next(pickedA).value + n;
}

function* innerGen() {
  trace();
  const sentDeep = yield 'i';
  return sentDeep(2);
}
function* outerGen() {
  trace();
  return yield* innerGen();
}
function useDelegated(n) {
  trace();
  const gd = outerGen();
  gd.next();
  return gd.next(pickedB).value + n;
}

// ---- AN INSTANCE IS NOT ITS CLASS. `new Vat()` and the name `Vat` both reach
// the class node today, so the model accepts all four sites below while the
// runtime accepts only two. The two it refuses are wrapped so the fixture still
// runs to the end: a TypeError here would truncate the oracle, and a truncated
// oracle reads as over-approximation, which this file has already been bitten
// by once (main went async and nobody awaited it).
class Vat {
  static tapped(n) {
    trace();
    return n + 1;
  }
  poured(n) {
    trace();
    return n + 2;
  }
}
function useStaticOnClass(n) {
  trace();
  return Vat.tapped(n);        // legal: a static, on the class
}
function useMethodOnInstance(n) {
  trace();
  return new Vat().poured(n);  // legal: an instance method, on an instance
}
function useStaticOnInstance(n) {
  trace();
  try {
    return new Vat().tapped(n);  // TypeError: a static is not on the instance
  } catch { return 0; }
}
function useMethodOnClass(n) {
  trace();
  try {
    return Vat.poured(n);        // TypeError: an instance method is not on the class
  } catch { return 0; }
}

// ---- VALUES CROSSING A CONTROL CONSTRUCT: for-of over an array, for-of over
// a generator, and await. All three RUN, so the oracle judges them.
//
// THE LOOP VARIABLES ARE NAMED `chosen`, `drawn` and `awaited`, not `f`, and
// that is the same discipline this file's header states for FUNCTION names.
// `const f = await mkAlef()` was the first draft, and `binder` is FILE-scoped by
// design — the tier-1 scope blindness the rules declare — so every parameter
// named `f` in this file picked up `alef`. Three call sites went ambiguous and
// the oracle would have called the extra edges over-approximation. The model
// was behaving exactly as documented; the FIXTURE was the thing that broke a
// convention, and a name collision in a corpus is not a measurement.
//
// The generator arm is the one worth reading twice: `for (const f of pick())`
// walks what `pick` YIELDS, not what it returns, and those are two different
// facts about one function. A model that reused the return rule here would see
// nothing at all and report a smaller call graph that looks correct.
function alef(n) {
  trace();
  return n + 1;
}
function bet(n) {
  trace();
  return n + 2;
}

function* pick() {
  trace();
  yield alef;
  yield bet;
}

function useForOfArray(n) {
  trace();
  let total = 0;
  for (const chosen of [alef, bet]) { total += chosen(n); }
  return total;
}

function useForOfGen(n) {
  trace();
  let total = 0;
  for (const drawn of pick()) { total += drawn(n); }
  return total;
}

async function mkAlef() {
  trace();
  return alef;
}

async function useAwait(n) {
  trace();
  const awaited = await mkAlef();
  return awaited(n);
}

// ---- A CALL THE PROGRAM BRANCHES AROUND. `unreached` is instrumented and
// never runs, and the reason is CONTROL FLOW rather than value: the model
// derives `useGuard -> unreached` correctly — the site is there and it resolves
// — and the runtime never takes it. That edge is over-approximation the call
// graph cannot explain and rules/js-controlflow.rofl can, which is the whole
// argument for the third layer being worth its cells.
//
// It is the SECOND deliberately silent function here. `pickA` is the other, and
// the two are silent for completely different reasons — `pickA` because a value
// points elsewhere, this one because a branch is not taken — so the census
// distinguishes them rather than listing both as expected exceptions.
//
// THE `else` IS NOT DECORATION. `guard_arm_unseen[audit]` named
// `if_statement/alternate` the first run this fixture had an `if` at all: the
// arm was declared in the vocabulary and no corpus site exercised the rule that
// reads it. `guardedElse` is that site, and it is the contrast that makes the
// pair worth having — one guarded call the run takes, one it does not, and
// `may_not_run` names BOTH because it is a may-set and does not know which.
function unreached(n) {
  trace();
  return n - 1;
}
function guardedElse(n) {
  trace();
  return n * 2;
}
function useGuard(n) {
  trace();
  if (n < 0) { return unreached(n); }
  else { return guardedElse(n); }
}

// ---- CONTROL CONSTRUCTS THE CORPUS HAD NEVER CONTAINED. Measured 2026-09-05:
// one probe file emitted 51 node kinds and THIRTY of them were undeclared, of
// which fifteen were control-shaped — `try`, `catch`, `throw`, `switch`,
// `while`, `for`, `break`, `continue`. The vocabulary was a model of THIS
// corpus rather than of the language, and `unaccounted[audit]` cannot see a
// kind nobody declared: it compares declared kinds against layers, so an
// undeclared one is not a hole, it is outside the frame.
//
// These run, so the oracle judges them. `thrower` and `rescue` are the pair
// that matters: a throw is an abrupt transfer, `after` is unreachable, and the
// catch clause is what makes `rescue` reachable at all.
function thrower(n) {
  trace();
  throw new Error(String(n));
}
function after(n) {
  trace();
  return n;
}
function rescue(n) {
  trace();
  return n + 1;
}
function useTry(n) {
  trace();
  try {
    thrower(n);
    return after(n);
  } catch (e) {
    void e;
    return rescue(n);
  } finally {
    void 0;
  }
}

function loopBody(n) {
  trace();
  return n;
}
function useLoops(n) {
  trace();
  let total = 0;
  let i = 0;
  while (i < 2) { total += loopBody(i); i += 1; }
  do { total += 1; } while (false);
  for (let j = 0; j < 2; j += 1) { if (j === 0) { continue; } total += 1; }
  for (const k in { a: 1 }) { total += k.length; }
  switch (n) {
    case 1: total += 1; break;
    default: total += 2;
  }
  return total;
}

// ---- computed callee: dynamic key, then literal key
const table = {
  pick(n) {
    trace();
    return n;
  },
};
function useDyn(n, k) {
  trace();
  return table[k](n);
}
function useLit(n) {
  trace();
  return table['pick'](n);
}

// ---- THE TRAP the computed/non-computed distinction exists for: a variable
// whose NAME is one method and whose VALUE is another. A model that reads
// `two[pickA]` as `two.pickA` resolves to the wrong function and looks right.
const two = {
  pickA(n) {
    trace();
    return n;
  },
  pickB(n) {
    trace();
    return -n;
  },
};
const pickA = 'pickB';
function useTrap(n) {
  trace();
  return two[pickA](n);
}

// ---- higher order: which function lands in which argument slot
function apply2(f, g, n) {
  trace();
  return f(n) + g(n);
}
function useHigher(n) {
  trace();
  return apply2(leaf, mid, n);
}

// ---- higher order where ONLY THE FIRST parameter is called. `apply2` calls
// both of its function parameters, so it cannot tell an argument index apart
// from its neighbour: leaf and mid both run either way. Here `mid` is passed
// and never called, so a model that ignores the argument index — or that binds
// a parameter without asking which call site targets the function — derives
// `applyFirst -> mid`, an edge the runtime never ran.
function applyFirst(f, g, n) {
  trace();
  return f(n);
}
function useFirst(n) {
  trace();
  return applyFirst(leaf, mid, n);
}

// ---- a SECOND function whose first parameter is called, handed a DIFFERENT
// function. The parameter is deliberately named `f`, the same as apply2's, so
// two defects become observable that `apply2` alone cannot show: a model that
// resolves a parameter callee by NAME without asking which function encloses
// the call mixes the two bindings, and a model that binds a parameter without
// asking which call site targets the function does the same. Either derives
// `useCb -> leaf`, which the runtime never ran.
function useCb(f, n) {
  trace();
  return f(n);
}
function feedCb(n) {
  trace();
  return useCb(mid, n);
}

// ---- optional member callee
function useOpt(n) {
  trace();
  return ns?.hello(n);
}

// ---- member on an array literal: the callee is not ours at all
function useArr(n) {
  trace();
  return [n, n].join('-');
}

// ---- FOUR OBJECT POSITIONS THAT USED TO SHARE ONE CATCH-ALL SHAPE. Measured
// 2026-09-04: `(c ? a : b).m()` resolved and `(a || b).m()` did not, on the
// same corpus in the same run, and both reported `s_member_on_other` — one
// bucket, one verdict, two opposite truths. These four sites are what makes
// each of them its own row. They RUN, so the oracle sees the edges and an
// over-approximation here is caught rather than argued.
const boxA = { pick(n) { trace(); return n + 1; } };
const boxB = { pick(n) { trace(); return n + 2; } };

export function useCond(n) {
  trace();
  return (n > 0 ? boxA : boxB).pick(n);
}

export function useSeq(n) {
  trace();
  return (0, boxA).pick(n);
}

export function useOr(n) {
  trace();
  return (boxA || boxB).pick(n);
}

export function useAssign(n) {
  trace();
  let held;
  return (held = boxB).pick(n);
}

// ---- IIFE at the top level: the caller is the module, not a function
const seeded = (function seed() {
  trace();
  return 7;
})();

// ---- the name that also exists in beta.mjs
export function run(n) {
  trace();
  return mid(n);
}

export async function main() {
  trace();
  return [
    outer(1),
    useArrow(1),
    useNs(1),
    useDeep(1),
    useCall(1),
    useClass(1),
    useDyn(1, 'pick'),
    useLit(1),
    useTrap(1),
    useHigher(1),
    useFirst(1),
    feedCb(1),
    useCrate(1),
    useStatic(1),
    useOpt(1),
    useArr(1),
    useCond(1),
    useSeq(1),
    useOr(1),
    useAssign(1),
    useSuper(1),
    useSuperMember(1),
    useSent(1),
    useDelegated(1),
    useYieldCallee(1),
    useStaticOnClass(1),
    useMethodOnInstance(1),
    useStaticOnInstance(1),
    useMethodOnClass(1),
    useForOfArray(1),
    useForOfGen(1),
    useGuard(1),
    useTry(1),
    useLoops(1),
    await useAwait(1),
    run(1),
    seeded,
  ];
}
