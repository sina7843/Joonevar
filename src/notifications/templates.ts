/**
 * What a message says, and where it is allowed to go — Phase 2.5 §10 (PROMPT-015).
 *
 * Until now every Persian sentence lived at its call site, which is fine for a
 * screen and wrong for a channel: an SMS leaves the product, so what it may
 * contain has to be decided in one place and reviewed as a whole.
 *
 * Two rules hold here:
 *
 *  - **A template is a sentence, not a slot for domain text.** The body an SMS
 *    carries is written here and takes no free text from a record. That is what
 *    keeps a national id, a document number, a chip number or a reviewer's
 *    reason from leaving the product in a message nobody read first.
 *  - **Silence is the default.** A kind that is not listed here is delivered
 *    in the app and nowhere else. Adding a channel is a decision somebody makes
 *    on purpose, not something a new notification kind inherits.
 *
 * The catalogue is versioned: `TEMPLATE_VERSION` is stamped on every delivery,
 * so a message that went out can be read back against the wording it was sent
 * with even after the wording changes.
 */
export const TEMPLATE_VERSION = 'v1-2026-09';

export const NOTIFICATION_CHANNELS = ['IN_APP', 'SMS'] as const;
export type NotificationChannelName = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationTemplate {
  /** The notification kind this speaks for. */
  readonly kind: string;
  /** Channels this kind may use, in addition to the in-app record itself. */
  readonly channels: readonly NotificationChannelName[];
  /**
   * The SMS sentence. It is complete as written: no record value is inserted,
   * because the recipient already knows which case is theirs and the app has
   * the detail.
   */
  readonly smsFa?: string;
}

/**
 * The kinds that are worth a message outside the app: a decision the person has
 * to act on, money that moved, and a standing that started or ended. Everything
 * else stays in the app.
 */
export const NOTIFICATION_TEMPLATES: readonly NotificationTemplate[] = [
  // ── Identity and professional review ─────────────────────────────────────
  { kind: 'KYC_APPROVED', channels: ['SMS'], smsFa: 'همزیست: احراز هویت شما تأیید شد. برای ادامه وارد حساب خود شوید.' },
  {
    kind: 'KYC_NEEDS_CORRECTION',
    channels: ['SMS'],
    smsFa: 'همزیست: برای احراز هویت شما اصلاحی لازم است. دلیل آن در حساب شما نوشته شده است.',
  },
  { kind: 'KYC_REJECTED', channels: ['SMS'], smsFa: 'همزیست: درخواست احراز هویت شما رد شد. دلیل آن در حساب شما نوشته شده است.' },
  {
    kind: 'VET_STUDENT_CASE_DECIDED',
    channels: ['SMS'],
    smsFa: 'همزیست: درباره پرونده دانشجویی شما تصمیم‌گیری شد. نتیجه و دلیل آن در حساب شماست.',
  },
  {
    kind: 'VET_DOCTOR_CASE_DECIDED',
    channels: ['SMS'],
    smsFa: 'همزیست: درباره شماره نظام دامپزشکی شما تصمیم‌گیری شد. نتیجه در حساب شماست.',
  },
  {
    kind: 'VET_LICENCE_CASE_DECIDED',
    channels: ['SMS'],
    smsFa: 'همزیست: درباره پروانه فعالیت شما تصمیم‌گیری شد. نتیجه و مرحله بعد در حساب شماست.',
  },
  {
    kind: 'VET_TRUSTED_CASE_DECIDED',
    channels: ['SMS'],
    smsFa: 'همزیست: درباره درخواست دامپزشک معتمد شما تصمیم‌گیری شد. نتیجه در حساب شماست.',
  },

  // ── Money ────────────────────────────────────────────────────────────────
  { kind: 'PAYMENT_VERIFIED', channels: ['SMS'], smsFa: 'همزیست: پرداخت شما تأیید شد. رسید آن در حساب شما در دسترس است.' },

  // ── Standing: licence, trusted, membership ───────────────────────────────
  { kind: 'VET_LICENCE_PERIOD_ACTIVATED', channels: ['SMS'], smsFa: 'همزیست: دوره پروانه فعالیت شما فعال شد.' },
  { kind: 'VET_LICENCE_PERIOD_ENDING', channels: ['SMS'], smsFa: 'همزیست: دوره پروانه فعالیت شما رو به پایان است. تمدید آن در حساب شماست.' },
  { kind: 'VET_LICENCE_PERIOD_EXPIRED', channels: ['SMS'], smsFa: 'همزیست: دوره پروانه فعالیت شما به پایان رسید.' },
  { kind: 'VET_TRUSTED_PERIOD_ACTIVATED', channels: ['SMS'], smsFa: 'همزیست: جایگاه دامپزشک معتمد شما فعال شد.' },
  { kind: 'VET_TRUSTED_PERIOD_ENDING', channels: ['SMS'], smsFa: 'همزیست: دوره دامپزشک معتمد شما رو به پایان است. تمدید آن در حساب شماست.' },
  { kind: 'VET_TRUSTED_PERIOD_EXPIRED', channels: ['SMS'], smsFa: 'همزیست: دوره دامپزشک معتمد شما به پایان رسید.' },
  { kind: 'VET_TRUSTED_SUSPENDED', channels: ['SMS'], smsFa: 'همزیست: جایگاه دامپزشک معتمد شما تعلیق شد. دلیل آن در حساب شماست.' },
  {
    kind: 'VET_TRUSTED_PERIOD_BLOCKED',
    channels: ['SMS'],
    smsFa: 'همزیست: پرداخت شما ثبت شد ولی شرایط لازم برقرار نبود و دوره فعال نشد. پیگیری آن با انجمن است.',
  },
  { kind: 'MEMBERSHIP_APPLICATION_DECIDED', channels: ['SMS'], smsFa: 'همزیست: درباره درخواست عضویت شما تصمیم‌گیری شد. نتیجه در حساب شماست.' },
  { kind: 'MEMBERSHIP_ACTIVATED', channels: ['SMS'], smsFa: 'همزیست: دوره عضویت شما فعال شد.' },
  { kind: 'MEMBERSHIP_ENDING', channels: ['SMS'], smsFa: 'همزیست: عضویت شما رو به پایان است. تمدید آن در حساب شماست.' },
  { kind: 'MEMBERSHIP_EXPIRED', channels: ['SMS'], smsFa: 'همزیست: عضویت شما به پایان رسید.' },

  // ── Clubs ────────────────────────────────────────────────────────────────
  { kind: 'CLUB_MEMBERSHIP_APPROVED', channels: ['SMS'], smsFa: 'همزیست: درخواست عضویت شما در کلاب پذیرفته شد.' },
  { kind: 'CLUB_MEMBERSHIP_REJECTED', channels: ['SMS'], smsFa: 'همزیست: درخواست عضویت شما در کلاب رد شد. دلیل آن در حساب شماست.' },
  { kind: 'CLUB_MEMBERSHIP_EXPIRED', channels: ['SMS'], smsFa: 'همزیست: عضویت شما در کلاب به پایان رسید.' },
  {
    kind: 'CLUB_MEMBERSHIP_ACTIVATION_BLOCKED',
    channels: ['SMS'],
    smsFa: 'همزیست: پرداخت شما ثبت شد ولی شرایط عضویت کلاب برقرار نبود. پیگیری با مدیر کلاب است.',
  },
  { kind: 'CLUB_OWNERSHIP_APPROVED', channels: ['SMS'], smsFa: 'همزیست: مالکیت کلاب به شما واگذار شد.' },

  // ── Phase 3: the marketplace (PROMPT-013) ────────────────────────────────
  //
  // Most of what a marketplace says belongs in the app, where the record is.
  // What leaves it is the short list where somebody loses something by not
  // knowing in time: a deadline that will pass, money that moved, goods that
  // changed hands, and a standing that started or stopped.
  {
    kind: 'LISTING_INQUIRY_ACCEPTED',
    channels: ['SMS'],
    smsFa: 'همزیست: درخواست خرید شما پذیرفته شد و مهلت پرداخت بیعانه آغاز شده است. جزئیات در حساب شماست.',
  },
  {
    kind: 'ANIMAL_LISTING_RESERVED',
    channels: ['SMS'],
    smsFa: 'همزیست: بیعانه تأیید شد و حیوان برای شما رزرو شد. ادامه مسیر در حساب شماست.',
  },
  {
    kind: 'ANIMAL_HANDOVER_CODE_ACCEPTED',
    channels: ['SMS'],
    smsFa: 'همزیست: کد تحویل ثبت شد. برای تأیید نهایی تحویل وارد حساب خود شوید.',
  },
  {
    kind: 'ANIMAL_OWNERSHIP_TRANSFERRED',
    channels: ['SMS'],
    smsFa: 'همزیست: مالکیت حیوان منتقل شد. پرونده در حساب شما در دسترس است.',
  },
  {
    kind: 'ANIMAL_DEAL_CANCELLED',
    channels: ['SMS'],
    smsFa: 'همزیست: این معامله لغو شد. وضعیت بیعانه در حساب شما نوشته شده است.',
  },
  {
    kind: 'ANIMAL_DEPOSIT_REFUNDED',
    channels: ['SMS'],
    smsFa: 'همزیست: مبلغی به شما بازگردانده شد. جزئیات در حساب شماست.',
  },
  {
    kind: 'ANIMAL_DEAL_DISPUTE_DECIDED',
    channels: ['SMS'],
    smsFa: 'همزیست: درباره اختلاف این معامله تصمیم گرفته شد. متن تصمیم در حساب شماست.',
  },
  {
    kind: 'COMMERCE_ORDER_PAID',
    channels: ['SMS'],
    smsFa: 'همزیست: پرداخت سفارش شما تأیید شد و برای فروشندگان ارسال شد.',
  },
  {
    kind: 'COMMERCE_SUBORDER_PAID',
    channels: ['SMS'],
    smsFa: 'همزیست: سفارش تازه‌ای برای فروشگاه شما ثبت شد و در انتظار پذیرش است.',
  },
  {
    kind: 'COMMERCE_SELLER_ACTIVATED',
    channels: ['SMS'],
    smsFa: 'همزیست: فروشگاه شما فعال شد و می‌توانید کالا عرضه کنید.',
  },
  {
    kind: 'COMMERCE_SELLER_STANDING_CHANGED',
    channels: ['SMS'],
    smsFa: 'همزیست: وضعیت فروشگاه شما تغییر کرد. دلیل آن در حساب شما نوشته شده است.',
  },
  {
    kind: 'COMMERCE_SETTLEMENT_PAID',
    channels: ['SMS'],
    smsFa: 'همزیست: تسویه فروشگاه شما واریز شد. شماره پیگیری در حساب شماست.',
  },
];

/**
 * Registered, and deliberately silent.
 *
 * These are kept out of the template list rather than listed there with no
 * sentence, because a template is the thing that carries a sentence — an
 * entry with none would make "every template has one" a rule with exceptions,
 * and a rule with exceptions stops catching the template somebody forgets to
 * write. Each of these is frequent, or something the person is already
 * looking at, or both: an SMS for every message in a negotiation is how
 * people turn notifications off entirely.
 */
export const IN_APP_ONLY_KINDS: readonly string[] = [
  'LISTING_INQUIRY_CREATED',
  'LISTING_INQUIRY_STATUS_CHANGED',
  'LISTING_OFFER_PROPOSED',
  'LISTING_OFFER_ACCEPTED',
  'INQUIRY_MESSAGE_POSTED',
  'ANIMAL_DEAL_DISPUTE_OPENED',
  'COMMERCE_SUBORDER_MOVED',
  'COMMERCE_RETURN_MOVED',
  'COMMERCE_SELLER_REVIEWED',
  'COMMERCE_PRODUCT_REVIEWED',
  'COMMERCE_SELLER_MEMBER_ADDED',
  'COMMERCE_LEDGER_ENTRY',
  'COMMERCE_REVIEW_REPLIED',
  'COMMERCE_QUESTION_ANSWERED',
  'COMMERCE_PRICE_DROP',
  'COMMERCE_LOYALTY_ADJUSTED',
];

const BY_KIND: ReadonlyMap<string, NotificationTemplate> = new Map(
  NOTIFICATION_TEMPLATES.map((template) => [template.kind, template]),
);

export const templateFor = (kind: string): NotificationTemplate | null => BY_KIND.get(kind) ?? null;

/**
 * Which channels a kind uses, given the policy in force.
 *
 * In-app is always one of them: the record is the notification. SMS is added
 * only when the catalogue lists it for that kind *and* the operator has turned
 * the channel on, because a message that leaves the product is an operational
 * decision, not a default.
 */
export function channelsFor(kind: string, policy: { smsEnabled: boolean }): readonly NotificationChannelName[] {
  const template = templateFor(kind);
  if (!policy.smsEnabled || template === null || !template.channels.includes('SMS') || !template.smsFa) return ['IN_APP'];
  return ['IN_APP', 'SMS'];
}

/** Characters that have no business in an SMS and a few that break one. */
const CONTROL = /[\u0000-\u001f\u007f‎‏‪-‮]/g;

/**
 * The text a channel is given.
 *
 * It is the catalogue sentence and nothing else: no reason, no name, no number,
 * no figure. A kind with no SMS sentence produces none, so a caller cannot
 * smuggle record text out by inventing a kind.
 */
export function renderSms(kind: string): string | null {
  const template = templateFor(kind);
  if (!template || !template.smsFa) return null;
  const text = template.smsFa.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

/**
 * Every kind the catalogue speaks for, silent ones included.
 *
 * "Is this event registered?" and "does this event send an SMS?" are different
 * questions, and a kind missing from here is a kind nobody reviewed.
 */
export const templatedKinds = (): readonly string[] => [
  ...NOTIFICATION_TEMPLATES.map((template) => template.kind),
  ...IN_APP_ONLY_KINDS,
];

/**
 * The kinds that may leave the product, and the kinds that may not.
 *
 * Listed separately so the review question — "what does Hamzist send by
 * SMS?" — has an answer that is one short list rather than a search through
 * a file. A kind listed with no channels is a deliberate silence: somebody
 * decided it stays in the app, and the decision is written down rather than
 * implied by absence.
 */
export const smsKinds = (): readonly string[] =>
  NOTIFICATION_TEMPLATES.filter((template) => template.channels.includes('SMS')).map((t) => t.kind);

export const inAppOnlyKinds = (): readonly string[] => [
  ...NOTIFICATION_TEMPLATES.filter((template) => !template.channels.includes('SMS')).map((t) => t.kind),
  ...IN_APP_ONLY_KINDS,
];
