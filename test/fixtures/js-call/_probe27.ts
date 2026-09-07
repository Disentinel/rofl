import { base } from './test/js-corpus-world.ts';
const w = base();
console.log('fn_name for the computed method:',
  JSON.stringify(w.q('fn_name[code](F, "iterator")')));
console.log('for_of sites:', w.n('ast_node[code](N, for_of_statement, F, L)'));
console.log('member_value next:', JSON.stringify(w.q('member_value[flow](O, "next", V)')));
// the kind census, beside the probe rather than twelve minutes later
const kinds = new Set(w.q('ast_node[code](N, K, F, L)').map(([, k]: string[]) => k));
console.log('corpus kinds:', kinds.size,
  '| vocabulary_gap', w.n('vocabulary_gap[audit](L, K)'),
  '| kind_absent_stale', w.n('kind_absent_stale[audit](K)'));
