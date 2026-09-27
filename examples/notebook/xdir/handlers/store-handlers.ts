import { store } from '../lib/store.js';

export async function handleGet(key: string): Promise<string> {
  return store.get(key) ?? '';
}

export async function handlePut(key: string, value: string): Promise<string> {
  store.set(key, value);
  return 'ok';
}
