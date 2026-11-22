import { OrderLine } from '../../contracts';

const toCents = (amount: number) => Math.round(amount * 100);

/** Sums in whole cents so 3 x 2.90 is 8.70, not 8.700000000000001. */
export function totalOf(lines: readonly OrderLine[]): number {
  const cents = lines.reduce(
    (sum, line) => sum + toCents(line.unitPrice) * line.quantity,
    0,
  );
  return cents / 100;
}
