/**
 * The operational denial matrix and managed data — gate `operations-rbac`.
 *
 * §21 and §23.4 make the same demand from two directions: an operational screen
 * belongs to one environment, and a record-specific action belongs to the actor
 * that record names. This suite tries the wrong actor and the wrong id against
 * every operational entry point, and checks that managed values keep their
 * actor, time, previous value and price snapshot.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { auditEvents, referenceBreeds } from '../../src/db/schema/core.ts';
import { paymentItems } from '../../src/db/schema/billing.ts';
import { animals } from '../../src/db/schema/animals.ts';
import {
  accountsWithoutMembership,
  addBreedToRegistry,
  associationQueues,
  auditHistory,
  auditTargetTypes,
  breedRegistry,
  breedUsage,
  geneticsQueues,
  memberRecords,
  postalRequestQueue,
  setBreedActive,
} from '../../src/operations/service.ts';
import { issueMembershipNumber, setMembershipActive } from '../../src/billing/membership.ts';
import { readMoney, readSetting, updateSetting } from '../../src/settings/service.ts';
import { createSheetRequest } from '../../src/documents/registration-sheet.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { reviewKennel } from '../../src/kennels/service.ts';
import { reviewPermit } from '../../src/mating/permits.ts';
import { vetRequestDetail } from '../../src/vets/visits.ts';
import { toman } from '../../src/domain/money.ts';
import {
  animalWithSheet,
  payingGateway,
  withMatingCtx,
  type MatingCtx,
} from '../helpers/mating.ts';

const withCtx = (fn: (ctx: MatingCtx) => Promise<void>) =>
  withMatingCtx(
    { mobilePrefix: '099908000', tmpPrefix: 'hamzist-ops-', councilCode: 'SYNTH-OP-1', chipBase: 1_000_000 },
    fn,
  );

/** Every operational reader, with the one context that may open it. */
const OPERATIONAL_READERS = [
  { name: 'associationQueues', context: 'ASSOCIATION_OPERATOR', run: associationQueues },
  { name: 'memberRecords', context: 'ASSOCIATION_OPERATOR', run: memberRecords },
  { name: 'postalRequestQueue', context: 'ASSOCIATION_OPERATOR', run: postalRequestQueue },
  { name: 'geneticsQueues', context: 'GENETICS_OPERATOR', run: geneticsQueues },
  { name: 'auditHistory', context: 'SUPERADMIN', run: auditHistory },
  { name: 'auditTargetTypes', context: 'SUPERADMIN', run: auditTargetTypes },
  { name: 'breedRegistry', context: 'SUPERADMIN', run: breedRegistry },
] as const;

test('each operational reader belongs to exactly one environment', async () => {
  await withCtx(async (ctx) => {
    const actors = [
      { label: 'USER', actor: ctx.first.actor },
      { label: 'TRUSTED_VET', actor: ctx.vet.actor },
      { label: 'ASSOCIATION_OPERATOR', actor: ctx.association.actor },
      { label: 'GENETICS_OPERATOR', actor: ctx.centre.actor },
      { label: 'SUPERADMIN', actor: ctx.admin.actor },
    ];

    for (const reader of OPERATIONAL_READERS) {
      for (const { label, actor } of actors) {
        const call = () => reader.run(ctx.testDb.db, actor);
        if (label === reader.context) {
          await call();
        } else {
          await assert.rejects(
            call,
            (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
            reader.name + ' must refuse ' + label,
          );
        }
      }
    }

    // A public role switch never reaches an operational environment.
    assert.equal(ctx.first.actor.context, 'USER');
    await assert.rejects(
      () => accountsWithoutMembership(ctx.testDb.db, ctx.first.actor),
      (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
    );
  });
});

test('a record-specific action refuses the wrong actor and a tampered id', async () => {
  await withCtx(async (ctx) => {
    const animal = await animalWithSheet(ctx, 'سگ عملیات');
    const otherId = '00000000-0000-0000-0000-000000000000';

    // The veterinarian's own case is not readable by another veterinarian, and
    // an id that belongs to nobody answers the same way as one that is not
    // yours (§23.4): the answer never reveals which of the two it was.
    const detail = await vetRequestDetail(ctx.testDb.db, ctx.vet.actor, animal.requestId);
    assert.equal(detail.request.id, animal.requestId);
    await assert.rejects(
      () => vetRequestDetail(ctx.testDb.db, ctx.vet.actor, otherId),
      /پیدا نشد/,
    );
    await assert.rejects(
      () => vetRequestDetail(ctx.testDb.db, ctx.first.actor, animal.requestId),
      /دامپزشک معتمد/,
    );

    // An operational decision on a case that does not exist is refused, and the
    // wrong environment is refused before the record is even looked at.
    await assert.rejects(
      () => reviewKennel(ctx.testDb.db, ctx.centre.actor, { kennelId: otherId, decision: 'APPROVED' }),
      (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
    );
    await assert.rejects(
      () => reviewKennel(ctx.testDb.db, ctx.association.actor, { kennelId: otherId, decision: 'APPROVED' }),
      /پیدا نشد/,
    );
    await assert.rejects(
      () => reviewPermit(ctx.testDb.db, ctx.first.actor, { permitId: otherId, decision: 'ISSUED' }),
      /عملیاتی/,
    );
    await assert.rejects(
      () => reviewPermit(ctx.testDb.db, ctx.association.actor, { permitId: otherId, decision: 'ISSUED' }),
      /پیدا نشد/,
    );

    // Membership actions are operational, and a member cannot run them.
    await assert.rejects(
      () =>
        issueMembershipNumber(ctx.testDb.db, ctx.first.actor, {
          accountId: ctx.first.accountId,
          membershipNo: 'X-1',
        }),
      /محیط عملیاتی/,
    );
    await assert.rejects(
      () =>
        setMembershipActive(ctx.testDb.db, ctx.vet.actor, {
          accountId: ctx.first.accountId,
          active: false,
          reasonFa: 'آزمایشی',
        }),
      /محیط عملیاتی/,
    );
  });
});

test('a managed value records its actor, time and previous value, and needs a reason', async () => {
  await withCtx(async (ctx) => {
    const before = await readSetting(ctx.testDb.db, 'referral.validity_days');

    // Only the superadmin environment writes managed data.
    await assert.rejects(
      () =>
        updateSetting(ctx.testDb.db, ctx.first.actor, {
          key: 'referral.validity_days',
          value: '30',
          reason: 'آزمایشی',
        }),
      (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
    );

    const updated = await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'referral.validity_days',
      value: '30',
      reason: 'SYNTHETIC — تغییر آزمایشی مهلت مراجعه',
    });
    assert.equal(updated.value, 30);
    assert.equal(updated.version, before.version + 1);

    const [event] = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.targetType, 'PRODUCT_SETTING'), eq(auditEvents.targetId, 'referral.validity_days')),
      )
      .orderBy(auditEvents.occurredAt);
    assert.ok(event);
    assert.equal(event.actorAccountId, ctx.admin.accountId);
    assert.equal((event.before as { value: unknown }).value, before.value);
    assert.equal((event.after as { value: unknown }).value, 30);
    assert.match(event.reason ?? '', /SYNTHETIC/);

    // A value outside the key's own kind is refused rather than stored.
    await assert.rejects(
      () =>
        updateSetting(ctx.testDb.db, ctx.admin.actor, {
          key: 'referral.validity_days',
          value: 'سی روز',
          reason: 'آزمایشی',
        }),
      (error: unknown) => (error as { code?: string }).code === 'VALIDATION',
    );
    // And a key nobody declared is not created on the fly.
    await assert.rejects(
      () =>
        updateSetting(ctx.testDb.db, ctx.admin.actor, {
          key: 'fee.invented_toman',
          value: '1000',
          reason: 'آزمایشی',
        }),
      (error: unknown) => (error as { code?: string }).code === 'NOT_FOUND',
    );
  });
});

test('a later tariff change never rewrites what a paid item was charged', async () => {
  await withCtx(async (ctx) => {
    const first = await animalWithSheet(ctx, 'سگ تعرفه');
    const [item] = await ctx.testDb.db
      .select()
      .from(paymentItems)
      .where(eq(paymentItems.targetId, first.animalId));
    assert.ok(item);
    const chargedAmount = item.amountToman;
    const chargedVersion = item.settingVersion;

    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'fee.registration_sheet_toman',
      value: '999000',
      reason: 'SYNTHETIC — افزایش آزمایشی تعرفه',
    });
    const now = await readMoney(ctx.testDb.db, 'fee.registration_sheet_toman');
    assert.deepEqual(now, { configured: true, toman: toman('999000') });

    // The snapshot on the paid item is untouched by the new tariff.
    const [after] = await ctx.testDb.db
      .select()
      .from(paymentItems)
      .where(eq(paymentItems.targetId, first.animalId));
    assert.equal(after!.amountToman, chargedAmount);
    assert.equal(after!.settingVersion, chargedVersion);

    // A new batch is priced at the new value, in its own snapshot.
    const second = await animalWithSheet(ctx, 'سگ تعرفه دوم', { skipSheet: true });
    const batch = await createSheetRequest(ctx.testDb.db, ctx.first.actor, [second.animalId]);
    const [freshItem] = await ctx.testDb.db
      .select()
      .from(paymentItems)
      .where(eq(paymentItems.batchId, batch.batch.id));
    assert.equal(freshItem!.amountToman, '999000');
    assert.notEqual(freshItem!.settingVersion, chargedVersion);

    const gateway = payingGateway(9_990_000n);
    const started = await startAttempt(
      ctx.testDb.db,
      ctx.first.actor,
      { batchId: batch.batch.id, callbackUrl: '/x' },
      gateway,
      'test',
    );
    assert.equal(
      (await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects)).state,
      'PAID',
    );
  });
});

test('the breed register is managed data, and retiring one keeps existing animals', async () => {
  await withCtx(async (ctx) => {
    const animal = await animalWithSheet(ctx, 'سگ نژاد');
    const [row] = await ctx.testDb.db.select().from(animals).where(eq(animals.id, animal.animalId));
    const usedBreedId = row!.breedId!;
    assert.ok((await breedUsage(ctx.testDb.db, ctx.admin.actor, usedBreedId)) >= 1);

    // Only the superadmin environment manages the register.
    await assert.rejects(
      () =>
        addBreedToRegistry(ctx.testDb.db, ctx.association.actor, {
          nameFa: 'نژاد آزمایشی',
          nameEn: 'Synthetic Breed',
        }),
      (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN',
    );

    const added = await addBreedToRegistry(ctx.testDb.db, ctx.admin.actor, {
      nameFa: 'نژاد آزمایشی',
      nameEn: 'SYNTHETIC Breed',
    });
    assert.equal(added.isActive, true);
    await assert.rejects(
      () =>
        addBreedToRegistry(ctx.testDb.db, ctx.admin.actor, {
          nameFa: 'نژاد آزمایشی',
          nameEn: 'SYNTHETIC Breed',
        }),
      /قبلاً در فهرست مرجع/,
    );

    // Retiring the breed used by a registered animal changes no animal at all.
    await setBreedActive(ctx.testDb.db, ctx.admin.actor, { breedId: usedBreedId, active: false });
    const [unchanged] = await ctx.testDb.db.select().from(animals).where(eq(animals.id, animal.animalId));
    assert.equal(unchanged!.breedId, usedBreedId);
    const [retired] = await ctx.testDb.db
      .select()
      .from(referenceBreeds)
      .where(eq(referenceBreeds.id, usedBreedId));
    assert.equal(retired!.isActive, false);

    const [event] = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'REFERENCE_BREED_RETIRED'));
    assert.equal(event!.actorAccountId, ctx.admin.accountId);
    assert.equal((event!.before as { isActive: boolean }).isActive, true);

    // And it can be brought back, which is also recorded.
    await setBreedActive(ctx.testDb.db, ctx.admin.actor, { breedId: usedBreedId, active: true });
    const enabled = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'REFERENCE_BREED_ENABLED'));
    assert.equal(enabled.length, 1);
  });
});

test('the queue counts are the real ones the detail screens read', async () => {
  await withCtx(async (ctx) => {
    const empty = await associationQueues(ctx.testDb.db, ctx.association.actor);
    const kycQueue = empty.find((queue) => queue.key === 'kyc')!;
    assert.equal(kycQueue.waiting, 0, 'every KYC case of the fixture is already reviewed');
    for (const queue of empty) {
      assert.match(queue.href, /^\/assoc\//, 'every queue opens a real route');
    }

    // A submitted kennel really moves the kennel queue by one.
    const { startKennel, saveKennel, addBreed, startKennelPayment, submitKennel } = await import(
      '../../src/kennels/service.ts'
    );
    await animalWithSheet(ctx, 'سگ کنل عملیات');
    const kennel = await startKennel(ctx.testDb.db, ctx.first.actor);
    await saveKennel(ctx.testDb.db, ctx.first.actor, kennel.id, {
      nameFa: 'کنل عملیات',
      cityFa: 'تهران',
      addressFa: 'نشانی آزمایشی',
    });
    const [breed] = await ctx.testDb.db.select().from(referenceBreeds).limit(1);
    await addBreed(ctx.testDb.db, ctx.first.actor, kennel.id, breed!.id);
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'fee.kennel_registration_toman',
      value: '150000',
      reason: 'SYNTHETIC — مقدار آزمایشی',
    });
    const batch = await startKennelPayment(ctx.testDb.db, ctx.first.actor, kennel.id);
    const gateway = payingGateway(1_500_000n);
    const started = await startAttempt(
      ctx.testDb.db,
      ctx.first.actor,
      { batchId: batch.id, callbackUrl: '/x' },
      gateway,
      'test',
    );
    await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects);
    await submitKennel(ctx.testDb.db, ctx.first.actor, kennel.id);

    const after = await associationQueues(ctx.testDb.db, ctx.association.actor);
    assert.equal(after.find((queue) => queue.key === 'kennels')!.waiting, 1);

    // The genetics queues answer from the same tables their screens read.
    const genetics = await geneticsQueues(ctx.testDb.db, ctx.centre.actor);
    assert.equal(genetics.length, 5);
    for (const queue of genetics) assert.match(queue.href, /^\/genetics/);
  });
});

test('the audit viewer reads history and can never change it', async () => {
  await withCtx(async (ctx) => {
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'fee.puppy_card_toman',
      value: '120000',
      reason: 'SYNTHETIC — مقدار آزمایشی',
    });

    const all = await auditHistory(ctx.testDb.db, ctx.admin.actor, { limit: 200 });
    assert.ok(all.length > 0);
    const settingsOnly = await auditHistory(ctx.testDb.db, ctx.admin.actor, {
      targetType: 'PRODUCT_SETTING',
    });
    assert.ok(settingsOnly.every((row) => row.targetType === 'PRODUCT_SETTING'));
    assert.ok(settingsOnly.length <= all.length);

    const types = await auditTargetTypes(ctx.testDb.db, ctx.admin.actor);
    assert.ok(types.includes('PRODUCT_SETTING'));

    // Reading the history writes nothing: the same read twice returns the same
    // rows, and the viewer exposes no way to change one.
    const again = await auditHistory(ctx.testDb.db, ctx.admin.actor, { limit: 200 });
    assert.equal(again.length, all.length);
    assert.deepEqual(
      again.map((row) => row.id),
      all.map((row) => row.id),
    );
  });
});
