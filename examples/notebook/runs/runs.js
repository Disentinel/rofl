function hit(tag) { (globalThis.__hit ?? (() => {}))(tag); }
let total = 0;

function viaForEach() { [1, 2].forEach((x) => { hit('forEach'); total += x; }); }
function viaMap() { return [1].map(function double(x) { hit('map'); return x * 2; }); }
function viaSort() { return [2, 1].sort((a, b) => { hit('sort'); return a - b; }); }
function throwsInForEach() { [1].forEach(() => { throw new Error('cb'); }); }
function catchesForEach() { try { [1].forEach(() => { throw new Error('cb'); }); } catch (e) { hit('caught'); } }
function viaGetter() { const { v } = { get v() { hit('getter'); total += 1; return 1; } }; return v; }
function viaTimeout() { setTimeout(() => { hit('timeout'); total = 9; }, 0); }
function viaThen() { Promise.resolve(1).then(() => { hit('then'); total = 7; throw new Error('later'); }); }
function passesOnly() { const f = () => { hit('never'); total = 1; }; return [f]; }

function viaExecutor() { return new Promise((resolve) => { hit('executor'); total += 2; resolve(1); }); }
function rejectsInExecutor() { return new Promise(() => { throw new Error('rejects'); }); }
function make() { hit('field'); total += 3; return [1]; }
function failing() { throw new Error('field'); }
class Holder { items = make(); }
class Fails { broken = failing(); }
function viaField() { return new Holder(); }
function throwsInField() { return new Fails(); }
function declared() { hit('declared'); total += 1; }
function viaCall() { declared.call(null, 1); }
function viaApply() { declared.apply(null, [2]); }
const arrow = () => { hit('arrowCall'); };
function viaArrowCall() { arrow.call(null); }
function nameOfDeclared() { return declared.name + Holder.name; }
class Built { constructor() { hit('constructor'); total += 1; } }
class Refuses { constructor() { throw new Error('ctor'); } }
function viaConstructor() { return new Built(); }
function throwsInConstructor() { return new Refuses(); }
