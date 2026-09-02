/**
 * Eligibility — §5 and the access matrix of Flow Map node 2:6.
 *
 * These are pure functions over a snapshot of facts, so the rules can be read,
 * tested and reasoned about without a database. The resolver that loads the
 * facts lives next to it; every screen and every server action asks the same
 * function, which is what keeps a UI lock and a server refusal in agreement.
 *
 * Two rules the source is emphatic about are enforced here:
 *  - registering an animal needs approved KYC and **not** membership (§9.1);
 *  - the cooldown is advisory and never becomes a blocking condition (§17.2).
 */
import type { LockDetail } from '../errors.ts';
import {
  LOCK_KENNEL_NEEDS_SHEET,
  LOCK_KYC_REQUIRED,
  LOCK_MEMBERSHIP_REQUIRED,
  LOCK_PERMIT_NEEDS_PEDIGREE,
  LOCK_PUPPY_CARD_NEEDS_PERMIT,
  LOCK_REGISTRATION_SHEET_REQUIRED,
} from './locks.ts';

export const SERVICES = [
  'DASHBOARD',
  'ANIMAL_REGISTRATION',
  'MEMBERSHIP',
  'VET_VISIT_REQUEST',
  'REGISTRATION_SHEET',
  'PEDIGREE',
  'KENNEL',
  'MATING_PERMIT',
  'PUPPY_CARD',
  'PERSONAL_DECLARATION',
  'HAMZIST_CONTRACT',
] as const;
export type ServiceName = (typeof SERVICES)[number];

/**
 * The facts §5 actually depends on. Counts rather than booleans, because the
 * matrix distinguishes "at least one registration sheet" from "this animal has
 * one", and later prompts fill the same shape with real numbers.
 */
export interface EligibilityFacts {
  readonly kycApproved: boolean;
  readonly membershipActive: boolean;
  readonly registeredAnimals: number;
  readonly animalsWithRegistrationSheet: number;
  readonly animalsWithPedigree: number;
  readonly issuedMatingPermits: number;
  readonly puppiesWithFinalAllocation: number;
}

export const NO_FACTS: EligibilityFacts = {
  kycApproved: false,
  membershipActive: false,
  registeredAnimals: 0,
  animalsWithRegistrationSheet: 0,
  animalsWithPedigree: 0,
  issuedMatingPermits: 0,
  puppiesWithFinalAllocation: 0,
};

export type Eligibility =
  | { readonly allowed: true }
  /** `comingSoon` marks the Hamzist contract, which is disabled rather than locked (§20). */
  | { readonly allowed: false; readonly lock: LockDetail; readonly comingSoon?: boolean };

const ALLOWED: Eligibility = { allowed: true };
const lockedBy = (lock: LockDetail): Eligibility => ({ allowed: false, lock });

const LOCK_ANIMAL_NEEDED: LockDetail = {
  reason: 'برای این خدمت، حداقل یک حیوان ثبت‌شده لازم است',
  nextPrerequisite: 'ابتدا حیوان خود را در هم‌زیست ثبت کنید.',
  cta: { label: 'ثبت حیوان هم‌زیست', href: '/animals/new' },
};

const LOCK_PUPPY_ALLOCATION: LockDetail = {
  reason: 'کارت توله تا نهایی‌شدن تخصیص دوطرفه صادر نمی‌شود',
  nextPrerequisite: 'هر دو مالک باید همان نسخه تخصیص را تأیید کنند.',
  cta: { label: 'مشاهده تخصیص توله‌ها', href: '/mating' },
};

const LOCK_CONTRACT_SOON: LockDetail = {
  reason: 'قرارداد هم‌زیست هنوز فعال نیست',
  nextPrerequisite: 'این قابلیت در فاز بعدی ارائه می‌شود.',
  cta: { label: 'بازگشت به داشبورد', href: '/dashboard' },
};

/**
 * One service, one answer. The order of checks matches the matrix column order,
 * so the reported lock is always the nearest missing prerequisite rather than
 * the last one that failed.
 */
export function evaluate(service: ServiceName, facts: EligibilityFacts): Eligibility {
  switch (service) {
    case 'DASHBOARD':
      return ALLOWED;

    // §9.1 and acceptance A-001: approved KYC opens this, membership does not.
    case 'ANIMAL_REGISTRATION':
      return facts.kycApproved ? ALLOWED : lockedBy(LOCK_KYC_REQUIRED);

    // Membership itself is reachable once identity is verified; before that the
    // matrix sends the person to KYC.
    case 'MEMBERSHIP':
      return facts.kycApproved ? ALLOWED : lockedBy(LOCK_KYC_REQUIRED);

    case 'VET_VISIT_REQUEST':
      if (!facts.kycApproved) return lockedBy(LOCK_KYC_REQUIRED);
      if (!facts.membershipActive) return lockedBy(LOCK_MEMBERSHIP_REQUIRED);
      if (facts.registeredAnimals < 1) return lockedBy(LOCK_ANIMAL_NEEDED);
      return ALLOWED;

    case 'REGISTRATION_SHEET':
      if (!facts.kycApproved) return lockedBy(LOCK_KYC_REQUIRED);
      if (!facts.membershipActive) return lockedBy(LOCK_MEMBERSHIP_REQUIRED);
      if (facts.registeredAnimals < 1) return lockedBy(LOCK_ANIMAL_NEEDED);
      return ALLOWED;

    case 'PEDIGREE':
      if (!facts.kycApproved) return lockedBy(LOCK_KYC_REQUIRED);
      if (!facts.membershipActive) return lockedBy(LOCK_MEMBERSHIP_REQUIRED);
      if (facts.animalsWithRegistrationSheet < 1) return lockedBy(LOCK_REGISTRATION_SHEET_REQUIRED);
      return ALLOWED;

    // §15.2: active membership and at least one registration sheet.
    case 'KENNEL':
      if (!facts.kycApproved) return lockedBy(LOCK_KYC_REQUIRED);
      if (!facts.membershipActive) return lockedBy(LOCK_MEMBERSHIP_REQUIRED);
      if (facts.animalsWithRegistrationSheet < 1) return lockedBy(LOCK_KENNEL_NEEDS_SHEET);
      return ALLOWED;

    // §16: a pedigree animal is the prerequisite. Cooldown is never checked here.
    case 'MATING_PERMIT':
      if (!facts.kycApproved) return lockedBy(LOCK_KYC_REQUIRED);
      if (!facts.membershipActive) return lockedBy(LOCK_MEMBERSHIP_REQUIRED);
      if (facts.animalsWithPedigree < 1) return lockedBy(LOCK_PERMIT_NEEDS_PEDIGREE);
      return ALLOWED;

    // §19.4: an issued permit, a registered live puppy and a final allocation.
    case 'PUPPY_CARD':
      if (!facts.kycApproved) return lockedBy(LOCK_KYC_REQUIRED);
      if (facts.issuedMatingPermits < 1) return lockedBy(LOCK_PUPPY_CARD_NEEDS_PERMIT);
      if (facts.puppiesWithFinalAllocation < 1) return lockedBy(LOCK_PUPPY_ALLOCATION);
      return ALLOWED;

    // §20: KYC, active membership and two existing animal records. No payment,
    // and no registration sheet or pedigree among them. The second
    // animal is the counterparty's and is checked when the invitation is sent.
    case 'PERSONAL_DECLARATION':
      if (!facts.kycApproved) return lockedBy(LOCK_KYC_REQUIRED);
      if (!facts.membershipActive) return lockedBy(LOCK_MEMBERSHIP_REQUIRED);
      if (facts.registeredAnimals < 1) return lockedBy(LOCK_ANIMAL_NEEDED);
      return ALLOWED;

    case 'HAMZIST_CONTRACT':
      return { allowed: false, lock: LOCK_CONTRACT_SOON, comingSoon: true };
  }
}

export function evaluateAll(facts: EligibilityFacts): Record<ServiceName, Eligibility> {
  const out = {} as Record<ServiceName, Eligibility>;
  for (const service of SERVICES) out[service] = evaluate(service, facts);
  return out;
}

/**
 * Whether a trusted veterinarian may take on new work — §7.1 and D05.
 *
 * Losing membership stops new assignments and removes the vet from the Finder.
 * It does not remove the role, the locations or the ability to finish work that
 * was already active, and reactivation lifts exactly this restriction with no
 * onboarding. A rejected professional approval is a separate state.
 */
export interface VetWorkEligibility {
  readonly canAcceptNewWork: boolean;
  readonly appearsInFinder: boolean;
  readonly canContinueActiveWork: boolean;
  readonly reasonFa: string | null;
}

export function vetWorkEligibility(input: {
  roleStatus: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  membershipActive: boolean;
}): VetWorkEligibility {
  if (input.roleStatus === 'REJECTED' || input.roleStatus === 'PENDING') {
    return {
      canAcceptNewWork: false,
      appearsInFinder: false,
      // A professional approval that is not in place is not a membership issue.
      canContinueActiveWork: false,
      reasonFa: 'تأیید حرفه‌ای این حساب فعال نیست.',
    };
  }

  if (!input.membershipActive) {
    return {
      canAcceptNewWork: false,
      appearsInFinder: false,
      // Work already assigned and active stays completable (§7.1).
      canContinueActiveWork: true,
      reasonFa: 'عضویت شما فعال نیست؛ درخواست جدیدی به شما تخصیص داده نمی‌شود، ولی کارهای فعال قبلی قابل تکمیل‌اند.',
    };
  }

  if (input.roleStatus === 'SUSPENDED') {
    return {
      canAcceptNewWork: false,
      appearsInFinder: false,
      canContinueActiveWork: true,
      reasonFa: 'پذیرش کار جدید برای این حساب متوقف است؛ کارهای فعال قبلی قابل تکمیل‌اند.',
    };
  }

  return { canAcceptNewWork: true, appearsInFinder: true, canContinueActiveWork: true, reasonFa: null };
}
