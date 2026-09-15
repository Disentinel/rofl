// places.ts — A PLACE IS A LINE OF THE WORLD A BOOK ADDED. «Каждый четверг
// математика в American Academy, это новое место» had no verb: places were
// the world's (`place/1`, `ru_name/2`, `travel/3`), and `add … <where>` refused
// a name the world did not know. `spat place add [<atom>] "<Название>"
// [<минут> от дома]` writes `e_place(E, Atom, "Название")` and, with the
// minutes, `e_travel(E, Home, Atom, Min)` into the author's book; access.rofl
// derives `place`, `ru_name`, `travel` from the entries that act — an adult's,
// never a helper's (the entry touches the adults of the house). The atom is
// slugged from the name when none is given — the model transliterates nothing.
// `retract <id>` of a place is refused while a block stands there (edits.ts).

import { ru, rows, table } from './spat.ts';
import { SpatError, editId, isoNow, myBook, put, trial, type Store } from './store.ts';
import { entryClauses, names } from './edits.ts';

const ATOM = /^[a-z][a-z0-9_]*$/;
export const USAGE = 'place add [<atom>] "<Название>" [<минут> от дома]   (взрослый)   ·   retract <id> снимает место, пока на нём нет блоков';
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

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

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

/** The places a book added: every acting `e_place`, with its travel if any. */
export const bookPlaces = (s: Store): { id: string; atom: string; name: string; by: string; min?: number; acts: boolean }[] => {
  const by = new Map(table(s.r, 'edit_by', 'E, U').map((x) => [x.E, x.U]));
  const tr = new Map(rows(s.r, 'e_travel[L](E, H, A, M)').map((x) => [x.E, Number(x.M)]));
  return rows(s.r, 'e_place[L](E, A, N)').map((x) => ({ id: x.E, atom: x.A, name: String(x.N).replace(/^"|"$/g, ''), by: by.get(x.E) ?? '?', min: tr.get(x.E), acts: s.r.holds(`acts(${x.E})`) }));
};

/** `place add …`: the name checked against everything the world calls something, the entry tried for the right, one transaction. */
export function add(s: Store, text: string): number {
  const book = myBook(s);
  const p = parsePlace(text);
  const N = names(s.r);
  if (N.has(p.atom) || N.has(p.name.toLowerCase())) {
    const a = N.get(p.atom) ?? N.get(p.name.toLowerCase())!;
    const mine = bookPlaces(s).find((x) => x.atom === a && x.acts);
    if (mine) throw new SpatError(2, `место ${a} уже есть — правка ${mine.id} (${ru(mine.by)}${mine.min === undefined ? ', дорога не задана' : `, ${mine.min} мин от дома`}); чтобы задать заново: spat retract ${mine.id}, потом place add`);
    if (table(s.r, 'place', 'P').some((x) => x.P === a)) throw new SpatError(2, `место ${a} уже есть в мире семьи`);
    throw new SpatError(2, `'${a}' уже занято: так называется ${table(s.r, 'person', 'P, K').some((x) => x.P === a) ? 'человек' : 'блок, ограничение или день'} — другой atom`);
  }
  const home = table(s.r, 'base', 'B')[0]?.B ?? bad('в мире нет base/1');
  const at = isoNow(s.env);
  const id = editId(s.env.as, at, `place ${text.trim()}`);
  const facts = [`e_place(${id}, ${p.atom}, "${p.name}").`, ...(p.min === undefined ? [] : [`e_travel(${id}, ${home}, ${p.atom}, ${p.min}).`])];
  const clauses = entryClauses(book.book, { kind: 'place', summary: p.atom, facts: () => facts }, id, s.env.as, at, s.env.via, s.week);
  const v = trial(s, id, clauses);
  if (v.noRight) {
    console.log(`отказано: место добавляет взрослый семьи, ${ru(s.env.as)} — нет\n  может: ${table(s.r, 'role', 'U, R').filter((x) => x.R === 'adult').map((x) => ru(x.U)).sort().join(', ')}`);
    return 4;
  }
  put(s, book, clauses, `place add ${text.trim()}`);
  // WHAT THE RULES DO WITH IT, said at the door — measured 2026-09-15 on the fixture: with no travel the pair
  // has no `tt`, so a child's run there is `no_way` («некому везти», a block there is code 3) and an adult's
  // chain into it has no slack; with the minutes both are known FROM HOME ONLY — between this place and any
  // other (school → here, here → pool) the model still knows nothing, and a chain through such a pair is the
  // same silence, which `spat` lists as «НЕТ ВРЕМЕНИ В ПУТИ»
  console.log(`место ${p.atom} («${p.name}») добавлено (${id})${p.min === undefined ? '' : `, ${p.min} мин от дома`}`);
  console.log(p.min === undefined
    ? `  время дороги от дома не задано: для модели поездки туда нет — ребёнка везти некому (no_way, блок там даст код 3), у взрослого цепочка туда без запаса;\n  задать: spat retract ${id}, затем place add ${p.atom} "${p.name}" <минут> от дома`
    : `  дорога известна от дома и домой; между ${p.atom} и другим местом (школа, садик, бассейн) время не задано — такая цепочка без запаса, ребёнка везти некому`);
  return 0;
}

/** `retract <id>` of a place: refused with the list while a block stands there — the world's, a recurring line's, a book's. */
export function held(s: Store, id: string): string[] {
  const pl = rows(s.r, `e_place[L](${id}, A, N)`)[0];
  if (!pl) return [];
  const a = String(pl.A);
  return [
    ...table(s.r, 'usual', 'C, E, W, P, Sp, F, T').filter((x) => x.P === a).map((x) => `${ru(x.E)} (${ru(x.W)}, ${ru(x.Sp)})${/^e_/.test(x.C) ? ` [правка ${x.C}]` : ''}`),
    ...rows(s.r, `e_add[L](E, Ev, D, F, T, W, ${a})`).filter((x) => s.r.holds(`acts(${x.E})`)).map((x) => `${ru(x.Ev)} (${ru(x.W)}, ${ru(x.D)}) [правка ${x.E}]`),
  ].sort();
}
