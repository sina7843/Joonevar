import test from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../helpers/db.ts';
import { migrateTo } from '../../src/db/migrate.ts';
import { createDatabase } from '../../src/db/client.ts';

/**
 * Every table Phase 1 shipped (migrations 0000–0016). Phase 2 extends these —
 * P2-D15 forbids a parallel vet, location, breed or document record — so a
 * Phase 2 migration that drops or renames one of them fails here (DEC-0146).
 */
const PHASE_1_TABLES = [
  // 0000 foundation
  'account', 'account_role', 'product_setting', 'audit_event', 'notification', 'notification_delivery',
  'stored_file', 'reference_breed', 'pedigree_issuer',
  // 0001 identity
  'profile', 'residence', 'kyc_case', 'otp_challenge', 'session', 'dev_outbound_sms',
  // 0002 billing
  'payment_batch', 'payment_item', 'payment_attempt', 'payment_callback', 'membership', 'dev_payment_outcome',
  // 0003 animals, 0004 vets
  'animal', 'foreign_pedigree_case', 'vet_profile', 'vet_location', 'vet_visit_batch', 'vet_visit_request',
  'referral_code',
  // 0005 clinical, 0006 documents, 0007 genetics
  'microchip', 'microchip_conflict', 'chip_procedure', 'sample', 'sample_event', 'registration_sheet_item',
  'registration_sheet', 'genetics_receipt', 'genetics_receipt_item', 'parentage_result',
  // 0008 pedigree, 0009 kennels
  'pedigree_issuance_item', 'pedigree', 'parentage_appeal', 'postal_request', 'kennel', 'kennel_breed',
  // 0010–0014 mating, breeding, allocation, declarations
  'mating_permit', 'permit_allocation_share', 'mating_date_declaration', 'pregnancy_declaration',
  'pregnancy_check', 'vet_pregnancy_result', 'birth_event', 'litter', 'puppy', 'puppy_allocation',
  'allocation_item', 'allocation_approval', 'puppy_card', 'personal_declaration', 'personal_note',
];

test('migrations create every Phase 1 table on an empty database', async () => {
  const testDb = await createTestDb({ migrate: false });
  try {
    await migrateTo(testDb.url);
    const { db, pool } = createDatabase(testDb.url);
    try {
      const tables = await db.execute<{ table_name: string }>(
        sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
      );
      const names = tables.rows.map((r) => r.table_name);
      for (const expected of PHASE_1_TABLES) {
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
      await db.execute(
        sql`insert into reference_breed (name_fa, name_en, slug) values ('آزمایشی', 'Fixture Breed', 'fixture-breed')`,
      );
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
