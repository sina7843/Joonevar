# Baseline فاز ۳

وضعیت واقعی مخزن پیش از شروع کار دامنه‌ای فاز ۳. هر عدد زیر از اجرای همان روز آمده است؛ هیچ عددی از گزارش فاز ۲.۵ کپی نشده، حتی جایی که اتفاقاً یکی درآمده.

- **SHA مبنا:** `32a55e92c811989ec6bf3ddfb7bad54f0ca94177` (شاخه `main`، `chore(progress): PHASE-2.5 PROMPT-016 complete`، ۲۰۲۶-۰۹-۲۴T۱۶:۰۵:۵۲+۰۳:۳۰)
- **تاریخ اجرا:** ۲۰۲۶-۰۹-۲۴
- **محیط:** Windows 11 Enterprise، Node `v24.13.1`، npm `11.8.0`، Postgres 16 در Docker (`hamzist-db`، پورت ۵۴۳۳، سالم)
- **وضعیت Git در شروع:** تمیز، به‌جز یک تغییر کاربر در `.gitignore` که بسته فاز ۳ را untracked می‌کند — همان ترتیبی که برای فاز ۲ و ۲.۵ هم در همان فایل هست.

## ۱. delta با بسته فاز ۳

`VERSION.txt` بسته می‌گوید روی HEAD `32a55e92` نوشته شده است. HEAD واقعی مخزن هم دقیقاً همان است. **delta صفر است**؛ هیچ commit خارج از بسته پس از تحویل فاز ۲.۵ نیامده و هیچ بازبینی تفاوتی لازم نشد.

## ۲. اجرای دروازه‌ها روی SHA مبنا

| بررسی | فرمان | مدت | نتیجه |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | — | exit 0 |
| دامنه + پیکربندی + UI | `node --test --test-concurrency=4 "tests/domain/*.test.ts" "tests/config/*.test.ts" "tests/ui/*.test.ts"` | ۲٫۱ ثانیه | **۲۸۲ تست: ۲۸۲ موفق، ۰ ناموفق، ۰ SKIP** |
| پایگاه‌داده، نیمه اول (۲۹ سوییت) | `node --test --test-concurrency=2 <۲۹ سوییت اول>` | ۲۹۱ ثانیه | **۲۳۶ تست: ۲۳۶ موفق، ۰ ناموفق، ۰ SKIP** |
| پایگاه‌داده، نیمه دوم (۲۹ سوییت) — اجرای اول | `node --test --test-concurrency=2 <۲۹ سوییت دوم>` | ۲۳۳ ثانیه | ۱ ناموفق: `tests/db/vet-trusted.test.ts` (بخش ۳) |
| پایگاه‌داده، نیمه دوم — پس از رفع | همان فرمان | ۲۳۰ ثانیه | **۲۰۸ تست: ۲۰۸ موفق، ۰ ناموفق، ۰ SKIP** |
| ساخت production (افزایشی روی `.next` موجود) | `npm run build` | — | exit 0 — ولی artifact معیوب بود (بخش ۳) |
| ساخت production (پس از `rm -rf .next`) | `npm run build` | — | exit 0 — Shared First Load JS ۱۰۳ kB |
| مرورگر (کامل) — روی ساخت افزایشی | `node tools/browser-tests.mjs` | — | ۲ ناموفق، هر دو از یک ریشه (بخش ۳) |
| مرورگر (کامل) — روی ساخت تمیز | `node tools/browser-tests.mjs` | ۴۶۰ ثانیه | **۱۹۹ تست: ۱۹۹ موفق، ۰ ناموفق، ۰ SKIP** |
| Runner بسته | `node --test tools/tests/runner.test.mjs` | ۱۱٫۳ ثانیه | **۱۹/۱۹** (پس از افزودن تست فاز ۳) |
| اعتبارسنجی بسته | `node tools/validate-core.mjs` | — | exit 0 — ۲۰ prompt، ۲۹ بخش، ۱۹ تصمیم، ۳۳ ردیف پذیرش، هش منابع سالم |

**جمع مجموعه محصول روی یک HEAD: ۹۲۵ تست — ۲۸۲ دامنه/پیکربندی/UI، ۴۴۴ پایگاه‌داده (۲۳۶ + ۲۰۸)، ۱۹۹ مرورگر. ۰ ناموفق، ۰ SKIP.**

مجموعه پایگاه‌داده به دو نیمه تقسیم شد، به همان دلیل فاز ۲.۵: این ماشین ۵۸ سوییت را با هم نمی‌کشد.

## ۳. سه اشکالی که این اجرا پیدا کرد و رفع شد

### ۳.۱ یک تست ناپایدار واقعی — `tests/db/vet-trusted.test.ts`

تست «اصلاح با نسخه تازه پاسخ داده می‌شود و انجمن با دلیل تصمیم می‌گیرد» همه رویدادهای audit را بدون `ORDER BY` می‌خواند و بعد با `at(-1)` انتظار داشت آخرین رویداد «تأیید» باشد. Postgres بدون `ORDER BY` هیچ ترتیبی تضمین نمی‌کند؛ زیر بار `--test-concurrency=2` ترتیب برگشت و `at(-1)` رویداد «درخواست اصلاح» را خواند:

```
actual:   'SYNTHETIC توضیح تجهیزات را کامل کنید'
expected: 'SYNTHETIC شرایط کامل است'
```

سوییت به‌تنهایی سبز بود، که خودش نشانه ناپایداری است نه سلامت. **نقص محصول نیست؛ نقص تست است.** رفع: `orderBy(auditEvents.occurredAt)` — همان ترتیبی که `auditTrail` در `src/audit/service.ts` استفاده می‌کند. بقیه تست‌هایی که audit را می‌خوانند پیش از خواندن، تعداد را ۱ تأیید می‌کنند و به ترتیب وابسته نیستند؛ بررسی شد و فقط همین یک مورد بود.

### ۳.۲ ساخت افزایشی معیوب — منشأ هر دو شکست مرورگر

دو شکست مرورگر (`tests/browser/operations.test.ts` و `tests/browser/suggestions.test.ts`) هر دو به مراکز مربوط بودند و هر دو یک ریشه داشتند. خطای سرور:

```
Error: Could not find the module "src\centres\forms.tsx#CentreCreateForm"
in the React Client Manifest.
```

`src/centres/forms.tsx` `'use client'` دارد و درست است؛ `.next` بود که خراب بود. یک `npm run build` افزایشی روی `.next` باقی‌مانده از نشست قبلی کاربر، client manifest را ناقص ساخت و `/admin/centres` با ۵۰۰ پاسخ داد. **هیچ چیز در مخزن خراب نبود.** پس از `rm -rf .next && npm run build` هر دو سوییت سبز شدند و سپس کل مجموعه ۱۹۹/۱۹۹.

این دقیقاً همان چیزی است که دروازه `baseline-truthfulness` برای آن وجود دارد: یک artifact کهنه که خودش را به‌شکل نقص محصول نشان می‌دهد. برای اینکه دوباره هشت دقیقه هزینه ندهد، `tools/browser-tests.mjs` حالا پیش از شروع بررسی می‌کند که `.next/BUILD_ID` از تازه‌ترین فایل `src/` و `app/` جدیدتر باشد و در غیر این صورت با پیام صریح متوقف می‌شود.

### ۳.۳ نبود ورودی فاز ۳ در Runner

`tools/runner.mjs` فقط فازهای ۱، ۲ و ۲.۵ را می‌شناخت و `tools/tests/runner.test.mjs` صریحاً ادعا می‌کرد «فاز ۳ ناشناخته است». ورودی `'3'` با همان ترتیب فاز ۲.۵ اضافه شد (بسته untracked سر جایش، وضعیت در `PROJECT_STATUS-PHASE-3.md`، state در `.runner/phase-3/`، گزارش با پیشوند `PHASE-3-`)، آن ادعا به فاز ۴ منتقل شد، و یک تست تازه مسیر کامل `prepare → complete` فاز ۳ را می‌سنجد. جزئیات در DEC-0203.

## ۴. قول‌های فاز ۲.۵ که فاز ۳ روی آن‌ها بنا می‌شود — تأییدشده روی کد

| قول | جای واقعی‌اش در کد | وضعیت |
|---|---|---|
| KYC | `src/identity/kyc.ts` — `findCase`، `submitKyc`، `reviewKyc`، `canRegisterAnimal`، شش وضعیت | تأیید شد |
| پرسش عضویت معتبر انجمن | `src/billing/membership.ts` — `hasValidMembership`، `isMembershipActive`، `membershipStanding` (عضویت مادام‌العمر و دوره‌دار هر دو) | تأیید شد |
| حیوان ثبت‌شده، مالکیت و میکروچیپ | `src/animals/service.ts` — `requireOwnedAnimal`، `findAnimal`؛ جدول `microchip` با دو unique index و بدون مسیر update | تأیید شد — با یک هشدار: «تاریخچه مالکیت» هنوز جدولی ندارد (بخش ۵) |
| چرخه حیات کنل | `src/kennels/service.ts` — `kennelOfOwner`، `requireOwnKennel`، `submitKennel`، `reviewKennel`، `KENNEL_STATUS_FA` | تأیید شد |
| رسانه خصوصی | `src/files/storage.ts` + `signature.ts` (`PURPOSE_RULES`، `assertAcceptable`، تشخیص mime از بایت) + `app/api/files/[id]/route.ts` + `src/authz/policy.ts` (`FILE_REVIEWERS`) | تأیید شد |
| تأیید پرداخت و idempotency | `src/billing/payments.ts` — `verifyAttempt` مبلغ را با مبلغ ذخیره‌شده می‌سنجد، `payment_callbacks` با unique روی (provider، externalRef)، تلاش تسویه‌شده بدون اثر دوباره گزارش می‌شود (`performed: false`)، اثرها داخل همان تراکنش | تأیید شد |
| تنظیمات مدیریت‌شده و نسخه‌دار | `src/settings/service.ts` — `readMoney`/`readInt`/`readText`، `snapshotSetting`، `updateSetting`، `unconfiguredKeys`؛ `setting_source` با چهار منبع از جمله `OPERATIONAL_DATA` | تأیید شد |
| outbox اعلان | `src/notifications/outbox.ts` — صف در تراکنش دامنه، `deliveryKey` یکتا، backoff، `SUPPRESSED`، `requeueDelivery`، `outboxStanding`؛ `templates.ts` با `TEMPLATE_VERSION` | تأیید شد — با محدودیت شناخته‌شده: هیچ زمان‌بندی worker را صدا نمی‌زند |
| نقش‌های محدودشده و audit | `src/authz/actor.ts` (۹ context، ۸ نقش)، `routes.ts` (جدول مسیر، طولانی‌ترین prefix)، `policy.ts` (گروه تنظیمات و فایل)، `src/audit/service.ts` (`recordAudit` با `redact`) | تأیید شد |
| CI | `.github/workflows/ci.yml` — چهار job، بدون secret، `APP_ENV=development` و `INTEGRATION_MODE=local` | فایل تأیید شد؛ **هرگز اجرا نشده** چون مخزن remote ندارد |

## ۵. چیزهایی که فاز ۳ نباید موجود فرض کند

۱. **تاریخچه مالکیت حیوان وجود ندارد.** فقط ستون `animals.owner_account_id` هست. قول «تاریخچه مالک قبلی حذف نمی‌شود» یعنی PROMPT-007 باید جدول دوره مالکیت را بسازد.
۲. **«میکروچیپ ثبت‌شده» یعنی سطر جدول `microchip`،** نه `animals.declared_microchip_number` که در schema صریحاً خوداظهاری و بدون اثر اتصالی توصیف شده است.
۳. **هیچ زمان‌بندی در مخزن نیست.** هر مهلتی که فاز ۳ تعریف می‌کند (مهلت پرداخت بیعانه، مهلت پذیرش زیرسفارش، مهلت اعتراض) به اجرای worker نیاز دارد و با «کسی صفحه را باز کند» درست کار نمی‌کند.
۴. **هیچ یکپارچه‌سازی بیرونی پیکربندی نشده است** — درگاه پرداخت، پیامک، ذخیره‌سازی ابری و نقشه همه `NOT_CONFIGURED`اند و آداپتور PROVIDER عمداً خطا می‌دهد.
۵. **۴۱ migration موجود است** (`0000` تا `0040`)؛ فاز ۳ از `0041` ادامه می‌دهد و هیچ‌کدام `down` ندارند.

## ۶. وضعیت آمادگی در این نقطه

| بُعد | وضعیت |
|---|---|
| کد فازهای ۱، ۲ و ۲.۵ | DELIVERED_INTERNALLY — ۹۲۵ تست سبز روی همین HEAD |
| کد فاز ۳ | NOT_STARTED — این Prompt فقط baseline و معماری است، هیچ رفتار محصولی نساخت |
| یکپارچه‌سازی‌ها | NOT_CONFIGURED |
| Production | NOT_READY |
