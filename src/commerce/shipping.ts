/**
 * How each shop delivers, and what it charges for it — PROMPT-011.
 *
 * A method is the shop's own commercial offer. The platform states a ceiling
 * and nothing else: where a shop delivers, how it prices and how long it
 * takes to prepare are facts only that shop knows, and inventing any of them
 * would be putting words in its mouth.
 *
 * A shop with no live method cannot be checked out from, and the basket says
 * so by name rather than quietly billing nothing.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { shippingMethods } from '../db/schema/fulfilment.ts';
import { offerSkus } from '../db/schema/catalog.ts';
import { provinces } from '../db/schema/geography.ts';
import { recordAudit } from '../audit/service.ts';
import { readMoney } from '../settings/service.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { assertSellerCapability } from './sellers.ts';
import {
  quoteShipping,
  SHIPPING_METHOD_KINDS,
  SHIPPING_PROBLEM_FA,
  type ShippingMethodKind,
  type ShippingMethodTerms,
  type ShippingQuoteProblem,
} from './fulfilment-model.ts';

export type ShippingMethodRow = typeof shippingMethods.$inferSelect;

export const MAX_SHIPPING_FEE_KEY = 'market.shop.max_shipping_fee_toman';
export const MAX_FREE_SHIPPING_THRESHOLD_KEY = 'market.shop.max_free_shipping_threshold_toman';

export interface ShippingMethodInput {
  readonly sellerId: string;
  readonly labelFa: string;
  readonly kind: ShippingMethodKind;
  readonly coverageKind: 'WHOLE_COUNTRY' | 'PROVINCES';
  readonly provinceCodes: readonly string[];
  readonly pricingKind: 'FIXED' | 'WEIGHT_BASED';
  readonly baseFeeToman: bigint;
  readonly perKgToman: bigint | null;
  readonly includedGrams: number | null;
  readonly freeThresholdToman: bigint | null;
  readonly preparationDays: number;
  readonly noteFa: string | null;
}

async function validated(database: DbClient, input: ShippingMethodInput): Promise<ShippingMethodInput> {
  const labelFa = input.labelFa.trim();
  if (labelFa.length < 2) throw validation('نام روش ارسال را بنویسید.');
  if (!SHIPPING_METHOD_KINDS.includes(input.kind)) throw validation('نوع روش ارسال معتبر نیست.');
  if (input.baseFeeToman < 0n) throw validation('هزینه ارسال نمی‌تواند منفی باشد.');
  if (!Number.isInteger(input.preparationDays) || input.preparationDays < 0 || input.preparationDays > 30) {
    throw validation('مهلت آماده‌سازی باید عددی بین صفر تا سی روز باشد.');
  }

  if (input.pricingKind === 'WEIGHT_BASED') {
    if (input.perKgToman === null || input.perKgToman < 0n) {
      throw validation('برای قیمت‌گذاری وزنی، نرخ هر کیلوگرم را بنویسید.');
    }
    if (input.includedGrams === null || !Number.isInteger(input.includedGrams) || input.includedGrams < 0) {
      throw validation('وزن شامل‌شده در هزینه پایه را بنویسید؛ صفر هم پذیرفته است.');
    }
  }

  let provinceCodes: readonly string[] = [];
  if (input.coverageKind === 'PROVINCES') {
    const wanted = [...new Set(input.provinceCodes.map((code) => code.trim()).filter(Boolean))];
    if (wanted.length === 0) throw validation('استان‌هایی که این روش به آن‌ها می‌رسد را انتخاب کنید.');
    // A coverage list of codes nothing recognises would silently reach nowhere.
    const known = await database
      .select({ code: provinces.code })
      .from(provinces)
      .where(inArray(provinces.code, wanted));
    if (known.length !== wanted.length) throw validation('یکی از استان‌های انتخاب‌شده شناخته نشد.');
    provinceCodes = wanted;
  }

  const ceiling = await readMoney(database, MAX_SHIPPING_FEE_KEY);
  if (ceiling.configured && input.baseFeeToman > ceiling.toman) {
    throw validation('سقف مجاز هزینه ارسال ' + ceiling.toman.toLocaleString('fa-IR') + ' تومان است.');
  }
  const thresholdCeiling = await readMoney(database, MAX_FREE_SHIPPING_THRESHOLD_KEY);
  if (
    input.freeThresholdToman !== null &&
    thresholdCeiling.configured &&
    input.freeThresholdToman > thresholdCeiling.toman
  ) {
    throw validation(
      'سقف مجاز حد نصاب ارسال رایگان ' + thresholdCeiling.toman.toLocaleString('fa-IR') + ' تومان است.',
    );
  }
  if (input.freeThresholdToman !== null && input.freeThresholdToman < 0n) {
    throw validation('حد نصاب ارسال رایگان نمی‌تواند منفی باشد.');
  }

  return { ...input, labelFa, provinceCodes };
}

/** Collection from the shop costs nothing to deliver, because nothing is delivered. */
const pickupFee = (input: ShippingMethodInput): ShippingMethodInput =>
  input.kind === 'PICKUP'
    ? { ...input, baseFeeToman: 0n, pricingKind: 'FIXED', perKgToman: null, includedGrams: null }
    : input;

export async function addShippingMethod(
  database: Database,
  actor: Actor,
  input: ShippingMethodInput,
): Promise<ShippingMethodRow> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_EDIT');
  const clean = pickupFee(await validated(database, input));

  const [row] = await database
    .insert(shippingMethods)
    .values({
      sellerId: clean.sellerId,
      labelFa: clean.labelFa,
      kind: clean.kind,
      coverageKind: clean.coverageKind,
      provinceCodes: clean.provinceCodes,
      pricingKind: clean.pricingKind,
      baseFeeToman: clean.baseFeeToman,
      perKgToman: clean.perKgToman,
      includedGrams: clean.includedGrams,
      freeThresholdToman: clean.freeThresholdToman,
      preparationDays: clean.preparationDays,
      noteFa: clean.noteFa,
    })
    .returning();

  await recordAudit(database, actor, {
    action: 'COMMERCE_SHIPPING_METHOD_ADDED',
    targetType: 'COMMERCE_SELLER',
    targetId: clean.sellerId,
    after: {
      methodId: row!.id,
      labelFa: clean.labelFa,
      kind: clean.kind,
      pricingKind: clean.pricingKind,
      baseFeeToman: clean.baseFeeToman.toString(),
    },
  });
  return row!;
}

/**
 * Retire a method without erasing it.
 *
 * Orders already placed under it keep their frozen copy of its name and
 * promise, so retiring one changes nothing about what anybody was told.
 */
export async function retireShippingMethod(
  database: Database,
  actor: Actor,
  input: { sellerId: string; methodId: string },
): Promise<void> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_EDIT');
  const [method] = await database
    .select()
    .from(shippingMethods)
    .where(and(eq(shippingMethods.id, input.methodId), eq(shippingMethods.sellerId, input.sellerId)))
    .limit(1);
  if (!method) throw notFound('این روش ارسال پیدا نشد.');
  if (!method.isActive) return;

  await database
    .update(shippingMethods)
    .set({ isActive: false, version: method.version + 1, updatedAt: new Date() })
    .where(eq(shippingMethods.id, method.id));

  await recordAudit(database, actor, {
    action: 'COMMERCE_SHIPPING_METHOD_RETIRED',
    targetType: 'COMMERCE_SELLER',
    targetId: input.sellerId,
    before: { methodId: method.id, labelFa: method.labelFa, isActive: true },
    after: { isActive: false },
  });
}

export async function shippingMethodsOf(
  database: DbClient,
  sellerId: string,
  includeRetired = false,
): Promise<readonly ShippingMethodRow[]> {
  return database
    .select()
    .from(shippingMethods)
    .where(
      includeRetired
        ? eq(shippingMethods.sellerId, sellerId)
        : and(eq(shippingMethods.sellerId, sellerId), eq(shippingMethods.isActive, true)),
    )
    .orderBy(asc(shippingMethods.labelFa));
}

export const termsOf = (row: ShippingMethodRow): ShippingMethodTerms => ({
  kind: row.kind as ShippingMethodKind,
  coverageKind: row.coverageKind as 'WHOLE_COUNTRY' | 'PROVINCES',
  provinceCodes: (row.provinceCodes ?? []) as readonly string[],
  pricingKind: row.pricingKind as 'FIXED' | 'WEIGHT_BASED',
  baseFeeToman: row.baseFeeToman,
  perKgToman: row.perKgToman,
  includedGrams: row.includedGrams,
  freeThresholdToman: row.freeThresholdToman,
  preparationDays: row.preparationDays,
});

export interface MethodOffer {
  readonly methodId: string;
  readonly labelFa: string;
  readonly kind: ShippingMethodKind;
  readonly preparationDays: number;
  readonly noteFa: string | null;
  readonly toman: bigint | null;
  readonly waived: boolean;
  /** Why this method cannot carry this basket, when it cannot. */
  readonly problem: ShippingQuoteProblem | null;
  readonly problemFa: string | null;
}

/**
 * Every way this shop could carry this basket, priced.
 *
 * A method that cannot is listed with its reason rather than hidden, because
 * "this shop does not deliver to your province" is something a buyer needs to
 * read, and an empty list says nothing at all.
 */
export async function methodOffersFor(
  database: Database,
  input: {
    sellerId: string;
    itemsTotalToman: bigint;
    /** One entry per basket line: two of a 2kg bag weigh 4kg, not 2kg. */
    lines: readonly { skuId: string; quantity: number }[];
    provinceCode: string | null;
  },
): Promise<readonly MethodOffer[]> {
  const methods = await shippingMethodsOf(database, input.sellerId);
  if (methods.length === 0) return [];

  const weights =
    input.lines.length === 0
      ? []
      : await database
          .select({ id: offerSkus.id, weightGrams: offerSkus.weightGrams })
          .from(offerSkus)
          .where(inArray(offerSkus.id, [...new Set(input.lines.map((line) => line.skuId))]));
  const weightOf = new Map(weights.map((row) => [row.id, row.weightGrams]));
  // A line weighs its unit weight times how many of it are being bought.
  const lineWeightsGrams = input.lines.map((line) => {
    const unit = weightOf.get(line.skuId);
    return unit === null || unit === undefined ? null : unit * line.quantity;
  });

  const ceiling = await readMoney(database, MAX_SHIPPING_FEE_KEY);

  return methods.map((method) => {
    const quote = quoteShipping({
      method: termsOf(method),
      itemsTotalToman: input.itemsTotalToman,
      lineWeightsGrams,
      provinceCode: input.provinceCode,
      ceilingToman: ceiling.configured ? ceiling.toman : null,
    });
    const failed = 'problem' in quote;
    return {
      methodId: method.id,
      labelFa: method.labelFa,
      kind: method.kind as ShippingMethodKind,
      preparationDays: method.preparationDays,
      noteFa: method.noteFa,
      toman: failed ? null : quote.toman,
      waived: failed ? false : quote.waived,
      problem: failed ? quote.problem : null,
      problemFa: failed ? SHIPPING_PROBLEM_FA[quote.problem] : null,
    };
  });
}

/**
 * The method this basket will actually be charged for.
 *
 * A chosen method that cannot carry the basket is refused by name; no choice
 * at all falls to the cheapest one that can, so a buyer who never touched the
 * picker is not charged the dearest. Nothing is ever picked that the quote
 * refused.
 */
export function chooseMethod(
  offers: readonly MethodOffer[],
  chosenId: string | null,
): { offer: MethodOffer } | { problemFa: string } {
  if (offers.length === 0) {
    return { problemFa: 'این فروشگاه هنوز هیچ روش ارسالی اعلام نکرده و خرید از آن ممکن نیست.' };
  }
  if (chosenId !== null) {
    const chosen = offers.find((offer) => offer.methodId === chosenId);
    if (!chosen) return { problemFa: 'روش ارسال انتخاب‌شده دیگر در دسترس نیست؛ دوباره انتخاب کنید.' };
    if (chosen.problem !== null) return { problemFa: chosen.problemFa! };
    return { offer: chosen };
  }
  const usable = offers.filter((offer) => offer.problem === null);
  if (usable.length === 0) {
    return { problemFa: offers[0]!.problemFa ?? 'هیچ روش ارسالی برای این سبد قابل استفاده نیست.' };
  }
  const cheapest = usable.reduce((best, offer) => (offer.toman! < best.toman! ? offer : best));
  return { offer: cheapest };
}

/** The weight a shop recorded for one line, which only weight-based pricing needs. */
export async function setSkuWeight(
  database: Database,
  actor: Actor,
  input: { sellerId: string; skuId: string; weightGrams: number | null },
): Promise<void> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_OPERATE');
  if (input.weightGrams !== null && (!Number.isInteger(input.weightGrams) || input.weightGrams <= 0)) {
    throw validation('وزن را به گرم و با عددی مثبت بنویسید.');
  }
  const { sellerOffers } = await import('../db/schema/catalog.ts');
  const [row] = await database
    .select({ id: offerSkus.id, sellerId: sellerOffers.sellerId })
    .from(offerSkus)
    .innerJoin(sellerOffers, eq(sellerOffers.id, offerSkus.offerId))
    .where(eq(offerSkus.id, input.skuId))
    .limit(1);
  if (!row || row.sellerId !== input.sellerId) throw notFound('این قلم کالا پیدا نشد.');

  await database
    .update(offerSkus)
    .set({ weightGrams: input.weightGrams, updatedAt: new Date() })
    .where(eq(offerSkus.id, input.skuId));
}

/** A shop that has stated at least one way of delivering may be sold from. */
export async function hasLiveMethod(database: DbClient, sellerId: string): Promise<boolean> {
  const rows = await database
    .select({ id: shippingMethods.id })
    .from(shippingMethods)
    .where(and(eq(shippingMethods.sellerId, sellerId), eq(shippingMethods.isActive, true)))
    .limit(1);
  return rows.length > 0;
}

export async function loadShippingMethod(database: DbClient, methodId: string): Promise<ShippingMethodRow> {
  const [row] = await database.select().from(shippingMethods).where(eq(shippingMethods.id, methodId)).limit(1);
  if (!row) throw conflict('این روش ارسال دیگر در دسترس نیست.');
  return row;
}
