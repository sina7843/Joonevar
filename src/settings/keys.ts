/**
 * Catalogue of product settings — D15, D16, §21.4, §22, §29.2.
 *
 * `seedValue: null` means NOT_CONFIGURED and stays that way until the
 * responsible team enters the real value.
 *
 * Where a value has a starting figure, that figure is an operating default the
 * superadmin changes from `/admin/settings`, not a verified published tariff or
 * a real bank account. The note on each key says which of the two it is, and
 * every change keeps its actor, time and previous value.
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
    noteFa:
      'مقدار شروع عملیاتی است و تعرفه رسمی اعلام‌شده انجمن نیست؛ سوپرادمین آن را از /admin/settings تغییر می‌دهد و مبلغ هر پرداخت در همان لحظه منجمد می‌شود.',
    seedValue: '250000',
  },
  {
    key: 'fee.pedigree_toman',
    group: 'FEES',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'هزینه صدور شجره‌نامه',
    noteFa:
      'مقدار شروع عملیاتی است و تعرفه رسمی اعلام‌شده انجمن نیست؛ سوپرادمین آن را از /admin/settings تغییر می‌دهد و مبلغ هر پرداخت در همان لحظه منجمد می‌شود.',
    seedValue: '400000',
  },
  {
    key: 'fee.mating_permit_toman',
    group: 'FEES',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'هزینه مجوز جفت‌گیری',
    noteFa:
      'مقدار شروع عملیاتی است و تعرفه رسمی اعلام‌شده انجمن نیست؛ سوپرادمین آن را از /admin/settings تغییر می‌دهد و مبلغ هر پرداخت در همان لحظه منجمد می‌شود.',
    seedValue: '300000',
  },
  {
    key: 'fee.kennel_registration_toman',
    group: 'FEES',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'هزینه ثبت کنل',
    noteFa:
      'مقدار شروع عملیاتی است و تعرفه رسمی اعلام‌شده انجمن نیست؛ سوپرادمین آن را از /admin/settings تغییر می‌دهد و مبلغ هر پرداخت در همان لحظه منجمد می‌شود.',
    seedValue: '150000',
  },
  {
    key: 'fee.puppy_card_toman',
    group: 'FEES',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'هزینه صدور کارت هر توله',
    noteFa:
      'مقدار شروع عملیاتی است و تعرفه رسمی اعلام‌شده انجمن نیست؛ سوپرادمین آن را از /admin/settings تغییر می‌دهد و مبلغ هر پرداخت در همان لحظه منجمد می‌شود.',
    seedValue: '120000',
  },

  // ── Genetics centre (single fixed centre, D07) ───────────────────────────
  {
    key: 'genetics_centre.name',
    group: 'GENETICS_CENTRE',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'نام مرکز ژنتیک',
    noteFa: 'یک مرکز ثابت؛ هیچ Selector مرکزی وجود ندارد (D07).',
    seedValue: 'مرکز ژنتیک هم‌زیست',
  },
  {
    key: 'genetics_centre.contact_phone',
    group: 'GENETICS_CENTRE',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'شماره تماس مرکز ژنتیک',
    seedValue: '02100000000',
  },
  {
    key: 'genetics_centre.address',
    group: 'GENETICS_CENTRE',
    kind: 'TEXT',
    source: 'OPERATIONAL_DATA',
    labelFa: 'نشانی مرکز ژنتیک',
    seedValue: 'تهران — نشانی مرکز ژنتیک، از پنل مدیریت تکمیل شود',
  },
  {
    key: 'genetics_centre.payment_account',
    group: 'GENETICS_CENTRE',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'شماره حساب اعلام‌شده مرکز ژنتیک',
    noteFa: 'مقدار شروع عملیاتی است و باید پیش از اعلام به کاربران با شماره حساب واقعی مرکز جایگزین شود.',
    seedValue: 'IR000000000000000000000000',
  },
  {
    key: 'genetics_centre.payment_card',
    group: 'GENETICS_CENTRE',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'شماره کارت اعلام‌شده مرکز ژنتیک',
    noteFa:
      'داده مالی واقعی. هیچ شماره نمونه یا ساختگی وارد نمی‌شود؛ شماره حساب برای اعلام کافی است و کارت اختیاری می‌ماند.',
    seedValue: null,
  },
  {
    key: 'genetics_centre.test_fee_toman',
    group: 'GENETICS_CENTRE',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'هزینه آزمایش مرکز ژنتیک',
    noteFa: 'پرداخت مستقیم به مرکز با فیش؛ از Checkout همزیست جداست (§۲۲).',
    seedValue: '1500000',
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

  // ── Integrations (§21.4: configurable operational data, not a code change) ──
  {
    key: 'integration.sms.mode',
    group: 'INTEGRATIONS',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'حالت آداپتور پیامک',
    noteFa:
      'MOCK_AUTO یعنی ارسال شبیه‌سازی‌شده و همیشه موفق؛ کد در صندوق توسعه ثبت می‌شود و به شماره واقعی چیزی نمی‌رود. PROVIDER یعنی سرویس‌دهنده واقعی که نام و کلید آن باید وارد شود.',
    seedValue: 'MOCK_AUTO',
  },
  {
    key: 'integration.sms.provider',
    group: 'INTEGRATIONS',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'نام سرویس‌دهنده پیامک',
    noteFa: 'فقط وقتی حالت PROVIDER است معنا دارد.',
    seedValue: null,
  },
  {
    key: 'integration.sms.api_key',
    group: 'INTEGRATIONS',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'کلید سرویس پیامک',
    noteFa: 'در لاگ و Audit ثبت نمی‌شود.',
    seedValue: null,
  },
  {
    key: 'integration.payment.mode',
    group: 'INTEGRATIONS',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'حالت درگاه پرداخت',
    noteFa:
      'MOCK_AUTO یعنی پرداخت شبیه‌سازی‌شده که بدون دخالت کاربر موفق تأیید می‌شود. DEV_GATEWAY همان درگاه توسعه با صفحه پرداخت است. PROVIDER یعنی درگاه واقعی. تأیید همیشه سمت سرور انجام می‌شود.',
    seedValue: 'MOCK_AUTO',
  },
  {
    key: 'integration.payment.provider',
    group: 'INTEGRATIONS',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'نام درگاه پرداخت',
    noteFa: 'فقط وقتی حالت PROVIDER است معنا دارد.',
    seedValue: null,
  },
  {
    key: 'integration.payment.api_key',
    group: 'INTEGRATIONS',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'کلید درگاه پرداخت',
    noteFa: 'در لاگ و Audit ثبت نمی‌شود.',
    seedValue: null,
  },
  {
    key: 'integration.map.provider',
    group: 'INTEGRATIONS',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'سرویس نقشه',
    noteFa: 'مقدار فعلی «neshan» است. نبود کلید، ثبت نشانی دستی را قفل نمی‌کند.',
    seedValue: 'neshan',
  },
  {
    key: 'integration.map.api_key',
    group: 'INTEGRATIONS',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'کلید سرویس نقشه (نشان)',
    noteFa:
      'کلید وب‌سرویس نشان از پنل نشان گرفته می‌شود. تا واردنشدن، نقشه نمایش داده نمی‌شود و ورود دستی نشانی سر جای خود می‌ماند.',
    seedValue: null,
  },
  {
    key: 'integration.map.embed_url_template',
    group: 'INTEGRATIONS',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'الگوی نشانی نقشه جاسازی‌شده',
    noteFa:
      'نشانی embed سرویس نقشه با جای‌گذارهای {lat}، {lng} و {key}. تا واردنشدن، نقشه‌ای نمایش داده نمی‌شود؛ قالب نشانی حدس زده نمی‌شود و باید از مستندات همان سرویس گرفته شود (DEC-0175).',
    seedValue: null,
  },
  {
    key: 'integration.document_render.engine',
    group: 'INTEGRATIONS',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'موتور تولید PDF سند',
    noteFa:
      'CHROMIUM یعنی تولید PDF با همان موتور Chromium نصب‌شده در همین پروژه؛ رایگان، بدون سرویس بیرونی و سازگار با متن فارسی و راست‌به‌چپ. NONE یعنی خروجی PDF ساخته نمی‌شود.',
    seedValue: 'CHROMIUM',
  },
  {
    key: 'integration.chip_reader.mode',
    group: 'INTEGRATIONS',
    kind: 'STRING',
    source: 'OPERATIONAL_DATA',
    labelFa: 'روش ورود شماره میکروچیپ',
    noteFa:
      'KEYBOARD_WEDGE یعنی ریدر بلوتوثی مثل صفحه‌کلید عمل می‌کند و شماره را در همان فیلد تایپ می‌کند؛ هیچ یکپارچه‌سازی سخت‌افزاری لازم نیست و ورود دستی همیشه در دسترس است.',
    seedValue: 'KEYBOARD_WEDGE',
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
  // ── Moderation (Phase 2) ───────────────────────────────────────────────
  {
    key: 'moderation.report_daily_limit',
    group: 'MODERATION',
    kind: 'INT',
    source: 'TECHNICAL_DEFAULT',
    labelFa: 'سقف گزارش هر حساب در ۲۴ ساعت',
    noteFa: 'سد فنی در برابر گزارش انبوه (DEC-0161)؛ پیش‌فرض قابل تغییر، نه سیاست تأییدشده مالک محصول.',
    seedValue: 10,
    min: 1,
    max: 100,
  },
  {
    key: 'verification.attempt_hourly_limit',
    group: 'MODERATION',
    kind: 'INT',
    source: 'TECHNICAL_DEFAULT',
    labelFa: 'سقف استعلام اصالت از یک نشانی در ساعت',
    noteFa: 'سد فنی در برابر حدس‌زدن کد سند (§۱۷)؛ پیش‌فرض قابل تغییر، نه سیاست تأییدشده مالک محصول.',
    seedValue: 30,
    min: 1,
    max: 1000,
  },
  {
    key: 'moderation.suggestion_daily_limit',
    group: 'MODERATION',
    kind: 'INT',
    source: 'TECHNICAL_DEFAULT',
    labelFa: 'سقف پیشنهاد ثبت دامپزشک یا مرکز در ۲۴ ساعت',
    noteFa: 'سد فنی در برابر پیشنهاد انبوه (DEC-0169)؛ پیش‌فرض قابل تغییر، نه سیاست تأییدشده مالک محصول.',
    seedValue: 5,
    min: 1,
    max: 50,
  },

  // ── Advertising packages (Phase 2, §14, P2-D03) ────────────────────────
  // Every price starts NOT_CONFIGURED on purpose: no package tariff has been
  // supplied, and an unpriced plan may not be sold rather than being sold for
  // nothing. The superadmin enters the real figures in /admin/settings.
  {
    key: 'advertising.featured_30_toman',
    group: 'ADVERTISING',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'قیمت بسته ویژه ۳۰ روزه',
    noteFa: 'تا ثبت مبلغ واقعی، این بسته قابل خرید نیست (§۱۴).',
    seedValue: null,
  },
  {
    key: 'advertising.featured_90_toman',
    group: 'ADVERTISING',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'قیمت بسته ویژه ۹۰ روزه',
    noteFa: 'تا ثبت مبلغ واقعی، این بسته قابل خرید نیست (§۱۴).',
    seedValue: null,
  },
  {
    key: 'advertising.featured_365_toman',
    group: 'ADVERTISING',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'قیمت بسته ویژه ۳۶۵ روزه',
    noteFa: 'تا ثبت مبلغ واقعی، این بسته قابل خرید نیست (§۱۴).',
    seedValue: null,
  },
  {
    key: 'advertising.pro_30_toman',
    group: 'ADVERTISING',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'قیمت بسته حرفه‌ای ۳۰ روزه',
    noteFa: 'تا ثبت مبلغ واقعی، این بسته قابل خرید نیست (§۱۴).',
    seedValue: null,
  },
  {
    key: 'advertising.pro_90_toman',
    group: 'ADVERTISING',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'قیمت بسته حرفه‌ای ۹۰ روزه',
    noteFa: 'تا ثبت مبلغ واقعی، این بسته قابل خرید نیست (§۱۴).',
    seedValue: null,
  },
  {
    key: 'advertising.pro_365_toman',
    group: 'ADVERTISING',
    kind: 'MONEY_TOMAN',
    source: 'OPERATIONAL_DATA',
    labelFa: 'قیمت بسته حرفه‌ای ۳۶۵ روزه',
    noteFa: 'تا ثبت مبلغ واقعی، این بسته قابل خرید نیست (§۱۴).',
    seedValue: null,
  },
];

export const SETTING_BY_KEY: ReadonlyMap<string, SettingDefinition> = new Map(
  SETTING_DEFINITIONS.map((d) => [d.key, d]),
);

export const SETTING_KEYS = SETTING_DEFINITIONS.map((d) => d.key);
