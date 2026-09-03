/**
 * Browser suite runner.
 *
 * The product ships with `integration.payment.mode = MOCK_AUTO`, which is what
 * makes the flows completable on a laptop. A mock that always succeeds cannot,
 * by construction, produce the two cases the browser suite has to keep proving:
 * a return from the gateway without paying, and a gateway that says "failed".
 * Those need the visible development gateway, so this runner switches the
 * managed setting to DEV_GATEWAY for the duration of the suite and puts back
 * whatever was there before, whether the suite passes or not.
 *
 * The mock path is not left untested: `tests/browser/payment-mock.test.ts`
 * switches itself back to MOCK_AUTO and proves that route end to end.
 */
import { spawn } from 'node:child_process';
import pg from 'pg';

const KEY = 'integration.payment.mode';
// The same local default the browser tests themselves fall back to.
const url = process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';

const pool = new pg.Pool({ connectionString: url });

async function readMode() {
  const { rows } = await pool.query('select value from product_setting where key = $1', [KEY]);
  return rows[0]?.value ?? null;
}

async function writeMode(value) {
  await pool.query('update product_setting set value = $1, updated_at = now() where key = $2', [
    JSON.stringify(value),
    KEY,
  ]);
}

const previous = await readMode();
await writeMode('DEV_GATEWAY');

const child = spawn(
  process.execPath,
  ['--test', '--test-concurrency=1', 'tests/browser/*.test.ts'],
  { stdio: 'inherit', shell: false },
);

const code = await new Promise((resolve) => child.on('exit', resolve));

await writeMode(previous ?? 'MOCK_AUTO');
await pool.end();
process.exit(code ?? 1);
