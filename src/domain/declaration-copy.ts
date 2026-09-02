/**
 * The wording of the personal declaration — §20, §17.3.
 *
 * These sentences define the scope of the service, so they live in one place
 * that both the server and the client screens read. Keeping them here also
 * keeps the client bundle free of the service module's database imports.
 */

export const DECLARATION_STATUS_FA: Record<string, string> = {
  PENDING_COUNTERPARTY_CONFIRMATION: 'در انتظار تأیید طرف مقابل',
  CONFIRMED: 'وجود توافق تأیید شد',
  REJECTED: 'طرف مقابل وجود توافق را رد کرد',
  CANCELLED: 'لغوشده توسط آغازکننده',
};

export const NOTE_KIND_FA: Record<string, string> = {
  MATING_DATE: 'تاریخ جفت‌گیری (شخصی)',
  PREGNANCY: 'یادداشت بارداری (شخصی)',
  BIRTH: 'یادداشت زایمان (شخصی)',
};

/** The scope sentence this service must always show (§20). */
export const SCOPE_NOTE_FA =
  'این سرویس فقط «وجود توافق خارج از هم‌زیست» را ثبت می‌کند. متن، فایل، تصویر، امضا و شروط توافق در هم‌زیست ذخیره نمی‌شود و هم‌زیست اعتبار یا داوری آن را بر عهده ندارد.';

/** What a declaration can never produce (§20, §16, §19). */
export const NO_OFFICIAL_EFFECT_NOTE_FA =
  'این مسیر مجوز رسمی، lineage رسمی، تاریخ تأییدشده رسمی، تخصیص مالکیت توله یا کارت توله نمی‌سازد و پرداختی ندارد. برای مسیر رسمی باید مجوز جفت‌گیری بگیرید.';

/** Personal notes are the owner's own record and stay UNVERIFIED (§17.3). */
export const UNVERIFIED_NOTE_FA =
  'یادداشت‌های شخصی UNVERIFIED هستند، مبنای رسمی Cooldown و Timeline را تغییر نمی‌دهند و به مجوز، تخصیص یا کارت توله وصل نمی‌شوند.';
