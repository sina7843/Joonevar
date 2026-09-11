# مرز فاز دو — نقشه reuse / migrate / create

سند زنده. در PROMPT-001 فاز دو از روی کد واقعی شاخه `main` (HEAD مبنا `33acb9a`) نوشته شد و هر پرامپت بعدی که یکی از ردیف‌ها را اجرا می‌کند، همان ردیف را با تصمیم و Migration واقعی به‌روز می‌کند. منبع‌ها: `Requirements-Phase-2.md`، `PRODUCT_DECISIONS.md` (P2-D01…P2-D15)، بسته `Hamzist-Phase-2-Prompt-Package-v1.0/` و تصمیم‌های D01–D19 و DEC-0001…DEC-0141 فاز یک.

## ۱. مبنای واقعی فاز یک

| مورد | وضعیت در کد |
|---|---|
| Stack | Next.js 15.5 (App Router)، React 19، TypeScript strict، PostgreSQL 16 روی Docker (پورت 5433)، Drizzle ORM 0.45.2، `node:test` و Playwright |
| پیشرفت | ۲۰/۲۰ پرامپت فاز یک COMPLETE در `PROJECT_STATUS.md`، به‌علاوه اصلاحات درخواستی کاربر DEC-0122…DEC-0141 |
| Migration | ۱۷ فایل `0000_foundation` … `0016_official-identity`، ۵۹ جدول (فهرست کامل در `tests/db/migrations.test.ts`) |
| Context | `USER`، `BREEDER`، `TRUSTED_VET` (عمومی) و `ASSOCIATION_OPERATOR`، `GENETICS_OPERATOR`، `SUPERADMIN` (Shell عملیاتی مستقل، D11) |
| نقش حساب | `account_role_name`: BREEDER، TRUSTED_VET، ASSOCIATION_OPERATOR، GENETICS_OPERATOR، SUPERADMIN با وضعیت PENDING/ACTIVE/SUSPENDED/REJECTED |
| مجوز مسیر | `src/authz/routes.ts`؛ طولانی‌ترین پیشوند برنده و مسیر ثبت‌نشده پیش‌فرض بسته (DEC-0023) |
| صفحه `/` | صفحه وضعیت زیرساخت (عمومی)؛ هنوز صفحه محصول نیست |
| سطح عمومی بدون ورود | فقط `/`، `/login`، `/api/health` |

## ۲. تعهدهای فاز یک که فاز دو نمی‌شکند

- عضویت مادام‌العمر F14؛ هیچ انقضا، تمدید یا Scheduler.
- Finder فاز یک (`/vets`) فقط دامپزشک با نقش `TRUSTED_VET` فعال، عضویت فعال و مرکز دارای پروانه معتبر و **همه** امکانات اجباری همان Context را نشان می‌دهد (DEC-0044). دایرکتوری عمومی فاز دو این شرط را تغییر نمی‌دهد و به آن وارد نمی‌شود.
- داده دامپزشک معتمد عملیاتی از محیط سوپرادمین وارد می‌شود (D01، DEC-0042) — تفکیک با ثبت‌نام عمومی فاز دو در DEC-0145.
- کد نظام (`vet_profile.council_code`) و پروانه Location (`vet_location.licence_status`) دو تأیید جدا هستند (DEC-0043).
- یک مرکز ژنتیک ثابت، بدون انتخاب مرکز (DEC-0066)؛ صفحات خدمات فاز دو هیچ Selector مرکز ژنتیک نمی‌سازند (Requirements-Phase-2 §۱۸).
- سند صادرشده باطل یا بازنویسی نمی‌شود (DEC-0076)؛ استعلام فاز دو فقط وضعیتی را نشان می‌دهد که داده واقعی آن وجود دارد.
- مسیر رسمی و اعلام شخصی هرگز ادغام نمی‌شوند؛ اعلام شخصی سند یا Lineage نمی‌سازد.
- همه تعرفه‌ها و تنظیمات از `product_setting` نسخه‌دار با Audit؛ هیچ عدد در کد.
- فایل خصوصی فقط از مسیر مجوزدار سرور (`/api/files/[id]`)؛ ذخیره‌سازی از آداپتور موجود `private-storage` (DEC-0119، `docs/ops/private-storage.md`). اشاره بسته فاز دو به «Object Storage» طبق خود آن سند تابع «سیاست Adapter موجود» است.

## ۳. نقشه داده (P2-D15: هیچ رکورد موازی)

`REUSE` = همان جدول/سرویس بدون تغییر ساختاری · `MIGRATE` = همان جدول با Migration افزایشی (ستون/Enum/FK) و بدون حذف داده · `CREATE` = موجودیت تازه‌ای که در فاز یک معادل ندارد و به جدول‌های فاز یک FK می‌دهد.

| مفهوم فاز دو | منبع فاز یک | اقدام | نکته مرزی | پرامپت |
|---|---|---|---|---|
| حساب، OTP، نشست | `account`، `otp_challenge`، `session`، `src/identity/*` | REUSE | ورود عمومی همان OTP فاز یک است؛ حساب دوم ساخته نمی‌شود | 002 |
| نقش‌های تازه | `account_role`، Enum `account_role_name`، `src/authz/actor.ts` | MIGRATE | افزودن مقدار به Enum؛ هر نقش در پرامپت مصرف‌کننده‌اش (DEC-0145) | 004، 005، 007، 008، 010 |
| پروفایل عمومی دامپزشک | `vet_profile` (نام، کد نظام یکتا، `council_verified_at`، تلفن، بیو) | MIGRATE | `account_id` امروز NOT NULL است و رکورد «بدون مالک» (P2-D06) را نمی‌پذیرد؛ مالکیت و Claim باید بدون ساخت جدول دامپزشک دوم حل شود | 006، 007 |
| محور Professional Verification | `vet_profile.council_verified_at` | REUSE | همان تأیید کد نظام؛ پرداخت آن را نمی‌سازد | 006 |
| محور Trusted Hamzist | نقش `TRUSTED_VET` فعال | REUSE | فقط از مسیر عملیاتی فاز یک اعطا می‌شود (DEC-0145) | 006 |
| محل کار / شعبه | `vet_location` (مالک: `vet_account_id` NOT NULL، نوع CLINIC/HOSPITAL/CENTRE، پروانه، امکانات، مختصات) | MIGRATE | Finder و ارجاع‌های فاز یک (`vet_visit_request.location_id`، `pregnancy_check`) به همین ردیف FK دارند؛ ردیف جابه‌جا یا کپی نمی‌شود | 008 |
| مرکز / سازمان | — | CREATE | شعبه‌ها به `vet_location` پیوند می‌خورند؛ انواع مرکز Requirements-Phase-2 §۹ داده مدیریتی است | 008، 009 |
| استان و شهر | متن آزاد: `vet_location.province_fa/city_fa`، `kennel`، `residence.province/city`، `postal_request` | CREATE + MIGRATE | جدول نرمال‌شده و FK اختیاری با Backfill؛ متن قبلی به‌عنوان سابقه می‌ماند. اولین مصرف‌کننده فیلتر 006 است، پس حداقل جدول در همان‌جا لازم است و 015 نقشه/صفحات محلی را اضافه می‌کند | 006، 015 |
| گونه | `animal.species` متن با پیش‌فرض `DOG` | CREATE + MIGRATE | جدول گونه با کد پایدار؛ مقدار `DOG` موجود معتبر می‌ماند | 003 |
| بانک نژاد سگ | `reference_breed` (نام فارسی/انگلیسی، فعال، ترتیب) با FK از `animal.breed_id` و `kennel_breed` | MIGRATE | افزودن گونه، slug و فیلدهای بانک نژاد روی همین شناسه؛ «کنارگذاشتن» به‌جای حذف (DEC-0113) حفظ می‌شود | 003 |
| CMS | — | CREATE | نویسنده به `account` FK می‌دهد؛ نژاد به `reference_breed` | 004 |
| گزارش و Moderation | `audit_event` برای ثبت تصمیم | CREATE + REUSE | صف گزارش تازه، تصمیم در همان Audit | 005 |
| Claim | — | CREATE | انتقال کنترل ویرایش آینده، نه مالکیت تاریخچه | 007، 009 |
| انجمن و کلاب (دایرکتوری) | — | CREATE | با Shell عملیاتی `ASSOCIATION_OPERATOR` فاز یک یکی نیست (DEC-0145) | 010 |
| بسته تبلیغاتی | `payment_batch/item/attempt/callback` با Enum `payment_service`؛ `product_setting` | MIGRATE + CREATE | افزودن سرویس پرداخت و گروه تنظیمات؛ انقضای ۳۰/۹۰/۳۶۵ روز در لحظه خواندن از `ends_at` محاسبه می‌شود، بدون Scheduler | 011 |
| رتبه‌بندی نسخه‌دار | — | CREATE | نسخه منطق رتبه با Audit | 012 |
| جست‌وجو | — | CREATE | روی همان جدول‌ها؛ نوع ایندکس در 012 تصمیم می‌شود | 012 |
| استعلام اصالت | `registration_sheet` (RS-)، `pedigree` (PD-)، `puppy_card` (PC-)، `mating_permit` (MP-) | REUSE + CREATE | کدها با `humanCode(8)` روی الفبای ۳۱ نویسه‌ای ساخته می‌شوند (≈8.5×10¹¹ حالت)، جدا از UUID داخلی؛ فاز یک وضعیت «باطل/جایگزین» برای سند ندارد، پس آن نتیجه تا داده واقعی نمایش داده نمی‌شود. لاگ و Rate Limit تازه | 014 |
| فایل و تصویر | `stored_file` (فقط خصوصی)، Enum `file_purpose` | MIGRATE | تصویر عمومی سیاست سرو عمومی جدا می‌خواهد؛ فایل خصوصی فاز یک هرگز عمومی نمی‌شود | 004، 006 |
| تنظیمات | `product_setting` با Enum `setting_group` | MIGRATE | افزودن گروه؛ همان نسخه و Audit | 011، 012 |
| Audit، اعلان، سلامت | `audit_event`، `notification*`، `src/health` | REUSE | — | همه |

## ۴. فضای نام مسیرها (DEC-0144)

پیشوندهای فاز یک و دسترسی دقیقشان در `tests/ui/routes.test.ts` قفل شده‌اند:
`/` · `/login` · `/api/health` · `/dashboard` · `/notifications` · `/profile` · `/account` · `/membership` · `/animals` · `/requests` · `/registration` · `/pedigree` · `/vets` · `/declaration` · `/documents` · `/breeder` · `/kennels` · `/mating` · `/puppy-cards` · `/litters` · `/vet` · `/assoc` · `/genetics` · `/admin`.

فضای رزروشده بخش عمومی فاز دو (هیچ‌کدام زیر قاعده فاز یک نمی‌افتد؛ تا پرامپت خودش بسته است):

| مسیر | محتوا | پرامپت |
|---|---|---|
| `/veterinarians` | دایرکتوری و پروفایل عمومی دامپزشک | 006 |
| `/centers` | دایرکتوری مراکز | 008 |
| `/breeds` | بانک نژاد سگ | 003 |
| `/articles`، `/news`، `/announcements` | آموزش، خبر، اطلاعیه | 004 |
| `/associations`، `/clubs` | انجمن‌ها و کلاب‌ها | 010 |
| `/verify` | استعلام اصالت | 014 |
| `/services` | معرفی خدمات | 013 |
| `/about`، `/search` | درباره همزیست، جست‌وجوی سراسری | 002، 012 |

باز برای تصمیم در پرامپت خودش: مسیر پنل نویسنده و ادمین محتوا/اپراتور بررسی (004/005/016) و الگوی صفحات محلی استان/شهر (015). `/` در 002 جای صفحه وضعیت را گرفت و 013 آن را کامل می‌کند؛ وضعیت زیرساخت در `/api/health` است.

باز شده در 002 (DEC-0149، DEC-0152): `/about`، `/robots.txt`، `/sitemap.xml` و `/sitemaps/*` با دسترسی `PUBLIC`.

## ۵. نقش‌ها و محورهای وضعیت

پنج محور مستقل‌اند و در هیچ ستون یا جدول مشترکی ادغام نمی‌شوند (P2-D05، ARCHITECTURE_BASELINE فاز دو):

| محور | منبع |
|---|---|
| Completeness | محاسبه از فیلدهای پروفایل |
| Ownership/Claim | موجودیت Claim (007/009) |
| Professional Verification | `vet_profile.council_verified_at` و معادل مرکز |
| Trusted Hamzist | نقش `TRUSTED_VET` فعال (فاز یک) |
| Advertising | اشتراک بسته (011) |

نقش‌های فاز دو: AUTHOR، ادمین محتوا، اپراتور بررسی، مدیر مرکز، مدیر انجمن، مدیر کلاب — همه نقش حساب افزایشی و مستقل‌اند. «مدیر انجمن» فاز دو مدیر یک پروفایل دایرکتوری است و با `ASSOCIATION_OPERATOR` (اپراتور سامانه ثبت فاز یک) یکی نمی‌شود.

## ۶. تعارض‌ها و ریسک‌های شناخته‌شده

1. **D01 فاز یک در برابر P2-D09.** حل‌شده در DEC-0145: ثبت‌نام عمومی دامپزشک فقط پروفایل دایرکتوری و Professional Verification می‌سازد و نقش `TRUSTED_VET` نمی‌دهد.
2. **مالک اجباری در `vet_profile` و `vet_location`.** رکورد پیشنهادی بدون مالک در ساختار فعلی جا نمی‌شود؛ 006/007 و 008/009 باید Migration افزایشی آن را طراحی کنند بدون اینکه Finder فاز یک رکورد بدون مالک ببیند.
3. **ترتیب جغرافیا.** فیلتر استان/شهر از 006 لازم است ولی پرامپت جغرافیا 015 است؛ حداقل جدول نرمال در اولین مصرف‌کننده با Decision ساخته می‌شود.
4. **بدون Scheduler.** انقضای بسته و وضعیت Expired Package در زمان خواندن محاسبه می‌شوند.
5. **نام «انجمن».** Shell `/assoc` فاز یک با دایرکتوری `/associations` فاز دو دو چیز مختلف‌اند؛ متن UI باید این را روشن نگه دارد.
6. **صفحه `/`.** حل‌شده در 002 (DEC-0149): صفحه وضعیت زیرساخت با خانه عمومی جایگزین شد.
7. **وابستگی باز.** آسیب‌پذیری زنجیره `next → postcss` از فاز یک باز است (رفع رسمی: ارتقای major).
8. **بسته فاز دو.** Manifest مسیر `prompts/…` دارد ولی فایل‌ها در `prompts-2/` هستند و شناسه‌ها `001` بدون پیشوندند؛ Runner بدون ویرایش بسته این را نرمال می‌کند (DEC-0142).

## ۷. قاعده اجرا برای پرامپت‌های بعدی

- `node tools/runner.mjs --phase 2 prepare` → اجرا → بررسی → Commit شامل `docs/reports/phase-2/PROMPT-NNN.json` → `node tools/runner.mjs --phase 2 complete --commit HEAD` → Commit جدای `PROJECT_STATUS-PHASE-2.md`.
- Gateهای پیش‌فرض هر پرامپت فاز دو: `typecheck`، `build`، `product-tests`، `browser-tests`.
- تست‌های قفل مرز: `tests/ui/routes.test.ts` (دسترسی مسیرهای فاز یک و فضای نام فاز دو) و `tests/db/migrations.test.ts` (وجود هر ۵۹ جدول فاز یک).

## ۸. زیرساخت سطح عمومی (PROMPT-002)

| جزء | محل | قاعده برای پرامپت‌های بعدی |
|---|---|---|
| پوسته عمومی | `app/(public)/layout.tsx` → `src/public/site-shell.tsx` | هر صفحه عمومی زیر گروه `(public)` ساخته می‌شود؛ `PublicShell` در `src/ui/shell.tsx` پوسته برنامه واردشده است و جداست |
| بخش‌ها و ناوبری | `src/public/sections.ts` | ترتیب §۴؛ باز کردن بخش = `live: true` + قاعده `PUBLIC` در `src/authz/routes.ts` (تست هم‌گامی در `tests/ui/seo.test.ts`) |
| Metadata | `src/seo/metadata.ts` → `buildMetadata` | وضعیت رکورد (`PUBLISHED`/`ARCHIVED`/`DUPLICATE` + `primaryPath`) به همین تابع داده می‌شود؛ پیش‌فرض ریشه `noindex` است |
| داده ساختاریافته | `src/seo/structured-data.ts`، `src/seo/json-ld.tsx`، `src/ui/breadcrumbs.tsx` | نوع‌های Person / VeterinaryCare / Article / FAQ با پرامپت داده‌شان اضافه می‌شوند؛ فقط داده واقعی |
| sitemap و robots | `src/seo/sitemap.ts` (`SITEMAP_SECTIONS`)، `src/seo/robots.ts`، `app/sitemap.xml`، `app/sitemaps/[file]`، `app/robots.ts` | هر پرامپت محتوایی یک بخش با رکوردهای منتشرشده اضافه می‌کند؛ robots از `applicationPrefixes()` ساخته می‌شود |
| مبدأ سایت | `SITE_URL` در `src/config/env.ts` | در production اجباری و https (DEC-0150) |
| حالت‌ها | `app/not-found.tsx`، `app/(public)/error.tsx`، `app/(public)/loading.tsx` | ۴۰۴ فارسی و noindex؛ پیام خطا بدون افشای جزئیات |
