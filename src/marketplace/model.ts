/**
 * Phase 3 shared marketplace model — PROMPT-002.
 *
 * Pure rules with no database and no framework: who may sell, what each
 * operational role is allowed to do, and which flows have a kill switch. The
 * services of the later prompts read these instead of restating them, so the
 * answer to "may this person do this" has one place to be wrong.
 */
import { forbidden } from '../domain/errors.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';

// ── Markets ────────────────────────────────────────────────────────────────

// MATING is the Phase 4 finder's species gate: the same table and audit, but only
// the superadmin opens or closes it (PRODUCT_DECISIONS §12, DEC-0218).
export const MARKETS = ['ANIMAL_SALE', 'MERCHANDISE', 'MATING'] as const;
export type MarketName = (typeof MARKETS)[number];

export const MARKET_FA: Record<MarketName, string> = {
  ANIMAL_SALE: 'بازار فروش حیوان',
  MERCHANDISE: 'فروشگاه کالا',
  MATING: 'جفت‌یابی',
};

export const isMarket = (value: unknown): value is MarketName =>
  typeof value === 'string' && (MARKETS as readonly string[]).includes(value);

// ── Seller kinds ───────────────────────────────────────────────────────────

/**
 * Who is allowed to sell, per market (PRODUCT_DECISIONS §2 and §8).
 *
 * This is a closed list, not managed data: each kind carries a different legal
 * responsibility and a different set of conditions, and a new one is a product
 * decision with its own eligibility work, never a row somebody adds.
 *
 * `requires` names the facts the eligibility check of PROMPT-003 and PROMPT-008
 * must read from the existing services — it is the contract between this
 * prompt and those, not a re-implementation of the checks.
 */
export const SELLER_KINDS = [
  {
    kind: 'OWNER',
    market: 'ANIMAL_SALE',
    labelFa: 'مالک حیوان',
    requires: ['KYC_APPROVED', 'VALID_ASSOCIATION_MEMBERSHIP', 'OWNS_THE_ANIMAL'],
  },
  {
    kind: 'KENNEL',
    market: 'ANIMAL_SALE',
    labelFa: 'کنل تأییدشده',
    requires: ['KYC_APPROVED', 'KENNEL_APPROVED_AND_ACTIVE', 'KENNEL_OWNS_THE_ANIMAL'],
  },
  {
    kind: 'PET_SHOP',
    market: 'MERCHANDISE',
    labelFa: 'پت‌شاپ',
    requires: ['KYC_APPROVED', 'SELLER_APPLICATION_APPROVED', 'VERIFIED_BANK_ACCOUNT'],
  },
  {
    kind: 'BUSINESS',
    market: 'MERCHANDISE',
    labelFa: 'کسب‌وکار تأییدشده',
    requires: ['KYC_APPROVED', 'SELLER_APPLICATION_APPROVED', 'VERIFIED_BANK_ACCOUNT'],
  },
] as const;

export type SellerKindName = (typeof SELLER_KINDS)[number]['kind'];
export type SellerRequirement = (typeof SELLER_KINDS)[number]['requires'][number];

export const sellerKindsOf = (market: MarketName): ReadonlyArray<(typeof SELLER_KINDS)[number]> =>
  SELLER_KINDS.filter((k) => k.market === market);

export const sellerKind = (kind: string): (typeof SELLER_KINDS)[number] | null =>
  SELLER_KINDS.find((k) => k.kind === kind) ?? null;

// ── Operational capabilities ───────────────────────────────────────────────

/**
 * What a marketplace operator may actually do.
 *
 * Holding an operational shell is not the same as being allowed to act in it
 * (§21.4), so the shell only decides which address opens and these decide every
 * action inside it. Listed one by one rather than as levels, because a level
 * always ends up granting something nobody meant to grant.
 */
export const MARKETPLACE_CAPABILITIES = [
  /** See the marketplace operations home and the state of the kill switches. */
  'MARKET_OVERVIEW_VIEW',
  /** Change a managed marketplace value (the settings group check still applies on top). */
  'MARKET_SETTINGS_WRITE',
  /** Open or close a whole flow. */
  'MARKET_FLAG_TOGGLE',
  /** Open or close a market for one species. */
  'MARKET_SPECIES_WRITE',
  /** Hide, restore or demand correction of an animal listing. */
  'ANIMAL_LISTING_MODERATE',
  /** Decide a deposit dispute between a buyer and a seller. */
  'ANIMAL_DISPUTE_DECIDE',
  /** Approve, correct or reject a merchandise seller's application. */
  'SELLER_APPLICATION_REVIEW',
  /** Suspend a seller that is already trading. */
  'SELLER_SUSPEND',
  /** Read an order, its sub-orders and their history. */
  'ORDER_VIEW',
  /** Return money to a buyer. */
  'REFUND_ISSUE',
  /** Read the financial ledger. */
  'LEDGER_VIEW',
  /** Run a settlement batch and record its bank reference. */
  'SETTLEMENT_RUN',
] as const;
export type MarketplaceCapability = (typeof MARKETPLACE_CAPABILITIES)[number];

export const MARKETPLACE_CONTEXTS: readonly ActorContextName[] = [
  'MARKETPLACE_ADMIN',
  'LISTING_MODERATOR',
  'SELLER_REVIEWER',
  'FINANCE_OPERATOR',
  'DISPUTE_REVIEWER',
  'SUPPORT_AGENT',
];

export const MARKETPLACE_CONTEXT_FA: Record<string, string> = {
  MARKETPLACE_ADMIN: 'مدیر بازار',
  LISTING_MODERATOR: 'ناظر آگهی',
  SELLER_REVIEWER: 'بررسی‌کننده فروشنده',
  FINANCE_OPERATOR: 'اپراتور مالی',
  DISPUTE_REVIEWER: 'داور اختلاف',
  SUPPORT_AGENT: 'پشتیبانی',
};

/**
 * The grant table.
 *
 * Three properties this arrangement keeps, and the tests pin each one:
 *  - nobody but the superadmin holds every capability;
 *  - the money capabilities (`REFUND_ISSUE`, `SETTLEMENT_RUN`, `LEDGER_VIEW`)
 *    belong to finance alone, and the marketplace admin does not get them by
 *    being an admin;
 *  - support can read and nothing else, because the fastest way to lose money
 *    is a support queue with a refund button in it.
 */
const CAPABILITIES: Record<string, readonly MarketplaceCapability[]> = {
  SUPERADMIN: MARKETPLACE_CAPABILITIES,
  MARKETPLACE_ADMIN: [
    'MARKET_OVERVIEW_VIEW',
    'MARKET_SETTINGS_WRITE',
    'MARKET_FLAG_TOGGLE',
    'MARKET_SPECIES_WRITE',
    'ORDER_VIEW',
  ],
  LISTING_MODERATOR: ['MARKET_OVERVIEW_VIEW', 'ANIMAL_LISTING_MODERATE'],
  SELLER_REVIEWER: ['MARKET_OVERVIEW_VIEW', 'SELLER_APPLICATION_REVIEW', 'SELLER_SUSPEND'],
  FINANCE_OPERATOR: ['MARKET_OVERVIEW_VIEW', 'ORDER_VIEW', 'LEDGER_VIEW', 'SETTLEMENT_RUN', 'REFUND_ISSUE'],
  DISPUTE_REVIEWER: ['MARKET_OVERVIEW_VIEW', 'ANIMAL_DISPUTE_DECIDE', 'ORDER_VIEW'],
  SUPPORT_AGENT: ['MARKET_OVERVIEW_VIEW', 'ORDER_VIEW'],
};

export const capabilitiesOf = (context: ActorContextName): readonly MarketplaceCapability[] =>
  CAPABILITIES[context] ?? [];

export const hasMarketplaceCapability = (actor: Actor, capability: MarketplaceCapability): boolean =>
  capabilitiesOf(actor.context).includes(capability);

export function assertMarketplaceCapability(actor: Actor, capability: MarketplaceCapability): void {
  if (!hasMarketplaceCapability(actor, capability)) {
    throw forbidden('این کار در نقش فعلی شما مجاز نیست.');
  }
}

// ── Kill switches ──────────────────────────────────────────────────────────

/**
 * One switch per flow the prompt names, plus the animal market's own master
 * switch. They are BOOL product settings in the `MARKETPLACE_OPERATIONS` group,
 * so throwing one is versioned and audited exactly like any other managed
 * change, and the admin panel already knows how to show it.
 *
 * Every one starts closed. Nothing behind them is built yet, and a switch that
 * says «باز» over an unbuilt flow is a lie the rest of the phase would inherit.
 */
export const MARKET_FLAGS = [
  {
    key: 'market.flag.animal_market_enabled',
    labelFa: 'بازار فروش حیوان',
    closedFa: 'بازار فروش حیوان در حال حاضر بسته است.',
  },
  {
    key: 'market.flag.animal_listing_creation_enabled',
    labelFa: 'ثبت آگهی تازه حیوان',
    closedFa: 'ثبت آگهی تازه در حال حاضر بسته است.',
  },
  {
    key: 'market.flag.commerce_checkout_enabled',
    labelFa: 'پرداخت سبد فروشگاه',
    closedFa: 'پرداخت سبد خرید در حال حاضر بسته است.',
  },
  {
    key: 'market.flag.seller_onboarding_enabled',
    labelFa: 'ثبت‌نام فروشنده کالا',
    closedFa: 'ثبت‌نام فروشنده تازه در حال حاضر بسته است.',
  },
  {
    key: 'market.flag.payout_enabled',
    labelFa: 'تسویه با فروشندگان',
    closedFa: 'تسویه در حال حاضر متوقف است.',
  },
  {
    key: 'market.flag.promotion_enabled',
    labelFa: 'تخفیف‌ها و کمپین‌ها',
    closedFa: 'کمپین‌ها در حال حاضر غیرفعال‌اند.',
  },
] as const;

export type MarketFlagKey = (typeof MARKET_FLAGS)[number]['key'];

export const MARKET_FLAG_KEYS: readonly MarketFlagKey[] = MARKET_FLAGS.map((f) => f.key);

export const marketFlag = (key: string): (typeof MARKET_FLAGS)[number] | null =>
  MARKET_FLAGS.find((f) => f.key === key) ?? null;
