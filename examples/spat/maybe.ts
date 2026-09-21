// maybe.ts — A HYPOTHESIS IS A BOOK. «Понедельник или среда», «где-нибудь на
// следующей неделе, пока не знаю» are `whatif` and `place` — but WRITTEN, so
// they can be compared later and one of them applied. `spat maybe '<правка>'`
// puts the edit's facts into a book of its own, `[m_<id>]`, in the volume:
// nothing in `main` changes, no rule of access.rofl reads an `m_` book, and
// the loader never registers one as a ledger — `show` is the same world.
// `maybe compare` builds the world under each hypothesis the way `edit` tries
// a candidate: in a FORK of the store, the book given its author's authority,
// `trial(M)` and `before(...)` beside it, and prints what breaks, the holes and
// the slack of the day it touches, with the kernel's own `why` down to the
// hypothesis. `maybe apply <id>` is an ordinary edit — the wall, the trial,
// code 0 or 3 — and the hypothesis stays in its book as history, with the edit
// it became. `place` enumerates slots as hypotheses and keeps none.

import type { Rofl } from '../../src/api.ts';
import { mka, type Clause } from '../../src/unify.ts';
import { chains, dayOrder, hhmm, holes, mins, placements, ru, table } from './spat.ts';
import { SpatError, editId, isoNow, must, myBook, type Store } from './store.ts';
import { addBook, readBook, trailOf, write } from './volume.ts';
import { commit, entryClauses, parseEdit, tagged } from './edits.ts';
import { under, weekOf } from './dates.ts';
import { renderDay } from './tomorrow.ts';
import { problems } from './tg.ts';
import { placeSpec } from './needs.ts';

const TTL_H = 24;
const USAGE = 'spat maybe \'<правка>\' [--as-of <день>] · maybe list · maybe compare [<id>…] · maybe apply <id> · place <что> <минут> [кто] [где] [--week-of W]';

interface Hyp { id: string; clauses: Clause[]; at: string; text: string; week: string; applied?: string; stale: boolean; }
/** The caller's own hypotheses, in the order they were written. */
function hypotheses(s: Store): Hyp[] {
  const out: Hyp[] = [];
  for (const b of s.maybes.filter((b) => b.user === s.env.as)) {
    const cs = readBook(s.vol, b.book);
    const str = (rel: string, i: number): string | undefined => { const t = cs.find((c) => c.head.rel === rel)?.head.args[i]; return t?.k === 's' ? t.v : t?.k === 'a' ? t.name : undefined; };
    const at = str('edit_at', 1) ?? '';
    out.push({ id: b.book, clauses: cs, at, text: trailOf(s.vol, b.book)?.edit?.replace(/^maybe /, '') ?? '', week: str('for_week', 1) ?? s.week,
      applied: str('applied', 1), stale: Date.parse(at) < s.env.now.getTime() - TTL_H * 3_600_000 });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1));
}
const mine = (s: Store, id: string): Hyp => hypotheses(s).find((h) => h.id === id) ?? (() => { throw new SpatError(2, `нет такой гипотезы у ${s.env.as}: ${id}; есть: ${hypotheses(s).map((h) => h.id).join(', ') || 'ни одной'}`); })();

/** `maybe '<правка>' [--as-of <день>]`: parsed as an edit, written as a book. */
function propose(s: Store, text: string, asOf?: string): number {
  myBook(s);
  const e = parseEdit(s.r, text, s.env);
  const at = isoNow(s.env);
  const id = 'm' + editId(s.env.as, at, text.trim()).slice(1);
  const week = e.on ? weekOf(s, e.on).week : s.week;
  const on = asOf === undefined ? [] : tagged(id, [`maybe_on(${id}, ${table(s.r, 'day', 'D, N').some((x) => x.D === asOf) ? asOf : (() => { throw new SpatError(2, `--as-of: день '${asOf}' мир не знает`); })()}).`]);
  addBook(s.vol, id, s.env.as);
  write(s.vol, id, [...entryClauses(id, e, id, s.env.as, at, s.env.via, week), ...on], { at, via: s.env.via, edit: `maybe ${text.trim()}` });
  s.maybes.push({ book: id, user: s.env.as, where: `${s.vol.file}/${id}` });
  console.log(`гипотеза ${id}: ${e.summary} — книга [${id}], в силу не вступает; сравнить: spat maybe compare; применить: spat maybe apply ${id}`);
  return 0;
}

interface Verdict { h: Hyp; days: string[]; breaks: string[]; noRight: boolean; holes: number; slack: number | null; text: string[]; }
/** THE WORLD UNDER ONE HYPOTHESIS: a fork of the store, the book given its
 *  author's authority so `entry`/`acts` read it as a ledger, tried exactly as
 *  `edit` tries — `trial(M)`, and `before` for every defect the day had. */
function underHyp(s: Store, h: Hyp): Verdict {
  const f = s.r.fork();
  under({ ...s, r: f }, h.week);
  const before = table(f, 'defect', 'D, R, K').map((x) => `before(${x.D}, ${x.R}, ${x.K}).`);
  must(f.assert(`authority(${h.id}, ${s.env.as}).\ntrial(${h.id}).\n${before.join('\n')}`), 'trial');
  must(f.assertClauses(h.clauses.filter((c) => c.head.rel !== 'maybe_on' && c.head.rel !== 'applied'), { who: s.env.as }), h.id);
  f.evaluate();
  const on = h.clauses.find((c) => c.head.rel === 'maybe_on')?.head.args[1];
  const ord = dayOrder(f);
  const days = on?.k === 'a' ? [on.name] : [...new Set(table(f, 'touches_day', 'E, D').filter((x) => x.E === h.id).map((x) => x.D))].sort((a, b) => ord.get(a)! - ord.get(b)!);
  const breaks = [...new Set(table(f, 'breaks_on', 'E, D, R').filter((x) => x.E === h.id).map((x) => x.R))].sort();
  const hs = holes(f).filter((x) => days.includes(x.day)).length;
  const cs = chains(f).filter((c) => days.includes(c.day)).map((c) => c.m);
  const text = days.map((d) => (s.fmt === 'tg' ? [`${ru(d)}:`, ...(problems(f, d).length > 0 ? problems(f, d) : ['сходится'])].join('\n')
    : renderDay(f, d, `    ${ru(d)} (неделя ${h.week}):`, false).split('\n').map((l) => `  ${l}`).join('\n')));
  // the kernel's own proof of the hypothesis acting, cut at the depth that reaches its axiom in the book
  const why = f.why(`acts(${h.id})`).text.split('\n').filter((l) => /^ {0,6}\S/.test(l) && !/^\s+not /.test(l)).slice(0, 5);
  text.push(`    why: ${why.join('\n         ')}`);
  return { h, days, breaks, noRight: f.holds(`edit_without_right[audit](${h.id})`), holes: hs, slack: cs.length > 0 ? Math.min(...cs) : null, text };
}

/** `maybe compare [<id>…]`: every live hypothesis of the caller side by side, then each one in full. */
function compare(s: Store, ids: string[]): number {
  const all = hypotheses(s);
  const hs = (ids.length > 0 ? ids.map((i) => mine(s, i)) : all).filter((h) => !h.applied && !h.stale);
  if (hs.length === 0) { console.log(all.length === 0 ? 'гипотез нет: spat maybe \'<правка>\'' : 'живых гипотез нет (применены или старше суток): spat maybe list'); return 0; }
  const vs = hs.map((h) => underHyp(s, h));
  const col = 26;
  const row = (name: string, f: (v: Verdict) => string): string => `  ${name.padEnd(14)}${vs.map((v) => f(v).padEnd(col)).join('')}`.trimEnd();
  console.log(row('', (v) => v.h.id));
  console.log(row('', (v) => v.h.text.slice(0, col - 1)));
  console.log(row('день', (v) => v.days.map(ru).join(',') || '—'));
  console.log(row('ломает', (v) => (v.noRight ? 'без права — не действует' : v.breaks.join(',') || 'нет')));
  console.log(row('дыр', (v) => String(v.holes)));
  console.log(row('запас', (v) => (v.slack === null ? '—' : `${v.slack} мин`)));
  for (const v of vs) { console.log(`\n${v.h.id}: ${v.h.text}`); for (const t of v.text) console.log(t); }
  return 0;
}

function list(s: Store): number {
  const hs = hypotheses(s);
  if (hs.length === 0) { console.log('гипотез нет'); return 0; }
  for (const h of hs) console.log(`  ${h.id}  ${h.at}  ${h.applied ? `применена как ${h.applied}` : h.stale ? 'старше суток, инертна' : 'живая'}  ${h.text}`);
  return 0;
}

/** `maybe apply <id>`: the hypothesis re-tagged into the caller's own book under a new edit id, through `commit` — the wall, the trial, 0 or 3. */
function apply(s: Store, id: string): number {
  const h = mine(s, id);
  if (h.applied) throw new SpatError(2, `${id} уже применена как ${h.applied}`);
  const at = isoNow(s.env);
  const eid = editId(s.env.as, at, `apply ${id}`);
  const book = myBook(s).book;
  const clauses = h.clauses.filter((c) => c.head.rel !== 'maybe_on' && c.head.rel !== 'applied' && c.head.rel !== 'edit_at')
    .map((c) => ({ ...c, head: { ...c.head, persp: mka(book), args: c.head.args.map((a) => (a.k === 'a' && a.name === id ? mka(eid) : a)) } }));
  const code = commit(s, eid, [...clauses, ...tagged(book, [`edit_at(${eid}, "${at}").`])], h.week, { summary: h.text }, `apply ${id}: ${h.text}`);
  if (code !== 4) write(s.vol, id, tagged(id, [`applied(${id}, ${eid}, "${at}").`]), { at, via: s.env.via, edit: `applied as ${eid}` });
  return code;
}

/** `place <what> <minutes> [who] [where] [--week-of W]`: the admissible slots
 *  are the rules' (`want/4`, `admissible/3`, `cand_bad/4`), the enumeration is
 *  the host's, and the few best are each tried as a hypothesis in a fork. */
export function place(s: Store, rest: string[]): number {
  const flat = rest.filter((x, i) => !x.startsWith('--') && rest[i - 1] !== '--week-of');
  const wk = rest.indexOf('--week-of');
  // `place <need>`: the need lends its length, its people, its place and its week (needs.ts); a guest with no window is said
  const spec = flat.length >= 1 && !/^\d+$/.test(flat[1] ?? '') && s.r.holds(`need(${flat[0]}, _)`) ? placeSpec(s, flat[0], wk >= 0 ? rest[wk + 1] : s.week) : undefined;
  if (spec === undefined && flat.length >= 1 && !/^\d+$/.test(flat[1] ?? '') && s.r.holds(`need(${flat[0]}, _)`)) return 0;
  const [what, minutes] = spec ? [spec.what, String(spec.dur)] : flat;
  if (!what || !/^\d+$/.test(minutes ?? '')) throw new SpatError(2, USAGE);
  const dur = Number(minutes);
  const who = spec?.who ?? [flat[2] ?? s.env.as]; const where = spec?.where ?? flat[3] ?? table(s.r, 'base', 'B')[0].B;
  const week = spec?.week ?? (wk >= 0 ? rest[wk + 1] : s.week);
  under(s, week);
  must(s.r.assert(who.map((p) => `want(${what}, ${p}, ${where}, ${dur}).`).join('\n')), 'want'); s.r.evaluate();
  const { ok, why } = placements(s.r, what, dur);
  console.log(`Куда поставить «${ru(what)}» — ${mins(dur)}, ${who.map(ru).join(', ')}, ${ru(where)}, неделя ${week}`);
  if (ok.length === 0) {
    const tally = new Map<string, number>();
    for (const rs of why.values()) for (const x of new Set(rs)) tally.set(x, (tally.get(x) ?? 0) + 1);
    console.log(`  некуда: ${[...tally].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    return 0;
  }
  const at = isoNow(s.env);
  // the best start of each day, four days at most — three adjacent Sunday starts are one answer
  const perDay = ok.filter((x, i) => ok.findIndex((y) => y.day === x.day) === i).slice(0, 3);
  const tried = perDay.map((slot, i) => {
    const id = `h_${i}`;
    const cs = tagged(id, [...who.map((p) => `e_add(${id}, ${what}, ${slot.day}, ${slot.at}, ${slot.at + dur}, ${p}, ${where}).`), `edit_at(${id}, "${at}").`, `edit_via(${id}, ${s.env.via}).`, `for_week(${id}, ${week}).`]);
    return { slot, v: underHyp(s, { id, clauses: cs, at, text: `add ${what} ${slot.day} ${hhmm(slot.at)}-${hhmm(slot.at + dur)}`, week, stale: false }) };
  });
  tried.sort((a, b) => a.v.breaks.length - b.v.breaks.length || a.v.holes - b.v.holes || (b.v.slack ?? 0) - (a.v.slack ?? 0) || b.slot.buffer - a.slot.buffer);
  for (const [i, { slot, v }] of tried.slice(0, 3).entries()) {
    console.log(`  ${i + 1}. ${ru(slot.day)} ${hhmm(slot.at)}–${hhmm(slot.at + dur)}  ломает: ${v.breaks.join(',') || 'нет'} · дыр ${v.holes} · запас ${v.slack === null ? '—' : `${v.slack} мин`} · по краям ${slot.buffer === 999 ? 'весь день' : mins(slot.buffer)}`);
    console.log(`     spat maybe 'add ${what} ${slot.day} ${hhmm(slot.at)}-${hhmm(slot.at + dur)} ${who.join(',')} ${where}'`);
  }
  const tally = new Map<string, number>();
  for (const rs of why.values()) for (const x of new Set(rs)) tally.set(x, (tally.get(x) ?? 0) + 1);
  console.log(`  отсеяно правилами (cand_bad): ${[...tally].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || 'ничего'}; допустимых начал ${ok.length}, испытано ${tried.length}`);
  return 0;
}

export function run(s: Store, rest: string[]): number {
  const [verb, ...args] = rest;
  if (verb === 'list') return list(s);
  if (verb === 'compare') return compare(s, args);
  if (verb === 'apply') return apply(s, args[0] ?? (() => { throw new SpatError(2, USAGE); })());
  if (verb === undefined || verb.startsWith('--')) throw new SpatError(2, USAGE);
  const i = rest.indexOf('--as-of');
  return propose(s, (i >= 0 ? rest.filter((_, j) => j !== i && j !== i + 1) : rest).join(' '), i >= 0 ? rest[i + 1] : undefined);
}
