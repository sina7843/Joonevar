/**
 * Local demo data — so every screen has something to show.
 *
 *   DATABASE_URL=… npm run db:demo
 *
 * Everything here is SYNTHETIC and labelled as such: the people are invented
 * (mobiles 09990001xxx: the reserved synthetic 0999 range, below the numbers random test accounts use), the photos are drawn on
 * the spot, the contract clauses say they are sample text awaiting legal review,
 * and no payment, SMS or provider is touched. Records are created through the
 * product's own services wherever one exists, so what the pages show is data the
 * product would itself accept; paid-only rows (finder subscriptions, ad
 * packages) are written directly because there is no free path.
 *
 * It refuses to run anywhere but a local development database. It can be run
 * again: people and dogs are found by their mobile and name, and each section
 * skips itself when its demo rows already exist. To start over, restore the
 * backup taken before it first ran.
 */
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { chromium, type Browser } from 'playwright';
import { createDatabase, type Database } from '../client.ts';
import { loadEnv } from '../../config/env.ts';
import type { Actor } from '../../authz/actor.ts';
import type { AccountId } from '../../domain/ids.ts';
import { updateSetting, snapshotSetting } from '../../settings/service.ts';
import { localTestSmsSender } from '../../adapters/registry.ts';
// Marketplace
import { attachListingMedia, createListing, publishListing, saveListing } from '../../marketplace/listings.ts';
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
import { changeCentreStatus, createCentre } from '../../centres/service.ts';
import { addCommunityEvent, changeCommunityStatus, createCommunity, updateCommunityProfile } from '../../communities/service.ts';
import { changeContentStatus, createContent, updateContent } from '../../content/service.ts';
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
  const cityRows = (await db.execute<{ id: string; name_fa: string; province_code: string }>(sql`select id, name_fa, province_code from city where name_fa in ('تهران','کرج','اصفهان','شیراز','مشهد')`)).rows;
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

  // ── Animal marketplace ─────────────────────────────────────────────────────
  // Separate dogs for sale, so the finder profiles stay with their owners.
  await section('بازار حیوان', async () => {
    if ((await one<{ n: number }>(sql`select count(*)::int as n from animal_listing l join account a on a.id = l.seller_account_id where a.mobile like '09990001%' and l.status = 'PUBLISHED'`)).n > 0) return 'از قبل هست؛ رد شد';
    let published = 0;
    for (let i = 0; i < 6; i += 1) {
      const seller = people[i]!;
      const breed = breeds[i % breeds.length]!;
      const animalId = await dog(seller, ['توله ' + breed.name_fa, 'شیرین', 'پاپی', 'جسی', 'آلفا', 'نیکی'][i]!, i % 2 ? 'FEMALE' : 'MALE', breed.id, '2025-0' + ((i % 6) + 1) + '-10');
      const actor = as(seller.id);
      const draft = await createListing(db, actor, { animalId });
      const saved = await saveListing(db, actor, {
        listingId: draft.id,
        expectedVersion: draft.version,
        priceMode: i % 3 === 2 ? 'NEGOTIABLE' : 'EXACT',
        priceToman: String((i + 3) * 4_500_000),
        descriptionFa: 'این آگهی نمایشی است. سگ ' + breed.name_fa + ' سالم، پرانرژی و اجتماعی، به غذای خشک عادت دارد و با کودکان سازگار است.',
        reasonForSaleFa: 'نمایشی — جابه‌جایی محل زندگی',
        provinceCode: seller.province,
        cityId: seller.cityId,
        vaccinationStatus: 'YES',
        neuterStatus: i % 2 ? 'NO' : 'UNKNOWN',
        healthNoteFa: 'واکسن‌ها طبق دفترچه (نمایشی)',
        deliveryMethods: ['IN_PERSON', 'SELLER_LOCATION'],
      });
      for (let k = 0; k < 3; k += 1) {
        await attachListingMedia(db, ROOT, actor, { listingId: draft.id, kind: 'IMAGE', bytes: await picture(['🐕', '🐶', '🦮'][k]!, breed.name_fa, i + k), originalName: 'demo-' + i + '-' + k + '.jpg', altFa: 'تصویر نمایشی ' + breed.name_fa });
      }
      const current = await one<{ version: number }>(sql`select version from animal_listing where id = ${draft.id}::uuid`);
      await publishListing(db, actor, { listingId: draft.id, expectedVersion: current.version });
      published += 1;
      void saved;
    }
    return published + ' آگهی منتشرشده با ۳ تصویر';
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
    const products: Array<{ id: string; seller: string; owner: Person }> = [];
    const CATALOG = [
      ['DRY_FOOD', 'غذای خشک سگ بالغ نمونه', '🦴', { weight: '۲ کیلوگرم' }, 850_000n],
      ['DRY_FOOD', 'غذای خشک توله‌سگ نمونه', '🍖', { weight: '۱ کیلوگرم' }, 520_000n],
      ['WET_FOOD', 'کنسرو گوشت سگ نمونه', '🥫', { weight: '۴۰۰ گرم' }, 95_000n],
      ['ACCESSORY', 'قلاده چرمی نمونه', '🦮', { size: 'متوسط' }, 380_000n],
      ['TOY', 'توپ جویدنی نمونه', '🎾', { size: 'کوچک' }, 120_000n],
      ['GROOMING', 'شامپو سگ نمونه', '🧴', { volume: '۲۵۰ میلی‌لیتر' }, 210_000n],
    ] as const;
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
      for (const [k, [code, nameFa, emoji, attributes, price]] of CATALOG.entries()) {
        if (k % 2 !== s) continue;
        const product = await createProduct(db, actor, { sellerId: draft.id, categoryId: categories.get(code)!, nameFa, brandFa: 'برند نمایشی', descriptionFa: nameFa + ' — کالای نمایشی برای دیدن ظاهر فروشگاه.', speciesCodes: ['DOG'] } as never);
        await addProductImage(db, ROOT, actor, { sellerId: draft.id, productId: product.id, altFa: nameFa, bytes: await picture(emoji, nameFa, k), originalName: 'product-' + k + '.jpg' });
        const variant = await addVariant(db, actor, { sellerId: draft.id, productId: product.id, attributes } as never);
        const pv = await one<{ version: number }>(sql`select version from commerce_product where id = ${product.id}::uuid`);
        await submitProduct(db, actor, { sellerId: draft.id, productId: product.id, expectedVersion: pv.version } as never);
        const pv2 = await one<{ version: number }>(sql`select version from commerce_product where id = ${product.id}::uuid`);
        await decideProduct(db, admin, { productId: product.id, to: 'PUBLISHED', expectedVersion: pv2.version } as never);
        const offer = await createOffer(db, actor, { sellerId: draft.id, productId: product.id, condition: 'NEW', shipsToWholeCountry: true, shippingNoteFa: 'ارسال پستی' } as never);
        await addSku(db, actor, { offerId: offer.id, variantId: (variant as { id: string }).id, sku: 'DEMO-' + s + '-' + k, priceToman: price, initialStock: 25 } as never);
        const ov = await one<{ version: number }>(sql`select version from seller_offer where id = ${offer.id}::uuid`);
        await moveOffer(db, actor, { offerId: offer.id, to: 'ACTIVE', expectedVersion: ov.version } as never);
        products.push({ id: product.id, seller: draft.id, owner });
      }
    }
    // A delivered order from the first demo person, so a review and the order pages have something.
    const buyer = people[0]!;
    const first = products[0]!;
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
    return '۲ فروشگاه فعال، ' + products.length + ' کالا با تصویر و موجودی، ۱ سفارش تحویل‌شده با نظر، ۱ پرسش و پاسخ';
  });

  // ── Directory and content ──────────────────────────────────────────────────
  await section('دامپزشکان', async () => {
    if ((await one<{ n: number }>(sql`select count(*)::int as n from vet_profile where display_name_fa = 'دکتر سارا نمونه'`)).n > 0) return 'از قبل هست؛ رد شد';
    const tehran = cities.get('تهران')!.id;
    const names = ['دکتر سارا نمونه', 'دکتر امید آزمایشی', 'دکتر رویا فرضی', 'دکتر پیمان نمایشی'];
    for (const [i, displayNameFa] of names.entries()) {
      await createUnownedVetProfile(db, admin, { displayNameFa, cityId: [...cities.values()][i % cities.size]!.id ?? tehran, contactFa: '۰۲۱-۰۰۰۰۰۰۰' + i + ' (نمایشی)', sourceFa: 'داده نمایشی محلی', councilCode: null, reason: 'داده نمایشی', confirmedNotDuplicate: true } as never);
    }
    return names.length + ' پروفایل دامپزشک';
  });

  await section('مراکز', async () => {
    if ((await one<{ n: number }>(sql`select count(*)::int as n from centre where display_name_fa = 'بیمارستان دامپزشکی نمونه'`)).n > 0) return 'از قبل هست؛ رد شد';
    const list = [['HOSPITAL', 'بیمارستان دامپزشکی نمونه'], ['CLINIC', 'کلینیک دامپزشکی آزمایشی'], ['LABORATORY', 'آزمایشگاه دامپزشکی نمایشی']] as const;
    for (const [i, [typeCode, displayNameFa]] of list.entries()) {
      const centre = await createCentre(db, admin, { typeCode, displayNameFa, cityId: [...cities.values()][i]!.id, contactFa: 'تلفن نمایشی', sourceFa: 'داده نمایشی محلی', reason: 'داده نمایشی' } as never);
      await changeCentreStatus(db, admin, { centreId: centre.id, expectedVersion: centre.version, to: 'PUBLISHED', reason: 'داده نمایشی' } as never);
    }
    return list.length + ' مرکز منتشرشده';
  });

  await section('انجمن‌ها و کلاب‌ها', async () => {
    if ((await one<{ n: number }>(sql`select count(*)::int as n from community where display_name_fa = 'انجمن نمونه پرورش‌دهندگان سگ'`)).n > 0) return 'از قبل هست؛ رد شد';
    const list = [
      ['ASSOCIATION', 'انجمن نمونه پرورش‌دهندگان سگ', 'انجمنی نمایشی برای هماهنگی پرورش‌دهندگان و ثبت رسمی.'],
      ['CLUB', 'کلاب نمونه ژرمن شپرد', 'کلاب نمایشی دوستداران ژرمن شپرد؛ دورهمی و آموزش.'],
      ['CLUB', 'کلاب نمونه رتریورها', 'کلاب نمایشی لابرادور و گلدن رتریور.'],
    ] as const;
    let first: string | null = null;
    for (const [kind, displayNameFa, aboutFa] of list) {
      const created = await createCommunity(db, admin, { kind, displayNameFa, sourceFa: 'داده نمایشی محلی', reason: 'داده نمایشی' } as never);
      const updated = await updateCommunityProfile(db, admin, {
        communityId: created.id, expectedVersion: created.version, displayNameFa, aboutFa, scope: 'NATIONAL', provinceCode: null, cityId: null,
        membershipInfoFa: 'عضویت نمایشی', membershipUrl: null, contactPhone: '02100000000', websiteUrl: null, speciesCodes: ['DOG'], breedIds: [], reason: 'داده نمایشی',
      });
      await changeCommunityStatus(db, admin, { communityId: created.id, expectedVersion: updated.version, to: 'PUBLISHED', reason: 'داده نمایشی' });
      first ??= created.id;
    }
    await addCommunityEvent(db, admin, first!, { titleFa: 'دورهمی نمایشی پرورش‌دهندگان', startsOn: addDays(todayCivil(), 20), placeFa: 'تهران، سالن نمونه', descriptionFa: 'رویداد نمایشی', status: 'PUBLISHED', reason: 'داده نمایشی' });
    return list.length + ' انجمن و کلاب، ۱ رویداد';
  });

  await section('مقاله و خبر', async () => {
    const editorRow = await one<{ id: string } | undefined>(sql`select a.id from account a join account_role r on r.account_id = a.id where r.role = 'CONTENT_ADMIN' limit 1`);
    if (!editorRow) return 'حساب ادمین محتوا نیست؛ رد شد';
    const editor = as(editorRow.id, 'CONTENT_ADMIN');
    if ((await one<{ n: number }>(sql`select count(*)::int as n from content_item where slug like 'demo-%'`)).n > 0) return 'از قبل هست؛ رد شد';
    const items = [
      ['ARTICLE', 'راهنمای نمونه تغذیه توله‌سگ'],
      ['ARTICLE', 'نکته‌های نمونه برای نخستین واکسن'],
      ['ARTICLE', 'آماده‌سازی نمونه پیش از جفت‌گیری'],
      ['NEWS', 'خبر نمایشی: راه‌اندازی جفت‌یابی همزیست'],
      ['NEWS', 'خبر نمایشی: نمایشگاه سگ‌های اصیل'],
    ] as const;
    for (const [i, [kind, titleFa]] of items.entries()) {
      const created = await createContent(db, editor, { kind, titleFa } as never);
      const updated = await updateContent(db, editor, {
        contentId: created.id, expectedVersion: created.version, slug: 'demo-' + kind.toLowerCase() + '-' + (i + 1), titleFa,
        summaryFa: 'این متن نمایشی است تا ظاهر صفحه دیده شود.',
        bodyFa: titleFa + '\n\nاین متن برای نمایش ظاهر سامانه نوشته شده و محتوای تخصصی یا توصیه واقعی نیست. پاراگراف دوم نمونه برای دیدن فاصله‌ها و خوانایی متن فارسی در صفحه است.',
        sourcesText: kind === 'ARTICLE' ? 'منبع نمایشی|https://example.invalid/source' : '', tagsText: 'نمایشی', categoryId: null, speciesCode: 'DOG', breedId: null,
        imageAltFa: null, seoTitle: null, seoDescription: null, reviewedOn: kind === 'ARTICLE' ? todayCivil() : null,
      });
      await changeContentStatus(db, editor, { contentId: created.id, expectedVersion: updated.version, to: 'PUBLISHED' } as never);
    }
    return items.length + ' مقاله و خبر منتشرشده';
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
    const vet = await one<{ id: string } | undefined>(sql`select id from vet_profile where display_name_fa like 'دکتر سارا نمونه%' limit 1`);
    if (!plan || !vet) return 'بدون طرح یا دامپزشک؛ رد شد';
    await db.execute(sql`insert into ad_subscription (target_type, target_id, account_id, plan_id, status, starts_at, ends_at)
      values ('VET', ${vet.id}, ${admin.accountId}::uuid, ${plan.id}::uuid, 'ACTIVE', now() - interval '1 day', now() + interval '29 days')`);
    return '۱ بسته تبلیغ فعال برای دامپزشک نمایشی';
  });
} finally {
  await (browser as Browser | null)?.close();
  await pool.end();
  console.log(report.join('\n'));
}
