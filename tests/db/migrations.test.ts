import test from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../helpers/db.ts';
import { migrateTo } from '../../src/db/migrate.ts';
import { createDatabase } from '../../src/db/client.ts';

test('migrations create the foundation schema on an empty database', async () => {
  const testDb = await createTestDb({ migrate: false });
  try {
    await migrateTo(testDb.url);
    const { db, pool } = createDatabase(testDb.url);
    try {
      const tables = await db.execute<{ table_name: string }>(
        sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
      );
      const names = tables.rows.map((r) => r.table_name);
      for (const expected of [
        'account',
        'account_role',
        'audit_event',
        'notification',
        'notification_delivery',
        'pedigree_issuer',
        'product_setting',
        'reference_breed',
        'stored_file',
      ]) {
        assert.ok(names.includes(expected), 'missing table ' + expected);
      }
    } finally {
      await pool.end();
    }
  } finally {
    await testDb.drop();
  }
});

test('running migrations again is a no-op, not a destructive replay', async () => {
  const testDb = await createTestDb({ migrate: false });
  try {
    await migrateTo(testDb.url);
    const { db, pool } = createDatabase(testDb.url);
    let firstCount: number;
    try {
      await db.execute(sql`insert into reference_breed (name_fa, name_en) values ('آزمایشی', 'Fixture Breed')`);
      const applied = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
      );
      firstCount = Number(applied.rows[0]?.count ?? 0);
      assert.ok(firstCount > 0);
    } finally {
      await pool.end();
    }

    await migrateTo(testDb.url);

    const second = createDatabase(testDb.url);
    try {
      const applied = await second.db.execute<{ count: string }>(
        sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
      );
      assert.equal(Number(applied.rows[0]?.count ?? 0), firstCount, 'no migration was re-applied');
      // Data written between the two runs survives.
      const rows = await second.db.execute<{ count: string }>(
        sql`select count(*)::text as count from reference_breed where name_en = 'Fixture Breed'`,
      );
      assert.equal(rows.rows[0]?.count, '1');
    } finally {
      await second.pool.end();
    }
  } finally {
    await testDb.drop();
  }
});

test('the schema enforces the constraints the product depends on', async () => {
  const testDb = await createTestDb();
  try {
    // One notification delivery per idempotency key (§23.4).
    const indexes = await testDb.db.execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where schemaname = 'public'`,
    );
    const names = indexes.rows.map((r) => r.indexname);
    assert.ok(names.includes('notification_delivery_idem_key'));
    assert.ok(names.includes('account_role_unique'));
    assert.ok(names.includes('product_setting_scope_key'));
    assert.ok(names.includes('stored_file_storage_key'));
  } finally {
    await testDb.drop();
  }
});
