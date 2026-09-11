# PROMPT-009 — پیشنهاد و Claim مرکز

**وضعیت:** COMPLETE · **تاریخ:** ۲۰۲۶-۰۹-۱۲ · **تصمیم:** DEC-0169 · **شواهد ماشینی:** [phase-2/PROMPT-009.json](phase-2/PROMPT-009.json)

## ۱. وضعیت واقعی کد پیش از شروع

| موضوع | آنچه در کد بود | پیامد برای این پرامپت |
|---|---|---|
| رکورد بدون مالک | `vet_profile.account_id` و `centre.owner_account_id` nullable بودند و اپراتور بررسی رکورد بدون مالک می‌ساخت | فرم پیشنهاد کاربر عادی (موکول‌شده در DEC-0166) همین‌جا ساخته شد |
| Claim دامپزشک | `vet_application` با نوع CLAIM، مدارک خصوصی، اصلاح و تجدیدنظر (۰۰۷) | Claim مرکز با همان الگو و همان Enum وضعیت ساخته شد |
| واگذاری مرکز | فقط سوپرادمین با شماره موبایل واگذار می‌کرد (۰۰۸) | حالا مسیر واقعی: نماینده با مدرک درخواست می‌دهد و بررسی تصمیم می‌گیرد |
| سقف ضد انبوه | الگوی `moderation.report_daily_limit` (۰۰۵) | تنظیم تازه `moderation.suggestion_daily_limit` با همان الگو |

## ۲. آنچه ساخته شد

### Schema و Migration — `src/db/migrations/0023_suggestions-claims.sql`
- `directory_suggestion` برای هر دو نوع (VET و CENTRE) با نام، شهر، تماس عمومی، منبع، توضیح، وضعیت، یادداشت بررسی و پیوند به رکورد ساخته‌شده.
- `centre_claim` و `centre_claim_document` با نوع فایل تازه `CENTRE_CLAIM_DOCUMENT`.
- ایندکس یکتای جزئی: یک Claim باز برای هر مرکز و یک Claim باز برای هر حساب.
- تنظیم تازه `moderation.suggestion_daily_limit` (پیش‌فرض فنی ۵).

### جریان پیشنهاد (§۱۰)
1. کاربر واردشده در `/account/suggestions` نام، شهر و **منبع اطلاعات** را می‌نویسد؛ تماس عمومی اختیاری است.
2. پیش از ثبت، رکوردهای هم‌نام بررسی می‌شوند: اگر رکورد منتشرشده‌ی بدون مالک باشد، کاربر به Claim هدایت می‌شود؛ در غیر این صورت تأیید «تکراری نیست» لازم است.
3. سه پیشنهاد باز برای هر حساب و سقف روزانه از تنظیمات؛ بیشتر از آن RATE_LIMITED.
4. اپراتور بررسی (نه پیشنهاددهنده) با دلیل تصمیم می‌گیرد: تأیید، درخواست اصلاح یا رد. نتیجه با اعلان به پیشنهاددهنده می‌رسد.
5. تأیید، رکورد را **بدون مالک** منتشر می‌کند؛ پیشنهاددهنده مالک نمی‌شود.

### جریان Claim مرکز (§۱۰)
- از خود صفحه مرکز بدون مالک: نام نماینده، سمت، تلفن، توضیح و دست‌کم یک مدرک (پروانه مرکز، معرفی‌نامه یا مدرک هویتی).
- مدارک خصوصی‌اند: فقط درخواست‌دهنده، اپراتور بررسی و سوپرادمین آن‌ها را از `/api/files/[id]` می‌بینند.
- تأیید فقط وقتی مرکز هنوز بدون مالک است نوشته می‌شود؛ دو تأیید هم‌زمان هر دو برنده نمی‌شوند.
- Auditهای پیشین مرکز سر جایشان می‌مانند و `CENTRE_CLAIMED` مقدار قبلی/جدید را اضافه می‌کند: **کنترل ویرایش آینده منتقل می‌شود، نه مالکیت تاریخچه**.
- رد، یک تجدیدنظر دارد؛ «نیازمند اصلاح» روی همان پرونده پاسخ داده می‌شود؛ انصراف آن را بایگانی می‌کند.

### حالت‌ها
| حالت | پوشش |
|---|---|
| Loading | `app/review/suggestions/(list)/loading.tsx`، `app/review/centres/claims/(list)/loading.tsx` |
| Empty | «هنوز پیشنهادی ثبت نکرده‌اید»، صف‌های خالی بررسی، «درخواستی ثبت نکرده‌اید» |
| Error | پیام فارسی: نام/شهر/منبع، مدرک لازم، سمت لازم، سقف‌ها، نسخه قدیمی (CONFLICT) |
| Forbidden | `/review/suggestions` و `/review/centres/claims` برای دیگران؛ مدرک دیگران ۴۰۳؛ مهمان به ورود با `next` دقیق |
| Duplicate | رکورد هم‌نام (تأیید صریح یا هدایت به Claim)، Claim باز تکراری برای مرکز یا حساب |
| Archived | پیشنهاد و Claim منصرف‌شده (WITHDRAWN) در نمای «تصمیم‌گرفته و بایگانی» |

## ۳. تست‌ها (هدفمند، طبق دستور کاربر)
| دستور | نتیجه |
|---|---|
| `npx tsc --noEmit` | exit 0 (پیش و پس از build) |
| `npm run build` | Compiled successfully، exit 0 |
| واحد (دامنه پیشنهاد و مراکز، routes، seo) | ۳۷/۳۷ |
| DB (suggestions، centres، settings، migrations) | ۲۹/۲۹ |
| مرورگر پیشنهاد و Claim | ۳/۳ روی `hamzist_browser_9b5df52c42ba` |
| رگرسیون مرورگر (centres، vet-directory) | ۷/۷ روی `hamzist_browser_0d95018757d2` |

دو شکست اول تست مرورگر ایراد تست بود، نه محصول، و در تست اصلاح شد: صفحه پیشنهادها به‌درستی هم فرم پیشنهاد تازه و هم فرم اصلاح را نشان می‌دهد (پس Locator باید به فرم محدود شود)، و پس از ارسال اصلاحات آن فرم برداشته می‌شود (پس انتظار باید روی نشان وضعیت باشد که می‌ماند).

آخرین اجرای کامل: `npm test` ۳۸۵/۳۸۵ و مرورگر ۱۰۳/۱۰۳ در `7c74577`.

### شواهد تصویری — `docs/reports/screenshots/phase-2/prompt-009/`
`suggestion-submitted-mobile.png` · `review-suggestion.png` · `claim-form-mobile.png` · `review-claim.png` · `centre-claimed.png`. تصاویر پرامپت‌های قبلی که با اجرای دوباره بازتولید شدند به نسخه commit‌شده برگردانده شدند.

## ۴. فایل‌های تغییرکرده
- Schema/Migration: `src/db/schema/{vets,enums}.ts`، `0023_suggestions-claims.sql` + snapshot و journal، `src/settings/keys.ts`
- دسترسی و زیرساخت: `src/authz/policy.ts`، `src/files/signature.ts`، `src/domain/resume-context.ts`، `src/ui/shell.tsx`
- سرویس و UI: `src/suggestions/{model,service,actions,forms}`، `src/centres/claims.ts`
- صفحات: `app/account/suggestions`، `app/account/centres/claim/[slug]`، `app/account/centres/claims`، `app/review/suggestions/**`، `app/review/centres/claims/**`، و پیوندهای عمومی در `app/(public)/centers/**` و `app/(public)/veterinarians/(list)`
- تست: `tests/domain/suggestions.test.ts`، `tests/db/suggestions.test.ts`، `tests/browser/suggestions.test.ts`
- مستندات: `DECISIONS.md`، `REQUIREMENTS_TRACEABILITY.md` (P2-R09)، `docs/architecture/phase-2-boundary.md`

## ۵. Known Gaps
- Claim دامپزشک در `vet_application` و Claim مرکز در `centre_claim` است؛ یکی‌کردن صف‌ها به پنل مدیریت ۰۱۶ می‌رود.
- Merge رکوردهای تکراری (§۲۱) ساخته نشد؛ فعلاً فقط جلوی ساخت تکراری گرفته می‌شود.
- دامپزشکِ پیشنهادی کد نظام و تأیید حرفه‌ای ندارد؛ آن‌ها فقط با Claim خود دامپزشک (۰۰۷) می‌آیند.
- نوع مرکز پیشنهادی «سایر مراکز» است تا بررسی نوع دقیق را ثبت کند.
- پیشنهاد تجدیدنظر ندارد؛ فقط Claim یک‌بار تجدیدنظر دارد.
- سقف سه پیشنهاد باز و سقف روزانه، پیش‌فرض فنی‌اند نه سیاست تأییدشده مالک محصول.
- تطابق بصری با Figma: UNVERIFIED (فریم فاز دو در منابع نیست).
- هیچ تعرفه، مجوز یا ادعای پزشکی ساختگی اضافه نشد؛ منبع اطلاعات فقط برای بررسی است و عمومی نمایش داده نمی‌شود.
