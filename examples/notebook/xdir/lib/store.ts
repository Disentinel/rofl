export const store = new Map<string, string>();

export function keys(): string[] {
  return [...store.keys()];
}
