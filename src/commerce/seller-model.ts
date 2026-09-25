/**
 * What a store is, who may act inside it, and when it may trade — PROMPT-008.
 *
 * Pure rules. The lifecycle, the scoped roles, the list of things an
 * application is missing, and what a plan lets a store do — all stated once so
 * a screen and a transaction cannot disagree about them.
 */

export const SELLER_KINDS = ['PET_SHOP', 'VERIFIED_BUSINESS', 'PLATFORM'] as const;
export type SellerKind = (typeof SELLER_KINDS)[number];

export const SELLER_KIND_FA: Record<SellerKind, string> = {
  PET_SHOP: 'پت‌شاپ',
  VERIFIED_BUSINESS: 'کسب‌وکار تأییدشده',
  PLATFORM: 'فروشگاه خود همزیست',
};

/** Which kinds a person may apply as. The platform's own store is not one. */
export const APPLICABLE_KINDS: readonly SellerKind[] = ['PET_SHOP', 'VERIFIED_BUSINESS'];

export const SELLER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_CORRECTION',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
  'TERMINATED',
] as const;
export type SellerStatus = (typeof SELLER_STATUSES)[number];

export const SELLER_STATUS_FA: Record<SellerStatus, string> = {
  DRAFT: 'پیش‌نویس',
  SUBMITTED: 'ارسال‌شده برای بررسی',
  UNDER_REVIEW: 'در حال بررسی',
  NEEDS_CORRECTION: 'نیازمند اصلاح',
  APPROVED: 'تأییدشده، در انتظار فعال‌سازی',
  ACTIVE: 'فعال',
  SUSPENDED: 'تعلیق‌شده',
  REJECTED: 'ردشده',
  TERMINATED: 'خاتمه‌یافته',
};

export type SellerMover = 'SELLER' | 'REVIEWER' | 'SYSTEM';

interface Move {
  readonly from: SellerStatus;
  readonly to: SellerStatus;
  readonly by: readonly SellerMover[];
}

/**
 * Every state change that exists.
 *
 * `ACTIVE` belongs to the system alone: a store starts trading because a plan
 * period began — which is the effect of a verified payment, or of a plan that
 * was free at the moment it was bought — never because an operator pressed a
 * button that says active.
 */
const MOVES: readonly Move[] = [
  { from: 'DRAFT', to: 'SUBMITTED', by: ['SELLER'] },
  { from: 'SUBMITTED', to: 'UNDER_REVIEW', by: ['REVIEWER'] },
  { from: 'SUBMITTED', to: 'NEEDS_CORRECTION', by: ['REVIEWER'] },
  { from: 'SUBMITTED', to: 'REJECTED', by: ['REVIEWER'] },
  { from: 'UNDER_REVIEW', to: 'NEEDS_CORRECTION', by: ['REVIEWER'] },
  { from: 'UNDER_REVIEW', to: 'APPROVED', by: ['REVIEWER'] },
  { from: 'UNDER_REVIEW', to: 'REJECTED', by: ['REVIEWER'] },
  { from: 'NEEDS_CORRECTION', to: 'SUBMITTED', by: ['SELLER'] },
  { from: 'APPROVED', to: 'ACTIVE', by: ['SYSTEM'] },
  { from: 'APPROVED', to: 'REJECTED', by: ['REVIEWER'] },
  { from: 'ACTIVE', to: 'SUSPENDED', by: ['REVIEWER'] },
  { from: 'SUSPENDED', to: 'ACTIVE', by: ['REVIEWER'] },
  { from: 'SUSPENDED', to: 'TERMINATED', by: ['REVIEWER'] },
  { from: 'ACTIVE', to: 'TERMINATED', by: ['REVIEWER'] },
];

export const canMoveSeller = (from: SellerStatus, to: SellerStatus, by: SellerMover): boolean =>
  MOVES.some((move) => move.from === from && move.to === to && move.by.includes(by));

export const sellerMovesFrom = (from: SellerStatus, by: SellerMover): readonly SellerStatus[] =>
  MOVES.filter((move) => move.from === from && move.by.includes(by)).map((move) => move.to);

/** The states in which the application form is still the seller's to edit. */
export const EDITABLE_STATUSES: readonly SellerStatus[] = ['DRAFT', 'NEEDS_CORRECTION'];
export const isSellerEditable = (status: SellerStatus): boolean => EDITABLE_STATUSES.includes(status);

/** Trading at all. Everything else — products, orders, history — survives. */
export const isSellerTrading = (status: SellerStatus): boolean => status === 'ACTIVE';

/**
 * Whether the store's records stay in place.
 *
 * Every status does, which is the point: suspension and termination stop a
 * store selling and never delete what it sold, who bought it or what is owed.
 */
export const keepsRecords = (_status: SellerStatus): boolean => true;

// ── roles inside one store ─────────────────────────────────────────────────

export const SELLER_ROLES = ['OWNER', 'ADMIN', 'STAFF'] as const;
export type SellerRole = (typeof SELLER_ROLES)[number];

export const SELLER_ROLE_FA: Record<SellerRole, string> = {
  OWNER: 'مالک فروشگاه',
  ADMIN: 'مدیر فروشگاه',
  STAFF: 'کارمند فروشگاه',
};

export const SELLER_CAPABILITIES = [
  /** Read the store's own dashboard, orders and documents. */
  'STORE_VIEW',
  /** Edit the application and the store's public details. */
  'STORE_EDIT',
  /** Send the application for review, and resubmit after a correction. */
  'STORE_SUBMIT',
  /** Buy or renew a plan. */
  'STORE_BILLING',
  /** Invite, change and remove the people who work in this store. */
  'STORE_MEMBERS',
  /** Day-to-day trading: the catalogue and the orders of later prompts. */
  'STORE_OPERATE',
] as const;
export type SellerCapability = (typeof SELLER_CAPABILITIES)[number];

/**
 * What each role may do.
 *
 * Staff run the shop day to day and cannot change who owns it, what it agreed
 * to, or where its money goes. Only the owner touches billing and membership,
 * because those are the two ways a store can be taken away from its owner.
 */
const ROLE_CAPABILITIES: Record<SellerRole, readonly SellerCapability[]> = {
  OWNER: ['STORE_VIEW', 'STORE_EDIT', 'STORE_SUBMIT', 'STORE_BILLING', 'STORE_MEMBERS', 'STORE_OPERATE'],
  ADMIN: ['STORE_VIEW', 'STORE_EDIT', 'STORE_SUBMIT', 'STORE_OPERATE'],
  STAFF: ['STORE_VIEW', 'STORE_OPERATE'],
};

export const roleAllows = (role: SellerRole, capability: SellerCapability): boolean =>
  ROLE_CAPABILITIES[role].includes(capability);

export const capabilitiesOf = (role: SellerRole): readonly SellerCapability[] => ROLE_CAPABILITIES[role];

// ── what an application still needs ────────────────────────────────────────

export interface SellerFormFacts {
  readonly displayNameFa: string | null;
  readonly legalNameFa: string | null;
  readonly businessTypeFa: string | null;
  readonly nationalIdentifier: string | null;
  readonly representativeNameFa: string | null;
  readonly representativePhone: string | null;
  readonly provinceCode: string | null;
  readonly cityId: string | null;
  readonly addressFa: string | null;
  readonly settlementIban: string | null;
  readonly settlementHolderNameFa: string | null;
  readonly shippingPolicyFa: string | null;
  readonly returnPolicyFa: string | null;
  readonly agreementVersion: string | null;
  readonly ownerKycApproved: boolean;
  readonly hasLicenceDocument: boolean;
  /** Whether a licence is required at all, from managed data. Null means nobody said. */
  readonly licenceRequired: boolean | null;
}

/**
 * Everything missing, reported at once.
 *
 * The licence line is deliberately conditional. The source does not say which
 * licence a pet shop must hold, so the product does not assert one: a licence
 * is demanded only where an operator has recorded that it is required, and an
 * unset requirement is reported to the applicant as "not decided" rather than
 * enforced as either yes or no.
 */
export function submissionBlockers(facts: SellerFormFacts): readonly string[] {
  const blockers: string[] = [];
  if (!facts.ownerKycApproved) blockers.push('احراز هویت مالک یا نماینده فروشگاه باید تأییدشده باشد.');
  if (!facts.displayNameFa) blockers.push('نام نمایشی فروشگاه را وارد کنید.');
  if (!facts.legalNameFa) blockers.push('نام رسمی کسب‌وکار را وارد کنید.');
  if (!facts.businessTypeFa) blockers.push('نوع کسب‌وکار را بنویسید.');
  if (!facts.nationalIdentifier) blockers.push('شناسه ملی کسب‌وکار یا کد ملی فرد صاحب کسب‌وکار لازم است.');
  if (!facts.representativeNameFa) blockers.push('نام نماینده فروشگاه را وارد کنید.');
  if (!facts.representativePhone) blockers.push('شماره تماس نماینده را وارد کنید.');
  if (!facts.provinceCode || !facts.cityId || !facts.addressFa) blockers.push('نشانی کامل فروشگاه لازم است.');
  if (!facts.settlementIban) blockers.push('شماره شبای تسویه را وارد کنید.');
  if (!facts.settlementHolderNameFa) blockers.push('نام صاحب حساب تسویه را وارد کنید.');
  if (!facts.shippingPolicyFa) blockers.push('قوانین ارسال فروشگاه را بنویسید.');
  if (!facts.returnPolicyFa) blockers.push('قوانین مرجوعی فروشگاه را بنویسید.');
  if (!facts.agreementVersion) blockers.push('قرارداد فروشندگی را بپذیرید.');
  if (facts.licenceRequired === true && !facts.hasLicenceDocument) {
    blockers.push('بارگذاری مجوز کسب‌وکار برای این بازار الزامی اعلام شده است.');
  }
  return blockers;
}

/** Said on the form where a licence is asked for, and nowhere softened. */
export const LICENCE_NOTE_FA =
  'همزیست تعیین نمی‌کند کدام مجوز برای کسب‌وکار شما قانوناً الزامی است. آنچه دارید را با عنوان خودش ثبت کنید؛ الزامی بودن مجوز فقط وقتی اعمال می‌شود که مدیر بازار آن را به‌صورت داده مدیریت‌شده اعلام کرده باشد.';

/** Said wherever the settlement account is shown or verified. */
export const IBAN_NOTE_FA =
  'مالکیت حساب تسویه را یک بررسی‌کننده از روی مدرک تأیید می‌کند؛ هیچ استعلام بانکی خودکاری در این محصول وصل نیست.';

// ── an IBAN, only as far as its shape ──────────────────────────────────────

const IBAN_SHAPE = /^IR[0-9]{24}$/;

/**
 * Normalise what somebody typed.
 *
 * Spaces and dashes are how people write an IBAN, and Persian digits are how
 * many of them type numbers. This makes two spellings of the same account the
 * same string, which is what the duplicate index then compares.
 */
export function normaliseIban(raw: string): string {
  const latin = raw
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
  return latin.replace(/[\s-]/g, '').toUpperCase();
}

/** Shape only: that a bank would accept it is not something this can know. */
export const isIbanShape = (value: string): boolean => IBAN_SHAPE.test(normaliseIban(value));

/** Shown instead of the whole number wherever it is not being edited. */
export function maskIban(value: string): string {
  const iban = normaliseIban(value);
  if (iban.length < 8) return '••••';
  return iban.slice(0, 4) + '••••••••••••••' + iban.slice(-4);
}

// ── plans ──────────────────────────────────────────────────────────────────

export interface PlanCapabilities {
  /** Whether this plan lets the store promote its offers at all. */
  readonly canPromote?: boolean;
  /** How many promotions it may run at once; absent means no ceiling of its own. */
  readonly maxActivePromotions?: number;
}

export interface PlanFacts {
  readonly durationDays: number;
  readonly productLimit: number | null;
  readonly commissionPercentBp: number;
  readonly capabilities: PlanCapabilities;
}

/** The period a purchased plan covers, starting where a live one ends. */
export function planWindow(from: Date, durationDays: number): { startsAt: Date; endsAt: Date } {
  return { startsAt: from, endsAt: new Date(from.getTime() + durationDays * 24 * 60 * 60 * 1000) };
}

/** Decided when read, so an expired plan stops working with no job running. */
export const planExpired = (endsAt: Date | null, now: Date): boolean =>
  endsAt !== null && endsAt.getTime() <= now.getTime();

export function planProblems(facts: PlanFacts): readonly string[] {
  const problems: string[] = [];
  if (!Number.isInteger(facts.durationDays) || facts.durationDays <= 0) {
    problems.push('مدت پلن باید عددی بزرگ‌تر از صفر باشد.');
  }
  if (
    !Number.isInteger(facts.commissionPercentBp) ||
    facts.commissionPercentBp < 0 ||
    facts.commissionPercentBp > 10_000
  ) {
    problems.push('کارمزد پلن باید بین ۰ تا ۱۰۰۰۰ در واحد basis point باشد.');
  }
  if (facts.productLimit !== null && (!Number.isInteger(facts.productLimit) || facts.productLimit <= 0)) {
    problems.push('سقف محصول باید خالی یا عددی بزرگ‌تر از صفر باشد.');
  }
  if (
    facts.capabilities.maxActivePromotions !== undefined &&
    (!Number.isInteger(facts.capabilities.maxActivePromotions) || facts.capabilities.maxActivePromotions < 0)
  ) {
    problems.push('سقف تبلیغ هم‌زمان باید عددی نامنفی باشد.');
  }
  return problems;
}
