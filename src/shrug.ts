// shrug.ts — THE SHRUG VOCABULARY, shrug.rofl compiled into src/kernel-dense.ts:
// each reason with its text, and each cause a hole can name with the reason it
// is and its text (docs/aggregates.md, "Shrugs, as built";
// rust/rofl/src/shrug.rs is the same table). One fact extends it.

import { denseFacts } from './dense.ts';
import { SHRUG_DENSE } from './kernel-dense.ts';
import { type Term, type Subst, type Lit, mka, canonTerm, unify, unifyUnknown } from './unify.ts';
import type { FactStore, FactRec } from './store.ts';
import { MAIN, KERNEL_PERSP } from './reflect.ts';

export const SHRUG = 'shrug';

const text = (t: Term): string =>
  t.k === 'a' ? t.name : t.k === 's' ? t.v : t.k === 'f' && t.args[0]?.k === 's' ? t.args[0].v : '';

const reasons = new Map<string, string>();
const causes = new Map<string, { reason: string; text: string }>();
for (const r of denseFacts(SHRUG_DENSE)) {
  if (r.rel === 'shrug_reason' && r.args.length === 2) reasons.set(text(r.args[0]), text(r.args[1]));
  if (r.rel === 'shrug_cause' && r.args.length === 3) causes.set(text(r.args[0]), { reason: text(r.args[1]), text: text(r.args[2]) });
}

/** The reason a hole's cause is, as shrug.rofl declares it. */
export const reasonOf = (cause: string): string | undefined => causes.get(cause)?.reason;
export const reasonText = (reason: string): string | undefined => reasons.get(reason);
export const causeText = (cause: string): string | undefined => causes.get(cause)?.text;
export const shrugReasons = (): string[] => [...reasons.keys()];


/** The atom a shrug row is about, with its book, or null for a kernel target
 *  (a rule, a cell, a lattice, the evaluation). */
export function shrugAtom(t: Term): { persp: string; rel: string; args: Term[] | null } | null {
  if (t.k === 'f' && t.name === 'in' && t.args.length === 2 && t.args[0].k === 'a') {
    const a = shrugAtom(t.args[1]);
    return a && { ...a, persp: t.args[0].name };
  }
  if (t.k === 'f' && t.name === 'every' && t.args.length === 1 && t.args[0].k === 'a') return { persp: '', rel: t.args[0].name, args: null };
  if (t.k === 'a' && !t.name.startsWith('$')) return { persp: MAIN, rel: t.name, args: [] };
  if (t.k === 'f' && !t.name.startsWith('$')) return { persp: MAIN, rel: t.name, args: t.args };
  return null;
}

/** Every shrug row a literal could name, with the bindings it gives. */
export function shrugsOf(store: FactStore, lit: Lit): { row: FactRec; s: Subst }[] {
  const out: { row: FactRec; s: Subst }[] = [];
  for (const row of store.relPersp(SHRUG, KERNEL_PERSP)) {
    const at = shrugAtom(row.args[0]);
    if (!at || at.rel !== lit.rel) continue;
    let s: Subst | null = at.persp === '' ? new Map() : unify(lit.persp, mka(at.persp), new Map());
    if (s && at.args !== null) {
      if (at.args.length !== lit.args.length) continue;
      for (let i = 0; s && i < lit.args.length; i++) s = unifyUnknown(lit.args[i], at.args[i], s);
    }
    if (s) out.push({ row, s });
  }
  return out.sort((a, b) => (a.row.key < b.row.key ? -1 : a.row.key > b.row.key ? 1 : 0));
}

/** A term as a reader writes it: a list in brackets, `_` where a value is not known. */
export function shown(t: Term): string {
  if (t.k === 'a' && t.name === '$unknown_value') return '_';
  if (t.k === 'a' && t.name === '$nil') return '[]';
  if (t.k === 'f' && t.name === '$cons') {
    const xs: string[] = [];
    let l: Term = t;
    for (; l.k === 'f' && l.name === '$cons'; l = l.args[1]) xs.push(shown(l.args[0]));
    return `[${xs.join(', ')}]`;
  }
  if (t.k === 'f') return `${t.name}(${t.args.map(shown).join(', ')})`;
  return canonTerm(t);
}

/** One shrug row as a line: its target, reason, the reason's text, its meta. */
export function shrugLine(row: FactRec): string {
  const [t, r, m] = row.args;
  const reason = r.k === 'a' ? r.name : canonTerm(r);
  const cause = m.k === 'a' ? causeText(m.name) : undefined;
  return `${shown(t)} is a shrug: ${reason}, ${reasonText(reason) ?? ''}; ${cause ? `${shown(m)}, ${cause}` : shown(m)}`;
}

/** WHY A SHRUG: its row, then each root target it rests on with its own row,
 *  and a rule's text where the root is a rule (`ruleText`). */
export function shrugWhy(store: FactStore, row: FactRec, ruleText: (id: string) => string | undefined): string {
  const lines = [shrugLine(row)];
  const m = row.args[2];
  if (m.k === 'f' && m.name === 'from' && m.args.length === 1) {
    for (let l = m.args[0]; l.k === 'f' && l.name === '$cons'; l = l.args[1]) {
      const root = l.args[0];
      const k = canonTerm(root);
      for (const r of store.relPersp(SHRUG, KERNEL_PERSP)) if (canonTerm(r.args[0]) === k) lines.push('  root ' + shrugLine(r));
      if (root.k === 'f' && root.name === '$rule' && root.args[0]?.k === 'a') {
        const txt = ruleText(root.args[0].name);
        if (txt) lines.push('    ' + txt);
      }
    }
  }
  return lines.join('\n');
}
