/**
 * Requests, conversations and contracts — pure rules (PHASE-4 PROMPT-005).
 *
 * Who may move a request from which status to which, which statuses are alive,
 * what a contract must contain, how its content is hashed and how a one-time
 * code is checked. The services load and lock rows; these decide.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

// ── Request statuses ─────────────────────────────────────────────────────────

export const REQUEST_STATUSES = [
  'WAITING_REVIEW',
  'PRELIMINARILY_ACCEPTED',
  'REJECTED',
  'NEGOTIATING',
  'CANCELLED',
  'EXPIRED',
  'CONTRACT_DRAFTING',
  'CONTRACT_CONFIRMED',
  'MATING_COMPLETED',
  'MATING_NOT_COMPLETED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_FA: Record<RequestStatus, string> = {
  WAITING_REVIEW: 'در انتظار بررسی',
  PRELIMINARILY_ACCEPTED: 'پذیرش اولیه',
  REJECTED: 'ردشده',
  NEGOTIATING: 'در حال مذاکره',
  CANCELLED: 'لغوشده',
  EXPIRED: 'منقضی‌شده',
  CONTRACT_DRAFTING: 'در حال تنظیم قرارداد',
  CONTRACT_CONFIRMED: 'قرارداد تأییدشده',
  MATING_COMPLETED: 'جفت‌گیری انجام‌شده',
  MATING_NOT_COMPLETED: 'جفت‌گیری انجام‌نشده',
};

/** Alive: counts for the one-live-pair rule and keeps the pair's attention. */
export const LIVE_STATUSES: readonly RequestStatus[] = [
  'WAITING_REVIEW',
  'PRELIMINARILY_ACCEPTED',
  'NEGOTIATING',
  'CONTRACT_DRAFTING',
  'CONTRACT_CONFIRMED',
];

/** Before any contract: these expire on their date and close when an animal leaves. */
export const PRE_CONTRACT_STATUSES: readonly RequestStatus[] = ['WAITING_REVIEW', 'PRELIMINARILY_ACCEPTED', 'NEGOTIATING'];

/** The conversation is open in these. */
export const CHAT_STATUSES: readonly RequestStatus[] = ['PRELIMINARILY_ACCEPTED', 'NEGOTIATING', 'CONTRACT_DRAFTING', 'CONTRACT_CONFIRMED'];

export type Party = 'SENDER' | 'RECEIVER';

export type RequestCommand =
  | 'ACCEPT'
  | 'REJECT'
  | 'PROPOSE_TERMS'
  | 'ACCEPT_TERMS'
  | 'CANCEL'
  | 'START_CONTRACT'
  | 'MARK_NOT_COMPLETED';

/**
 * The command table. `by` is who may issue it; for ACCEPT_TERMS it is the side
 * that did not propose, checked by the service against `terms_proposed_by`.
 */
const COMMANDS: Record<RequestCommand, { readonly from: readonly RequestStatus[]; readonly to: RequestStatus; readonly by: 'SENDER' | 'RECEIVER' | 'EITHER' }> = {
  ACCEPT: { from: ['WAITING_REVIEW'], to: 'PRELIMINARILY_ACCEPTED', by: 'RECEIVER' },
  REJECT: { from: ['WAITING_REVIEW', 'PRELIMINARILY_ACCEPTED', 'NEGOTIATING'], to: 'REJECTED', by: 'RECEIVER' },
  PROPOSE_TERMS: { from: ['PRELIMINARILY_ACCEPTED', 'NEGOTIATING'], to: 'NEGOTIATING', by: 'EITHER' },
  ACCEPT_TERMS: { from: ['NEGOTIATING'], to: 'PRELIMINARILY_ACCEPTED', by: 'EITHER' },
  CANCEL: { from: ['WAITING_REVIEW', 'PRELIMINARILY_ACCEPTED', 'NEGOTIATING', 'CONTRACT_DRAFTING'], to: 'CANCELLED', by: 'EITHER' },
  START_CONTRACT: { from: ['PRELIMINARILY_ACCEPTED'], to: 'CONTRACT_DRAFTING', by: 'EITHER' },
  MARK_NOT_COMPLETED: { from: ['CONTRACT_CONFIRMED'], to: 'MATING_NOT_COMPLETED', by: 'EITHER' },
};

/** Null when this party may issue this command now; otherwise why not. */
export function commandProblem(command: RequestCommand, status: RequestStatus, party: Party): string | null {
  const rule = COMMANDS[command];
  if (!rule.from.includes(status)) return 'این کار در وضعیت «' + REQUEST_STATUS_FA[status] + '» ممکن نیست.';
  if (rule.by !== 'EITHER' && rule.by !== party) {
    return rule.by === 'RECEIVER' ? 'این تصمیم با صاحب حیوانی است که درخواست به او رسیده.' : 'این کار با فرستنده درخواست است.';
  }
  return null;
}

export const targetOf = (command: RequestCommand): RequestStatus => COMMANDS[command].to;

/** Expired if a pre-contract request has passed its date; contracts do not expire this way. */
export const isDue = (status: RequestStatus, expiresAt: Date, now: Date): boolean =>
  PRE_CONTRACT_STATUSES.includes(status) && expiresAt.getTime() <= now.getTime();

/** The sender may choose a shorter validity than the managed default, never a longer one (PRODUCT_DECISIONS §8). */
export function expiryProblem(chosenDays: number | null, defaultDays: number): string | null {
  if (chosenDays === null) return null;
  if (!Number.isInteger(chosenDays) || chosenDays < 1) return 'اعتبار درخواست باید دست‌کم یک روز باشد.';
  if (chosenDays > defaultDays) return 'اعتبار درخواست نمی‌تواند بیشتر از ' + defaultDays.toLocaleString('fa-IR') + ' روز باشد.';
  return null;
}

// ── Terms ────────────────────────────────────────────────────────────────────

export const ROUTES = ['OFFICIAL', 'PERSONAL'] as const;
export type Route = (typeof ROUTES)[number];
export const ROUTE_FA: Record<Route, string> = { OFFICIAL: 'مسیر رسمی (مجوز انجمن)', PERSONAL: 'مسیر شخصی' };

export const PLACE_CATEGORIES = ['SIRE_OWNER', 'DAM_OWNER', 'NEUTRAL'] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];
export const PLACE_FA: Record<PlaceCategory, string> = { SIRE_OWNER: 'نزد مالک نر', DAM_OWNER: 'نزد مالک ماده', NEUTRAL: 'محل بی‌طرف' };

export const FINANCIAL_CATEGORIES = ['FIXED_AMOUNT', 'OFFSPRING_SHARE', 'MIXED', 'NO_PAYMENT', 'PRIVATE_DETAILS'] as const;
export type FinancialCategory = (typeof FINANCIAL_CATEGORIES)[number];
export const FINANCIAL_FA: Record<FinancialCategory, string> = {
  FIXED_AMOUNT: 'مبلغ ثابت',
  OFFSPRING_SHARE: 'سهم توله',
  MIXED: 'ترکیب مبلغ و سهم توله',
  NO_PAYMENT: 'بدون وجه',
  PRIVATE_DETAILS: 'جزئیات مالی خصوصی',
};

/** Said wherever money is mentioned: the finder never collects the mating agreement's money. */
export const NO_PAYMENT_THROUGH_HAMZIST_FA =
  'پرداخت توافق جفت‌گیری بیرون از همزیست انجام می‌شود؛ همزیست آن را دریافت، نگهداری یا تضمین نمی‌کند و داور حقوقی آن نیست.';

const oneOf = <T extends string>(value: unknown, list: readonly T[]): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);
export const isRoute = (v: unknown): v is Route => oneOf(v, ROUTES);
export const isPlace = (v: unknown): v is PlaceCategory => oneOf(v, PLACE_CATEGORIES);
export const isFinancial = (v: unknown): v is FinancialCategory => oneOf(v, FINANCIAL_CATEGORIES);

export interface Terms {
  readonly route: Route;
  readonly windowFrom: string;
  readonly windowTo: string;
  readonly cityFa: string;
  readonly placeCategory: PlaceCategory;
  readonly financialCategory: FinancialCategory;
  readonly specialConditionsFa: string | null;
}

export function termsProblem(t: { route: unknown; windowFrom: unknown; windowTo: unknown; cityFa: unknown; placeCategory: unknown; financialCategory: unknown }, today: string): string | null {
  if (!isRoute(t.route)) return 'مسیر رسمی یا شخصی را انتخاب کنید.';
  if (!isPlace(t.placeCategory)) return 'محل جفت‌گیری را انتخاب کنید.';
  if (!isFinancial(t.financialCategory)) return 'نوع توافق مالی را انتخاب کنید.';
  if (typeof t.cityFa !== 'string' || t.cityFa.trim() === '' || t.cityFa.length > 60) return 'شهر را بنویسید.';
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof t.windowFrom !== 'string' || typeof t.windowTo !== 'string' || !date.test(t.windowFrom) || !date.test(t.windowTo)) {
    return 'بازه تاریخ پیشنهادی را کامل وارد کنید.';
  }
  if (t.windowFrom > t.windowTo) return 'شروع بازه باید پیش از پایان آن باشد.';
  if (t.windowTo < today) return 'بازه پیشنهادی گذشته است.';
  return null;
}

// ── Contract ─────────────────────────────────────────────────────────────────

/** The clauses every contract must carry (PRODUCT_DECISIONS §9, R9). The text is the superadmin's. */
export const REQUIRED_CLAUSE_KEYS = [
  'TRAVEL',
  'VET_COSTS',
  'REPEAT_AFTER_NO_PREGNANCY',
  'CANCELLATION',
  'TEMPORARY_CARE',
  'OFFSPRING_SHARE_REGISTRATION',
  'NATURAL_RISK',
] as const;

export const REQUIRED_CLAUSE_FA: Record<(typeof REQUIRED_CLAUSE_KEYS)[number], string> = {
  TRAVEL: 'رفت‌وآمد',
  VET_COSTS: 'هزینه‌های دامپزشکی',
  REPEAT_AFTER_NO_PREGNANCY: 'تکرار در صورت عدم آبستنی',
  CANCELLATION: 'لغو',
  TEMPORARY_CARE: 'نگهداری موقت',
  OFFSPRING_SHARE_REGISTRATION: 'سهم و ثبت توله',
  NATURAL_RISK: 'پذیرش ریسک طبیعی',
};

export interface TemplateClause {
  readonly key: string;
  readonly required: boolean;
  readonly titleFa: string;
  readonly bodyFa: string;
}

export function templateProblem(clauses: readonly TemplateClause[]): string | null {
  const keys = new Set<string>();
  for (const c of clauses) {
    if (!/^[A-Z][A-Z0-9_]{1,40}$/.test(c.key)) return 'کلید بند نامعتبر است: ' + c.key;
    if (keys.has(c.key)) return 'کلید بند تکراری است: ' + c.key;
    keys.add(c.key);
    if (c.titleFa.trim() === '' || c.bodyFa.trim() === '') return 'عنوان و متن هر بند لازم است.';
  }
  for (const key of REQUIRED_CLAUSE_KEYS) {
    const clause = clauses.find((c) => c.key === key);
    if (!clause) return 'بند اجباری «' + REQUIRED_CLAUSE_FA[key] + '» در قالب نیست.';
    if (!clause.required) return 'بند «' + REQUIRED_CLAUSE_FA[key] + '» باید اجباری باشد.';
  }
  return null;
}

export interface ContractContent {
  readonly templateId: string;
  readonly templateVersion: number;
  readonly requestId: string;
  readonly parties: {
    readonly sire: { readonly accountId: string; readonly nameFa: string };
    readonly dam: { readonly accountId: string; readonly nameFa: string };
  };
  readonly animals: {
    readonly sire: { readonly animalId: string; readonly nameFa: string; readonly breedFa: string | null; readonly chipTail: string | null };
    readonly dam: { readonly animalId: string; readonly nameFa: string; readonly breedFa: string | null; readonly chipTail: string | null };
  };
  readonly terms: Terms;
  /** Private: visible only to the two parties, never outside the contract. */
  readonly financialDetailsFa: string | null;
  readonly clauses: ReadonlyArray<{ readonly key: string; readonly required: boolean; readonly titleFa: string; readonly bodyFa: string; readonly fillFa: string | null }>;
}

/** Canonical JSON (sorted keys) so the same content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalJson(v)) .join(',') + '}';
}

export const contentHash = (content: ContractContent): string => createHash('sha256').update(canonicalJson(content)).digest('hex');

/** Optional clauses the parties chose, with their own fills; required clauses are always all present. */
export function applyClauseChoices(
  template: readonly TemplateClause[],
  chosen: ReadonlyArray<{ readonly key: string; readonly fillFa: string | null }>,
): ContractContent['clauses'] {
  const unknown = chosen.find((c) => !template.some((t) => t.key === c.key));
  if (unknown) throw new Error('UNKNOWN_CLAUSE:' + unknown.key);
  return template
    .filter((t) => t.required || chosen.some((c) => c.key === t.key))
    .map((t) => ({ key: t.key, required: t.required, titleFa: t.titleFa, bodyFa: t.bodyFa, fillFa: chosen.find((c) => c.key === t.key)?.fillFa?.trim() || null }));
}

/** The one name the confirmation goes by until a lawyer has approved anything stronger. */
export const CONFIRMATION_NAME_FA = 'تأیید دوطرفه با کد یک‌بارمصرف';
export const NOT_A_LEGAL_SIGNATURE_FA =
  'این تأیید با کد یک‌بارمصرف ثبت می‌شود و تا تأیید حقوقی، «امضای قانونی تضمین‌شده» محسوب نمی‌شود.';

// ── One-time code ────────────────────────────────────────────────────────────

export const newCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const hashCode = (otpId: string, code: string): string => createHash('sha256').update(otpId + ':' + code).digest('hex');
export function codeMatches(otpId: string, code: string, storedHash: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const a = Buffer.from(hashCode(otpId, code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Only the last four digits of a chip ever leave the record, even inside a contract. */
export const chipTail = (number: string | null): string | null => (number ? '…' + number.slice(-4) : null);

// ── PROMPT-006: what a confirmed contract leads to ───────────────────────────

/** The facts re-read at handoff time for one side; nothing is taken from the contract snapshot. */
export interface HandoffSide {
  readonly expectedOwnerId: string;
  readonly ownerId: string;
  readonly status: string;
  readonly lifeStatus: string;
  readonly sex: string | null;
  readonly species: string;
  readonly resolvedBreedId: string | null;
  readonly hasChip: boolean;
  readonly hasPedigree: boolean;
}

/**
 * Every reason the handoff cannot happen now. The contract is a snapshot; the
 * animals may have changed hands, died or lost a chip since, so each rule is
 * checked again against the current records. Pedigree matters only on the
 * official path, as it does for any permit.
 */
export function handoffProblems(route: Route, sire: HandoffSide, dam: HandoffSide): string[] {
  const out: string[] = [];
  for (const [label, side] of [['نر', sire], ['ماده', dam]] as const) {
    if (side.ownerId !== side.expectedOwnerId) out.push('مالک حیوان ' + label + ' پس از قرارداد تغییر کرده است.');
    if (side.status !== 'REGISTERED' || side.lifeStatus !== 'ACTIVE') out.push('حیوان ' + label + ' دیگر پرونده فعال ندارد.');
    if (!side.hasChip) out.push('حیوان ' + label + ' میکروچیپ ثبت‌شده ندارد.');
    if (route === 'OFFICIAL' && !side.hasPedigree) out.push('مسیر رسمی به شجره‌نامه صادرشده برای حیوان ' + label + ' نیاز دارد.');
  }
  if (sire.sex !== 'MALE' || dam.sex !== 'FEMALE') out.push('جفت‌گیری بین یک نر و یک ماده ثبت می‌شود.');
  if (sire.species !== dam.species || sire.resolvedBreedId === null || sire.resolvedBreedId !== dam.resolvedBreedId) {
    out.push('دو حیوان باید از یک نژاد باشند.');
  }
  return out;
}

export const OFFICIAL_CONSEQUENCES_FA: readonly string[] = [
  'قرارداد همزیست مجوز صادر نمی‌کند و جای مجوز را نمی‌گیرد؛ همان پرونده مجوز رسمی باز می‌شود.',
  'طرف مقابل باید پرونده مجوز را جداگانه تأیید کند، توافق تقسیم ثبت شود، هزینه مجوز پرداخت شود و انجمن آن را بررسی کند.',
  'پس از صدور مجوز، تاریخ جفت‌گیری، اعلام آبستنی، ثبت تولد، تقسیم توله‌ها و کارت توله در همان پرونده انجام می‌شود.',
];

export const PERSONAL_CONSEQUENCES_FA: readonly string[] = [
  'پرونده شخصی شماره مجوز، بررسی انجمن، تقسیم رسمی توله یا کارت توله ندارد و به هیچ‌کدام تبدیل نمی‌شود.',
  'تاریخ جفت‌گیری که هر دو طرف تأیید کنند، در آخرین جفت‌گیری هر دو حیوان ثبت می‌شود.',
  'اعلام آبستنی، تولد و تقسیم رسمی فقط در مسیر مجوز رسمی وجود دارد.',
];

export const PATH_IS_FINAL_FA =
  'مسیر انتخاب‌شده و پرونده‌ای که به آن وصل می‌شود بعداً عوض نمی‌شود؛ برای مسیر دیگر باید این قرارداد لغو شود و درخواست و قرارداد تازه‌ای تأیید شود.';
