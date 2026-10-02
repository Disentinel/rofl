function use(v) { (globalThis.__seen ?? (() => {}))(v, new Error().stack); }

let shared = 0;
function setShared() { shared = 1; }
function readShared() { use(shared); }

function shadowing() { let shared = 5; shared = 6; use(shared); }

function sibOne() { let v = 1; v = 2; use(v); }
function sibTwo() { let v = 3; v = 4; use(v); }

function bare() { let b; b = 8; use(b); }
function param(p) { p = 9; use(p); }

function leaky() { implicit = 10; }
function readLeak() { use(implicit); }
function caught() { try { throw 1; } catch (er) { er = 11; use(er); } }

function sum() { let t = "a"; t += "b"; use(t); }

setShared(); readShared(); shadowing(); sibOne(); sibTwo(); bare(); param(1);
leaky(); readLeak(); caught(); sum();
