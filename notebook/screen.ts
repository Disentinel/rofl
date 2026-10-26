// A notebook's screen (docs/intents.md 7, scenario 4): the wants of the `shows` capabilities of a `render` adapter, each a component of the kit its
// book declares (`component(Cap, Kind)`), its slots the want's arguments by their `arg` names. What a person does on it comes back as facts of the
// adapter's book, a later tick: `clicked[A](W)` for a button pressed, `filled[A](W, Text)` for a field typed in. Pure: the host draws.

/** One component on the screen: the want it draws, its adapter, its kind, its slots. */
export type Part = { key: string; adapter: string; cap: string; kind: string; slots: Record<string, string> };
/** The rows of a literal over the last run, null where nothing can put a row there. */
export type Rows = (lit: string) => Record<string, string>[] | null;

/** The relations a screen is drawn from, read after the run. */
export const SCREEN_RELS = ['adapter', 'capability', 'component', 'arg', 'want_arg', 'want_of'];

export const KINDS = ['heading', 'text', 'card', 'button', 'field'] as const;

/** The screen of the last run: headings, texts, cards, buttons, then fields, each kind in the order of its wants' keys. */
export function screenOf(rows: Rows): Part[] {
  const all = (lit: string) => rows(lit) ?? [];
  const renders = new Set(all('adapter(A, render, X)').map((r) => r.A));
  if (!renders.size) return [];
  const caps = new Map(all('capability(C, A, shows)').filter((r) => renders.has(r.A)).map((r) => [r.C, r.A]));
  const kinds = new Map(all('component(C, K)').map((r) => [r.C, r.K]));
  const names = new Map(all('arg(C, I, N, T)').map((r) => [`${r.C} ${r.I}`, r.N]));
  const args = new Map<string, [number, string][]>();
  for (const r of all('want_arg(W, I, V)')) (args.get(r.W) ?? args.set(r.W, []).get(r.W)!).push([Number(r.I), r.V]);
  const parts: Part[] = [];
  for (const r of all('want_of(W, C)')) {
    const adapter = caps.get(r.C);
    if (!adapter) continue;
    const slots: Record<string, string> = {};
    for (const [i, v] of (args.get(r.W) ?? []).sort((a, b) => a[0] - b[0])) slots[names.get(`${r.C} ${i}`) ?? String(i)] = unquote(v);
    parts.push({ key: r.W, adapter, cap: r.C, kind: kinds.get(r.C) ?? 'text', slots });
  }
  const rank = (p: Part) => { const k = (KINDS as readonly string[]).indexOf(p.kind); return k < 0 ? KINDS.length : k; };
  return parts.sort((a, b) => rank(a) - rank(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The fact a press of a button brings. */
export const clicked = (p: Part) => `clicked[${p.adapter}](${p.key}).`;
/** The fact a field typed in brings; the last text typed is the one kept. */
export const filled = (p: Part, text: string) => `filled[${p.adapter}](${p.key}, ${JSON.stringify(text)}).`;
/** What a person did, kept: a press once, a field's last text. */
export function done(events: string[], fact: string): string[] {
  const field = /^filled\[[^\]]*\]\((.*), "(?:[^"\\]|\\.)*"\)\.$/.exec(fact);
  const rest = field ? events.filter((e) => !e.startsWith(fact.slice(0, fact.indexOf(field[1]) + field[1].length) + ',')) : events;
  return rest.includes(fact) ? rest : [...rest, fact];
}

const unquote = (v: string) => /^"(?:[^"\\]|\\.)*"$/.test(v) ? JSON.parse(v) as string : v;
