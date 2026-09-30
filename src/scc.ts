// src/scc.ts — THE STRONGLY CONNECTED COMPONENTS of a graph given as
// successor lists (rust/rofl/src/engine.rs `tarjan`, the same order).
// Iterative Tarjan: the graph is as deep as a derivation is. Each node's
// component id; a component is numbered after every component it reaches.

export function tarjan(succ: number[][]): number[] {
  const n = succ.length;
  const index = new Array<number>(n).fill(-1), low = new Array<number>(n).fill(0), comp = new Array<number>(n).fill(-1);
  const on = new Array<boolean>(n).fill(false), st: number[] = [];
  let next = 0, ncomp = 0;
  for (let root = 0; root < n; root++) {
    if (index[root] !== -1) continue;
    const call: [number, number][] = [[root, 0]];
    index[root] = low[root] = next++;
    st.push(root); on[root] = true;
    while (call.length > 0) {
      const top = call[call.length - 1];
      const v = top[0];
      if (top[1] < succ[v].length) {
        const w = succ[v][top[1]++];
        if (index[w] === -1) { index[w] = low[w] = next++; st.push(w); on[w] = true; call.push([w, 0]); }
        else if (on[w]) low[v] = Math.min(low[v], index[w]);
        continue;
      }
      call.pop();
      if (call.length > 0) { const u = call[call.length - 1][0]; low[u] = Math.min(low[u], low[v]); }
      if (low[v] !== index[v]) continue;
      for (;;) { const w = st.pop()!; on[w] = false; comp[w] = ncomp; if (w === v) break; }
      ncomp++;
    }
  }
  return comp;
}

/** Nodes by id, for a graph keyed by strings: `id(k)` numbers `k` on first use. */
export function indexer(): { id: (k: string) => number; find: (k: string) => number | undefined; keys: string[]; succ: number[][] } {
  const at = new Map<string, number>(), keys: string[] = [], succ: number[][] = [];
  const id = (k: string): number => {
    let i = at.get(k);
    if (i === undefined) { i = keys.length; at.set(k, i); keys.push(k); succ.push([]); }
    return i;
  };
  return { id, find: (k) => at.get(k), keys, succ };
}
