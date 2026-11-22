// Usage: npm run db:generate -- <module>
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
process.exit(r.status ?? 1);
