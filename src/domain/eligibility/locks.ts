/**
 * Lock catalogue — §5.
 *
 * Each entry is the three parts a locked service must always show: the reason
 * in product language, the single next prerequisite, and a direct CTA. Which
 * lock applies to a given account is computed in PROMPT-005 from real state;
 * this file only fixes the wording and the destinations so no screen invents
 * its own explanation.
 *
 * Vocabulary follows §24.4: «کاربر», «دامپزشک معتمد», «مجوز جفت‌گیری»,
 * «شروع ثبت کنل», «ثبت حیوان هم‌زیست», «کاشت یا تأیید میکروچیپ».
 */
import type { LockDetail } from '../errors.ts';

export const LOCK_KYC_REQUIRED: LockDetail = {
  reason: 'برای ثبت حیوان هم‌زیست، احراز هویت لازم است',
  nextPrerequisite: 'برای ثبت حیوان هم‌زیست، ابتدا اطلاعات هویتی کاربر باید تکمیل و تأیید شود.',
  cta: { label: 'تکمیل اطلاعات هویتی', href: '/account/kyc' },
};

export const LOCK_MEMBERSHIP_REQUIRED: LockDetail = {
  reason: 'برای این خدمت، عضویت فعال انجمن لازم است',
  nextPrerequisite: 'عضویت مادام‌العمر پس از پرداخت موفق فعال می‌شود.',
  cta: { label: 'مشاهده عضویت', href: '/membership' },
};

export const LOCK_REGISTRATION_SHEET_REQUIRED: LockDetail = {
  reason: 'برای دریافت شجره‌نامه ابتدا برگه ثبتی این حیوان باید صادر شود',
  nextPrerequisite: 'برگه ثبتی پس از کاشت یا تأیید میکروچیپ و نمونه‌گیری صادر می‌شود.',
  cta: { label: 'دریافت برگه ثبتی', href: '/registration/batch' },
};

export const LOCK_KENNEL_NEEDS_SHEET: LockDetail = {
  reason: 'برای شروع ثبت کنل، حداقل یک حیوان دارای برگه ثبتی لازم است',
  nextPrerequisite: 'ابتدا برگه ثبتی یکی از حیوان‌های خود را دریافت کنید.',
  cta: { label: 'دریافت برگه ثبتی', href: '/registration/batch' },
};

export const LOCK_PERMIT_NEEDS_PEDIGREE: LockDetail = {
  reason: 'برای مجوز جفت‌گیری، حیوان شجره‌دار لازم است',
  nextPrerequisite: 'ابتدا شجره‌نامه حیوان خود را دریافت کنید.',
  cta: { label: 'دریافت شجره‌نامه', href: '/pedigree/request' },
};

export const LOCK_PUPPY_CARD_NEEDS_PERMIT: LockDetail = {
  reason: 'برای صدور کارت توله، مجوز جفت‌گیری صادرشده و ثبت توله زنده لازم است',
  nextPrerequisite: 'ابتدا مجوز جفت‌گیری را دریافت و نتیجه زایمان را ثبت کنید.',
  cta: { label: 'مجوز جفت‌گیری', href: '/mating/permits/new' },
};
