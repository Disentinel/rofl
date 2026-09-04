// beta.mjs — exists to define a SECOND `run`. Two files, one name: a
// resolution that forgets which file it is in reports edges that no execution
// can produce, and this is the pair that shows it.
import { trace } from './trace.mjs';

export function run(n) {
  trace();
  return bhelper(n);
}

function bhelper(n) {
  trace();
  return n - 1;
}

// an object literal whose NAME also exists in alpha.mjs, with a DIFFERENT
// member set. A resolution that forgets which file it is in derives
// `buseNs -> hello`, which no execution here can produce.
const ns = {
  bhello(n) {
    trace();
    return n;
  },
  // SHARED NAME WITH alpha.mjs's `ns.hello`, deliberately: without a member in
  // common the two objects are distinguishable by lookup alone and dropping the
  // file scope changes nothing, which is how that rule survived its own mutant.
  hello(n) {
    trace();
    return n;
  },
};
function buseNs(n) {
  trace();
  return ns.bhello(n) + ns.hello(n);
}

export function bmain() {
  trace();
  return run(5) + buseNs(1);
}
