export interface IBar { stop(): void }
export interface IBaz { go(): void }
export function makeBaz(): IBaz { return null as any; }
