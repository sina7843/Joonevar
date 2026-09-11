/**
 * Suggested records and centre claims — Phase 2 PROMPT-009.
 *
 * Runs against a freshly migrated database: what a suggestion must say, the
 * duplicates it is refused for, the ceilings that stop a flood, review by the
 * review operator only (never their own), approval that publishes an unowned
 * record, and a claim that moves a centre's future editing to its
 * representative while its history stays where it is.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents, notifications, storedFiles } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { centreClaimDocuments, centres, vetProfiles } from '../../src/db/schema/vets.ts';
import { canReadFile } from '../../src/authz/policy.ts';
import { changeCentreStatus, createCentre, updateCentreProfile } from '../../src/centres/service.ts';
import {
  appealCentreClaim,
  centreClaimForReview,
  centreClaimQueue,
  claimableCentre,
  decideCentreClaim,
  myCentreClaims,
  resubmitCentreClaim,
  submitCentreClaim,
  withdrawCentreClaim,
} from '../../src/centres/claims.ts';
import {
  decideSuggestion,
  mySuggestions,
  resubmitSuggestion,
  similarRecords,
  submitSuggestion,
  suggestionForReview,
  suggestionQueue,
  withdrawSuggestion,
  type SuggestionRow,
} from '../../src/suggestions/service.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let storage: string;
let admin: Actor;
let reviewer: Actor;
let tehranCityId: string;
let counter = 0;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-suggestions-'));
  admin = actorFor(await createTestAccount(testDb.db, '09990670001'), 'SUPERADMIN');
  reviewer = actorFor(await createTestAccount(testDb.db, '09990670002'), 'REVIEW_OPERATOR');
  const [tehran] = await testDb.db.select().from(cities).where(and(eq(cities.provinceCode, 'tehran'), eq(cities.nameFa, 'تهران')));
  tehranCityId = tehran!.id;
});

after(async () => {
  await testDb?.drop();
  if (storage) await fs.rm(storage, { recursive: true, force: true });
});

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
const message = (expected: string, pattern: RegExp) => (error: unknown) => code(expected)(error) && pattern.test((error as Error).message);

async function newAccount(context: Actor['context'] = 'USER'): Promise<Actor> {
  counter += 1;
  return actorFor(await createTestAccount(testDb.db, '0999068' + String(counter).padStart(4, '0')), context);
}

const suggestionInput = (patch: Record<string, unknown> = {}) => ({
  kind: 'CENTRE',
  displayNameFa: 'مرکز پیشنهادی ' + counter,
  cityId: tehranCityId,
  contactFa: 'خیابان آزمایشی',
  sourceFa: 'SYNTHETIC تابلوی مرکز',
  noteFa: null,
  ...patch,
});

const suggest = (actor: Actor, patch: Record<string, unknown> = {}) => submitSuggestion(testDb.db, actor, suggestionInput(patch));

const decide = (row: SuggestionRow, decision: string, who: Actor = reviewer, reasonFa = 'SYNTHETIC دلیل بررسی') =>
  decideSuggestion(testDb.db, who, { suggestionId: row.id, expectedVersion: row.version, decision, reasonFa, confirmedNotDuplicate: true });

/** A published centre with no manager: the only kind a claim may target. */
async function unownedCentre(label: string) {
  counter += 1;
  const centre = await createCentre(testDb.db, admin, {
    typeCode: 'CLINIC',
    displayNameFa: label + ' ' + counter,
    cityId: tehranCityId,
    contactFa: 'تماس آزمایشی',
    sourceFa: 'SYNTHETIC منبع',
    reason: 'SYNTHETIC ثبت',
    confirmedNotDuplicate: true,
  });
  return changeCentreStatus(testDb.db, admin, { centreId: centre.id, expectedVersion: centre.version, to: 'PUBLISHED', reason: 'SYNTHETIC انتشار' });
}

const document = (kind = 'CENTRE_LICENCE') => ({ kind, bytes: PNG, originalName: kind.toLowerCase() + '.png' });

async function events(action: string, targetId: string) {
  return testDb.db.select().from(auditEvents).where(and(eq(auditEvents.action, action), eq(auditEvents.targetId, targetId)));
}

test('a suggestion needs a name, a city and a source, and is refused when the record already exists', async () => {
  const user = await newAccount();
  await assert.rejects(() => suggest(actorFor(user.accountId, 'REVIEW_OPERATOR')), code('FORBIDDEN'));
  await assert.rejects(() => suggest(user, { displayNameFa: ' ' }), code('VALIDATION'));
  await assert.rejects(() => suggest(user, { cityId: '' }), code('VALIDATION'));
  await assert.rejects(() => suggest(user, { sourceFa: '  ' }), message('VALIDATION', /منبع/));
  await assert.rejects(() => suggest(user, { kind: 'CLUB' }), code('VALIDATION'));

  // A draft centre with the same name: a duplicate the suggester must confirm past.
  const draft = await createCentre(testDb.db, admin, {
    typeCode: 'CLINIC',
    displayNameFa: 'مرکز تکراری ' + counter,
    cityId: tehranCityId,
    sourceFa: 'SYNTHETIC',
    reason: 'SYNTHETIC',
    confirmedNotDuplicate: true,
  });
  await assert.rejects(() => suggest(user, { displayNameFa: draft.displayNameFa }), message('CONFLICT', /تکراری نیست/));
  const confirmed = await suggest(user, { displayNameFa: draft.displayNameFa, confirmedNotDuplicate: true });
  assert.equal(confirmed.status, 'SUBMITTED');
  await withdrawSuggestion(testDb.db, user, { suggestionId: confirmed.id, expectedVersion: confirmed.version });

  // A published centre with no manager is claimed, not suggested again.
  const published = await unownedCentre('مرکز منتشرشده');
  await assert.rejects(() => suggest(user, { displayNameFa: published.displayNameFa }), message('CONFLICT', /Claim/));
  const similar = await similarRecords(testDb.db, 'CENTRE', published.displayNameFa);
  assert.equal(similar.length, 1);
  assert.deepEqual({ owned: similar[0]!.owned, published: similar[0]!.published }, { owned: false, published: true });
});

test('a suggester may keep three open suggestions and stays under the daily ceiling', async () => {
  const user = await newAccount();
  const open = [];
  for (let index = 0; index < 3; index += 1) {
    counter += 1;
    open.push(await suggest(user, { displayNameFa: 'مرکز باز ' + counter }));
  }
  counter += 1;
  await assert.rejects(() => suggest(user, { displayNameFa: 'مرکز چهارم ' + counter }), message('CONFLICT', /سه پیشنهاد/));

  // Withdrawn suggestions free the open slots but still count against the daily ceiling of five.
  for (const row of open) await withdrawSuggestion(testDb.db, user, { suggestionId: row.id, expectedVersion: row.version });
  counter += 1;
  const fourth = await suggest(user, { displayNameFa: 'مرکز چهارم ' + counter });
  await withdrawSuggestion(testDb.db, user, { suggestionId: fourth.id, expectedVersion: fourth.version });
  counter += 1;
  const fifth = await suggest(user, { displayNameFa: 'مرکز پنجم ' + counter });
  await withdrawSuggestion(testDb.db, user, { suggestionId: fifth.id, expectedVersion: fifth.version });
  counter += 1;
  await assert.rejects(() => suggest(user, { displayNameFa: 'مرکز ششم ' + counter }), code('RATE_LIMITED'));
});

test('only the review operator decides a suggestion, never their own, and approval publishes an unowned record', async () => {
  const user = await newAccount();
  const row = await suggest(user, { displayNameFa: 'درمانگاه بررسی ' + counter });
  await assert.rejects(() => decide(row, 'APPROVE', user), code('FORBIDDEN'));
  await assert.rejects(() => decide(row, 'APPROVE', actorFor(user.accountId, 'CONTENT_ADMIN')), code('FORBIDDEN'));
  await assert.rejects(
    () => decideSuggestion(testDb.db, reviewer, { suggestionId: row.id, expectedVersion: row.version, decision: 'APPROVE', reasonFa: ' ' }),
    code('VALIDATION'),
  );
  await assert.rejects(() => suggestionQueue(testDb.db, user, { view: 'OPEN', page: 1 }), code('FORBIDDEN'));
  const reviewerOwn = await suggest(actorFor(reviewer.accountId, 'USER'), { displayNameFa: 'پیشنهاد اپراتور ' + counter });
  await assert.rejects(() => decide(reviewerOwn, 'APPROVE'), message('FORBIDDEN', /خودتان/));

  const queue = await suggestionQueue(testDb.db, reviewer, { view: 'OPEN', page: 1 });
  assert.ok(queue.items.some((item) => item.id === row.id));
  const detail = await suggestionForReview(testDb.db, reviewer, row.id);
  assert.equal(detail!.suggestion.id, row.id);
  assert.equal(await suggestionForReview(testDb.db, reviewer, 'not-a-uuid'), null);

  const corrected = await decide(row, 'REQUEST_CORRECTION', reviewer, 'نام مرکز ناقص است');
  assert.equal(corrected.status, 'NEEDS_CORRECTION');
  const [notice] = await testDb.db.select().from(notifications).where(eq(notifications.recipientAccountId, user.accountId));
  assert.equal(notice!.entityType, 'DIRECTORY_SUGGESTION');
  assert.equal(notice!.originRoute, '/account/suggestions');

  const stranger = await newAccount();
  const fixed = { ...suggestionInput({ displayNameFa: 'درمانگاه کامل ' + counter }), suggestionId: row.id, expectedVersion: corrected.version };
  await assert.rejects(() => resubmitSuggestion(testDb.db, stranger, fixed), code('NOT_FOUND'));
  const resubmitted = await resubmitSuggestion(testDb.db, user, fixed);
  assert.equal(resubmitted.status, 'SUBMITTED');
  await assert.rejects(() => decide(corrected, 'APPROVE'), code('CONFLICT'), 'a decision on the older version is refused');

  const approved = await decide(resubmitted, 'APPROVE', reviewer, 'با تابلوی مرکز تطبیق داده شد');
  assert.equal(approved.status, 'APPROVED');
  assert.ok(approved.createdCentreId);
  const [created] = await testDb.db.select().from(centres).where(eq(centres.id, approved.createdCentreId!));
  assert.equal(created!.ownerAccountId, null, 'suggesting never makes the suggester an owner');
  assert.equal(created!.publicStatus, 'PUBLISHED');
  assert.equal(created!.listedCityId, tehranCityId);
  assert.equal(created!.sourceFa, fixed.sourceFa);
  assert.match(created!.publicSlug!, /^centre-[0-9a-f]{10}$/);
  assert.equal((await events('CENTRE_PUBLISHED_FROM_SUGGESTION', created!.id))[0]!.reason, 'با تابلوی مرکز تطبیق داده شد');
  await assert.rejects(() => decide(approved, 'REJECT'), code('CONFLICT'));

  const mine = await mySuggestions(testDb.db, user);
  assert.equal(mine.find((item) => item.id === row.id)!.publicSlug, created!.publicSlug);
});

test('an approved veterinarian suggestion becomes an unowned profile', async () => {
  const user = await newAccount();
  const row = await suggest(user, { kind: 'VET', displayNameFa: 'دامپزشک پیشنهادی ' + counter });
  const approved = await decide(row, 'APPROVE', reviewer, 'از منبع عمومی تأیید شد');
  assert.ok(approved.createdVetProfileId);
  const [profile] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.id, approved.createdVetProfileId!));
  assert.equal(profile!.accountId, null);
  assert.equal(profile!.councilCode, null, 'a suggestion never invents a council code');
  assert.equal(profile!.councilVerifiedAt, null);
  assert.equal(profile!.publicStatus, 'PUBLISHED');
  assert.match(profile!.publicSlug!, /^vet-[0-9a-f]{10}$/);
});

test('a centre claim carries private documents, one open claim per centre and per account', async () => {
  const centre = await unownedCentre('مرکز برای Claim');
  const claimant = await newAccount();
  const other = await newAccount();
  const claim = { claimSlug: centre.publicSlug!, claimantNameFa: 'نماینده نمونه', roleFa: 'مدیر فنی', phone: '02100000000', statementFa: null };

  await assert.rejects(
    () => submitCentreClaim(testDb.db, storage, actorFor(claimant.accountId, 'REVIEW_OPERATOR'), { ...claim, documents: [document()] }),
    code('FORBIDDEN'),
  );
  await assert.rejects(() => submitCentreClaim(testDb.db, storage, claimant, { ...claim, documents: [] }), message('VALIDATION', /مدرک/));
  await assert.rejects(
    () => submitCentreClaim(testDb.db, storage, claimant, { ...claim, roleFa: ' ', documents: [document()] }),
    message('VALIDATION', /سمت/),
  );
  await assert.rejects(
    () => submitCentreClaim(testDb.db, storage, claimant, { ...claim, claimSlug: 'centre-0000000000', documents: [document()] }),
    code('NOT_FOUND'),
  );

  const submitted = await submitCentreClaim(testDb.db, storage, claimant, {
    ...claim,
    documents: [document(), document('AUTHORIZATION_LETTER')],
  });
  assert.equal(submitted.status, 'SUBMITTED');
  const documents = await testDb.db.select().from(centreClaimDocuments).where(eq(centreClaimDocuments.claimId, submitted.id));
  assert.equal(documents.length, 2);
  const [file] = await testDb.db.select().from(storedFiles).where(eq(storedFiles.id, documents[0]!.fileId));
  assert.equal(file!.purpose, 'CENTRE_CLAIM_DOCUMENT');
  const record = { ownerAccountId: file!.ownerAccountId, purpose: file!.purpose };
  assert.ok(canReadFile(claimant, record) && canReadFile(reviewer, record) && canReadFile(admin, record));
  assert.ok(!canReadFile(other, record));
  assert.ok(!canReadFile(actorFor(other.accountId, 'CONTENT_ADMIN'), record));

  await assert.rejects(
    () => submitCentreClaim(testDb.db, storage, other, { ...claim, documents: [document()] }),
    message('CONFLICT', /این مرکز/),
  );
  const another = await unownedCentre('مرکز دوم');
  await assert.rejects(
    () => submitCentreClaim(testDb.db, storage, claimant, { ...claim, claimSlug: another.publicSlug!, documents: [document()] }),
    message('CONFLICT', /از شما/),
  );
  assert.equal((await myCentreClaims(testDb.db, claimant)).length, 1);
});

test('an approved claim hands the centre over, keeps its history and cannot be repeated', async () => {
  const centre = await unownedCentre('مرکز واگذاری');
  const claimant = await newAccount();
  const stranger = await newAccount();
  const base = { claimSlug: centre.publicSlug!, claimantNameFa: 'نماینده دوم', roleFa: 'مؤسس', phone: null, statementFa: 'مدارک پیوست است' };
  const submitted = await submitCentreClaim(testDb.db, storage, claimant, { ...base, documents: [document()] });

  await assert.rejects(
    () => decideCentreClaim(testDb.db, claimant, { claimId: submitted.id, expectedVersion: submitted.version, decision: 'APPROVE', reasonFa: 'x' }),
    code('FORBIDDEN'),
  );
  await assert.rejects(() => centreClaimQueue(testDb.db, claimant, { view: 'OPEN', page: 1 }), code('FORBIDDEN'));
  const queue = await centreClaimQueue(testDb.db, reviewer, { view: 'OPEN', page: 1 });
  assert.ok(queue.items.some((item) => item.id === submitted.id));
  const detail = await centreClaimForReview(testDb.db, reviewer, submitted.id);
  assert.equal(detail!.documents.length, 1);
  assert.equal(detail!.centreOwned, false);

  const corrected = await decideCentreClaim(testDb.db, reviewer, {
    claimId: submitted.id,
    expectedVersion: submitted.version,
    decision: 'REQUEST_CORRECTION',
    reasonFa: 'معرفی‌نامه خوانا نیست',
  });
  assert.equal(corrected.status, 'NEEDS_CORRECTION');
  await assert.rejects(
    () =>
      resubmitCentreClaim(testDb.db, storage, stranger, {
        claimId: submitted.id,
        expectedVersion: corrected.version,
        ...base,
        documents: [document('AUTHORIZATION_LETTER')],
      }),
    code('NOT_FOUND'),
  );
  const resubmitted = await resubmitCentreClaim(testDb.db, storage, claimant, {
    claimId: submitted.id,
    expectedVersion: corrected.version,
    ...base,
    documents: [document('AUTHORIZATION_LETTER')],
  });
  assert.equal(resubmitted.status, 'SUBMITTED');

  const approved = await decideCentreClaim(testDb.db, reviewer, {
    claimId: resubmitted.id,
    expectedVersion: resubmitted.version,
    decision: 'APPROVE',
    reasonFa: 'پروانه و معرفی‌نامه تطبیق داده شد',
  });
  assert.equal(approved.status, 'APPROVED');
  const [owned] = await testDb.db.select().from(centres).where(eq(centres.id, centre.id));
  assert.equal(owned!.ownerAccountId, claimant.accountId);
  assert.ok(owned!.claimedAt instanceof Date);
  assert.equal(owned!.publicSlug, centre.publicSlug, 'the same record and address');
  // The history of how the centre was recorded stays; the claim is added to it.
  assert.equal((await events('CENTRE_CREATED', centre.id)).length, 1);
  const [claimed] = await events('CENTRE_CLAIMED', centre.id);
  assert.equal((claimed!.before as { ownerAccountId: unknown }).ownerAccountId, null);
  assert.equal(claimed!.reason, 'پروانه و معرفی‌نامه تطبیق داده شد');
  const [notice] = await testDb.db.select().from(notifications).where(eq(notifications.recipientAccountId, claimant.accountId));
  assert.equal(notice!.entityType, 'CENTRE_CLAIM');

  // The new manager really manages it, and the centre is no longer claimable.
  const edited = await updateCentreProfile(testDb.db, claimant, {
    centreId: centre.id,
    expectedVersion: owned!.version,
    typeCode: owned!.typeCode,
    displayNameFa: owned!.displayNameFa,
    aboutFa: 'معرفی مدیر تازه',
    phone: '02100000005',
    websiteUrl: null,
    serviceCodes: ['EXAMINATION'],
    speciesCodes: ['DOG'],
    facilityCodes: [],
    reason: null,
  });
  assert.equal(edited.aboutFa, 'معرفی مدیر تازه');
  assert.equal(await claimableCentre(testDb.db, centre.publicSlug!), null);
  await assert.rejects(
    () => submitCentreClaim(testDb.db, storage, stranger, { ...base, documents: [document()] }),
    code('NOT_FOUND'),
  );
  await assert.rejects(
    () => decideCentreClaim(testDb.db, reviewer, { claimId: approved.id, expectedVersion: approved.version, decision: 'APPROVE', reasonFa: 'x' }),
    code('CONFLICT'),
  );
});

test('a rejected claim is appealed once, and withdrawing archives it', async () => {
  const centre = await unownedCentre('مرکز تجدیدنظر');
  const claimant = await newAccount();
  const base = { claimSlug: centre.publicSlug!, claimantNameFa: 'نماینده سوم', roleFa: 'مدیر', phone: null, statementFa: null };
  const submitted = await submitCentreClaim(testDb.db, storage, claimant, { ...base, documents: [document()] });
  const rejected = await decideCentreClaim(testDb.db, reviewer, {
    claimId: submitted.id,
    expectedVersion: submitted.version,
    decision: 'REJECT',
    reasonFa: 'مدرک ارتباط شما با مرکز را نشان نمی‌دهد',
  });
  assert.equal(rejected.status, 'REJECTED');
  const appealed = await appealCentreClaim(testDb.db, claimant, {
    claimId: submitted.id,
    expectedVersion: rejected.version,
    appealFa: 'معرفی‌نامه تازه گرفتم',
  });
  assert.equal(appealed.status, 'SUBMITTED');
  const final = await decideCentreClaim(testDb.db, reviewer, {
    claimId: submitted.id,
    expectedVersion: appealed.version,
    decision: 'REJECT',
    reasonFa: 'پس از تجدیدنظر هم تأیید نشد',
  });
  await assert.rejects(
    () => appealCentreClaim(testDb.db, claimant, { claimId: submitted.id, expectedVersion: final.version, appealFa: 'دوباره' }),
    message('CONFLICT', /یک‌بار/),
  );

  const second = await submitCentreClaim(testDb.db, storage, claimant, { ...base, documents: [document()] });
  const withdrawn = await withdrawCentreClaim(testDb.db, claimant, { claimId: second.id, expectedVersion: second.version });
  assert.equal(withdrawn.status, 'WITHDRAWN');
  await assert.rejects(
    () => withdrawCentreClaim(testDb.db, claimant, { claimId: second.id, expectedVersion: withdrawn.version }),
    code('CONFLICT'),
  );
  const decided = await centreClaimQueue(testDb.db, reviewer, { view: 'DECIDED', page: 1 });
  assert.ok(decided.items.some((item) => item.id === second.id));
});
