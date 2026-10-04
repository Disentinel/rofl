const registry: Record<string, number> = {};

function boot(): number {
  return new Shelf().stock();
}

function mark(): number {
  registry.seen = 1;
  return boot();
}

function shelve(n: number) {
  return (target: unknown) => target;
}

class Shelf {
  @shelve(mark()) stock() {
    return 2;
  }
  plain() {
    return 3;
  }
}
