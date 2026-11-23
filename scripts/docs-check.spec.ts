import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkDocs } from './docs-check';

const EVENTS = ['StockReserved', 'OrderPlaced', 'OrderPaid'];

function adr(n: string, title: string, opts: { bad?: boolean } = {}): string {
  return [
    `# ${n}. ${title}`,
    '',
    '- Status: accepted',
    '- Date: 2026-11-22',
    '',
    '## Context and Problem Statement',
    '',
    'Context.',
    '',
    '## Decision Drivers',
    '',
    '- driver',
    '',
    '## Considered Options',
    '',
    '- A',
    '- B',
    '',
    '## Decision Outcome',
    '',
    'Chosen: **A**.',
    '',
    '## Consequences',
    '',
    '- Good: something',
    opts.bad === false ? '- Neutral: nothing bad' : '- Bad: something',
    '',
  ].join('\n');
}

function moduleReadme(opts: { emitted?: string; omit?: string } = {}): string {
  const sections: [string, string][] = [
    ['Responsibility', 'Does things.'],
    ['Owner', 'Team B.'],
    ['Internal architecture', 'Transaction scripts. Simple enough.'],
    ['Events emitted', `- \`${opts.emitted ?? 'StockReserved'}\``],
    ['Events consumed', '- `OrderPlaced` (from Checkout)'],
    ['Policies', '- `ReserveStockPolicy` (on `OrderPlaced`)'],
    ['Public queries', 'None.'],
    ['HTTP', '- `GET /inventory`'],
  ];
  return [
    '# Inventory',
    '',
    ...sections
      .filter(([name]) => name !== opts.omit)
      .flatMap(([name, body]) => [`## ${name}`, '', body, '']),
  ].join('\n');
}

const INDEX = [
  '# Architecture Decision Records',
  '',
  '| Number | Title | Status |',
  '| --- | --- | --- |',
  '| [0001](0001-first-decision.md) | First decision | accepted |',
  '| [0002](0002-second-decision.md) | Second decision | accepted |',
  '',
  '0003 — An open question — open (to be written in the seminar)',
  '',
].join('\n');

describe('docs-check', () => {
  let root: string;

  const write = (rel: string, content: string) => {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'docs-check-'));
    write('docs/adr/0001-first-decision.md', adr('0001', 'First decision'));
    write('docs/adr/0002-second-decision.md', adr('0002', 'Second decision'));
    write('docs/adr/README.md', INDEX);
    write('docs/adr/template.md', '# NNNN. Template\n');
    write('src/inventory/README.md', moduleReadme());
    write('src/inventory/inventory.module.ts', '');
    write('src/contracts/index.ts', '');
    write('src/platform/index.ts', '');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const errors = () => checkDocs(root, EVENTS);

  it('passes a valid tree', () => {
    expect(errors()).toEqual([]);
  });

  it('fails when an ADR has no "- Bad:" line', () => {
    write(
      'docs/adr/0002-second-decision.md',
      adr('0002', 'Second decision', { bad: false }),
    );
    expect(errors()).toEqual([
      expect.stringMatching(/0002-second-decision\.md.*- Bad:/),
    ]);
  });

  it('fails when an ADR lacks a required section', () => {
    write(
      'docs/adr/0002-second-decision.md',
      adr('0002', 'Second decision').replace(
        '## Decision Drivers',
        '## Drivers',
      ),
    );
    expect(errors()).toEqual([
      expect.stringMatching(/0002.*## Decision Drivers/),
    ]);
  });

  it('fails on a gap in ADR numbering', () => {
    unlinkSync(join(root, 'docs/adr/0002-second-decision.md'));
    write('docs/adr/0003-third-decision.md', adr('0003', 'Second decision'));
    expect(errors()).toContainEqual(expect.stringMatching(/gap.*0002/i));
  });

  it('allows a gap for a number the index lists as open', () => {
    write('docs/adr/0004-fourth-decision.md', adr('0004', 'Fourth decision'));
    write(
      'docs/adr/README.md',
      INDEX.replace(
        '\n0003',
        '| [0004](0004-fourth-decision.md) | Fourth decision | accepted |\n\n- 0003',
      ),
    );
    expect(errors()).toEqual([]);
  });

  it('fails on duplicate ADR numbers', () => {
    write('docs/adr/0002-other-decision.md', adr('0002', 'Other decision'));
    expect(errors()).toContainEqual(expect.stringMatching(/duplicate.*0002/i));
  });

  it('fails on an ADR file name that is not NNNN-kebab-slug.md', () => {
    write('docs/adr/0003_Third.md', adr('0003', 'Third'));
    expect(errors()).toContainEqual(expect.stringMatching(/0003_Third\.md/));
  });

  it('fails when the index does not match the files', () => {
    write(
      'docs/adr/README.md',
      INDEX.replace(
        '| Second decision | accepted |',
        '| Second decision | proposed |',
      ),
    );
    expect(errors()).toEqual([expect.stringMatching(/index.*0002.*status/i)]);
  });

  it('fails when the index misses an ADR', () => {
    write('docs/adr/0003-third-decision.md', adr('0003', 'Third decision'));
    expect(errors()).toEqual([expect.stringMatching(/index.*0003/i)]);
  });

  it('fails when a module directory has no README', () => {
    write('src/shipping/shipping.module.ts', '');
    expect(errors()).toEqual([
      expect.stringMatching(/src\/shipping.*README\.md/),
    ]);
  });

  it('fails when a module README names an unknown event', () => {
    write('src/inventory/README.md', moduleReadme({ emitted: 'StockReservd' }));
    expect(errors()).toEqual([expect.stringMatching(/StockReservd/)]);
  });

  it('fails when a module README misses Internal architecture', () => {
    write(
      'src/inventory/README.md',
      moduleReadme({ omit: 'Internal architecture' }),
    );
    expect(errors()).toEqual([
      expect.stringMatching(/inventory.*Internal architecture/),
    ]);
  });

  it('fails when module README sections are out of order', () => {
    const swapped = moduleReadme()
      .replace('## Owner', '## TMP')
      .replace('## Responsibility', '## Owner')
      .replace('## TMP', '## Responsibility');
    write('src/inventory/README.md', swapped);
    expect(errors()).toEqual([expect.stringMatching(/inventory.*order/i)]);
  });

  it('allows a TODO Internal architecture only in team modules', () => {
    const todo = moduleReadme().replace(
      'Transaction scripts. Simple enough.',
      'TODO: your team decides.',
    );
    write('src/inventory/README.md', todo);
    expect(errors()).toEqual([]);
    write('src/catalog/README.md', todo);
    expect(errors()).toEqual([
      expect.stringMatching(/catalog.*Internal architecture.*TODO/),
    ]);
  });
});
