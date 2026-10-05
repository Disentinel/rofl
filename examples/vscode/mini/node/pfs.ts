import * as fs from 'fs';
import { promises } from 'fs';

export function writeAtomic(path: string, data: string): void {
	fs.writeFileSync(path, data);
}

export async function remove(target: string): Promise<void> {
	await promises.rm(target, { recursive: true });
}
