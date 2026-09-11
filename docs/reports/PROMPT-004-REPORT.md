# گزارش PROMPT-004 فاز دو — CMS و نقش نویسنده

**وضعیت:** COMPLETE · **مبنا:** `29fa2de` (پس از تکمیل PROMPT-003) · **شواهد ماشینی:** [phase-2/PROMPT-004.json](phase-2/PROMPT-004.json)

## ۱. وضعیت واقعی پیش از این مرحله

| مورد | مشاهده در کد |
|---|---|
| محتوا | هیچ جدول، سرویس یا صفحه‌ای برای آموزش، خبر یا اطلاعیه نبود؛ `/articles`، `/news`، `/announcements` در فضای رزروشده بسته بودند |
| نقش‌ها | پنج نقش فاز یک (BREEDER، TRUSTED_VET، ASSOCIATION_OPERATOR، GENETICS_OPERATOR، SUPERADMIN)؛ Context عملیاتی فقط با نشانی خودش باز می‌شود (D11) |
| رد Context در `/api/context` | فقط سه نام عملیاتی فاز یک، به‌صورت دستی — نه فهرست `OPERATIONAL_CONTEXTS` |
| فایل | فقط خصوصی (`/api/files/[id]` با مالک یا بازبین)؛ هیچ مسیر سرو عمومی |
| پیوند نژاد | بانک نژاد PROMPT-003 شناسه و نشانی پایدار آماده کرده بود؛ «مطالب مرتبط» هنوز نبود |

## ۲. آنچه ساخته شد

- **نقش‌ها و محیط‌ها** (DEC-0158):
  - نقش‌های `AUTHOR` و `CONTENT_ADMIN` با محیط‌های مستقل `/author` و `/content`، بیرون از Role Switcher.
  - اعطا و تعلیق با دلیل و Audit در `/admin/roles` سوپرادمین.
  - `/api/context` حالا هر Context عملیاتی را با همان فهرست مشترک رد می‌کند.
  - حساب‌های آزمایشی `09990000007` (نویسنده) و `09990000008` (ادمین محتوا).
- **مدل و Migration `0018_cms`** (DEC-0159):
  - `content_item` (مقدار زنده، وضعیت، زمان انتشار، یادداشت Moderation، نسخه).
  - `content_revision` (Snapshot هر ذخیره).
  - `content_category` (به تفکیک نوع).
  - `content_slug_redirect`.
  - Enumهای نوع و وضعیت.
  - مقدار تازه برای نقش، Context و هدف فایل `CONTENT_IMAGE`.
- **قواعد** (`src/content/model.ts`، خالص):
  - نوع قابل ساخت برای هر نقش.
  - حرکت‌های مجاز وضعیت برای هر نقش و مالکیت، و اینکه کدام حرکت دلیل می‌خواهد.
  - وضعیت دیده‌شدن در لحظه خواندن (زمان‌بندی بدون Scheduler).
  - شرط انتشار؛ آموزش منبع و تاریخ بازبینی می‌خواهد.
  - نشانی فارسی یا لاتین، منابع، برچسب‌ها و امضای نویسنده.
- **سرویس** (`src/content/service.ts`، `src/content/roles.ts`):
  - **دسترسی و هم‌زمانی:** نویسنده فقط محتوای خودش را می‌بیند؛ هر ذخیره نسخه و Audit دارد و نسخه کهنه CONFLICT می‌گیرد.
  - **عملیات:** ساخت با نامزد عنوان تکراری، ویرایش با diff، تصویر، تغییر وضعیت (انتشار فوری یا زمان‌بندی‌شده، پیش‌نویس، بایگانی، پنهان، حذف نرم، بازگردانی)، بازگردانی نسخه و دسته‌ها.
  - **خواننده‌های عمومی:** فهرست، صفحه، مطالب مرتبط نژاد، sitemap و تصویر عمومی.
- **پنل‌ها:** فهرست با فیلتر وضعیت و نوع و صفحه‌بندی؛ ساخت پیش‌نویس؛ ویرایشگر شامل متن و مشخصات، تصویر با متن جایگزین، وضعیت با زمان انتشار و دلیل، و فهرست نسخه‌ها با بازگردانی؛ مدیریت دسته‌ها. ویرایشگر بدون بازنشانی خودکار فرم ارسال می‌شود (DEC-0157).
- **صفحات عمومی:**
  - فهرست `/articles`، `/news` و `/announcements`: دسته، صفحه‌بندی و سه حالت خالی.
  - صفحه هر مطلب:
    - محتوا: Breadcrumb، امضا، تاریخ انتشار و بازبینی، تصویر، خلاصه، متن، برچسب‌ها، منابع با `nofollow` و نژاد مرتبط.
    - داده ساختاریافته: Article یا NewsArticle.
    - وضعیت‌ها: اعلان بایگانی با `noindex`، ۳۰۸ برای نشانی قبلی، و ۴۰۴ برای پیش‌نویس، زمان‌بندی‌شده، پنهان و حذف‌شده.
  - «آموزش‌ها» و «اخبار» در ناوبری live شدند؛ سه بخش sitemap با `lastmod` واقعی.
- **تصویر عمومی** (DEC-0160): `/media/[id]` فقط برای محتوای قابل‌مشاهده یا بایگانی‌شده؛ با پنهان کردن یا برگرداندن محتوا به پیش‌نویس، تصویر هم ۴۰۴ می‌دهد.
- **رابطه محتوا با نژاد:** صفحه نژاد بخش «مطالب مرتبط» منتشرشده را نشان می‌دهد.
- **SEO:** `buildMetadata` تصویر خود صفحه را در OpenGraph می‌پذیرد؛ `articleLd` در `src/seo/structured-data.ts` اضافه شد.

## ۳. فایل‌های تغییرکرده

| فایل | تغییر |
|---|---|
| `src/db/schema/enums.ts`، `src/db/schema/content.ts`، `src/db/schema/index.ts` | Enumهای محتوا، مقدارهای تازه نقش/Context/هدف فایل، جدول‌های CMS |
| `src/db/migrations/0018_cms.sql`، `meta/0018_snapshot.json`، `meta/_journal.json` | Migration تولیدشده با drizzle-kit |
| `src/content/model.ts`، `src/content/service.ts`، `src/content/roles.ts` | قواعد خالص، سرویس محتوا و خواننده‌های عمومی، مدیریت نقش‌های محتوا |
| `src/content/actions.ts`، `src/content/editor.tsx`، `src/content/panel.tsx`، `src/content/public-views.tsx` | Server Actionها، فرم‌های ویرایشگر، نمای پنل‌ها، نمای عمومی فهرست و جزئیات |
| `app/author/**`، `app/content/**`، `app/admin/roles/**` | مسیرهای محیط نویسنده، ادمین محتوا و نقش‌های محتوای سوپرادمین |
| `app/(public)/articles/**`، `app/(public)/news/**`، `app/(public)/announcements/**` | فهرست (با مرز بارگذاری) و صفحه جزئیات هر نوع |
| `app/media/[id]/route.ts` | سرو عمومی تصویر محتوای قابل‌مشاهده |
| `app/(public)/breeds/[slug]/page.tsx` | «مطالب مرتبط» نژاد |
| `app/api/context/route.ts` | رد همه Contextهای عملیاتی با فهرست مشترک |
| `app/dashboard/page.tsx` | ورود به محیط نویسنده و ادمین محتوا برای دارنده نقش |
| `src/authz/actor.ts`، `src/authz/policy.ts`، `src/authz/routes.ts` | نقش و Context تازه، خواننده خصوصی تصویر محتوا، مسیرهای `/author`، `/content`، `/articles`، `/news`، `/announcements`، `/media` |
| `src/files/signature.ts` | قاعده فایل `CONTENT_IMAGE` |
| `src/ui/shell.tsx`، `src/ui/role-switcher.tsx` | ناوبری محیط‌های تازه و برچسب Context |
| `src/breeds/model.ts` | `unifyPersianLetters` مشترک |
| `src/seo/metadata.ts`، `src/seo/structured-data.ts`، `src/seo/sitemap.ts`، `src/public/sections.ts` | تصویر OpenGraph صفحه، `articleLd`، سه بخش sitemap، «آموزش‌ها» و «اخبار» live |
| `src/db/seed/dev-fixtures.ts` | حساب آزمایشی نویسنده و ادمین محتوا |
| `tests/domain/content.test.ts` | ۸ تست قواعد خالص |
| `tests/db/content.test.ts` | ۹ تست نقش، نسخه، دسترسی، انتشار و زمان‌بندی، تصویر، Moderation، بایگانی و حذف نرم، نشانی و نسخه، دسته، مطالب مرتبط |
| `tests/browser/content.test.ts` | ۳ تست مرورگر سراسری CMS |
| `tests/ui/routes.test.ts`، `tests/ui/seo.test.ts`، `tests/db/health.test.ts`، `tests/browser/public-shell.test.ts`، `tests/browser/visual.test.ts` | مسیرها و محیط‌های تازه، بخش‌های live، تعداد نقش Fixture، ناوبری، بازبینی بصری `/articles` و `/news` |
| `tests/browser/operations.test.ts`، `vet-service`، `genetics`، `kennel`، `pedigree`، `permit`، `personal`، `pregnancy`، `puppy-card`، `registration` (`.test.ts`) | ناوبری قفل‌شده سوپرادمین با «نقش‌های محتوا»؛ کمک‌تابع `completeProfile` فقط روی `/account/complete` |
| `DECISIONS.md`، `REQUIREMENTS_TRACEABILITY.md`، `docs/architecture/phase-2-boundary.md` | DEC-0158…DEC-0160، ردیف‌های P2-R04 و P2-D11…D13، ردیف CMS |

## ۴. Migrationها

| Migration | محتوا |
|---|---|
| `src/db/migrations/0018_cms.sql` (+ `meta/0018_snapshot.json`، `_journal.json`) | Enumهای `content_kind` و `content_status`؛ `ADD VALUE` برای `account_role_name` و `actor_context` (`AUTHOR`، `CONTENT_ADMIN`) و `file_purpose` (`CONTENT_IMAGE`)؛ جدول‌های `content_category`، `content_item`، `content_revision`، `content_slug_redirect` با FK به `account`، `species`، `reference_breed` و `stored_file`؛ ایندکس یکتای نشانی در هر نوع و ایندکس فهرست عمومی |

افزایشی است و هیچ جدول، ستون یا ردیف فاز یک یا PROMPT-003 تغییر نمی‌کند.

## ۵. بررسی‌های واقعاً اجراشده

همه پشت سر هم و بدون اجرای هم‌زمان.

| بررسی | فرمان | نتیجه |
|---|---|---|
| build | `npm run build` | PASS — Compiled successfully، exit 0، روی درخت نهایی؛ `/articles`، `/articles/[slug]`، `/author/*`، `/content/*` و `/media/[id]` پویا |
| typecheck | `npx tsc --noEmit` | PASS — exit 0 روی درخت نهایی |
| product-tests | `npm test` | PASS — tests 385، pass 385، fail 0، skipped 0 (۷۹ ثانیه). تست‌های تازه: ۸ تست `tests/domain/content.test.ts` و ۹ تست `tests/db/content.test.ts`. تست‌های به‌روزشده: `routes` (محیط‌های تازه و Switcher)، `seo` و `health` (تعداد نقش Fixture از فهرست). پس از این اجرا فقط `src/ui/field.tsx`، `src/content/editor.tsx` و تست‌های مرورگر تغییر کردند که هیچ‌کدام در `npm test` نیستند |
| browser-tests | `npm run test:browser` | PASS — tests 103، pass 103، fail 0 (۲۹۲ ثانیه). دیتابیس یک‌بارمصرف `hamzist_browser_f7060fd03074`، سرور `127.0.0.1:4659`. تست‌های تازه: ۳ تست `content` و `/articles` و `/news` در `visual`، همراه کل رگرسیون فاز یک و PROMPT-002/003. پس از اجرا هیچ دیتابیس تست باقی نماند |

**مسیر رسیدن به نتیجه.**
- **DB:** اولین اجرای تست دیتابیس ۸ از ۹ بود. انتظار خود تست غلط بود: پیش‌نویس خالی اول «خلاصه» را کم دارد، نه «منبع». همچنین `health.test` تعداد نقش Fixture را ثابت ۵ فرض کرده بود و حالا از فهرست Fixture شمرده می‌شود.
- **اولین اجرای کامل مرورگر (۹۷ از ۱۰۳).** هر سه تست CMS سبز بودند و شکست‌ها در تست‌های قدیمی بود:
  - فهرست قفل‌شده ناوبری سوپرادمین «نقش‌های محتوا» را نداشت.
  - کمک‌تابع `completeProfile` در ده Suite فرم ویرایش پروفایلِ Fixture را جای فرم «تکمیل حساب» پر می‌کرد. بسته به ترتیب اجرای Suiteها، vet-service و پنج تست وابسته‌اش قرمز شدند. همه نسخه‌های این کمک‌تابع حالا فقط روی `/account/complete` عمل می‌کنند؛ همان رفعی که PROMPT-001 برای cross-flow انجام داد.
- **Screenshotها** دو اشکال ویرایشگر را نشان دادند که رفع شدند:
  - پس از تغییر وضعیت، گزینه‌ای که دیگر مجاز نبود زمان انتشار و دکمه را فعال نگه می‌داشت.
  - فیلدهای چندخطیِ غیرقابل‌ویرایش ظاهر غیرفعال نداشتند.
- پس از این رفع‌ها، build، typecheck و اجرای کامل مرورگر روی درخت نهایی: ۱۰۳ از ۱۰۳.

**Screenshotها** در [phase-2/prompt-004](screenshots/phase-2/prompt-004/) هستند: نقش‌های محتوا، ویرایشگر نویسنده، فهرست و صفحه آموزش در موبایل و دسکتاپ، محتوای پنهان در پنل ادمین و نویسنده، و صفحه بایگانی. Screenshotهای بازتولیدشده مرحله‌های قبل Commit نشدند.

## ۶. پوشش حالت‌ها

| حالت | پوشش |
|---|---|
| loading | `loading.tsx` برای فهرست هر سه نوع؛ صفحه جزئیات عمداً بدون مرز بارگذاری (DEC-0157) |
| empty | «هنوز آموزشی/خبری/اطلاعیه‌ای منتشر نشده است»، «اینجا هنوز مطلبی منتشر نشده است» برای دسته، «این دسته پیدا نشد»، «هنوز محتوایی نیست» در پنل، «هنوز نقشی داده نشده است» |
| error | خطای Server Action به‌صورت پیام فارسی در همان فرم؛ خطای رندر در `app/(public)/error.tsx` |
| forbidden | همه نویسنده‌ها `FORBIDDEN` خارج از محیط نویسنده/ادمین محتوا؛ نویسنده برای محتوای دیگران `NOT_FOUND`؛ نویسنده روی محتوای پنهان/حذف‌شده `FORBIDDEN`؛ `/author` و `/content` برای ناشناس به ورود با `next` دقیق و برای حساب بدون نقش `FORBIDDEN` (تست دیتابیس و مرورگر) |
| duplicate | عنوان تکراری در همان نوع تا تأیید صریح پذیرفته نمی‌شود؛ نشانی تکراری CONFLICT؛ دسته تکراری CONFLICT |
| archived | اعلان بایگانی، `noindex, follow`، بیرون از فهرست و sitemap، نشانی و تصویر باز |
| scheduled / hidden / deleted | ۴۰۴ عمومی؛ پنل «زمان‌بندی‌شده» و یادداشت Moderation را نشان می‌دهد؛ حذف نرم و بازگردانی فقط با ادمین محتوا |
| conflict | نسخه کهنه در ویرایش، تصویر، وضعیت و بازگردانی نسخه → CONFLICT فارسی |

## ۷. Known Gaps

- **نوشته کلاب:** در مدل هست ولی تا PROMPT-010 ساخته نمی‌شود.
- **گزارش کاربر و صف Moderation:** در PROMPT-005 ساخته می‌شود. در این مرحله پنهان‌سازی و حذف نرم فقط به تصمیم مستقیم ادمین محتوا انجام می‌شود.
- **متن ساده:** متن بند ساده است، بدون عنوان داخلی، فهرست یا پیوند درون متن. ویرایشگر غنی و رندر امن Markdown تصمیم جدا می‌خواهد.
- **تصویر:**
  - فقط یک تصویر برای هر مطلب؛ بدون تغییر اندازه یا حذف مستقل. جایگزینی با بارگذاری تازه انجام می‌شود.
  - کش و بهینه‌سازی تصویر مال PROMPT-018 است.
- **جست‌وجو:** جست‌وجوی متن محتوا در PROMPT-012 است.
- **نامزد عنوان تکراری:** کل محتوای همان نوع در حافظه مقایسه می‌شود؛ برای هزاران مطلب کافی است.
- **امضای نویسنده:** به `displayNameVisible` پروفایل فاز یک وابسته است. تا کاربری آن را روشن نکند، مطلب با «تیم همزیست» امضا می‌شود.
- **مدیریت نقش‌ها:** فعلاً فقط با شماره موبایل حساب موجود، در محیط سوپرادمین. پنل مدیریت کامل در PROMPT-016 است.
- **وفاداری بصری:** پنل‌ها و صفحات محتوا UNVERIFIED‌اند (فریم Figma فاز دو در منابع نیست).

## ۸. پرامپت بعدی

PROMPT-005 — گزارش محتوا و Moderation.
