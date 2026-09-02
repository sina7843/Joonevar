# برنامه پیاده‌سازی همزیست — Phase 1

سند فنی زنده. با پیشرفت کار به‌روزرسانی می‌شود. تصمیم‌های محصول D01–D19 اینجا بازنویسی نمی‌شوند؛ فقط اجرا می‌شوند.

## ۱. وضعیت مبدأ

مخزن در شروع PROMPT-001 **خالی از کد محصول** بود: هیچ commit، هیچ `package.json`، هیچ migration، هیچ تست محصول. `git status` فقط فایل‌های همین بسته اجرایی را untracked نشان داد. بنابراین کد قابل حفظی وجود ندارد و انتخاب Stack از صفر انجام می‌شود. Stack نمونه ساختاری (NestJS/MongoDB/AntD) الزام همزیست نیست و پذیرفته نشد.

## ۲. Stack انتخاب‌شده

| لایه | انتخاب | چرا کمترین راه سازگار است |
|---|---|---|
| Runtime | Node.js 24 (`engines.node >= 22`) | همان چیزی که در محیط واقعی نصب است (v24.13.1) |
| Package manager | npm 11 + `package-lock.json` | بدون ابزار اضافه؛ pnpm هست ولی چیزی اضافه نمی‌کند |
| زبان | TypeScript، `strict: true` | قرارداد داده و نسخه‌بندی باید در Type دیده شود |
| فریم‌ورک | Next.js 15 (App Router) | یک اپلیکیشن قابل استقرار با UI و API در یک جا. Server Components/Route Handlers اجازه می‌دهند **مجوز روی سرور** پیش‌فرض باشد نه استثنا (§۲۳.۴). RTL و i18n بومی. |
| دیتابیس | PostgreSQL 16 (docker compose برای local) | تراکنش واقعی، UNIQUE/partial index، `SELECT … FOR UPDATE`، constraint سطح داده برای یکتایی مادام‌العمر میکروچیپ. Mongo این تضمین‌ها را ارزان نمی‌دهد. |
| دسترسی داده | Drizzle ORM + drizzle-kit | migration خروجیِ **SQL خام و قابل بازبینی** می‌دهد؛ نه یک لایه جادویی. تراکنش و قفل ردیفی مستقیم در دسترس است. |
| تست | `node:test` داخلی + Testcontainers-free: همان Postgres محلی docker | صفر وابستگی تست. `Bash(node --test *)` از قبل مجاز است. |
| تست مرورگر (RTL) | Playwright — از PROMPT-003 نصب می‌شود | Gate `rtl-browser-review` در manifest واقعی است و mock نمی‌پذیرد |
| UI/توکن | Tailwind CSS v4 + توکن‌های CSS variable مشتق از برند | DS منتشرشده فقط برند دارد (بخش ۳ `reference-access.md`)؛ کتابخانه کامپوننت آماده با DS فارسی می‌جنگد |
| a11y primitives | فقط در صورت نیاز واقعی (Modal/Combobox) | افزودن پیش‌دستانه ممنوع |
| احراز هویت | Session token در دیتابیس + کوکی `httpOnly`/`SameSite=Lax`/`Secure` | جریان OTP اختصاصی است؛ NextAuth چیزی حل نمی‌کند و یک لایه پیکربندی اضافه می‌کند |
| تاریخ | ذخیره Gregorian (`date` / `timestamptz`)، نمایش با `Intl.DateTimeFormat('fa-IR-u-ca-persian')` | بدون وابستگی تقویم؛ در Node 24 موجود است |
| پول | عدد صحیح **تومان** (`bigint`) | هیچ float در مسیر پول |

### تصمیم‌های فنی که به‌عنوان DEC ثبت شده‌اند
`DEC-0001` تا `DEC-0009` در `DECISIONS.md`.

## ۳. ساختار پوشه هدف

```
/                     ← ریشه مخزن؛ فایل‌های بسته اجرایی همین‌جا می‌مانند
  app/                ← Next.js App Router (مسیرها؛ فهرست کامل در route-coverage.md)
  src/
    domain/           ← قواعد محصول خالص و قابل تست بدون DB
      eligibility/    ← جدول §۵ + «دلیل + پیش‌نیاز بعدی + CTA»
      lifecycle/      ← گذارهای Request/Document/Allocation/Declaration
      calendar/       ← شش‌ماه تقویمی، ۱۴ روز، مهلت مراجعه
    db/
      schema/         ← تعریف جدول‌های Drizzle
      migrations/     ← SQL تولیدشده و commit‌شده
      seed/           ← داده مرجع و تنظیمات؛ فقط مقادیر واقعیِ مستند
    auth/             ← session، OTP، rate limit
    authz/            ← policy مرکزی؛ تنها مرجع تصمیم دسترسی
    services/         ← use-caseها؛ صاحب تراکنش
    adapters/         ← sms, payment, storage, map, reader, document
    settings/         ← خواندن مقدار فعال Product Settings با نسخه
    audit/            ← نوشتن رویداد؛ اجباری در همان تراکنش
    notifications/    ← ساخت اعلان با Entity + Resume Context
    ui/               ← توکن، primitiveها و الگوهای DS در کد
  tests/
    domain/  services/  db/  e2e/
    fixtures/          ← فقط synthetic و برچسب‌خورده
  docs/
    architecture/  discovery/  reports/
  docker-compose.yml   ← فقط Postgres محلی
```

`tools/`، `prompts/`، `reference-inputs/`، `Requirements.md` و فایل‌های وضعیت بسته دست‌نخورده می‌مانند.

## ۴. قواعد عرضی که در هر Slice رعایت می‌شوند

1. **مجوز سمت سرور برای هر اقدام رکورد‌محور.** هیچ route handler یا server action بدون فراخوانی `authz` اجرا نمی‌شود. قفل UI هرگز تنها کنترل نیست.
2. **دانلود فایل خصوصی فقط از مسیر سرور** با بررسی مالکیت/نقش همان رکورد.
3. **تراکنش برای هر اثر چندجدولی**، شامل نوشتن Audit. Audit خارج از تراکنش نوشته نمی‌شود.
4. **Idempotency** برای Callback درگاه و صدور سند: کلید یکتا روی `(provider, external_ref)` و بررسی وضعیت پیش از اثر.
5. **کنترل نسخه خوش‌بینانه** برای تاریخ جفت‌گیری، Allocation، اعلام‌های قابل اصلاح و تعداد توله: `UPDATE … WHERE version = $expected`؛ صفر ردیف = خطای نسخه، نه بازنویسی.
6. **Snapshot مالی و مهلت** در لحظه ایجاد: مبلغ و مهلت داخل رکورد ذخیره می‌شود؛ ویرایش بعدی تعرفه، سابقه را تغییر نمی‌دهد.
7. **Resume Context** روی هر Request/Draft: `originRoute`, `entityRef`, `step`. اعلان همان پرونده و همان مرحله را باز می‌کند، نه فهرست عمومی.
8. **هیچ عدد محصولی هاردکد نمی‌شود** — مهلت، تعرفه، پارامترهای OTP از Product Settings.
9. **fixtureهای synthetic** فقط در `tests/fixtures` و `seed/dev`، با پیشوند صریح و بدون شماره/نشانی/موبایل واقعی.

## ۵. توالی Slice ها (نگاشت به ۲۰ PROMPT)

| PROMPT | Slice عمودی | خروجی قابل اجرا |
|---|---|---|
| 001 | همین Discovery و برنامه | اسناد + baseline گیت |
| 002 | زیرساخت: Next+TS+DB، migration اول، Product Settings نسخه‌دار، Audit، Notification، آداپتور تهی با وضعیت | اپ بالا می‌آید، تنظیمات از DB خوانده می‌شود |
| 003 | توکن DS در کد، Shellهای شش‌گانه، Role Switcher پویا، RTL و متن بلند فارسی | پوسته‌ها با مجوز سرور |
| 004 | حساب، OTP با rate limit، KYC، ویرایش پروفایل + Audit | ورود واقعی و پرونده حساب |
| 005 | پرداخت (verify سمت سرور)، عضویت مادام‌العمر F14، Eligibility و قفل سه‌جزئی | خدمات قفل/باز با دلیل |
| 006 | ثبت حیوان G0/G1+، Resolve والدین، محاسبه نسل، Export Pedigree و صف انجمن | پرونده حیوان و نسب |
| 007 | Finder سه‌Context، Vet Visit Request مستقل، Referral با مهلت DB، Check-in، تغییر خدمت/SUPERSEDED | کد مراجعه واقعی |
| 008 | میکروچیپ با یکتایی مادام‌العمر، Conflict، نمونه‌گیری اجباری، Custody، Resampling | زنجیره نمونه |
| 009 | برگه ثبتی: Batch با اقلام مستقل، پرداخت گروهی، صدور مستقل هر حیوان | سند صادرشده |
| 010 | فیش مرکز ژنتیک، دستور ارسال به همان Custodian، Shipment، Parentage Result | نتیجه ژنتیک |
| 011 | صدور شجره‌نامه با Join Gate، اعتراض D19، درخواست ارسال پستی D17 | شجره‌نامه و اعتراض |
| 012 | فعال‌سازی پرورش‌دهنده، ثبت و مدیریت کنل | کنل |
| 013 | مجوز رسمی جفت‌گیری، Allocation Rule، تأیید طرفین، بررسی انجمن | مجوز |
| 014 | تاریخ‌های دوطرفه نسخه‌دار، DATE_CONFLICT، Cooldown هشدارمحور | تاریخ‌ها |
| 015 | بارداری/زایمان، تأیید اختیاری دامپزشک، دو رکورد مستقل، مغایرت، اصلاح تعداد D18 | Litter |
| 016 | Allocation دوطرفه FINAL، Puppy Card Batch | کارت توله |
| 017 | Declaration شخصی جدا از مسیر رسمی | اعلام شخصی |
| 018 | تکمیل پنل‌های عملیاتی و تنظیمات مدیریتی | پنل‌ها |
| 019 | بررسی یکپارچه فلو، امنیت، کیفیت بصری | شواهد پذیرش |
| 020 | اجرای نهایی، مستندات، آمادگی تحویل | تحویل |

## ۶. آنچه ساخته نمی‌شود (مرز فاز یک)

Onboarding عمومی دامپزشک (D01) · Scheduler/تقویم ظرفیت/Time Slot (D03) · انتخاب میان چند مرکز ژنتیک (D07) · تقسیم خدمت میان Location ناقص (D02) · جفت‌یابی عمومی/Feed · قرارداد رسمی همزیست و ذخیره متن قرارداد شخصی (§۲۰) · امضای دیجیتال یا Gate امضا (D13) · انتقال/تعویض میکروچیپ (§۱۲.۳) · اتصال شرکت پستی و رهگیری (D17) · تمدید یا انقضای عضویت (D04) · پرداخت مستقل «فعال‌سازی نقش» (§۱۵.۱).

## ۷. ریسک‌های فنی شناسایی‌شده و پاسخ

| ریسک | پاسخ در طراحی |
|---|---|
| مصرف دوباره یک Referral Code توسط دو درخواست هم‌زمان | `UPDATE referral SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL` و بررسی تعداد ردیف؛ در همان تراکنش Check-in |
| اتصال یک شماره چیپ به دو حیوان | UNIQUE سراسری روی `microchip.number` + UNIQUE روی `animal_id` در همان جدول (یک چیپ برای هر حیوان در طول عمر)، شامل رکوردهای آرشیو |
| Callback تکراری درگاه | جدول `payment_callback` با UNIQUE `(provider, external_ref)`؛ اثر فقط در اولین درج |
| تأیید نسخه قدیمی Allocation/تاریخ | تأیید همیشه شماره نسخه را حمل می‌کند؛ عدم تطابق = `VERSION_STALE` |
| صدور دوباره سند برای یک قلم Batch | UNIQUE روی `(document_type, animal_id)` برای اسناد یکتا + وضعیت قلم مستقل |
| شش ماه Cooldown | جمع تقویمی ۶ ماه با clamp به آخرین روز ماه مقصد؛ آزمون مرزی پایان ماه و کبیسه در PROMPT-014. ۱۸۰ روز جایگزین نمی‌شود. |
| مغایرت زمان سرور/کلاینت در مهلت | همیشه ارزیابی سمت سرور با `now()` دیتابیس |
