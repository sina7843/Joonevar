/**
 * Associations and clubs — Phase 2 PROMPT-010.
 *
 * Runs against a freshly migrated database: who may record an association or a
 * club, who records its registration, who grants the publishing permission a
 * club needs before it writes anything, the managers who are named publicly
 * only after accepting, the events that keep their cancellation reason, the
 * handover of a record that had no manager, and the public readers with their
 * filters.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents, notifications } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { referenceBreeds, species } from '../../src/db/schema/core.ts';
import { contentItems } from '../../src/db/schema/content.ts';
import { communities } from '../../src/db/schema/communities.ts';
import {
  addCommunityEvent,
  assignCommunityOwner,
  changeCommunityStatus,
  communityEditor,
  communityPageBySlug,
  communitySitemapEntries,
  createCommunity,
  inviteCommunityManager,
  manageableCommunities,
  myCommunityInvitations,
  publishedCommunities,
  removeCommunityManager,
  respondToCommunityInvitation,
  setCommunityPublisher,
  setCommunityRegistration,
  updateCommunityEvent,
  updateCommunityProfile,
  type CommunityRow,
} from '../../src/communities/service.ts';
import {
  changeCommunityPostStatus,
  communityPosts,
  createCommunityPost,
  publicCommunityPost,
  updateCommunityPost,
} from '../../src/communities/posts.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let admin: Actor;
let reviewer: Actor;
let user: Actor;
let userMobile: string;
let manager: Actor;
let managerMobile: string;
let tehranCityId: string;
let dogSpecies: string;
let breedId: string;
let counter = 0;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  admin = actorFor(await createTestAccount(testDb.db, '09990650001'), 'SUPERADMIN');
  reviewer = actorFor(await createTestAccount(testDb.db, '09990650002'), 'REVIEW_OPERATOR');
  userMobile = '09990650003';
  user = actorFor(await createTestAccount(testDb.db, userMobile));
  managerMobile = '09990650004';
  manager = actorFor(await createTestAccount(testDb.db, managerMobile));
  const cityRows = await testDb.db.select().from(cities);
  tehranCityId = cityRows.find((row) => row.provinceCode === 'tehran' && row.nameFa === 'تهران')!.id;
  dogSpecies = (await testDb.db.select().from(species))[0]!.code;
  breedId = (await testDb.db.select().from(referenceBreeds))[0]!.id;
});

after(async () => {
  await testDb?.drop();
});

async function newCommunity(kind: 'ASSOCIATION' | 'CLUB', label: string): Promise<CommunityRow> {
  counter += 1;
  return createCommunity(testDb.db, admin, {
    kind,
    displayNameFa: label + ' ' + counter,
    scope: 'OTHER',
    sourceFa: 'فهرست عمومی آزمایشی',
    reason: 'ثبت برای آزمون',
  });
}

/** About and a way to reach them: the two things a public page may not go out without. */
async function publishable(community: CommunityRow): Promise<CommunityRow> {
  return updateCommunityProfile(testDb.db, admin, {
    communityId: community.id,
    expectedVersion: community.version,
    displayNameFa: community.displayNameFa,
    aboutFa: 'انجمن آزمایشی برای آزمون خودکار.',
    scope: 'OTHER',
    provinceCode: null,
    cityId: null,
    membershipInfoFa: 'عضویت از دفتر انجمن انجام می‌شود.',
    membershipUrl: null,
    contactPhone: '02100000000',
    websiteUrl: null,
    speciesCodes: [dogSpecies],
    breedIds: [breedId],
    reason: 'تکمیل پرونده',
  });
}

test('only the superadmin and the review operator record a community, and a second record with the same name needs a confirmation', async () => {
  await assert.rejects(
    createCommunity(testDb.db, user, { kind: 'CLUB', displayNameFa: 'کلاب کاربر', reason: 'بدون اجازه' }),
    /فقط|اجازه|دسترسی/,
  );
  const first = await newCommunity('ASSOCIATION', 'انجمن هم‌نام');
  await assert.rejects(
    createCommunity(testDb.db, reviewer, { kind: 'ASSOCIATION', displayNameFa: first.displayNameFa, reason: 'ثبت دوباره' }),
    /تکراری نیست/,
  );
  const twin = await createCommunity(testDb.db, reviewer, {
    kind: 'ASSOCIATION',
    displayNameFa: first.displayNameFa,
    reason: 'دو انجمن هم‌نام در دو استان',
    confirmedNotDuplicate: true,
  });
  assert.notEqual(twin.id, first.id);
  assert.equal(twin.publicStatus, 'DRAFT');
  assert.equal(twin.ownerAccountId, null);
  // A change with no reason is not recorded at all for an operator.
  await assert.rejects(createCommunity(testDb.db, admin, { kind: 'CLUB', displayNameFa: 'بی‌دلیل', reason: '  ' }), /دلیل/);
});

test('the profile keeps its own rules: the reviewer does not write it, and a scope that names a place must name one', async () => {
  const community = await newCommunity('CLUB', 'کلاب پروفایل');
  const base = {
    communityId: community.id,
    expectedVersion: community.version,
    displayNameFa: community.displayNameFa,
    aboutFa: 'معرفی',
    provinceCode: null,
    cityId: null,
    membershipInfoFa: null,
    membershipUrl: null,
    contactPhone: null,
    websiteUrl: null,
    speciesCodes: [] as string[],
    breedIds: [] as string[],
    reason: 'ویرایش',
  };
  await assert.rejects(updateCommunityProfile(testDb.db, reviewer, { ...base, scope: 'OTHER' }), /دسترسی|اجازه|فقط/);
  await assert.rejects(updateCommunityProfile(testDb.db, admin, { ...base, scope: 'PROVINCIAL' }), /استان/);
  await assert.rejects(updateCommunityProfile(testDb.db, admin, { ...base, scope: 'BREED' }), /نژاد/);

  const saved = await updateCommunityProfile(testDb.db, admin, {
    ...base,
    scope: 'CITY',
    cityId: tehranCityId,
    speciesCodes: [dogSpecies],
  });
  assert.equal(saved.cityId, tehranCityId);
  // The province follows the chosen city instead of being typed twice.
  assert.equal(saved.provinceCode, 'tehran');
  assert.equal(saved.version, community.version + 1);
  await assert.rejects(
    updateCommunityProfile(testDb.db, admin, { ...base, scope: 'OTHER', expectedVersion: community.version }),
    /هم‌زمان تغییر/,
  );
});

test('a registration belongs to an association and is recorded by whoever checked it, never by its own manager', async () => {
  const association = await newCommunity('ASSOCIATION', 'انجمن مجوزدار');
  await assert.rejects(
    setCommunityRegistration(testDb.db, reviewer, {
      communityId: association.id,
      expectedVersion: association.version,
      registrationNumber: null,
      licenceStatus: 'VALID',
      reason: 'بدون شماره',
    }),
    /شماره/,
  );
  const recorded = await setCommunityRegistration(testDb.db, reviewer, {
    communityId: association.id,
    expectedVersion: association.version,
    registrationNumber: 'REG-2026-001',
    licenceStatus: 'VALID',
    reason: 'مدارک ثبت دیده شد',
  });
  assert.equal(recorded.licenceStatus, 'VALID');
  assert.ok(recorded.licenceVerifiedAt instanceof Date);

  const club = await newCommunity('CLUB', 'کلاب بی‌مجوز');
  await assert.rejects(
    setCommunityRegistration(testDb.db, reviewer, {
      communityId: club.id,
      expectedVersion: club.version,
      registrationNumber: 'REG-X',
      licenceStatus: 'VALID',
      reason: 'اشتباه',
    }),
    /کلاب/,
  );

  const [audit] = await testDb.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.targetId, association.id), eq(auditEvents.action, 'COMMUNITY_REGISTRATION_RECORDED')));
  assert.equal(audit!.reason, 'مدارک ثبت دیده شد');
  assert.deepEqual((audit!.before as Record<string, unknown>).licenceStatus, 'NONE');
  assert.deepEqual((audit!.after as Record<string, unknown>).licenceStatus, 'VALID');
});

test('only the superadmin grants a club the permission to publish, and its manager is told', async () => {
  const club = await newCommunity('CLUB', 'کلاب ناشر');
  const owned = await assignCommunityOwner(
    testDb.db,
    admin,
    { communityId: club.id, expectedVersion: club.version, mobile: userMobile, reason: 'واگذاری به مدیر' },
  );
  assert.equal(owned.ownerAccountId, user.accountId);
  assert.ok(owned.claimedAt instanceof Date);

  await assert.rejects(
    setCommunityPublisher(testDb.db, reviewer, {
      communityId: club.id,
      expectedVersion: owned.version,
      canPublishPosts: true,
      reason: 'بررسی اجازه ندارد',
    }),
    /سوپرادمین/,
  );
  await assert.rejects(
    setCommunityPublisher(testDb.db, user, {
      communityId: club.id,
      expectedVersion: owned.version,
      canPublishPosts: true,
      reason: 'خودم می‌خواهم',
    }),
    /سوپرادمین/,
  );
  const granted = await setCommunityPublisher(testDb.db, admin, {
    communityId: club.id,
    expectedVersion: owned.version,
    canPublishPosts: true,
    reason: 'کلاب شناخته‌شده است',
  });
  assert.equal(granted.canPublishPosts, true);

  const told = await testDb.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientAccountId, user.accountId), eq(notifications.kind, 'COMMUNITY_PUBLISHER_CHANGED')));
  assert.equal(told.length, 1);

  const association = await newCommunity('ASSOCIATION', 'انجمن بی‌نوشته');
  await assert.rejects(
    setCommunityPublisher(testDb.db, admin, {
      communityId: association.id,
      expectedVersion: association.version,
      canPublishPosts: true,
      reason: 'اشتباه',
    }),
    /کلاب/,
  );
  // A record with no manager cannot be handed over twice.
  await assert.rejects(
    assignCommunityOwner(testDb.db, admin, {
      communityId: club.id,
      expectedVersion: granted.version,
      mobile: managerMobile,
      reason: 'دوباره',
    }),
    /مدیر دارد/,
  );
  await assert.rejects(
    assignCommunityOwner(testDb.db, admin, {
      communityId: association.id,
      expectedVersion: association.version,
      mobile: '09999999999',
      reason: 'ناشناس',
    }),
    /حسابی با این شماره/,
  );
});

test('publication needs an introduction and a way to get in touch, and what the review hides only the review shows again', async () => {
  const community = await newCommunity('ASSOCIATION', 'انجمن انتشار');
  await assert.rejects(
    changeCommunityStatus(testDb.db, admin, { communityId: community.id, expectedVersion: community.version, to: 'PUBLISHED', reason: 'زود' }),
    /معرفی/,
  );
  const filled = await publishable(community);
  const published = await changeCommunityStatus(testDb.db, admin, {
    communityId: filled.id,
    expectedVersion: filled.version,
    to: 'PUBLISHED',
    reason: 'پرونده کامل است',
  });
  assert.equal(published.publicStatus, 'PUBLISHED');
  assert.match(published.publicSlug ?? '', /^assoc-[0-9a-f]{10}$/);
  assert.equal(published.hiddenByReview, false);

  const handed = await assignCommunityOwner(testDb.db, admin, {
    communityId: published.id,
    expectedVersion: published.version,
    mobile: userMobile,
    reason: 'واگذاری',
  });
  const hidden = await changeCommunityStatus(testDb.db, reviewer, {
    communityId: handed.id,
    expectedVersion: handed.version,
    to: 'HIDDEN',
    reason: 'اطلاعات نادرست گزارش شد',
  });
  assert.equal(hidden.hiddenByReview, true);
  assert.equal(await communityPageBySlug(testDb.db, hidden.publicSlug!), null);
  await assert.rejects(
    changeCommunityStatus(testDb.db, user, { communityId: hidden.id, expectedVersion: hidden.version, to: 'PUBLISHED' }),
    /بررسی همزیست/,
  );
  const back = await changeCommunityStatus(testDb.db, reviewer, {
    communityId: hidden.id,
    expectedVersion: hidden.version,
    to: 'PUBLISHED',
    reason: 'اصلاح شد',
  });
  assert.equal(back.hiddenByReview, false);
  // The slug does not change, so the public address survives being hidden.
  assert.equal(back.publicSlug, published.publicSlug);
});

test('a manager is named publicly only after accepting, and the owner sees the record among their own', async () => {
  const community = await publishable(await newCommunity('CLUB', 'کلاب مدیران'));
  const owned = await assignCommunityOwner(testDb.db, admin, {
    communityId: community.id,
    expectedVersion: community.version,
    mobile: userMobile,
    reason: 'واگذاری',
  });
  await assert.rejects(
    inviteCommunityManager(testDb.db, user, { communityId: owned.id, mobile: '09999999998', roleFa: 'دبیر' }),
    /حسابی با این شماره/,
  );
  const invited = await inviteCommunityManager(testDb.db, user, { communityId: owned.id, mobile: managerMobile, roleFa: 'دبیر' });
  assert.equal(invited.status, 'INVITED');
  await assert.rejects(inviteCommunityManager(testDb.db, user, { communityId: owned.id, mobile: managerMobile }), /فهرست مدیران/);

  const waiting = await myCommunityInvitations(testDb.db, manager);
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0]!.communityNameFa, owned.displayNameFa);
  // Someone else's invitation is not even visible.
  assert.equal((await myCommunityInvitations(testDb.db, user)).length, 0);
  await assert.rejects(
    respondToCommunityInvitation(testDb.db, user, { managerId: invited.id, expectedVersion: invited.version, accept: true }),
    /پیدا نشد/,
  );

  const accepted = await respondToCommunityInvitation(testDb.db, manager, {
    managerId: invited.id,
    expectedVersion: invited.version,
    accept: true,
  });
  assert.equal(accepted.status, 'ACCEPTED');
  await assert.rejects(
    respondToCommunityInvitation(testDb.db, manager, { managerId: invited.id, expectedVersion: accepted.version, accept: false }),
    /پاسخ داده شده/,
  );

  const mine = await manageableCommunities(testDb.db, user);
  assert.ok(mine.some((row) => row.community.id === owned.id));
  const editor = await communityEditor(testDb.db, user, owned.id);
  assert.equal(editor!.facts.managers.filter((row) => row.status === 'ACCEPTED').length, 1);

  const removed = await removeCommunityManager(testDb.db, user, { managerId: accepted.id, expectedVersion: accepted.version });
  assert.equal(removed.status, 'REMOVED');
  await assert.rejects(
    removeCommunityManager(testDb.db, user, { managerId: accepted.id, expectedVersion: removed.version }),
    /پیش‌تر برداشته/,
  );
});

test('an event keeps the dates it was given, and a cancelled one keeps its reason on the public page', async () => {
  const community = await publishable(await newCommunity('ASSOCIATION', 'انجمن رویداد'));
  await assert.rejects(
    addCommunityEvent(testDb.db, admin, community.id, { titleFa: 'نمایشگاه', startsOn: '2030-05-20', endsOn: '2030-05-19' }),
    /پایان/,
  );
  await assert.rejects(addCommunityEvent(testDb.db, admin, community.id, { titleFa: 'نمایشگاه', startsOn: '20-05-2030' }), /تاریخ/);

  const event = await addCommunityEvent(testDb.db, admin, community.id, {
    titleFa: 'نمایشگاه سالانه',
    startsOn: '2030-05-20',
    endsOn: '2030-05-22',
    cityId: tehranCityId,
    placeFa: 'محل دائمی نمایشگاه‌ها',
    registrationUrl: 'https://example.test/register',
    status: 'PUBLISHED',
  });
  assert.equal(event.status, 'PUBLISHED');
  const past = await addCommunityEvent(testDb.db, admin, community.id, {
    titleFa: 'کارگاه گذشته',
    startsOn: '2024-02-10',
    status: 'PUBLISHED',
  });

  await assert.rejects(
    updateCommunityEvent(testDb.db, admin, {
      eventId: event.id,
      expectedVersion: event.version,
      titleFa: event.titleFa,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      status: 'CANCELLED',
      reason: 'لغو شد',
    }),
    /دلیل/,
  );
  const cancelled = await updateCommunityEvent(testDb.db, admin, {
    eventId: event.id,
    expectedVersion: event.version,
    titleFa: event.titleFa,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    cityId: tehranCityId,
    status: 'CANCELLED',
    cancelReasonFa: 'سالن در دسترس نبود',
    reason: 'اعلام لغو',
  });
  assert.equal(cancelled.cancelReasonFa, 'سالن در دسترس نبود');

  const published = await changeCommunityStatus(testDb.db, admin, {
    communityId: community.id,
    expectedVersion: community.version,
    to: 'PUBLISHED',
    reason: 'انتشار',
  });
  const page = await communityPageBySlug(testDb.db, published.publicSlug!, '2026-09-12');
  const shown = page!.events.find((row) => row.id === event.id)!;
  assert.equal(shown.cancelled, true);
  assert.equal(shown.cancelReasonFa, 'سالن در دسترس نبود');
  assert.equal(shown.upcoming, true);
  assert.equal(page!.events.find((row) => row.id === past.id)!.upcoming, false);
  assert.equal(page!.registration, null);
  assert.deepEqual(page!.managers, []);
});

test('a club writes nothing until the permission is on, and what the content admin hid does not come back from here', async () => {
  const club = await publishable(await newCommunity('CLUB', 'کلاب نوشته'));
  const owned = await assignCommunityOwner(testDb.db, admin, {
    communityId: club.id,
    expectedVersion: club.version,
    mobile: userMobile,
    reason: 'واگذاری',
  });
  await assert.rejects(createCommunityPost(testDb.db, user, { communityId: owned.id, titleFa: 'خبر کلاب' }), /مجوز|اجازه/);
  const granted = await setCommunityPublisher(testDb.db, admin, {
    communityId: owned.id,
    expectedVersion: owned.version,
    canPublishPosts: true,
    reason: 'کلاب شناخته‌شده',
  });
  await assert.rejects(createCommunityPost(testDb.db, manager, { communityId: granted.id, titleFa: 'خبر دیگران' }), /مدیر همان کلاب/);

  const post = await createCommunityPost(testDb.db, user, { communityId: granted.id, titleFa: 'گزارش تمرین ماهانه' });
  assert.equal(post.status, 'DRAFT');
  assert.equal(post.kind, 'CLUB_POST');
  await assert.rejects(
    changeCommunityPostStatus(testDb.db, user, { postId: post.id, expectedVersion: post.version, to: 'PUBLISHED' }),
    /خلاصه و متن/,
  );
  const written = await updateCommunityPost(testDb.db, user, {
    postId: post.id,
    expectedVersion: post.version,
    titleFa: post.titleFa,
    summaryFa: 'گزارش کوتاه تمرین‌های ماه گذشته.',
    bodyFa: 'متن کامل گزارش تمرین‌های ماه گذشته کلاب.',
  });
  const live = await changeCommunityPostStatus(testDb.db, user, {
    postId: written.id,
    expectedVersion: written.version,
    to: 'PUBLISHED',
  });
  assert.equal(live.status, 'PUBLISHED');

  const community = await changeCommunityStatus(testDb.db, admin, {
    communityId: granted.id,
    expectedVersion: granted.version,
    to: 'PUBLISHED',
    reason: 'انتشار',
  });
  const readable = await publicCommunityPost(testDb.db, community.publicSlug!, live.slug);
  assert.equal(readable!.titleFa, 'گزارش تمرین ماهانه');
  assert.equal(readable!.communityNameFa, community.displayNameFa);
  assert.equal((await communityPageBySlug(testDb.db, community.publicSlug!))!.posts.length, 1);
  assert.equal((await communityPosts(testDb.db, user, community.id)).length, 1);

  // What the content admin decides is answered in the CMS, not here (DEC-0162).
  await testDb.db.update(contentItems).set({ status: 'HIDDEN', version: live.version + 1 }).where(eq(contentItems.id, live.id));
  await assert.rejects(
    changeCommunityPostStatus(testDb.db, user, { postId: live.id, expectedVersion: live.version + 1, to: 'PUBLISHED' }),
    /ادمین محتوا/,
  );
  await assert.rejects(
    updateCommunityPost(testDb.db, user, {
      postId: live.id,
      expectedVersion: live.version + 1,
      titleFa: 'عنوان تازه',
      summaryFa: 'خلاصه',
      bodyFa: 'متن',
    }),
    /ادمین محتوا/,
  );
  assert.equal(await publicCommunityPost(testDb.db, community.publicSlug!, live.slug), null);

  // The permission can be taken back, and then nothing more is written.
  const revoked = await setCommunityPublisher(testDb.db, admin, {
    communityId: community.id,
    expectedVersion: community.version,
    canPublishPosts: false,
    reason: 'به درخواست خود کلاب',
  });
  await assert.rejects(createCommunityPost(testDb.db, user, { communityId: revoked.id, titleFa: 'خبر تازه' }), /مجوز|اجازه/);
});

test('the public directory shows published records only, with its filters and its sitemap', async () => {
  const club = await publishable(await newCommunity('CLUB', 'کلاب فهرست'));
  const published = await changeCommunityStatus(testDb.db, admin, {
    communityId: club.id,
    expectedVersion: club.version,
    to: 'PUBLISHED',
    reason: 'انتشار',
  });
  const draft = await publishable(await newCommunity('ASSOCIATION', 'انجمن پیش‌نویس'));

  const all = await publishedCommunities(testDb.db, { page: 1 });
  const slugs = all.items.map((row) => row.slug);
  assert.ok(slugs.includes(published.publicSlug!));
  assert.equal(
    all.items.some((row) => row.nameFa === draft.displayNameFa),
    false,
  );

  const byKind = await publishedCommunities(testDb.db, { page: 1, kind: 'CLUB' });
  assert.ok(byKind.items.every((row) => row.kind === 'CLUB'));
  const byBreed = await publishedCommunities(testDb.db, { page: 1, breedId });
  assert.ok(byBreed.items.some((row) => row.slug === published.publicSlug));
  const byName = await publishedCommunities(testDb.db, { page: 1, term: published.displayNameFa });
  assert.ok(byName.items.some((row) => row.slug === published.publicSlug));
  const none = await publishedCommunities(testDb.db, { page: 1, province: 'fars', term: published.displayNameFa });
  assert.equal(none.items.length, 0);
  assert.ok(none.publishedTotal > 0);

  const sitemap = await communitySitemapEntries(testDb.db);
  assert.ok(sitemap.some((entry) => entry.path === '/associations/' + published.publicSlug));
  assert.equal(
    sitemap.some((entry) => entry.path.includes(draft.id)),
    false,
  );

  // An unknown or badly shaped address is simply not found.
  assert.equal(await communityPageBySlug(testDb.db, 'club-0000000000'), null);
  assert.equal(await communityPageBySlug(testDb.db, '../secret'), null);
  assert.equal(await communityEditor(testDb.db, admin, 'not-a-uuid'), null);
  const [stored] = await testDb.db.select().from(communities).where(eq(communities.id, published.id));
  assert.equal(stored!.sourceFa, 'فهرست عمومی آزمایشی');
});
