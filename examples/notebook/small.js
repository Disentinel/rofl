export async function load(name) {
  return { name };
}

export async function main() {
  const first = await load('a');
  load('b');
  return first;
}
