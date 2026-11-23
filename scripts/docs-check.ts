// Usage: npm run docs:check
// Checks that the ADRs, their index and the module READMEs agree with each other and with the code.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_DIR = join('docs', 'adr');
const ADR_NON_RECORDS = new Set(['README.md', 'template.md']);
const ADR_FILE = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const ADR_REQUIRED = [
  '## Context and Problem Statement',
  '## Decision Drivers',
  '## Considered Options',
  '## Decision Outcome',
  '## Consequences',
];

const NOT_MODULES = new Set(['contracts', 'platform']);
/** Team modules may leave Internal architecture as TODO until the team decides. */
const TEAM_MODULES = new Set(['checkout', 'inventory', 'fulfilment']);
const MODULE_SECTIONS = [
  'Responsibility',
  'Owner',
  'Internal architecture',
  'Events emitted',
  'Events consumed',
  'Policies',
  'Public queries',
  'HTTP',
];
const EVENT_SECTIONS = ['Events emitted', 'Events consumed'];

interface Adr {
  file: string;
  number: string;
  title: string;
  status: string;
}

const firstWord = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? '';

function hasLine(text: string, line: string): boolean {
  return text.split(/\r?\n/).some((l) => l.trimEnd() === line);
}

function checkAdrs(root: string, errors: string[]): void {
  const dir = join(root, ADR_DIR);
  if (!existsSync(dir)) {
    errors.push(`${ADR_DIR}: directory is missing`);
    return;
  }
  const adrs: Adr[] = [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !ADR_NON_RECORDS.has(f))
    .sort();

  for (const file of files) {
    const path = join(ADR_DIR, file);
    const match = ADR_FILE.exec(file);
    if (!match) {
      errors.push(`${path}: file name must be NNNN-kebab-slug.md`);
      continue;
    }
    const text = readFileSync(join(dir, file), 'utf8');
    const statusMatch = /^(?:- )?Status:\s*(.+)$/m.exec(text);
    if (!statusMatch) errors.push(`${path}: missing "Status:"`);
    for (const heading of ADR_REQUIRED) {
      if (!hasLine(text, heading)) errors.push(`${path}: missing "${heading}"`);
    }
    if (!/^- Bad:/m.test(text)) {
      errors.push(`${path}: no line starting with "- Bad:"`);
    }
    const titleMatch = /^# \d{4}\.\s*(.+)$/m.exec(text);
    adrs.push({
      file,
      number: match[1],
      title: titleMatch ? titleMatch[1].trim() : '',
      status: statusMatch ? firstWord(statusMatch[1]) : '',
    });
  }

  const numbers = adrs.map((a) => Number(a.number));
  const seen = new Set<number>();
  for (const n of numbers) {
    if (seen.has(n)) errors.push(`${ADR_DIR}: duplicate ADR number ${pad(n)}`);
    seen.add(n);
  }
  const max = Math.max(0, ...numbers);
  const open = openAdrNumbers(root);
  for (let n = 1; n <= max; n++) {
    if (!seen.has(n) && !open.has(n))
      errors.push(`${ADR_DIR}: gap in ADR numbering, ${pad(n)} is missing`);
  }

  checkIndex(root, adrs, errors);
}

/** Numbers the index lists as open (a line "0008 — ... — open"): reserved, not written yet. */
function openAdrNumbers(root: string): Set<number> {
  const file = join(root, ADR_DIR, 'README.md');
  const open = new Set<number>();
  if (!existsSync(file)) return open;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^(?:-\s+)?(\d{4})\s+—.*\bopen\b/.exec(line);
    if (m) open.add(Number(m[1]));
  }
  return open;
}

const pad = (n: number) => String(n).padStart(4, '0');

/** Index rows are Markdown table rows whose first cell contains a four-digit ADR number. */
function checkIndex(root: string, adrs: Adr[], errors: string[]): void {
  const path = join(ADR_DIR, 'README.md');
  const file = join(root, path);
  if (!existsSync(file)) {
    errors.push(`${path}: ADR index is missing`);
    return;
  }
  const rows = new Map<string, { title: string; status: string }>();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    const number = /\b(\d{4})\b/.exec(cells[0] ?? '')?.[1];
    if (!number) continue;
    rows.set(number, {
      title: (cells[1] ?? '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim(),
      status: firstWord(cells[2] ?? ''),
    });
  }
  for (const adr of adrs) {
    const row = rows.get(adr.number);
    if (!row) {
      errors.push(`${path}: index has no row for ADR ${adr.number}`);
      continue;
    }
    if (row.title !== adr.title) {
      errors.push(
        `${path}: index row ${adr.number}: title is "${row.title}", the ADR says "${adr.title}"`,
      );
    }
    if (row.status !== adr.status) {
      errors.push(
        `${path}: index row ${adr.number}: status is "${row.status}", the ADR says "${adr.status}"`,
      );
    }
  }
  for (const number of rows.keys()) {
    if (!adrs.some((a) => a.number === number)) {
      errors.push(`${path}: index row ${number} has no ADR file`);
    }
  }
}

/** Splits a Markdown file into its `## ` sections, in document order. */
function sections(text: string): { name: string; body: string }[] {
  const result: { name: string; body: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const heading = /^## (.+?)\s*$/.exec(line);
    if (heading) result.push({ name: heading[1], body: '' });
    else if (result.length > 0) result[result.length - 1].body += `${line}\n`;
  }
  return result;
}

function checkModules(
  root: string,
  eventTypes: Set<string>,
  errors: string[],
): void {
  const srcDir = join(root, 'src');
  if (!existsSync(srcDir)) return;
  const modules = readdirSync(srcDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !NOT_MODULES.has(e.name))
    .map((e) => e.name)
    .sort();

  for (const mod of modules) {
    const path = join('src', mod, 'README.md');
    const file = join(root, path);
    if (!existsSync(file)) {
      errors.push(`src/${mod}: module has no README.md`);
      continue;
    }
    const found = sections(readFileSync(file, 'utf8'));
    const names = found.map((s) => s.name);
    const missing = MODULE_SECTIONS.filter((s) => !names.includes(s));
    for (const name of missing)
      errors.push(`${path}: missing section "## ${name}"`);
    if (missing.length === 0) {
      const order = names.filter((n) => MODULE_SECTIONS.includes(n));
      if (order.join('|') !== MODULE_SECTIONS.join('|')) {
        errors.push(
          `${path}: sections out of order, expected ${MODULE_SECTIONS.join(', ')}`,
        );
      }
    }

    const internal = found.find((s) => s.name === 'Internal architecture');
    if (
      internal &&
      !TEAM_MODULES.has(mod) &&
      /^TODO\b/i.test(internal.body.trim())
    ) {
      errors.push(
        `${path}: "Internal architecture" is still TODO in an instructor module`,
      );
    }

    for (const section of found.filter((s) =>
      EVENT_SECTIONS.includes(s.name),
    )) {
      for (const [, name] of section.body.matchAll(/`([A-Z][A-Za-z0-9]*)`/g)) {
        if (!eventTypes.has(name)) {
          errors.push(
            `${path}: "${section.name}" names ${name}, which is not in EVENT_TYPES`,
          );
        }
      }
    }
  }
}

/** Returns one message per problem found under `root`; an empty list means the docs are consistent. */
export function checkDocs(
  root: string,
  eventTypes: Iterable<string>,
): string[] {
  const errors: string[] = [];
  checkAdrs(root, errors);
  checkModules(root, new Set(eventTypes), errors);
  return errors;
}

if (require.main === module) {
  // Loaded here, not at the top, so the check itself stays independent of the application code.
  const { EVENT_TYPES } = require('../src/contracts/registry') as {
    EVENT_TYPES: Record<string, unknown>;
  };
  const errors = checkDocs(process.cwd(), Object.keys(EVENT_TYPES));
  for (const e of errors) console.error(`docs:check: ${e}`);
  if (errors.length > 0) process.exit(1);
  console.log('docs:check: OK');
}
