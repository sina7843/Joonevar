# گزارش PROMPT-002 فاز دو — زیرساخت عمومی، SEO و پوسته فارسی

**وضعیت:** COMPLETE · **مبنا:** `d35e06b` (پس از تکمیل PROMPT-001) · **شواهد ماشینی:** [phase-2/PROMPT-002.json](phase-2/PROMPT-002.json)

## ۱. وضعیت واقعی پیش از این مرحله

| مورد | مشاهده در کد |
|---|---|
| `/` | صفحه وضعیت زیرساخت (دیتابیس، تنظیمات، آداپتورها)؛ نه پوسته عمومی داشت نه ناوبری |
| Metadata | فقط `title` و `description` ثابت در `app/layout.tsx`؛ بدون canonical، OpenGraph، robots یا داده ساختاریافته |
| sitemap / robots | وجود نداشتند |
| ۴۰۴ | صفحه پیش‌فرض انگلیسی Next (`This page could not be found.`) |
| مبدأ سایت | هیچ متغیری برای دامنه عمومی نبود |
| پوسته‌ها | `PublicShell` (برنامه واردشده) و `OpsShell` (عملیاتی)؛ هیچ پوسته‌ای برای بازدیدکننده بدون ورود |
| آیکن | ۲۳ glyph از Phosphor 2.1.1؛ آیکن منو و caret نبود |

## ۲. آنچه ساخته شد

- **پوسته عمومی** (`app/(public)/layout.tsx` → `src/public/site-shell.tsx`، DEC-0149): پیوند پرش به محتوا، هدر چسبان با لوگو، ناوبری دسکتاپ با `aria-current`، دکمه «ورود / ثبت‌نام» که برای حساب واردشده «پنل من» می‌شود، منوی موبایل disclosure (`aria-expanded`، بستن با Escape و بازگشت فوکوس، بسته شدن پس از ناوبری، هدف لمسی ۴۴px) و فوتر. پوسته هیچ دسترسی‌ای نمی‌دهد؛ `/dashboard` همچنان روی سرور بسته است.
- **بخش‌ها** (`src/public/sections.ts`): ترتیب کامل §۴؛ فقط بخش ساخته‌شده پیوند می‌گیرد (امروز خانه و درباره). هیچ پیوندی به دامپزشکان، مراکز، نژادها، آموزش، خبر، انجمن یا استعلام تا ساخته شدنشان نیست.
- **خانه** (`app/(public)/page.tsx`): پیام ارزش، خدمات فاز یکی که امروز شروع‌شدنی‌اند با توصیف داشبورد، روش کار سه‌مرحله‌ای و CTA ورود/پنل. بدون مبلغ، زمان، آمار یا بلوک خالی.
- **درباره همزیست** (`app/(public)/about/page.tsx`): فقط قاعده‌هایی که محصول فاز یک امروز اجرا می‌کند؛ Breadcrumb با BreadcrumbList.
- **Metadata** (`src/seo/metadata.ts`، DEC-0151): canonical مطلق بدون query/fragment/اسلش پایانی؛ OpenGraph `fa_IR` و Twitter؛ `ARCHIVED` → `noindex, follow`؛ `DUPLICATE` → canonical رکورد اصلی و `noindex, follow`؛ بیرون از production همه `noindex, nofollow`؛ پیش‌فرض ریشه `noindex`.
- **داده ساختاریافته** (`src/seo/structured-data.ts`، `src/seo/json-ld.tsx`، `src/ui/breadcrumbs.tsx`): Organization، WebSite (بدون SearchAction)، BreadcrumbList؛ سریال‌سازی امن در برابر `</script>` و جداکننده‌های خط.
- **sitemap و robots** (`src/seo/sitemap.ts`، `src/seo/robots.ts`، `app/sitemap.xml/route.ts`، `app/sitemaps/[file]/route.ts`، `app/robots.ts`، DEC-0152): فهرست بخش‌ها + urlset هر بخش؛ `lastmod` فقط با تاریخ واقعی؛ robots در production همه پیشوندهای برنامه را از `applicationPrefixes()` به شکل `/x$` و `/x/` می‌بندد تا `/vet` دایرکتوری `/veterinarians` را پنهان نکند؛ بیرون از production `Disallow: /`.
- **مبدأ سایت** (`SITE_URL` در `src/config/env.ts`، DEC-0150): در production اجباری و https؛ `.env.example` و `docs/ops/runbook.md` به‌روز شدند.
- **حالت‌ها:** ۴۰۴ فارسی سراسری با `noindex` (`app/not-found.tsx`)، خطای گروه عمومی بدون افشای جزئیات با «تلاش دوباره» (`app/(public)/error.tsx`)، بارگذاری با `LoadingState` (`app/(public)/loading.tsx`).
- **مجوز مسیر** (`src/authz/routes.ts`): `/about`، `/robots.txt`، `/sitemap.xml`، `/sitemaps` با `PUBLIC`؛ هیچ قاعده فاز یک تغییر نکرد.
- **آیکن** (DEC-0153): `list` و `caretLeft` عیناً از `@phosphor-icons/core` 2.1.1.

## ۳. فایل‌های تغییرکرده

| فایل | تغییر |
|---|---|
| `app/(public)/layout.tsx`، `page.tsx`، `about/page.tsx`، `error.tsx`، `loading.tsx` | گروه مسیر عمومی: پوسته، خانه، درباره، خطا، بارگذاری |
| `app/page.tsx` | حذف: صفحه وضعیت زیرساخت (وضعیت در `/api/health` می‌ماند) |
| `app/not-found.tsx` | ۴۰۴ فارسی سراسری با `noindex` |
| `app/robots.ts`، `app/sitemap.xml/route.ts`، `app/sitemaps/[file]/route.ts` | robots، فهرست sitemap و urlset هر بخش |
| `app/layout.tsx` | پیش‌فرض `noindex, nofollow` |
| `src/public/site-shell.tsx`، `site-nav.tsx`، `sections.ts`، `request.ts` | پوسته، ناوبری دسکتاپ و منوی موبایل، فهرست بخش‌های §۴، بازدیدکننده و مبدأ هر درخواست |
| `src/seo/metadata.ts`، `structured-data.ts`، `json-ld.tsx`، `sitemap.ts`، `robots.ts` | قواعد Metadata، JSON-LD، sitemap و robots (خالص و تست‌پذیر) |
| `src/ui/breadcrumbs.tsx` | Breadcrumb و BreadcrumbList از یک فهرست |
| `src/ui/icon-paths.ts` | `list` و `caretLeft` از Phosphor 2.1.1 |
| `src/authz/routes.ts` | قاعده `PUBLIC` برای `/about`، `/robots.txt`، `/sitemap.xml`، `/sitemaps`؛ `applicationPrefixes()` |
| `src/config/env.ts` | `SITE_URL`، الزام https در production، `siteUrl()` |
| `.env.example`، `docs/ops/runbook.md` | مستند `SITE_URL` و قاعده production |
| `tools/browser-tests.mjs` | `SITE_URL` سرور تست |
| `tests/ui/seo.test.ts` | ۱۳ تست Metadata، JSON-LD، robots، sitemap و هم‌گامی بخش‌ها با نقشه دسترسی |
| `tests/ui/routes.test.ts`، `tests/config/env.test.ts` | مسیرهای عمومی باز؛ `SITE_URL` |
| `tests/db/startup.test.ts`، `health.test.ts`، `integrations.test.ts` | پیکربندی production معتبر حالا `SITE_URL` دارد |
| `tests/browser/public-shell.test.ts` | ۷ تست مرورگر پوسته، Metadata، منوی موبایل، robots/sitemap، ۴۰۴ و دسترسی |
| `tests/browser/visual.test.ts` | خانه و درباره در فهرست بازبینی بصری |
| `DECISIONS.md`، `REQUIREMENTS_TRACEABILITY.md`، `docs/architecture/phase-2-boundary.md` | DEC-0149…DEC-0153، ردیف P2-R02، بخش ۸ مرز |

## ۴. Migrationها

هیچ. این مرحله موجودیت داده‌ای نساخت (P2-D15)؛ Schema و ۱۷ Migration فاز یک دست‌نخورده‌اند.

## ۵. بررسی‌های واقعاً اجراشده

همه روی درختی که Commit شد، پشت سر هم و بدون اجرای هم‌زمان.

| بررسی | فرمان | نتیجه |
|---|---|---|
| build | `npm run build` | PASS — Compiled successfully، exit 0؛ `/` و `/about` پویا (ƒ)، `/_not-found` ایستا |
| typecheck | `npx tsc --noEmit` | PASS — exit 0 (پس از build که `.next/types` کهنه صفحه حذف‌شده `app/page.tsx` را بازسازی کرد) |
| product-tests | `npm test` | PASS — tests 352 · pass 352 · fail 0 · skipped 0 (۷۴ ثانیه)؛ ۱۴ تست تازه: ۱۳ در `tests/ui/seo.test.ts` و `SITE_URL` در `tests/config/env.test.ts`، به‌علاوه قفل مسیرهای عمومی در `tests/ui/routes.test.ts` |
| browser-tests | `npm run test:browser` | PASS — tests 97 · pass 97 · fail 0 (۲۹۷ ثانیه) روی دیتابیس یک‌بارمصرف `hamzist_browser_8db32d172dce` و سرور `127.0.0.1:12099` با `SITE_URL` همان سرور؛ ۷ تست تازه `public-shell` + خانه و درباره در `visual` + کل رگرسیون فاز یک (۹۰ تست قبلی)؛ پس از اجرا هیچ دیتابیس تست باقی نماند |

Screenshotهای بازبینی‌شده: [phase-2/prompt-002](screenshots/phase-2/prompt-002/) — خانه و درباره در موبایل ۳۶۰ و دسکتاپ ۱۴۴۰، هدر، منوی باز موبایل، ۴۰۴. بررسی چشمی: RTL درست، بدون اسکرول افقی، Breadcrumb از راست، منوی موبایل روی محتوا باز می‌شود. Screenshotهای بازتولیدشده فاز یک Commit نشدند.

## ۶. پوشش حالت‌ها

| حالت | پوشش |
|---|---|
| loading | `app/(public)/loading.tsx` با `LoadingState` (`role="status"`، `aria-busy`) |
| empty | خانه و درباره داده پویا ندارند؛ به‌جای بلوک خالی، بخش ساخته‌نشده اصلاً نمایش و پیوند داده نمی‌شود (تست مرورگر: هیچ `a[href]` به هفت بخش برنامه‌ریزی‌شده) |
| error | `app/(public)/error.tsx`: پیام فارسی بدون جزئیات خطا، پوسته باقی می‌ماند، `reset()` |
| not found | `app/not-found.tsx`: ۴۰۴ واقعی، فارسی، RTL و `noindex` برای `/veterinarians` (رزروشده) و مسیر ناشناخته (تست مرورگر) |
| forbidden | صفحات عمومی محدودیتی ندارند؛ تغییر URL به `/dashboard` برای ناشناس همچنان به ورود با `next` می‌رسد (تست مرورگر) و مسیر رزروشده بسته است (`tests/ui/routes.test.ts`، `tests/ui/seo.test.ts`) |
| archived / duplicate | در لایه Metadata: `ARCHIVED` → `noindex, follow`؛ `DUPLICATE` → canonical اصلی + `noindex, follow`؛ Duplicate بدون اصلی رد می‌شود (`tests/ui/seo.test.ts`). اولین رکورد محتوایی (003/004) وضعیتش را به همین تابع می‌دهد |

## ۷. Known Gaps

- وفاداری بصری پوسته عمومی به Figma بررسی نشده (فریم سطح عمومی فاز دو در منابع نیست) — UNVERIFIED؛ فقط توکن‌ها و اجزای DS موجود استفاده شده‌اند.
- تصویر OpenGraph نماد ۱۴۴×۱۶۲ لوگوست؛ تصویر اشتراک‌گذاری ۱۲۰۰×۶۳۰ از DS در دست نیست و ساخته نشد.
- صفحات عمومی `force-dynamic` هستند (مبدأ زمان اجرا و وضعیت ورود در هدر)؛ کش ایستا موضوع PROMPT-018 است.
- بخش‌های §۵ خانه (جست‌وجو، نژاد منتخب، محتوا، انجمن، آمار واقعی) با 003–013 می‌آیند.
- جست‌وجو و استعلام «دسترسی برجسته در موبایل» (§۴) دارند، ولی تا 012 و 014 ساخته نشده‌اند و پیوندشان نمایش داده نمی‌شود.
- `robots.txt` از `$` استفاده می‌کند که Google و Bing پشتیبانی می‌کنند؛ خزنده‌ای که آن را نشناسد `/x$` را نادیده می‌گیرد ولی `/x/` همچنان زیرمسیرها را می‌بندد.

## ۸. پرامپت بعدی

PROMPT-003 — گونه‌ها و بانک نژاد سگ.
