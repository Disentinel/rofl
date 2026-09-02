// adapters/index.ts — THE MODE FLAG.
//
// It lives here and not in src/ for a mechanical reason worth stating, because
// it looks like an omission otherwise: `scripts/kernel_grep.ts` rejects any
// identifier-shaped string literal in src/ that is not in the documented
// kernel vocabulary, and a TypeScript string-literal union is a string literal
// to that check. So `'memory' | 'external'` cannot be written inside the
// kernel without extending the reserved vocabulary — which is a documented API
// change, not a convenience. The kernel does not need the flag anyway: which
// mode is in play IS which class was constructed.

import { Store, type FactStore } from '../src/store.ts';
import { SqliteStore } from './sqlite-store.ts';

export type StoreMode = 'memory' | 'external';

/** `memory` is today's behaviour and the reference implementation; `external`
 *  is the embedded-SQLite adapter. `file` is ignored in `memory` mode and
 *  defaults to a temporary file in `external` mode. */
export function openStore(mode: StoreMode = 'memory', file?: string): FactStore {
  return mode === 'memory' ? new Store() : new SqliteStore(file);
}

export { SqliteStore };
