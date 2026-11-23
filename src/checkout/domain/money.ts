import type { OrderLine } from '../../contracts';

/** Prices cross the border as decimal numbers; sums are done in whole cents. */
export const toCents = (amount: number): number => Math.round(amount * 100);

export const fromCents = (cents: number): number => cents / 100;

export const totalOf = (lines: readonly OrderLine[]): number =>
  fromCents(
    lines.reduce(
      (sum, line) => sum + toCents(line.unitPrice) * line.quantity,
      0,
    ),
  );
