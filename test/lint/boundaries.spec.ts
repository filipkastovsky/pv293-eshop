import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const FIXTURES = join(__dirname, 'fixtures');
const BIOME = join(__dirname, '..', '..', 'node_modules', '.bin', 'biome');

type Diagnostic = {
  category: string;
  severity: string;
  location?: { path?: string };
};

function runBiome(): Diagnostic[] {
  const res = spawnSync(
    BIOME,
    ['lint', '--reporter=json', '--max-diagnostics=none', '.'],
    {
      cwd: FIXTURES,
      encoding: 'utf8',
    },
  );
  const start = res.stdout.indexOf('{');
  return JSON.parse(res.stdout.slice(start)).diagnostics;
}

describe('module boundary lint', () => {
  let diagnostics: Diagnostic[];
  beforeAll(() => {
    diagnostics = runBiome();
  });

  const hits = (category: string, file: string) =>
    diagnostics.filter(
      (d) =>
        d.category === category &&
        d.severity === 'error' &&
        d.location?.path?.replace(/\\/g, '/').endsWith(file),
    );
  const restricted = (file: string) =>
    hits('lint/style/noRestrictedImports', file);

  it('checkout importing ../inventory/domain/stock-item errors', () => {
    expect(restricted('checkout/imports-inventory-deep.ts')).toHaveLength(1);
  });
  it('checkout importing ../../inventory errors', () => {
    expect(restricted('checkout/imports-inventory-parent.ts')).toHaveLength(1);
  });
  it('checkout importing ../contracts is clean', () => {
    expect(restricted('checkout/imports-contracts.ts')).toHaveLength(0);
  });
  it('checkout importing ../platform/db/db.module errors', () => {
    expect(restricted('checkout/imports-platform-deep.ts')).toHaveLength(1);
  });
  it('checkout importing the ../platform index is clean', () => {
    expect(restricted('checkout/imports-platform-index.ts')).toHaveLength(0);
  });
  it('contracts importing ../checkout/... errors', () => {
    expect(restricted('contracts/imports-checkout.ts')).toHaveLength(1);
  });
  it('platform importing ../inventory errors, ../contracts is clean', () => {
    expect(restricted('platform/imports-inventory.ts')).toHaveLength(1);
    expect(restricted('platform/imports-contracts.ts')).toHaveLength(0);
  });
  it('a two-file cycle inside one module errors', () => {
    expect(
      hits('lint/suspicious/noImportCycles', 'checkout/cycle-a.ts'),
    ).toHaveLength(1);
    expect(
      hits('lint/suspicious/noImportCycles', 'checkout/cycle-b.ts'),
    ).toHaveLength(1);
  });
});
