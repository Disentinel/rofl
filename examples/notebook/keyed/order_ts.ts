function use(tag: string, v: unknown): void { (globalThis.__seen ?? (() => {}))(tag, v); }

class Store {
  private readonly items = new Map<string, number>();
  constructor() {
    use('ts.early', this.items.get('t'));
    this.fill();
    use('ts.after', this.items.get('t'));
  }
  private fill(): void { this.items.set('t', 18); }
}
new Store();

const other = { loose: 0 };
other.loose = 1;
const store = new Store();
void store['fill'];
