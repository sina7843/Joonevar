# گزارش PROMPT-001 فاز دو — کشف وضعیت فاز یک و تثبیت مرز فاز دو

**وضعیت:** COMPLETE · **مبنا:** `33acb9a` (HEAD شاخه `main` در زمان prepare) · **Runner:** `node tools/runner.mjs --phase 2` · **شواهد ماشینی:** [phase-2/PROMPT-001.json](phase-2/PROMPT-001.json)

## ۱. وضعیت واقعی کد و وابستگی‌ها

| مورد | مشاهده در کد |
|---|---|
| Stack | Next.js 15.5 (App Router)، React 19، TypeScript strict، PostgreSQL 16 (Docker، پورت 5433)، Drizzle ORM، `node:test`، Playwright |
| پیشرفت فاز یک | ۲۰/۲۰ پرامپت COMPLETE در `PROJECT_STATUS.md`، به‌علاوه اصلاحات درخواستی کاربر DEC-0122…DEC-0141 |
| Migration | ۱۷ فایل `0000_foundation` … `0016_official-identity`، ۵۹ جدول |
| سطح عمومی بدون ورود | فقط `/`، `/login`، `/api/health`؛ `/` صفحه وضعیت زیرساخت است، نه صفحه محصول |
| SEO | فقط `metadata` ثابت در `app/layout.tsx`؛ بدون `sitemap`، `robots`، canonical یا داده ساختاریافته |
| مجوز مسیر | `src/authz/routes.ts`، طولانی‌ترین پیشوند برنده، مسیر ثبت‌نشده بسته (DEC-0023)؛ اعمال در هر صفحه با `guardRoute` (Middleware وجود ندارد) |

نقشه کامل reuse / migrate / create، فضای نام مسیرها، محورهای وضعیت و تعارض‌ها در [docs/architecture/phase-2-boundary.md](../architecture/phase-2-boundary.md) است.

## ۲. آنچه در این مرحله تغییر کرد

**بدون Schema، Migration، نقش، مسیر یا صفحه تازه** (DEC-0143): ساختن هرکدام پیش از پرامپت صاحبش، تصمیم آن پرامپت را پیش‌دستی و خطر رکورد موازی (P2-D15) را زیاد می‌کرد.

- **Runner فاز دو** — پرچم `--phase 2` روی همه فرمان‌ها؛ Manifest بسته بدون ویرایش در حافظه نرمال می‌شود (DEC-0142).
- **قفل مرز** — `tests/ui/routes.test.ts` دسترسی دقیق هر پیشوند فاز یک و زیرمسیرهایش را قفل می‌کند و فضای نام رزروشده فاز دو را از افتادن زیر قاعده فاز یک حفظ می‌کند (DEC-0144). `tests/db/migrations.test.ts` وجود هر ۵۹ جدول فاز یک را بررسی می‌کند (DEC-0146).
- **مرز محصولی** — ثبت‌نام عمومی دامپزشک نقش `TRUSTED_VET` نمی‌دهد؛ نقش‌های فاز دو افزایشی و جدا هستند (DEC-0145).
- **دو باگ واقعی از رگرسیون فاز یک:**
  - پذیرش کد مراجعه، کد و درخواست را با دو SELECT جدا می‌خواند و بازنده رقابت گاهی دلیل رد اشتباه می‌گرفت؛ حالا یک SELECT با join (DEC-0147).
  - تست مرورگر روی دیتابیس کاری مشترک اجرا می‌شد و پس از ده‌ها اجرا ۲۱ تست به‌خاطر داده انباشته قرمز شد؛ حالا هر اجرا دیتابیس، پوشه ذخیره و سرور جدای خودش را دارد (DEC-0148). همین جداسازی سه نقص پنهان دیگر را هم نشان داد و رفع شد: Seed حساب‌های آزمایشی `displayName` اجباری DEC-0141 را نمی‌نوشت، تست ورود دوباره پورت ۳۱۱۱ را ثابت فرض کرده بود، و کمک‌تابع تکمیل پروفایل در cross-flow روی فرم ویرایش پروفایل موجود هم فرم «تکمیل حساب» را پر می‌کرد.

## ۳. فایل‌های تغییرکرده

| فایل | تغییر |
|---|---|
| `tools/runner.mjs`، `tools/tests/runner.test.mjs` | پرچم `--phase`، جدول مسیرهای هر فاز، نرمال‌سازی Manifest فاز دو و تست آن |
| `tools/browser-tests.mjs` | دیتابیس، پوشه ذخیره و سرور production جدا برای هر اجرای مرورگر، با پاک‌سازی قطعی |
| `src/vets/visits.ts` | پذیرش کد مراجعه با یک SELECT همراه join |
| `src/db/seed/dev-fixtures.ts` | نوشتن `displayName` برای حساب‌های آزمایشی |
| `tests/ui/routes.test.ts` | قفل دسترسی مسیرهای فاز یک و فضای نام رزروشده فاز دو |
| `tests/db/migrations.test.ts`، `tests/db/referrals.test.ts` | فهرست ۵۹ جدول؛ بازنده رقابت همیشه `CONSUMED` می‌بیند |
| `tests/browser/*.test.ts` (۱۳ فایل) | انتخاب مرکز خود تست به‌جای `.first()`، Finder محدود به داده خود تست، بازگرداندن حالت پرداخت، URL مستقل از پورت، تکمیل پروفایل فقط روی فرم تکمیل |
| `DECISIONS.md` | DEC-0142…DEC-0148 |
| `REQUIREMENTS_TRACEABILITY.md`، `REQUIREMENTS_TRACEABILITY.json` | جدول شواهد فاز دو |
| `docs/architecture/phase-2-boundary.md` | نقشه reuse/migrate/create و مرز مسیرها |
| `PROJECT_STATUS-PHASE-2.md`، `PRODUCT_DECISIONS.md`، `Requirements-Phase-2.md`، `prompts-2/`، `Hamzist-Phase-2-Prompt-Package-v1.0/` | فایل‌های اجرای فاز دو؛ نسخه‌های ریشه با بسته sha256 یکسان‌اند |

## ۴. Migrationها

هیچ. ۱۷ Migration فاز یک دست‌نخورده‌اند و روی دیتابیس خالی (هر Suite و هر اجرای مرورگر) اجرا و بررسی شدند.

## ۵. بررسی‌های واقعاً اجراشده

همه روی همان درختی که Commit شد، پشت سر هم و بدون اجرای هم‌زمان (اجرای هم‌زمان build و تست پیش‌تر حافظه Node را تمام کرده بود).

| بررسی | فرمان | نتیجه |
|---|---|---|
| typecheck | `npx tsc --noEmit` | PASS — exit 0 |
| product-tests | `npm test` | PASS — tests 338 · pass 338 · fail 0 · skipped 0 (۷۳ ثانیه) |
| runner-tests | `node --test tools/tests/runner.test.mjs` | PASS — tests 17 · pass 17 · fail 0 |
| build | `npm run build` | PASS — Compiled successfully، exit 0 |
| browser-tests | `npm run test:browser` | PASS — tests 90 · pass 90 · fail 0 (۲۸۷ ثانیه) روی دیتابیس یک‌بارمصرف `hamzist_browser_b76f17ad1ee4` و سرور `127.0.0.1:3330`؛ پس از اجرا هیچ دیتابیس `hamzist_browser_%` یا `hamzist_test_%` باقی نماند |

اجرای مرورگر پیش از این اصلاحات: ۶۹/۹۰ روی دیتابیس مشترک، سپس ۸۶/۹۰ روی دیتابیس جدا؛ هر چهار شکست باقی نقص تست یا Seed بود و در بخش ۲ آمده است. Screenshotهای بازتولیدشده فاز یک Commit نشدند تا شواهد تاریخی همان پرامپت‌ها دست نخورد.

## ۶. پوشش حالت‌ها

این مرحله صفحه یا موجودیتی نساخت، پس حالت‌های loading، empty، error، forbidden، duplicate و archived برای سطح تازه‌ای وجود ندارند. پوشش آن‌ها برای سطح موجود با اجرای کامل رگرسیون مرورگر فاز یک انجام شد (تست‌های `rtl`، `visual`، `identity`، `operations` شامل صفحه دسترسی غیرمجاز، صفحه یافت‌نشدن پرونده، حالت خالی و قفل سرویس).

## ۷. Known Gaps

- `vet_profile.account_id` و `vet_location.vet_account_id` اجباری‌اند و رکورد «بدون مالک» (P2-D06) در ساختار فعلی جا نمی‌شود؛ طراحی Migration آن با PROMPT-006/007 و 008/009 است.
- جغرافیا در چهار جدول متن آزاد است؛ جدول نرمال در اولین مصرف‌کننده (006) ساخته می‌شود.
- فاز یک وضعیت «باطل/جایگزین» برای سند ندارد؛ استعلام 014 آن نتیجه را تا داده واقعی نمایش نمی‌دهد.
- آسیب‌پذیری زنجیره `next → postcss` از فاز یک باز است (رفع رسمی: ارتقای major).
- فهرست‌های `/admin/vets` و `/vet/samples` صفحه‌بندی ندارند؛ با داده واقعی هنوز مشکل نیستند (DEC-0148).
- وفاداری بصری بخش عمومی موضوع این مرحله نبود و UNVERIFIED است.

## ۸. پرامپت بعدی

PROMPT-002 — زیرساخت عمومی، SEO و پوسته فارسی.
