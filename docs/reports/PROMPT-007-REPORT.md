# PROMPT-007 — ثبت‌نام و Claim دامپزشک

**وضعیت:** COMPLETE · **تاریخ:** ۲۰۲۶-۰۹-۱۲ · **تصمیم‌ها:** DEC-0165، DEC-0166 · **شواهد ماشینی:** [phase-2/PROMPT-007.json](phase-2/PROMPT-007.json)

## ۱. وضعیت واقعی کد پیش از شروع

| موضوع | آنچه در کد بود | پیامد برای این پرامپت |
|---|---|---|
| پروفایل دامپزشک | `vet_profile` با `account_id` و `council_code` **اجباری**؛ فقط سوپرادمین می‌ساخت (DEC-0042) | برای رکورد «بدون مالک» هر دو nullable شد؛ Finder با join روی حساب آن را نمی‌بیند |
| نقش دامپزشک | `TRUSTED_VET` فاز یک، مسیر عملیاتی و Finder | طبق DEC-0145 تأیید فاز دو این نقش را نمی‌دهد؛ «مالک» یعنی حسابی که پروفایل به آن وصل است |
| نقش‌های فاز دو | AUTHOR و CONTENT_ADMIN، Context عملیاتی، اعطا از `/admin/roles` | `REVIEW_OPERATOR` با همان الگو اضافه شد |
| مدارک خصوصی | `stored_file` + `/api/files/[id]` با جدول دسترسی per purpose | نوع `VET_APPLICATION_DOCUMENT` با بازبین‌های خودش اضافه شد؛ زیرساخت تازه‌ای ساخته نشد |
| ویرایشگر دایرکتوری | فقط سوپرادمین (PROMPT-006) | همان ویرایشگر با مجوز شیءمحور به مالک هم داده شد |

## ۲. آنچه ساخته شد

### Schema و Migration — `src/db/migrations/0021_vet-onboarding.sql`
- نقش و Context `REVIEW_OPERATOR`، نوع فایل `VET_APPLICATION_DOCUMENT`.
- `vet_application` (نوع PROFILE/CLAIM، پروفایل هدف، نام، کد نظام، تلفن، شهر، توضیح، وضعیت، یادداشت بررسی، بررسی‌کننده و زمان، متن و زمان تجدیدنظر، نسخه) و `vet_application_document` (پیوند به `stored_file`).
- ایندکس یکتای جزئی: یک درخواست باز برای هر حساب، یک Claim باز برای هر پروفایل.
- `vet_profile`: `account_id` و `council_code` nullable؛ `listed_city_id`، `listed_contact_fa`، `source_fa`، `claimed_at`، `hidden_by_review`.

### مسیر درخواست‌دهنده — `/account/vet-profile`
ثبت درخواست با کد نظام (یکسان‌سازی ارقام فارسی/عربی، فاصله و حروف؛ فقط بررسی شکل، بدون ساختن قالب رسمی) و مدارک؛ پیگیری وضعیت؛ پاسخ به «نیازمند اصلاح» روی همان پرونده؛ یک تجدیدنظر پس از رد؛ انصراف و بایگانی. پس از تأیید، همین صفحه ویرایشگر پروفایل می‌شود: محتوا، رضایت نمایش، محل‌های کار و انتشار.

### Claim — `/account/vet-profile/claim/[slug]`
از خود صفحه عمومی «بدون مالک» شروع می‌شود. تأیید، همان ردیف و همان نشانی را با کد نظام و تأیید حرفه‌ای به حساب متقاضی می‌دهد و `claimed_at` را ثبت می‌کند؛ تاریخچه پیشین پاک نمی‌شود.

### محیط اپراتور بررسی — `/review/vets`
صف در انتظار بررسی / نیازمند اصلاح / تصمیم‌گرفته؛ صفحه تصمیم با مدارک، پروفایل هدف Claim و «کاندیدهای تکراری»؛ تأیید، درخواست اصلاح یا رد با دلیل اجباری و نسخه مورد انتظار؛ `/review/vets/unowned` برای انتشار پروفایل بدون مالک، پنهان‌سازی/انتشار دوباره و افزودن شهر.

### قواعد کلیدی
| قاعده | جای اجرا |
|---|---|
| تأیید، نقش دامپزشک معتمد نمی‌دهد | `decideVetApplication` (تست: حساب پس از تأیید هیچ نقشی ندارد) |
| اپراتور درخواست خودش را بررسی نمی‌کند | `decideVetApplication` + صفحه تصمیم |
| مدارک فقط برای متقاضی و بازبین | `FILE_REVIEWERS.VET_APPLICATION_DOCUMENT` و `/api/files/[id]` |
| محل کار مالک هرگز به Finder نمی‌رسد | `addOwnLocation` با پروانه NONE و بدون امکانات |
| مالک پنهان‌سازی بررسی را برنمی‌گرداند | `hidden_by_review` در `changeVetPublicStatus` |
| خرید بسته پیش از Claim ممنوع | `packagePurchaseEligibility` (محور تبلیغات ویرایشگر؛ 011 باید صدایش بزند) |

### حالت‌ها
| حالت | پوشش |
|---|---|
| Loading | `app/review/vets/(list)/loading.tsx` |
| Empty | صف خالی، «پروفایل بدون مالکی ثبت نشده است»، نبود محل کار در ویرایشگر |
| Error | پیام فارسی هر فرم: دلیل، کد نظام، مدرک، شهر، نسخه قدیمی (CONFLICT) |
| Forbidden | `/review` برای غیر اپراتور بررسی؛ مدرک دیگران ۴۰۳؛ مهمان به ورود با `next` دقیق |
| Duplicate | درخواست باز، Claim باز، کد نظام تکراری (با هدایت به Claim)، نام مشابه هنگام انتشار بدون مالک |
| Archived | درخواست WITHDRAWN؛ پروفایل HIDDEN (۴۰۴ و خارج از sitemap) |

## ۳. تست‌ها (هدفمند، طبق دستور کاربر)
| دستور | نتیجه |
|---|---|
| `npx tsc --noEmit` | exit 0 (پیش و پس از build) |
| `npm run build` | Compiled successfully، exit 0 |
| `node --test` واحد (دامنه ۰۰۷ و ۰۰۶، routes، seo) | ۳۸/۳۸ |
| `node --test --test-concurrency=1 tests/db/vet-onboarding.test.ts tests/db/vet-directory.test.ts` | ۱۵/۱۵ |
| رگرسیون DB (migrations، referrals، content، health) | ۳۰/۳۰ |
| `npm run test:browser -- tests/browser/vet-onboarding.test.ts` | ۳/۳ روی `hamzist_browser_51581f154dc6` |
| `npm run test:browser -- tests/browser/vet-directory.test.ts tests/browser/finder.test.ts` | ۹/۹ روی `hamzist_browser_f0cc7f1a55c1` |

اجرای اول تست مرورگر ۰/۳ بود: پس از ثبت تصمیم، صفحه فرم تصمیم و پیام نتیجه‌اش را با هم برمی‌داشت؛ حالا فرم می‌ماند و نتیجه ثبت‌شده را نشان می‌دهد. آخرین اجرای کامل: `npm test` ۳۸۵/۳۸۵ و مرورگر ۱۰۳/۱۰۳ در `7c74577`.

### شواهد تصویری — `docs/reports/screenshots/phase-2/prompt-007/`
`application-submitted-mobile.png` · `review-correction.png` · `owner-published.png` · `review-unowned.png` · `unowned-profile-mobile.png` · `claim-in-review-mobile.png` · `claimed-owner.png`. تصاویر پرامپت‌های قبلی که با اجرای دوباره بازتولید شدند به نسخه commit‌شده برگردانده شدند.

## ۴. فایل‌های تغییرکرده
- Schema/Migration: `src/db/schema/{enums,vets}.ts`، `src/db/migrations/0021_vet-onboarding.sql` + snapshot و journal، `src/db/seed/dev-fixtures.ts` (فیکسچر ۰۹۹۹۰۰۰۰۰۰۹ اپراتور بررسی)
- دسترسی و زیرساخت: `src/authz/{actor,policy,routes}.ts`، `src/files/signature.ts`، `src/domain/resume-context.ts`، `src/content/roles.ts`، `src/ui/{shell,role-switcher}.tsx`
- سرویس: `src/vets/{onboarding-model,onboarding,directory,directory-model,registry}.ts`، `src/mating/pregnancy.ts` (guard کد نظام)
- UI مشترک: `src/vets/{directory-actions.ts,directory-forms.tsx,directory-editor.tsx,onboarding-actions.ts,onboarding-forms.tsx}`
- صفحات: `app/account/vet-profile/**`، `app/review/vets/**`، `app/admin/vets/[accountId]/page.tsx` (استفاده از ویرایشگر مشترک؛ فرم و اکشن قبلی حذف شد)، `app/admin/roles/forms.tsx`، `app/(public)/veterinarians/**`
- تست: `tests/domain/vet-onboarding.test.ts`، `tests/db/vet-onboarding.test.ts`، `tests/browser/vet-onboarding.test.ts`، `tests/db/vet-directory.test.ts`، `tests/ui/routes.test.ts`
- مستندات: `DECISIONS.md`، `REQUIREMENTS_TRACEABILITY.md` (P2-R07)، `docs/architecture/phase-2-boundary.md`

## ۵. Known Gaps
- فرم پیشنهاد کاربر عادی (§۱۰) ساخته نشد؛ پروفایل بدون مالک را اپراتور بررسی با ثبت منبع منتشر می‌کند و فرم کاربر با PROMPT-009 می‌آید.
- گزارش پروفایل دامپزشک (§۱۳) و Merge تکراری‌ها (§۲۱) در ۰۱۶ می‌آیند.
- بسته تبلیغاتی وجود ندارد؛ ۰۱۱ باید پیش از هر پرداخت `packagePurchaseEligibility` را صدا بزند.
- Claim هم‌زمان چند نفر صف نمی‌شود؛ نفر دوم تا تصمیم درباره اولی پیام «در حال بررسی» می‌گیرد.
- اگر شهر مالک در فهرست نباشد، تا افزوده‌شدن شهر توسط اپراتور بررسی یا سوپرادمین، محل کارش عمومی نمی‌شود.
- هویت متقاضی از پروفایل حساب فاز یک خوانده می‌شود؛ احراز هویت تازه‌ای اینجا اضافه نشد.
- تطابق بصری با Figma: UNVERIFIED (فریم فاز دو در منابع نیست).
- هیچ تعرفه، زمان، مجوز یا ادعای پزشکی ساختگی اضافه نشد؛ کد نظام فقط از نظر شکل بررسی می‌شود، نه اعتبارسنجی رسمی.
