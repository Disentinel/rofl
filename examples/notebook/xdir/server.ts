import { handleGet, handlePut } from './handlers/index.js';
import { handleList } from './handlers';

export async function dispatch(name: string, args: string[]): Promise<string> {
  switch (name) {
    case 'get': return handleGet(args[0]);
    case 'put': return handlePut(args[0], args[1]);
    case 'list': return handleList();
    default: throw new Error(`unknown tool ${name}`);
  }
}
