/**
 * Animal listing rules — PROMPT-003.
 *
 * Pure functions over plain values: the lifecycle, what a listing must say
 * before it may be published, and the two age questions. No database and no
 * framework, so the same rules answer a screen, a server action and a test the
 * same way.
 */

export const LISTING_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'PAUSED',
  'RESERVED',
  'SOLD',
  'EXPIRED',
  'SUSPENDED',
  'REMOVED',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_STATUS_FA: Record<ListingStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشرشده',
  PAUSED: 'متوقف‌شده توسط فروشنده',
  RESERVED: 'رزروشده',
  SOLD: 'فروخته‌شده',
  EXPIRED: 'منقضی‌شده',
  SUSPENDED: 'متوقف‌شده توسط ناظر',
  REMOVED: 'حذف‌شده',
};

/**
 * Statuses that hold the animal.
 *
 * While a listing is in one of these, the same animal cannot be offered again.
 * A suspended listing is included on purpose: a moderator's hold must not be
 * escapable by starting a second advert. The database enforces this with a
 * partial unique index; this list is the same rule in readable form.
 */
export const LIVE_LISTING_STATUSES: readonly ListingStatus[] = [
  'DRAFT',
  'PUBLISHED',
  'PAUSED',
  'RESERVED',
  'SUSPENDED',
];

/** What the public may see. Only one status, deliberately. */
export const PUBLIC_LISTING_STATUSES: readonly ListingStatus[] = ['PUBLISHED', 'RESERVED'];

/** Who is making a transition. The same target status is not open to everyone. */
export type ListingMover = 'SELLER' | 'MODERATOR' | 'SYSTEM';

interface Transition {
  readonly from: ListingStatus;
  readonly to: ListingStatus;
  readonly by: readonly ListingMover[];
}

/**
 * Every state change that exists.
 *
 * RESERVED and SOLD are absent from the seller's column on purpose: a listing
 * becomes reserved only through a deposit the server verified (PROMPT-006) and
 * sold only through a completed handover (PROMPT-007), never by someone
 * pressing a button that claims it.
 */
const TRANSITIONS: readonly Transition[] = [
  { from: 'DRAFT', to: 'PUBLISHED', by: ['SELLER'] },
  { from: 'DRAFT', to: 'REMOVED', by: ['SELLER'] },
  { from: 'PUBLISHED', to: 'PAUSED', by: ['SELLER'] },
  { from: 'PUBLISHED', to: 'REMOVED', by: ['SELLER'] },
  { from: 'PUBLISHED', to: 'EXPIRED', by: ['SYSTEM'] },
  { from: 'PUBLISHED', to: 'RESERVED', by: ['SYSTEM'] },
  { from: 'PUBLISHED', to: 'SUSPENDED', by: ['MODERATOR'] },
  { from: 'PAUSED', to: 'PUBLISHED', by: ['SELLER'] },
  { from: 'PAUSED', to: 'REMOVED', by: ['SELLER'] },
  { from: 'PAUSED', to: 'EXPIRED', by: ['SYSTEM'] },
  { from: 'PAUSED', to: 'SUSPENDED', by: ['MODERATOR'] },
  { from: 'RESERVED', to: 'PUBLISHED', by: ['SYSTEM'] },
  { from: 'RESERVED', to: 'SOLD', by: ['SYSTEM'] },
  { from: 'RESERVED', to: 'SUSPENDED', by: ['MODERATOR'] },
  { from: 'EXPIRED', to: 'PUBLISHED', by: ['SELLER'] },
  { from: 'EXPIRED', to: 'REMOVED', by: ['SELLER'] },
  { from: 'SUSPENDED', to: 'PUBLISHED', by: ['MODERATOR'] },
  { from: 'SUSPENDED', to: 'REMOVED', by: ['MODERATOR'] },
];

export const canMove = (from: ListingStatus, to: ListingStatus, by: ListingMover): boolean =>
  TRANSITIONS.some((t) => t.from === from && t.to === to && t.by.includes(by));

export const movesFrom = (from: ListingStatus, by: ListingMover): readonly ListingStatus[] =>
  TRANSITIONS.filter((t) => t.from === from && t.by.includes(by)).map((t) => t.to);

/** Statuses whose content the seller may still edit. A sold advert is history. */
export const EDITABLE_STATUSES: readonly ListingStatus[] = ['DRAFT', 'PUBLISHED', 'PAUSED', 'EXPIRED'];

export const isEditable = (status: ListingStatus): boolean => EDITABLE_STATUSES.includes(status);

/** A published listing's media is what the public sees; a change there is a sensitive edit. */
export const isPublic = (status: ListingStatus): boolean => PUBLIC_LISTING_STATUSES.includes(status);

// ── value lists ────────────────────────────────────────────────────────────

export const PRICE_MODES = ['EXACT', 'NEGOTIABLE'] as const;
export type PriceMode = (typeof PRICE_MODES)[number];
export const PRICE_MODE_FA: Record<PriceMode, string> = {
  EXACT: 'قیمت مشخص',
  NEGOTIABLE: 'توافقی',
};

export const DELIVERY_METHODS = ['IN_PERSON', 'SELLER_LOCATION', 'VET_CLINIC'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];
export const DELIVERY_METHOD_FA: Record<DeliveryMethod, string> = {
  IN_PERSON: 'تحویل حضوری',
  SELLER_LOCATION: 'محل یا کنل فروشنده',
  VET_CLINIC: 'دامپزشکی منتخب',
};

export const DISCLOSURES = ['YES', 'NO', 'UNKNOWN'] as const;
export type Disclosure = (typeof DISCLOSURES)[number];
export const VACCINATION_FA: Record<Disclosure, string> = {
  YES: 'واکسیناسیون انجام شده است',
  NO: 'واکسیناسیون انجام نشده است',
  UNKNOWN: 'فروشنده نمی‌داند',
};
export const NEUTER_FA: Record<Disclosure, string> = {
  YES: 'عقیم‌سازی انجام شده است',
  NO: 'عقیم‌سازی انجام نشده است',
  UNKNOWN: 'فروشنده نمی‌داند',
};

export const isPriceMode = (v: unknown): v is PriceMode =>
  typeof v === 'string' && (PRICE_MODES as readonly string[]).includes(v);
export const isDeliveryMethod = (v: unknown): v is DeliveryMethod =>
  typeof v === 'string' && (DELIVERY_METHODS as readonly string[]).includes(v);
export const isDisclosure = (v: unknown): v is Disclosure =>
  typeof v === 'string' && (DISCLOSURES as readonly string[]).includes(v);
export const isListingStatus = (v: unknown): v is ListingStatus =>
  typeof v === 'string' && (LISTING_STATUSES as readonly string[]).includes(v);

// ── publication readiness ──────────────────────────────────────────────────

export const DESCRIPTION_MIN = 40;
export const DESCRIPTION_MAX = 4000;
export const REASON_MIN = 10;
export const REASON_MAX = 500;

/** What the seller filled in, plus the counts only the database knows. */
export interface ListingContent {
  readonly priceMode: string | null;
  readonly priceToman: bigint | null;
  readonly descriptionFa: string | null;
  readonly reasonForSaleFa: string | null;
  readonly provinceCode: string | null;
  readonly cityId: string | null;
  readonly vaccinationStatus: string | null;
  readonly neuterStatus: string | null;
  readonly deliveryMethods: readonly string[];
  readonly imageCount: number;
}

/**
 * Everything still missing before this listing may be published.
 *
 * Returned as a list rather than the first failure, because a seller filling a
 * long form deserves to see all of it at once instead of discovering one more
 * requirement per attempt.
 */
export function publicationBlockers(content: ListingContent, minimumImages: number): string[] {
  const missing: string[] = [];

  if (!isPriceMode(content.priceMode)) {
    missing.push('نوع قیمت را انتخاب کنید: مشخص یا توافقی.');
  } else if (content.priceMode === 'EXACT' && (content.priceToman === null || content.priceToman <= 0n)) {
    missing.push('برای قیمت مشخص، مبلغ را وارد کنید.');
  }

  const description = (content.descriptionFa ?? '').trim();
  if (description.length < DESCRIPTION_MIN) {
    missing.push('توضیح آگهی حداقل ' + DESCRIPTION_MIN.toLocaleString('fa-IR') + ' نویسه باشد.');
  }

  const reason = (content.reasonForSaleFa ?? '').trim();
  if (reason.length < REASON_MIN) {
    missing.push('دلیل فروش را بنویسید.');
  }

  if (!content.provinceCode || !content.cityId) missing.push('استان و شهر آگهی را انتخاب کنید.');

  if (!isDisclosure(content.vaccinationStatus)) missing.push('وضعیت واکسیناسیون را مشخص کنید.');
  if (!isDisclosure(content.neuterStatus)) missing.push('وضعیت عقیم‌سازی را مشخص کنید.');

  if (content.deliveryMethods.length === 0) missing.push('حداقل یک روش تحویل را اعلام کنید.');

  if (content.imageCount < minimumImages) {
    missing.push(
      'حداقل ' +
        minimumImages.toLocaleString('fa-IR') +
        ' تصویر واقعی لازم است؛ اکنون ' +
        content.imageCount.toLocaleString('fa-IR') +
        ' تصویر دارد.',
    );
  }

  return missing;
}

// ── the two age questions ──────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The first date this animal may be handed over.
 *
 * A listing may be published before it (PRODUCT_DECISIONS §3), which is what
 * lets a breeder advertise a litter; handover and the transfer of ownership are
 * what the age closes, and that is checked again in PROMPT-007 against the
 * value frozen on the deal rather than against whatever the setting says later.
 *
 * Null when the animal has no recorded date of birth: an unknown age is not a
 * satisfied condition, and every caller treats null as "cannot answer yet".
 */
export function deliverableFrom(birthDate: string | null, minimumAgeDays: number): Date | null {
  if (!birthDate) return null;
  const born = new Date(birthDate + 'T00:00:00.000Z');
  if (Number.isNaN(born.getTime())) return null;
  return new Date(born.getTime() + minimumAgeDays * DAY_MS);
}

export interface HandoverAge {
  readonly allowed: boolean;
  readonly from: Date | null;
  readonly reasonFa: string | null;
}

export function handoverAge(birthDate: string | null, minimumAgeDays: number, now: Date): HandoverAge {
  const from = deliverableFrom(birthDate, minimumAgeDays);
  if (from === null) {
    return {
      allowed: false,
      from: null,
      reasonFa: 'تاریخ تولد این حیوان ثبت نشده است؛ تا ثبت آن، تحویل و انتقال مالکیت باز نمی‌شود.',
    };
  }
  if (now.getTime() < from.getTime()) {
    return {
      allowed: false,
      from,
      reasonFa:
        'تحویل و انتقال مالکیت پیش از حداقل سن مجاز (' +
        minimumAgeDays.toLocaleString('fa-IR') +
        ' روز) ممکن نیست. آگهی می‌تواند منتشر بماند.',
    };
  }
  return { allowed: true, from, reasonFa: null };
}
