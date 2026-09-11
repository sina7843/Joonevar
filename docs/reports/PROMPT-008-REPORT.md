# PROMPT-008 — دایرکتوری مراکز دامپزشکی

**وضعیت:** COMPLETE · **تاریخ:** ۲۰۲۶-۰۹-۱۲ · **تصمیم‌ها:** DEC-0167، DEC-0168 · **شواهد ماشینی:** [phase-2/PROMPT-008.json](phase-2/PROMPT-008.json)

## ۱. وضعیت واقعی کد پیش از شروع

| موضوع | آنچه در کد بود | پیامد برای این پرامپت |
|---|---|---|
| محل کار | `vet_location` با مالک اجباری دامپزشک، پروانه و امکانات خدمات فاز یک؛ Finder، ارجاع و مراجعه به همین ردیف FK دارند | شعبه مرکز باید همین ردیف باشد، نه جدول دوم (P2-D15) |
| مرکز | وجود نداشت؛ نقشه مرزی فاز دو آن را CREATE علامت زده بود | `centre` تازه ساخته شد و شعبه به `vet_location` پیوند خورد |
| نقش‌ها | `REVIEW_OPERATOR` (007) و الگوی مالک = حساب پروفایل | «مدیر مرکز» نقش تازه نشد؛ مالک همان حساب `owner_account_id` است |
| جغرافیا و گونه | جدول استان/شهر (006) و Species مشترک | شعبه و فیلترها از همان‌ها استفاده کردند |
| ساعات | فقط یادداشت متنی روی محل کار | جدول ساعات هفتگی + پرچم شبانه‌روزی، فقط اطلاع‌رسانی (P2-D08) |

## ۲. آنچه ساخته شد

### Schema و Migration — `src/db/migrations/0022_centres.sql`
- `centre` (نوع، نام، معرفی، تماس، وب‌سایت، مجوز و وضعیتش، وضعیت انتشار و نشانی عمومی، شهر/تماس/منبع رکورد بدون مالک، مالک و زمان واگذاری، نسخه).
- Taxonomyهای Seed‌شده: `centre_type` (۱۰ نوع §۹)، `centre_service` (۱۴ خدمت)، `centre_facility` (۱۰ امکان) و جدول‌های پیوند خدمات، گونه‌ها و امکانات.
- `centre_member` با وضعیت دعوت/پذیرش/رد/برداشته‌شده و `location_hours` برای ساعات هر روز هفته.
- `vet_location`: `vet_account_id` nullable شد و `centre_id` و `is_open_24h` اضافه شدند.

### جدایی از فاز یک
| قاعده | جای اجرا |
|---|---|
| شعبه‌ای که مرکز می‌سازد به Finder نمی‌رسد | مالک دامپزشک ندارد، پروانه NONE و بدون امکانات؛ همه مسیرهای فاز یک join روی `vet_account_id` دارند |
| محل کار موجود کپی نمی‌شود | `attachLocationToCentre` فقط `centre_id` را ست می‌کند؛ پروانه، امکانات و مالک دست نمی‌خورد |
| Finder تغییر نمی‌کند | تست دیتابیس نتیجه Finder را پیش و پس از ساخت شعبه و پیوند مقایسه می‌کند |

### Service، مسیرها و Permission
- `src/centres/model.ts`: وضعیت‌ها، ساعت‌خوانی (ارقام فارسی/عربی و «.»)، اعتبارسنجی روز هفته، Completeness نُه‌موردی، شرط انتشار و نمایش مجوز.
- `src/centres/service.ts`: ثبت مرکز، ویرایش پرونده، ثبت مجوز، انتشار/پنهان‌سازی، شعبه‌ها و ساعات، پیوند محل کار موجود، دعوت و پذیرش عضو، واگذاری مدیریت، خواننده‌های عمومی و sitemap.
- مسیرها: `/admin/centres` (سوپرادمین)، `/review/centres` (اپراتور بررسی: انتشار و مجوز، بدون ویرایش محتوا)، `/account/centres` (مدیر مرکز)، `/centers` و `/centers/[slug]` (عمومی).
- هر تغییر سوپرادمین/اپراتور دلیل اجباری دارد، مالک اختیاری؛ همه با نسخه مورد انتظار و Audit مقدار قبلی/جدید.

### محورهای وضعیت (P2-D05)
| محور | منبع |
|---|---|
| Completeness | محاسبه از ۹ مورد پرونده مرکز |
| Ownership/Claim | `centre.owner_account_id` و `claimed_at` |
| تأیید مجوز | `licence_status` که فقط بررسی ثبت می‌کند؛ «معتبر» بدون شماره ثبت نمی‌شود |
| همکار خدمات همزیست | دست‌کم یک شعبه که محل کار ثبت‌شده دامپزشک با پروانه معتبر فاز یک است |
| Advertising | ندارد؛ خرید بسته فقط برای مرکز دارای مالک (۰۱۱) |

### حالت‌ها
| حالت | پوشش |
|---|---|
| Loading | `app/(public)/centers/(list)/loading.tsx`، `app/review/centres/(list)/loading.tsx` |
| Empty | فهرست عمومی خالی، نبود نتیجه فیلتر، مرکز بدون شعبه، مرکز بدون عضو، «مرکزی به شما سپرده نشده است» |
| Error | پیام فارسی هر فرم: دلیل، شهر، ساعت نادرست، مجوز بدون شماره، نسخه قدیمی (CONFLICT) |
| Forbidden | `/admin/centres` و `/review/centres` برای دیگران؛ ویرایش محتوا برای اپراتور بررسی؛ مهمان به ورود با `next` دقیق |
| Duplicate | نام تکراری مرکز با تأیید صریح، دعوت تکراری عضو، پیوند دوباره محل کار، واگذاری دوم |
| Archived | شعبه غیرفعال (از صفحه عمومی می‌رود و عمومی نمی‌شود)، مرکز HIDDEN (۴۰۴ و خارج از sitemap) |

## ۳. تست‌ها (هدفمند، طبق دستور کاربر)
| دستور | نتیجه |
|---|---|
| `npx tsc --noEmit` | exit 0 (پیش و پس از build) |
| `npm run build` | Compiled successfully، exit 0 |
| واحد (دامنه مراکز، routes، seo) | ۳۵/۳۵ و اجرای دوباره دامنه مراکز ۵/۵ |
| `tests/db/centres.test.ts` | ۹/۹ |
| رگرسیون DB (vet-directory، vet-onboarding، migrations، referrals) | ۳۲/۳۲ |
| `npm run test:browser -- tests/browser/centres.test.ts` | ۴/۴ روی `hamzist_browser_f08a981e0086` |
| رگرسیون مرورگر (public-shell، vet-onboarding، vet-directory) | ۱۳/۱۳ روی `hamzist_browser_77dde65364e3` |

سه شکست واقعی رخ داد و هر سه با اصلاح کد یا قاعده حل شد، نه با تغییر انتظار تست:
1. مرکز بدون مالکِ دارای شهر باید منتشر شود؛ قاعده انتشار اکنون شعبه عمومی دارای شهر را هم می‌پذیرد.
2. ساعاتی که هنگام افزودن شعبه نوشته می‌شد ذخیره نمی‌شد؛ حالا با همان شعبه ثبت می‌شود.
3. `FormData(form)` دکمه فشرده‌شده را نمی‌فرستد، پس پذیرش و رد دعوت هر دو بی‌پاسخ می‌رفتند؛ helper مشترک اکنون submitter را می‌فرستد و فرم دعوت پاسخش را در فیلد خودش می‌گذارد.

آخرین اجرای کامل: `npm test` ۳۸۵/۳۸۵ و مرورگر ۱۰۳/۱۰۳ در `7c74577`.

### شواهد تصویری — `docs/reports/screenshots/phase-2/prompt-008/`
`admin-centre-editor.png` · `review-centre-licence.png` · `centres-list-mobile.png` · `centre-page-mobile.png` · `vet-invitation-accepted.png`. تصاویر پرامپت‌های قبلی که با اجرای دوباره بازتولید شدند به نسخه commit‌شده برگردانده شدند.

## ۴. فایل‌های تغییرکرده
- Schema/Migration: `src/db/schema/vets.ts`، `src/db/migrations/0022_centres.sql` + snapshot و journal
- سرویس و UI مشترک: `src/centres/{model,service,actions,forms,editor}`، `src/vets/directory-forms.tsx` (اصلاح submitter)
- زیرساخت: `src/authz/routes.ts`، `src/public/sections.ts`، `src/seo/{sitemap,structured-data}.ts`، `src/domain/resume-context.ts`، `src/ui/shell.tsx`
- صفحات: `app/(public)/centers/**`، `app/admin/centres/**`، `app/review/centres/**`، `app/account/centres/**`، `app/account/vet-profile/page.tsx` (دعوت‌های مرکز)، و دو صفحه فاز یک که حالا صریح بررسی می‌کنند محل کار مالک دامپزشک دارد
- تست: `tests/domain/centres.test.ts`، `tests/db/centres.test.ts`، `tests/browser/centres.test.ts`، `tests/browser/public-shell.test.ts`، `tests/ui/seo.test.ts`
- مستندات: `DECISIONS.md`، `REQUIREMENTS_TRACEABILITY.md` (P2-R08)، `docs/architecture/phase-2-boundary.md`

## ۵. Known Gaps
- تصاویر مرکز (§۹) ساخته نشد؛ خط لوله تصویر عمومی امروز فقط برای محتواست (DEC-0160).
- پیشنهاد کاربر عادی و Claim نماینده مرکز (§۱۰) با PROMPT-009 می‌آید؛ فعلاً سوپرادمین با دلیل و Audit مدیریت را واگذار می‌کند.
- نقشه ساخته نشد؛ مختصات ثبت‌شده به‌صورت متن نمایش داده می‌شود و نقشه با ۰۱۵ می‌آید.
- پیوند محل کار موجود به مرکز فقط کار سوپرادمین است؛ دامپزشک از پروفایل خودش این کار را نمی‌کند.
- گزارش مرکز و Merge مراکز تکراری در ۰۱۶، بسته‌های تبلیغاتی در ۰۱۱ و رتبه‌بندی/جست‌وجو در ۰۱۲.
- ساعات فقط اطلاع‌رسانی است؛ هیچ نوبت یا زمان قطعی ساخته نشد (P2-D08).
- تطابق بصری با Figma: UNVERIFIED (فریم فاز دو در منابع نیست).
- هیچ تعرفه، مجوز یا ادعای پزشکی ساختگی اضافه نشد؛ «امکانات» فقط امکانات ساختمان و پذیرش است.
