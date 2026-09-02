# وضعیت واقعی پیاده‌سازی

Status: IDENTITY_READY — ورود واقعی، حساب، KYC و بررسی انجمن کار می‌کنند؛ عضویت و فلوهای حیوان هنوز ساخته نشده‌اند.

وضعیت‌ها جدا نگه داشته می‌شوند و به یک checkbox تقلیل پیدا نمی‌کنند:

| بُعد | وضعیت | توضیح |
|---|---|---|
| code implementation | IDENTITY_READY | زیرساخت، پوسته‌ها، و مسیر کامل هویت/حساب/KYC. عضویت و پرداخت از PROMPT-005 |
| automated checks | PASS | ۱۰۵ تست واحد/سرویس + ۲۲ تست مرورگر واقعی + ۲۳ تست بسته |
| visual fidelity | UNVERIFIED | پوسته‌ها با توکن‌های واقعی رندر و در Chromium بازبینی شدند، اما هیچ تطبیق پیکسلی با پروتوتایپ ادعا نمی‌شود |
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

## PROMPT-003 — دیزاین سیستم، پوسته‌ها و تجربه فارسی

**مرحله جاری:** تکمیل‌شده.

**رفتار تکمیل‌شده:**

- توکن‌های واقعی محصول از فایل پروتوتایپ خوانده و در `app/globals.css` با همان نام‌ها تعریف شدند (DEC-0019؛ تصحیح بخشی از DEC-0008).
- لوگوی رسمی از فایل Design System صادر و بدون هیچ تغییری استفاده شد؛ هیچ برند تازه‌ای کشیده یا برش داده نشد.
- کامپوننت‌های مشترک: Button و ActionRow با ترتیب RTL مطابق ERRATA v2.0، Field/Text/Select/Location، StatusBadge، Alert، Timeline، کارت‌های حیوان/درخواست/سرویس، کارت سرویس قفل‌شده با سه جزء §۵، Modal/Drawer/BottomSheet با تله فوکوس، و حالت‌های Loading/Empty/NetworkError/NeedsCorrection/Waiting.
- پوسته عمومی RTL برای کاربر، پرورش‌دهنده و دامپزشک معتمد با تب‌بار موبایل و ریل دسکتاپ؛ سه محیط عملیاتی مستقل انجمن، مرکز ژنتیک و سوپرادمین.
- Role Switcher فقط از نقش‌های فعال ساخته می‌شود، با یک Context اصلاً رندر نمی‌شود، و تغییر آن روی سرور بررسی و Context عملیاتی رد می‌شود.
- مجوز مسیر در خود صفحه اجرا می‌شود و مسیر ثبت‌نشده پیش‌فرض بسته است (DEC-0023).
- نقاط ترکیب داشبورد و پرونده حیوان بدون هیچ رکورد نمونه‌ای؛ صفحه اعلان‌ها داده واقعی DB را می‌خواند.

**فایل‌ها:** ۱۶ فایل در `app/**`، ۱۱ کامپوننت در `src/ui/**`، ۵ فایل در `src/authz/**`، `src/domain/eligibility/locks.ts`، دو دارایی برند، سه فایل تست و `docs/architecture/design-mapping.md`.

**migration:** ندارد (این مرحله تغییر schema ندارد).

**بررسی‌های واقعاً اجراشده:**

| بررسی | دستور | نتیجه |
|---|---|---|
| Gate `shell-permissions` | `node --test "tests/ui/*.test.ts" "tests/db/dev-actor.test.ts"` + بخش مربوط در تست مرورگر | PASS |
| Gate `rtl-browser-review` | `npm run build` + `next start -p 3111` + `npm run test:browser` | PASS — ۱۱/۱۱، ۲۴ اسکرین‌شات |
| تست واحد/سرویس | `npm test` | PASS — ۷۹/۷۹ |
| Typecheck | `npx tsc --noEmit` | PASS |
| Build | `npm run build` | PASS — ۱۷ مسیر |
| تست بسته | `node --test tools/tests/...` | PASS — ۲۳/۲۳ |

**تصمیم‌های جدید:** DEC-0019 تا DEC-0024.

**مانع واقعی:** هیچ مانعی مرحله را مسدود نکرد. دو اشکال واقعی حین بررسی مرورگر پیدا و رفع شد: redirect تغییر نقش مبدأ را از 127.0.0.1 به localhost می‌برد و کوکی را می‌انداخت (DEC-0024)، و ادعای اندازه ذاتی لوگو با بهینه‌ساز تصویر ناسازگار بود که با بررسی نسبت ابعاد در دو مرحله جایگزین شد.

**دستور ادامه:** `node tools/runner.mjs prepare` سپس اجرای PROMPT-004.

## PROMPT-004 — ورود، OTP، احراز هویت و حساب

**مرحله جاری:** تکمیل‌شده.

**رفتار تکمیل‌شده:**

- ورود واقعی: نرمال‌سازی موبایل (ارقام فارسی/عربی، `+98`، `0098`، بدون صفر)، صدور کد، ارسال مجدد با شمارش معکوس، انقضا، سقف تلاش، قفل و سقف ارسال ساعتی — همه از تنظیمات دیتابیس.
- نشست سرور با توکن تصادفی که فقط hash آن ذخیره می‌شود؛ Context روی ردیف نشست است و تغییر نقش تصمیم سرور است.
- حساب تازه با `PROFILE_INCOMPLETE` و هدایت به تکمیل حساب؛ حساب بازگشتی به درخواست مبدأ (`next`) برمی‌گردد و در نبود مبدأ به داشبورد.
- اطلاعات هویتی با کد ملی ده‌رقمی یکتا و رقم کنترلی، تاریخ تولد، و نام نمایشی اختیاری با تنظیم نمایش؛ سکونت کاملاً اختیاری با اعتبارسنجی کدپستی واردشده.
- KYC: بارگذاری تصویر کارت ملی (JPG/PNG/PDF تا ۱۰ مگابایت، بررسی روی بایت واقعی)، ارسال، صف انجمن، تأیید/اصلاح/رد با دلیل، حفظ فایل و داده معتبر در اصلاح، و اعلان بازگشت به همان پرونده.
- پس از تأیید: نام، نام خانوادگی و تاریخ تولد مستقیم قابل ویرایش؛ کد ملی فقط‌خواندنی.
- تغییر موبایل با کد روی شماره جدید؛ تا تأیید موفق شماره فعلی معتبر می‌ماند و لغو یا خطا هیچ چیز را عوض نمی‌کند. پس از تغییر، نشست‌های دیگر بسته می‌شوند.
- Actor توسعه‌ای PROMPT-003 **حذف شد**؛ تنها راه Actor شدن، نشست واقعی است و هیچ کد دور زدن OTP در هیچ محیطی وجود ندارد.

**فایل‌ها:** `src/identity/*` (۴ سرویس)، `src/domain/identity.ts`، `src/db/schema/identity.ts`، ۱۰ صفحه و ۳ فایل action در `app/**`، و ۴ فایل تست.

**migration:** `src/db/migrations/0001_identity.sql` — جدول‌های `profile`، `residence`، `kyc_case`، `otp_challenge`، `session` و `dev_outbound_sms`.

**بررسی‌های واقعاً اجراشده:**

| بررسی | دستور | نتیجه |
|---|---|---|
| Gate `identity-integration` | `npm test` (بخش هویت) | PASS — ۲۲ تست دیتابیسی + ۹ دامنه |
| Gate `identity-browser` | `npm run build` + `next start` + `npm run test:browser` | PASS — ۲۲/۲۲، ۹ اسکرین‌شات |
| تست واحد/سرویس | `npm test` | PASS — ۱۰۵/۱۰۵ |
| Typecheck | `npx tsc --noEmit` | PASS |
| Build | `npm run build` | PASS |
| migration و seed (هر کدام دو بار) | `node src/db/migrate.ts` + `node src/db/seed/run.ts --dev` | PASS — بدون replay، تنظیمات قبلی حفظ شد |
| تست بسته | `node --test tools/tests/...` | PASS — ۲۳/۲۳ |

**تصمیم‌های جدید:** DEC-0025 تا DEC-0030.

**مانع واقعی:** هیچ مانعی مرحله را مسدود نکرد. یک نقص واقعی در جریان ورود حین بررسی مرورگر پیدا و رفع شد: پاسخ خطای کد نادرست شناسه Challenge را برنمی‌گرداند و فرم به مرحله شماره برمی‌گشت.

**دستور ادامه:** `node tools/runner.mjs prepare` سپس اجرای PROMPT-005.

