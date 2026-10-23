// The ids of a scan inherited from the previous scan of the same file: a node matched to a node of the previous tree
// takes that node's id, so renaming a local moves the facts that hold its name and no others
// (f_a_rename_gives_new_ids_to_every_statement_naming_it). The engine hands a scanner its previous output only when it
// scans a file again for a kept world (docs/cli.md, the storeroom); a scan from nothing keeps the ids of js_ast.ts.
//
// The match: (1) subtrees equal but for identifier names, the pairs unique on both sides first, then each under its
// matched parent, else the first free; (2) bottom-up, an unmatched node takes the free old node of its kind that most
// of its matched children hang under; (3) top-down, the free children of a matched pair by field and kind, in order.
// An unmatched node keeps its own id, hashed again where an inherited one holds it. A side that is no tree (a parse
// error, an id twice, a child before its parent) inherits nothing.

type T = { id: string; kind: string; parent: number; field: string; kids: number[]; attrs: string; size: number; h: string };

const NAMED = new Set(['identifier', 'jsxidentifier']);

const hash = (s: string): string => {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b + c, 2246822519) ^ (b >>> 13); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
};

function tree(facts: string[]): T[] | undefined {
  const nodes: T[] = [], at = new Map<string, number>();
  for (const f of facts) {
    const m = /^ast_node\[\w+\]\((\w+), (\w+), /.exec(f);
    if (!m) continue;
    if (at.has(m[1])) return undefined;
    at.set(m[1], nodes.length);
    nodes.push({ id: m[1], kind: m[2], parent: -1, field: '', kids: [], attrs: '', size: 1, h: '' });
  }
  for (const f of facts) {
    const c = /^ast_child\[\w+\]\((\w+), (\w+), \d+, (\w+)\)\.$/.exec(f);
    if (c) {
      const p = at.get(c[1]), k = at.get(c[3]);
      if (p === undefined || k === undefined || k <= p || nodes[k].parent >= 0) return undefined;
      nodes[k].parent = p; nodes[k].field = c[2]; nodes[p].kids.push(k);
      continue;
    }
    const a = /^ast_attr\[\w+\]\((\w+), (\w+), ([\s\S]*)\)\.$/.exec(f);
    const n = a && at.get(a[1]);
    if (n != null && !(a![2] === 'name' && NAMED.has(nodes[n].kind))) nodes[n].attrs += a![2] + '=' + a![3] + ',';
  }
  if (nodes.slice(1).some((n) => n.parent < 0)) return undefined;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    n.h = hash(n.kind + '|' + n.attrs + '|' + n.kids.map((k) => nodes[k].field + ':' + nodes[k].h).join(','));
    for (const k of n.kids) n.size += nodes[k].size;
  }
  return nodes;
}

/** For each new node, the old node it is matched to, or -1. */
function match(O: T[], W: T[]): Int32Array {
  const mn = new Int32Array(W.length).fill(-1), mo = new Int32Array(O.length).fill(-1);
  const link = (o: number, n: number): void => { mn[n] = o; mo[o] = n; };
  const linkTree = (o: number, n: number): void => {
    if (mo[o] >= 0 || mn[n] >= 0) return;
    link(o, n);
    if (O[o].kids.length === W[n].kids.length) O[o].kids.forEach((c, i) => linkTree(c, W[n].kids[i]));
  };
  const byHash = (ns: T[]): Map<string, number[]> => {
    const m = new Map<string, number[]>();
    ns.forEach((n, i) => { if (i > 0 && n.size > 1) (m.get(n.h) ?? m.set(n.h, []).get(n.h)!).push(i); });
    return m;
  };
  link(0, 0);
  const hO = byHash(O), hW = byHash(W);
  for (let n = 1; n < W.length; n++) {
    const co = hO.get(W[n].h);
    if (co?.length === 1 && hW.get(W[n].h)!.length === 1) linkTree(co[0], n);
  }
  const next = new Map<string, number>();
  for (let n = 1; n < W.length; n++) {
    const co = hO.get(W[n].h);
    if (mn[n] >= 0 || !co) continue;
    const pm = mn[W[n].parent];
    let o = pm < 0 ? -1 : O[pm].kids.find((c) => mo[c] < 0 && O[c].h === W[n].h && O[c].field === W[n].field) ?? -1;
    if (o < 0) {
      let i = next.get(W[n].h) ?? 0;
      while (i < co.length && mo[co[i]] >= 0) i++;
      next.set(W[n].h, i);
      o = co[i] ?? -1;
    }
    if (o >= 0) linkTree(o, n);
  }
  for (let n = W.length - 1; n > 0; n--) {
    if (mn[n] >= 0) continue;
    const votes = new Map<number, number>();
    for (const k of W[n].kids) {
      const p = mn[k] >= 0 ? O[mn[k]].parent : -1;
      if (p >= 0 && mo[p] < 0 && O[p].kind === W[n].kind) votes.set(p, (votes.get(p) ?? 0) + 1);
    }
    let best = -1, most = 0;
    for (const [p, v] of votes) if (v > most || (v === most && p < best)) { best = p; most = v; }
    if (best >= 0 && most * 2 >= Math.max(W[n].kids.length, O[best].kids.length)) link(best, n);
  }
  for (let n = 0; n < W.length; n++) {
    if (mn[n] < 0) continue;
    const free = new Map<string, number[]>();
    for (const c of O[mn[n]].kids) if (mo[c] < 0) { const k = O[c].field + ' ' + O[c].kind; (free.get(k) ?? free.set(k, []).get(k)!).push(c); }
    for (const c of W[n].kids) if (mn[c] < 0) { const g = free.get(W[c].field + ' ' + W[c].kind); if (g?.length) link(g.shift()!, c); }
  }
  return mn;
}

/** The facts of a scan, each node that matches one of the previous scan's under that node's id. */
export function inherit(facts: string[], previous: string[]): string[] {
  const W = tree(facts), O = tree(previous);
  if (!W?.length || !O?.length) return facts;
  const mn = match(O, W);
  const to = new Map<string, string>(), used = new Set<string>();
  W.forEach((n, i) => { if (mn[i] >= 0) { to.set(n.id, O[mn[i]].id); used.add(O[mn[i]].id); } });
  for (const n of W) {
    if (to.has(n.id)) continue;
    let id = n.id;
    for (let s = 1; used.has(id); s++) id = n.id.slice(0, n.id.indexOf('_') + 1) + hash(n.id + '#' + s).slice(0, 11);
    used.add(id); to.set(n.id, id);
  }
  const id = (x: string): string => to.get(x) ?? x;
  return facts.map((f) => f.replace(/^(ast_\w+\[\w+\]\()(\w+)/, (_, a, x) => a + id(x))
    .replace(/^(ast_child\[.*, )(\w+)(\)\.)$/, (_, a, x, b) => a + id(x) + b));
}

/** The previous output of a scanner, its facts by the id prefix of the file they are of (js_ast.ts idPrefix). A line
 *  that starts no fact goes on the one before: a string value may hold a newline. */
export function previousByPrefix(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let last: string[] | undefined;
  for (const l of text.split('\n')) {
    const m = /^ast_\w+\[\w+\]\((n[0-9a-f]{16}_)/.exec(l);
    if (m) { last = out.get(m[1]) ?? out.set(m[1], []).get(m[1])!; last.push(l); }
    else if (last && !/^(--|\w+(\[\w+\])?\()/.test(l)) last[last.length - 1] += '\n' + l;
    else last = undefined;
  }
  return out;
}
