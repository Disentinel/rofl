import { keys } from '../lib/store';

export async function handleList(): Promise<string> {
  return keys().join(',');
}
