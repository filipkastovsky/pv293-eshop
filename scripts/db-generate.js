// Usage: npm run db:generate -- <module>
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mod = process.argv[2];
if (!mod) {
  console.error('Usage: npm run db:generate -- <module>');
  process.exit(1);
}
const r = spawnSync(
  'npx',
  ['drizzle-kit', 'generate', '--config', `src/${mod}/drizzle.config.ts`],
  { stdio: 'inherit' },
);
if (r.status === 0) {
  // drizzle-kit emits a bare CREATE SCHEMA, which clashes with migrateModule
  // (it creates the schema first). Make it idempotent.
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
  const isMigration = (f) =>
    f.endsWith('.sql') && f.includes(`${path.sep}migrations${path.sep}`);
  for (const file of walk(path.join('src', mod)).filter(isMigration)) {
    const sql = fs.readFileSync(file, 'utf8');
    const fixed = sql.replace(
      /CREATE SCHEMA (?!IF NOT EXISTS)/g,
      'CREATE SCHEMA IF NOT EXISTS ',
    );
    if (fixed !== sql) fs.writeFileSync(file, fixed);
  }
}
process.exit(r.status ?? 1);
