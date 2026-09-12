/**
 * Seed CLI.
 *
 *   npm run db:seed              baseline settings and reference data
 *   npm run db:seed -- --dev     baseline plus clearly labelled synthetic accounts
 */
import { createDatabase } from '../client.ts';
import { loadEnv } from '../../config/env.ts';
import { seedBaseline } from './index.ts';
import { seedDevFixtures } from './dev-fixtures.ts';

const env = loadEnv();
const withFixtures = process.argv.includes('--dev');
const { db, pool } = createDatabase(env.DATABASE_URL);

try {
  const report = await seedBaseline(db);
  console.log(
    'settings inserted: ' +
      report.settingsInserted.length +
      ', filled from baseline: ' +
      report.settingsFilled.length +
      ', preserved: ' +
      report.settingsPreserved.length +
      ', breeds inserted: ' +
      report.breedsInserted +
      ', approved issuers: ' +
      report.issuersInserted +
      ' (registry intentionally empty until the association supplies the real list)',
  );
  const added = report.taxonomies.reduce((total, entry) => total + entry.inserted, 0);
  console.log(
    'taxonomies: ' +
      report.taxonomies.map((entry) => entry.name + ' v' + entry.version).join(', ') +
      ' — entries added this run: ' +
      added,
  );
  if (withFixtures) {
    const ids = await seedDevFixtures(db, env);
    console.log('synthetic fixture accounts: ' + ids.length + ' (SYNTHETIC, 0999 reserved prefix)');
  }
} finally {
  await pool.end();
}
