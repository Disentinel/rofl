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

export function main() {
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
    useOpt(1),
    useArr(1),
    run(1),
    seeded,
  ];
}
