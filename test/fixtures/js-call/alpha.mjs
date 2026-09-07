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
  // NAME COLLIDES WITH `Barrel.hold` ON PURPOSE, added 2026-09-07 for
  // w_scope_binding. `useCrate` binds `const c = new Crate()` and `useSuper`
  // binds `const c = new Cask(n)` — two classes, one name, two functions — and
  // the collision was SILENT for as long as the two classes shared no method
  // name. It shares one now, so a file-scoped binder makes `c.hold(n)` in each
  // function reach BOTH classes' `hold`.
  //
  // THE RUNTIME ORACLE CANNOT JUDGE THIS ONE, and that is worth saying: V8
  // names a frame by the function's name, both methods are called `hold`, so
  // `useCrate -> hold` and `useSuper -> hold` are the same string either way.
  // `ambiguous_call[audit]` can, because it names NODES.
  hold(n) {
    trace();
    return n + 1;
  }
  both(n) {
    trace();
    return this.get(n);
  }
}
function useCrate(n) {
  trace();
  const c = new Crate();
  return c.both(n) + c.hold(n);
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

// A COMPUTED KEY WRITTEN AS A TEMPLATE. `` keyed[`pickTmpl`](n) `` is fixed at
// parse time and was NOT DERIVABLE until 2026-09-08: the text lived in
// `TemplateElement.value`, a nested object, and the scanner emitted scalar own
// properties only. Four cells were blocked on that with the cause
// `scanner_contract`.
//
// IT IS HERE AND NOT IN shapes.ts, and that is the whole care. The corpus
// already had a site — `` bag[`fixed`](n) `` in shapes.ts — and it measures
// NOTHING about this construct, because `bag` is an ambient declaration
// carrying no value, so the call cannot resolve however good the key is. That
// file`s own header names the trap: a site measures the model only when
// everything except the construct under study already works. This one runs, so
// the oracle judges it too.
const keyed = {
  pickTmpl(n) {
    trace();
    return n;
  },
};

export function useTmplKey(n) {
  trace();
  return keyed[`pickTmpl`](n);
}

// ...AND ONE WITH AN ESCAPE IN IT, which is the only place `cooked` and `raw`
// differ and therefore the only site that can tell the two apart. Measured
// before it was written: with every template in the corpus escape-free, the
// mutant that reads `raw` where the rule reads `cooked` derived a byte-identical
// world. `\u0062` is a `b`, so this template's cooked text is `abc` and its raw
// text is the six characters as written.
export const escaped = `a\u0062c`;

// A SUSPENSION THAT NEVER RESUMES (w_cf_suspension). The control-flow layer
// WAIVED `suspend` until this fixture existed, with the reason
// `a_control_returns_so_the_site_still_runs`, and its comment said the code
// after an `await` runs, it merely runs later.
// That is true of an await whose promise SETTLES, and every await this corpus
// had was one — so the reason had never been exercised, and it is a claim about
// the program rather than about the language.
//
// MEASURED BEFORE THIS WAS WRITTEN: `useStall` reports, `afterStall` never
// does, and the process still exits with the suspended call outstanding. An
// async function suspended forever holds nothing open, so this site costs the
// harness nothing.
//
// CALLED WITHOUT BEING AWAITED, which is what makes it safe: `main` collects it
// into the array with every other call and never waits on it. Awaiting it would
// hang the suite forever, and that is the one way to get this fixture wrong.
//
// THE EXECUTOR IS A NAMED DECLARATION, not an arrow, for a reason the census
// enforces: every function in a runnable fixture must be able to report, and an
// anonymous `() => {}` cannot carry a `trace()` without being named something
// the oracle and the census disagree about.
function neverSettle(_resolve) {
  trace();
}

const unsettled = new Promise(neverSettle);

function afterStall(n) {
  trace();
  return n;
}

export async function useStall(n) {
  trace();
  await unsettled;
  return afterStall(n);
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
// ---- STATEMENT ORDER: a call the parser sees and the runtime never reaches.
// THE CORPUS HAD NO SITE FOR THIS. Measured before writing the rule: zero
// statements anywhere in this file sit syntactically after a return, throw,
// break or continue in the same block, so `w_cf_abrupt_transfer` had nothing to
// be tested against — and the witness the queue had attached to it, `after`
// below, is unreachable for a DIFFERENT reason (thrower always throws, which is
// exception propagation, not order).
function neverReached(n) {
  trace();
  return n;
}
function useAbrupt(n) {
  trace();
  return n + 1;
  neverReached(n);
}

// ...and the SECOND witness, which exists because the rule was asked where it
// could not look before it was believed. A switch case holds its statements
// under `consequent`, not `body`, so the first draft — keyed on `body` — was
// blind to exactly this shape and no audit in the layer said a word.
function neverCased(n) {
  trace();
  return n;
}

// TRANSITIVE REACHABILITY — queue item w_cf_reachability, and the fixture came
// first for the same reason it did for the abrupt work: the corpus had no site
// that could show the difference. Every function `may_not_run` names today is a
// LEAF — measured, all seven call nothing — so the transitive closure added
// exactly zero names to the local answer.
//
// THE CHAIN THAT MAKES IT VISIBLE: `dormant` is called ONCE, from `sleeper`, at
// a site nothing guards. The local rule therefore says `dormant` runs. It never
// does, because `sleeper`'s only call site is a guard arm the program does not
// take. The names are deliberately unique across the corpus — a file-scoped
// binder has cost three of the last four iterations an over-approximation.
// THE EXCEPTION PATH — queue item w_exception_flow, and BOTH halves needed a
// fixture. The corpus had exactly one function that cannot return normally
// (`thrower`) and exactly one catch clause with a parameter, which only voided
// it, so the value half had nothing to be tested against at all.
//
// A CONSTRUCTOR THAT ALWAYS THROWS, so `super(...)` is an exit too: `super`
// resolves to the CLASS and not to the body that runs, and `ctor_of[flow]`
// walks the extends chain. `unlit` sits after the `super(n)` call in the same
// statement list and can never run.
function unlit(n) {
  trace();
  return n;
}
class Fuse {
  constructor(n) {
    trace();
    throw new Error('fuse ' + n);
  }
}
class Lit extends Fuse {
  constructor(n) {
    trace();
    super(n);
    unlit(n);
  }
}
function useFuse(n) {
  trace();
  try {
    return new Lit(n);
  } catch {
    return 0;
  }
}

// THREE FUNCTIONS THAT DO NOT ALWAYS THROW, and they exist because three
// mutants SURVIVED against the corpus without them — the soundness conditions
// were untested, not satisfied. Each is called with a statement behind it that
// really runs, so the oracle judges the claim rather than the rule judging
// itself.
function stillRuns(n) {
  trace();
  return n;
}
function nestedThrow(n) {
  // no `return` anywhere, but the throw is NOT top-level: for n >= 0 this
  // returns undefined. Reading a throw anywhere as top-level kills `stillRuns`.
  trace();
  if (n < 0) {
    throw new Error('nested ' + n);
  }
}
function useNested(n) {
  trace();
  nestedThrow(n);
  return stillRuns(n);
}
function alsoRuns(n) {
  trace();
  return n;
}
function topThrowWithReturn(n) {
  // a top-level throw AND a return, so it can leave normally. Dropping the
  // no-return condition kills `alsoRuns`.
  trace();
  if (n >= 0) {
    return n;
  }
  throw new Error('neg ' + n);
}
function useWithReturn(n) {
  trace();
  topThrowWithReturn(n);
  return alsoRuns(n);
}
// ...and a throw inside a HANDLER, which its own clause does not catch. Reading
// the try as a whole instead of its `block` field offers the rethrow to `inner`
// as a candidate for itself.
function risky(n) {
  trace();
  return n;
}
function rethrown(n) {
  trace();
  try {
    return risky(n);
  } catch (rethrowCaught) {
    // NOT named `inner`: alpha.mjs already declares `function inner(y)` and the
    // binder is FILE-scoped, so `String(inner)` read as passing that FUNCTION at
    // argument position 0 and the argument-position census gained `0 -> inner`.
    // Fourth iteration in five that this limitation has cost a fixture name, and
    // the first where the gate that caught it named the row rather than a count.
    throw new Error('re ' + String(rethrowCaught));
  }
}

// AN ACCESSOR IS A CALL WEARING A READ'S SYNTAX — queue item w_cf_accessor, and
// the corpus contained ZERO accessors: the `kind` attribute the scanner emits
// for every method held only `method` and `constructor`. Fourth item running
// whose fixture had to precede its rule.
//
// `gauge.broken` is a READ that runs a function, and that function always
// throws, so `unreadable` never runs — which composes the accessor rule with the
// call-is-an-exit rule from the item before it. Names checked against the whole
// fixture set first; the file-scoped binder has cost four of the last five
// iterations.
function unreadable(n) {
  trace();
  return n;
}
const gauge = {
  get broken() {
    trace();
    throw new Error('gauge');
  },
  get reading() {
    trace();
    return 7;
  },
};
function useGauge(n) {
  trace();
  try {
    void gauge.broken;
    return unreadable(n);
  } catch {
    return gauge.reading + n;
  }
}

// ...and a SECOND object with a plain property of the SAME NAME, because the
// mutant that dropped the receiver check SURVIVED without it: with one object
// owning `broken`, any read of that key is the accessor and the check is
// defended by reasoning rather than by measurement. Same shape as the `super`
// arm removed one item earlier. `alsoReads` runs, and only the receiver check
// says so.
function alsoReads(n) {
  trace();
  return n;
}
const shim = { broken: 3 };
function useShim(n) {
  trace();
  void shim.broken;
  return alsoReads(n);
}

// TWO SHAPES THE PROPAGATION RULES NEEDED — queue item w_exn_propagation, and
// both were written because a mutant SURVIVED without them, not because the
// rules looked thin.
//
// 1. A TRY CATCHES WHAT RUNS IN ITS OWN FUNCTION. `boom` calls `lateThrow` from
// inside a try BLOCK textually, and `boom` is a different function — it runs
// when somebody calls it, which is later and elsewhere. Reading containment
// without the enclosing-function check reports that call caught and `boom` as
// unable to throw.
function lateThrow(n) {
  trace();
  throw new Error('late ' + n);
}
function makeThrower(n) {
  trace();
  try {
    return function boom() {
      trace();
      return lateThrow(n);
    };
  } catch {
    return null;
  }
}

// 2. A VALUE THAT CROSSES TWO CALL EDGES. `midThrow` has no throw of its own,
// so `thrown_by` reaches it only through its own transitive arm — the corpus's
// other catch receives a value from a function that throws DIRECTLY, and one
// hop cannot tell the two rules apart.
function deepThrow(n) {
  trace();
  throw new Error('deep ' + n);
}
function midThrow(n) {
  trace();
  return deepThrow(n);
}
function useTwoHops(n) {
  trace();
  try {
    return midThrow(n);
  } catch (twoHop) {
    return String(twoHop).length;
  }
}

// ...and a statement AFTER a try whose block throws, which RUNS because the
// handler caught it. Without it the `try_stops` clause had no witness at all —
// `useTry`'s try IS its whole body, so nothing followed it and the mutant that
// deleted the clause survived.
function afterTheTry(n) {
  trace();
  return n;
}
function useCaught(n) {
  trace();
  try {
    thrower(n);
  } catch {
    void 0;
  }
  return afterTheTry(n);
}

// ...and the VALUE a throw delivers. `caught` is bound by something that
// happens elsewhere in the block, which no other rule in the value layer has
// ever had to express. It is passed on to a call so the edge is observable
// rather than merely derived.
function label(e) {
  trace();
  return String(e);
}
function useThrownValue(n) {
  trace();
  try {
    throw new Error('tagged ' + n);
  } catch (caught) {
    return label(caught);
  }
}

function dormant(n) {
  trace();
  return n;
}
function sleeper(n) {
  trace();
  return dormant(n);
}
function useDormant(n) {
  trace();
  if (n < 0) {
    return sleeper(n);
  }
  return n;
}
function useCased(n) {
  trace();
  switch (n) {
    case 1:
      return n + 1;
      neverCased(n);
    default:
      return n;
  }
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
  // TWO EXTRA METHODS, added 2026-09-07 for w_scope_binding's literal half.
  // `useKeyA`/`useKeyB` bind `keyPick` to two different strings in two
  // functions and use it as a computed key; they select THESE rather than
  // `pickA`/`pickB` on purpose, because `pickA` is the value decoy that must
  // stay instrumented-and-never-called, and a first draft that selected it
  // destroyed that assertion.
  keyOne(n) {
    trace();
    return n;
  },
  keyTwo(n) {
    trace();
    return n + 1;
  },
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

// TWO SHAPES THE SCOPE RULE NEEDED, added 2026-09-07 because two mutants
// SURVIVED without them — the same sequence every item this week has run.
//
// 1. A LITERAL BINDER COLLIDING ACROSS FUNCTIONS. `keyPick` is bound in two
// functions with two different strings and used as a COMPUTED KEY, so without
// the visibility check on `may_be_lit` each site reads both keys and each call
// reaches both methods. The value half of the fix had no witness at all until
// this: every colliding binder in the corpus carried a node, not a literal.
function useKeyA(n) {
  trace();
  const keyPick = 'keyOne';
  return two[keyPick](n);
}
function useKeyB(n) {
  trace();
  const keyPick = 'keyTwo';
  return two[keyPick](n);
}

// 2. A CLOSURE READING AN OUTER BINDER. `inner2` is a different region from
// `closureRead`, so a rule that asked for the NEAREST enclosing function would
// not see `chosenFn` at all and would lose the edge. `ast_within` is what makes
// a region see what it CONTAINS rather than only itself, and nothing in the
// corpus exercised that until a nested function read an outer `const`.
function closureRead(n) {
  trace();
  // `leaf`, not `pickB`: `pickB` is a METHOD of `two` and not a name at module
  // scope at all. The first draft used it, `node --check` passed it (syntax
  // only), and the corpus threw ReferenceError the moment `main()` ran — which
  // is why a fixture edit is followed by RUNNING main, not by parsing it.
  const chosenFn = leaf;
  return function inner2() {
    trace();
    return chosenFn(n);
  };
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

// ---- obj.x = f : A PROPERTY WRITTEN IS A PROPERTY READ (w_alias_store)
//
// The corpus had NO `obj.x = f` at all — thirteen assignments, eleven to an
// identifier and two `this.v = v` writing a number — so the item's own gap
// could not produce a single site to look at. Measured before a rule was
// written: `selects[flow]` ALREADY fires on the member on the left,
// `may_be_node` ALREADY answers the object half, and the value is already
// valued on the right. Nothing was missing but the arm that joins them.
//
// `fixed` COLLIDES WITH `bag['fixed']` IN shapes.ts ON PURPOSE — two objects,
// two files, one key. The RECEIVER is what decides, and a lookup that forgot it
// would answer both.
function slotted(n) {
  trace();
  return n + 7;
}
function shelved(n) {
  trace();
  return n + 8;
}

const rack = {
  fixed(k) {
    trace();
    return k + 1;
  },
};
rack.spare = slotted;
// a LITERAL written, then compounded: the model may say `tally` is 4 and must
// not say it is 5, because `+=` evaluates to a SUM and this layer knows nothing
// about sums. It is 9 at runtime and the model claims neither.
rack.tally = 4;
rack.tally += 5;

// a SECOND object with the SAME written key, so a rule that drops the receiver
// makes each site reach both functions instead of its own.
const shelf = {};
shelf.spare = shelved;

export function useRack(n) {
  trace();
  return rack.fixed(n) + rack.spare(n) + rack.tally;
}
export function useShelf(n) {
  trace();
  return shelf.spare(n);
}

// WHERE THE RULE WAS ASKED WHETHER IT COULD LOOK, rather than told. A COMPUTED
// write through a CHAINED receiver, both at once. Neither half is a second
// rule: `selects[flow]` already reads a computed key whose expression has a
// literal value, and `may_be_node` already resolves `bin.nest` by the same
// member lookup this arm feeds. So this is a positive control on the arm's
// REACH — if it goes red, the arm is narrower than it reads.
function stocked(n) {
  trace();
  return n + 9;
}
const bin = { nest: {} };
const slotKey = 'deepSlot';
bin.nest[slotKey] = stocked;
export function useBin(n) {
  trace();
  return bin.nest[slotKey](n);
}

// ---- WHICH FUNCTION BINDS `this` (w_scope_binding, 2026-09-07)
//
// `this` is not a lexical binder, and which construct BINDS it is decided
// lexically all the same: the nearest enclosing function that is not an arrow.
// The corpus had no site that could tell that apart from "anywhere under the
// class method", which is what the rule used to say, in a comment that called
// its own over-approximation harmless because nothing exercised it.
//
// THE NAMES COLLIDE ON PURPOSE. `Panel.read` and `knob.read` are two different
// functions with one name, so a `this` attributed to the wrong host still
// produces a frame V8 spells `read` — the execution oracle cannot see this one
// at all, and `ambiguous_call[audit]` and the resolution rows can, because they
// name NODES.
class Panel {
  read(n) {
    trace();
    return n * 3;
  }

  // an OBJECT METHOD binds `this` to its own object, even nested inside a class
  // method. `relay` reaches `knob.read`; the `this.read(n)` on the last line is
  // `show`'s own and reaches `Panel.read`. One statement, two hosts.
  show(n) {
    trace();
    const knob = {
      read(k) {
        trace();
        return k + 100;
      },
      // `tag` exists on `knob` and NOT on `Panel`, and that asymmetry is the
      // only thing that can be SEEN when the host is wrong: with both objects
      // owning `read`, V8 spells either answer `read` and so does the model's
      // edge list. One member the class does not have makes a wrong host lose
      // an edge by name instead of silently swapping which function it means.
      tag(k) {
        trace();
        return k - 1;
      },
      relay(k) {
        trace();
        return this.read(k) + this.tag(k);
      },
    };
    return knob.relay(n) + this.read(n);
  }

  // an ARROW does NOT bind `this`: `via`'s `this` is `drift`'s, so this reaches
  // `Panel.read`. Declaring the arrow a binder makes the edge vanish.
  drift(n) {
    trace();
    const via = () => {
      trace();
      return this.read(n);
    };
    return via();
  }
}
export function usePanel(n) {
  trace();
  const p = new Panel();
  return p.show(n) + p.drift(n);
}

// ---- IIFE at the top level: the caller is the module, not a function
const seeded = (function seed() {
  trace();
  return 7;
})();

// ---- THE DEFAULT EXPORT, WITH A CONSUMER (w_cg_module_boundary, 2026-09-07).
// beta.mjs already had `export default function bdefault`, and NOTHING IMPORTED
// IT — the harness calls it, which is not an edge the model can be checked
// against. This one is imported, so the binding rule has a site.
export default function adefault(n) {
  trace();
  return n + 13;
}

// ---- IMPORTED BY beta.mjs, which is the corpus's FIRST cross-file import
// (w_cg_module_boundary, 2026-09-07). Before this the only import anywhere was
// `trace` from './trace.mjs' — a module the corpus does not scan — so the
// boundary had no site where crossing it was even possible.
export function crossed(n) {
  trace();
  return n + 11;
}

// ---- the name that also exists in beta.mjs
export function run(n) {
  trace();
  return mid(n);
}

// THE ITERATOR PROTOCOL, which is two calls and no call site for either
// (w_cg_invisible_calls). `for (x of counter)` calls `counter[Symbol.iterator]()`
// and then `next()` on whatever that returned, and the grammar shows neither.
//
// MEASURED AGAINST THE RUNTIME FIRST: V8 attributes BOTH to the enclosing
// function, so unlike an `await`'s `.then` this one is checkable. It also
// reports the first as `[Symbol.iterator]`, a shape trace.mjs's last-dot rule
// had never seen and was corrupting to `iterator]`.
//
// `bump` IS A PLAIN NAME ON PURPOSE. The second hop goes through
// `member_value` on the object the iterator method RETURNS, so the callee must
// be a function this corpus can name — an inline arrow would be a second
// construct in a fixture for one.
function bump() {
  trace();
  return { value: 1, done: true };
}

const counter = {
  [Symbol.iterator]() {
    trace();
    return { next: bump };
  },
};

export function useIterable(n) {
  trace();
  let s = 0;
  for (const x of counter) s += n;
  return s;
}

// A CALL WITH NO CALL SITE (w_cg_invisible_calls). `` mark`a ${n} b` `` calls
// `mark` and the grammar gives that call no CallExpression node to hang it on —
// the same shape `new C()` had, and the same remedy: a TRANSFER SITE, so the
// miss is attributable rather than silent.
//
// MEASURED BEFORE THE RULE, against the runtime, because the instrument's reach
// is the thing that decides which of these four forms can be closed at all:
// V8 reports `useTag -> mark`, with the enclosing function as the caller, so
// this one is checkable. A `for-of` is too — both `[Symbol.iterator]` and
// `next` come back attributed to the enclosing function. An `await` on a
// thenable is NOT: V8 reports `<top> -> then`, because the promise machinery
// makes the call, so a model deriving `useAwait -> then` would be contradicted
// by the oracle rather than confirmed by it.
//
// THE TAG RETURNS A FUNCTION on purpose. The value half of this cell is that a
// tagged template EVALUATES to what the tag returns, and `may_be_node` already
// carries a call's value through `resolves` — so calling the result is what
// gives that half a site instead of a claim.
function stamped(n) {
  trace();
  return n * 3;
}

// NO REST PARAMETER, deliberately: `(strings, ...subs)` is how a tag is usually
// written and it introduces `rest_element`, a node kind this model's vocabulary
// does not declare — `vocabulary_gap[audit]` said so on the first full run. A
// fixture for one construct must not smuggle in a second.
function mark(strings, sub) {
  trace();
  return stamped;
}

export function useTag(n) {
  trace();
  const f = mark`a ${n} b`;
  return f(n);
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
    useAbrupt(1),
    useCased(1),
    useDormant(1),
    useFuse(1),
    useThrownValue(1),
    useNested(1),
    useWithReturn(1),
    rethrown(1),
    useCaught(1),
    useGauge(1),
    useShim(1),
    useKeyA(1),
    useKeyB(1),
    closureRead(1)(),
    makeThrower(1),
    useTwoHops(1),
    useStaticOnClass(1),
    useMethodOnInstance(1),
    useStaticOnInstance(1),
    useMethodOnClass(1),
    useTag(1),
    useIterable(1),
    useForOfArray(1),
    useForOfGen(1),
    useGuard(1),
    useTry(1),
    useLoops(1),
    await useAwait(1),
    useStall(1),
    useTmplKey(1),
    usePanel(1),
    useRack(1),
    useShelf(1),
    useBin(1),
    run(1),
    seeded,
  ];
}
