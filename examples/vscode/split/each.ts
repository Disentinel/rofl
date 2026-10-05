export function each(xs: string[], cb: (x: string) => void): void {
	for (const x of xs) {
		cb(x);
	}
}
