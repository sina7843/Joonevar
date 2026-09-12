/**
 * Document verification against real issued documents — Phase 2 PROMPT-014.
 *
 * The documents here are issued through the actual Phase 1 path: an animal, a
 * visit, a microchip, a sample, a verified payment and a registration sheet;
 * then a pedigree on top of it. That is the only honest way to prove the
 * verification reads what was really issued rather than a copy of it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { animalWithSheet, pedigreedAnimal, withMatingCtx, type MatingCtx } from '../helpers/mating.ts';
import { registrationSheets } from '../../src/db/schema/documents.ts';
import { pedigrees } from '../../src/db/schema/pedigree.ts';
import { verificationAttempts } from '../../src/db/schema/verification.ts';
import { clientKeyOf, verifyDocument } from '../../src/verification/service.ts';
import { NEVER_DISCLOSED } from '../../src/verification/model.ts';

const withCtx = (fn: (ctx: MatingCtx) => Promise<void>) =>
  withMatingCtx(
    { mobilePrefix: '099907400', tmpPrefix: 'hamzist-verify-', councilCode: 'SYNTH-VF-1', chipBase: 6_100_000 },
    fn,
  );

const STRANGER = clientKeyOf('203.0.113.9');
const OTHER = clientKeyOf('198.51.100.4');

/** The managed ceiling, written as the settings panel writes it. */
async function setLimit(ctx: MatingCtx, value: number): Promise<void> {
  await ctx.testDb.db.execute(
    sql`update product_setting set value = ${String(value)}::jsonb, version = version + 1 where key = 'verification.attempt_hourly_limit'`,
  );
  await ctx.testDb.db.execute(sql`delete from verification_attempt`);
}

test('an issued registration sheet answers as valid, by its own number and by the animal’s Pet ID', async () => {
  await withCtx(async (ctx) => {
    await setLimit(ctx, 100);
    const { animalId } = await animalWithSheet(ctx, 'سگ استعلام');
    const [sheet] = await ctx.testDb.db.select().from(registrationSheets).where(eq(registrationSheets.animalId, animalId));
    assert.ok(sheet, 'the Phase 1 flow really issued a sheet');

    const bySheetNo = await verifyDocument(ctx.testDb.db, { code: sheet!.sheetNo, clientKey: STRANGER });
    assert.equal(bySheetNo.state, 'VALID');
    assert.equal(bySheetNo.kindFa, 'برگه ثبتی');
    assert.equal(bySheetNo.code, sheet!.sheetNo);
    assert.ok(bySheetNo.issuedAt instanceof Date);
    assert.equal(bySheetNo.animal?.speciesFa, 'سگ');
    assert.equal(bySheetNo.animal?.sexFa, 'نر');
    assert.equal(bySheetNo.animal?.birthYear, '2022');
    assert.ok((bySheetNo.animal?.breedFa ?? '').length > 0);

    // The animal's own identifier is the same question, answered with the document.
    const byPetId = await verifyDocument(ctx.testDb.db, { code: sheet!.petId, clientKey: STRANGER });
    assert.equal(byPetId.state, 'VALID');
    assert.equal(byPetId.code, sheet!.sheetNo, 'the answer names the document, not the code that was typed');

    // A scanned QR carries the address; only the code inside it is read.
    const byQr = await verifyDocument(ctx.testDb.db, {
      code: 'https://hamzist.example/verify/' + sheet!.sheetNo,
      clientKey: STRANGER,
    });
    assert.equal(byQr.state, 'VALID');
    assert.equal(byQr.code, sheet!.sheetNo);

    // Nothing about the owner or the record reaches the answer (§17, §20).
    const keys = Object.keys(bySheetNo).concat(Object.keys(bySheetNo.animal ?? {}));
    assert.equal(keys.some((key) => NEVER_DISCLOSED.includes(key)), false);
    assert.equal(JSON.stringify(bySheetNo).includes(sheet!.microchipNumber), false, 'no microchip number is disclosed');
    assert.equal(
      JSON.stringify(bySheetNo).includes(sheet!.sampleTrackingCode),
      false,
      'no sample tracking code is disclosed',
    );
  });
});

test('a pedigree answers as valid, and as replaced once a corrected result exists', async () => {
  await withCtx(async (ctx) => {
    await setLimit(ctx, 100);
    const { animalId, pedigreeCode } = await pedigreedAnimal(ctx, ctx.first, 'سگ شجره‌دار', 'MALE');

    const valid = await verifyDocument(ctx.testDb.db, { code: pedigreeCode, clientKey: STRANGER });
    assert.equal(valid.state, 'VALID');
    assert.equal(valid.kindFa, 'شجره‌نامه');
    assert.equal(valid.noticeFa, null);

    // A later corrected parentage result leaves the document and adds its notice.
    await ctx.testDb.db
      .update(pedigrees)
      .set({ correctionNoticeFa: 'نتیجه نسب این حیوان بعداً اصلاح شده است.', noticedAt: new Date() })
      .where(eq(pedigrees.animalId, animalId));

    const replaced = await verifyDocument(ctx.testDb.db, { code: pedigreeCode, clientKey: STRANGER });
    assert.equal(replaced.state, 'REPLACED');
    assert.equal(replaced.code, pedigreeCode, 'the document itself is still named');
    assert.equal(replaced.noticeFa, 'نتیجه نسب این حیوان بعداً اصلاح شده است.');
    assert.ok(replaced.issuedAt instanceof Date);
  });
});

test('a code nobody issued, a wrong prefix and a stub are all simply not found', async () => {
  await withCtx(async (ctx) => {
    await setLimit(ctx, 100);
    for (const code of ['RS-ZZZZ2345', 'PD-ZZZZ2345', 'PC-ZZZZ2345', 'PET-ZZZZ2345', 'XX-ABCD2345', 'RS-AB']) {
      const answer = await verifyDocument(ctx.testDb.db, { code, clientKey: STRANGER });
      assert.equal(answer.state, 'NOT_FOUND', code);
      assert.equal(answer.kindFa, null, code);
      assert.equal(answer.animal, null, code);
    }
    // An empty question is a mistake, not an answer.
    await assert.rejects(verifyDocument(ctx.testDb.db, { code: '   ', clientKey: STRANGER }), /کد سند/);
  });
});

test('repeated attempts from one place are stopped, and every attempt is recorded', async () => {
  await withCtx(async (ctx) => {
    await setLimit(ctx, 2);

    assert.equal((await verifyDocument(ctx.testDb.db, { code: 'RS-AAAA2345', clientKey: STRANGER })).state, 'NOT_FOUND');
    assert.equal((await verifyDocument(ctx.testDb.db, { code: 'RS-BBBB2345', clientKey: STRANGER })).state, 'NOT_FOUND');

    const stopped = await verifyDocument(ctx.testDb.db, { code: 'RS-CCCC2345', clientKey: STRANGER });
    assert.equal(stopped.state, 'RATE_LIMITED');
    // A guesser is not told whether the code exists.
    assert.equal(stopped.kindFa, null);
    assert.equal(stopped.animal, null);

    // Someone else is unaffected: the ceiling is per place, not for everyone.
    assert.equal((await verifyDocument(ctx.testDb.db, { code: 'RS-DDDD2345', clientKey: OTHER })).state, 'NOT_FOUND');

    const rows = await ctx.testDb.db.select().from(verificationAttempts);
    assert.equal(rows.length, 4);
    assert.equal(rows.filter((row) => row.outcome === 'RATE_LIMITED').length, 1);
    // The address itself is never stored, only a hash of it.
    assert.equal(rows.every((row) => /^[0-9a-f]{64}$/.test(row.clientKey)), true);
    assert.equal(rows.some((row) => row.clientKey.includes('203.0.113.9')), false);
  });
});

test('the client key is a hash, and an unknown address still counts as one place', () => {
  assert.match(clientKeyOf('203.0.113.9'), /^[0-9a-f]{64}$/);
  assert.notEqual(clientKeyOf('203.0.113.9'), clientKeyOf('198.51.100.4'));
  // A proxy chain is counted by the first address it names.
  assert.equal(clientKeyOf('203.0.113.9, 10.0.0.1'), clientKeyOf('203.0.113.9'));
  assert.equal(clientKeyOf(null), clientKeyOf(''));
});
