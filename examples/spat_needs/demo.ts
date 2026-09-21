// demo.ts — A NEED BEFORE IT HAS A TIME (S3f, 2026-09-21), exercised from the
// outside: the need as a line of the family's book and its state per week,
// the typical line retired (26), the grammar of `need add` (26a); its
// conditions — booked, item, a guest's yes — what blocks it, the block for
// two, `place <need>` (27); the reminders: who is nagged about what, when,
// and what a person's «напомни» or «не будем» does to that (28). Same fixture
// and helpers as the other spat demos (examples/spat/demolib.ts); the book's
// needs of the fixture (hh.rofl, needs.rofl) are the census's — the demo
// writes its own through `need add`. ONE WORLD ANSWERS MANY QUESTIONS: a
// `spat` spawn is kept for the lines a person reads; everything after it —
// the relations, a list, the next edit — is asked of one opened store in
// this process (`session`), since the fixpoint is the cost and a world is a
// world wherever it is built.
//
//   node --experimental-strip-types examples/spat_needs/demo.ts

import * as fs from 'node:fs';
import { run as verb } from '../spat/edits.ts';
import { FROM, Group, ROOT, fresh, inproc, spat as spawn, sql, type Res } from '../spat/demolib.ts';
import type { Store } from '../spat/store.ts';

/** A spawn that died without a word — SIGSEGV, no code, nothing printed — is asked once more: a child of this tree dies so
 *  on a loaded machine (facts/findings.rofl, f_the_spat_demo_is_cpu_bound…: 1 in ~120 at load 15–40; 1 in ~15 here beside
 *  the sessions), and an answer pinned to a dead child is no golden. A second death stands. */
const spat = async (root: string, as: string, args: string[], extra: Record<string, string | undefined> = {}): Promise<Res> => {
  const r = await spawn(root, as, args, extra);
  return r.code === -1 && /^\s*\[SIG[A-Z]+\]\s*$/.test(r.out) ? spawn(root, as, args, extra) : r;
};
const idOf = (r: string | Res, re = /\((e_[0-9a-f]+)\)/): string => re.exec(typeof r === 'string' ? r : r.out)?.[1] ?? '';
const at = (m: number): { SPAT_NOW: string } => ({ SPAT_NOW: `2026-08-31T21:${String(30 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}+03:00` });
// in this process the zone is the environment's too: a moment («через полчаса») is read in SPAT_TZ, and a spawn sets it
const TZ = { SPAT_TZ: 'Europe/Nicosia' };
const asAlex = (root: string): Record<string, string> => ({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.alex, ...TZ });
const asNanny = (root: string): Record<string, string> => ({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.nanny, ...TZ });
const asRobin = (root: string): Record<string, string> => ({ SPAT_ROOT: root, SPAT_FROM_ID: FROM.robin, ...TZ });
/** One opened store, many questions. `ask` prints `1`/`0` per literal or a row count per `#query` as one line; `run`
 *  runs a verb and prints its output, then its code as `<code>`; `week` re-reads the world under another week.
 *  AN EDIT IS SEEN, A RETRACTION IS NOT: `edit` tries its candidate in the opened world, so what follows in the same
 *  session reads it; `retract`, `rule add`, `need add`, `retire`, `reminders --sent` write the volume alone — they close
 *  a session, and the next one opens the volume afresh. The volume's handle is closed with the session. */
interface Session { s: Store; ask: (qs: string[]) => void; run: (v: string, args: string[], propose?: boolean) => void; week: (w: string) => void; }
const session = (env: Record<string, string>, f: (x: Session) => void): string => inproc(env, (s) => {
  const x: Session = {
    s,
    ask: (qs) => console.log(qs.map((q) => (q.startsWith('#') ? String(s.r.query(q.slice(1)).rows.length) : s.r.holds(q) ? '1' : '0')).join(' ')),
    run: (v, args, propose = false) => { s.propose = propose; let code: number; try { code = verb(s, v, args); } catch (e) { code = (e as { code?: number }).code ?? -1; console.log(String((e as Error).message)); } console.log(`<${code}>`); },
    week: (w) => { s.r.retract(`current(${s.week})`); s.r.assert(`current(${w}).`); s.r.evaluate(); },
  };
  try { f(x); } finally { s.vol.db.close(); }
  return 0;
}).out;
/** The codes a session printed, in order. */
const codesOf = (out: string): string => [...out.matchAll(/^<(-?\d+)>$/gm)].map((m) => m[1]).join(' ');
const longest = (out: string): number => Math.max(...out.split('\n').map((l) => l.length));

// ------------------- 26. the need: a line of the book, a state per week, the typical line retired
async function need(): Promise<Group> {
  const g = new Group('26. need list · retire <блок> — the state is derived per week (open/blocked/placed/done/missed); a block with the need\'s name closes it, whichever layer; «это не обычное <блок>» takes the typical line off every week');
  const root = fresh();
  // PLANTED (A/F): the shipped world's physio need is placed by the typical Monday/Friday line — the first week's timetable
  const l0 = await spat(root, 'robin', ['need', 'list'], at(0));
  g.check('положительный контроль: need list — «физио (physio) — robin · 50м · каждую неделю · физио · мир», w0831 и w0907 «поставлено — пн 12:30–13:20, пт 12:30–13:20»; других потребностей нет',
    l0.code === 0 && /^физио \(physio\) — robin · 50м · каждую неделю · физио · мир\n  w0831: поставлено — пн 12:30–13:20, пт 12:30–13:20\n  w0907: поставлено — пн 12:30–13:20, пт 12:30–13:20\n$/.test(l0.out), l0.out);
  const [placed, spanned, defects] = session(asRobin(root), (x) => x.ask(['need_state(physio, w0831, placed)', '#span(C, physio, W, P, D, F, T)', '#defect(D, R, K)'])).split(' ');
  g.check(`need_state(physio, w0831, placed); span physio 2 строки (пн, пт); defect ${defects} — до retire`, placed === '1' && spanned === '2');
  const rt = session({ ...asRobin(root), ...at(1) }, (x) => x.run('retire', ['physio']));
  g.check('robin: retire physio → 0 «физио больше не обычный (physio_days 12:30–13:20); если он нужен — заведи потребность или ставь по неделям (r_…)»', codesOf(rt) === '0' && /^физио больше не обычный \(physio_days 12:30–13:20\); если он нужен — заведи потребность или ставь по неделям \(r_[0-9a-f]+\)$/m.test(rt), rt);
  const R = /\((r_[0-9a-f]+)\)/.exec(rt)?.[1] ?? '';
  const after = session(asRobin(root), (x) => { x.ask(['#span(C, physio, W, P, D, F, T)', 'need_state(physio, w0831, open)', 'retired(physio)', '#defect(D, R, K)']); x.run('show', ['mon']); x.run('need', ['list']); });
  const [sp0, open0, ret0, def1] = after.split('\n')[0].split(' ');
  g.check(`после retire: span physio 0; need_state(physio, w0831, open); retired(physio); defect не растёт (${defects} → ${def1})`, sp0 === '0' && open0 === '1' && ret0 === '1' && Number(def1) <= Number(defects), after.split('\n')[0]);
  g.check('show mon: «!! не поставлено на неделю: физио (robin)» среди проблем; «12:30–13:20  физио» под robin нет; «БЕЗ ЗАПАСА … физио → забор детей» ушло', /\n  !! не поставлено на неделю: физио \(robin\)\n/.test(after) && !/12:30–13:20  физио/.test(after) && !/физио → забор детей/.test(after), after.split('\n').slice(1, 5).join(' | '));
  g.check('need list: физио w0831 «не поставлено», w0907 «не поставлено»', /физио \(physio\)[^\n]*\n  w0831: не поставлено\n  w0907: не поставлено/.test(after));
  // (B) placing = an ordinary block with the need's name — an added one, this week
  const a = await spat(root, 'robin', ['edit', 'add physio tue 10:00-10:50 robin physio'], at(2));
  g.code('robin: add physio tue 10:00-10:50 robin physio → «применено: physio вт 10:00–10:50»', a, 0);
  g.check('в другой неделе (w0907) блока нет: need_state(physio, w0907, open) — пока retired в силе', session(asRobin(root), (x) => { x.week('w0907'); x.ask(['need_state(physio, w0907, open)']); }) === '1');
  const b = session(asRobin(root), (x) => {
    x.ask(['need_state(physio, w0831, placed)', 'placed(physio, w0831, physio)']); x.run('need', ['list']); x.run('show', ['tue']);
    x.run('retire', ['music']); x.run('retire', ['nothing']); x.run('retire', ['lunch']); x.run('rule', ['retract', R]);
  });
  g.check('need_state(physio, w0831, placed), placed(physio, w0831, physio); need list: w0831 «поставлено — вт 10:00–10:50», w0907 «не поставлено»', b.startsWith('1 1\n') && /w0831: поставлено — вт 10:00–10:50\n  w0907: не поставлено/.test(b), b.split('\n').slice(0, 5).join(' | '));
  g.check('show tue: «10:00–10:50  физио  физио  [правка e_…]» под robin, без «!! не поставлено»', /10:00–10:50  физио +физио +\[правка e_/.test(b) && !/не поставлено на неделю/.test(b));
  g.check(`retire music (добавленный, не типовой) → 2; retire nothing → 2; retire lunch → 0; rule retract ${R} (retired снято) → 0`, codesOf(b) === '0 0 2 2 0 0', codesOf(b));
  const b2 = session(asRobin(root), (x) => { x.ask(['#span(C, physio, W, P, D, F, T)', 'retired(lunch)', '#span(C, lunch, W, P, D, F, T)']); x.week('w0907'); x.ask(['need_state(physio, w0907, placed)']); x.run('retire', ['lunch']); x.run('retire', ['это не обычное walk']); });
  g.check('после: span physio 3 (пн, вт [правка], пт); retired(lunch), обед со span 0; в w0907 physio снова placed (типовая линия вернулась); retire lunch второй раз → 0 «уже не обычный»; «это не обычное walk» → 0 «прогулка больше не обычный»',
    b2.startsWith('3 1 0\n1\n') && codesOf(b2) === '0 0' && /уже не обычный/.test(b2) && /^прогулка больше не обычный/m.test(b2), b2);
  g.check('nanny: retire walk → 4 (правила семьи пишет взрослый)', codesOf(session(asNanny(root), (x) => x.run('retire', ['walk']))) === '4');
  return g;
}

// ------------------- 26a. the grammar of need add, a one-off need by a date, retract, the bot
async function grammar(): Promise<Group> {
  const g = new Group('26a. need add — the grammar and its refusals; a one-off need by a date with an item the author brings; need retract; by telegram a person\'s need is applied, --propose waits');
  const root = fresh();
  const c = session({ ...asRobin(root), ...at(9) }, (x) => x.run('need', ['add', '"cake" 30 robin by 04.09 at shop req item "торт"']));
  g.check('robin: need add "cake" 30 robin by 04.09 at shop req item "торт" → 0 «потребность cake (cake) — robin, 30м, до 2026-09-04 (пт, w0831), магазин (r_…)» + «условия: торт — robin (cake_item)» — item без <кто> за автором',
    codesOf(c) === '0' && /^потребность cake \(cake\) — robin, 30м, до 2026-09-04 \(пт, w0831\), магазин \(r_[0-9a-f]+\)\n  условия: торт — robin \(cake_item\)$/m.test(c), c);
  const bad: [string, string][] = [
    ['"репетиция" без atom (кириллица не слагается)', '"репетиция" 60 robin every'], ['минуты не число', 'x "X" many robin every'], ['кто не из мира', 'x "X" 60 mallory every'],
    ['без ритма', 'x "X" 60 robin'], ['by без заведённой недели (28.09)', 'x "X" 60 robin by 28.09'], ['in чужой недели', 'x "X" 60 robin in w1005'],
    ['booked без ответственного', 'x "X" 60 robin every req booked "зал"'], ['confirm не участника', 'x "X" 60 robin every req confirm alex'],
    ['место не из мира', 'x "X" 60 robin every at moon'], ['хвост', 'x "X" 60 robin every junk'], ['id занят человеком', 'kit "X" 60 robin every'],
    ['id занят потребностью', 'cake "X" 60 robin every'], ['перевод строки', 'x "X" 60\nrobin every'], ['условие дважды', 'x "X" 60 robin every req confirm robin req confirm robin'],
  ];
  const n0 = sql<{ n: number }[]>(root, "SELECT count(*) n FROM clauses WHERE book = 'hh'")[0].n;
  const d = session(asRobin(root), (x) => {
    x.ask(['need(cake, cake)', 'need_by(cake, "2026-09-04")', 'need_by_on(cake, w0831, fri)', 'constraint(cake, robin, household)', 'req(cake_item, item, "торт", robin)', 'constraint(cake_item, robin, household)', 'need_state(cake, w0831, open)', 'need_week(cake, w0907)']);
    x.run('need', ['list']);
    for (const b of bad) x.run('need', ['add', b[1]]);
  });
  g.check('в мире через книгу: need(cake, cake), need_by(cake, "2026-09-04"), need_by_on(cake, w0831, fri), constraint(cake, robin, household), req(cake_item, item, "торт", robin), constraint(cake_item, robin, household); need_state(cake, w0831, open); need_week(cake, w0907) нет', d.startsWith('1 1 1 1 1 1 1 0\n'), d.split('\n')[0]);
  g.check('need list cake: «до 2026-09-04 (пт, w0831) · магазин · правило r_…», «условия: торт — robin (cake_item)», только «w0831: не поставлено»', /^cake \(cake\) — robin · 30м · до 2026-09-04 \(пт, w0831\) · магазин · правило r_[0-9a-f]+\n  условия: торт — robin \(cake_item\)\n  w0831: не поставлено\n(?!  w0907)/m.test(d), d.split('\n').slice(1, 5).join(' | '));
  g.check(`need add — ${bad.length} отказов кодом 2: ${bad.map((b) => b[0]).join(' · ')}`, codesOf(d) === `0 ${bad.map(() => '2').join(' ')}`, codesOf(d));
  g.check('ни один отказ не записан: clauses книги семьи не выросли', sql<{ n: number }[]>(root, "SELECT count(*) n FROM clauses WHERE book = 'hh'")[0].n === n0);
  const e = session(asRobin(root), (x) => { x.run('need', ['retract', 'physio']); x.run('need', ['retract', 'cake']); });
  g.check('need retract physio (потребность мира) → 2; need retract cake → 0 «потребность cake снята вместе с условиями»', codesOf(e) === '2 0' && /^потребность cake снята вместе с условиями$/m.test(e), e);
  const e2 = session(asRobin(root), (x) => { x.ask(['#need(cake, E)', '#need(physio, E)']); x.run('need', ['add', 'x 60 robin,kit every req item "мяч" alex']); });
  g.check('после: need(cake, _) нет, need(physio, _) есть; need add x 60 robin,kit every req item "мяч" alex (без кавычек, два участника, item с ответственным) → 0', e2.startsWith('0 1\n') && codesOf(e2) === '0', e2);
  g.check('need_for(x, robin), need_for(x, kit), req(x_item, item, "мяч", alex)', session(asRobin(root), (x) => x.ask(['need_for(x, robin)', 'need_for(x, kit)', 'req(x_item, item, "мяч", alex)'])) === '1 1 1');
  g.check('alex по telegram: need add y → 0 (факт человека применяется)', codesOf(session({ ...asAlex(root), SPAT_VIA: 'telegram' }, (x) => x.run('need', ['add', 'y "Y" 60 alex every']))) === '0');
  const p = session(asAlex(root), (x) => { x.run('need', ['add', 'z "Z" 60 alex every'], true); x.ask(['need(y, y)']); });
  g.check('alex с --propose: need add z → 3 «(r_…, ждёт confirm)»; y уже в мире; rule_proposed ровно один', codesOf(p) === '3' && /\(r_[0-9a-f]+, ждёт confirm\)/.test(p) && /\n1$/.test(p.trim()) && session(asAlex(root), (x) => x.ask(['#rule_proposed[hh](R)'])) === '1', p);
  return g;
}

// ------------------- 27. conditions, the guest, the block for two, place <need>
async function conditions(): Promise<Group> {
  const g = new Group('27. req booked/confirm — met by done, or by the guest\'s window over the block; what blocks (no_window, missing, short); add <what> … a,b for a guest of the need; place <need> — no slot without the guest\'s window, and said so');
  const root = fresh();
  g.check('alex: rule add person(ivan, visitor). ru_name(ivan, "Иван"). → 0', codesOf(session(asAlex(root), (x) => x.run('rule', ['add', 'person(ivan, visitor). ru_name(ivan, "Иван").']))) === '0');
  const nd = session({ ...asRobin(root), ...at(1) }, (x) => x.run('need', ['add', 'rehearsal "репетиция" 120 robin,ivan every req booked "репточка" alex req confirm ivan']));
  g.check('robin: need add rehearsal "репетиция" 120 robin,ivan every req booked "репточка" alex req confirm ivan → 0 «потребность репетиция (rehearsal) — robin, Иван, 2ч, каждую неделю (r_…)» + «условия: репточка — alex (rehearsal_booked) · Иван подтвердит (rehearsal_ivan)»',
    codesOf(nd) === '0' && /^потребность репетиция \(rehearsal\) — robin, Иван, 2ч, каждую неделю \(r_[0-9a-f]+\)\n  условия: репточка — alex \(rehearsal_booked\) · Иван подтвердит \(rehearsal_ivan\)$/m.test(nd), nd);
  // PLANTED (B2/D): nothing stands, the guest gave no window — blocked, and place has nothing to offer
  const sh = session({ ...asRobin(root), ...at(2) }, (x) => { x.ask(['guest(ivan)', 'windowed(ivan)', 'no_window(ivan)', 'need_block(rehearsal, no_window(ivan))', 'need_state(rehearsal, w0831, blocked)']); x.s.fmt = 'tg'; x.run('show', []); });
  g.check('guest(ivan), windowed(ivan), no_window(ivan); need_block(rehearsal, no_window(ivan)); need_state(rehearsal, w0831, blocked); show (сводка) --format tg: «!! репетиция: не знаю, когда может Иван» под понедельником, ≤ 120', sh.startsWith('1 1 1 1 1\n') && /\n!! репетиция: не знаю, когда может Иван\n/.test(sh) && longest(sh) <= 120, sh.split('\n').slice(0, 4).join(' | '));
  const p0 = await spat(root, 'robin', ['place', 'rehearsal'], at(3));
  g.check('robin: place rehearsal → 0 «Куда поставить «репетиция» — неделя w0831: некуда» + «не знаю, когда может Иван — жду: avail ivan <день> <от>-<до>»; ни одной строки «spat maybe»', p0.code === 0 && p0.out.trim() === 'Куда поставить «репетиция» — неделя w0831: некуда\n  не знаю, когда может Иван — жду: avail ivan <день> <от>-<до>', p0.out);
  const av = await spat(root, 'robin', ['edit', 'avail ivan fri 18:00-22:00'], at(4));
  g.check('robin: avail ivan fri 18:00-22:00 (гость без окна в мире — окно потребности; правка касается потребности) → 0 «применено: Иван пт 18:00–22:00»; window(e_…, ivan, fri, 1080, 1320); no_window(ivan) нет; touches(E, rehearsal)', av.code === 0 && /^применено: Иван пт 18:00–22:00/.test(av.out) && session(asRobin(root), (x) => x.ask([`window(${idOf(av)}, ivan, fri, 1080, 1320)`, 'no_window(ivan)', `touches(${idOf(av)}, rehearsal)`])) === '1 0 1', av.out);
  const p1 = await spat(root, 'robin', ['place', 'rehearsal'], at(5));
  g.check('place rehearsal: «Куда поставить «репетиция» — 2ч, Иван, robin, дом, неделя w0831», слот пт внутри 18:00–22:00, «spat maybe \'add rehearsal fri ??:??-??:?? ivan,robin home\'», отсев no_window, никакого другого дня',
    p1.code === 0 && /^Куда поставить «репетиция» — 2ч, Иван, robin, дом, неделя w0831\n  1\. пт (18|19|20):\d\d–2[0-2]:\d\d/.test(p1.out) && /spat maybe 'add rehearsal fri \d\d:\d\d-\d\d:\d\d ivan,robin home'/.test(p1.out) && /no_window \d+/.test(p1.out) && !/\n  \d\. (пн|вт|ср|чт|сб|вс)/.test(p1.out), p1.out);
  const one = session({ ...asRobin(root), ...at(6) }, (x) => {
    x.run('edit', ['add rehearsal fri 19:00-20:00 robin']);
    x.ask(['need_block(rehearsal, missing(ivan))', 'need_block(rehearsal, short(fri))', 'partial(rehearsal, w0831, ivan)', 'need_state(rehearsal, w0831, blocked)']); x.run('need', ['list']);
    x.run('retract', [String(x.s.r.query('e_add[p_robin](E, rehearsal, fri, 1140, 1200, robin, home)').rows[0]?.bindings.E ?? '?')]);
  });
  g.check('add rehearsal fri 19:00-20:00 robin (один участник, короче нужного) → 0; need_block missing(ivan) и short(fri), partial(rehearsal, w0831, ivan); need list w0831 «стоит пт 19:00–20:00, но: в блоке нет Иван; не забронировано — репточка (alex); блок короче нужного (120 мин)»; retract → 0',
    codesOf(one) === '0 0 0' && /\n1 1 1 1\n/.test(one) && /w0831: стоит пт 19:00–20:00, но: в блоке нет Иван; не забронировано — репточка \(alex\); блок короче нужного \(120 мин\)/.test(one), one);
  const two = await spat(root, 'robin', ['edit', 'add rehearsal fri 19:00-21:00 robin,ivan'], at(7));
  const T = idOf(two);
  const t2 = session(asRobin(root), (x) => { x.ask([`touches(${T}, rehearsal)`, `touches(${T}, robin)`, `touches(${T}, ivan)`, `acts(${T})`, 'req_met(rehearsal_ivan, w0831)', 'req_open(rehearsal_booked)', 'need_state(rehearsal, w0831, blocked)', 'placed(rehearsal, w0831, rehearsal)']); x.run('show', ['fri']); x.run('need', ['list']); });
  g.check('robin: add rehearsal fri 19:00-21:00 robin,ivan → 0 «применено: rehearsal пт 19:00–21:00 (robin, Иван)»; две строки e_add одной правки; touches(E, robin) и touches(E, rehearsal) — гость касается потребности, не себя; acts; req_met(rehearsal_ivan) по окну (19–21 внутри 18–22), rehearsal_booked открыто: blocked, placed(rehearsal, …) есть',
    two.code === 0 && /^применено: rehearsal пт 19:00–21:00 \(robin, Иван\)/.test(two.out) && sql<{ n: number }[]>(root, "SELECT count(*) n FROM facts WHERE ledger = 'p_robin' AND pred = 'e_add' AND args LIKE ?", `%"${T}"%`)[0].n === 2 && t2.startsWith('1 1 0 1 1 1 1 1\n'), two.out + ' | ' + t2.split('\n')[0]);
  g.check('need list w0831: «стоит пт 19:00–21:00, но: не забронировано — репточка (alex)»; show fri: «!! репетиция пт 19:00: не забронировано — репточка (alex)», под Иван «19:00–21:00  репетиция … [правка e_…]»', /w0831: стоит пт 19:00–21:00, но: не забронировано — репточка \(alex\)$/m.test(t2) && /\n  !! репетиция пт 19:00: не забронировано — репточка \(alex\)\n/.test(t2) && /\n  Иван\n    19:00–21:00  репетиция/.test(t2), t2.split('\n').slice(0, 12).join(' | '));
  const stg = await spat(root, 'robin', ['tomorrow', '--format', 'tg'], { SPAT_NOW: '2026-09-03T21:30:00+03:00' });
  g.check('tomorrow (пт) --format tg: «!! репетиция пт 19:00: не забронировано — репточка (alex)» среди проблем, «• 19:00–21:00 репетиция [правка e_…]» под *Иван*, ≤ 120', /^!! репетиция пт 19:00: не забронировано — репточка \(alex\)$/m.test(stg.out) && /\*Иван\*\n• 19:00–21:00 репетиция \[правка e_/.test(stg.out) && longest(stg.out) <= 120, stg.out.split('\n').slice(0, 3).join(' | '));
  // done — by the text, in Russian; the nanny may not; skip — «пропущено», per week
  g.check('nanny: забронировала репточку → 4 (условие alex — семьи, не её); add rehearsal fri 14:00-16:00 nanny,ivan → 4 (гость потребности семьи — не её)', codesOf(session(asNanny(root), (x) => { x.run('edit', ['забронировала репточку']); x.run('edit', ['add rehearsal fri 14:00-16:00 nanny,ivan']); })) === '4 4');
  const dn = await spat(root, 'alex', ['edit', 'забронировал репточку'], at(8));
  const d2 = session(asAlex(root), (x) => { x.ask(['req_met(rehearsal_booked, w0831)', 'need_state(rehearsal, w0831, placed)']); x.run('need', ['list']); x.run('show', ['fri']); x.run('retract', [idOf(dn)]); });
  g.check('alex: «забронировал репточку» → 0 «применено: сделано пн: репточка — репетиция (rehearsal_booked)»; e_done в книге alex; req_met, placed; need list «w0831: поставлено — пт 19:00–21:00»; show fri без «!! репетиция»; retract → 0',
    dn.code === 0 && /^применено: сделано пн: репточка — репетиция \(rehearsal_booked\)/.test(dn.out) && sql<{ n: number }[]>(root, "SELECT count(*) n FROM facts WHERE ledger = 'p_alex' AND pred = 'e_done'")[0].n === 1
    && d2.startsWith('1 1\n') && /w0831: поставлено — пт 19:00–21:00/.test(d2) && !/!! репетиция/.test(d2) && codesOf(d2) === '0 0 0', dn.out + ' | ' + d2.split('\n').slice(0, 10).join(' | '));
  const sk = await spat(root, 'robin', ['edit', 'не будем репточка 07.09'], at(9));
  const s2 = session(asRobin(root), (x) => { x.run('need', ['list']); for (const t of ['done rehearsal_booked', 'сделано: репточка', 'подтвердил Иван', 'done пирожки', 'сделано репетиция', 'skip walk mon', 'скип rehearsal_ivan', 'sick ivan', 'add band fri 14:00-16:00 robin,mallory']) x.run('edit', [t]); });
  g.check('robin: «не будем репточка 07.09» → 0 «применено: не будем: репточка — репетиция (rehearsal_booked) (2026-09-07)»; need list: w0831 снова «стоит …, но: не забронировано», w0907 «не поставлено, но: не знаю, когда может Иван; пропущено: репточка» — по неделям',
    sk.code === 0 && /^применено: не будем: репточка — репетиция \(rehearsal_booked\) \(2026-09-07\)/.test(sk.out) && /w0831: стоит пт 19:00–21:00, но: не забронировано — репточка \(alex\)\n  w0907: не поставлено, но: не знаю, когда может Иван; пропущено: репточка/.test(s2), sk.out + ' | ' + s2.split('\n').slice(0, 8).join(' | '));
  g.check('done rehearsal_booked (id) → 0 · сделано: репточка → 0 · подтвердил Иван → 0 · done пирожки (нет такого) → 2 · сделано репетиция (два — уточни) → 2 · skip walk mon (блок, как раньше) → 0 · скип rehearsal_ivan → 0 · sick ivan (гость — ничей) → 4 · add band … robin,mallory (не из мира) → 2',
    codesOf(s2) === '0 0 0 0 2 2 0 0 4 2', codesOf(s2));
  return g;
}

// ------------------- 28. reminders — who · what · when; sent, asked for, done, skipped
async function reminders(): Promise<Group> {
  const g = new Group('28. due(R, P, At): the 09:00/19:00 frame from K days before the deadline, on from the last one sent; «напомни …» stands instead of the frame until sent; done and skip empty it; spat reminders [--due] [--sent] (me/operator)');
  const root = fresh();
  const tue = (h: number, m: number): { SPAT_NOW: string } => ({ SPAT_NOW: `2026-09-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:00` });
  const ME = { SPAT_ROOT: root, SPAT_AS: 'me', SPAT_TENANT: 'example', ...TZ };
  // PLANTED (H): a booking for alex, the block Friday 19:00, SPAT_NOW Tuesday 09:00 — three days before (remind_days 3)
  g.check('rule add person(ivan…) → 0; need add gig "концерт" 120 robin,ivan every req booked "зал" alex → 0', codesOf(session({ ...asAlex(root), ...tue(7, 58) }, (x) => x.run('rule', ['add', 'person(ivan, visitor). ru_name(ivan, "Иван").']))) === '0' && codesOf(session({ ...asRobin(root), ...tue(7, 59) }, (x) => x.run('need', ['add', 'gig "концерт" 120 robin,ivan every req booked "зал" alex']))) === '0');
  const st = session({ ...asRobin(root), ...tue(9, 0) }, (x) => { x.run('edit', ['avail ivan fri 18:00-22:00']); x.run('edit', ['add gig fri 19:00-21:00 robin,ivan']); x.ask(['deadline(gig_booked, 29809140)', '#frame_at(gig_booked, T)', 'due(gig_booked, alex, 29804220)']); x.run('reminders', []); });
  g.check('avail ivan fri 18:00-22:00 → 0; add gig fri 19:00-21:00 robin,ivan → 0; deadline(gig_booked, пт 19:00 = 29809140); frame_at вт–чт 09:00/19:00 + пт 09:00 = 7 (K = 3 дня до срока, remind_days мира); вт 09:00: due(gig_booked, alex, 29804220); robin: reminders → 4', codesOf(st) === '0 0 4' && /\n1 7 1\n/.test(st), st);
  const r0 = await spat(root, 'me', ['reminders', '--due'], tue(9, 0));
  g.check('me: reminders --due (вт 09:00) → «к отправке (сейчас вт 01.09 09:00): 1» и «  alex · концерт пт 19:00: не забронировано — зал (alex) · вт 01.09 09:00  [gig_booked]»',
    r0.code === 0 && r0.out.trim() === 'к отправке (сейчас вт 01.09 09:00): 1\n  alex · концерт пт 19:00: не забронировано — зал (alex) · вт 01.09 09:00  [gig_booked]', r0.out);
  const tg = await spat(root, 'me', ['reminders', '--due', '--format', 'tg'], tue(9, 0));
  g.check('--format tg: одна строка «alex · концерт пт 19:00: не забронировано — зал (alex) · вт 01.09 09:00», без заголовка и id, ≤ 120', tg.out.trim() === 'alex · концерт пт 19:00: не забронировано — зал (alex) · вт 01.09 09:00' && longest(tg.out) <= 120, tg.out);
  const s1 = await spat(root, 'me', ['reminders', '--sent', 'gig_booked'], tue(9, 0));
  const s1b = session({ ...ME, ...tue(9, 1) }, (x) => { x.run('reminders', ['--due']); x.run('reminders', []); x.run('reminders', ['--sent', 'nothing']); });
  g.check('me: reminders --sent gig_booked → 0 «отмечено: gig_booked напомнено вт 01.09 09:00»; e_reminded в p_me; в 09:01 --due «напоминать некому (вт 01.09 09:01)», reminders — следующее вт 01.09 19:00; --sent nothing → 2',
    s1.code === 0 && s1.out.trim() === 'отмечено: gig_booked напомнено вт 01.09 09:00' && sql<{ n: number }[]>(root, "SELECT count(*) n FROM facts WHERE ledger = 'p_me' AND pred = 'e_reminded'")[0].n === 1
    && /^напоминать некому \(вт 01\.09 09:01\)\n<0>\nнапоминания \(сейчас вт 01\.09 09:01\): 1\n  alex · концерт пт 19:00: не забронировано — зал \(alex\) · вт 01\.09 19:00  \[gig_booked\]\n<0>\n/.test(s1b) && codesOf(s1b) === '0 0 2', s1.out + ' | ' + s1b);
  g.check('alex (оператор): reminders → 0; nanny: reminders --sent gig_booked → 4', codesOf(session({ ...asAlex(root), ...tue(9, 1) }, (x) => x.run('reminders', []))) === '0' && codesOf(session({ ...asNanny(root), ...tue(9, 1) }, (x) => x.run('reminders', ['--sent', 'gig_booked']))) === '4');
  // a person's own moment stands instead of the frame
  const rm = await spat(root, 'alex', ['remind', 'зал', 'вт', '16:30'], tue(9, 2));
  const rm2 = session({ ...asAlex(root), ...tue(9, 3) }, (x) => x.run('reminders', []));
  g.check('alex: remind зал вт 16:30 → 0 «применено: напомню вт 01.09 16:30: зал — концерт (gig_booked)»; reminders (09:03): ровно 16:30, ничего в 19:00', rm.code === 0 && /^применено: напомню вт 01\.09 16:30: зал — концерт \(gig_booked\)/.test(rm.out) && /alex · концерт[^\n]* · вт 01\.09 16:30/.test(rm2) && !/· вт 01\.09 19:00/.test(rm2), rm.out + ' | ' + rm2);
  g.check('--due в 16:29 пусто', /напоминать некому/.test(session({ ...ME, ...tue(16, 29) }, (x) => x.run('reminders', ['--due']))));
  const s3 = session({ ...ME, ...tue(16, 31) }, (x) => { x.run('reminders', ['--due']); x.run('reminders', ['--sent', 'gig_booked']); });
  g.check('в 16:31: --due — 16:30; --sent → «отмечено: gig_booked напомнено вт 01.09 16:31»; в 16:32 дальше кадр: вт 01.09 19:00', /· вт 01\.09 16:30/.test(s3.split('<0>')[0]) && /отмечено: gig_booked напомнено вт 01\.09 16:31/.test(s3) && /alex · концерт[^\n]* · вт 01\.09 19:00/.test(session({ ...asAlex(root), ...tue(16, 32) }, (x) => x.run('reminders', []))), s3);
  const trio = session({ ...asAlex(root), ...tue(17, 0) }, (x) => { for (const t of ['напомни через полчаса', 'напомни завтра утром', 'напомни зал через 2 часа', 'remind зал funday 10:00', 'remind зал вт']) x.run('edit', [t]); });
  g.check('alex в 17:00: «напомни через полчаса» (без условия — его единственное открытое) → «напомню вт 01.09 17:30: зал»; «напомни завтра утром» → «ср 02.09 09:00»; «напомни зал через 2 часа» → «вт 01.09 19:00»; «remind зал funday 10:00» → 2; «remind зал вт» (без времени) → 2',
    codesOf(trio) === '0 0 0 2 2' && trio.split('\n').filter((l) => /напомню/.test(l)).map((l) => /напомню (\S+ \S+ \d\d:\d\d):/.exec(l)?.[1]).join(' | ') === 'вт 01.09 17:30 | ср 02.09 09:00 | вт 01.09 19:00', trio);
  g.check('robin: «напомни через полчаса» → 2 (у robin открытых условий нет — назови); nanny: remind зал вт 18:00 → 4 (условие alex)', codesOf(session({ ...asRobin(root), ...tue(17, 3) }, (x) => x.run('edit', ['напомни через полчаса']))) === '2' && codesOf(session({ ...asNanny(root), ...tue(17, 3) }, (x) => x.run('edit', ['remind зал вт 18:00']))) === '4');
  const r4 = session({ ...asAlex(root), ...tue(17, 4) }, (x) => x.run('reminders', []));
  g.check('reminders в 17:04: ближайшее из трёх «напомни» — вт 01.09 17:30, и только оно', /alex · концерт[^\n]* · вт 01\.09 17:30/.test(r4) && r4.split('\n').filter((l) => /gig_booked/.test(l)).length === 1, r4);
  // done empties it; skip empties it and says «пропущено»
  const dn = await spat(root, 'alex', ['done', 'зал'], tue(17, 5));
  const d2 = session({ ...asAlex(root), ...tue(17, 6) }, (x) => { x.run('reminders', []); x.run('need', ['list']); x.run('retract', [idOf(dn)]); });
  g.check('alex: done зал → 0; reminders: «напоминаний нет: ни одного открытого условия со сроком»; need list gig w0831 «поставлено — пт 19:00–21:00»; retract → 0', dn.code === 0 && /^напоминаний нет: ни одного открытого условия со сроком\n<0>/.test(d2) && /w0831: поставлено — пт 19:00–21:00/.test(d2) && codesOf(d2) === '0 0 0', dn.out + ' | ' + d2);
  const sk = await spat(root, 'alex', ['edit', 'skip gig_booked'], tue(17, 9));
  const s5 = session({ ...asAlex(root), ...tue(17, 10) }, (x) => { x.ask(['#due(gig_booked, P, T)', 'req_skip(gig_booked)']); x.run('need', ['list']); });
  g.check('alex: skip gig_booked → 0 «не будем»; due(gig_booked) пусто, req_skip; need list «w0831: поставлено — пт 19:00–21:00; пропущено: зал»', sk.code === 0 && s5.startsWith('0 1\n') && /w0831: поставлено — пт 19:00–21:00; пропущено: зал/.test(s5), sk.out + ' | ' + s5);
  return g;
}

const t0 = Date.now();
const todo = [need, grammar, conditions, reminders];
const groups: Group[] = new Array(todo.length);
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => { while (next < todo.length) { const i = next++; groups[i] = await todo[i](); } }));
for (const g of groups) for (const l of g.lines) console.log(l);
const n = groups.reduce((a, g) => a + g.n, 0);
const fails = groups.reduce((a, g) => a + g.fails, 0);
console.log(`\n${n - fails}/${n} scenarios`);
console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(fails === 0 ? 0 : 1);
