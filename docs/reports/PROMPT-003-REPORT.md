# گزارش PROMPT-003 فاز دو — گونه‌ها و بانک نژاد سگ

**وضعیت:** COMPLETE · **مبنا:** `93f2172` (پس از تکمیل PROMPT-002) · **شواهد ماشینی:** [phase-2/PROMPT-003.json](phase-2/PROMPT-003.json)

## ۱. وضعیت واقعی پیش از این مرحله

| مورد | مشاهده در کد |
|---|---|
| نژاد | `reference_breed` فقط `name_fa`، `name_en`، `is_active`، `sort_order`؛ ده نژاد Seed از پروتوتایپ F04؛ FK از `animal.breed_id` و `kennel_breed.breed_id` |
| گونه | `animal.species` متن آزاد با پیش‌فرض `DOG`؛ جدول گونه وجود نداشت |
| گروه نژاد | وجود نداشت |
| مدیریت | `/admin/breeds` در محیط SUPERADMIN: افزودن نژاد و کنارگذاشتن/فعال‌سازی با Audit؛ نامزد تکراری فقط با برابری دقیق نام |
| انتخاب در فرم | `breedOptions` (نژادهای `is_active`) و `BreedPicker` با جست‌وجوی نام فارسی/انگلیسی |
| سطح عمومی | `/breeds` در فضای رزروشده بسته بود (PROMPT-002) |

## ۲. آنچه ساخته شد

- **Schema و Migration `0017_species-breed-bank`** (DEC-0154، DEC-0155، DEC-0156):
  - `species` (کلید `code`) و FK از `animal.species`، `breed_group` با ده گروه FCI، هر دو Seed در همان Migration.
  - `reference_breed` همان ردیف فاز یک ماند و فیلدهای بانک نژاد به آن اضافه شدند: گونه، `slug` یکتا با CHECK الگو، نام‌های دیگر، گروه، کشور ISO با CHECK، اندازه/پوشش/پنج سطح Enum، تاریخچه، خلاصه و پیوند استاندارد، `profile_status`، `published_at`، `merged_into_breed_id` با CHECK عدم ادغام در خود، و `version`.
  - `breed_slug_redirect` (نشانی‌های قبلی) و `breed_medical_claim` (منبع و تاریخ بازبینی NOT NULL، بایگانی به‌جای حذف).
  - نژادهای موجود نشانی گرفتند (Backfill با پیشوند id برای برخورد) و همه DRAFT ماندند.
- **دامنه** (`src/breeds/model.ts`، خالص): برچسب‌های فارسی Enumها، ساخت و اعتبار نشانی، نرمال‌سازی جست‌وجو (ی/ك عربی، نیم‌فاصله، اعراب، رقم فارسی، نشانه‌گذاری)، نام فارسی کشور از `Intl`، اعتبار پیوند و تاریخ بازبینی، انتقال‌های وضعیت و شرط انتشار.
- **سرویس** (`src/breeds/service.ts`):
  - خواننده‌های عمومی بدون Actor: فهرست منتشرشده با جست‌وجو، فیلتر FCI و صفحه‌بندی، صفحه با نشانی (پیش‌نویس = null، نشانی قبلی = redirect، تکراری = رکورد اصلی) و بخش sitemap.
  - نویسنده‌های SUPERADMIN در تراکنش همراه Audit: ویرایش با نسخه و diff، تغییر وضعیت با دلیل، ثبت تکراری، افزودن و بایگانی ادعای سلامت.
  - `addBreedToRegistry` فاز یک حالا نشانی آزاد می‌سازد و نامزد تکراری را با نرمال‌سازی می‌بیند.
- **صفحات عمومی:**
  - `/breeds`: جست‌وجو و فیلتر گروه با GET، کارت‌ها، دو حالت خالی (بانک خالی / نتیجه خالی)، صفحه‌بندی.
  - `/breeds/[slug]`: Breadcrumb و BreadcrumbList، مشخصات فقط برای مقدارهای تعیین‌شده، تاریخچه، استاندارد، سلامت و ژنتیک با منبع و تاریخ بازبینی، اعلان بایگانی و تکراری، ۳۰۸ برای نشانی قبلی، ۴۰۴ برای پیش‌نویس.
  - Metadata با وضعیت `ARCHIVED` / `DUPLICATE` از `buildMetadata` PROMPT-002.
- **مدیریت:** `/admin/breeds/[id]`: فرم مشخصات و محتوا، وضعیت صفحه با دلیل، افزودن و برداشتن ادعای سلامت، ثبت تکراری. فهرست `/admin/breeds` پیوند ویرایش و نشان وضعیت صفحه و تکراری را نشان می‌دهد.
- **ناوبری و SEO:** «نژادهای سگ» در هدر، فوتر و منو live شد؛ مسیر `/breeds` `PUBLIC` است؛ بخش `breeds` در sitemap با `lastmod` واقعی اضافه شد.
- **کامپوننت:** `TextAreaField` در `src/ui/field.tsx`.

## ۳. فایل‌های تغییرکرده

| فایل | تغییر |
|---|---|
| `src/db/schema/enums.ts`، `src/db/schema/core.ts`، `src/db/schema/animals.ts` | Enumهای نژاد؛ `species`، `breed_group`، ستون‌های بانک نژاد روی `reference_breed`، `breed_slug_redirect`، `breed_medical_claim`؛ FK `animal.species` |
| `src/db/migrations/0017_species-breed-bank.sql`، `meta/0017_snapshot.json`، `meta/_journal.json` | Migration تولیدشده با drizzle-kit به‌علاوه Seed تاکسونومی و Backfill نشانی |
| `src/breeds/model.ts`، `src/breeds/service.ts` | قواعد خالص و سرویس عمومی/مدیریتی بانک نژاد |
| `src/operations/service.ts` | افزودن نژاد: نشانی آزاد و نامزد تکراری نرمال‌شده |
| `src/db/seed/index.ts` | نشانی برای نژادهای پایه |
| `app/(public)/breeds/(list)/page.tsx`، `app/(public)/breeds/(list)/loading.tsx`، `app/(public)/breeds/[slug]/page.tsx` | فهرست با مرز بارگذاری خودش و صفحه عمومی نژاد |
| `app/(public)/loading.tsx` | حذف: مرز بارگذاری سراسری PROMPT-002 که ۳۰۸/۴۰۴ را ۲۰۰ می‌کرد (DEC-0157) |
| `tools/browser-tests.mjs` | اجرای Suiteهای مشخص روی همان راه‌اندازی جدا |
| `app/admin/breeds/[id]/page.tsx`، `forms.tsx`، `actions.ts`؛ `app/admin/breeds/page.tsx` | ویرایشگر بانک نژاد؛ پیوند ویرایش و نشان‌های وضعیت در فهرست |
| `src/public/sections.ts`، `src/authz/routes.ts`، `src/seo/sitemap.ts` | `/breeds` live و `PUBLIC`؛ بخش `breeds` در sitemap |
| `src/ui/field.tsx` | `TextAreaField` |
| `tests/domain/breeds.test.ts` | ۷ تست قواعد خالص |
| `tests/db/breeds.test.ts` | ۸ تست Migration، دسترسی، نسخه، Audit، انتشار، ادعای سلامت، نشانی، تکراری و جست‌وجو |
| `tests/browser/breeds.test.ts` | ۳ تست مرورگر ساخت صفحه، حالت‌ها و دسترسی ویرایشگر |
| `tests/db/migrations.test.ts`، `tests/ui/routes.test.ts`، `tests/ui/seo.test.ts`، `tests/browser/public-shell.test.ts`، `tests/browser/visual.test.ts` | نشانی در درج خام، `/breeds` عمومی، بخش live تازه، `/breeds` در بازبینی بصری |
| `DECISIONS.md`، `REQUIREMENTS_TRACEABILITY.md`، `docs/architecture/phase-2-boundary.md` | DEC-0154…DEC-0157، ردیف P2-R03، ردیف‌های گونه و بانک نژاد |

## ۴. Migrationها

| Migration | محتوا | بررسی |
|---|---|---|
| `src/db/migrations/0017_species-breed-bank.sql` (+ `meta/0017_snapshot.json`، `_journal.json`) | ۵ Enum، ۴ جدول (`species`، `breed_group`، `breed_slug_redirect`، `breed_medical_claim`)، ۱۹ ستون روی `reference_breed`، FK `animal.species → species.code`، Seed گونه DOG و ده گروه FCI، Backfill `slug` | روی دیتابیس خالی در هر Suite تست؛ و روی **کپی یک‌بارمصرف دیتابیس توسعه** (dump → دیتابیس موقت → `migrateTo` → بررسی → حذف): پیش و پس ۴۵ نژاد، ۲۳۷۴ حیوان و ۱۱۲ ردیف `kennel_breed`؛ هر ۴۵ نشانی معتبر و یکتا؛ گونه همه حیوان‌ها `DOG`؛ همه نژادها DRAFT و نسخه ۱. دیتابیس توسعه دست نخورد |

Migration افزایشی است و هیچ ستون یا ردیف فاز یکی حذف یا جابه‌جا نمی‌کند.

## ۵. بررسی‌های واقعاً اجراشده

همه روی درخت نهایی که Commit شد، پشت سر هم و بدون اجرای هم‌زمان.

| بررسی | فرمان | نتیجه |
|---|---|---|
| build | `npm run build` | PASS — Compiled successfully و exit 0، پس از آخرین تغییر `app/`؛ مسیرهای `/breeds`، `/breeds/[slug]` و `/admin/breeds/[id]` پویا |
| typecheck | `npx tsc --noEmit` | PASS — exit 0 |
| product-tests | `npm test` | PASS — tests 367، pass 367، fail 0، skipped 0 (۷۵ ثانیه). تست‌های تازه: ۷ تست `tests/domain/breeds.test.ts` و ۸ تست `tests/db/breeds.test.ts`. تست‌های به‌روزشده: `migrations`، `routes` و `seo`. `operations` (افزودن و کنارگذاشتن نژاد فاز یک) سبز ماند |
| browser-tests | `npm run test:browser` | PASS — tests 100، pass 100، fail 0 (۲۹۴ ثانیه). دیتابیس یک‌بارمصرف `hamzist_browser_b5f10dcfe7ac`، سرور `127.0.0.1:9772`. تست‌های تازه: ۳ تست `breeds` و `/breeds` در `visual`، همراه کل رگرسیون فاز یک و PROMPT-002. پس از اجرا هیچ دیتابیس تست باقی نماند |
| migration-on-dev-clone | dump دیتابیس توسعه → دیتابیس موقت → `migrateTo` → کوئری بررسی → حذف | PASS — تعداد Migrationها از ۱۷ به ۱۸ رسید. `species=DOG` و `fci_groups=10`. هر ۴۵ نژاد با نشانی معتبر، هر ۴۵ یکتا، همه DRAFT و نسخه ۱. `animal` ۲۳۷۴ ردیف و همه `DOG`؛ `kennel_breed` ۱۱۲ ردیف، پیش و پس یکسان |

**مسیر رسیدن به نتیجه.** اولین اجرای کامل مرورگر ۹۷ از ۱۰۰ بود. هر سه شکست در Suite تازه `breeds` بودند و سه باگ واقعی را نشان دادند (DEC-0157):
- ۳۰۸ و ۴۰۴ زیر مرز بارگذاری سراسری به ۲۰۰ تبدیل می‌شدند.
- `<select>`های فرم ویرایش پس از ذخیره خالی می‌شدند و ذخیره بعدی مقدار را پاک می‌کرد.
- پس از ورود، `next` به فهرست نژادها برمی‌گشت نه به همان نژاد.

دو اجرای هدفمند بعدی (۱۳ از ۱۴) دو انتظار نادرست در خود تست را نشان دادند: خواندن فهرست پیش از رندر stream، و انتظار حالت «نتیجه‌ای پیدا نشد» وقتی بانک کلاً خالی بود. پس از رفع، اجرای هدفمند ۱۴ از ۱۴ و اجرای کامل ۱۰۰ از ۱۰۰ شد.

**Screenshotها** در [phase-2/prompt-003](screenshots/phase-2/prompt-003/) هستند: ویرایشگر پس از ذخیره (گروه، اندازه و انرژی حفظ‌شده)، جست‌وجو، نتیجه خالی، بانک خالی، صفحه نژاد در موبایل و دسکتاپ، بایگانی و تکراری. Screenshotهای بازتولیدشده فاز یک و PROMPT-002 Commit نشدند.

## ۶. پوشش حالت‌ها

| حالت | پوشش |
|---|---|
| loading | `app/(public)/breeds/(list)/loading.tsx` برای فهرست. صفحه نژاد عمداً مرز بارگذاری ندارد تا ۳۰۸ و ۴۰۴ واقعی بمانند (DEC-0157). مرز بارگذاری سراسری PROMPT-002 به همین دلیل برداشته شد |
| empty | «هنوز نژادی منتشر نشده است» وقتی هیچ صفحه‌ای منتشر نشده؛ «نژادی با این جست‌وجو پیدا نشد» با پیوند برداشتن فیلتر (تست مرورگر)؛ «هنوز مطلبی ثبت نشده است» در ویرایشگر |
| error | خطای Server Action به‌صورت پیام فارسی در همان فرم؛ خطای رندر در `app/(public)/error.tsx` |
| forbidden | همه نویسنده‌ها `FORBIDDEN` برای غیر SUPERADMIN (تست دیتابیس)؛ `/admin/breeds/[id]` برای ناشناس به ورود و برای حساب عادی `FORBIDDEN` (تست مرورگر) |
| not found | نشانی نامعتبر، نشانی ناموجود و پیش‌نویس → ۴۰۴ فارسی؛ id نامعتبر در ویرایشگر → ۴۰۴ |
| duplicate | نامزد تکراری هنگام افزودن/ویرایش رد می‌شود؛ ثبت تکراری با دلیل: اعلان در صفحه، canonical به اصلی و `noindex`، بیرون از فهرست، sitemap و انتخاب فرم، بدون تغییر حیوان |
| archived | اعلان بایگانی، `noindex, follow`، بیرون از فهرست و sitemap، نشانی همچنان باز |
| conflict | نسخه کهنه در ویرایش، وضعیت و تکراری → CONFLICT فارسی؛ نشانی در استفاده → CONFLICT |

## ۷. Known Gaps

- رابطه نژاد با محتوا (آموزش/خبر) با CMS در PROMPT-004 ساخته می‌شود؛ این مرحله شناسه پایدار (`reference_breed.id`) و نشانی را آماده کرد.
- هیچ صفحه نژادی منتشر نشده و هیچ محتوای سلامتی Seed نشده؛ نوشتن محتوا با منبع کار انجمن/ادمین است.
- ادغام کامل تکراری با انتقال روابط و برگرداندن ثبت تکراری، کار پنل مدیریت PROMPT-016 است.
- مدیریت بانک نژاد با SUPERADMIN است تا نقش ادمین محتوا (004/016).
- تحمل غلط املایی و جست‌وجوی سراسری PROMPT-012 است؛ فهرست عمومی و نامزد تکراری کل ثبت را در حافظه فیلتر می‌کنند (برای صدها نژاد کافی است).
- ویرایش در جای ادعای سلامت نیست؛ بازبینی = ثبت تازه و بایگانی نسخه قبلی.
- وفاداری بصری صفحات نژاد به Figma UNVERIFIED است (فریم فاز دو در منابع نیست).
- داده ساختاریافته schema.org برای نژاد نوع استانداردی ندارد؛ فقط BreadcrumbList.
- **یافته خارج از دامنه (فاز یک):** همان خطر بازنشانی `<select>` پس از action (DEC-0157) در ۱۲ فایل فرم فاز یک هم وجود دارد: `app/admin/vets/forms.tsx`، `app/animals/[id]/edit/wizard.tsx`، `app/animals/[id]/foreign-pedigree/forms.tsx`، `app/declaration/forms.tsx`، `app/genetics/forms.tsx`، `app/litters/forms.tsx`، `app/mating/breeding-forms.tsx`، `app/mating/forms.tsx`، `app/vet/check-in/check-in-form.tsx`، و سه فرم `app/vet/requests/[id]/`. فرمی که پس از ذخیره روی همان صفحه می‌ماند و مقدار ذخیره‌شده را دوباره ویرایش می‌کند ممکن است انتخاب را خالی نشان بدهد. رگرسیون مرورگر فاز یک سبز است و این مرحله آن فرم‌ها را تغییر نداد؛ بررسی و رفع هرکدام تصمیم جدا می‌خواهد.

## ۸. پرامپت بعدی

PROMPT-004 — CMS و نقش نویسنده.
