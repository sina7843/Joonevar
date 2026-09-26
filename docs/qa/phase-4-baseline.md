# Baseline فاز ۴

وضعیت واقعی مخزن پیش از شروع کار دامنه‌ای فاز ۴ (جفت‌یابی). هر عدد زیر از اجرای همان روز روی همین HEAD آمده است؛ هیچ عددی از گزارش PHASE-3 PROMPT-014 کپی نشده. جایی که عدد با آن گزارش یکی است، به این دلیل است که مجموعه واقعاً همان را دوباره تولید کرد.

- **SHA مبنا:** `13fd64f95c84e6321b4ba41d93a4c5117cadd608` (شاخه `main`، `chore(progress): PHASE-3 PROMPT-014 complete`، ۲۰۲۶-۰۹-۲۶T۰۶:۱۷:۳۳+۰۳:۳۰)
- **تاریخ اجرا:** ۲۰۲۶-۰۹-۲۶
- **محیط:** Windows 11 Enterprise، Node `v24.13.1`، npm `11.8.0`، Postgres 16 در Docker (`hamzist-db`، پورت ۵۴۳۳، سالم)
- **وضعیت Git در شروع:** تمیز، به‌جز یک تغییر کاربر در `.gitignore` که بسته فاز ۴ را untracked می‌کند — همان ترتیبی که فاز ۲، ۲.۵ و ۳ در همان فایل دارند. index خالی بود.

## ۱. delta با بسته فاز ۴

`VERSION.txt` و `prompt-manifest.json` بسته می‌گویند روی HEAD `13fd64f9` نوشته شده است. HEAD واقعی مخزن هم دقیقاً همان است. **delta صفر است.** اعتبارسنج خود بسته (`node tools/validate-package.mjs` داخل پوشه بسته) خروجی `VALID: 8 prompts; files, order and dependencies aligned` داد.

## ۲. اجرای دروازه‌ها روی SHA مبنا

همه به‌ترتیب و در یک اجرای پیوسته (اسکریپت با زمان‌سنجی هر گام؛ HEAD در شروع هر گام ثبت شد و در همه `13fd64f9` بود).

| بررسی | فرمان | مدت | نتیجه |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | ۲۵ ثانیه | exit 0 |
| مجموعه محصول (دامنه، پیکربندی، پایگاه‌داده، UI) | `node --test --test-concurrency=4 "tests/domain/*.test.ts" "tests/config/*.test.ts" "tests/db/*.test.ts" "tests/ui/*.test.ts"` | ۱۲۵۰ ثانیه | **۱۰۲۸ تست: ۱۰۲۸ موفق، ۰ ناموفق، ۰ SKIP، ۰ cancelled** |
| ابزار و Runner | `npm run test:tools` | ۱۳ ثانیه | **۲۰/۲۰** — شامل تست تازه فاز ۴ Runner (بخش ۳)؛ ۱۹ تست پیشین همه سبز |
| تمرین ارتقا | `npm run db:upgrade-check` | ۱۶ ثانیه | **۵۱/۵۱ بررسی** — زنجیره فاز ۲ ← ۲.۵ ← ۳ |
| ساخت production (تمیز) | `rm -rf .next && npm run build` | ۶۶ ثانیه | exit 0 — First Load JS shared ۱۰۲ kB |
| مرورگر (کامل) | `node tools/browser-tests.mjs` | ۶۴۰ ثانیه | **۲۶۵ تست: ۲۶۵ موفق، ۰ ناموفق، ۰ SKIP** |
| اعتبارسنجی بسته فاز ۱ | `node tools/validate-core.mjs` | — | exit 0 — ۲۰ prompt، ۲۹ بخش، ۱۹ تصمیم، ۳۳ ردیف پذیرش، هش منابع سالم |

**جمع مجموعه محصول روی یک HEAD: ۱۲۹۳ تست — ۱۰۲۸ دامنه/پیکربندی/پایگاه‌داده/UI و ۲۶۵ مرورگر؛ به‌علاوه ۵۱ بررسی ارتقا و ۲۰ تست ابزار. ۰ ناموفق، ۰ SKIP.**

اجرای مرورگر به‌عنوان اثر جانبی، عکس‌های commitشده زیر `docs/reports/screenshots/` را دوباره می‌نویسد؛ آن فایل‌ها تغییر این Prompt نیستند و به HEAD برگردانده شدند.

بر خلاف baseline فاز ۳، مجموعه پایگاه‌داده این بار **در یک اجرا** (۷۰ سوییت، `--test-concurrency=4`) کامل شد و به تقسیم دو نیمه نیاز نداشت.

شمارش‌ها با گزارش نهایی فاز ۳ (`docs/reports/PHASE-3-PROMPT-014.json`: ۱۰۲۸ محصول، ۲۶۵ مرورگر، ۵۱ ارتقا، ۱۹ ابزار) منطبق‌اند. تنها تفاوت، تست ابزار بیستم است که همین Prompt اضافه کرد. پس **drift گزارش پیدا نشد** و هیچ اصلاح baseline لازم نشد.

## ۳. تنها تغییر ابزار — ورودی فاز ۴ در Runner

`tools/runner.mjs` فقط فازهای ۱، ۲، ۲.۵ و ۳ را می‌شناخت و `tools/tests/runner.test.mjs` ادعا می‌کرد «فاز ۴ ناشناخته است». ورودی `'4'` با همان ترتیب فاز ۳ اضافه شد (بسته untracked سر جایش، وضعیت در `PROJECT_STATUS-PHASE-4.md`، state در `.runner/phase-4/`، گزارش با پیشوند `PHASE-4-`)، ادعای «ناشناخته» به فاز ۵ منتقل شد، و یک تست تازه مسیر کامل `prepare → complete` فاز ۴ را می‌سنجد. `setup` و `prepare` فاز ۴ روی مخزن واقعی اجرا شدند و `startHead` را `13fd64f9` ثبت کردند. نکته صادقانه: اجرای `test:tools` در جدول بالا روی درخت کاری همراه با همین تغییر بود، نه روی HEAD خالص؛ ۱۹ تست پیشین در همان اجرا سبز ماندند.

## ۴. قول‌های فازهای قبل که فاز ۴ روی آن‌ها بنا می‌شود

جدول کامل با محل دقیق کد، محل enforce مجوز، تست و هشدارها در [phase-4-mating-finder.md §۱](../architecture/phase-4-mating-finder.md). خلاصه:

- **تأیید:** KYC، میکروچیپ رسمی (سطر `microchip`)، کنل، تأیید پرداخت و idempotency، outbox با lease، audit، نقش‌ها و capability، مجوز رسمی، تاریخ append-only، cooldown هشداری، زنجیره آبستنی تا Puppy Card (فقط مسیر رسمی)، توافق شخصی legacy، rate limit و redaction.
- **با هشدار:** OTP (دو purpose، متن پیامک hard-code)، تنظیمات (فقط scope `GLOBAL`)، رسانه (بدون rendition)، PDF (رندر زنده، بدون snapshot)، طبقه‌بندی نژاد (ادغام resolve نمی‌شود)، lineage (فقط تشخیص حلقه)، انتقال مالکیت (بدون hook).
- **وجود ندارد:** وضعیت فوت/مفقودی حیوان، وضعیت باروری، محاسبه خویشاوندی، چت عمومی، block کاربر، تعلیق حساب، زمان‌بند، مکان روی حیوان.

## ۵. نقص‌های موجود که در این Prompt رفع نشدند

drift گزارش نیستند؛ رفتار محصول‌اند و هرکدام به Promptی سپرده شد که از آن عبور می‌کند — جدول [phase-4-mating-finder.md §۱۲](../architecture/phase-4-mating-finder.md): permit جفت بدون unique index، تلاش دوم پرداخت برای batch در انتظار، ظرفیت plan فروشنده پس از انقضا، race در `respondToAllocation`، خطای خام در race نسخه تاریخ، متن OTP، و نبود ابطال KYC.

## ۶. وضعیت آمادگی در این نقطه

| بُعد | وضعیت |
|---|---|
| کد فازهای ۱ تا ۳ | DELIVERED_INTERNALLY — ۱۲۹۳ تست سبز روی همین HEAD |
| کد فاز ۴ | NOT_STARTED — این Prompt فقط baseline و معماری است و هیچ رفتار محصولی نساخت |
| CI | فایل `.github/workflows/ci.yml` موجود؛ مخزن حالا remote `origin` دارد، ولی این نشست push نمی‌کند و هیچ شاهدی از اجرای CI روی remote در دست ندارد — پس نتیجه CI «تأییدنشده» است، نه «سبز» |
| یکپارچه‌سازی‌ها | NOT_CONFIGURED |
| Production | NOT_READY |
