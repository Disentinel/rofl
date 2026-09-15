// places.ts — A PLACE IS THREE FACTS OF THE FAMILY'S BOOK. «Каждый четверг
// математика в American Academy, это новое место» had no verb: places were
// the world's (`place/1`, `ru_name/2`, `travel/3`), and `add … <where>` refused
// a name the world did not know. The mechanism is spat.rofl §14 / bridge.rofl —
// a fact of the book [hh] on an edb relation is one more line of the world —
// and `spat place add [<atom>] "<Название>" [<минут> от дома]` is sugar over
// `rule add 'place(a). ru_name(a, "Название"). travel(home, a, M).'`: the atom
// slugged from the name when none is given (the model transliterates
// nothing), the name checked against what the world already calls something.
// `rule retract` of a place is refused while a block stands there (rules.ts).

import { ru, rows, table } from './spat.ts';
import { SpatError, type Store } from './store.ts';
import { names } from './edits.ts';
import { HH, run as rule } from './rules.ts';
import { readClauses } from './volume.ts';

const ATOM = /^[a-z][a-z0-9_]*$/;
export const USAGE = 'place add [<atom>] "<Название>" [<минут> от дома]   (взрослый; = rule add place/ru_name/travel)   ·   rule retract <id> снимает место, пока на нём нет блоков';
const bad = (what: string): never => { throw new SpatError(2, `не разобрал: ${what}\n\nДопустимо:\n  spat ${USAGE}`); };

/** The words of a line, a "quoted phrase" (or «…») one word with `q` set. A quote left open is refused. */
export function words(text: string): { t: string; q: boolean }[] {
  const out: { t: string; q: boolean }[] = [];
  const re = /"([^"]*)"|«([^»]*)»|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined || m[2] !== undefined) out.push({ t: (m[1] ?? m[2]).trim(), q: true });
    else if (/^["«]/.test(m[3])) throw new SpatError(2, `не разобрал: кавычка не закрыта: ${m[3]}`);
    else out.push({ t: m[3], q: false });
  }
  return out;
}
/** argv back into a line: a token the shell handed over whole (it has a space) was quoted. */
export const line = (argv: string[]): string => argv.map((t) => (/\s/.test(t) && !/^["«]/.test(t) ? `"${t}"` : t)).join(' ');

export const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

interface Place { atom: string; name: string; min?: number; }
/** `[<atom>] "<Название>" [<минут> [от дома|from home]]` — the name from the quotes, the atom given or slugged. */
export function parsePlace(text: string): Place {
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(text)) bad('управляющий символ (перевод строки, табуляция, NUL); место — одна строка');
  const w = words(text);
  let i = 0; let atom: string; let name: string;
  if (w[0]?.q) { name = w[0].t; atom = slug(name); i = 1; if (!ATOM.test(atom)) bad(`atom для «${name}» не выводится — дай его сам: place add <atom> "${name}"`); }
  else {
    atom = w[0]?.t ?? bad('place add: нет atom и нет названия');
    if (!ATOM.test(atom)) bad(`atom: '${atom}' — латиницей, [a-z][a-z0-9_]*; или название в кавычках: place add "American Academy"`);
    if (w[1] === undefined || (!w[1].q && /^\d+$/.test(w[1].t))) bad(`название места — в кавычках: place add ${atom} "Название" [<минут> от дома]`);
    name = w[1].t; i = 2;
  }
  if (name === '' || /["\\]/.test(name)) bad(`название: '${name}' — не пустое, без кавычек и обратной косой`);
  let min: number | undefined;
  if (w[i] !== undefined) {
    if (!/^\d+$/.test(w[i].t)) bad(`минут от дома: '${w[i].t}' — число`);
    min = Number(w[i].t); i++;
    if (w[i] !== undefined && /^(от|from)$/i.test(w[i].t) && w[i + 1] !== undefined && /^(дома|home)$/i.test(w[i + 1].t)) i += 2;
  }
  if (w.length > i) bad(`лишнее в конце: '${w.slice(i).map((x) => x.t).join(' ')}'`);
  return { atom, name, min };
}

/** The places the family's book put into the world: every `place[hh]` with its name, its minutes from home, its rule and author. */
export const bookPlaces = (s: Store): { id: string; atom: string; name: string; by: string; min?: number }[] => {
  const home = table(s.r, 'base', 'B')[0]?.B;
  const names = new Map(rows(s.r, 'ru_name[hh](A, N)').map((x) => [x.A, String(x.N).replace(/^"|"$/g, '')]));
  const mins = new Map(rows(s.r, 'travel[hh](H, A, M)').filter((x) => x.H === home).map((x) => [x.A, Number(x.M)]));
  const by = new Map(rows(s.r, 'rule_by[hh](R, U)').map((x) => [x.R, x.U]));
  const idOf = new Map(readClauses(s.vol, HH).filter((c) => c.clause.body.length === 0 && c.clause.head.rel === 'place').map((c) => [c.clause.head.args[0]?.k === 'a' ? c.clause.head.args[0].name : '', c.id]));
  return rows(s.r, 'place[hh](A)').map((x) => ({ id: idOf.get(x.A) ?? '?', atom: x.A, name: names.get(x.A) ?? x.A, by: by.get(idOf.get(x.A) ?? '') ?? '?', min: mins.get(x.A) }));
};

/** `place add …` — SUGAR over `rule add`: the three facts of a place, written to the family's book and reaching the world
 *  through bridge.rofl (spat.rofl §14). The name is checked against everything the world calls something first. */
export function add(s: Store, text: string): number {
  const p = parsePlace(text);
  const N = names(s.r);
  if (N.has(p.atom) || N.has(p.name.toLowerCase())) {
    const a = N.get(p.atom) ?? N.get(p.name.toLowerCase())!;
    const mine = bookPlaces(s).find((x) => x.atom === a);
    if (mine) throw new SpatError(2, `место ${a} уже есть — правило ${mine.id} (${ru(mine.by)}${mine.min === undefined ? ', дорога не задана' : `, ${mine.min} мин от дома`}); чтобы задать заново: spat rule retract ${mine.id}, потом place add`);
    if (table(s.r, 'place', 'P').some((x) => x.P === a)) throw new SpatError(2, `место ${a} уже есть в мире семьи`);
    throw new SpatError(2, `'${a}' уже занято: так называется ${table(s.r, 'person', 'P, K').some((x) => x.P === a) ? 'человек' : 'блок, ограничение или день'} — другой atom`);
  }
  const home = table(s.r, 'base', 'B')[0]?.B ?? bad('в мире нет base/1');
  const code = rule(s, ['add', `place(${p.atom}). ru_name(${p.atom}, "${p.name}").${p.min === undefined ? '' : ` travel(${home}, ${p.atom}, ${p.min}).`}`]);
  if (code !== 0 && code !== 3) return code;
  // rule add has said what a place without a road is (rules.ts, worldSaid); with the minutes the road is known FROM HOME
  // ONLY — between this place and any other (school → here, here → pool) the model still knows nothing, a chain through
  // such a pair is the lint's silence («НЕТ ВРЕМЕНИ В ПУТИ»), and any pair is one more line
  if (p.min !== undefined) console.log(`  дорога известна от дома и домой; между ${p.atom} и другим местом (школа, садик, бассейн) время не задано — такая цепочка без запаса, ребёнка везти некому;\n  задать: spat rule add 'travel(school, ${p.atom}, <минут>).'`);
  return code;
}

/** A place with blocks standing there — the world's, a recurring line's, a book's — for `rule retract` to refuse. */
export function held(s: Store, a: string): string[] {
  return [
    ...table(s.r, 'usual', 'C, E, W, P, Sp, F, T').filter((x) => x.P === a).map((x) => `${ru(x.E)} (${ru(x.W)}, ${ru(x.Sp)})${/^e_/.test(x.C) ? ` [правка ${x.C}]` : ''}`),
    ...rows(s.r, `e_add[L](E, Ev, D, F, T, W, ${a})`).filter((x) => s.r.holds(`acts(${x.E})`)).map((x) => `${ru(x.Ev)} (${ru(x.W)}, ${ru(x.D)}) [правка ${x.E}]`),
  ].sort();
}
