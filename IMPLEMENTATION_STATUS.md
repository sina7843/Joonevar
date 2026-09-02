# وضعیت واقعی پیاده‌سازی

Status: FOUNDATION_READY — زیرساخت اجرا می‌شود؛ هیچ فلوی محصولی هنوز ساخته نشده است.

وضعیت‌ها جدا نگه داشته می‌شوند و به یک checkbox تقلیل پیدا نمی‌کنند:

| بُعد | وضعیت | توضیح |
|---|---|---|
| code implementation | FOUNDATION_ONLY | اپ بالا می‌آید، migration اعمال می‌شود، تنظیمات از DB خوانده می‌شود. صفحات محصول از PROMPT-003 به بعد |
| automated checks | PASS | ۶۲ تست محصول + ۲۳ تست بسته، همگی روی Postgres واقعی |
| visual fidelity | UNVERIFIED | فقط پوسته RTL حداقلی؛ هیچ صفحه‌ای با پروتوتایپ تطبیق داده نشده |
| integration readiness | NOT_CONFIGURED | SMS، درگاه، نقشه و رندر سند هیچ‌کدام پیکربندی نشده‌اند |
| production readiness | NOT_READY | ۱۱ کلید تنظیمات هنوز داده واقعی ندارند؛ آداپتور واقعی وجود ندارد |

## PROMPT-001 — بررسی کد و رفرنس‌ها و انتخاب معماری

**وضعیت:** COMPLETE · work commit `f15cf47`.

بازرسی مخزن و محیط، خواندن واقعی Flow Map/پروتوتایپ/DS با ثبت node-id، تأیید هش منبع، انتخاب Stack و ثبت DEC-0001…DEC-0009، و نوشتن مدل دامنه، ماتریس مجوز، جدول Eligibility و چک‌لیست مسیر برای ۲۹ بخش، ۱۹ تصمیم و ۳۳ ردیف پذیرش.

## PROMPT-002 — زیرساخت، داده، تنظیمات و تاریخچه

**مرحله جاری:** تکمیل‌شده.

**رفتار تکمیل‌شده:**

- اپلیکیشن Next.js 15 + TypeScript strict با پوسته RTL فارسی، build موفق و صفحه ورودی که **وضعیت واقعی زیرساخت** را نشان می‌دهد (نه صفحه موفقیت ساختگی).
- `docker-compose.yml` با PostgreSQL 16؛ migration `0000_foundation` با ۹ جدول و constraintهای یکتایی لازم.
- قراردادهای Typed: شناسه‌های Branded (§۲۳.۲)، خطا با قفل سه‌جزئی و `VERSION_STALE`، صفحه‌بندی، تقویم، پول و Resume Context.
- تنظیمات نسخه‌دار در دیتابیس با ۲۲ کلید، مجوز به تفکیک هفت گروه، Audit با before/after در همان تراکنش و snapshot نسخه.
- اعلان با Entity/Step/Route و تحویل idempotent؛ فایل خصوصی با کنترل امضای بایت، سقف حجم، امنیت مسیر و دانلود مجوزدار.
- آداپتورهای بیرونی با وضعیت صادقانه چهارگانه و امتناع صریح از اجرا در production.

**فایل‌ها:** `package.json`، `tsconfig.json`، `next.config.ts`، `postcss.config.mjs`، `drizzle.config.ts`، `docker-compose.yml`، `.env.example`، `app/**` (۴ فایل)، `src/**` (۲۰ فایل)، `tests/**` (۸ فایل).

**migration:** `src/db/migrations/0000_foundation.sql` — جدول‌های `account`، `account_role`، `product_setting`، `audit_event`، `notification`، `notification_delivery`، `stored_file`، `reference_breed`، `pedigree_issuer`.

**بررسی‌های واقعاً اجراشده:**

| بررسی | دستور | نتیجه |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | PASS (exit 0) |
| تست محصول | `node --test "tests/**/*.test.ts"` | PASS — ۶۲/۶۲ |
| تست بسته | `node --test tools/tests/runner.test.mjs .claude/tests/guardrails.test.mjs` | PASS — ۲۳/۲۳ |
| Build | `npm run build` | PASS — ۴ مسیر |
| migration و seed واقعی | `node src/db/migrate.ts` + `node src/db/seed/run.ts` (هر کدام دو بار) | PASS — بار دوم: ۰ درج، ۲۲ حفظ |
| اجرا و health | `next start -p 3111` + `curl /api/health` | PASS — HTTP 200، `status: degraded` |
| دسترسی فایل خصوصی | `curl /api/files/<uuid>` بدون Session | PASS — HTTP 401 `UNAUTHENTICATED` |

**تصمیم‌های جدید:** DEC-0010 تا DEC-0018.

**وابستگی بیرونی:** SMS/OTP، درگاه پرداخت، نقشه و رندر سند — همگی `NOT_CONFIGURED`.

**مانع واقعی:** هیچ مانعی مرحله را مسدود نکرد. اجرای تست‌های دیتابیس به بالا بودن سرویس docker وابسته است (DEC-0017).

**دستور ادامه:** `node tools/runner.mjs prepare` سپس اجرای PROMPT-003.

## داده واقعی که هنوز وارد نشده است

۱۱ کلید تنظیمات با مقدار `NOT_CONFIGURED` و بدون هیچ مقدار نمونه: تعرفه برگه ثبتی، شجره‌نامه، مجوز جفت‌گیری، ثبت کنل و Puppy Card؛ نام، تماس، نشانی، شماره حساب، شماره کارت و هزینه آزمایش مرکز ژنتیک. فهرست صادرکنندگان موردتأیید انجمن نیز عمداً خالی است. این‌ها با `/api/health` قابل پیگیری‌اند.
