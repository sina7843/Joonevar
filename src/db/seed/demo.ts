/**
 * Local demo data — so every screen has something to show.
 *
 *   DATABASE_URL=… npm run db:demo
 *
 * Everything here is SYNTHETIC and labelled as such: the people are invented
 * (mobiles 09990001xxx: the reserved synthetic 0999 range, below the numbers random test accounts use), the photos are the
 * approved design-system set (docs/design-system/demo-content/images-manifest.json, imported through the product's own
 * file storage with their Persian alt text) and, where the set has no photo for a slot, drawn on the spot;
 * the records come from docs/design-system/sample-content/*.json; the contract clauses say they are sample text awaiting legal review,
 * and no payment, SMS or provider is touched. Records are created through the
 * product's own services wherever one exists, so what the pages show is data the
 * product would itself accept; paid-only rows (finder subscriptions, ad
 * packages) are written directly because there is no free path.
 *
 * It refuses to run anywhere but a local development database. It can be run
 * again: people and dogs are found by their mobile and name, records from the
 * sample content by their name or address, and a photo is attached only when
 * the record does not already hold a file with the same SHA-256 — so a re-run
 * adds nothing, and a database seeded by an older version of this script gets
 * the photos on the records it already has. To start over, restore the
 * backup taken before it first ran.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { chromium, type Browser } from 'playwright';
import { createDatabase, type Database } from '../client.ts';
import { loadEnv } from '../../config/env.ts';
import type { Actor } from '../../authz/actor.ts';
import type { AccountId } from '../../domain/ids.ts';
import { updateSetting, snapshotSetting } from '../../settings/service.ts';
import { localTestSmsSender } from '../../adapters/registry.ts';
// Marketplace
import { attachListingMedia, createListing, publishListing, removeListingMedia, saveListing } from '../../marketplace/listings.ts';
// Photos
import { attachPublicImage, type PublicImageKind } from '../../media/public-image.ts';
import { attachAnimalPhoto } from '../../animals/service.ts';
import { referenceBreeds } from '../schema/core.ts';
import { changeBreedStatus, updateBreedProfile } from '../../breeds/service.ts';
import { createInquiry, postMessage as postInquiryMessage } from '../../marketplace/inquiries.ts';
// Shop
import { acceptSellerAgreement, decideSellerApplication, saveSellerApplication, startSellerApplication, submitSellerApplication } from '../../commerce/sellers.ts';
import { ensureLaunchPlans, startPlanPurchase } from '../../commerce/plans.ts';
import { addProductImage, addVariant, createProduct, decideProduct, submitProduct } from '../../commerce/catalog.ts';
import { addSku, createOffer, moveOffer } from '../../commerce/inventory.ts';
import { leaveReview } from '../../commerce/reviews.ts';
import { answerQuestion, askQuestion, decideQuestion } from '../../commerce/questions.ts';
// Directory and content
import { createUnownedVetProfile } from '../../vets/onboarding.ts';
import { changeCentreStatus, createCentre, setCentreLicence, updateCentreProfile } from '../../centres/service.ts';
import { addCommunityEvent, changeCommunityStatus, createCommunity, setCommunityPublisher, updateCommunityProfile } from '../../communities/service.ts';
import { changeCommunityPostStatus, createCommunityPost, updateCommunityPost } from '../../communities/posts.ts';
import { attachContentImage, changeContentStatus, createContent, updateContent } from '../../content/service.ts';
// Mating finder
import { publishPlan } from '../../finder/plans.ts';
import { publishRule } from '../../finder/rules.ts';
import { activateProfile, addProfileMedia, declareFertility } from '../../finder/profiles.ts';
import { saveSearch, toggleFavorite } from '../../finder/discovery.ts';
import { createRequest, respondToRequest } from '../../finder/requests.ts';
import { postMessage as postFinderMessage } from '../../finder/conversation.ts';
import { confirmContract, contractView, publishTemplate, requestContractCode, startContract } from '../../finder/contracts.ts';
import { handoffContract } from '../../finder/downstream.ts';
import { confirmDateOn, declareDateOn, personalMatingForParty, personalSubject } from '../../mating/dates.ts';
import { submitFinderReport } from '../../finder/reports.ts';
import { REQUIRED_CLAUSE_FA, REQUIRED_CLAUSE_KEYS } from '../../finder/request-model.ts';
import { addDays, todayCivil } from '../../domain/calendar.ts';

const env = loadEnv();
const host = new URL(env.DATABASE_URL).hostname;
if (env.APP_ENV !== 'development' || env.INTEGRATION_MODE !== 'local' || !['127.0.0.1', 'localhost'].includes(host)) {
  console.error('demo data runs only against a local development database (APP_ENV=development, INTEGRATION_MODE=local, localhost).');
  process.exit(1);
}

const { db, pool } = createDatabase(env.DATABASE_URL);
const ROOT = env.PRIVATE_STORAGE_DIR;
const as = (id: string, context: Actor['context'] = 'USER'): Actor => ({ accountId: id as AccountId, context, activeRoles: [] });
const one = async <T,>(q: ReturnType<typeof sql>) => (await db.execute<T & Record<string, unknown>>(q)).rows[0] as T;
const sink: Array<{ to: string; text: string }> = [];
const sms = localTestSmsSender(sink, env);
const report: string[] = [];
let browser: Browser | null = null;

async function section(name: string, work: () => Promise<string>) {
  try {
    const done = await work();
    report.push('✓ ' + name + ': ' + done);
  } catch (error) {
    report.push('✗ ' + name + ': ' + (error instanceof Error ? error.message : String(error)));
  }
}

// ── pictures, drawn locally ───────────────────────────────────────────────────

const GRADIENTS = [
  ['#f6d365', '#fda085'], ['#a1c4fd', '#c2e9fb'], ['#d4fc79', '#96e6a1'], ['#fbc2eb', '#a6c1ee'],
  ['#fddb92', '#d1fdff'], ['#e0c3fc', '#8ec5fc'], ['#f093fb', '#f5576c'], ['#43e97b', '#38f9d7'],
];
async function picture(emoji: string, label: string, n: number): Promise<Uint8Array> {
  browser ??= await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const [a, b] = GRADIENTS[n % GRADIENTS.length]!;
  await page.setContent(
    `<body style="margin:0"><div style="width:800px;height:600px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:linear-gradient(135deg,${a},${b});font-family:Tahoma,sans-serif;direction:rtl">` +
      `<div style="font-size:240px;line-height:1">${emoji}</div><div style="font-size:44px;color:#2b2b2b">${label}</div>` +
      `<div style="font-size:20px;color:#555">تصویر نمونه — همزیست</div></div></body>`,
  );
  const bytes = await page.screenshot({ type: 'jpeg', quality: 82 });
  await page.close();
  return new Uint8Array(bytes);
}

// ── approved photos and sample content from the design system ────────────────

const DS_ROOT = path.join(import.meta.dirname, '../../../docs/design-system');
const dsJson = <T,>(file: string): T => JSON.parse(readFileSync(path.join(DS_ROOT, file), 'utf8')) as T;
type ManifestImage = { slot: string; file: string; altFa: string };
const MANIFEST = dsJson<{ images: ManifestImage[] }>('demo-content/images-manifest.json').images;
/** Slots whose photo is now held by a record, for the 78/78 count. */
const placed = new Set<string>();

function approved(slot: string) {
  const image = MANIFEST.find((i) => i.slot === slot);
  if (!image) throw new Error('تصویر «' + slot + '» در manifest نیست');
  const bytes = new Uint8Array(readFileSync(path.join(DS_ROOT, image.file)));
  return { slot, bytes, altFa: image.altFa, originalName: path.basename(image.file), sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** Runs each record on its own, so one refusal does not stop the rest; returns the refusals. */
async function eachRecord<T>(items: readonly T[], label: (item: T) => string, work: (item: T, i: number) => Promise<void>): Promise<string> {
  const failed: string[] = [];
  for (const [i, item] of items.entries()) {
    try {
      await work(item, i);
    } catch (error) {
      failed.push(label(item) + ': ' + (error instanceof Error ? error.message : String(error)));
    }
  }
  return failed.length === 0 ? '' : ' — رد شد: ' + failed.join('؛ ');
}

/** Breed, centre, vet and community images: replaced only when the record holds a different file. */
async function placePublicImage(admin: Actor, kind: PublicImageKind, table: string, id: string, slot: string) {
  const photo = approved(slot);
  const row = await one<{ version: number; sha: string | null }>(
    sql`select t.version, f.sha256 as sha from ${sql.raw(table)} t left join stored_file f on f.id = t.image_file_id where t.id = ${id}::uuid`,
  );
  if (row.sha !== photo.sha256) {
    await attachPublicImage(db, ROOT, admin, { kind, recordId: id, expectedVersion: row.version, bytes: photo.bytes, originalName: photo.originalName, altFa: photo.altFa });
  }
  placed.add(slot);
}

async function placeContentImage(editor: Actor, id: string, slot: string) {
  const photo = approved(slot);
  const row = await one<{ version: number; sha: string | null }>(
    sql`select c.version, f.sha256 as sha from content_item c left join stored_file f on f.id = c.image_file_id where c.id = ${id}::uuid`,
  );
  if (row.sha !== photo.sha256) {
    await attachContentImage(db, ROOT, editor, { contentId: id, expectedVersion: row.version, bytes: photo.bytes, originalName: photo.originalName, altFa: photo.altFa });
  }
  placed.add(slot);
}

// ── settings, as the superadmin would set them ───────────────────────────────

async function setting(admin: Actor, key: string, value: unknown) {
  const current = await snapshotSetting(db, key).catch(() => null);
  if (current && JSON.stringify(current.value) === JSON.stringify(value)) return;
  await updateSetting(db, admin, { key, value, reason: 'داده نمایشی محلی', expectedVersion: current?.version });
}

// ── the people ───────────────────────────────────────────────────────────────

const PEOPLE = [
  { first: 'آرش', last: 'نمونه‌پور', city: 'تهران' },
  { first: 'مهسا', last: 'آزمایشی', city: 'تهران' },
  { first: 'کیان', last: 'نمایشی', city: 'کرج' },
  { first: 'نگار', last: 'فرضی‌زاده', city: 'اصفهان' },
  { first: 'بهرام', last: 'آزمون‌فر', city: 'شیراز' },
  { first: 'لیلا', last: 'نمونه‌دوست', city: 'مشهد' },
  { first: 'فروشگاه', last: 'پت‌نما', city: 'تهران' },
  { first: 'فروشگاه', last: 'دوست‌پت', city: 'اصفهان' },
];

async function person(i: number, cities: Map<string, { id: string; province: string }>) {
  const mobile = '09990001' + String(i + 1).padStart(3, '0');
  const p = PEOPLE[i]!;
  const existing = (await db.execute<{ id: string }>(sql`select id from account where mobile = ${mobile}`)).rows[0];
  const city0 = cities.get(p.city)!;
  if (existing) return { id: existing.id, mobile, name: p.first + ' ' + p.last, city: p.city, cityId: city0.id, province: city0.province };
  const city = cities.get(p.city)!;
  const id = await db.transaction(async (tx) => {
    const [row] = (await tx.execute<{ id: string }>(sql`insert into account (mobile, status) values (${mobile}, 'ACTIVE') returning id`)).rows;
    const id = row!.id;
    await tx.execute(sql`insert into profile (account_id, first_name, last_name, display_name, national_id, birth_date)
      values (${id}::uuid, ${p.first}, ${p.last}, ${p.first + ' ' + p.last}, ${'09' + String(10000000 + i * 7919).slice(0, 8)}, ${'1988-05-0' + String((i % 9) + 1)}::date)`);
    await tx.execute(sql`insert into kyc_case (account_id, status) values (${id}::uuid, 'APPROVED') on conflict (account_id) do update set status = 'APPROVED'`);
    await tx.execute(sql`insert into membership (account_id, status, lifetime) values (${id}::uuid, 'ACTIVE', true) on conflict do nothing`);
    await tx.execute(sql`insert into residence (account_id, province, city, address, postal_code)
      values (${id}::uuid, (select name_fa from province where code = ${city.province}), ${p.city}, ${'خیابان نمونه، کوچه ' + (i + 1) + ' (نشانی نمایشی)'}, '1234567890') on conflict (account_id) do nothing`);
    return id;
  });
  return { id, mobile, name: p.first + ' ' + p.last, city: p.city, cityId: city.id, province: city.province };
}

type Person = Awaited<ReturnType<typeof person>>;

let chipSeq = 0;
async function dog(owner: Person, name: string, sex: 'MALE' | 'FEMALE', breedId: string, born: string) {
  const found = (await db.execute<{ id: string }>(sql`select id from animal where owner_account_id = ${owner.id}::uuid and name = ${name} limit 1`)).rows[0];
  if (found) return found.id;
  const [a] = (await db.execute<{ id: string }>(sql`insert into animal (owner_account_id, status, species, name, sex, breed_id, birth_date, color, markings)
    values (${owner.id}::uuid, 'REGISTERED', 'DOG', ${name}, ${sex}, ${breedId}::uuid, ${born}, 'قهوه‌ای', 'بدون نشانه خاص') returning id`)).rows;
  chipSeq += 1;
  await db.execute(sql`insert into microchip (animal_id, number, read_method, bound_via, bound_by_account_id)
    values (${a!.id}::uuid, ${'98510' + randomBytes(4).readUInt32BE(0).toString().padStart(10, '0').slice(0, 10)}, 'MANUAL', 'EXISTING_UNREGISTERED', ${owner.id}::uuid)`);
  return a!.id;
}

// ── run ──────────────────────────────────────────────────────────────────────

try {
  const adminRow = await one<{ id: string } | undefined>(sql`select a.id from account a join account_role r on r.account_id = a.id where r.role = 'SUPERADMIN' limit 1`);
  if (!adminRow) throw new Error('run `npm run db:seed -- --dev` first: no superadmin account exists');
  const admin = as(adminRow.id, 'SUPERADMIN');
  const cityRows = (await db.execute<{ id: string; name_fa: string; province_code: string }>(sql`select id, name_fa, province_code from city where name_fa in ('تهران','کرج','اصفهان','شیراز','مشهد','تبریز')`)).rows;
  const cities = new Map(cityRows.map((c) => [c.name_fa, { id: c.id, province: c.province_code }]));
  const breeds = (await db.execute<{ id: string; name_fa: string }>(sql`select id, name_fa from reference_breed where species_code = 'DOG' and is_active order by sort_order limit 8`)).rows;

  // Settings the demo needs, all reversible from the admin panels.
  await section('تنظیمات', async () => {
    const values: Array<[string, unknown]> = [
      ['market.flag.animal_market_enabled', true],
      ['market.flag.animal_listing_creation_enabled', true],
      ['market.animal.listing_duration_days', 60],
      ['market.flag.seller_onboarding_enabled', true],
      ['market.shop.seller_agreement_version', 'نسخه نمایشی ۱'],
      ['market.shop.seller_plan_basic_monthly_toman', '0'],
      // Demo only: a small fixed commission (the deposit equals it and must be above zero);
      // the real tariff is an operator decision.
      ['market.animal.commission_fixed_toman', '50000'],
      ['market.animal.commission_percent_bp', 0],
      ['finder.capacity.free_owner', 2],
      ...['discovery', 'free_pool_visibility', 'subscription_purchase', 'requests', 'chat', 'contracts', 'official_handoff', 'personal_handoff', 'notifications'].map(
        (f) => ['finder.flag.' + f, true] as [string, unknown],
      ),
    ];
    for (const [key, value] of values) await setting(admin, key, value);
    return values.length + ' تنظیم';
  });

  const people: Person[] = [];
  for (let i = 0; i < PEOPLE.length; i += 1) people.push(await person(i, cities));
  report.push('✓ کاربران نمایشی: ' + people.map((p) => p.mobile + ' ' + p.name).join('، '));

  // Two dogs per owner (the first six people).
  const dogs: Array<{ id: string; owner: Person; name: string; sex: 'MALE' | 'FEMALE'; breed: string }> = [];
  const NAMES = [['رکس', 'MALE'], ['نازی', 'FEMALE'], ['تایگر', 'MALE'], ['پرنسس', 'FEMALE'], ['بارون', 'MALE'], ['لونا', 'FEMALE'], ['مکس', 'MALE'], ['بلا', 'FEMALE'], ['راکی', 'MALE'], ['گلی', 'FEMALE'], ['زئوس', 'MALE'], ['مای', 'FEMALE']] as const;
  for (let i = 0; i < 12; i += 1) {
    const owner = people[Math.floor(i / 2)]!;
    const breed = breeds[Math.floor(i / 4) % breeds.length]!;
    const [name, sex] = NAMES[i]!;
    const id = await dog(owner, name, sex, breed.id, '202' + (1 + (i % 3)) + '-0' + ((i % 8) + 1) + '-15');
    dogs.push({ id, owner, name, sex, breed: breed.name_fa });
  }
  report.push('✓ سگ‌های نمایشی: ' + dogs.length + ' با میکروچیپ');

  // ── Breeds: the taxonomy profile, the approved photo and a public page ─────
  await section('نژادها', async () => {
    type SampleBreed = {
      slug: string; nameFa: string; nameEn: string; fciGroup: number; size: string; originCountry?: string; altNames?: string[];
      coat?: string; energy?: string; trainability?: string; careNeed?: string; withChildren?: string; withOtherAnimals?: string;
      historyFa?: string; image: { slot: string };
    };
    const list = dsJson<{ breeds: SampleBreed[] }>('sample-content/taxonomy.json').breeds;
    const groups = new Map((await db.execute<{ id: string; fci_group: number }>(sql`select id, fci_group from breed_group where species_code = 'DOG'`)).rows.map((g) => [Number(g.fci_group), g.id]));
    // The sample names the country in Persian; the profile stores the ISO code.
    const COUNTRY: Record<string, string> = { 'آلمان': 'DE', 'ایران': 'IR' };
    let published = 0;
    const failed = await eachRecord(list, (b) => b.slug, async (b) => {
      let [current] = await db.select().from(referenceBreeds).where(eq(referenceBreeds.slug, b.slug)).limit(1);
      if (!current) throw new Error('این نژاد در بانک نژاد نیست');
      // Only the two sample breeds carry a history; the others get a short line that says it is sample text.
      const historyFa = b.historyFa ?? current.historyFa ?? (current.standardFa ? null : b.nameFa + ' (' + b.nameEn + ') در گروه ' + b.fciGroup + ' رده‌بندی FCI قرار دارد. (متن نمایشی؛ تاریخچه کامل را ویراستار بانک نژاد می‌نویسد.)');
      current = await updateBreedProfile(db, admin, {
        breedId: current.id, expectedVersion: current.version, nameFa: current.nameFa, nameEn: current.nameEn, slug: current.slug,
        altNames: b.altNames ?? current.altNames ?? [], speciesCode: current.speciesCode, groupId: groups.get(b.fciGroup) ?? current.groupId,
        originCountry: (b.originCountry && COUNTRY[b.originCountry]) ?? current.originCountry, size: b.size ?? current.size, coat: b.coat ?? current.coat,
        energy: b.energy ?? current.energy, trainability: b.trainability ?? current.trainability, careNeed: b.careNeed ?? current.careNeed,
        withChildren: b.withChildren ?? current.withChildren, withOtherAnimals: b.withOtherAnimals ?? current.withOtherAnimals,
        historyFa, standardFa: current.standardFa, standardUrl: current.standardUrl,
      });
      await placePublicImage(admin, 'BREED', 'reference_breed', current.id, b.image.slot);
      const fresh = await one<{ version: number; profile_status: string }>(sql`select version, profile_status from reference_breed where id = ${current.id}::uuid`);
      if (fresh.profile_status !== 'PUBLISHED') {
        await changeBreedStatus(db, admin, { breedId: current.id, expectedVersion: fresh.version, to: 'PUBLISHED', reason: 'داده نمایشی' });
      }
      published += 1;
    });
    return published + ' نژاد با مشخصات، تصویر و صفحه منتشرشده' + failed;
  });

  // ── Animal marketplace ─────────────────────────────────────────────────────
  // The six sample adverts, each on its own dog so the finder profiles stay with their owners.
  // Two approved photos per advert; the product asks for at least three, so the third is still drawn.
  await section('بازار حیوان', async () => {
    type SampleListing = {
      animalName: string; breedFa: string; sexFa: string; priceMode: string; price: { toman: number }; city: string;
      vaccinationStatus: string; neuterStatus: string; media: Array<{ slot: string }>;
    };
    const list = dsJson<{ listings: SampleListing[] }>('sample-content/marketplace.json').listings;
    // Birth dates from the sample's «ageFa», counted back from 14 Mehr 1405.
    const BORN = ['2026-07-06', '2026-07-28', '2026-02-06', '2024-10-06', '2026-07-14', '2026-06-06'];
    let created = 0;
    let photographed = 0;
    const failed = await eachRecord(list, (l) => l.animalName, async (l, i) => {
      const breed = await one<{ id: string } | undefined>(sql`select id from reference_breed where name_fa = ${l.breedFa} and is_active limit 1`);
      if (!breed) throw new Error('نژاد «' + l.breedFa + '» نیست');
      let listing = await one<{ id: string; seller: string } | undefined>(sql`select l.id, l.seller_account_id as seller from animal_listing l join animal a on a.id = l.animal_id join account c on c.id = l.seller_account_id
        where c.mobile like '09990001%' and a.name = ${l.animalName} and l.status not in ('REMOVED') order by l.created_at limit 1`);
      if (!listing) {
        const seller = people[i % 6]!;
        const city = cities.get(l.city) ?? { id: seller.cityId, province: seller.province };
        const animalId = await dog(seller, l.animalName, l.sexFa === 'ماده' ? 'FEMALE' : 'MALE', breed.id, BORN[i] ?? '2025-06-10');
        const actor = as(seller.id);
        const draft = await createListing(db, actor, { animalId });
        await saveListing(db, actor, {
          listingId: draft.id,
          expectedVersion: draft.version,
          priceMode: l.priceMode,
          priceToman: String(l.price.toman),
          descriptionFa: 'این آگهی نمایشی است. ' + l.animalName + ' سالم، پرانرژی و اجتماعی است، به غذای خشک عادت دارد و با کودکان سازگار است.',
          reasonForSaleFa: 'نمایشی — جابه‌جایی محل زندگی',
          provinceCode: city.province,
          cityId: city.id,
          vaccinationStatus: l.vaccinationStatus,
          neuterStatus: l.neuterStatus,
          healthNoteFa: 'واکسن‌ها طبق دفترچه (نمایشی)',
          deliveryMethods: ['IN_PERSON', 'SELLER_LOCATION'],
        } as never);
        listing = { id: draft.id, seller: seller.id };
        created += 1;
      }
      const actor = as(listing.seller);
      for (const m of l.media) {
        const photo = approved(m.slot);
        const has = await one<{ n: number }>(sql`select count(*)::int as n from animal_listing_media m join stored_file f on f.id = m.file_id where m.listing_id = ${listing.id}::uuid and f.sha256 = ${photo.sha256}`);
        if (has.n === 0) {
          await attachListingMedia(db, ROOT, actor, { listingId: listing.id, kind: 'IMAGE', bytes: photo.bytes, originalName: photo.originalName, altFa: photo.altFa });
          photographed += 1;
        }
        placed.add(m.slot);
      }
      // Drawn pictures left over from an older run: beyond the product's minimum they go, and one that sorts
      // ahead of the approved photos (it would be the cover) is swapped for a fresh one at the end.
      const minimum = Number((await one<{ v: unknown } | undefined>(sql`select value as v from product_setting where key = 'market.animal.min_listing_photos'`))?.v ?? 3);
      const images = (await db.execute<{ id: string; drawn: boolean }>(sql`select m.id, (f.original_name like 'demo-%') as drawn from animal_listing_media m join stored_file f on f.id = m.file_id
        where m.listing_id = ${listing.id}::uuid and m.kind = 'IMAGE' order by m.sort_order`)).rows;
      const drawnPicture = async (n: number) =>
        attachListingMedia(db, ROOT, actor, { listingId: listing.id, kind: 'IMAGE', bytes: await picture('🐶', l.breedFa, i + n), originalName: 'demo-' + i + '-' + n + '.jpg', altFa: 'تصویر نمایشی ' + l.breedFa });
      const firstApproved = images.findIndex((m) => !m.drawn);
      let count = images.length;
      for (const [k, m] of images.entries()) {
        if (!m.drawn) continue;
        const leading = firstApproved >= 0 && k < firstApproved;
        if (!leading && count <= minimum) continue;
        if (count <= minimum) {
          await drawnPicture(count);
          count += 1;
        }
        await removeListingMedia(db, actor, { listingId: listing.id, mediaId: m.id });
        count -= 1;
      }
      for (; count < minimum; count += 1) await drawnPicture(count);
      const current = await one<{ version: number; status: string }>(sql`select version, status from animal_listing where id = ${listing.id}::uuid`);
      if (current.status === 'DRAFT') await publishListing(db, actor, { listingId: listing.id, expectedVersion: current.version });
    });
    return created + ' آگهی تازه، ' + photographed + ' تصویر تأییدشده افزوده شد' + failed;
  });

  await section('گفت‌وگوی خرید', async () => {
    if ((await one<{ n: number }>(sql`select count(*)::int as n from listing_inquiry i join account a on a.id = i.buyer_account_id where a.mobile like '09990001%'`)).n > 0) return 'از قبل هست؛ رد شد';
    // Two buyers ask about the first two sellers' adverts.
    for (const [sellerIndex, buyerIndex] of [[0, 3], [1, 4]] as const) {
      const listing = await one<{ id: string }>(sql`select id from animal_listing where seller_account_id = ${people[sellerIndex]!.id}::uuid and status = 'PUBLISHED' limit 1`);
      const inquiry = await createInquiry(db, as(people[buyerIndex]!.id), { listingId: listing.id, messageFa: 'سلام، این آگهی هنوز در دسترس است؟ (نمایشی)' });
      await postInquiryMessage(db, ROOT, as(people[sellerIndex]!.id), { inquiryId: inquiry.id, bodyFa: 'سلام، بله در دسترس است. (نمایشی)', file: null });
    }
    return '۲ گفت‌وگوی خرید';
  });

  // ── Shop ───────────────────────────────────────────────────────────────────
  const categories = new Map((await db.execute<{ id: string; code: string }>(sql`select id, code from product_category`)).rows.map((c) => [c.code, c.id]));
  await section('فروشگاه', async () => {
    if ((await one<{ n: number }>(sql`select count(*)::int as n from commerce_seller s join account a on a.id = s.owner_account_id where a.mobile like '09990001%'`)).n > 0) return 'از قبل هست؛ رد شد';
    await ensureLaunchPlans(db, admin);
    const basic = await one<{ id: string }>(sql`select id from seller_plan where code = 'BASIC' order by version desc limit 1`);
    for (const [s, owner] of [people[6]!, people[7]!].entries()) {
      const actor = as(owner.id);
      const draft = await startSellerApplication(db, actor, { kind: 'PET_SHOP', displayNameFa: owner.name });
      const saved = await saveSellerApplication(db, actor, {
        sellerId: draft.id,
        expectedVersion: draft.version,
        displayNameFa: owner.name,
        legalNameFa: owner.name + ' (نمایشی)',
        businessTypeFa: 'فروشگاه لوازم حیوانات',
        nationalIdentifier: '1400' + String(1000000 + s * 17).slice(0, 7),
        representativeNameFa: owner.name,
        representativePhone: owner.mobile,
        contactEmail: 'shop' + (s + 1) + '@example.invalid',
        licenceKindFa: 'پروانه کسب',
        licenceNumber: 'DEMO-' + (s + 1),
        licenceIssuedOn: '2025-01-01',
        licenceExpiresOn: '2028-01-01',
        provinceCode: owner.province,
        cityId: owner.cityId,
        addressFa: 'خیابان نمونه، پلاک ' + (s + 10) + ' (نشانی نمایشی)',
        postalCode: '1234567890',
        settlementIban: 'IR' + String(s + 1).repeat(1).padStart(2, '0') + '0'.repeat(20) + String(s + 12),
        settlementHolderNameFa: owner.name,
        shippingPolicyFa: 'ارسال به همه شهرها در ۲ تا ۵ روز کاری (نمایشی).',
        returnPolicyFa: 'تا ۷ روز امکان مرجوعی کالای سالم (نمایشی).',
      });
      await acceptSellerAgreement(db, actor, { sellerId: draft.id });
      const v1 = await one<{ version: number }>(sql`select version from commerce_seller where id = ${draft.id}::uuid`);
      await submitSellerApplication(db, actor, { sellerId: draft.id, expectedVersion: v1.version });
      const v2 = await one<{ version: number }>(sql`select version from commerce_seller where id = ${draft.id}::uuid`);
      await decideSellerApplication(db, admin, { sellerId: draft.id, to: 'UNDER_REVIEW', expectedVersion: v2.version } as never);
      const v3 = await one<{ version: number }>(sql`select version from commerce_seller where id = ${draft.id}::uuid`);
      await decideSellerApplication(db, admin, { sellerId: draft.id, to: 'APPROVED', expectedVersion: v3.version } as never);
      await startPlanPurchase(db, actor, { sellerId: draft.id, planId: basic.id } as never);
      void saved;
    }
    return '۲ فروشگاه فعال';
  });

  // The eight sample products: the first shop sells what «پت‌شاپ آریا» sells, the second the rest.
  const shopOf = async (owner: Person) => one<{ id: string } | undefined>(sql`select id from commerce_seller where owner_account_id = ${owner.id}::uuid order by created_at limit 1`);
  await section('کالاها', async () => {
    type SampleProduct = {
      nameFa: string; brandFa: string; categoryFa: string;
      offers: Array<{ sellerFa: string; skus: Array<{ sku: string; labelFa: string; price: { toman: number }; stockOnHand: number }> }>;
      media: Array<{ slot: string }>;
    };
    const list = dsJson<{ products: SampleProduct[] }>('sample-content/shop.json').products;
    // The sample's categories mapped onto the launch taxonomy, with the variant axis each one asks for.
    const CATEGORY: Record<string, [string, string]> = {
      'غذای خشک': ['DRY_FOOD', 'weight'], 'تشویقی و مکمل': ['DRY_FOOD', 'weight'], 'قلاده و افسار': ['ACCESSORY', 'size'],
      'اسباب‌بازی': ['TOY', 'size'], 'بهداشت و آرایش': ['GROOMING', 'volume'], 'لوازم خواب و حمل': ['ACCESSORY', 'size'],
    };
    const shops = [await shopOf(people[6]!), await shopOf(people[7]!)];
    if (!shops[0] || !shops[1]) return 'فروشگاه نمایشی نیست؛ رد شد';
    let created = 0;
    const failed = await eachRecord(list, (p) => p.nameFa, async (p) => {
      const s = p.offers[0]?.sellerFa === 'پت‌شاپ آریا' ? 0 : 1;
      const sellerId = shops[s]!.id;
      const actor = as(people[6 + s]!.id);
      let product = await one<{ id: string } | undefined>(sql`select id from commerce_product where name_fa = ${p.nameFa} and owner_seller_id = ${sellerId}::uuid limit 1`);
      const [code, axis] = CATEGORY[p.categoryFa] ?? ['ACCESSORY', 'size'];
      if (!product) {
        product = await createProduct(db, actor, { sellerId, categoryId: categories.get(code)!, nameFa: p.nameFa, brandFa: p.brandFa, descriptionFa: p.nameFa + ' — کالای نمایشی برای دیدن ظاهر فروشگاه.', speciesCodes: ['DOG'] } as never);
        created += 1;
      }
      const productId = product!.id;
      for (const m of p.media) {
        const photo = approved(m.slot);
        const has = await one<{ n: number }>(sql`select count(*)::int as n from product_media m join stored_file f on f.id = m.file_id where m.product_id = ${productId}::uuid and f.sha256 = ${photo.sha256}`);
        if (has.n === 0) await addProductImage(db, ROOT, actor, { sellerId, productId, altFa: photo.altFa, bytes: photo.bytes, originalName: photo.originalName });
        placed.add(m.slot);
      }
      const state = await one<{ status: string; version: number }>(sql`select status, version from commerce_product where id = ${productId}::uuid`);
      if (state.status !== 'DRAFT') return;
      const skus = p.offers[0]?.skus ?? [];
      const variants: string[] = [];
      for (const sku of skus) variants.push(((await addVariant(db, actor, { sellerId, productId, attributes: { [axis]: sku.labelFa } })) as { id: string }).id);
      await submitProduct(db, actor, { sellerId, productId, expectedVersion: state.version } as never);
      const pv = await one<{ version: number }>(sql`select version from commerce_product where id = ${productId}::uuid`);
      await decideProduct(db, admin, { productId, to: 'PUBLISHED', expectedVersion: pv.version } as never);
      const offer = await createOffer(db, actor, { sellerId, productId, condition: 'NEW', shipsToWholeCountry: true, shippingNoteFa: 'ارسال پستی' } as never);
      for (const [k, sku] of skus.entries()) {
        await addSku(db, actor, { offerId: offer.id, variantId: variants[k]!, sku: sku.sku, priceToman: BigInt(sku.price.toman), initialStock: sku.stockOnHand } as never);
      }
      const ov = await one<{ version: number }>(sql`select version from seller_offer where id = ${offer.id}::uuid`);
      await moveOffer(db, actor, { offerId: offer.id, to: 'ACTIVE', expectedVersion: ov.version } as never);
    });
    return created + ' کالای تازه؛ تصویر تأییدشده روی هر ۸ کالا' + failed;
  });

  await section('سفارش و نظر نمونه', async () => {
    if ((await one<{ n: number }>(sql`select count(*)::int as n from commerce_order where reference = 'DEMO-ORD-1'`)).n > 0) return 'از قبل هست؛ رد شد';
    // A delivered order from the first demo person, so a review and the order pages have something.
    const buyer = people[0]!;
    const seller = await shopOf(people[6]!);
    const product = await one<{ id: string } | undefined>(sql`select id from commerce_product where name_fa = 'غذای خشک سگ بالغ نژاد بزرگ' and status = 'PUBLISHED' limit 1`);
    if (!seller || !product) return 'کالای نمایشی نیست؛ رد شد';
    const first = { id: product.id, seller: seller.id, owner: people[6]! };
    const sku = await one<{ id: string; sku: string; price: string }>(sql`select s.id, s.sku, s.price_toman::text as price from offer_sku s join seller_offer o on o.id = s.offer_id where o.product_id = ${first.id}::uuid limit 1`);
    const price = BigInt(sku.price);
    const order = await one<{ id: string }>(sql`insert into commerce_order (buyer_account_id, reference, status, items_total_toman, discount_total_toman, shipping_total_toman, grand_total_toman, recipient_name_fa, recipient_phone, address_fa, holds_expire_at)
      values (${buyer.id}::uuid, 'DEMO-ORD-1', 'PAID', ${price}, 0, 50000, ${price + 50000n}, ${buyer.name}, ${buyer.mobile}, 'نشانی نمایشی', now() + interval '1 hour') returning id`);
    const sub = await one<{ id: string }>(sql`insert into commerce_suborder (order_id, seller_id, reference, status, items_total_toman, discount_toman, shipping_toman, buyer_total_toman, commission_percent_bp, commission_toman, payout_toman)
      values (${order.id}::uuid, ${first.seller}::uuid, 'DEMO-SUB-1', 'DELIVERED', ${price}, 0, 50000, ${price + 50000n}, 0, 0, ${price + 50000n}) returning id`);
    const productName = await one<{ n: string }>(sql`select name_fa as n from commerce_product where id = ${first.id}::uuid`);
    await db.execute(sql`insert into commerce_order_item (suborder_id, offer_sku_id, product_id, quantity, unit_price_toman, discount_toman, line_total_toman, product_name_fa, sku_code, condition_code, seller_name_fa)
      values (${sub.id}::uuid, ${sku.id}::uuid, ${first.id}::uuid, 1, ${price}, 0, ${price}, ${productName.n}, ${sku.sku}, 'NEW', ${first.owner.name})`);
    await leaveReview(db, as(buyer.id), { subOrderId: sub.id, productId: first.id, scoreOne: 5, scoreTwo: 4, scoreThree: 5, bodyFa: 'کیفیت خوب و ارسال سریع بود. (نظر نمایشی)' } as never);
    const q = await askQuestion(db, as(people[1]!.id), { productId: first.id, bodyFa: 'این غذا برای نژادهای بزرگ هم مناسب است؟ (نمایشی)' });
    await decideQuestion(db, admin, { questionId: q.id, to: 'PUBLISHED', reasonFa: 'نمایشی' } as never);
    await answerQuestion(db, as(first.owner.id), { questionId: q.id, answerFa: 'بله، برای همه اندازه‌ها مناسب است. (نمایشی)' });
    return '۱ سفارش تحویل‌شده با نظر، ۱ پرسش و پاسخ';
  });

  // ── Directory and content (directory.json, content.json) ───────────────────
  type Directory = {
    vets: Array<{ displayNameFa: string; city: string; councilCode: string; headlineFa: string; image: { slot: string } }>;
    centres: Array<{ displayNameFa: string; typeFa: string; city: string; services: string[]; facilities: string[]; licenceStatus?: string; image: { slot: string } }>;
    communities: Array<{ kind: 'ASSOCIATION' | 'CLUB'; displayNameFa: string; scope: string; aboutFa: string; canPublishPosts: boolean; image: { slot: string }; events: Array<{ titleFa: string; at: { iso: string }; placeFa: string }> }>;
  };
  const directory = dsJson<Directory>('sample-content/directory.json');
  // Cities the sample places a provincial community in; the sample itself names only the scope.
  const COMMUNITY_CITY: Record<string, string> = { 'انجمن دوستداران حیوانات خانگی اصفهان': 'اصفهان', 'کلاب رتریورهای تهران': 'تهران' };

  await section('دامپزشکان', async () => {
    let created = 0;
    const failed = await eachRecord(directory.vets, (v) => v.displayNameFa, async (v) => {
      let vet = await one<{ id: string } | undefined>(sql`select id from vet_profile where display_name_fa = ${v.displayNameFa} order by created_at limit 1`);
      if (!vet) {
        const city = cities.get(v.city) ?? cities.get('تهران')!;
        vet = await createUnownedVetProfile(db, admin, { displayNameFa: v.displayNameFa, cityId: city.id, contactFa: v.headlineFa + ' (نمایشی)', sourceFa: 'داده نمایشی محلی', councilCode: v.councilCode, reason: 'داده نمایشی', confirmedNotDuplicate: true });
        created += 1;
      }
      await placePublicImage(admin, 'VET_PROFILE', 'vet_profile', vet!.id, v.image.slot);
    });
    return created + ' پروفایل تازه؛ ' + directory.vets.length + ' دامپزشک با تصویر' + failed;
  });

  await section('مراکز', async () => {
    const codeOf = async (table: string) => new Map((await db.execute<{ code: string; name_fa: string }>(sql`select code, name_fa from ${sql.raw(table)}`)).rows.map((r) => [r.name_fa, r.code]));
    const [types, services, facilities] = [await codeOf('centre_type'), await codeOf('centre_service'), await codeOf('centre_facility')];
    let created = 0;
    const failed = await eachRecord(directory.centres, (c) => c.displayNameFa, async (c) => {
      let centre = await one<{ id: string } | undefined>(sql`select id from centre where display_name_fa = ${c.displayNameFa} order by created_at limit 1`);
      if (!centre) {
        const typeCode = types.get(c.typeFa) ?? 'OTHER';
        const draft = await createCentre(db, admin, { typeCode, displayNameFa: c.displayNameFa, cityId: (cities.get(c.city) ?? cities.get('تهران')!).id, contactFa: 'تلفن نمایشی', sourceFa: 'داده نمایشی محلی', reason: 'داده نمایشی', confirmedNotDuplicate: true });
        const profiled = await updateCentreProfile(db, admin, {
          centreId: draft.id, expectedVersion: draft.version, typeCode, displayNameFa: c.displayNameFa,
          aboutFa: c.typeFa + ' نمایشی در ' + c.city + '؛ این معرفی برای دیدن ظاهر صفحه نوشته شده است.', phone: null, websiteUrl: null,
          serviceCodes: c.services.map((s) => services.get(s)).filter((s): s is string => !!s),
          speciesCodes: ['DOG'],
          facilityCodes: c.facilities.map((s) => facilities.get(s)).filter((s): s is string => !!s),
          reason: 'داده نمایشی',
        });
        await changeCentreStatus(db, admin, { centreId: draft.id, expectedVersion: profiled.version, to: 'PUBLISHED', reason: 'داده نمایشی' } as never);
        centre = draft;
        created += 1;
      }
      await placePublicImage(admin, 'CENTRE', 'centre', centre!.id, c.image.slot);
      // The licence the sample gives each centre (one is expired, so it leaves public results — decision 10).
      const current = await one<{ licence_status: string; version: number } | undefined>(sql`select licence_status, version from centre where id = ${centre!.id}`);
      if (c.licenceStatus && current && current.licence_status !== c.licenceStatus) {
        await setCentreLicence(db, admin, { centreId: centre!.id, expectedVersion: current.version, licenceNumber: 'DEMO-' + centre!.id.slice(0, 8), licenceStatus: c.licenceStatus, reason: 'داده نمایشی' });
      }
    });
    return created + ' مرکز تازه؛ ' + directory.centres.length + ' مرکز با تصویر' + failed;
  });

  await section('انجمن‌ها و کلاب‌ها', async () => {
    let created = 0;
    let events = 0;
    const failed = await eachRecord(directory.communities, (c) => c.displayNameFa, async (c) => {
      let community = await one<{ id: string } | undefined>(sql`select id from community where display_name_fa = ${c.displayNameFa} order by created_at limit 1`);
      if (!community) {
        const draft = await createCommunity(db, admin, { kind: c.kind, displayNameFa: c.displayNameFa, sourceFa: 'داده نمایشی محلی', reason: 'داده نمایشی' } as never);
        const city = c.scope === 'NATIONAL' ? null : (cities.get(COMMUNITY_CITY[c.displayNameFa] ?? 'تهران') ?? null);
        const updated = await updateCommunityProfile(db, admin, {
          communityId: draft.id, expectedVersion: draft.version, displayNameFa: c.displayNameFa, aboutFa: c.aboutFa, scope: c.scope,
          provinceCode: city?.province ?? null, cityId: null,
          membershipInfoFa: 'عضویت نمایشی', membershipUrl: null, contactPhone: '02100000000', websiteUrl: null, speciesCodes: ['DOG'], breedIds: [], reason: 'داده نمایشی',
        } as never);
        const live = await changeCommunityStatus(db, admin, { communityId: draft.id, expectedVersion: updated.version, to: 'PUBLISHED', reason: 'داده نمایشی' });
        if (c.kind === 'CLUB' && c.canPublishPosts) {
          await setCommunityPublisher(db, admin, { communityId: draft.id, expectedVersion: live.version, canPublishPosts: true, reason: 'داده نمایشی' });
        }
        for (const e of c.events) {
          await addCommunityEvent(db, admin, draft.id, { titleFa: e.titleFa, startsOn: e.at.iso.slice(0, 10), placeFa: e.placeFa, descriptionFa: 'رویداد نمایشی', status: 'PUBLISHED', reason: 'داده نمایشی' } as never);
          events += 1;
        }
        community = draft;
        created += 1;
      }
      await placePublicImage(admin, 'COMMUNITY', 'community', community!.id, c.image.slot);
    });
    return created + ' انجمن و کلاب تازه، ' + events + ' رویداد؛ ' + directory.communities.length + ' با تصویر' + failed;
  });

  await section('مقاله، خبر، اطلاعیه و نوشته کلاب', async () => {
    const editorRow = await one<{ id: string } | undefined>(sql`select a.id from account a join account_role r on r.account_id = a.id where r.role = 'CONTENT_ADMIN' limit 1`);
    if (!editorRow) return 'حساب ادمین محتوا نیست؛ رد شد';
    const editor = as(editorRow.id, 'CONTENT_ADMIN');
    type SampleContent = {
      slug: string; kind: 'ARTICLE' | 'NEWS' | 'ANNOUNCEMENT' | 'CLUB_POST'; categoryFa: string; titleFa: string; summaryFa: string;
      publishAt: { iso: string }; reviewedOn: { iso: string } | null; tags: string[]; image: { slot: string };
    };
    const list = dsJson<SampleContent[]>('sample-content/content.json');
    const categoryIds = new Map((await db.execute<{ id: string; name_fa: string }>(sql`select id, name_fa from content_category`)).rows.map((c) => [c.name_fa, c.id]));
    const hasPhoto = (slot: string) => MANIFEST.some((i) => i.slot === slot);
    const bodyOf = (c: SampleContent) => c.summaryFa + '\n\nاین متن برای نمایش ظاهر سامانه نوشته شده و محتوای تخصصی یا توصیه واقعی نیست. پاراگراف دوم نمونه برای دیدن فاصله‌ها و خوانایی متن فارسی در صفحه است.';
    let created = 0;
    const failed = await eachRecord(list, (c) => c.slug, async (c) => {
      if (c.kind === 'CLUB_POST') {
        // A club post is written for its club; the club has no manager yet, so the superadmin writes it.
        const club = await one<{ id: string } | undefined>(sql`select id from community where display_name_fa = ${c.categoryFa} order by created_at limit 1`);
        if (!club) throw new Error('کلاب «' + c.categoryFa + '» نیست');
        let post = await one<{ id: string } | undefined>(sql`select id from content_item where kind = 'CLUB_POST' and community_id = ${club.id}::uuid and title_fa = ${c.titleFa} limit 1`);
        if (!post) {
          const draft = await createCommunityPost(db, admin, { communityId: club.id, titleFa: c.titleFa });
          const saved = await updateCommunityPost(db, admin, { postId: draft.id, expectedVersion: draft.version, titleFa: c.titleFa, summaryFa: c.summaryFa, bodyFa: bodyOf(c) });
          await changeCommunityPostStatus(db, admin, { postId: draft.id, expectedVersion: saved.version, to: 'PUBLISHED' });
          post = draft;
          created += 1;
        }
        if (hasPhoto(c.image.slot)) await placeContentImage(editor, post!.id, c.image.slot);
        return;
      }
      // Found by its address, or — when an earlier run stopped half-way — as the draft with its title.
      const item = await one<{ id: string; version: number; status: string } | undefined>(sql`select id, version, status from content_item
        where kind = ${c.kind} and (slug = ${c.slug} or (status = 'DRAFT' and title_fa = ${c.titleFa})) order by (slug = ${c.slug}) desc, created_at limit 1`);
      if (item && item.status !== 'DRAFT') {
        if (hasPhoto(c.image.slot)) await placeContentImage(editor, item.id, c.image.slot);
        return;
      }
      const draft = item ?? (await createContent(db, editor, { kind: c.kind, titleFa: c.titleFa, confirmDuplicate: true }));
      await updateContent(db, editor, {
        contentId: draft.id, expectedVersion: draft.version, slug: c.slug, titleFa: c.titleFa, summaryFa: c.summaryFa, bodyFa: bodyOf(c),
        sourcesText: c.kind === 'ARTICLE' ? 'منبع نمایشی|https://example.invalid/source' : '', tagsText: c.tags.join('،'),
        categoryId: categoryIds.get(c.categoryFa) ?? null, speciesCode: 'DOG', breedId: null,
        // The review date must lie in the past; without one in the sample, the day before publication.
        imageAltFa: null, seoTitle: null, seoDescription: null, reviewedOn: c.kind === 'ARTICLE' ? (c.reviewedOn?.iso ?? addDays(c.publishAt.iso.slice(0, 10), -1)) : null,
      });
      // Announcements have no photo by design; everything else gets its approved one before it goes public.
      if (hasPhoto(c.image.slot)) await placeContentImage(editor, draft.id, c.image.slot);
      const current = await one<{ version: number }>(sql`select version from content_item where id = ${draft.id}::uuid`);
      await changeContentStatus(db, editor, { contentId: draft.id, expectedVersion: current.version, to: 'PUBLISHED', publishAt: new Date(c.publishAt.iso) });
      created += 1;
    });
    return created + ' محتوای تازه از ' + list.length + failed;
  });

  // ── Animals of the fixture accounts (animals.json) ─────────────────────────
  // acc-owner-* belong to the fixture owner, acc-breeder-* to the fixture breeder, so signing in as either shows them.
  await section('حیوان‌های حساب‌های نمونه', async () => {
    type SampleAnimal = {
      name: string; species: 'DOG' | 'CAT'; breedId: string | null; sex: 'MALE' | 'FEMALE'; birthDate: { iso: string }; color: string;
      ownerAccountId: string; status: 'REGISTERED' | 'DRAFT'; microchipNumber: string | null; draftStep: number | null; photo: { slot: string };
    };
    const list = dsJson<SampleAnimal[]>('sample-content/animals.json');
    let created = 0;
    const failed = await eachRecord(list, (a) => a.name, async (a) => {
      const mobile = a.ownerAccountId.startsWith('acc-breeder') ? '09990000002' : '09990000001';
      const owner = await one<{ id: string } | undefined>(sql`select id from account where mobile = ${mobile}`);
      if (!owner) throw new Error('حساب نمونه ' + mobile + ' نیست؛ اول npm run db:seed -- --dev');
      let animal = await one<{ id: string } | undefined>(sql`select id from animal where owner_account_id = ${owner.id}::uuid and name = ${a.name} limit 1`);
      if (!animal) {
        const breed = a.breedId ? await one<{ id: string } | undefined>(sql`select id from reference_breed where slug = ${a.breedId.replace(/^breed-/, '')}`) : undefined;
        animal = await one<{ id: string }>(sql`insert into animal (owner_account_id, status, species, name, sex, breed_id, birth_date, color, markings, draft_step)
          values (${owner.id}::uuid, ${a.status}, ${a.species}, ${a.name}, ${a.sex}, ${breed?.id ?? null}::uuid, ${a.birthDate.iso}, ${a.color}, 'بدون نشانه خاص', ${a.status === 'DRAFT' ? (a.draftStep ?? 1) : 6}) returning id`);
        if (a.status === 'REGISTERED' && a.microchipNumber) {
          await db.execute(sql`insert into microchip (animal_id, number, read_method, bound_via, bound_by_account_id)
            values (${animal.id}::uuid, ${a.microchipNumber}, 'MANUAL', 'EXISTING_UNREGISTERED', ${owner.id}::uuid)`);
        }
        created += 1;
      }
      const photo = approved(a.photo.slot);
      const held = await one<{ sha: string | null }>(sql`select f.sha256 as sha from animal x left join stored_file f on f.id = x.photo_file_id where x.id = ${animal.id}::uuid`);
      if (held.sha !== photo.sha256) await attachAnimalPhoto(db, ROOT, as(owner.id), animal.id, { bytes: photo.bytes, originalName: photo.originalName });
      placed.add(a.photo.slot);
    });
    return created + ' حیوان تازه؛ ' + list.length + ' حیوان با عکس' + failed;
  });

  // ── Mating finder ──────────────────────────────────────────────────────────
  await section('جفت‌یابی: طرح‌ها و قالب قرارداد', async () => {
    if ((await one<{ n: number }>(sql`select count(*)::int as n from finder_plan_version where status = 'PUBLISHED' and title_fa like 'طرح نمایشی%'`)).n > 0) return 'از قبل هست؛ رد شد';
    for (const [audience, titleFa, capacity, price] of [['OWNER', 'طرح نمایشی مالک — یک‌ساله', 3, '1500000'], ['KENNEL', 'طرح نمایشی کنل — یک‌ساله', 20, '9000000']] as const) {
      await publishPlan(db, admin, {
        audience, durationMonths: 12, titleFa, priceToman: price, activeAnimalCapacity: capacity, purchasableFrom: null, purchasableUntil: null,
        suspensionPolicy: 'PERIOD_CONTINUES_NO_REFUND', noteFa: 'قیمت نمایشی است، نه تعرفه واقعی', reasonFa: 'داده نمایشی', expectedCurrentVersion: 0,
      } as never);
    }
    const hasTemplate = await one<{ n: number }>(sql`select count(*)::int as n from finder_contract_template where status = 'PUBLISHED'`);
    if (hasTemplate.n === 0) {
      await publishTemplate(db, admin, {
        titleFa: 'قالب نمایشی قرارداد جفت‌گیری (متن نمونه — تأیید حقوقی نشده)',
        clauses: [
          ...REQUIRED_CLAUSE_KEYS.map((key) => ({ key, required: true, titleFa: REQUIRED_CLAUSE_FA[key], bodyFa: 'متن نمونه بند «' + REQUIRED_CLAUSE_FA[key] + '». این متن حقوقی نیست و فقط برای دیدن ظاهر قرارداد است.' })),
          { key: 'VISIT_BEFORE', required: false, titleFa: 'دیدار پیش از جفت‌گیری', bodyFa: 'متن نمونه بند اختیاری.' },
        ],
        reasonFa: 'داده نمایشی',
        expectedCurrentVersion: 0,
      });
    }
    return '۲ طرح، قالب قرارداد نمونه';
  });

  await section('جفت‌یابی: قاعده نژاد', async () => {
    // Demo only: an age range for the demo breeds so requests open; the cooldown is the confirmed baseline.
    let published = 0;
    for (const breed of breeds) {
      for (const sex of ['MALE', 'FEMALE'] as const) {
        const current = await one<{ v: number | null }>(sql`select max(version) as v from finder_breed_rule where breed_id = ${breed.id}::uuid and sex = ${sex}`);
        const live = await one<{ n: number }>(sql`select count(*)::int as n from finder_breed_rule where breed_id = ${breed.id}::uuid and sex = ${sex} and status = 'PUBLISHED' and min_age_months is not null`);
        if (live.n > 0) continue;
        await publishRule(db, admin, {
          speciesCode: 'DOG', breedId: breed.id, sex, minAgeMonths: 12, maxAgeMonths: 96,
          cooldownDays: sex === 'MALE' ? 14 : null, cooldownMonths: sex === 'FEMALE' ? 6 : null, cooldownMode: 'WARN',
          kinshipMaxDegree: 2, kinshipMode: 'WARN', warningFa: null, reasonFa: 'داده نمایشی', expectedCurrentVersion: Number(current.v ?? 0),
        });
        published += 1;
      }
    }
    return published + ' قاعده نمایشی (سن ۱۲ تا ۹۶ ماه)';
  });

  const finderProfiles: Array<{ dog: (typeof dogs)[number]; profileId: string }> = [];
  await section('جفت‌یابی: پروفایل‌ها', async () => {
    const plan = await one<{ id: string }>(sql`select id from finder_plan_version where audience = 'OWNER' and status = 'PUBLISHED' limit 1`);
    // The first four owners subscribe; the other two stay free (their dogs are visible only to subscribers while the pool is open).
    for (const owner of people.slice(0, 4)) {
      const has = (await one<{ n: number }>(sql`select count(*)::int as n from finder_subscription_period where account_id = ${owner.id}::uuid and status = 'ACTIVE'`)).n;
      if (has > 0) continue;
      await db.execute(sql`insert into finder_subscription_period (account_id, plan_version_id, audience, plan_version, duration_months, active_animal_capacity, price_toman, suspension_policy, kind, status, starts_at, ends_at)
        values (${owner.id}::uuid, ${plan.id}::uuid, 'OWNER', 1, 12, 3, 1500000, 'PERIOD_CONTINUES_NO_REFUND', 'INITIAL', 'ACTIVE', now() - interval '10 days', now() + interval '355 days')`);
    }
    for (const [i, d] of dogs.entries()) {
      const actor = as(d.owner.id);
      const live = (await db.execute<{ id: string }>(sql`select id from mating_profile where animal_id = ${d.id}::uuid and state <> 'INACTIVE'`)).rows[0];
      if (live) {
        finderProfiles.push({ dog: d, profileId: live.id });
        continue;
      }
      await declareFertility(db, actor, { animalId: d.id, status: 'NOT_STERILIZED', noteFa: 'اظهار نمایشی' });
      for (const role of ['FULL_BODY', 'FACE'] as const) {
        await addProfileMedia(db, ROOT, actor, { animalId: d.id, kind: 'IMAGE', role, bytes: await picture(role === 'FACE' ? '🐶' : '🐕', d.name + ' — ' + d.breed, i), originalName: d.name + '-' + role + '.jpg', altFa: 'تصویر نمایشی ' + d.name });
      }
      const profile = await activateProfile(db, actor, { animalId: d.id });
      finderProfiles.push({ dog: d, profileId: profile.id });
    }
    return finderProfiles.length + ' پروفایل فعال با تصویر، ۴ مالک مشترک';
  });

  await section('جفت‌یابی: درخواست، گفت‌وگو و قرارداد', async () => {
    if ((await one<{ n: number }>(sql`select count(*)::int as n from mating_request r join account a on a.id = r.sender_account_id where a.mobile like '09990001%'`)).n > 0) return 'از قبل هست؛ رد شد';
    const byOwner = (i: number, sex: 'MALE' | 'FEMALE') => finderProfiles.find((p) => p.dog.owner.id === people[i]!.id && p.dog.sex === sex)!;
    const request = (from: ReturnType<typeof byOwner>, to: ReturnType<typeof byOwner>, route: 'PERSONAL' | 'OFFICIAL' = 'PERSONAL') =>
      createRequest(db, as(from.dog.owner.id), {
        senderAnimalId: from.dog.id, receiverProfileId: to.profileId, route, windowFrom: todayCivil(), windowTo: addDays(todayCivil(), 25), cityFa: from.dog.owner.city,
        placeCategory: 'NEUTRAL', financialCategory: 'OFFSPRING_SHARE', messageFa: 'سلام، به نظرم این دو برای جفت‌گیری مناسب‌اند. (پیام نمایشی)', specialConditionsFa: null, expiresInDays: null,
      });
    // 1) waiting for review
    const same = (a: ReturnType<typeof byOwner>, b: ReturnType<typeof byOwner>) => a.dog.breed === b.dog.breed;
    const pairs: Array<[ReturnType<typeof byOwner>, ReturnType<typeof byOwner>]> = [];
    for (const m of finderProfiles.filter((p) => p.dog.sex === 'MALE')) {
      for (const f of finderProfiles.filter((p) => p.dog.sex === 'FEMALE')) {
        if (m.dog.owner.id !== f.dog.owner.id && same(m, f)) pairs.push([m, f]);
      }
    }
    const subscribed = new Set(people.slice(0, 4).map((p) => p.id));
    const usable = pairs.filter(([m]) => subscribed.has(m.dog.owner.id));
    const out: string[] = [];
    if (usable[0]) {
      await request(usable[0][0], usable[0][1]);
      out.push('۱ درخواست در انتظار');
    }
    // 2) accepted with a conversation
    if (usable[1]) {
      const [m, f] = usable[1];
      const r = await request(m, f);
      await respondToRequest(db, as(f.dog.owner.id), { requestId: r.id, expectedVersion: r.version, accept: true, reasonFa: null });
      await postFinderMessage(db, ROOT, as(f.dog.owner.id), { requestId: r.id, bodyFa: 'سلام! خوشحال می‌شوم. شماره من ۰۹۱۲۰۰۰۰۰۰۰ است. (نمایشی)', file: null });
      await postFinderMessage(db, ROOT, as(m.dog.owner.id), { requestId: r.id, bodyFa: 'عالی، هفته آینده هماهنگ کنیم. (نمایشی)', file: null });
      out.push('۱ گفت‌وگو (شماره تماس پنهان‌شده)');
    }
    // 3) confirmed contract, personal path, a mutually confirmed date
    if (usable[2]) {
      const [m, f] = usable[2];
      const r = await request(m, f);
      const accepted = await respondToRequest(db, as(f.dog.owner.id), { requestId: r.id, expectedVersion: r.version, accept: true, reasonFa: null });
      await startContract(db, as(m.dog.owner.id), { requestId: r.id, expectedVersion: accepted.version });
      const view = (await contractView(db, as(m.dog.owner.id), r.id))!;
      for (const party of [m.dog.owner, f.dog.owner]) {
        const { otpId } = await requestContractCode(db, as(party.id), sms, { contractId: view.contract.id, number: view.current.number });
        const code = [...sink].reverse().find((s) => s.to === party.mobile)!.text.slice(-6);
        await confirmContract(db, as(party.id), { contractId: view.contract.id, number: view.current.number, contentHash: view.current.contentHash, otpId, code, ip: null, userAgent: 'demo' });
      }
      const link = await handoffContract(db, as(m.dog.owner.id), { contractId: view.contract.id });
      const subject = personalSubject(await personalMatingForParty(db, as(m.dog.owner.id), link.personalMatingId!));
      const date = await declareDateOn(db, as(m.dog.owner.id), subject, { matedOn: addDays(todayCivil(), -3) });
      await confirmDateOn(db, as(f.dog.owner.id), subject, { declarationId: date.id, expectedVersion: date.version });
      out.push('۱ قرارداد تأییدشده با مسیر شخصی و تاریخ تأییدشده');
    }
    // Favourites, a saved search and a report for the queue.
    const viewer = people[0]!;
    const others = finderProfiles.filter((p) => p.dog.owner.id !== viewer.id).slice(0, 3);
    for (const p of others) await toggleFavorite(db, as(viewer.id), p.profileId);
    await saveSearch(db, as(viewer.id), { nameFa: 'ماده‌های نزدیک من (نمایشی)', raw: { sex: 'FEMALE' }, notify: true } as never);
    await submitFinderReport(db, ROOT, as(people[1]!.id), { target: 'PROFILE', id: others[others.length - 1]!.profileId, category: 'FALSE_ANIMAL_DATA', details: 'سن اعلام‌شده با تصویر نمی‌خواند. (گزارش نمایشی)' });
    out.push('۳ علاقه‌مندی، ۱ جست‌وجوی ذخیره‌شده، ۱ گزارش در صف');
    return out.join('، ');
  });

  await section('تبلیغ ویژه', async () => {
    if ((await one<{ n: number }>(sql`select count(*)::int as n from ad_subscription where target_type = 'VET'`)).n > 0) return 'از قبل هست؛ رد شد';
    const plan = await one<{ id: string } | undefined>(sql`select id from ad_plan order by created_at limit 1`);
    const vet = await one<{ id: string } | undefined>(sql`select id from vet_profile where display_name_fa = 'دکتر مریم صادقی' limit 1`);
    if (!plan || !vet) return 'بدون طرح یا دامپزشک؛ رد شد';
    await db.execute(sql`insert into ad_subscription (target_type, target_id, account_id, plan_id, status, starts_at, ends_at)
      values ('VET', ${vet.id}, ${admin.accountId}::uuid, ${plan.id}::uuid, 'ACTIVE', now() - interval '1 day', now() + interval '29 days')`);
    return '۱ بسته تبلیغ فعال برای دامپزشک نمایشی';
  });

  // How many of the approved photos a record now holds, and which are left and why.
  const left = MANIFEST.filter((i) => !placed.has(i.slot)).map((i) => i.slot);
  const byKind = new Map<string, [number, number]>();
  for (const i of MANIFEST) {
    const kind = i.slot.split('/')[0]!;
    const [done, all] = byKind.get(kind) ?? [0, 0];
    byKind.set(kind, [done + (placed.has(i.slot) ? 1 : 0), all + 1]);
  }
  report.push(
    (left.length === 0 ? '✓' : '•') + ' تصاویر تأییدشده روی رکورد: ' + placed.size + '/' + MANIFEST.length + ' (' + [...byKind].map(([k, [d, a]]) => k + ' ' + d + '/' + a).join('، ') + ')' +
      // people/*: the profile has no avatar column; home/*: the hero images belong to the page, not to a record.
      (left.length ? ' — بدون رکورد: ' + left.join('، ') : ''),
  );
} finally {
  await (browser as Browser | null)?.close();
  await pool.end();
  console.log(report.join('\n'));
}
