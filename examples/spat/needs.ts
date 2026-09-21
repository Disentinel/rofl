// needs.ts — A NEED IS A LINE OF THE FAMILY'S BOOK before it has a time (S3f,
// 2026-09-21). «Репетиция группы — надо убедиться, что все могут, и
// забронировать репточку»; «физио у одного из взрослых каждую неделю есть, время назначают
// заново». The rules are spat.rofl §15 (the state is derived, never stored —
// open, blocked, placed, done, missed, per week), access.rofl §5c (done /
// skipped / remind me / reminded are dated lines of a person's book). This
// file is the sugar and the renderers: `need add` is `rule add` of the need's
// facts, `need list` reads the state under each week, `place <need>` lends
// the need's shape to `place`, `retire <блок>` writes `retired(...)`,
// `reminders` prints who is to be nagged about what, and when.

import type { Rofl } from '../../src/api.ts';
import { dayOrder, hhmm, mins, ru, table } from './spat.ts';
import { SpatError, isoNow, myBook, put, sayMoment, type Store } from './store.ts';
import { dateToken, under, weekOf } from './dates.ts';
import { names, tagged } from './edits.ts';
import { loose } from './notes.ts';
import { line, slug, words } from './places.ts';
import { HH, run as rule } from './rules.ts';
import { readClauses } from './volume.ts';

export const USAGE = 'need add [<atom>] "<Что>" <минут> <кто[,кто…]> (every | by <дата> | in <неделя>) [at <место>] [req booked "<текст>" <кто>] [req item "<текст>" [<кто>]] [req confirm <кто>]   · need list · need retract <id> · retire <блок> · reminders [--due] [--sent <id>]';
const ATOM = /^[a-z][a-z0-9_]*$/;
const bad = (what: string): never => { throw new SpatError(2, `не разобрал: ${what}\n\nДопустимо:\n  spat ${USAGE}`); };
const KIND: Record<string, string> = { booked: 'booked', 'бронь': 'booked', 'забронировать': 'booked', item: 'item', 'вещь': 'item', 'взять': 'item', confirm: 'confirm', 'подтвердить': 'confirm', 'подтверждение': 'confirm' };
const unq = (s: string): string => s.replace(/^"|"$/g, '');
const kinds = (r: Rofl): Map<string, string> => new Map(table(r, 'person', 'P, K').map((x) => [x.P, x.K]));

/** `[<atom>] "<Что>" <минут> <кто,…> (every|by <дата>|in <неделя>) [at <место>] [req …]…` → the clauses of one `rule add`. */
export function parseNeed(s: Store, text: string): { id: string; clauses: string; summary: string; reqs: string[] } {
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(text)) bad('управляющий символ; потребность — одна строка');
  const r = s.r; const w = words(text); const N = names(r); const K = kinds(r);
  let i = 0; let id: string; let name: string | undefined;
  if (w[0]?.q) { name = w[0].t; id = slug(name); i = 1; if (!ATOM.test(id)) bad(`atom для «${name}» не выводится — дай его сам: need add <atom> "${name}" …`); }
  else { id = w[0]?.t ?? bad('нет atom и нет названия'); if (!ATOM.test(id)) bad(`atom: '${id}' — латиницей, или название в кавычках`); if (w[1]?.q) { name = w[1].t; i = 2; } else i = 1; }
  if (name !== undefined && /["\\]/.test(name)) bad('название без кавычек и обратной косой');
  if (r.holds(`need(${id}, _)`)) throw new SpatError(2, `потребность ${id} уже есть — правило ${ruleOf(s, id) ?? '?'}; снять: need retract ${id}`);
  if (K.has(id) || table(r, 'place', 'P').some((x) => x.P === id) || table(r, 'day', 'D, N').some((x) => x.D === id)) bad(`'${id}' уже занято: так называется человек, место или день`);
  if (!/^\d+$/.test(w[i]?.t ?? '')) bad(`минут: '${w[i]?.t ?? ''}' — число`);
  const len = Number(w[i++].t);
  const person = (t: string | undefined, what: string): string => { const a = t === undefined ? undefined : loose(N, t); return a !== undefined && K.has(a) ? a : bad(`${what}: '${t ?? ''}' — мир такого не знает; человек не из семьи: rule add 'person(${t ?? 'x'}, visitor).'`); };
  const who = (w[i++]?.t ?? bad('кто: участники через запятую')).split(',').map((t) => person(t.trim(), 'кто'));
  const rhythm = (w[i++]?.t ?? '').toLowerCase(); let when = ''; let say = '';
  if (/^(every|каждую|еженедельно)$/.test(rhythm)) { if (/^(неделю|week)$/i.test(w[i]?.t ?? '')) i++; when = `need_every(${id}).`; say = 'каждую неделю'; }
  else if (/^(by|до|к)$/.test(rhythm)) { const d = dateToken(s.env, w[i++]?.t ?? '') ?? bad('by <дата>: 25.09 или 2026-09-25'); const wk = weekOf(s, d); when = `need_by(${id}, "${d.ymd}"). need_by_on(${id}, ${wk.week}, ${wk.day}).`; say = `до ${d.ymd} (${ru(wk.day)}, ${wk.week})`; }
  else if (/^(in|на|в)$/.test(rhythm)) { const wk = w[i++]?.t ?? ''; if (!table(r, 'week', 'W').some((x) => x.W === wk)) bad(`in <неделя>: '${wk}' — есть ${table(r, 'week', 'W').map((x) => x.W).join(', ')}`); when = `need_in(${id}, ${wk}).`; say = `на неделе ${wk}`; }
  else bad(`ритм: '${rhythm}' — every | by <дата> | in <неделя>`);
  let where = ''; if (/^(at|в|где)$/i.test(w[i]?.t ?? '')) { const t = w[i + 1]?.t; const a = t === undefined ? '' : N.get(t.toLowerCase()) ?? N.get(slug(t)) ?? ''; if (!table(r, 'place', 'P').some((x) => x.P === a)) bad(`место: '${t ?? ''}' — мир такого не знает; новое: spat place add`); where = `need_where(${id}, ${a}).`; say += `, ${ru(a)}`; i += 2; }
  const reqs: string[] = []; const said: string[] = []; const used = new Set<string>();
  while (i < w.length) {
    if (!/^(req|условие)$/i.test(w[i].t)) bad(`лишнее: '${w.slice(i).map((x) => x.t).join(' ')}'`);
    const kind = KIND[(w[i + 1]?.t ?? '').toLowerCase()] ?? bad(`условие: '${w[i + 1]?.t ?? ''}' — booked | item | confirm`); i += 2;
    let rid: string; let txt: string; let owner: string;
    if (kind === 'confirm') { owner = person(w[i++]?.t, 'confirm <кто>'); if (!who.includes(owner)) bad(`confirm ${ru(owner)}: не участник`); txt = 'может'; rid = `${id}_${owner}`; }
    else {
      if (!w[i]?.q) bad(`${kind}: текст — в кавычках`); txt = w[i++].t; if (/["\\]/.test(txt) || txt === '') bad(`${kind}: текст без кавычек и обратной косой`);
      const t = w[i]?.t; const named = t !== undefined && !/^(req|условие)$/i.test(t);
      if (named) i++; else if (kind === 'booked') bad(`условие «${txt}» без ответственного: req booked "${txt}" <кто>`);
      owner = named ? person(t, 'кто') : s.env.as; rid = `${id}_${kind}${used.has(`${id}_${kind}`) ? String(used.size + 1) : ''}`;
    }
    if (used.has(rid)) bad(`условие ${rid} дважды`); used.add(rid);
    reqs.push(`need_req(${id}, ${rid}). req(${rid}, ${kind}, "${txt}", ${owner}). constraint(${rid}, ${owner}, household).`);
    said.push(`${kind === 'confirm' ? `${ru(owner)} подтвердит` : `${txt} — ${ru(owner)}`} (${rid})`);
  }
  const clauses = [`need(${id}, ${id}).`, ...(name !== undefined && name !== id ? [`ru_name(${id}, "${name}").`] : []), ...who.map((p) => `need_for(${id}, ${p}).`), `need_len(${id}, ${len}).`, when, where, `constraint(${id}, ${s.env.as}, household).`, ...reqs].filter((x) => x !== '').join(' ');
  return { id, clauses, summary: `${name ?? id} (${id}) — ${who.map(ru).join(', ')}, ${mins(len)}, ${say}`, reqs: said };
}
/** The rule of the family's book that holds `need(N, _)` — or `retired(B)`. */
const ruleOf = (s: Store, id: string, rel = 'need'): string | undefined => readClauses(s.vol, HH).find((c) => c.clause.body.length === 0 && c.clause.head.rel === rel && c.clause.head.args[0]?.k === 'a' && c.clause.head.args[0].name === id)?.id;

/** `rule add` under a quiet console: its id and its refusals come through, the per-fact «в мир семьи» lines do not. */
function ruled(s: Store, text: string, what: string): { code: number; id: string; lines: string[] } {
  const lines: string[] = []; const log = console.log;
  console.log = (...xs: unknown[]): void => { lines.push(xs.map(String).join(' ')); };
  let code: number; try { code = rule(s, ['add', text]); } finally { console.log = log; }
  const id = /(r_[0-9a-f]+)/.exec(lines.join('\n'))?.[1] ?? '?';
  const kept = lines.join('\n').split('\n').filter((l) => /НЕ ДЕЙСТВУЕТ|не заводит|не вошло|ПРЕДЛОЖЕНИЕ|подтвердить/.test(l)).map((l) => `  ${l.trim()}`);
  return { code, id, lines: [`${what} (${id}${code === 3 ? ', ждёт confirm' : ''})`, ...kept] };
}

export function add(s: Store, text: string): number {
  const p = parseNeed(s, text);
  const got = ruled(s, p.clauses, `потребность ${p.summary}`);
  for (const l of [got.lines[0], ...(p.reqs.length > 0 ? [`  условия: ${p.reqs.join(' · ')}`] : []), ...got.lines.slice(1)]) console.log(l);
  if (got.code === 0) for (const l of needLines(s.r)) if (l.includes(ru(p.id))) console.log(`  !! ${l}`);
  return got.code;
}

/** A need's conditions this week: open, done, skipped — with the words `need list` and the «!!» lines use. */
const reqRows = (r: Rofl, n: string): { R: string; kind: string; text: string; owner: string; st: 'open' | 'done' | 'skipped' }[] =>
  table(r, 'need_req', 'N, R').filter((x) => x.N === n).map((x) => { const q = table(r, 'req', 'R, K, T, O').find((y) => y.R === x.R)!; return { R: x.R, kind: q.K, text: unq(q.T), owner: q.O, st: r.holds(`req_done(${x.R})`) ? 'done' : r.holds(`req_skip(${x.R})`) ? 'skipped' : 'open' }; });
const blockOf = (r: Rofl, n: string): string => table(r, 'stands', 'N, D, F, T').filter((x) => x.N === n).sort((a, b) => dayOrder(r).get(a.D)! - dayOrder(r).get(b.D)!).map((x) => `${ru(x.D)} ${hhmm(x.F)}–${hhmm(x.T)}`).join(', ');
/** «репетиция чт 19:00: не забронировано — репточка (Вадим)» — the line of one open condition, reminders and «!!» alike. */
export function reqLine(r: Rofl, R: string): string {
  const n = table(r, 'need_req', 'N, R').find((x) => x.R === R)?.N ?? '?'; const q = reqRows(r, n).find((x) => x.R === R);
  if (!q) return `${R}: условия нет`;
  const at = table(r, 'stands', 'N, D, F, T').filter((x) => x.N === n)[0];
  const head = `${ru(n)}${at ? ` ${ru(at.D)} ${hhmm(at.F)}` : ''}`;
  if (q.kind === 'confirm') return r.holds(`no_window(${q.owner})`) ? `${ru(n)}: не знаю, когда может ${ru(q.owner)}` : `${head}: не подтвердил ${ru(q.owner)}`;
  return `${head}: ${q.kind === 'booked' ? 'не забронировано' : 'не взято'} — ${q.text} (${ru(q.owner)})`;
}
/** THE «!!» LINES of the needs for tomorrow/show/warnings: an open need (any day — it is not placed), a blocked one
 *  by each reason; on a day view, the block's own day and the dayless lines. */
export function needLines(r: Rofl, day?: string): string[] {
  const out: string[] = [];
  for (const x of table(r, 'need_state', 'N, W, S')) {
    const days = table(r, 'stands', 'N, D, F, T').filter((y) => y.N === x.N).map((y) => y.D);
    const here = day === undefined || days.includes(day);
    if (x.S === 'open') out.push(`не поставлено на неделю: ${ru(x.N)} (${table(r, 'need_for', 'N, P').filter((y) => y.N === x.N).map((y) => ru(y.P)).join(', ')})`);
    if (x.S !== 'blocked') continue;
    for (const b of table(r, 'need_block', 'N, Why').filter((y) => y.N === x.N)) {
      const m = /^(\w+)\((\w+)\)$/.exec(b.Why)!; const [, why, arg] = m;
      if (why === 'req' && (here || r.holds(`no_window(${reqRows(r, x.N).find((q) => q.R === arg)?.owner})`))) out.push(reqLine(r, arg));
      else if (why === 'no_window') { const l = `${ru(x.N)}: не знаю, когда может ${ru(arg)}`; if (!out.includes(l)) out.push(l); }
      else if (why === 'missing' && here) out.push(`${ru(x.N)} ${blockOf(r, x.N)}: в блоке нет ${ru(arg)}`);
      else if (why === 'short' && (day === undefined || day === arg)) out.push(`${ru(x.N)} ${ru(arg)}: блок короче нужного (${table(r, 'need_len', 'N, M').find((y) => y.N === x.N)?.M} мин)`);
    }
  }
  return [...new Set(out)];
}

/** `need list`: every need of the world and the book, and its state under each of its weeks. */
function list(s: Store): number {
  const r = s.r; const ns = table(r, 'need', 'N, E');
  if (ns.length === 0) { console.log('потребностей нет: spat need add …'); return 0; }
  const weeks = table(r, 'week', 'W').map((x) => x.W); const cur = s.week;
  for (const n of ns) {
    const rh = table(r, 'rhythm', 'N, R').find((x) => x.N === n.N)?.R ?? '?'; const rid = ruleOf(s, n.N);
    const who = table(r, 'need_for', 'N, P').filter((x) => x.N === n.N).map((x) => ru(x.P)).join(', ');
    console.log(`${ru(n.N)} (${n.N}) — ${who} · ${mins(Number(table(r, 'need_len', 'N, M').find((x) => x.N === n.N)?.M ?? 0))} · ${rh === 'every' ? 'каждую неделю' : rh.replace(/^by\("?(.*?)"?\)$/, 'до $1').replace(/^in\((.*)\)$/, 'на неделе $1')}${(table(r, 'need_where', 'N, P').find((x) => x.N === n.N) ?? { P: '' }).P ? ` · ${ru(table(r, 'need_where', 'N, P').find((x) => x.N === n.N)!.P)}` : ''}${rid ? ` · правило ${rid}` : ' · мир'}`);
    const rq = reqRows(r, n.N); if (rq.length > 0) console.log(`  условия: ${rq.map((q) => `${q.kind === 'confirm' ? `${ru(q.owner)} подтвердит` : `${q.text} — ${ru(q.owner)}`} (${q.R})`).join(' · ')}`);
    for (const w of table(r, 'need_week', 'N, W').filter((x) => x.N === n.N).map((x) => x.W).sort((a, b) => weeks.indexOf(a) - weeks.indexOf(b))) {
      under(s, w);
      const st = table(r, 'need_state', 'N, W, S').find((x) => x.N === n.N)?.S ?? '?'; const at = blockOf(r, n.N);
      const skipped = reqRows(r, n.N).filter((q) => q.st === 'skipped').map((q) => q.text);
      const els = table(r, 'elsewhere', 'N, D, P').filter((x) => x.N === n.N).map((x) => `${ru(x.D)} в ${ru(x.P)}`);
      const why = st === 'blocked' ? needLines(r).filter((l) => l.startsWith(ru(n.N))) : [];
      console.log(`  ${w}: ${st === 'open' ? 'не поставлено' : st === 'placed' ? `поставлено — ${at}` : st === 'blocked' ? `${at ? `стоит ${at}` : 'не поставлено'}, но: ${why.map((l) => l.replace(/^[^:]*: /, '')).join('; ')}` : st === 'done' ? `было — ${at}` : st === 'missed' ? 'не было' : st}${skipped.length > 0 ? `; пропущено: ${skipped.join(', ')}` : ''}${els.length > 0 ? ` (не там: ${els.join(', ')})` : ''}`);
    }
  }
  under(s, cur);
  return 0;
}

/** `retire <блок>` / «это не обычное <блок>»: the typical line is the first week's mistake — `retired(Block)` into the family's book. */
export function retire(s: Store, text: string): number {
  const t = words(text).map((x) => x.t).filter((x) => !/^(это|не|обычное|обычный|обычная|usual|not)$/i.test(x))[0] ?? bad('retire <блок>');
  const ev = names(s.r).get(t.toLowerCase()) ?? bad(`блок: '${t}' — мир такого не знает`);
  const u = table(s.r, 'usual', 'C, E, W, P, Sp, F, T').filter((x) => x.E === ev);
  if (u.length === 0) bad(`${ru(ev)} — не типовой блок (типовые: ${[...new Set(table(s.r, 'usual', 'C, E, W, P, Sp, F, T').map((x) => x.E))].sort().map(ru).join(', ')})`);
  if (s.r.holds(`retired(${ev})`)) { console.log(`${ru(ev)} уже не обычный (${ruleOf(s, ev, 'retired') ?? 'мир'})`); return 0; }
  const got = ruled(s, `retired(${ev}).`, `${ru(ev)} больше не обычный (${u.map((x) => `${ru(x.Sp)} ${hhmm(x.F)}–${hhmm(x.T)}`).join(', ')}); если он нужен — заведи потребность или ставь по неделям`);
  for (const l of got.lines) console.log(l);
  return got.code;
}

/** `place <need>`: the need's shape for maybe.ts — or the guest with no window this week, said and no slot at all. */
export function placeSpec(s: Store, id: string, week: string): { what: string; dur: number; who: string[]; where: string; week: string } | undefined {
  const r = s.r; const rh = table(r, 'rhythm', 'N, R').find((x) => x.N === id)?.R ?? 'every';
  const own = /\((\w+)\)$/.exec(rh)?.[1]; const wk = own ? (rh.startsWith('by') ? table(r, 'need_by_on', 'N, W, D').find((x) => x.N === id)?.W ?? week : own) : week;
  under(s, wk);
  const who = table(r, 'need_for', 'N, P').filter((x) => x.N === id).map((x) => x.P);
  const dark = who.filter((p) => r.holds(`no_window(${p})`));
  if (dark.length > 0) { console.log(`Куда поставить «${ru(id)}» — неделя ${wk}: некуда\n  ${dark.map((p) => `не знаю, когда может ${ru(p)} — жду: avail ${p} <день> <от>-<до>`).join('\n  ')}`); return undefined; }
  return { what: table(r, 'need', 'N, E').find((x) => x.N === id)!.E, dur: Number(table(r, 'need_len', 'N, M').find((x) => x.N === id)?.M ?? 60), who, where: table(r, 'need_where', 'N, P').find((x) => x.N === id)?.P ?? table(r, 'base', 'B')[0].B, week: wk };
}

// ---------------------------------------------------------------------------
// reminders — who, what, when (spat.rofl §15 `due`); the scheduled send marks what it sent


/** `reminders [--due] [--format tg] [--sent <R>…]` (me or the operator): every due moment, or those reached; `--sent` writes
 *  `e_reminded(E, R, Now)` into p_me — the frame goes on from there. */
export function reminders(s: Store, rest: string[]): number {
  if (s.env.as !== 'me' && !s.r.holds(`role(${s.env.as}, operator)`)) { console.log(`отказано: reminders — рассылка (me) или оператор; ${ru(s.env.as)} — нет`); return 4; }
  const now = Number(table(s.r, 'now_min', 'N')[0]?.N ?? 0);
  const sent = rest.indexOf('--sent');
  if (sent >= 0) {
    const ids = rest.slice(sent + 1).filter((x) => !x.startsWith('--')); if (ids.length === 0) bad('--sent <id>');
    const me = s.books.find((b) => b.user === 'me') ?? myBook(s);
    for (const R of ids) {
      if (!s.r.holds(`req(${R}, _, _, _)`)) throw new SpatError(2, `нет такого условия: ${R}`);
      const id = 'e_' + Buffer.from(`${R}${isoNow(s.env)}`).toString('hex').slice(0, 8);
      put(s, me, tagged(me.book, [`e_reminded(${id}, ${R}, ${now}).`, `edit_at(${id}, "${isoNow(s.env)}").`, `edit_via(${id}, ${s.env.via}).`, `for_week(${id}, ${s.week}).`]), `reminded ${R}`);
      console.log(`отмечено: ${R} напомнено ${sayMoment(now)}`);
    }
    return 0;
  }
  const due = table(s.r, 'due', 'R, P, T').map((x) => ({ R: x.R, P: x.P, t: Number(x.T) })).filter((x) => !rest.includes('--due') || x.t <= now).sort((a, b) => a.t - b.t || (a.R < b.R ? -1 : 1));
  const tg = s.fmt === 'tg';
  if (due.length === 0) { console.log(rest.includes('--due') ? `напоминать некому (${sayMoment(now)})` : 'напоминаний нет: ни одного открытого условия со сроком'); return 0; }
  if (!tg) console.log(`${rest.includes('--due') ? 'к отправке' : 'напоминания'} (сейчас ${sayMoment(now)}): ${due.length}`);
  for (const x of due) console.log(`${tg ? '' : '  '}${ru(x.P)} · ${reqLine(s.r, x.R)} · ${sayMoment(x.t)}${tg ? '' : `  [${x.R}]`}`);
  return 0;
}

export function run(s: Store, rest: string[]): number {
  const [verb, ...args] = rest;
  if (verb === 'add' || verb === 'добавить') return add(s, args.length === 1 && /\s/.test(args[0]) ? args[0] : line(args));
  if (verb === 'list' || verb === 'список') return list(s);
  if (verb === 'retract' || verb === 'снять') {
    const id = args[0] ?? bad('need retract <id>'); const rid = ruleOf(s, id) ?? (() => { throw new SpatError(2, `потребности ${id} нет в книге семьи${s.r.holds(`need(${id}, _)`) ? ' — она задана миром' : ''}`); })();
    const code = rule(s, ['retract', rid]); if (code === 0) console.log(`потребность ${ru(id)} снята вместе с условиями`); return code;
  }
  throw new SpatError(2, USAGE);
}
