/**
 * Catalogue of product settings — D15, D16, §21.4, §22, §29.2.
 *
 * `seedValue: null` means NOT_CONFIGURED and stays that way until the
 * responsible team enters the real value. No tariff, bank account, card number
 * or issuer name is invented here.
 */
import type { SettingGroupName } from '../authz/policy.ts';

export type SettingKindName = 'INT' | 'MONEY_TOMAN' | 'STRING' | 'TEXT' | 'BOOL' | 'JSON';
export type SettingSourceName = 'PRODUCT_DECISION' | 'DOCUMENTED_POLICY' | 'TECHNICAL_DEFAULT' | 'OPERATIONAL_DATA';

export interface SettingDefinition {
  readonly key: string;
  readonly group: SettingGroupName;
  readonly kind: SettingKindName;
  readonly source: SettingSourceName;
  readonly labelFa: string;
  readonly noteFa?: string;
  /** null = NOT_CONFIGURED at seed time. */
  readonly seedValue: unknown;
  readonly min?: number;
  readonly max?: number;
}

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  // ── Deadlines ───────────────────────────────────────────────────────────
  {
    key: 'referral.validity_days',
    group: 'DEADLINES',
    kind: 'INT',
    source: 'PRODUCT_DECISION',
    labelFa: 'مهلت اعتبار کد مراجعه (روز)',
    noteFa: 'مقدار اولیه ۲۱ روز طبق D15. هنگام صدور هر کد، مقدار فعال خوانده و روی همان کد ثبت می‌شود.',
    seedValue: 21,
    min: 1,
    max: 365,
  },

  // ── Tariffs ─────────────────────────────────────────────────────────────
  {
    key: 'fee.membership_toman',
    group: 'FEES',
    kind: 'MONEY_TOMAN',
    source: 'PRODUCT_DECISION',
    labelFa: 'هزینه عضویت انجمن',
    noteFa: 'مبلغ مبنای مستند ۳۰۰٬۰۰۰ تومان. عضویت مادام‌العمر است و تمدید ندارد (D04).',
    seedValue: '300000',
  },
  {
    key: 'fee.registration_sheet_toman',
    group: 'FEES',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'هزینه صدور برگه ثبتی (هر حیوان)',
    noteFa: 'تعرفه واقعی هنوز اعلام نشده است؛ تا ورود مقدار، «تعیین‌نشده» می‌ماند و مسیر پرداخت باز نمی‌شود.',
    seedValue: null,
  },
  {
    key: 'fee.pedigree_toman',
    group: 'FEES',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'هزینه صدور شجره‌نامه',
    seedValue: null,
  },
  {
    key: 'fee.mating_permit_toman',
    group: 'FEES',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'هزینه مجوز جفت‌گیری',
    seedValue: null,
  },
  {
    key: 'fee.kennel_registration_toman',
    group: 'FEES',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'هزینه ثبت کنل',
    seedValue: null,
  },
  {
    key: 'fee.puppy_card_toman',
    group: 'FEES',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'هزینه صدور کارت هر توله',
    seedValue: null,
  },

  // ── Genetics centre (single fixed centre, D07) ───────────────────────────
  {
    key: 'genetics_centre.name',
    group: 'GENETICS_CENTRE',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'نام مرکز ژنتیک',
    noteFa: 'یک مرکز ثابت؛ هیچ Selector مرکزی وجود ندارد (D07).',
    seedValue: null,
  },
  {
    key: 'genetics_centre.contact_phone',
    group: 'GENETICS_CENTRE',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'شماره تماس مرکز ژنتیک',
    seedValue: null,
  },
  {
    key: 'genetics_centre.address',
    group: 'GENETICS_CENTRE',
    kind: 'TEXT',
    source: 'OPERATIONAL_DATA',
    labelFa: 'نشانی مرکز ژنتیک',
    seedValue: null,
  },
  {
    key: 'genetics_centre.payment_account',
    group: 'GENETICS_CENTRE',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'شماره حساب اعلام‌شده مرکز ژنتیک',
    noteFa: 'داده مالی واقعی. هیچ شماره نمونه یا ساختگی وارد نمی‌شود.',
    seedValue: null,
  },
  {
    key: 'genetics_centre.payment_card',
    group: 'GENETICS_CENTRE',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'شماره کارت اعلام‌شده مرکز ژنتیک',
    noteFa: 'داده مالی واقعی. هیچ شماره نمونه یا ساختگی وارد نمی‌شود.',
    seedValue: null,
  },
  {
    key: 'genetics_centre.test_fee_toman',
    group: 'GENETICS_CENTRE',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'هزینه آزمایش مرکز ژنتیک',
    noteFa: 'پرداخت مستقیم به مرکز با فیش؛ از Checkout همزیست جداست (§۲۲).',
    seedValue: null,
  },

  // ── Breeding policy (read-only product rule, §17.2) ──────────────────────
  {
    key: 'cooldown.male_days',
    group: 'BREEDING_POLICY',
    kind: 'INT',
    source: 'DOCUMENTED_POLICY',
    labelFa: 'بازه هشدار جفت‌گیری نر (روز)',
    noteFa: 'قاعده مستند محصول: ۱۴ روز از آخرین تاریخ تأییدشده دوطرفه. هشدار است، نه قفل.',
    seedValue: 14,
  },
  {
    key: 'cooldown.female_months',
    group: 'BREEDING_POLICY',
    kind: 'INT',
    source: 'DOCUMENTED_POLICY',
    labelFa: 'بازه هشدار جفت‌گیری ماده (ماه تقویمی)',
    noteFa: 'قاعده مستند محصول: شش ماه تقویمی با clamp پایان ماه (DEC-0005). به روز تبدیل نمی‌شود.',
    seedValue: 6,
  },

  // ── OTP technical defaults (DEC-0006) ───────────────────────────────────
  {
    key: 'otp.ttl_seconds',
    group: 'OTP_TECHNICAL',
    kind: 'INT',
    source: 'TECHNICAL_DEFAULT',
    labelFa: 'طول عمر کد یک‌بارمصرف (ثانیه)',
    noteFa: 'پیش‌فرض فنی قابل تغییر (DEC-0006)، نه سیاست تأییدشده مالک محصول.',
    seedValue: 120,
    min: 30,
    max: 900,
  },
  {
    key: 'otp.resend_interval_seconds',
    group: 'OTP_TECHNICAL',
    kind: 'INT',
    source: 'TECHNICAL_DEFAULT',
    labelFa: 'فاصله مجاز ارسال مجدد کد (ثانیه)',
    seedValue: 60,
    min: 15,
    max: 600,
  },
  {
    key: 'otp.max_attempts',
    group: 'OTP_TECHNICAL',
    kind: 'INT',
    source: 'TECHNICAL_DEFAULT',
    labelFa: 'سقف تلاش نادرست کد',
    seedValue: 5,
    min: 3,
    max: 20,
  },
  {
    key: 'otp.max_sends_per_hour',
    group: 'OTP_TECHNICAL',
    kind: 'INT',
    source: 'TECHNICAL_DEFAULT',
    labelFa: 'سقف ارسال کد برای هر شماره در ساعت',
    noteFa: 'سد بالادستی در برابر سوءاستفاده از ارسال پیامک؛ پیش‌فرض فنی (DEC-0026).',
    seedValue: 5,
    min: 1,
    max: 60,
  },
  {
    key: 'session.ttl_days',
    group: 'OTP_TECHNICAL',
    kind: 'INT',
    source: 'TECHNICAL_DEFAULT',
    labelFa: 'طول عمر نشست ورود (روز)',
    noteFa: 'پیش‌فرض فنی قابل تغییر (DEC-0026)، نه سیاست تأییدشده مالک محصول.',
    seedValue: 30,
    min: 1,
    max: 365,
  },
  {
    key: 'otp.lock_minutes',
    group: 'OTP_TECHNICAL',
    kind: 'INT',
    source: 'TECHNICAL_DEFAULT',
    labelFa: 'مدت قفل پس از تلاش‌های نادرست (دقیقه)',
    seedValue: 15,
    min: 1,
    max: 1440,
  },

  // ── Guide text ──────────────────────────────────────────────────────────
  {
    key: 'guide_text.vet_pricing_notice',
    group: 'GUIDE_TEXT',
    kind: 'TEXT',
    source: 'PRODUCT_DECISION',
    labelFa: 'متن اطلاع هزینه در Finder',
    noteFa: 'متن مصوب §۱۱.۱.',
    seedValue: 'برای اطلاع دقیق از قیمت‌ها با دامپزشک یا مرکز تماس بگیرید.',
  },
  {
    key: 'guide_text.registration_sheet_notice',
    group: 'GUIDE_TEXT',
    kind: 'TEXT',
    source: 'PRODUCT_DECISION',
    labelFa: 'متن برگه ثبتی درباره نتیجه ژنتیک',
    noteFa: 'متن مصوب §۱۳.',
    seedValue: 'نمونه خون دریافت شده؛ آزمایش Parentage هنوز انجام نشده است.',
  },
  {
    key: 'guide_text.postal_request_notice',
    group: 'GUIDE_TEXT',
    kind: 'TEXT',
    source: 'PRODUCT_DECISION',
    labelFa: 'متن محدوده ارسال پستی',
    noteFa: 'D17: فاز اول فقط ثبت درخواست است.',
    seedValue: 'در این مرحله فقط درخواست ارسال ثبت می‌شود؛ ثبت درخواست به معنی ارسال واقعی سند نیست.',
  },
];

export const SETTING_BY_KEY: ReadonlyMap<string, SettingDefinition> = new Map(
  SETTING_DEFINITIONS.map((d) => [d.key, d]),
);

export const SETTING_KEYS = SETTING_DEFINITIONS.map((d) => d.key);
