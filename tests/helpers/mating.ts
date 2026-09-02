/**
 * Shared fixture for the mating suites.
 *
 * Getting to a mating permit means walking the whole product first: identity,
 * membership, an animal, a microchip, a sample, a registration sheet, the
 * genetics centre and an issued pedigree — for two different owners. That is
 * built once here so each suite tests its own subject rather than re-running
 * the same setup by copy.
 *
 * Every fixture is SYNTHETIC: reserved 0999 mobiles, obviously fake tariffs and
 * a clearly labelled centre account.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTestDb, type TestDb } from './db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accountRoles, referenceBreeds } from '../../src/db/schema/core.ts';
import { saveProfile, signInWithVerifiedMobile } from '../../src/identity/account.ts';
import { attachKycDocument, reviewKyc, submitKyc } from '../../src/identity/kyc.ts';
import { startMembershipPayment } from '../../src/billing/membership.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { registerAnimal, saveDraft, startDraft } from '../../src/animals/service.ts';
import { addLocation, upsertVetProfile } from '../../src/vets/registry.ts';
import { checkIn, createVisitRequests } from '../../src/vets/visits.ts';
import { confirmImplant, recordChipRead, recordRereadAndBind } from '../../src/clinical/microchip.ts';
import { recordSampling, recordShipment } from '../../src/clinical/samples.ts';
import { createSheetRequest, sheetOfAnimal } from '../../src/documents/registration-sheet.ts';
import {
  attachReceiptFile,
  createReceipt,
  receiveSample,
  recordResult,
  reviewReceipt,
  startProcessing,
  submitReceipt,
} from '../../src/genetics/service.ts';
import { createIssuanceRequest, pedigreeOfAnimal } from '../../src/documents/pedigree.ts';
import {
  confirmCounterparty,
  reviewPermit,
  saveAllocationRule,
  startPermit,
  startPermitPayment,
  submitPermit,
  type PermitRecord,
} from '../../src/mating/permits.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';

export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

/** SYNTHETIC tariffs: no real published amount is used anywhere in the tests. */
export const SHEET_FEE = '250000';
export const PEDIGREE_FEE = '400000';
export const PERMIT_FEE = '300000';
const CENTRE_NAME = 'SYNTHETIC مرکز ژنتیک آزمایشی';
const CENTRE_ACCOUNT = 'SYNTHETIC-TEST-ACCOUNT';

export const actorFor = (accountId: string, context: Actor['context'] = 'USER'): Actor => ({
  accountId: accountId as AccountId,
  context,
  activeRoles: context === 'USER' ? [] : [context as never],
});

export const payingGateway = (amountRial: bigint): PaymentGateway => ({
  async start(input) {
    return { reference: input.reference, amountRial: input.amountRial, redirectUrl: input.callbackUrl };
  },
  async verify(input) {
    return { paid: true, amountRial, providerRef: 'p-' + input.reference };
  },
});

export interface Party {
  readonly accountId: string;
  readonly actor: Actor;
  /** The number this party signed in with, for flows that invite by mobile. */
  readonly mobile: string;
}

export interface MatingCtx {
  readonly testDb: TestDb;
  readonly root: string;
  readonly first: Party;
  readonly second: Party;
  readonly admin: Party;
  readonly association: Party;
  readonly centre: Party;
  readonly vet: Party;
  readonly locationId: string;
  readonly breedId: string;
}

async function approved(testDb: TestDb, root: string, operator: Actor, mobile: string, nationalId: string) {
  const account = await signInWithVerifiedMobile(testDb.db, mobile);
  const actor = actorFor(account.accountId);
  await saveProfile(testDb.db, actor, {
    firstName: 'نمونه',
    lastName: 'کاربر آزمایشی',
    nationalId,
    birthDate: '1990-01-01',
  });
  await attachKycDocument(testDb.db, root, actor, { bytes: JPEG });
  const submitted = await submitKyc(testDb.db, actor);
  await reviewKyc(testDb.db, operator, { caseId: submitted.id, decision: 'APPROVED' });
  return { accountId: account.accountId, actor, mobile };
}

async function payMembership(testDb: TestDb, actor: Actor) {
  const batch = await startMembershipPayment(testDb.db, actor);
  const gateway = payingGateway(3_000_000n);
  const started = await startAttempt(testDb.db, actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, 'test');
  assert.equal((await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects)).state, 'PAID');
}

export interface MatingCtxOptions {
  /** Six digits reserved for this suite, keeping its 0999 mobiles unique. */
  readonly mobilePrefix: string;
  readonly tmpPrefix: string;
  readonly councilCode: string;
  readonly chipBase: number;
}

/** Two members, an approved veterinarian, the centre, the association and admin. */
export async function withMatingCtx(
  options: MatingCtxOptions,
  fn: (ctx: MatingCtx) => Promise<void>,
): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), options.tmpPrefix));
  const testDb = await createTestDb();
  const mobile = (suffix: string) => options.mobilePrefix + suffix;
  try {
    await seedBaseline(testDb.db);

    const operatorAccount = await signInWithVerifiedMobile(testDb.db, mobile('99'));
    const association: Party = {
      accountId: operatorAccount.accountId,
      actor: actorFor(operatorAccount.accountId, 'ASSOCIATION_OPERATOR'),
      mobile: mobile('99'),
    };
    const adminAccount = await signInWithVerifiedMobile(testDb.db, mobile('98'));
    const admin: Party = {
      accountId: adminAccount.accountId,
      actor: actorFor(adminAccount.accountId, 'SUPERADMIN'),
      mobile: mobile('98'),
    };
    const centreAccount = await signInWithVerifiedMobile(testDb.db, mobile('97'));
    const centre: Party = {
      accountId: centreAccount.accountId,
      actor: actorFor(centreAccount.accountId, 'GENETICS_OPERATOR'),
      mobile: mobile('97'),
    };

    const first = await approved(testDb, root, association.actor, mobile('01'), '0499370899');
    await payMembership(testDb, first.actor);
    const second = await approved(testDb, root, association.actor, mobile('03'), '0084575948');
    await payMembership(testDb, second.actor);

    const vetParty = await approved(testDb, root, association.actor, mobile('02'), '0790419904');
    await testDb.db
      .insert(accountRoles)
      .values({ accountId: vetParty.accountId, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
    await payMembership(testDb, vetParty.actor);
    await upsertVetProfile(testDb.db, admin.actor, {
      mobile: mobile('02'),
      displayNameFa: 'دامپزشک نمونه',
      councilCode: options.councilCode,
    });
    const location = await addLocation(testDb.db, admin.actor, vetParty.accountId, {
      nameFa: 'کلینیک نمونه',
      cityFa: 'تهران',
      addressFa: 'نشانی نمونه',
      phone: '02100000000',
      licenceStatus: 'VALID',
      canImplantMicrochip: true,
      canDrawBloodSample: true,
      canPregnancyCheck: true,
    });

    for (const [key, value] of [
      ['fee.registration_sheet_toman', SHEET_FEE],
      ['fee.pedigree_toman', PEDIGREE_FEE],
      ['fee.mating_permit_toman', PERMIT_FEE],
      ['genetics_centre.name', CENTRE_NAME],
      ['genetics_centre.payment_account', CENTRE_ACCOUNT],
    ] as const) {
      await updateSetting(testDb.db, admin.actor, { key, value, reason: 'SYNTHETIC — مقدار آزمایشی' });
    }

    const [breed] = await testDb.db.select().from(referenceBreeds).limit(1);
    chipCounter = options.chipBase;

    await fn({
      testDb,
      root,
      first,
      second,
      admin,
      association,
      centre,
      vet: { accountId: vetParty.accountId, actor: actorFor(vetParty.accountId, 'TRUSTED_VET'), mobile: mobile('02') },
      locationId: location.id,
      breedId: breed!.id,
    });
  } finally {
    await testDb.drop();
    await fs.rm(root, { recursive: true, force: true });
  }
}

let chipCounter = 0;
const nextChip = () => '90000000' + String((chipCounter += 1)).padStart(7, '0');

/**
 * One animal taken all the way to an issued pedigree, which is the actual
 * prerequisite §16 names for both sides of a permit.
 */
export async function pedigreedAnimal(
  ctx: MatingCtx,
  owner: Party,
  name: string,
  sex: 'MALE' | 'FEMALE',
): Promise<{ animalId: string; pedigreeCode: string }> {
  const draft = await startDraft(ctx.testDb.db, owner.actor, { forceNew: true });
  await saveDraft(ctx.testDb.db, owner.actor, draft.id, {
    name,
    breedId: ctx.breedId,
    sex,
    birthDate: '2022-01-01',
  });
  const animal = await registerAnimal(ctx.testDb.db, owner.actor, draft.id);

  const created = await createVisitRequests(ctx.testDb.db, owner.actor, {
    context: 'MICROCHIP',
    vetAccountId: ctx.vet.accountId,
    locationId: ctx.locationId,
    items: [{ animalId: animal.id, serviceType: 'MICROCHIP_IMPLANT' }],
  });
  const requestId = created.items[0]!.request.id;
  await checkIn(ctx.testDb.db, ctx.vet.actor, {
    code: created.items[0]!.referral.code,
    locationId: ctx.locationId,
  });
  const number = nextChip();
  await recordChipRead(ctx.testDb.db, ctx.vet.actor, requestId, { number, method: 'MANUAL' });
  await confirmImplant(ctx.testDb.db, ctx.vet.actor, requestId);
  await recordRereadAndBind(ctx.testDb.db, ctx.vet.actor, requestId, { number, method: 'MANUAL' });
  const sample = await recordSampling(ctx.testDb.db, ctx.vet.actor, requestId);

  const sheetBatch = await createSheetRequest(ctx.testDb.db, owner.actor, [animal.id]);
  const sheetGateway = payingGateway(2_500_000n);
  const sheetAttempt = await startAttempt(
    ctx.testDb.db,
    owner.actor,
    { batchId: sheetBatch.batch.id, callbackUrl: '/x' },
    sheetGateway,
    'test',
  );
  assert.equal(
    (await verifyAttempt(ctx.testDb.db, { reference: sheetAttempt.reference }, sheetGateway, paidEffects)).state,
    'PAID',
  );
  assert.ok(await sheetOfAnimal(ctx.testDb.db, animal.id));

  const receipt = await createReceipt(ctx.testDb.db, owner.actor, [animal.id]);
  await attachReceiptFile(ctx.testDb.db, ctx.root, owner.actor, receipt.id, { bytes: JPEG });
  await submitReceipt(ctx.testDb.db, owner.actor, receipt.id);
  await reviewReceipt(ctx.testDb.db, ctx.centre.actor, { receiptId: receipt.id, decision: 'APPROVED' });
  await recordShipment(ctx.testDb.db, ctx.vet.actor, sample!.id, 'پست پیشتاز');
  await receiveSample(ctx.testDb.db, ctx.centre.actor, sample!.id);
  await startProcessing(ctx.testDb.db, ctx.centre.actor, sample!.id);
  await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: sample!.id });

  const issuance = await createIssuanceRequest(ctx.testDb.db, owner.actor, [animal.id]);
  const gateway = payingGateway(4_000_000n);
  const attempt = await startAttempt(
    ctx.testDb.db,
    owner.actor,
    { batchId: issuance.batch.id, callbackUrl: '/x' },
    gateway,
    'test-gateway',
  );
  assert.equal(
    (await verifyAttempt(ctx.testDb.db, { reference: attempt.reference }, gateway, paidEffects)).state,
    'PAID',
  );
  const pedigree = await pedigreeOfAnimal(ctx.testDb.db, animal.id);
  assert.ok(pedigree, 'the permit prerequisite is a real issued pedigree');
  return { animalId: animal.id, pedigreeCode: pedigree.pedigreeCode };
}

/** The male of the first owner and the female of the second, ready to be paired. */
export async function twoPedigreedAnimals(ctx: MatingCtx) {
  const male = await pedigreedAnimal(ctx, ctx.first, 'سگ نر نمونه', 'MALE');
  const female = await pedigreedAnimal(ctx, ctx.second, 'سگ ماده نمونه', 'FEMALE');
  return { male, female };
}

export async function payPermitFee(ctx: MatingCtx, permitId: string) {
  const gateway = payingGateway(3_000_000n);
  const batch = await startPermitPayment(ctx.testDb.db, ctx.first.actor, permitId);
  const started = await startAttempt(
    ctx.testDb.db,
    ctx.first.actor,
    { batchId: batch.id, callbackUrl: '/x' },
    gateway,
    'test-gateway',
  );
  return {
    batch,
    outcome: await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects),
  };
}

/**
 * One permit taken through §16 to an issued state: invitation, the
 * counterparty's own confirmation, the allocation rule, the verified payment,
 * the submission and the association's decision.
 */
export async function issuedPermit(
  ctx: MatingCtx,
  male: { animalId: string },
  female: { pedigreeCode: string },
): Promise<PermitRecord> {
  return takeToIssued(
    ctx,
    await startPermit(ctx.testDb.db, ctx.first.actor, {
      ownAnimalId: male.animalId,
      counterpartyPedigreeCode: female.pedigreeCode,
    }),
  );
}

/** The same path, for a case a test has already opened itself. */
export async function takeToIssued(ctx: MatingCtx, permit: PermitRecord): Promise<PermitRecord> {
  await confirmCounterparty(ctx.testDb.db, ctx.second.actor, permit.id, true);
  await saveAllocationRule(ctx.testDb.db, ctx.first.actor, permit.id, {
    type: 'PERCENTAGE',
    shares: [
      { side: 'SIRE_SIDE', percent: 50 },
      { side: 'DAM_SIDE', percent: 50 },
    ],
  });
  await payPermitFee(ctx, permit.id);
  await submitPermit(ctx.testDb.db, ctx.first.actor, permit.id);
  const issued = await reviewPermit(ctx.testDb.db, ctx.association.actor, {
    permitId: permit.id,
    decision: 'ISSUED',
  });
  assert.equal(issued.status, 'ISSUED');
  return issued;
}
