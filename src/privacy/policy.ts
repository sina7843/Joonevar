/**
 * The privacy and anti-abuse rules of Requirements-Phase-2 §20, stated once
 * (PROMPT-017).
 *
 * Almost every clause of §20 was already enforced by the prompt that owned the
 * feature — this file does not re-implement any of it. It writes the rules down
 * as data, each naming the code that enforces it, so that:
 *
 *  - a reviewer can read the list instead of trusting a claim in a report;
 *  - a test can assert that every clause has an owner in the codebase;
 *  - a later prompt adding a feature can see which rule it must answer to.
 *
 * A clause is only listed when the code behind it exists. Nothing here turns a
 * plan into a promise.
 */

export const PRIVACY_CLAUSES = [
  'OBJECT_LEVEL_ACCESS',
  'RATE_LIMIT',
  'ANTI_SPAM',
  'UPLOAD_CONTROL',
  'FILE_TYPE_SCAN',
  'IMPERSONATION',
  'PII_MINIMISATION',
  'CONTACT_CONSENT',
  'AUDIT',
  'EXPORT_LIMIT',
  'PUBLIC_ID_NOT_INTERNAL',
] as const;
export type PrivacyClause = (typeof PRIVACY_CLAUSES)[number];

export interface ClauseRule {
  readonly clause: PrivacyClause;
  readonly titleFa: string;
  /** What the product actually does, in the words an operator would use. */
  readonly ruleFa: string;
  /** Where it is enforced. Every entry points at code that exists today. */
  readonly enforcedIn: readonly string[];
}

export const PRIVACY_RULES: readonly ClauseRule[] = [
  {
    clause: 'OBJECT_LEVEL_ACCESS',
    titleFa: 'دسترسی شیءمحور',
    ruleFa:
      'هر خواندن و نوشتنِ یک رکورد سمت سرور مجوز می‌گیرد؛ فایل خصوصی فقط برای مالک و بررسی‌کننده همان نوع مدرک باز می‌شود و مجوز پیش از هر دسترسی به دیسک بررسی می‌شود، پس کاربر غیرمجاز حتی وجود فایل را نمی‌فهمد.',
    enforcedIn: ['src/authz/policy.ts', 'src/files/storage.ts', 'app/api/files/[id]/route.ts'],
  },
  {
    clause: 'RATE_LIMIT',
    titleFa: 'محدودیت نرخ',
    ruleFa:
      'کد ورود، گزارش محتوا، پیشنهاد رکورد و استعلام اصالت هرکدام سقفی دارند که از تنظیمات مدیریت‌شده خوانده می‌شود؛ حساب پنجره و سقف یک‌جا نوشته شده است و پیام آن هرگز نمی‌گوید چند تلاش باقی مانده.',
    enforcedIn: ['src/privacy/limits.ts', 'src/identity/otp.ts', 'src/moderation/service.ts', 'src/suggestions/service.ts', 'src/verification/service.ts'],
  },
  {
    clause: 'ANTI_SPAM',
    titleFa: 'ضد اسپم',
    ruleFa:
      'سقف روزانه، سقف پرونده باز هم‌زمان و رد درخواست تکراری با هم کار می‌کنند: یک حساب نه با تکرار سریع و نه با انباشتن پرونده باز، صف بررسی را پر نمی‌کند.',
    enforcedIn: ['src/moderation/service.ts', 'src/suggestions/service.ts', 'src/centres/claims.ts'],
  },
  {
    clause: 'UPLOAD_CONTROL',
    titleFa: 'کنترل آپلود',
    ruleFa:
      'هر بارگذاری از یک مسیر می‌گذرد: نوع مجاز و سقف حجم برای همان کاربرد بررسی می‌شود، کلید ذخیره‌سازی را سرور می‌سازد، فایل موجود بازنویسی نمی‌شود و نام فرستاده‌شده کاربر هرگز بخشی از مسیر نیست.',
    enforcedIn: ['src/files/signature.ts', 'src/files/storage.ts'],
  },
  {
    clause: 'FILE_TYPE_SCAN',
    titleFa: 'اسکن نوع فایل',
    ruleFa:
      'نوع فایل از امضای بایت‌های خودش تشخیص داده می‌شود، نه از پسوند یا از آنچه مرورگر گفته است؛ پسوند ذخیره‌شده هم از همان امضا می‌آید.',
    enforcedIn: ['src/files/signature.ts'],
  },
  {
    clause: 'IMPERSONATION',
    titleFa: 'جلوگیری از جعل هویت',
    ruleFa:
      'کد ملی در کل سامانه یکتاست و پس از تأیید احراز هویت تغییر نمی‌کند؛ کد نظام متعلق به پروفایل دیگری پذیرفته نمی‌شود و اگر آن پروفایل بدون مالک و منتشرشده باشد کاربر به مسیر Claim هدایت می‌شود؛ یک حساب بیش از یک پروفایل دامپزشک ندارد و نام نمایشی تا وقتی خود کاربر نخواهد دیده نمی‌شود.',
    enforcedIn: ['src/db/schema/identity.ts', 'src/identity/account.ts', 'src/vets/onboarding.ts'],
  },
  {
    clause: 'PII_MINIMISATION',
    titleFa: 'حداقل‌سازی داده شخصی',
    ruleFa:
      'کد ملی، شماره کارت و حساب، توکن، کد یک‌بارمصرف و بایت فایل هنگام ثبت در تاریخچه حذف می‌شوند؛ پاسخ استعلام عمومی هم فقط نوع سند، کد، تاریخ و چند مشخصه حیوان را می‌گوید و هیچ چیزی از مالک.',
    enforcedIn: ['src/audit/service.ts', 'src/verification/model.ts'],
  },
  {
    clause: 'CONTACT_CONSENT',
    titleFa: 'رضایت نمایش تماس',
    ruleFa:
      'تلفن و کد نظام روی صفحه عمومی فقط با انتخاب صریح خود دامپزشک نمایش داده می‌شوند و تغییر همین انتخاب با مقدار قبلی و جدید در تاریخچه ثبت می‌شود.',
    enforcedIn: ['src/vets/directory-model.ts', 'src/vets/directory.ts'],
  },
  {
    clause: 'AUDIT',
    titleFa: 'ثبت تاریخچه',
    ruleFa:
      'هر تغییر حساس با Actor، زمان، مقدار قبلی و جدید و دلیل ثبت می‌شود و تاریخچه فقط خواندنی است؛ از صفحه تاریخچه هیچ رکوردی تغییر نمی‌کند.',
    enforcedIn: ['src/audit/service.ts', 'src/operations/service.ts', 'app/admin/audit/page.tsx'],
  },
  {
    clause: 'EXPORT_LIMIT',
    titleFa: 'محدودیت خروجی انبوه',
    ruleFa:
      'هیچ مسیری خروجی انبوه نمی‌دهد؛ خواندن‌های عملیاتی صفحه‌بندی‌شده‌اند و سقف هر پاسخ یک عدد مشترک است، پس یک درخواست نمی‌تواند کل یک جدول را ببرد.',
    enforcedIn: ['src/privacy/limits.ts', 'src/operations/service.ts'],
  },
  {
    clause: 'PUBLIC_ID_NOT_INTERNAL',
    titleFa: 'شناسه عمومی جدا از شناسه داخلی',
    ruleFa:
      'نشانی عمومی هر رکورد یک slug تصادفی است و شناسه داخلی آن هرگز در نشانی عمومی نمی‌آید؛ کد سند هم از الفبای خوانا و تصادفی ساخته می‌شود.',
    enforcedIn: ['src/vets/directory.ts', 'src/centres/service.ts', 'src/communities/service.ts', 'src/domain/ids.ts'],
  },
];

export const ruleFor = (clause: PrivacyClause): ClauseRule =>
  PRIVACY_RULES.find((rule) => rule.clause === clause)!;
