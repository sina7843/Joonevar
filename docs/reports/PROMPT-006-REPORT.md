# PROMPT-006 — پروفایل عمومی دامپزشک

**وضعیت:** COMPLETE · **تاریخ:** ۲۰۲۶-۰۹-۱۲ · **تصمیم‌ها:** DEC-0163، DEC-0164 · **شواهد ماشینی:** [phase-2/PROMPT-006.json](phase-2/PROMPT-006.json)

## ۱. وضعیت واقعی کد پیش از شروع

| موضوع | آنچه در کد بود | پیامد برای این پرامپت |
|---|---|---|
| دامپزشک | `vet_profile` (یک ردیف برای هر حساب، کد نظام یکتا، `council_verified_at`، تلفن، بیو) که فقط سوپرادمین در `/admin/vets` می‌سازد | پروفایل عمومی باید روی همین ردیف باشد (P2-D15)؛ جدول دوم ساخته نشد |
| محل کار | `vet_location` با استان/شهر **متن آزاد**، پروانه، امکانات؛ Finder، ارجاع و بارداری به همین ردیف FK دارند | متن آزاد دست نخورد؛ پیوند اختیاری به جدول نرمال‌شده اضافه شد |
| Trusted | نقش `TRUSTED_VET` با وضعیت ACTIVE/SUSPENDED | محور Trusted همین نقش است و از اینجا تغییر نمی‌کند |
| Species | فقط `DOG` (PROMPT-003) | فیلتر گونه با یک مقدار بی‌معنا بود؛ `CAT` اضافه شد و بانک نژاد سگ‌محور ماند |
| مسیر عمومی | `/veterinarians` بسته و در ناوبری «برنامه‌ریزی‌شده» | باز شد و در سربرگ، پابرگ و sitemap آمد |
| اشکال یافته | `upsertVetProfile` هر بار بیو را از فرمی که فیلد بیو ندارد `null` می‌کرد | اصلاح شد تا ذخیره فرم فاز یک معرفی دایرکتوری را پاک نکند |

## ۲. آنچه ساخته شد

### Schema و Migration — `src/db/migrations/0020_vet-directory.sql`
- `province` (۳۱ استان، کد لاتین پایدار) و `city` (یکتا در هر استان؛ ۳۱ مرکز استان Seed شد).
- `vet_location`: `province_code`، `city_id` (اختیاری، FK)، `is_public`، `hours_note_fa`. **Backfill** در همان Migration متن آزاد را با یکسان‌سازی ی/ک عربی به استان و شهر Seed‌شده وصل می‌کند؛ متن اصلی می‌ماند.
- `vet_profile`: `public_status` (DRAFT/PUBLISHED/HIDDEN)، `public_slug` یکتا، `public_published_at`، `headline_fa`، `experience_fa`، `show_phone`، `show_council_code`.
- `vet_specialty` (۱۵ حوزه کاری Seed‌شده)، `vet_profile_specialty`، `vet_profile_species`؛ `species` ردیف `CAT` گرفت.
- همه تغییرات افزایشی‌اند؛ هیچ ستونی حذف یا بازنویسی نشد.

### Service و Permission
- `src/vets/directory-model.ts`: Completeness (هفت مورد)، شرط انتشار، نمایش تلفن با رضایت.
- `src/vets/directory.ts`: ویرایش پروفایل، محل کار، وضعیت و افزودن شهر فقط در Context `SUPERADMIN`. هر تغییر **دلیل**، **نسخه مورد انتظار** (CONFLICT برای تغییر هم‌زمان) و Audit فیلدبه‌فیلد با مقدار قبلی/جدید، Actor و زمان دارد. خواننده‌های عمومی: فهرست با فیلتر، صفحه با slug و sitemap.
- `src/breeds/service.ts`: گونه غیر `DOG` برای نژاد رد می‌شود (P2-D01).

### محورهای وضعیت (P2-D05)
| محور | منبع | کجا دیده می‌شود |
|---|---|---|
| Completeness | محاسبه از محتوای پروفایل، ذخیره نمی‌شود | ویرایشگر: «۶ از ۷» و موارد مانده |
| Ownership/Claim | امروز همیشه حساب دامپزشک | ویرایشگر؛ بی‌مالک و Claim در 007 |
| Professional Verification | `council_verified_at` فاز یک | نشان «کد نظام تأییدشده»، فیلتر VERIFIED |
| Trusted Hamzist | نقش فعال `TRUSTED_VET` | نشان جدا، فیلتر TRUSTED؛ نقش معلق = نه Trusted ولی Verified |
| Advertising | وجود ندارد تا 011 | ویرایشگر: «بسته فعالی ندارد» |

هیچ نمره ترکیبی ساخته نشد و ترتیب فهرست تا رتبه‌بندی نسخه‌دار خنثی (نام) است.

### Route و UI
- `/admin/vets/[accountId]` (از فهرست فاز یک لینک دارد): محورها، انتشار با موانع، اطلاعات پروفایل با تخصص/گونه/رضایت، شهر و نمایش هر محل کار، افزودن شهر. فرم‌ها با `onSubmit` تا مقدار ذخیره‌شده پس از رفرش درست بماند (DEC-0157).
- `/veterinarians`: جست‌وجوی نام/محل کار و فیلتر تخصص، گونه، استان، شهر، نوع محل کار و وضعیت تأیید؛ صفحه‌بندی؛ Loading فقط برای فهرست.
- `/veterinarians/[slug]`: نشان‌های جدا، کد نظام و تلفن فقط با رضایت، تخصص و گونه، معرفی و سوابق، محل‌های کار عمومی و فعال با ساعات اطلاع‌رسانی، canonical، JSON-LD `Person` با `VeterinaryCare` و Breadcrumb. توضیح صریح که نوبت و درخواست خدمت وجود ندارد (P2-D08).

### حالت‌ها
| حالت | پوشش |
|---|---|
| Loading | `app/(public)/veterinarians/(list)/loading.tsx` |
| Empty | «هنوز پروفایل دامپزشکی منتشر نشده است»؛ «دامپزشکی با این جست‌وجو پیدا نشد» با پیوند همه دامپزشکان؛ محل کار ثبت‌نشده در ویرایشگر |
| Error | پیام فارسی هر فرم (دلیل، شهر نامعتبر، موانع انتشار، CONFLICT)؛ `(public)/error.tsx` |
| Forbidden | `AccessDenied` با کد FORBIDDEN برای هر Context غیرسوپرادمین؛ مهمان به ورود با `next` دقیق |
| Duplicate | کد نظام یکتا (فاز یک)، شهر تکراری در همان استان CONFLICT، slug یکتا، تخصص/گونه تکراری یکی می‌شود |
| Archived/Hidden | پنهان، پیش‌نویس، حساب غیرفعال و slug ناشناخته ۴۰۴؛ محل کار غیرفعال فاز یک نمایش داده نمی‌شود و عمومی نمی‌شود |

## ۳. تست‌ها (هدفمند، طبق دستور کاربر)
| دستور | نتیجه |
|---|---|
| `npx tsc --noEmit` | exit 0 (پیش و پس از build) |
| `npm run build` | Compiled successfully، exit 0 |
| `node --test tests/domain/vet-directory.test.ts tests/ui/routes.test.ts tests/ui/seo.test.ts` | ۳۳/۳۳ (اجرای اول `seo.test` روی فهرست قدیمی بخش‌های فعال شکست خورد و به‌روز شد) |
| `node --test --test-concurrency=1 tests/db/vet-directory.test.ts tests/db/breeds.test.ts` | ۱۶/۱۶ |
| `node --test --test-concurrency=1 tests/db/migrations.test.ts tests/db/referrals.test.ts tests/db/content.test.ts` | ۲۶/۲۶ (رگرسیون فاز یک و کد مشترک) |
| `npm run test:browser -- tests/browser/vet-directory.test.ts tests/browser/public-shell.test.ts tests/browser/breeds.test.ts tests/browser/finder.test.ts` | ۱۹/۱۹ روی `hamzist_browser_108aaf063285` |

آخرین اجرای کامل: `npm test` ۳۸۵/۳۸۵ و مرورگر ۱۰۳/۱۰۳ در `7c74577`. مجموعه‌هایی که کدشان تغییر نکرد دوباره اجرا نشدند.

نکات مهم تست‌ها: Backfill با همان دستورهای فایل Migration روی ی عربی؛ نتیجه Finder پیش و پس از انتشار یکسان؛ دو پنهان‌سازی هم‌زمان (یکی اعمال، دیگری CONFLICT)؛ فیلتر مکان و نوع روی یک محل کار؛ رضایت تلفن و کد نظام؛ موبایل ۳۶۰px بدون اسکرول افقی.

### شواهد تصویری — `docs/reports/screenshots/phase-2/prompt-006/`
`editor-published.png` · `directory-filtered-mobile.png` · `profile-mobile.png` · `directory-desktop.png`. تصاویر پرامپت‌های قبلی که با اجرای دوباره تست‌ها بازتولید شدند به نسخه commit‌شده برگردانده شدند.

## ۴. فایل‌های تغییرکرده
- Schema/Migration: `src/db/schema/geography.ts`، `src/db/schema/vets.ts`، `src/db/schema/index.ts`، `src/db/migrations/0020_vet-directory.sql`، `meta/0020_snapshot.json`، `meta/_journal.json`
- Service: `src/vets/directory-model.ts`، `src/vets/directory.ts`، `src/vets/registry.ts`، `src/breeds/service.ts`
- مسیر/SEO: `src/authz/routes.ts`، `src/public/sections.ts`، `src/seo/sitemap.ts`، `src/seo/structured-data.ts`
- UI: `app/admin/vets/page.tsx`، `app/admin/vets/[accountId]/{page.tsx,actions.ts,forms.tsx}`، `app/(public)/veterinarians/(list)/{page.tsx,loading.tsx}`، `app/(public)/veterinarians/[slug]/page.tsx`
- تست: `tests/domain/vet-directory.test.ts`، `tests/db/vet-directory.test.ts`، `tests/browser/vet-directory.test.ts`، `tests/db/breeds.test.ts`، `tests/browser/public-shell.test.ts`، `tests/ui/seo.test.ts`
- مستندات: `DECISIONS.md`، `REQUIREMENTS_TRACEABILITY.md` (P2-R06)، `docs/architecture/phase-2-boundary.md`

## ۵. Known Gaps
- ویرایش پروفایل توسط خود دامپزشک، Claim و پروفایل بی‌مالک → PROMPT-007.
- گزارش پروفایل دامپزشک (§۱۳) ساخته نشد → با صف بررسی 007.
- «محتوای مرتبط» پروفایل: CMS رابطه‌ای با دامپزشک ندارد.
- تبلیغات و فیلتر «نوع نمایش» → 011؛ رتبه‌بندی → 012/015.
- فیلتر فهرست در حافظه روی پروفایل‌های منتشرشده است؛ جست‌وجوی ایندکس‌دار → 012.
- پیوند استان/شهر فقط برای `vet_location`؛ لانه، اقامت و درخواست پستی → 015. نقشه ساخته نشد.
- تطابق بصری با Figma: UNVERIFIED (فریم فاز دو در منابع نیست).
- هیچ تعرفه، زمان قطعی، مجوز یا ادعای پزشکی ساخته نشد؛ فهرست تخصص‌ها حوزه کاری است، نه گواهی.
