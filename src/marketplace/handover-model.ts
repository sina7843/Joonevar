/**
 * The rules of the meeting — PROMPT-007.
 *
 * The lifecycle, the code policy and the list of things that must still be true
 * at the instant the animal changes hands. Everything here is pure, so the
 * conditions can be stated once and checked both when a screen renders and
 * inside the transaction that actually transfers the animal.
 */

export const HANDOVER_STATUSES = [
  'SCHEDULED',
  'CODE_ISSUED',
  'SELLER_ENTERED',
  'COMPLETED',
  'REFUSED',
  'EXPIRED',
  'CANCELLED',
  'ON_HOLD',
] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];

export const HANDOVER_STATUS_FA: Record<HandoverStatus, string> = {
  SCHEDULED: 'زمان و محل تعیین شد',
  CODE_ISSUED: 'کد تحویل صادر شد',
  SELLER_ENTERED: 'کد را فروشنده وارد کرد؛ در انتظار تأیید خریدار',
  COMPLETED: 'تحویل انجام و مالکیت منتقل شد',
  REFUSED: 'تحویل انجام نشد',
  EXPIRED: 'مهلت کد تحویل گذشت',
  CANCELLED: 'تحویل لغو شد',
  ON_HOLD: 'به دلیل پرونده اختلاف متوقف است',
};

export type HandoverActor = 'BUYER' | 'SELLER' | 'ADMIN' | 'SYSTEM';

interface Move {
  readonly from: HandoverStatus;
  readonly to: HandoverStatus;
  readonly by: readonly HandoverActor[];
}

/**
 * Every state change that exists.
 *
 * `COMPLETED` is reachable only from `SELLER_ENTERED` and only by the buyer or
 * by an administrator recovering a meeting that really happened: the seller
 * cannot finish a handover alone, whatever they typed, because the point of the
 * buyer's confirmation is that the animal is in front of them.
 */
const MOVES: readonly Move[] = [
  { from: 'SCHEDULED', to: 'CODE_ISSUED', by: ['BUYER'] },
  { from: 'SCHEDULED', to: 'CANCELLED', by: ['BUYER', 'SELLER', 'ADMIN'] },
  { from: 'SCHEDULED', to: 'ON_HOLD', by: ['SYSTEM', 'ADMIN'] },
  { from: 'CODE_ISSUED', to: 'SELLER_ENTERED', by: ['SELLER'] },
  { from: 'CODE_ISSUED', to: 'EXPIRED', by: ['SYSTEM'] },
  { from: 'CODE_ISSUED', to: 'REFUSED', by: ['BUYER', 'SELLER'] },
  { from: 'CODE_ISSUED', to: 'CANCELLED', by: ['BUYER', 'SELLER', 'ADMIN'] },
  { from: 'CODE_ISSUED', to: 'ON_HOLD', by: ['SYSTEM', 'ADMIN'] },
  { from: 'SELLER_ENTERED', to: 'COMPLETED', by: ['BUYER', 'ADMIN'] },
  { from: 'SELLER_ENTERED', to: 'REFUSED', by: ['BUYER', 'SELLER'] },
  { from: 'SELLER_ENTERED', to: 'ON_HOLD', by: ['SYSTEM', 'ADMIN'] },
  // A meeting that did not happen can be arranged again; a completed one cannot.
  { from: 'REFUSED', to: 'SCHEDULED', by: ['BUYER', 'SELLER'] },
  { from: 'EXPIRED', to: 'SCHEDULED', by: ['BUYER', 'SELLER'] },
  { from: 'ON_HOLD', to: 'SCHEDULED', by: ['ADMIN'] },
  { from: 'ON_HOLD', to: 'CANCELLED', by: ['ADMIN'] },
];

export const canMoveHandover = (from: HandoverStatus, to: HandoverStatus, by: HandoverActor): boolean =>
  MOVES.some((move) => move.from === from && move.to === to && move.by.includes(by));

export const handoverMovesFrom = (from: HandoverStatus, by: HandoverActor): readonly HandoverStatus[] =>
  MOVES.filter((move) => move.from === from && move.by.includes(by)).map((move) => move.to);

/** Nothing about a completed handover is editable: it is what happened. */
export const isHandoverFinal = (status: HandoverStatus): boolean => status === 'COMPLETED';

/** A meeting that can still be rearranged rather than one that is over. */
export const isReschedulable = (status: HandoverStatus): boolean =>
  status === 'REFUSED' || status === 'EXPIRED' || status === 'SCHEDULED';

// ── the one-time code ──────────────────────────────────────────────────────

export const HANDOVER_CODE_LENGTH = 6;

export interface CodePolicy {
  readonly validityMinutes: number;
  readonly maxAttempts: number;
  readonly lockMinutes: number;
  readonly maxIssues: number;
}

export type CodeCheck =
  | { readonly state: 'OK' }
  | { readonly state: 'NO_CODE'; readonly messageFa: string }
  | { readonly state: 'EXPIRED'; readonly messageFa: string }
  | { readonly state: 'LOCKED'; readonly retryAfterSeconds: number; readonly messageFa: string }
  | { readonly state: 'WRONG'; readonly attemptsRemaining: number; readonly messageFa: string };

export interface CodeState {
  readonly codeHash: string | null;
  readonly codeExpiresAt: Date | null;
  readonly codeAttempts: number;
  readonly codeLockedUntil: Date | null;
  readonly codeMaxAttempts: number | null;
}

/**
 * Whether this code may even be tried right now.
 *
 * Asked before the hashes are compared, so a locked or expired code costs an
 * attacker nothing to learn and tells them nothing about the code itself.
 */
export function codeAttemptAllowed(state: CodeState, now: Date): CodeCheck {
  if (state.codeHash === null) {
    return { state: 'NO_CODE', messageFa: 'برای این تحویل کدی صادر نشده است؛ خریدار باید کد را بگیرد.' };
  }
  if (state.codeLockedUntil !== null && state.codeLockedUntil.getTime() > now.getTime()) {
    return {
      state: 'LOCKED',
      retryAfterSeconds: Math.ceil((state.codeLockedUntil.getTime() - now.getTime()) / 1000),
      messageFa: 'به دلیل تلاش‌های ناموفق، ورود کد موقتاً بسته است.',
    };
  }
  if (state.codeExpiresAt !== null && state.codeExpiresAt.getTime() <= now.getTime()) {
    return { state: 'EXPIRED', messageFa: 'مهلت این کد گذشته است؛ خریدار می‌تواند کد تازه بگیرد.' };
  }
  return { state: 'OK' };
}

/** What a wrong attempt does: count it, and lock once the ceiling is reached. */
export function afterWrongAttempt(
  state: CodeState,
  policy: CodePolicy,
  now: Date,
): { attempts: number; lockedUntil: Date | null; attemptsRemaining: number } {
  const attempts = state.codeAttempts + 1;
  const max = state.codeMaxAttempts ?? policy.maxAttempts;
  const remaining = Math.max(max - attempts, 0);
  return {
    attempts,
    lockedUntil: remaining === 0 ? new Date(now.getTime() + policy.lockMinutes * 60_000) : null,
    attemptsRemaining: remaining,
  };
}

// ── what must still be true at the last moment ─────────────────────────────

export const TRANSFER_CONDITIONS = [
  'DEPOSIT_VERIFIED',
  'MINIMUM_AGE_REACHED',
  'MICROCHIP_REGISTERED',
  'SELLER_STILL_AUTHORISED',
  'ANIMAL_TRANSFERABLE',
  'NO_EXISTING_TRANSFER',
  'NO_OPEN_DISPUTE',
] as const;
export type TransferCondition = (typeof TRANSFER_CONDITIONS)[number];

export const TRANSFER_CONDITION_FA: Record<TransferCondition, string> = {
  DEPOSIT_VERIFIED: 'بیعانه این معامله باید پرداخت و روی سرور تأیید شده باشد.',
  MINIMUM_AGE_REACHED: 'حیوان باید به حداقل سن مجاز تحویل رسیده باشد.',
  MICROCHIP_REGISTERED: 'میکروچیپ ثبت‌شده لازم است؛ خوداظهاری کافی نیست.',
  SELLER_STILL_AUTHORISED: 'فروشنده باید هنوز مالک یا کنل مجاز همین حیوان باشد.',
  ANIMAL_TRANSFERABLE: 'حیوان باید زنده و قابل انتقال باشد.',
  NO_EXISTING_TRANSFER: 'این حیوان نباید انتقال کامل‌شده دیگری داشته باشد.',
  NO_OPEN_DISPUTE: 'تا تعیین تکلیف پرونده اختلاف، انتقال انجام نمی‌شود.',
};

export interface TransferFacts {
  readonly depositVerified: boolean;
  readonly minimumAgeReached: boolean;
  readonly microchipRegistered: boolean;
  readonly sellerStillAuthorised: boolean;
  readonly animalTransferable: boolean;
  readonly noExistingTransfer: boolean;
  readonly noOpenDispute: boolean;
}

/**
 * Everything that is not true, said at once.
 *
 * Read immediately before the transfer inside the same transaction, not when
 * the meeting was arranged: an animal can change hands, die, be suspended or
 * fall into a dispute between the two moments, and the check that matters is
 * the one at the instant the ownership moves.
 */
export function transferBlockers(facts: TransferFacts): readonly TransferCondition[] {
  const blockers: TransferCondition[] = [];
  if (!facts.depositVerified) blockers.push('DEPOSIT_VERIFIED');
  if (!facts.minimumAgeReached) blockers.push('MINIMUM_AGE_REACHED');
  if (!facts.microchipRegistered) blockers.push('MICROCHIP_REGISTERED');
  if (!facts.sellerStillAuthorised) blockers.push('SELLER_STILL_AUTHORISED');
  if (!facts.animalTransferable) blockers.push('ANIMAL_TRANSFERABLE');
  if (!facts.noExistingTransfer) blockers.push('NO_EXISTING_TRANSFER');
  if (!facts.noOpenDispute) blockers.push('NO_OPEN_DISPUTE');
  return blockers;
}

// ── the statement both sides sign off ──────────────────────────────────────

export interface StatementInput {
  readonly version: string;
  readonly animalNameFa: string;
  readonly petId: string | null;
  readonly microchipNumber: string | null;
  readonly sellerMobile: string;
  readonly buyerMobile: string;
  readonly priceToman: bigint | null;
  readonly depositToman: bigint | null;
  readonly methodFa: string;
  readonly placeFa: string | null;
  readonly at: Date;
}

const fa = (value: bigint | null) => (value === null ? '—' : value.toLocaleString('fa-IR'));

/**
 * The digital handover statement.
 *
 * Built from the recorded facts of the deal and frozen on the row, so what the
 * two people confirmed is readable afterwards exactly as it was shown to them.
 * It states plainly what Hamzist did and did not witness: the platform recorded
 * a handover both sides confirmed, and it did not weigh the animal's health,
 * the money settled outside, or anything else that happened in that room.
 */
export function handoverStatement(input: StatementInput): string {
  const when = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'full', timeStyle: 'short' }).format(input.at);
  return [
    'صورت‌جلسه تحویل حیوان — نسخه ' + input.version,
    '',
    'حیوان: ' + input.animalNameFa,
    'شناسه ثبتی: ' + (input.petId ?? 'ثبت نشده'),
    'میکروچیپ: ' + (input.microchipNumber ?? 'ثبت نشده'),
    'فروشنده: ' + input.sellerMobile,
    'خریدار: ' + input.buyerMobile,
    'قیمت نهایی توافق‌شده: ' + fa(input.priceToman) + ' تومان',
    'بیعانه پرداخت‌شده در همزیست: ' + fa(input.depositToman) + ' تومان',
    'روش تحویل: ' + input.methodFa + (input.placeFa ? ' — ' + input.placeFa : ''),
    'زمان ثبت تحویل: ' + when,
    '',
    'خریدار و فروشنده تأیید می‌کنند که حیوان در همین زمان و مکان تحویل شده و مالکیت در همزیست منتقل می‌شود.',
    'همزیست تحویل را بر اساس کد یک‌بارمصرف و تأیید دوطرفه ثبت می‌کند و درباره وضعیت سلامت حیوان،',
    'تسویه باقی قیمت بیرون از همزیست و توافق‌های شفاهی طرفین اظهارنظر یا داوری نمی‌کند.',
    'مالک پیشین و مدارک صادرشده در دوره او در پرونده حیوان باقی می‌مانند و حذف نمی‌شوند.',
  ].join('\n');
}
