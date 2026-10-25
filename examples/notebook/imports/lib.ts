export class Store {
  static make() { return 1; }
  get() { return 1; }
}
export class Sub extends Store {
  static more() { return 2; }
}
export namespace Ev {
  export function once() { return 1; }
  export const none = () => 0;
  export let later: (() => number) | undefined;
}
export function helper() { return 1; }
export * from './more';
