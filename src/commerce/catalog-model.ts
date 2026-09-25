/**
 * What the catalogue allows — PROMPT-009.
 *
 * Pure rules: the lifecycles, the canonical spelling of a variant, what a
 * category demands of a product, the one prohibition this phase carries, and
 * the arithmetic of stock. Stated once, so a screen and a transaction cannot
 * disagree about any of them.
 */

export const PRODUCT_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'MERGED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_FA: Record<ProductStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PENDING_REVIEW: 'در انتظار بررسی',
  PUBLISHED: 'منتشرشده',
  REJECTED: 'ردشده',
  MERGED: 'ادغام‌شده در محصول پایه',
};

export type ProductMover = 'SELLER' | 'REVIEWER';

interface ProductMove {
  readonly from: ProductStatus;
  readonly to: ProductStatus;
  readonly by: readonly ProductMover[];
}

/**
 * A seller-exclusive product is reviewed before it is published.
 *
 * Merging is a reviewer's act and is deliberately one-way: the row stays where
 * it is so its address and the orders that named it keep resolving, and it
 * points at the shared base it became part of.
 */
const PRODUCT_MOVES: readonly ProductMove[] = [
  { from: 'DRAFT', to: 'PENDING_REVIEW', by: ['SELLER'] },
  { from: 'PENDING_REVIEW', to: 'PUBLISHED', by: ['REVIEWER'] },
  { from: 'PENDING_REVIEW', to: 'REJECTED', by: ['REVIEWER'] },
  { from: 'PENDING_REVIEW', to: 'DRAFT', by: ['REVIEWER'] },
  { from: 'REJECTED', to: 'DRAFT', by: ['SELLER'] },
  { from: 'PUBLISHED', to: 'MERGED', by: ['REVIEWER'] },
  { from: 'PENDING_REVIEW', to: 'MERGED', by: ['REVIEWER'] },
];

export const canMoveProduct = (from: ProductStatus, to: ProductStatus, by: ProductMover): boolean =>
  PRODUCT_MOVES.some((move) => move.from === from && move.to === to && move.by.includes(by));

export const isProductEditable = (status: ProductStatus): boolean =>
  status === 'DRAFT' || status === 'REJECTED';

/** Only a published product is something the public may be shown. */
export const isProductPublic = (status: ProductStatus): boolean => status === 'PUBLISHED';

export const OFFER_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export type CommerceOfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_STATUS_FA: Record<CommerceOfferStatus, string> = {
  DRAFT: 'پیش‌نویس',
  ACTIVE: 'در حال فروش',
  PAUSED: 'موقتاً متوقف',
  ARCHIVED: 'بایگانی‌شده',
};

/** An archived offer is history; everything else a seller may still move. */
export const canMoveOffer = (from: CommerceOfferStatus, to: CommerceOfferStatus): boolean => {
  if (from === 'ARCHIVED') return false;
  if (from === to) return false;
  return ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'].includes(to);
};

export const OFFER_CONDITIONS = ['NEW', 'USED', 'REFURBISHED'] as const;
export type OfferCondition = (typeof OFFER_CONDITIONS)[number];
export const OFFER_CONDITION_FA: Record<OfferCondition, string> = {
  NEW: 'نو',
  USED: 'کارکرده',
  REFURBISHED: 'بازسازی‌شده',
};

// ── the one prohibition of this phase ──────────────────────────────────────

export const SALE_POLICIES = ['ALLOWED', 'BLOCKED_PHARMACEUTICAL'] as const;
export type SalePolicy = (typeof SALE_POLICIES)[number];

/**
 * Why medicine is not simply a category that is switched off.
 *
 * PRODUCT_DECISIONS says public pharmaceutical sale is outside this phase and
 * that enabling it later needs a separate legal and product decision. A flag an
 * operator could flip would misrepresent that as an operational choice, so the
 * prohibition is a value on the taxonomy and this sentence is what the refusal
 * says.
 */
export const PHARMACEUTICAL_BLOCK_FA =
  'فروش عمومی دارو در این فاز فعال نیست. این یک تنظیم عملیاتی نیست: فعال‌کردن آن به تصمیم حقوقی و محصولی جداگانه نیاز دارد و تا آن زمان ثبت کالا در این دسته ممکن نیست.';

export const isCategorySellable = (policy: SalePolicy, enabled: boolean): boolean =>
  policy === 'ALLOWED' && enabled;

// ── category attributes ────────────────────────────────────────────────────

export interface AttributeDefinition {
  readonly key: string;
  readonly labelFa: string;
  /** A value the product states once, or an axis its variants vary along. */
  readonly kind: 'SPECIFICATION' | 'VARIANT';
  readonly required?: boolean;
  /** When present, the only values this attribute accepts. */
  readonly options?: readonly string[];
}

export const variantAxes = (attributes: readonly AttributeDefinition[]): readonly AttributeDefinition[] =>
  attributes.filter((attribute) => attribute.kind === 'VARIANT');

export const specificationFields = (
  attributes: readonly AttributeDefinition[],
): readonly AttributeDefinition[] => attributes.filter((attribute) => attribute.kind === 'SPECIFICATION');

/**
 * Check what a product says against what its category asks for.
 *
 * An unknown key is refused rather than stored: a specification nobody defined
 * is a typo or somebody's private field, and either way it would not be
 * comparable with anything.
 */
export function specificationProblems(
  attributes: readonly AttributeDefinition[],
  values: Record<string, unknown>,
): readonly string[] {
  const problems: string[] = [];
  const known = new Map(specificationFields(attributes).map((attribute) => [attribute.key, attribute]));

  for (const attribute of known.values()) {
    const value = values[attribute.key];
    if (attribute.required && (value === undefined || value === null || String(value).trim() === '')) {
      problems.push('مقدار «' + attribute.labelFa + '» لازم است.');
      continue;
    }
    if (value !== undefined && attribute.options && !attribute.options.includes(String(value))) {
      problems.push('مقدار «' + attribute.labelFa + '» باید یکی از گزینه‌های تعریف‌شده باشد.');
    }
  }

  for (const key of Object.keys(values)) {
    if (!known.has(key)) problems.push('مشخصه «' + key + '» در این دسته تعریف نشده است.');
  }
  return problems;
}

// ── variants ───────────────────────────────────────────────────────────────

/**
 * The canonical spelling of one combination.
 *
 * Sorted by key and joined, so `{وزن: '۲ کیلو', طعم: 'مرغ'}` and the same pairs
 * in the other order are one variant rather than two — which is what the unique
 * index then compares.
 */
export function variantKey(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([key, value]) => [key.trim(), String(value).trim()] as const)
    .filter(([key, value]) => key !== '' && value !== '')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => key + '=' + value)
    .join('|');
}

/** The label a buyer reads: the values, in the order the category defines. */
export function variantLabel(
  axes: readonly AttributeDefinition[],
  attributes: Record<string, string>,
): string {
  const parts = axes
    .map((axis) => (attributes[axis.key] ? axis.labelFa + ' ' + attributes[axis.key] : null))
    .filter((part): part is string => part !== null);
  return parts.length === 0 ? 'تک‌نوع' : parts.join(' — ');
}

/** Everything wrong with a proposed variant, at once. */
export function variantProblems(
  axes: readonly AttributeDefinition[],
  attributes: Record<string, string>,
): readonly string[] {
  const problems: string[] = [];
  const known = new Map(axes.map((axis) => [axis.key, axis]));

  if (axes.length > 0 && Object.keys(attributes).length === 0) {
    problems.push('برای این دسته باید دست‌کم یک ویژگی تنوع (مثل وزن یا رنگ) مشخص شود.');
  }
  for (const [key, value] of Object.entries(attributes)) {
    const axis = known.get(key);
    if (!axis) {
      problems.push('ویژگی «' + key + '» در این دسته تنوع تعریف‌شده نیست.');
      continue;
    }
    if (String(value).trim() === '') problems.push('مقدار «' + axis.labelFa + '» خالی است.');
    if (axis.options && !axis.options.includes(String(value))) {
      problems.push('مقدار «' + axis.labelFa + '» باید یکی از گزینه‌های تعریف‌شده باشد.');
    }
  }
  return problems;
}

// ── stock ──────────────────────────────────────────────────────────────────

export interface StockState {
  readonly onHand: number;
  readonly reserved: number;
}

/** What somebody can actually buy right now. */
export const availableStock = (state: StockState): number => Math.max(state.onHand - state.reserved, 0);

export const canReserve = (state: StockState, quantity: number): boolean =>
  quantity > 0 && availableStock(state) >= quantity;

/** How a movement of each kind changes the two counters. */
export interface StockDelta {
  readonly onHand: number;
  readonly reserved: number;
}

export function moveDelta(kind: string, quantity: number): StockDelta {
  switch (kind) {
    case 'RECEIVE':
    case 'RETURN':
      return { onHand: quantity, reserved: 0 };
    case 'ADJUST':
      return { onHand: quantity, reserved: 0 };
    case 'RESERVE':
      return { onHand: 0, reserved: quantity };
    case 'RELEASE':
      return { onHand: 0, reserved: -quantity };
    // A sale takes the goods and the hold that was covering them.
    case 'SELL':
      return { onHand: -quantity, reserved: -quantity };
    default:
      return { onHand: 0, reserved: 0 };
  }
}

/** A hold is over when its moment passes; nothing has to run for that. */
export const reservationExpired = (expiresAt: Date, now: Date): boolean =>
  expiresAt.getTime() <= now.getTime();

// ── seller codes ───────────────────────────────────────────────────────────

const SKU_SHAPE = /^[A-Z0-9][A-Z0-9-]{1,31}$/;

/** A seller's own code: upper case, digits and dashes, and theirs alone. */
export const normaliseSku = (raw: string): string => raw.trim().toUpperCase().replace(/\s+/g, '-');
export const isSkuShape = (raw: string): boolean => SKU_SHAPE.test(normaliseSku(raw));

const BARCODE_SHAPE = /^[0-9]{8,14}$/;

/**
 * A barcode, as far as its shape.
 *
 * Eight to fourteen digits covers EAN-8 through GTIN-14. Whether the number is
 * registered to this article is not something this product can know, and it
 * does not claim to.
 */
export const normaliseBarcode = (raw: string): string =>
  raw
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\s-]/g, '');
export const isBarcodeShape = (raw: string): boolean => BARCODE_SHAPE.test(normaliseBarcode(raw));

// ── bulk tools, within safe limits ─────────────────────────────────────────

/**
 * How much one bulk action may touch.
 *
 * A ceiling exists so a slip in a spreadsheet cannot reprice a whole shop in
 * one click, and so a single request cannot hold a transaction open over
 * thousands of rows.
 */
export const BULK_LIMIT = 100;

/**
 * What a bulk price change may do.
 *
 * A change of more than half is refused rather than applied: at that size it is
 * far more likely to be a mistake than an intention, and an intended one can be
 * made in two steps.
 */
export const BULK_MAX_CHANGE_BP = 5_000;

export interface BulkPriceProblem {
  readonly skuId: string;
  readonly messageFa: string;
}

export function bulkPriceProblems(
  lines: readonly { skuId: string; currentToman: bigint; nextToman: bigint }[],
): readonly BulkPriceProblem[] {
  const problems: BulkPriceProblem[] = [];
  if (lines.length > BULK_LIMIT) {
    problems.push({
      skuId: '',
      messageFa: 'هر بار حداکثر ' + BULK_LIMIT.toLocaleString('fa-IR') + ' قلم تغییر می‌کند.',
    });
    return problems;
  }
  for (const line of lines) {
    if (line.nextToman <= 0n) {
      problems.push({ skuId: line.skuId, messageFa: 'قیمت باید بزرگ‌تر از صفر باشد.' });
      continue;
    }
    if (line.currentToman <= 0n) continue;
    const difference = line.nextToman > line.currentToman
      ? line.nextToman - line.currentToman
      : line.currentToman - line.nextToman;
    const changeBp = (difference * 10_000n) / line.currentToman;
    if (changeBp > BigInt(BULK_MAX_CHANGE_BP)) {
      problems.push({
        skuId: line.skuId,
        messageFa: 'تغییر قیمت بیش از ۵۰٪ است؛ برای پرهیز از اشتباه، این تغییر در یک مرحله اعمال نمی‌شود.',
      });
    }
  }
  return problems;
}

// ── what the public may be shown ───────────────────────────────────────────

export interface OfferComparison {
  readonly offerId: string;
  /** The line a basket actually holds: a price belongs to a variant, not an offer. */
  readonly skuId: string;
  readonly sellerId: string;
  readonly sellerNameFa: string;
  readonly priceToman: bigint;
  readonly available: number;
  readonly condition: OfferCondition;
}

/**
 * The order offers are compared in.
 *
 * Cheapest first among what is actually in stock, then by availability, then by
 * seller name so the order is stable. Nothing here knows which seller is the
 * platform's own: PRODUCT_DECISIONS §8 says Hamzist has no hidden ranking
 * privilege, and the way to keep that true is for this function to have no way
 * of telling.
 */
export function compareOffers(offers: readonly OfferComparison[]): readonly OfferComparison[] {
  return [...offers].sort((a, b) => {
    const aHas = a.available > 0 ? 0 : 1;
    const bHas = b.available > 0 ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    if (a.priceToman !== b.priceToman) return a.priceToman < b.priceToman ? -1 : 1;
    if (a.available !== b.available) return b.available - a.available;
    return a.sellerNameFa.localeCompare(b.sellerNameFa, 'fa');
  });
}

/** The public filters this catalogue supports, as a closed list. */
export const PRODUCT_SORTS = ['NEWEST', 'PRICE_ASC', 'PRICE_DESC'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];
export const isProductSort = (value: unknown): value is ProductSort =>
  typeof value === 'string' && (PRODUCT_SORTS as readonly string[]).includes(value);
