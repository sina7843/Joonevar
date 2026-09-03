import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents, notifications, pedigreeIssuers, referenceBreeds } from '../../src/db/schema/core.ts';
import { animals } from '../../src/db/schema/animals.ts';
import { saveProfile, signInWithVerifiedMobile } from '../../src/identity/account.ts';
import { attachKycDocument, reviewKyc, submitKyc } from '../../src/identity/kyc.ts';
import {
  applyLineage,
  countRegisteredAnimals,
  draftOf,
  editAnimal,
  evaluateLineage,
  familyOf,
  listAnimals,
  registerAnimal,
  rememberReturn,
  requireOwnedAnimal,
  saveDraft,
  startDraft,
} from '../../src/animals/service.ts';
import {
  addIssuer,
  attachForeignSide,
  foreignQueue,
  getOrCreateForeignCase,
  reviewForeignCase,
  setForeignDetails,
  submitForeignCase,
} from '../../src/animals/foreign-pedigree.ts';
import { eligibilityFor, loadFacts } from '../../src/domain/eligibility/service.ts';
import { readPrivateFile } from '../../src/files/storage.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

const actorFor = (accountId: string, context: Actor['context'] = 'USER'): Actor => ({
  accountId: accountId as AccountId,
  context,
  activeRoles: context === 'USER' ? [] : [context as never],
});

interface Ctx {
  readonly testDb: TestDb;
  readonly root: string;
  readonly owner: { accountId: string; actor: Actor };
  readonly operator: { accountId: string; actor: Actor };
  readonly breedId: string;
}

async function withCtx(fn: (ctx: Ctx) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-animals-'));
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);

    const operatorAccount = await signInWithVerifiedMobile(testDb.db, '09990300099');
    const operator = { accountId: operatorAccount.accountId, actor: actorFor(operatorAccount.accountId, 'ASSOCIATION_OPERATOR') };

    const account = await signInWithVerifiedMobile(testDb.db, '09990300001');
    const actor = actorFor(account.accountId);
    await saveProfile(testDb.db, actor, {
      firstName: 'نمونه',
      lastName: 'مالک آزمایشی',
    displayName: 'نمایشی آزمایشی',
      nationalId: '0499370899',
      birthDate: '1990-01-01',
    });
    await attachKycDocument(testDb.db, root, actor, { bytes: JPEG });
    const kyc = await submitKyc(testDb.db, actor);
    await reviewKyc(testDb.db, operator.actor, { caseId: kyc.id, decision: 'APPROVED' });

    const [breed] = await testDb.db.select().from(referenceBreeds).limit(1);

    await fn({ testDb, root, owner: { accountId: account.accountId, actor }, operator, breedId: breed!.id });
  } finally {
    await testDb.drop();
    await fs.rm(root, { recursive: true, force: true });
  }
}

/** Registers a complete animal and, when asked, gives it a pedigree code. */
async function makeAnimal(
  ctx: Ctx,
  input: { name: string; sex?: 'MALE' | 'FEMALE'; pedigreeCode?: string; generation?: number },
) {
  const draft = await startDraft(ctx.testDb.db, ctx.owner.actor, { forceNew: true });
  await saveDraft(ctx.testDb.db, ctx.owner.actor, draft.id, {
    name: input.name,
    breedId: ctx.breedId,
    sex: input.sex ?? 'MALE',
    birthDate: '2022-01-01',
    color: 'قهوه‌ای',
    markings: 'بدون نشانه خاص',
  });
  const registered = await registerAnimal(ctx.testDb.db, ctx.owner.actor, draft.id);

  if (input.pedigreeCode !== undefined || input.generation !== undefined) {
    // SYNTHETIC: pedigree codes and generations are issued in later prompts, so
    // the test seeds them directly to exercise the lineage rules today.
    await ctx.testDb.db
      .update(animals)
      .set({
        pedigreeCode: input.pedigreeCode ?? null,
        generation: input.generation ?? registered.generation,
      })
      .where(eq(animals.id, registered.id));
  }
  return (await requireOwnedAnimal(ctx.testDb.db, ctx.owner.actor, registered.id))!;
}

test('registering an animal needs approved KYC and neither membership nor an address', async () => {
  await withCtx(async (ctx) => {
    // No membership row and no residence exist for this account at all.
    const facts = await loadFacts(ctx.testDb.db, ctx.owner.accountId);
    assert.equal(facts.kycApproved, true);
    assert.equal(facts.membershipActive, false);

    const animal = await makeAnimal(ctx, { name: 'حیوان اول' });
    assert.equal(animal.status, 'REGISTERED');
    assert.equal(await countRegisteredAnimals(ctx.testDb.db, ctx.owner.accountId), 1);

    // And the initial record issues nothing official (§9.2).
    assert.equal(animal.petId, null);
    assert.equal(animal.pedigreeCode, null);
    assert.equal(animal.generation, 0);
    assert.equal(animal.origin, 'G0');
  });
});

test('an account without approved KYC cannot start or finish a registration', async () => {
  await withCtx(async (ctx) => {
    const stranger = await signInWithVerifiedMobile(ctx.testDb.db, '09990300002');
    const strangerActor = actorFor(stranger.accountId);
    await assert.rejects(() => startDraft(ctx.testDb.db, strangerActor), /احراز هویت/);
    assert.equal((await eligibilityFor(ctx.testDb.db, stranger.accountId, 'ANIMAL_REGISTRATION')).allowed, false);
  });
});

test('a draft survives leaving the form and keeps the entered codes', async () => {
  await withCtx(async (ctx) => {
    const draft = await startDraft(ctx.testDb.db, ctx.owner.actor);
    await saveDraft(ctx.testDb.db, ctx.owner.actor, draft.id, { name: 'نیمه‌کاره', breedId: ctx.breedId, step: 2 });
    await saveDraft(ctx.testDb.db, ctx.owner.actor, draft.id, {
      sirePedigreeCode: 'HZ-SIRE-1',
      damPedigreeCode: 'HZ-DAM-1',
      step: 6,
    });

    // Starting again returns the same draft rather than creating a second one.
    const again = await startDraft(ctx.testDb.db, ctx.owner.actor);
    assert.equal(again.id, draft.id);
    assert.equal(again.name, 'نیمه‌کاره');
    assert.equal(again.draftStep, 6);
    assert.equal(draftOf(again).sirePedigreeCode, 'HZ-SIRE-1');
    assert.equal(draftOf(again).damPedigreeCode, 'HZ-DAM-1');
  });
});

test('G0 x G0 gives G1 and G2 x G1 gives G2, from real records', async () => {
  await withCtx(async (ctx) => {
    const sire = await makeAnimal(ctx, { name: 'پدر G0', pedigreeCode: 'HZ-P-0', generation: 0 });
    const dam = await makeAnimal(ctx, { name: 'مادر G0', sex: 'FEMALE', pedigreeCode: 'HZ-M-0', generation: 0 });
    assert.ok(sire.id !== dam.id);

    const child = await startDraft(ctx.testDb.db, ctx.owner.actor);
    await saveDraft(ctx.testDb.db, ctx.owner.actor, child.id, {
      name: 'فرزند',
      breedId: ctx.breedId,
      sex: 'MALE',
      birthDate: '2023-05-05',
      color: 'قهوه‌ای',
      markings: 'بدون نشانه خاص',
      origin: 'INTERNAL_G1PLUS',
      sirePedigreeCode: 'HZ-P-0',
      damPedigreeCode: 'HZ-M-0',
    });
    const first = await applyLineage(ctx.testDb.db, ctx.owner.actor, child.id);
    assert.equal(first.result.outcome.state, 'COMPUTED');
    assert.equal(first.record.generation, 1);
    assert.equal(first.record.origin, 'INTERNAL_G1PLUS');

    // G2 x G1 -> G2.
    const g2 = await makeAnimal(ctx, { name: 'پدر G2', pedigreeCode: 'HZ-P-2', generation: 2 });
    const g1 = await makeAnimal(ctx, { name: 'مادر G1', sex: 'FEMALE', pedigreeCode: 'HZ-M-1', generation: 1 });
    assert.ok(g2.id !== g1.id);

    const second = await startDraft(ctx.testDb.db, ctx.owner.actor);
    await saveDraft(ctx.testDb.db, ctx.owner.actor, second.id, {
      name: 'فرزند دوم',
      breedId: ctx.breedId,
      sex: 'FEMALE',
      birthDate: '2023-06-06',
      color: 'قهوه‌ای',
      markings: 'بدون نشانه خاص',
      origin: 'INTERNAL_G1PLUS',
      sirePedigreeCode: 'HZ-P-2',
      damPedigreeCode: 'HZ-M-1',
    });
    const outcome = await applyLineage(ctx.testDb.db, ctx.owner.actor, second.id);
    assert.equal(outcome.record.generation, 2);
  });
});

test('a genuinely absent parent gives G0 with the codes preserved, and a rematch updates the same animal', async () => {
  await withCtx(async (ctx) => {
    const sire = await makeAnimal(ctx, { name: 'پدر موجود', pedigreeCode: 'HZ-P-A', generation: 1 });
    assert.ok(sire.id);

    const child = await startDraft(ctx.testDb.db, ctx.owner.actor);
    await saveDraft(ctx.testDb.db, ctx.owner.actor, child.id, {
      name: 'فرزند بی‌مادر',
      breedId: ctx.breedId,
      sex: 'MALE',
      birthDate: '2023-07-07',
      color: 'قهوه‌ای',
      markings: 'بدون نشانه خاص',
      origin: 'INTERNAL_G1PLUS',
      sirePedigreeCode: 'HZ-P-A',
      damPedigreeCode: 'HZ-M-MISSING',
    });

    const missing = await applyLineage(ctx.testDb.db, ctx.owner.actor, child.id);
    assert.equal(missing.result.outcome.state, 'PARENT_MISSING');
    assert.equal(missing.record.generation, 0);
    assert.equal(missing.record.origin, 'G0');
    // The typed codes are still there, ready for a retry (§9.3).
    assert.equal(draftOf(missing.record).sirePedigreeCode, 'HZ-P-A');
    assert.equal(draftOf(missing.record).damPedigreeCode, 'HZ-M-MISSING');

    // The owner goes away to register the missing parent; the return is stored.
    await rememberReturn(ctx.testDb.db, ctx.owner.actor, child.id, {
      entity: { type: 'ANIMAL', id: child.id },
      step: 'LINEAGE',
      originRoute: '/animals/' + child.id + '/edit?step=6',
    });
    const beforeCount = (await listAnimals(ctx.testDb.db, ctx.owner.actor)).length;

    const dam = await makeAnimal(ctx, { name: 'مادر تازه', sex: 'FEMALE', pedigreeCode: 'HZ-M-MISSING', generation: 3 });
    assert.ok(dam.id);

    // Coming back re-resolves and updates the same child rather than making a new one.
    const rematched = await applyLineage(ctx.testDb.db, ctx.owner.actor, child.id);
    assert.equal(rematched.result.outcome.state, 'COMPUTED');
    assert.equal(rematched.record.id, child.id);
    assert.equal(rematched.record.generation, 2);
    assert.equal(draftOf(rematched.record).returnTo?.originRoute, '/animals/' + child.id + '/edit?step=6');
    assert.equal((await listAnimals(ctx.testDb.db, ctx.owner.actor)).length, beforeCount + 1);

    // The rematch is in the trail with both the old and the new generation.
    const trail = (await ctx.testDb.db.select().from(auditEvents)).filter(
      (row) => row.targetId === child.id && row.action === 'ANIMAL_LINEAGE_RESOLVED',
    );
    assert.equal(trail.length, 2);
    assert.deepEqual((trail[1]?.after as { generation: number }).generation, 2);
  });
});

test('a technical lookup failure keeps the draft and the current generation', async () => {
  await withCtx(async (ctx) => {
    const child = await makeAnimal(ctx, { name: 'با نسل موجود', generation: 4 });
    await ctx.testDb.db
      .update(animals)
      .set({ status: 'DRAFT', draftData: { sirePedigreeCode: 'HZ-X', damPedigreeCode: 'HZ-Y' } })
      .where(eq(animals.id, child.id));

    const record = await requireOwnedAnimal(ctx.testDb.db, ctx.owner.actor, child.id);

    // A database handle that fails on select stands in for a real outage.
    const brokenDb = {
      select: () => {
        throw new Error('connection reset');
      },
    } as never;
    const result = await evaluateLineage(brokenDb, record);

    assert.equal(result.outcome.state, 'LOOKUP_ERROR');
    assert.ok(result.outcome.state === 'LOOKUP_ERROR' && result.outcome.keepGeneration === 4);

    // Applying it changes nothing: the generation and the codes survive.
    const applied = await applyLineage(ctx.testDb.db, ctx.owner.actor, child.id);
    assert.equal(applied.result.outcome.state, 'PARENT_MISSING', 'the real database finds no such codes');
    assert.equal(draftOf(applied.record).sirePedigreeCode, 'HZ-X');
  });
});

test('a lineage link cannot make an animal its own ancestor', async () => {
  await withCtx(async (ctx) => {
    const parent = await makeAnimal(ctx, { name: 'والد', pedigreeCode: 'HZ-CYC-P', generation: 0 });
    const other = await makeAnimal(ctx, { name: 'والد دوم', sex: 'FEMALE', pedigreeCode: 'HZ-CYC-M', generation: 0 });

    const child = await startDraft(ctx.testDb.db, ctx.owner.actor);
    await saveDraft(ctx.testDb.db, ctx.owner.actor, child.id, {
      name: 'فرزند',
      breedId: ctx.breedId,
      sex: 'MALE',
      birthDate: '2023-01-01',
      color: 'قهوه‌ای',
      markings: 'بدون نشانه خاص',
      sirePedigreeCode: 'HZ-CYC-P',
      damPedigreeCode: 'HZ-CYC-M',
    });
    await applyLineage(ctx.testDb.db, ctx.owner.actor, child.id);
    // The child has to be a registered record before its code can resolve.
    await registerAnimal(ctx.testDb.db, ctx.owner.actor, child.id);
    await ctx.testDb.db.update(animals).set({ pedigreeCode: 'HZ-CYC-C' }).where(eq(animals.id, child.id));

    // Now try to make the child its own grandparent. The parent stays REGISTERED,
    // because a code only resolves against a registered record.
    await ctx.testDb.db
      .update(animals)
      .set({ draftData: { sirePedigreeCode: 'HZ-CYC-C', damPedigreeCode: 'HZ-CYC-M' } })
      .where(eq(animals.id, parent.id));
    await assert.rejects(() => applyLineage(ctx.testDb.db, ctx.owner.actor, parent.id), /حلقه/);

    // And a direct self link.
    await ctx.testDb.db
      .update(animals)
      .set({ draftData: { sirePedigreeCode: 'HZ-CYC-P', damPedigreeCode: 'HZ-CYC-M' } })
      .where(eq(animals.id, parent.id));
    await assert.rejects(() => applyLineage(ctx.testDb.db, ctx.owner.actor, parent.id), /والد خودش|حلقه/);
    assert.ok(other.id);
  });
});

test('the same record cannot be both parents', async () => {
  await withCtx(async (ctx) => {
    const single = await makeAnimal(ctx, { name: 'تک والد', pedigreeCode: 'HZ-ONE', generation: 0 });
    assert.ok(single.id);
    const child = await startDraft(ctx.testDb.db, ctx.owner.actor);
    await saveDraft(ctx.testDb.db, ctx.owner.actor, child.id, {
      name: 'فرزند',
      breedId: ctx.breedId,
      sex: 'MALE',
      birthDate: '2023-02-02',
      color: 'قهوه‌ای',
      markings: 'بدون نشانه خاص',
      sirePedigreeCode: 'HZ-ONE',
      damPedigreeCode: 'HZ-ONE',
    });
    await assert.rejects(() => applyLineage(ctx.testDb.db, ctx.owner.actor, child.id), /یک رکورد/);
  });
});

test('nothing a request sends can change the generation', async () => {
  await withCtx(async (ctx) => {
    const animal = await makeAnimal(ctx, { name: 'ثابت', generation: 0 });

    // The draft input type has no generation field, and the edit form refuses
    // every protected identifier outright.
    await assert.rejects(
      () => editAnimal(ctx.testDb.db, ctx.owner.actor, animal.id, { generation: 9 } as never),
      /از فرم عمومی پروفایل قابل تغییر نیست/,
    );
    for (const field of ['origin', 'petId', 'pedigreeCode', 'sireAnimalId', 'declaredMicrochipNumber', 'ownerAccountId']) {
      await assert.rejects(
        () => editAnimal(ctx.testDb.db, ctx.owner.actor, animal.id, { [field]: 'x' } as never),
        /قابل تغییر نیست/,
        field + ' must be refused',
      );
    }

    const after = await requireOwnedAnimal(ctx.testDb.db, ctx.owner.actor, animal.id);
    assert.equal(after.generation, 0);
    assert.equal(after.petId, null);
  });
});

test('permitted profile fields stay editable and are audited', async () => {
  await withCtx(async (ctx) => {
    const animal = await makeAnimal(ctx, { name: 'قابل ویرایش' });
    const updated = await editAnimal(ctx.testDb.db, ctx.owner.actor, animal.id, {
      name: 'نام تازه',
      color: 'قهوه‌ای',
      markings: 'لکه سفید روی سینه',
    });
    assert.equal(updated.name, 'نام تازه');
    assert.equal(updated.color, 'قهوه‌ای');

    const events = (await ctx.testDb.db.select().from(auditEvents)).filter(
      (row) => row.targetId === animal.id && row.action === 'ANIMAL_UPDATED',
    );
    assert.equal(events.length, 1);
  });
});

test('one animal belongs to one owner and no one else can read or change it', async () => {
  await withCtx(async (ctx) => {
    const animal = await makeAnimal(ctx, { name: 'خصوصی' });
    const stranger = await signInWithVerifiedMobile(ctx.testDb.db, '09990300003');
    const strangerActor = actorFor(stranger.accountId);

    // The refusal is identical to a record that does not exist, so a stranger
    // cannot use the difference to confirm that an identifier is real.
    await assert.rejects(() => requireOwnedAnimal(ctx.testDb.db, strangerActor, animal.id), /پیدا نشد/);
    await assert.rejects(() => editAnimal(ctx.testDb.db, strangerActor, animal.id, { name: 'x' }), /پیدا نشد/);
    await assert.rejects(() => applyLineage(ctx.testDb.db, strangerActor, animal.id), /پیدا نشد/);
    // An operational context is not an owner either.
    await assert.rejects(() => requireOwnedAnimal(ctx.testDb.db, ctx.operator.actor, animal.id), /پیدا نشد/);
    await assert.rejects(
      () => requireOwnedAnimal(ctx.testDb.db, strangerActor, '00000000-0000-4000-8000-000000000000'),
      /پیدا نشد/,
    );
  });
});

test('the family section reads from records, in both directions', async () => {
  await withCtx(async (ctx) => {
    const sire = await makeAnimal(ctx, { name: 'پدر', pedigreeCode: 'HZ-F-P', generation: 0 });
    const dam = await makeAnimal(ctx, { name: 'مادر', sex: 'FEMALE', pedigreeCode: 'HZ-F-M', generation: 0 });
    const child = await startDraft(ctx.testDb.db, ctx.owner.actor);
    await saveDraft(ctx.testDb.db, ctx.owner.actor, child.id, {
      name: 'فرزند',
      breedId: ctx.breedId,
      sex: 'MALE',
      birthDate: '2023-03-03',
      color: 'قهوه‌ای',
      markings: 'بدون نشانه خاص',
      sirePedigreeCode: 'HZ-F-P',
      damPedigreeCode: 'HZ-F-M',
    });
    const applied = await applyLineage(ctx.testDb.db, ctx.owner.actor, child.id);

    const childFamily = await familyOf(ctx.testDb.db, applied.record);
    assert.equal(childFamily.sire?.id, sire.id);
    assert.equal(childFamily.dam?.id, dam.id);

    const sireFamily = await familyOf(ctx.testDb.db, await requireOwnedAnimal(ctx.testDb.db, ctx.owner.actor, sire.id));
    assert.equal(sireFamily.offspring.length, 1);
    assert.equal(sireFamily.offspring[0]?.id, child.id);
  });
});

// ── Foreign pedigree ───────────────────────────────────────────────────────

test('a foreign case needs both sides and an issuer from the approved registry', async () => {
  await withCtx(async (ctx) => {
    const animal = await makeAnimal(ctx, { name: 'دارای مدرک خارجی' });

    await assert.rejects(() => submitForeignCase(ctx.testDb.db, ctx.owner.actor, animal.id), /روی برگه و پشت برگه/);

    await attachForeignSide(ctx.testDb.db, ctx.root, ctx.owner.actor, {
      animalId: animal.id,
      side: 'FRONT',
      bytes: JPEG,
    });
    await assert.rejects(() => submitForeignCase(ctx.testDb.db, ctx.owner.actor, animal.id), /روی برگه و پشت برگه/);

    await attachForeignSide(ctx.testDb.db, ctx.root, ctx.owner.actor, {
      animalId: animal.id,
      side: 'BACK',
      bytes: PDF,
    });
    await assert.rejects(() => submitForeignCase(ctx.testDb.db, ctx.owner.actor, animal.id), /صادرکننده/);

    // Free text is not accepted, and an unknown id is refused.
    await assert.rejects(
      () =>
        setForeignDetails(ctx.testDb.db, ctx.owner.actor, {
          animalId: animal.id,
          issuerId: '11111111-1111-1111-1111-111111111111',
          documentCode: 'X-1',
        }),
      /فهرست موردتأیید/,
    );

    // SYNTHETIC issuer: the real registry is supplied by the association.
    const issuer = await addIssuer(ctx.testDb.db, ctx.operator.actor, { name: 'SYNTHETIC — نمونه آزمایشی' });
    await setForeignDetails(ctx.testDb.db, ctx.owner.actor, {
      animalId: animal.id,
      issuerId: issuer.id,
      documentCode: 'FP-001',
    });
    const submitted = await submitForeignCase(ctx.testDb.db, ctx.owner.actor, animal.id);
    assert.equal(submitted.status, 'UNDER_REVIEW');
  });
});

test('only the association reviews, and an approval writes a read-only generation', async () => {
  await withCtx(async (ctx) => {
    const animal = await makeAnimal(ctx, { name: 'برای بررسی' });
    const issuer = await addIssuer(ctx.testDb.db, ctx.operator.actor, { name: 'SYNTHETIC — صادرکننده آزمایشی' });
    await attachForeignSide(ctx.testDb.db, ctx.root, ctx.owner.actor, { animalId: animal.id, side: 'FRONT', bytes: JPEG });
    await attachForeignSide(ctx.testDb.db, ctx.root, ctx.owner.actor, { animalId: animal.id, side: 'BACK', bytes: PDF });
    await setForeignDetails(ctx.testDb.db, ctx.owner.actor, { animalId: animal.id, issuerId: issuer.id, documentCode: 'FP-2' });
    const submitted = await submitForeignCase(ctx.testDb.db, ctx.owner.actor, animal.id);

    // The owner cannot review their own case, and neither can another shell.
    await assert.rejects(
      () => reviewForeignCase(ctx.testDb.db, ctx.owner.actor, { caseId: submitted.id, decision: 'APPROVED', extractedGeneration: 3 }),
      /محیط عملیاتی انجمن/,
    );
    await assert.rejects(
      () =>
        reviewForeignCase(ctx.testDb.db, actorFor(ctx.operator.accountId, 'GENETICS_OPERATOR'), {
          caseId: submitted.id,
          decision: 'APPROVED',
          extractedGeneration: 3,
        }),
      /محیط عملیاتی انجمن/,
    );
    await assert.rejects(() => foreignQueue(ctx.testDb.db, ctx.owner.actor, { page: 1, pageSize: 10 }), /اپراتور انجمن/);

    // Approving without the generation read from the document is refused.
    await assert.rejects(
      () => reviewForeignCase(ctx.testDb.db, ctx.operator.actor, { caseId: submitted.id, decision: 'APPROVED' }),
      /نسل استخراج‌شده/,
    );

    const approved = await reviewForeignCase(ctx.testDb.db, ctx.operator.actor, {
      caseId: submitted.id,
      decision: 'APPROVED',
      extractedGeneration: 3,
      expectedVersion: submitted.version,
    });
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.extractedGeneration, 3);

    const updated = await requireOwnedAnimal(ctx.testDb.db, ctx.owner.actor, animal.id);
    assert.equal(updated.generation, 3);
    assert.equal(updated.origin, 'FOREIGN_PEDIGREE');

    // And it stays read-only from the profile form.
    await assert.rejects(
      () => editAnimal(ctx.testDb.db, ctx.owner.actor, animal.id, { generation: 1 } as never),
      /قابل تغییر نیست/,
    );

    const notified = (await ctx.testDb.db.select().from(notifications)).filter(
      (row) => row.kind === 'FOREIGN_PEDIGREE_APPROVED',
    );
    assert.equal(notified.length, 1);
    assert.equal(notified[0]?.originRoute, '/animals/' + animal.id + '/foreign-pedigree');
  });
});

test('a correction keeps both uploaded sides and the entered details', async () => {
  await withCtx(async (ctx) => {
    const animal = await makeAnimal(ctx, { name: 'نیازمند اصلاح' });
    const issuer = await addIssuer(ctx.testDb.db, ctx.operator.actor, { name: 'SYNTHETIC — صادرکننده دوم' });
    const front = await attachForeignSide(ctx.testDb.db, ctx.root, ctx.owner.actor, {
      animalId: animal.id,
      side: 'FRONT',
      bytes: JPEG,
    });
    const both = await attachForeignSide(ctx.testDb.db, ctx.root, ctx.owner.actor, {
      animalId: animal.id,
      side: 'BACK',
      bytes: PDF,
    });
    // Uploading the back did not disturb the front.
    assert.equal(both.frontFileId, front.frontFileId);

    await setForeignDetails(ctx.testDb.db, ctx.owner.actor, { animalId: animal.id, issuerId: issuer.id, documentCode: 'FP-3' });
    const submitted = await submitForeignCase(ctx.testDb.db, ctx.owner.actor, animal.id);

    await assert.rejects(
      () => reviewForeignCase(ctx.testDb.db, ctx.operator.actor, { caseId: submitted.id, decision: 'NEEDS_CORRECTION' }),
      /ثبت دلیل الزامی/,
    );

    const corrected = await reviewForeignCase(ctx.testDb.db, ctx.operator.actor, {
      caseId: submitted.id,
      decision: 'NEEDS_CORRECTION',
      reasonFa: 'تصویر پشت برگه خوانا نیست.',
    });
    assert.equal(corrected.status, 'NEEDS_CORRECTION');
    assert.equal(corrected.frontFileId, both.frontFileId, 'the front survives the correction');
    assert.equal(corrected.backFileId, both.backFileId, 'the back survives the correction');
    assert.equal(corrected.issuerId, issuer.id);
    assert.equal(corrected.documentCode, 'FP-3');
    // The animal generation is untouched by a correction.
    assert.equal((await requireOwnedAnimal(ctx.testDb.db, ctx.owner.actor, animal.id)).generation, 0);

    // Replacing only the back and resubmitting keeps the front.
    const replaced = await attachForeignSide(ctx.testDb.db, ctx.root, ctx.owner.actor, {
      animalId: animal.id,
      side: 'BACK',
      bytes: JPEG,
    });
    assert.equal(replaced.frontFileId, both.frontFileId);
    assert.notEqual(replaced.backFileId, both.backFileId);
    const resubmitted = await submitForeignCase(ctx.testDb.db, ctx.owner.actor, animal.id);
    assert.equal(resubmitted.status, 'UNDER_REVIEW');
    assert.equal(resubmitted.reasonFa, null);
  });
});

test('a foreign document is private to its owner and the reviewing association', async () => {
  await withCtx(async (ctx) => {
    const animal = await makeAnimal(ctx, { name: 'مدرک خصوصی' });
    const attached = await attachForeignSide(ctx.testDb.db, ctx.root, ctx.owner.actor, {
      animalId: animal.id,
      side: 'FRONT',
      bytes: JPEG,
    });
    const fileId = attached.frontFileId!;
    const stranger = await signInWithVerifiedMobile(ctx.testDb.db, '09990300004');

    await readPrivateFile(ctx.testDb.db, ctx.root, ctx.owner.actor, fileId);
    await readPrivateFile(ctx.testDb.db, ctx.root, ctx.operator.actor, fileId);
    await assert.rejects(
      () => readPrivateFile(ctx.testDb.db, ctx.root, actorFor(stranger.accountId), fileId),
      /Not permitted/,
    );
    await assert.rejects(
      () => readPrivateFile(ctx.testDb.db, ctx.root, actorFor(stranger.accountId, 'SUPERADMIN'), fileId),
      /Not permitted/,
    );
  });
});

test('the issuer registry starts empty and only the association may change it', async () => {
  await withCtx(async (ctx) => {
    assert.equal((await ctx.testDb.db.select().from(pedigreeIssuers)).length, 0);

    await assert.rejects(
      () => addIssuer(ctx.testDb.db, ctx.owner.actor, { name: 'تلاش کاربر' }),
      /محیط عملیاتی انجمن/,
    );
    await assert.rejects(
      () => addIssuer(ctx.testDb.db, actorFor(ctx.operator.accountId, 'SUPERADMIN'), { name: 'تلاش سوپرادمین' }),
      /محیط عملیاتی انجمن/,
    );

    const issuer = await addIssuer(ctx.testDb.db, ctx.operator.actor, { name: 'SYNTHETIC — نمونه', country: 'IR' });
    assert.equal(issuer.isActive, true);
    await assert.rejects(() => addIssuer(ctx.testDb.db, ctx.operator.actor, { name: 'SYNTHETIC — نمونه' }), /قبلاً ثبت/);

    const events = (await ctx.testDb.db.select().from(auditEvents)).filter(
      (row) => row.targetType === 'PEDIGREE_ISSUER',
    );
    assert.equal(events.length, 1);
  });
});

test('the association queue shows submitted cases and hides the rest', async () => {
  await withCtx(async (ctx) => {
    const issuer = await addIssuer(ctx.testDb.db, ctx.operator.actor, { name: 'SYNTHETIC — صف' });
    const drafted = await makeAnimal(ctx, { name: 'پیش‌نویس مدرک' });
    await getOrCreateForeignCase(ctx.testDb.db, ctx.owner.actor, drafted.id);

    const sent = await makeAnimal(ctx, { name: 'ارسال‌شده' });
    await attachForeignSide(ctx.testDb.db, ctx.root, ctx.owner.actor, { animalId: sent.id, side: 'FRONT', bytes: JPEG });
    await attachForeignSide(ctx.testDb.db, ctx.root, ctx.owner.actor, { animalId: sent.id, side: 'BACK', bytes: PDF });
    await setForeignDetails(ctx.testDb.db, ctx.owner.actor, { animalId: sent.id, issuerId: issuer.id, documentCode: 'Q-1' });
    await submitForeignCase(ctx.testDb.db, ctx.owner.actor, sent.id);

    const queue = await foreignQueue(ctx.testDb.db, ctx.operator.actor, { page: 1, pageSize: 10 });
    assert.equal(queue.total, 1);
    assert.equal(queue.items[0]?.animalName, 'ارسال‌شده');
    assert.equal(queue.items[0]?.issuerName, 'SYNTHETIC — صف');
  });
});
