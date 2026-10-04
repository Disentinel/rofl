// optloop.ts — the optimisation loop: one rewrite a round, the whole world compared to the original on the
// same files (every relation but provenance and the round's declared internals), a round kept only if identical,
// the corpus grown when the work falls.
//   node --experimental-strip-types optloop.ts <corpusRoot> <from>-<to>
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { scan } from '../../scanners/js_ast.ts';
import { MODEL_FILES } from '../../notebook/front.ts';
import { AggEval } from '../../src/aggeval.ts';

const ROOT = '/home/user/rofl', HERE = path.dirname(new URL(import.meta.url).pathname);
const STATE = path.join(HERE, 'opt-state.json');
const [corpus, range] = process.argv.slice(2);
const [from, to] = range.split('-').map(Number);
const pick = ['eslint', 'cli-engine', 'services', 'shared', 'config', 'linter', '.'];

type Round = { name: string; edits: [string, string][]; internal: string[]; transform?: (m: string) => string };
const R = (a: string, b: string): [string, string] => [a, b];
const ROUNDS: Round[] = [
  { name: 'member prefix as one relation (member_read, member_at)', internal: ['member_read', 'member_at'], edits: [R(
`may_be_node[flow](N, V2) :- member_node_v[flow](N), ast_child[code](N, object, 0, O),
                            class_receiver[flow](O),
                            may_be_node[flow](O, Obj), selects[flow](N, Key),
                            class_member_static[flow](Obj, Key, V), may_be_node[flow](V, V2).
may_be_node[flow](N, V2) :- member_node_v[flow](N), ast_child[code](N, object, 0, O),
                            may_be_node[flow](O, Obj), selects[flow](N, Key),
                            class_member_proto[flow](Obj, Key, V), may_be_node[flow](V, V2),
                            not class_receiver[flow](O).
may_be_node[flow](N, V2) :- member_node_v[flow](N), ast_child[code](N, object, 0, O),
                            may_be_node[flow](O, Obj), selects[flow](N, Key),
                            member_plain[flow](Obj, Key, V), may_be_node[flow](V, V2).
may_be_lit[flow](N, L)   :- member_node_v[flow](N), ast_child[code](N, object, 0, O),
                            may_be_node[flow](O, Obj), selects[flow](N, Key),
                            member_value[flow](Obj, Key, V), may_be_lit[flow](V, L).`,
`member_read[flow](N, O, Key)     :- member_node_v[flow](N), ast_child[code](N, object, 0, O), selects[flow](N, Key).
member_at[flow](N, O, Obj, Key)  :- may_be_node[flow](O, Obj), member_read[flow](N, O, Key).
may_be_node[flow](N, V2) :- member_at[flow](N, O, Obj, Key), class_receiver[flow](O),
                            class_member_static[flow](Obj, Key, V), may_be_node[flow](V, V2).
may_be_node[flow](N, V2) :- member_at[flow](N, O, Obj, Key), not class_receiver[flow](O),
                            class_member_proto[flow](Obj, Key, V), may_be_node[flow](V, V2).
may_be_node[flow](N, V2) :- member_at[flow](N, _, Obj, Key), member_plain[flow](Obj, Key, V), may_be_node[flow](V, V2).
may_be_lit[flow](N, L)   :- member_at[flow](N, _, Obj, Key), member_value[flow](Obj, Key, V), may_be_lit[flow](V, L).`)] },
  { name: 'member_obj shared with the effects book (eff_obj_traced)', internal: ['member_obj'], edits: [
    R(`member_read[flow](N, O, Key)     :- member_node_v[flow](N), ast_child[code](N, object, 0, O), selects[flow](N, Key).
member_at[flow](N, O, Obj, Key)  :- may_be_node[flow](O, Obj), member_read[flow](N, O, Key).`,
`member_obj[flow](N, O, Obj)      :- may_be_node[flow](O, Obj), ast_child[code](N, object, 0, O), member_node_v[flow](N).
member_at[flow](N, O, Obj, Key)  :- member_obj[flow](N, O, Obj), selects[flow](N, Key).`),
    R(`eff_obj_traced[flow](M) :- member_node_v[flow](M), ast_child[code](M, object, 0, O),
                           may_be_node[flow](O, _).`, `eff_obj_traced[flow](M) :- member_obj[flow](M, _, _).`)] },
  { name: 'builtin receivers lead (amb_proto_recv, callback_site)', internal: [], edits: [
    R(`amb_proto_recv[flow](M, P) :- member_node_v[flow](M), ast_child[code](M, object, 0, O),
                              prototype_of[flow](O, P), builtin_prototype(P).`,
`amb_proto_recv[flow](M, P) :- builtin_prototype(P), prototype_of[flow](O, P),
                              ast_child[code](M, object, 0, O), member_node_v[flow](M).`),
    R(`callback_site[code](C, P, Key)        :- callee_of[code](C, N), ast_child[code](N, object, 0, O),
                                         prototype_of[flow](O, P), builtin_prototype(P), selects[flow](N, Key).`,
`callback_site[code](C, P, Key)        :- builtin_prototype(P), prototype_of[flow](O, P), ast_child[code](N, object, 0, O),
                                         callee_of[code](C, N), selects[flow](N, Key).`)] },
  { name: 'spread arm: the spreads as a static relation (spread_of)', internal: ['spread_of'], edits: [R(
`member_value[flow](O, Key, V) :- ast_node[code](O, object_expression, _, _),
                                 ast_child[code](O, properties, _, S),
                                 ast_node[code](S, spread_element, _, _),
                                 ast_child[code](S, argument, 0, A), may_be_node[flow](A, Src),
                                 member_value[flow](Src, Key, V).`,
`spread_of[code](O, A) :- ast_node[code](S, spread_element, _, _), ast_child[code](O, properties, _, S),
                         ast_node[code](O, object_expression, _, _), ast_child[code](S, argument, 0, A).
member_value[flow](O, Key, V) :- spread_of[code](O, A), may_be_node[flow](A, Src), member_value[flow](Src, Key, V).`)] },
  { name: 'computed keys as a static relation (computed_key)', internal: ['computed_key'], edits: [R(
`selects[flow](N, Key)       :- member_node_v[flow](N), ast_attr[code](N, computed, true),
                               ast_child[code](N, property, 0, P), may_be_lit[flow](P, Key).`,
`computed_key[code](N, P)    :- ast_attr[code](N, computed, true), member_node_v[flow](N), ast_child[code](N, property, 0, P).
selects[flow](N, Key)       :- may_be_lit[flow](P, Key), computed_key[code](N, P).`)] },
  { name: 'super calls lead with the super node', internal: [], edits: [R(
`resolves[code](C, M) :- callee_of[code](C, N), ast_node[code](N, super, _, _),
                        may_be_node[flow](N, SD), ctor_of[flow](SD, M).`,
`resolves[code](C, M) :- ast_node[code](N, super, _, _), callee_of[code](C, N),
                        may_be_node[flow](N, SD), ctor_of[flow](SD, M).`)] },
  { name: 'unary value arms lead with the delta (property, conditional, await, logical, assign)', internal: [], edits: [
    R(`may_be_node[flow](P, N) :- ast_node[code](P, object_property, _, _),
                           ast_child[code](P, value, 0, X), may_be_node[flow](X, N).
may_be_lit[flow](P, V)  :- ast_node[code](P, object_property, _, _),
                           ast_child[code](P, value, 0, X), may_be_lit[flow](X, V).`,
`may_be_node[flow](P, N) :- may_be_node[flow](X, N), ast_child[code](P, value, 0, X), ast_node[code](P, object_property, _, _).
may_be_lit[flow](P, V)  :- may_be_lit[flow](X, V), ast_child[code](P, value, 0, X), ast_node[code](P, object_property, _, _).`),
    R(`may_be_node[flow](E, N) :- ast_node[code](E, conditional_expression, _, _),
                           ast_child[code](E, consequent, 0, X), may_be_node[flow](X, N).
may_be_node[flow](E, N) :- ast_node[code](E, conditional_expression, _, _),
                           ast_child[code](E, alternate, 0, X), may_be_node[flow](X, N).`,
`may_be_node[flow](E, N) :- may_be_node[flow](X, N), ast_child[code](E, consequent, 0, X), ast_node[code](E, conditional_expression, _, _).
may_be_node[flow](E, N) :- may_be_node[flow](X, N), ast_child[code](E, alternate, 0, X), ast_node[code](E, conditional_expression, _, _).`),
    R(`may_be_lit[flow](E, V)  :- ast_node[code](E, conditional_expression, _, _),
                           ast_child[code](E, consequent, 0, X), may_be_lit[flow](X, V).
may_be_lit[flow](E, V)  :- ast_node[code](E, conditional_expression, _, _),
                           ast_child[code](E, alternate, 0, X), may_be_lit[flow](X, V).`,
`may_be_lit[flow](E, V)  :- may_be_lit[flow](X, V), ast_child[code](E, consequent, 0, X), ast_node[code](E, conditional_expression, _, _).
may_be_lit[flow](E, V)  :- may_be_lit[flow](X, V), ast_child[code](E, alternate, 0, X), ast_node[code](E, conditional_expression, _, _).`),
    R(`may_be_node[flow](E, N) :- ast_node[code](E, await_expression, _, _),
                           ast_child[code](E, argument, 0, X), may_be_node[flow](X, N).
may_be_lit[flow](E, V)  :- ast_node[code](E, await_expression, _, _),
                           ast_child[code](E, argument, 0, X), may_be_lit[flow](X, V).`,
`may_be_node[flow](E, N) :- may_be_node[flow](X, N), ast_child[code](E, argument, 0, X), ast_node[code](E, await_expression, _, _).
may_be_lit[flow](E, V)  :- may_be_lit[flow](X, V), ast_child[code](E, argument, 0, X), ast_node[code](E, await_expression, _, _).`),
    R(`may_be_node[flow](E, N) :- ast_node[code](E, logical_expression, _, _),
                           ast_child[code](E, left, 0, X), may_be_node[flow](X, N).
may_be_node[flow](E, N) :- ast_node[code](E, logical_expression, _, _),
                           ast_child[code](E, right, 0, X), may_be_node[flow](X, N).
may_be_lit[flow](E, V)  :- ast_node[code](E, logical_expression, _, _),
                           ast_child[code](E, left, 0, X), may_be_lit[flow](X, V).
may_be_lit[flow](E, V)  :- ast_node[code](E, logical_expression, _, _),
                           ast_child[code](E, right, 0, X), may_be_lit[flow](X, V).`,
`may_be_node[flow](E, N) :- may_be_node[flow](X, N), ast_child[code](E, left, 0, X), ast_node[code](E, logical_expression, _, _).
may_be_node[flow](E, N) :- may_be_node[flow](X, N), ast_child[code](E, right, 0, X), ast_node[code](E, logical_expression, _, _).
may_be_lit[flow](E, V)  :- may_be_lit[flow](X, V), ast_child[code](E, left, 0, X), ast_node[code](E, logical_expression, _, _).
may_be_lit[flow](E, V)  :- may_be_lit[flow](X, V), ast_child[code](E, right, 0, X), ast_node[code](E, logical_expression, _, _).`),
    R(`may_be_node[flow](E, N) :- plain_assign[flow](E),
                           ast_child[code](E, right, 0, X), may_be_node[flow](X, N).
may_be_lit[flow](E, V)  :- plain_assign[flow](E),
                           ast_child[code](E, right, 0, X), may_be_lit[flow](X, V).`,
`may_be_node[flow](E, N) :- may_be_node[flow](X, N), ast_child[code](E, right, 0, X), plain_assign[flow](E).
may_be_lit[flow](E, V)  :- may_be_lit[flow](X, V), ast_child[code](E, right, 0, X), plain_assign[flow](E).`)] },
  { name: 'nearest scope as a walk up, not an argmin over a square (up_s)', internal: ['up_s'], edits: [R(
`encloses_s[code](R, D) :- scoped_binder[code](D, _), ast_within[code](R, D), scope_node[code](R).
closer_s[code](R, D)   :- encloses_s[code](R, D), encloses_s[code](S, D),
                          ast_within[code](R, S), R != S.
nearest_s[code](R, D)  :- encloses_s[code](R, D), not closer_s[code](R, D).`,
`up_s[code](D, P)       :- scoped_binder[code](D, _), ast_in[code](P, D).
up_s[code](D, P2)      :- up_s[code](D, P), not scope_node[code](P), ast_in[code](P2, P).
nearest_s[code](R, D)  :- up_s[code](D, R), scope_node[code](R).
encloses_s[code](R, D) :- scoped_binder[code](D, _), ast_within[code](R, D), scope_node[code](R).
closer_s[code](R, D)   :- encloses_s[code](R, D), nearest_s[code](S, D), R != S.`)] },
  { name: 'tdz_cand: the region right after the binder', internal: [], edits: [R(
`tdz_cand[code](E, D)     :- lexical_binder[code](D), binds_name[code](D, Name, File),
                            ident_in[code](E, Name, File),
                            binder_region[code](D, R), ast_within[code](R, E),
                            ast_node[code](D, _, _, LD), ast_node[code](E, _, _, LE),
                            LE < LD.`,
`tdz_cand[code](E, D)     :- lexical_binder[code](D), binder_region[code](D, R),
                            binds_name[code](D, Name, File), ident_in[code](E, Name, File),
                            ast_within[code](R, E),
                            ast_node[code](D, _, _, LD), ast_node[code](E, _, _, LE),
                            LE < LD.`)] },
  { name: 'binder arms lead with the delta', internal: [], edits: [R(
`may_be_lit[flow](E, V)  :- binder[code](D, Name, Init, File), may_be_lit[flow](Init, V),
                           ident_in[code](E, Name, File), sees_binder[code](E, D).
may_be_node[flow](E, N) :- binder[code](D, Name, Init, File), may_be_node[flow](Init, N),
                           ident_in[code](E, Name, File), sees_binder[code](E, D).`,
`may_be_lit[flow](E, V)  :- may_be_lit[flow](Init, V), binder[code](D, Name, Init, File),
                           ident_in[code](E, Name, File), sees_binder[code](E, D).
may_be_node[flow](E, N) :- may_be_node[flow](Init, N), binder[code](D, Name, Init, File),
                           ident_in[code](E, Name, File), sees_binder[code](E, D).`)] },
  { name: 'ast_within closed four steps at a time (up2, up3, up4): a quarter of the rounds, the same rows', internal: ['up2', 'up3', 'up4'], edits: [R(
`ast_within[code](P, C) :- ast_in[code](P, C).
ast_within[code](P, D) :- ast_within[code](P, X), ast_in[code](X, D).`,
`up2[code](P, D) :- ast_in[code](P, X), ast_in[code](X, D).
up3[code](P, D) :- up2[code](P, X), ast_in[code](X, D).
up4[code](P, D) :- up2[code](P, X), up2[code](X, D).
ast_within[code](P, C) :- ast_in[code](P, C).
ast_within[code](P, C) :- up2[code](P, C).
ast_within[code](P, C) :- up3[code](P, C).
ast_within[code](P, C) :- up4[code](P, C).
ast_within[code](P, D) :- up4[code](P, X), ast_within[code](X, D).`)] },
  { name: 'resolves leads with the delta', internal: [], edits: [R(
`resolves[code](C, F) :- callee_of[code](C, N), may_be_node[flow](N, F), fn_node[code](F).`,
`resolves[code](C, F) :- may_be_node[flow](N, F), fn_node[code](F), callee_of[code](C, N).`)] },
  { name: 'next_send leads with the key "next"', internal: [], edits: [R(
`next_send[flow](G, V) :- call_site[code](C, _), callee_of[code](C, N),
                         selects[flow](N, "next"),
                         ast_child[code](N, object, 0, O), bound_to_call[flow](O, GC),
                         resolves[code](GC, G),
                         ast_child[code](C, arguments, 0, V).`,
`next_send[flow](G, V) :- selects[flow](N, "next"), callee_of[code](C, N),
                         ast_child[code](N, object, 0, O), bound_to_call[flow](O, GC),
                         resolves[code](GC, G),
                         ast_child[code](C, arguments, 0, V).`)] },
  { name: 'member writes lead with the delta', internal: [], edits: [R(
`member_value[flow](O, Key, V) :- plain_assign[flow](A), ast_child[code](A, left, 0, L),
                                 selects[flow](L, Key),
                                 ast_child[code](L, object, 0, Obj),
                                 may_be_node[flow](Obj, O),
                                 ast_child[code](A, right, 0, V).`,
`member_value[flow](O, Key, V) :- may_be_node[flow](Obj, O), ast_child[code](L, object, 0, Obj),
                                 selects[flow](L, Key),
                                 ast_child[code](A, left, 0, L), plain_assign[flow](A),
                                 ast_child[code](A, right, 0, V).`)] },
  { name: 'eff_heap_of local leads with the traced member', internal: [], edits: [R(
`eff_heap_of[flow](M, local)  :- member_node_v[flow](M), eff_obj_traced[flow](M).`,
`eff_heap_of[flow](M, local)  :- eff_obj_traced[flow](M), member_node_v[flow](M).`)] },
  { name: 'bound_to_call leads with the call', internal: [], edits: [R(
`bound_to_call[flow](E, C) :- ident_in[code](E, Name, File),
                             binder[code](_, Name, C, File),
                             ast_node[code](C, call_expression, _, _).`,
`bound_to_call[flow](E, C) :- ast_node[code](C, call_expression, _, _),
                             binder[code](_, Name, C, File),
                             ident_in[code](E, Name, File).`)] },
  { name: 'vocabulary_gap over the kinds seen, not the nodes', internal: ['kind_seen'], edits: [R(
`vocabulary_gap[audit](Lang, K) :- ast_node[code](_, K, _, _),
                                  lang_of_corpus(Lang), not node_kind(Lang, K),
                                  not not_a_construct(K), not frame_deferred(K, _).`,
`kind_seen[code](K) :- ast_node[code](_, K, _, _).
vocabulary_gap[audit](Lang, K) :- kind_seen[code](K),
                                  lang_of_corpus(Lang), not node_kind(Lang, K),
                                  not not_a_construct(K), not frame_deferred(K, _).`)] },
  { name: 'kind tables lead the kind guards (ten rules)', internal: [], edits: [], transform: (m) => m.replace(/:- ast_node\[code\]\((\w+), K, ([^,)]+), ([^,)]+)\), (\w+)\(K\)/g, ':- $4(K), ast_node[code]($1, K, $2, $3)') },
  { name: 'param_hidden from the binders that could hide, not from every parameter', internal: [], edits: [R(
`param_hidden[flow](F, Name, U) :- param_of[flow](F, _, Name),
                                  binds_name[code](D, Name, _),
                                  binder_region[code](D, R),
                                  ast_within[code](F, R), ast_within[code](R, U),
                                  ident[code](U, Name).`,
`param_hidden[flow](F, Name, U) :- binder_region[code](D, R), binds_name[code](D, Name, _),
                                  ast_within[code](F, R), param_of[flow](F, _, Name),
                                  ast_within[code](R, U), ident[code](U, Name).`)] },
  { name: 'declares_name walks patterns from their roots (pattern_root)', internal: ['pattern_root'], edits: [R(
`declares_name[code](Name, File) :- declaring_position(K, Field),
                                   ast_node[code](D, K, File, _),
                                   ast_child[code](D, Field, 0, I),
                                   ast_within[code](I, X), ast_name[code](X, Name).`,
`pattern_root[code](I, File) :- declaring_position(K, Field), ast_node[code](D, K, File, _),
                               ast_child[code](D, Field, 0, I).
declares_name[code](Name, File) :- pattern_root[code](I, File), ast_within[code](I, X), ast_name[code](X, Name).`)] },
  { name: 'containment by interval for the point checks (ast_span from the scanner): seven readers leave the closure', internal: ['ast_span'], edits: [
    R(`edb(ast_node).`, `edb(ast_node).\nedb(ast_span).`),
    R(`sees_binder[code](E, D)      :- binds_name[code](D, Name, File), ident_in[code](E, Name, File),
                                binder_region[code](D, R), ast_within[code](R, E),
                                not hidden_at[code](E, D).`,
`sees_binder[code](E, D)      :- binds_name[code](D, Name, File), ident_in[code](E, Name, File),
                                binder_region[code](D, R), ast_span[code](R, Lo, Hi), ast_span[code](E, L, _),
                                L > Lo, Hi >= L,
                                not hidden_at[code](E, D).`),
    R(`hidden_at[code](E, Outer) :- shadowed_by[code](Outer, Inner, Name),
                             binder_region[code](Inner, RI),
                             ast_within[code](RI, E), ident_in[code](E, Name, _).
hidden_at[code](E, Outer) :- shadowed_by_param[code](Outer, F, Name),
                             ast_within[code](F, E), ident_in[code](E, Name, _).`,
`hidden_at[code](E, Outer) :- shadowed_by[code](Outer, Inner, Name),
                             binder_region[code](Inner, RI), ast_node[code](RI, _, File, _), ident_in[code](E, Name, File),
                             ast_span[code](RI, Lo, Hi), ast_span[code](E, L, _), L > Lo, Hi >= L.
hidden_at[code](E, Outer) :- shadowed_by_param[code](Outer, F, Name),
                             fn_file[code](F, File), ident_in[code](E, Name, File),
                             ast_span[code](F, Lo, Hi), ast_span[code](E, L, _), L > Lo, Hi >= L.`),
    R(`tdz_cand[code](E, D)     :- lexical_binder[code](D), binder_region[code](D, R),
                            binds_name[code](D, Name, File), ident_in[code](E, Name, File),
                            ast_within[code](R, E),
                            ast_node[code](D, _, _, LD), ast_node[code](E, _, _, LE),
                            LE < LD.`,
`tdz_cand[code](E, D)     :- lexical_binder[code](D), binder_region[code](D, R),
                            binds_name[code](D, Name, File), ident_in[code](E, Name, File),
                            ast_span[code](R, Lo, Hi), ast_span[code](E, L, _), L > Lo, Hi >= L,
                            ast_node[code](D, _, _, LD), ast_node[code](E, _, _, LE),
                            LE < LD.`),
    R(`param_use[flow](F, Name, U) :- param_of[flow](F, _, Name),
                               ast_within[code](F, U),
                               ident[code](U, Name),
                               not param_hidden[flow](F, Name, U).`,
`param_use[flow](F, Name, U) :- param_of[flow](F, _, Name), fn_file[code](F, File),
                               ident_in[code](U, Name, File),
                               ast_span[code](F, Lo, Hi), ast_span[code](U, L, _), L > Lo, Hi >= L,
                               not param_hidden[flow](F, Name, U).`),
    R(`                                         binder_region[code](Outer, RO),
                                         binder_region[code](Inner, RI),
                                         RO != RI, ast_within[code](RO, RI).`,
`                                         binder_region[code](Outer, RO),
                                         binder_region[code](Inner, RI),
                                         RO != RI, ast_span[code](RO, Lo, Hi), ast_span[code](RI, L, _), L > Lo, Hi >= L.`),
    R(`shadowed_by_param[code](Outer, F, Name) :- binds_name[code](Outer, Name, _),
                                           binder_region[code](Outer, RO),
                                           param_of[flow](F, _, Name),
                                           ast_within[code](RO, F).
shadowed_by_param[code](Outer, F, Name) :- binds_name[code](Outer, Name, File),
                                           binder_at_top[code](Outer),
                                           param_of[flow](F, _, Name),
                                           ast_file[code](Root, File), ast_within[code](Root, F).`,
`shadowed_by_param[code](Outer, F, Name) :- binds_name[code](Outer, Name, _),
                                           binder_region[code](Outer, RO),
                                           param_of[flow](F, _, Name),
                                           ast_span[code](RO, Lo, Hi), ast_span[code](F, L, _), L > Lo, Hi >= L.
shadowed_by_param[code](Outer, F, Name) :- binds_name[code](Outer, Name, File),
                                           binder_at_top[code](Outer),
                                           param_of[flow](F, _, Name), fn_file[code](F, File).`),
    R(`param_hidden[flow](F, Name, U) :- binder_region[code](D, R), binds_name[code](D, Name, _),
                                  ast_within[code](F, R), param_of[flow](F, _, Name),
                                  ast_within[code](R, U), ident[code](U, Name).
param_hidden[flow](F, Name, U) :- param_of[flow](G, _, Name),
                                  ast_within[code](F, G), fn_node[code](F),
                                  param_of[flow](F, _, Name),
                                  ast_within[code](G, U), ident[code](U, Name).`,
`param_hidden[flow](F, Name, U) :- param_of[flow](F, _, Name), fn_file[code](F, File), binds_name[code](D, Name, File),
                                  binder_region[code](D, R),
                                  ast_span[code](F, Lo, Hi), ast_span[code](R, LR, HR), LR > Lo, Hi >= LR,
                                  ident_in[code](U, Name, File), ast_span[code](U, LU, _), LU > LR, HR >= LU.
param_hidden[flow](F, Name, U) :- param_of[flow](G, _, Name), fn_file[code](G, File), fn_file[code](F, File),
                                  param_of[flow](F, _, Name), F != G,
                                  ast_span[code](F, Lo, Hi), ast_span[code](G, LG, HG), LG > Lo, Hi >= LG,
                                  ident_in[code](U, Name, File), ast_span[code](U, LU, _), LU > LG, HG >= LU.`)] },
  { name: 'five readers lead with the delta (eff_here, eff_conv_call, eff_conv_overridden, throwing_call, passes_function)', internal: [], edits: [
    R(`eff_here[flow](M, read, H) :- eff_read_site[flow](M), eff_heap_of[flow](M, H).`, `eff_here[flow](M, read, H) :- eff_heap_of[flow](M, H), eff_read_site[flow](M).`),
    R(`eff_conv_call[flow](N, M)       :- eff_coerced[flow](N, X), may_be_node[flow](X, O),
                                   eff_conv_key(Key), member_value[flow](O, Key, M).
eff_conv_overridden[flow](N, X) :- eff_coerced[flow](N, X), may_be_node[flow](X, O),
                                   eff_conv_key(Key), member_value[flow](O, Key, _).`,
`eff_conv_call[flow](N, M)       :- eff_conv_key(Key), member_value[flow](O, Key, M), may_be_node[flow](X, O),
                                   eff_coerced[flow](N, X).
eff_conv_overridden[flow](N, X) :- eff_conv_key(Key), member_value[flow](O, Key, _), may_be_node[flow](X, O),
                                   eff_coerced[flow](N, X).`),
    R(`throwing_call[code](C) :- call_site[code](C, _), resolves[code](C, F),
                          always_throws[code](F).`, `throwing_call[code](C) :- always_throws[code](F), resolves[code](C, F),
                          call_site[code](C, _).`),
    R(`passes_function[code](C, I, F, Name) :- arg_at[flow](C, I, A), ast_name[code](A, Name),
                                        may_be_node[flow](A, F), fn_node[code](F).`,
`passes_function[code](C, I, F, Name) :- arg_at[flow](C, I, A), may_be_node[flow](A, F), fn_node[code](F),
                                        ast_name[code](A, Name).`)] },
  { name: 'pattern_accessor over the static shapes (pattern_takes first, spread_of)', internal: [], edits: [
    R(`pattern_accessor[code](P, M) :- ast_node[code](P, object_pattern, _, _),
                                pattern_source[code](P, Init), may_be_node[flow](Init, Obj),
                                pattern_takes[code](P, Key), accessor_of[flow](Obj, Key, M).`,
`pattern_accessor[code](P, M) :- accessor_of[flow](Obj, Key, M), may_be_node[flow](Init, Obj),
                                pattern_source[code](P, Init), ast_node[code](P, object_pattern, _, _),
                                pattern_takes[code](P, Key).`),
    R(`pattern_accessor[code](S, M) :- ast_node[code](O, object_expression, _, _),
                                ast_child[code](O, properties, _, S),
                                ast_node[code](S, spread_element, _, _),
                                ast_child[code](S, argument, 0, A), may_be_node[flow](A, Obj),
                                accessor_of[flow](Obj, Key, M).`,
`pattern_accessor[code](S, M) :- accessor_of[flow](Obj, Key, M), may_be_node[flow](A, Obj),
                                ast_child[code](S, argument, 0, A), ast_node[code](S, spread_element, _, _),
                                ast_child[code](O, properties, _, S), ast_node[code](O, object_expression, _, _).`)] },
  { name: 'the four-step closure withdrawn: with the point checks gone, are its rounds still worth 220 000 rows?', internal: ['up2', 'up3', 'up4'], edits: [R(
`up2[code](P, D) :- ast_in[code](P, X), ast_in[code](X, D).
up3[code](P, D) :- up2[code](P, X), ast_in[code](X, D).
up4[code](P, D) :- up2[code](P, X), up2[code](X, D).
ast_within[code](P, C) :- ast_in[code](P, C).
ast_within[code](P, C) :- up2[code](P, C).
ast_within[code](P, C) :- up3[code](P, C).
ast_within[code](P, C) :- up4[code](P, C).
ast_within[code](P, D) :- up4[code](P, X), ast_within[code](X, D).`,
`ast_within[code](P, C) :- ast_in[code](P, C).
ast_within[code](P, D) :- ast_within[code](P, X), ast_in[code](X, D).`)] },
];

// ---------------------------------------------------------------- corpus
function listJs(dir: string): string[] { const o: string[] = []; for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = path.join(dir, e.name); if (e.isDirectory()) o.push(...listJs(p)); else if (e.name.endsWith('.js')) o.push(p); } return o; }
const lists = pick.map((d) => listJs(path.join(corpus, d)));
function filesOf(n: number): string[] { const files: string[] = []; for (let i = 0; files.length < n; i++) { const l = lists[i % lists.length]; const j = Math.floor(i / lists.length); if (j < l.length) files.push(l[j]); if (lists.every((l2) => Math.floor(i / lists.length) >= l2.length)) break; } return files; }
const q = (x: string) => '"' + x.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
function hostFacts(paths: string[], strings: Set<string>): string[] {
  const o: string[] = [], dirs = new Set(['.']);
  const dirOf = (p: string) => { const i = p.lastIndexOf('/'); return i < 0 ? '.' : p.slice(0, i); };
  for (const p of paths) for (let d = dirOf(p); d !== '.'; d = dirOf(d)) dirs.add(d);
  for (const d of dirs) { o.push(`fs_dir[code](${q(d)}).`); if (d !== '.') o.push(`fs_parent[code](${q(d)}, ${q(dirOf(d))}).`, `fs_dir_in[code](${q(dirOf(d))}, ${q(d.slice(d.lastIndexOf('/') + 1))}, ${q(d)}).`); }
  for (const p of paths) o.push(`fs_file[code](${q(p)}).`, `fs_dir_of[code](${q(p)}, ${q(dirOf(p))}).`, `fs_file_in[code](${q(dirOf(p))}, ${q(p.slice(p.lastIndexOf('/') + 1))}, ${q(p)}).`);
  for (const s of strings) { if (!s || s.includes('\n')) continue; const segs = s.split('/'); o.push(`str_segs[code](${q(s)}, ${segs.length}).`, `str_char0[code](${q(s)}, ${q(s[0])}).`); segs.forEach((g, k) => o.push(`str_seg[code](${q(s)}, ${k}, ${q(g)}).`)); if (s.indexOf(':') > 0) o.push(`str_scheme[code](${q(s)}, ${q(s.slice(0, s.indexOf(':')))}).`); }
  return o;
}
function corpusFacts(n: number): string[] {
  const files = filesOf(n), facts: string[] = [], strings = new Set<string>();
  for (const f of files) for (const fact of scan(fs.readFileSync(f, 'utf8'), { file: path.relative(corpus, f) }).facts) { facts.push(fact); const v = /^ast_attr\[code\]\(\w+, value, (".*")\)\.$/.exec(fact); if (v) strings.add(v[1].slice(1, -1).replace(/\\(.)/g, '$1')); }
  const spans = spanFacts(facts);
  return [...facts, ...spans, ...hostFacts(files.map((f) => path.relative(corpus, f)), strings)];
}
/** ast_span(N, Lo, Hi): a preorder number per node and the last number of its subtree, one global sequence,
 *  so E is inside R exactly when Lo(R) < Lo(E) <= Hi(R). What the scanner would emit beside ast_child. */
function spanFacts(facts: string[]): string[] {
  const kids = new Map<string, [string, number, string][]>(); const roots: string[] = [];
  for (const f of facts) {
    let m = /^ast_child\[code\]\((\w+), (\w+), (\d+), (\w+)\)\.$/.exec(f);
    if (m) { const k = kids.get(m[1]) ?? kids.set(m[1], []).get(m[1])!; if (!k.some((e) => e[2] === m![4])) k.push([m[2], Number(m[3]), m[4]]); continue; }
    m = /^ast_file\[code\]\((\w+), /.exec(f); if (m) roots.push(m[1]);
  }
  const out: string[] = []; let n = 0;
  const walk = (node: string) => { const lo = ++n; for (const [, , c] of (kids.get(node) ?? []).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1])) walk(c); out.push(`ast_span[code](${node}, ${lo}, ${n}).`); };
  for (const r of [...new Set(roots)]) walk(r);
  return out;
}

// ---------------------------------------------------------------- one evaluation
const SKIP = new Set(['derived_by', 'asserted_by', 'in_perspective']);
const PHRASED = new Set([...fs.readFileSync(path.join(ROOT, 'facts/js-phrases.rofl'), 'utf8').matchAll(/^sig\((\w+),/gm)].map((m) => m[1]));
const AUDIT = new Set<string>(); const RULE_KEYED = new Set<string>();
function run(model: string, all: string[]) {
  const r = new Rofl({ space: 400_000_000, reuse: false });
  const l = r.load(model, { budget: 4_000_000_000 }); if (!l.ok) return { error: l.diagnostics.slice(0, 3).join(' | ') };
  r.assert(all.join('\n'), { who: 'scanner' });
  const proto = AggEval.prototype as any; const orig = proto.matchPremise; let calls = 0;
  proto.matchPremise = function (...rest: any[]) { calls++; return orig.apply(this, rest); };
  const t = performance.now(); let rep: any;
  try { rep = r.evaluate(4_000_000_000); } finally { proto.matchPremise = orig; }
  const ms = performance.now() - t;
  const byRel = new Map<string, Set<string>>();
  const ruleKeyed = new Map<string, boolean>();
  for (const f of r.store.allFacts()) {
    if (SKIP.has(f.rel)) continue; if (f.persp === 'audit') AUDIT.add(f.rel);
    // a relation keyed by rule ids describes the PROGRAM, not the code: it moves with every rewrite by definition
    const first = f.args[0] as any; const isRule = first && first.k === 'a' && /^r[0-9a-f]{8}$/.test(first.name);
    ruleKeyed.set(f.rel, (ruleKeyed.get(f.rel) ?? true) && isRule);
    let s = byRel.get(f.rel); if (!s) { s = new Set(); byRel.set(f.rel, s); } s.add(f.key);
  }
  for (const [rel, keyed] of ruleKeyed) if (keyed) RULE_KEYED.add(rel);
  return { ms, calls, peak: rep.peakRows as number, facts: r.store.factCount(), byRel };
}
const isPublic = (rel: string) => (PHRASED.has(rel) || AUDIT.has(rel)) && !RULE_KEYED.has(rel);
function same(a: Map<string, Set<string>>, b: Map<string, Set<string>>, internal: Set<string>): string[] {
  const diffs: string[] = [];
  for (const rel of new Set([...a.keys(), ...b.keys()])) {
    if (!isPublic(rel)) continue;
    const x = a.get(rel) ?? new Set(), y = b.get(rel) ?? new Set();
    if (x.size !== y.size) { diffs.push(`${rel}: ${x.size} vs ${y.size}`); continue; }
    for (const k of x) if (!y.has(k)) { diffs.push(`${rel}: ${k} missing`); break; }
  }
  return diffs;
}

// ---------------------------------------------------------------- the loop state
type State = { n: number; applied: number[]; internal: string[]; log: string[]; best?: Record<string, number> };
const state: State = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { n: 24, applied: [], internal: [], log: [] };
const base = MODEL_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
function modelWith(applied: number[]): string { let m = base; for (const i of applied) { for (const [a, b] of ROUNDS[i].edits) { if (!m.includes(a)) throw new Error(`round ${i + 1}: edit not found`); m = m.replace(a, b); } if (ROUNDS[i].transform) { const m2 = ROUNDS[i].transform!(m); if (m2 === m) throw new Error(`round ${i + 1}: transform changed nothing`); m = m2; } } return m; }

const baselines = new Map<number, ReturnType<typeof run>>();
function baseline(n: number) {
  if (baselines.has(n)) return baselines.get(n)!;
  const all = corpusFacts(n), cache = path.join(HERE, `opt-baseline-${n}.json`);
  let b: any;
  if (fs.existsSync(cache)) { const j = JSON.parse(fs.readFileSync(cache, 'utf8')); b = { ms: j.ms, calls: j.calls, peak: j.peak, facts: j.facts, byRel: new Map(Object.entries(j.byRel).map(([k, v]) => [k, new Set(v as string[])])) }; for (const r of j.audit) AUDIT.add(r); for (const r of j.ruleKeyed) RULE_KEYED.add(r); }
  else { b = run(base, all); fs.writeFileSync(cache, JSON.stringify({ ms: b.ms, calls: b.calls, peak: b.peak, facts: b.facts, byRel: Object.fromEntries([...b.byRel].map(([k, v]) => [k, [...v]])), audit: [...AUDIT], ruleKeyed: [...RULE_KEYED] })); }
  b.all = all; baselines.set(n, b); return b;
}

for (let i = from - 1; i < to; i++) {
  const rd = ROUNDS[i];
  const n = Number(process.env.N) || state.n;
  if (process.env.DUMP) { fs.writeFileSync(process.env.DUMP, modelWith([...state.applied, i])); console.log('trial model written to', process.env.DUMP); process.exit(0); }
  const b: any = baseline(n);
  if (b.error) { console.log('baseline failed', b.error); process.exit(1); }
  const trial = [...state.applied, i];
  let model: string; try { model = modelWith(trial); } catch (e) { console.log(`round ${i + 1}: ${(e as Error).message}`); continue; }
  if (process.env.DUMP) { fs.writeFileSync(process.env.DUMP, model); console.log('trial model written to', process.env.DUMP); process.exit(0); }
  const cur: any = run(model, b.all);
  if (cur.error) { const line = `round ${i + 1} ${rd.name}: REFUSED ${cur.error}`; console.log(line); state.log.push(line); continue; }
  const internal = new Set([...state.internal, ...rd.internal]);
  const diffs = same(b.byRel, cur.byRel, internal);
  const best = (state.best ??= {})[String(n)] ?? Infinity;
  const ok = diffs.length === 0 && cur.calls < best;
  const why = diffs.length ? 'DIFFERS ' + diffs.slice(0, 3).join('; ') : cur.calls < best ? 'public relations IDENTICAL' : `IDENTICAL but no cheaper (${cur.calls} against ${best}): dropped`;
  const moved = [...new Set([...b.byRel.keys(), ...cur.byRel.keys()])].filter((rel) => !isPublic(rel) && !RULE_KEYED.has(rel) && (b.byRel.get(rel)?.size ?? 0) !== (cur.byRel.get(rel)?.size ?? 0));
  const line = `round ${i + 1} · ${n} files · ${rd.name}: ${why}${moved.length ? ' (internal moved: ' + moved.join(', ') + ')' : ''} · calls ${cur.calls} (${(100 * cur.calls / b.calls).toFixed(0)} % of original ${b.calls}) · eval ${cur.ms.toFixed(0)} ms (original ${b.ms.toFixed(0)}) · peak ${cur.peak} · facts ${cur.facts}`;
  console.log(line); state.log.push(line);
  if (ok) { state.applied.push(i); state.internal = [...internal]; state.best![String(n)] = cur.calls; }
  if (ok && cur.calls / b.calls < 0.72 && state.n < 40) { state.n += 8; console.log(`   work under 72 %: the corpus grows to ${state.n} files`); }
  fs.writeFileSync(STATE, JSON.stringify(state));
}
fs.writeFileSync(path.join(HERE, 'opt-model.rofl'), modelWith(state.applied));
