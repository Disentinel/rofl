// types.ts — the shapes the order service passes around.

export interface Line { sku: string; qty: number; bundle?: boolean; lines?: Line[]; }
export interface Order { id: string; customerId: string; lines: Line[]; }
export interface Customer { id: string; email: string; }
export interface Receipt { id: string; total: number; }
