/**
 * Negotiation rules that need no database — PROMPT-005.
 *
 * The lifecycle, the commission arithmetic, the payment deadline, and the
 * contact-disclosure policy that decides what a message may say before a
 * deposit has been verified.
 */
import type { ListingStatus } from './listing-model.ts';

// ── lifecycle ──────────────────────────────────────────────────────────────

export const INQUIRY_STATUSES = [
  'OPEN',
  'ACCEPTED',
  'DECLINED',
  'WITHDRAWN',
  'EXPIRED',
  'CONVERTED',
  'COMPLETED',
  'CLOSED',
] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_STATUS_FA: Record<InquiryStatus, string> = {
  OPEN: 'در انتظار پاسخ فروشنده',
  ACCEPTED: 'پذیرفته‌شده، در انتظار پرداخت بیعانه',
  DECLINED: 'رد شد',
  WITHDRAWN: 'توسط خریدار پس گرفته شد',
  EXPIRED: 'مهلت پرداخت گذشت',
  CONVERTED: 'بیعانه پرداخت شد و رزرو انجام شد',
  COMPLETED: 'تحویل انجام و مالکیت منتقل شد',
  CLOSED: 'بسته شد',
};

/** Statuses that hold the advert. Only these two block another acceptance. */
export const LIVE_INQUIRY_STATUSES: readonly InquiryStatus[] = ['OPEN', 'ACCEPTED'];

/** The thread is writable while the deal is still being worked out. */
export const OPEN_THREAD_STATUSES: readonly InquiryStatus[] = ['OPEN', 'ACCEPTED'];

/**
 * After a deal forms the transcript is frozen.
 *
 * A reserved deal is what a dispute is argued from, so nothing more is appended
 * to what both sides agreed to. Reading it stays open to both of them and to a
 * moderator with a reported message in front of them.
 */
export const isThreadWritable = (status: InquiryStatus): boolean =>
  (OPEN_THREAD_STATUSES as readonly string[]).includes(status);

export type InquiryMover = 'BUYER' | 'SELLER' | 'SYSTEM';

interface Move {
  readonly from: InquiryStatus;
  readonly to: InquiryStatus;
  readonly by: readonly InquiryMover[];
}

/**
 * Every state change that exists.
 *
 * CONVERTED is absent from both people's columns: a reservation comes only from
 * a payment the server verified, inside that transaction. EXPIRED is the
 * system's, because a deadline passing is not somebody's decision.
 */
const MOVES: readonly Move[] = [
  { from: 'OPEN', to: 'ACCEPTED', by: ['SELLER'] },
  { from: 'OPEN', to: 'DECLINED', by: ['SELLER'] },
  { from: 'OPEN', to: 'WITHDRAWN', by: ['BUYER'] },
  { from: 'OPEN', to: 'CLOSED', by: ['SYSTEM'] },
  { from: 'ACCEPTED', to: 'CONVERTED', by: ['SYSTEM'] },
  /*
   * The deal ends where the animal actually changes hands (PROMPT-007). Like
   * CONVERTED it belongs to the system alone: it is written inside the
   * transaction that moved the ownership, never by somebody pressing a button.
   */
  { from: 'CONVERTED', to: 'COMPLETED', by: ['SYSTEM'] },
  { from: 'ACCEPTED', to: 'EXPIRED', by: ['SYSTEM'] },
  { from: 'ACCEPTED', to: 'WITHDRAWN', by: ['BUYER'] },
  { from: 'ACCEPTED', to: 'DECLINED', by: ['SELLER'] },
];

export const canMoveInquiry = (from: InquiryStatus, to: InquiryStatus, by: InquiryMover): boolean =>
  MOVES.some((move) => move.from === from && move.to === to && move.by.includes(by));

export const inquiryMovesFrom = (from: InquiryStatus, by: InquiryMover): readonly InquiryStatus[] =>
  MOVES.filter((move) => move.from === from && move.by.includes(by)).map((move) => move.to);

/** An advert only takes new requests while it is actually on sale. */
export const acceptsInquiries = (listingStatus: ListingStatus): boolean => listingStatus === 'PUBLISHED';

// ── offers ─────────────────────────────────────────────────────────────────

export const OFFER_PARTIES = ['BUYER', 'SELLER'] as const;
export type OfferParty = (typeof OFFER_PARTIES)[number];

export const OFFER_STATUSES = ['PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'WITHDRAWN'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_STATUS_FA: Record<OfferStatus, string> = {
  PROPOSED: 'پیشنهاد فعلی',
  ACCEPTED: 'پذیرفته‌شده',
  REJECTED: 'رد شد',
  SUPERSEDED: 'با پیشنهاد تازه جایگزین شد',
  WITHDRAWN: 'پس گرفته شد',
};

/**
 * Who may answer this offer.
 *
 * Not the person who made it: accepting your own proposal is not agreement.
 * That single rule is what makes the locked price a two-sided fact.
 */
export const canRespondToOffer = (party: OfferParty, responder: OfferParty): boolean => party !== responder;

export const MIN_OFFER_TOMAN = 1n;
/** A bound, not an opinion: beyond this the figure is a typo or an attack. */
export const MAX_OFFER_TOMAN = 1_000_000_000_000n;

export function offerProblem(amount: bigint): string | null {
  if (amount < MIN_OFFER_TOMAN) return 'مبلغ پیشنهادی باید بزرگ‌تر از صفر باشد.';
  if (amount > MAX_OFFER_TOMAN) return 'مبلغ پیشنهادی خارج از محدوده معقول است.';
  return null;
}

// ── commission and deposit ─────────────────────────────────────────────────

export interface CommissionInputs {
  readonly fixedToman: bigint;
  readonly percentBp: number;
  readonly minToman: bigint | null;
  readonly maxToman: bigint | null;
}

/**
 * The deposit, which **is** the commission (PRODUCT_DECISIONS §5).
 *
 * Fixed part plus a percentage of the final price, clamped by the floor and the
 * ceiling when those are set. Basis points and bigint throughout: no money rule
 * in this product runs on a floating-point number, and the division truncates
 * rather than rounding up, so the figure can never exceed what the formula says.
 */
export function depositForPrice(finalPriceToman: bigint, inputs: CommissionInputs): bigint {
  const percentPart = (finalPriceToman * BigInt(inputs.percentBp)) / 10_000n;
  let amount = inputs.fixedToman + percentPart;
  if (inputs.minToman !== null && amount < inputs.minToman) amount = inputs.minToman;
  if (inputs.maxToman !== null && amount > inputs.maxToman) amount = inputs.maxToman;
  return amount;
}

const HOUR_MS = 60 * 60 * 1000;

export const paymentDeadline = (acceptedAt: Date, windowHours: number): Date =>
  new Date(acceptedAt.getTime() + windowHours * HOUR_MS);

export const deadlinePassed = (deadline: Date | null, now: Date): boolean =>
  deadline !== null && deadline.getTime() <= now.getTime();

// ── contact disclosure policy ──────────────────────────────────────────────

export const CONTACT_BLOCKED_FA =
  'اطلاعات تماس یا پرداخت در پیام حذف شد. تا پیش از پرداخت بیعانه، شماره تماس، شماره کارت و لینک پرداخت در گفت‌وگو رد و بدل نمی‌شود.';

/**
 * Digits, in any script this product sees.
 *
 * A Persian or Arabic-Indic numeral is a numeral; matching only ASCII would
 * make the policy trivially avoidable by typing the number the way most people
 * here actually type it.
 */
const DIGITS = '0-9۰-۹٠-٩';
/** Separators people scatter through a number to break a naive matcher. */
const GAP = '[\\s._\\-()\\u200c\\u200f\\u200e]*';
const D = (count: number) => '(?:[' + DIGITS + ']' + GAP + '){' + count + '}';

interface Rule {
  readonly code: string;
  readonly pattern: RegExp;
}

/**
 * What is withheld before a verified deposit, and why each one.
 *
 * This is a policy, not a detector. It catches the ordinary ways a number or a
 * link is written, including with separators and non-ASCII digits, and it will
 * not catch a determined person writing a phone number in words. That is stated
 * to the user rather than papered over, every enforcement is logged, and a
 * moderator can read the thread and act.
 */
const RULES: readonly Rule[] = [
  /*
   * Order matters, because the first rule to match is the one the enforcement
   * is logged under. The most specific shapes go first, so a card number is
   * recorded as a card rather than as whatever looser rule also happens to fit
   * sixteen digits.
   */
  // An IBAN as written here.
  { code: 'IBAN', pattern: /IR[\s-]*(?:[0-9۰-۹٠-٩][\s-]*){24}/giu },
  // A card number: four groups of four.
  { code: 'CARD', pattern: new RegExp(D(4) + '[-\\s._]*' + D(4) + '[-\\s._]*' + D(4) + '[-\\s._]*' + D(4), 'gu') },
  // Any link: a payment page is the one that matters, and none of them is
  // needed inside a thread before the deposit.
  { code: 'URL', pattern: /(?:https?:\/\/|www\.)\S+/giu },
  // An Iranian mobile or landline, with or without a country code.
  { code: 'PHONE', pattern: new RegExp('(?:\\+' + GAP + '9' + GAP + '8|0)' + GAP + D(9) + '[' + DIGITS + ']?', 'gu') },
  // A bare long digit run that is none of the above but is still an account.
  { code: 'LONG_NUMBER', pattern: new RegExp(D(11) + '[' + DIGITS + ']*', 'gu') },
];

export interface RedactionResult {
  readonly text: string;
  /** Which rules fired, so the enforcement can be logged and reviewed. */
  readonly codes: readonly string[];
  readonly redacted: boolean;
}

const MASK = '▮▮▮';

/**
 * Apply the policy to one message.
 *
 * Returns the text that will be stored. The original is deliberately not kept:
 * storing what the policy exists to withhold would defeat it, so what is
 * recorded beside the message is that something was removed and which rule
 * removed it.
 */
export function applyContactPolicy(body: string, contactRevealed: boolean): RedactionResult {
  if (contactRevealed) return { text: body, codes: [], redacted: false };
  const codes: string[] = [];
  let text = body;
  for (const rule of RULES) {
    // A fresh regex each time: a /g regex carries lastIndex between calls.
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    if (!pattern.test(text)) continue;
    codes.push(rule.code);
    text = text.replace(new RegExp(rule.pattern.source, rule.pattern.flags), MASK);
  }
  return { text, codes, redacted: codes.length > 0 };
}

// ── risk control ───────────────────────────────────────────────────────────

export interface RiskDecision {
  readonly blocked: boolean;
  readonly reasonFa: string | null;
}

/**
 * Whether this buyer may have another request accepted.
 *
 * Counts acceptances this buyer let expire inside the managed window. Bounded
 * on purpose: it is a limit on repeated non-payment, not a judgement about the
 * person, and it lifts by itself as the window moves. An unset limit is not
 * enforced — a cap nobody has chosen is not zero and not infinity.
 */
export function failedDepositDecision(
  failures: number,
  limit: number | null,
  windowDays: number | null,
): RiskDecision {
  if (limit === null || windowDays === null) return { blocked: false, reasonFa: null };
  if (failures < limit) return { blocked: false, reasonFa: null };
  return {
    blocked: true,
    reasonFa:
      'در ' +
      windowDays.toLocaleString('fa-IR') +
      ' روز گذشته ' +
      failures.toLocaleString('fa-IR') +
      ' بار مهلت پرداخت بیعانه را از دست داده‌اید. تا گذشتن این بازه، درخواست تازه پذیرفته نمی‌شود.',
  };
}
