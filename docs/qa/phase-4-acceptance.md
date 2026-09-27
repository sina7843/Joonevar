# ماتریس پذیرش فاز ۴

هر ردیف یک شاهد واقعی دارد. «شاهد» یعنی فرمانی که اجرا شده و تستی که پاس شده، نه توضیح.

وضعیت `NOT_CONFIGURED` نقص نیست: یعنی کد آماده است ولی داده عملیاتی یا تأیید بیرونی هنوز نیست. بخش ۶ [release-readiness-phase-4.md](../ops/release-readiness-phase-4.md) می‌گوید کدام.

- **پایه:** commit آزموده‌شده PHASE-4 PROMPT-008. هش و عددهای دقیق در `docs/reports/PHASE-4-PROMPT-008.json` است.
- **وضعیت پیش از فاز:** [phase-4-baseline.md](phase-4-baseline.md)

## معیارهای پذیرش (ACCEPTANCE_MATRIX فاز ۴)

| ID | معیار | Prompt | وضعیت | شاهد |
|---|---|---|---|---|
| A01 | baseline روی HEAD واقعی و بدون regression فاز ۳ | ۰۰۱ | VERIFIED | `docs/qa/phase-4-baseline.md` و اجرای کامل همه suiteهای فاز ۱ تا ۳ در هر gate |
| A02 | تنظیمات، قاعده نژاد، feature flag و نقش‌های حداقلی | ۰۰۲ | VERIFIED | `tests/domain/finder-foundations.test.ts` · `tests/db/finder-foundations.test.ts` · `tests/browser/finder-foundations.test.ts` |
| A03 | اشتراک، تأیید پرداخت، دوره و ظرفیت | ۰۰۲ | VERIFIED | `tests/db/finder-foundations.test.ts`: مبلغ دست‌کاری‌شده، replay، تمدید پشت سر هم، دو فعال‌سازی هم‌زمان در لبه ظرفیت |
| A04 | eligibility، دیده‌شدن، رسانه و پروفایل | ۰۰۳ | VERIFIED | `tests/db/finder-profile.test.ts` · `tests/browser/finder-profile.test.ts` |
| A05 | آخرین جفت‌گیری مشتق، cooldown فقط از رویداد تأییدشده | ۰۰۳، ۰۰۶ | VERIFIED | `tests/db/finder-profile.test.ts` · `tests/db/finder-downstream.test.ts` · `tests/config/phase-4-invariants.test.ts` (یک نویسنده، بدون setter) · `npm run db:upgrade-check` |
| A06 | جست‌وجو، فیلتر، علاقه‌مندی، جست‌وجوی ذخیره‌شده، پیشنهاد توضیح‌پذیر | ۰۰۴ | VERIFIED | `tests/domain/finder-discovery.test.ts` · `tests/db/finder-discovery.test.ts` · `tests/browser/finder-discovery.test.ts` |
| A07 | درخواست، انقضا، چت و قرارداد تک‌برنده race-safe | ۰۰۵ | VERIFIED | `tests/db/finder-requests.test.ts` · `tests/db/finder-acceptance.test.ts` |
| A08 | قرارداد نسخه‌دار، OTP دوطرفه، PDF تغییرناپذیر، بدون پرداخت | ۰۰۵ | VERIFIED | `tests/db/finder-requests.test.ts` · `tests/browser/finder-requests.test.ts` · `tests/browser/finder-evidence.test.ts` (PDF) |
| A09 | مسیر رسمی و شخصی بدون آمیختن آثار | ۰۰۶ | VERIFIED | `tests/db/finder-downstream.test.ts` · `tests/browser/finder-downstream.test.ts` |
| A10 | تأیید و تعارض تاریخ، timeline دو حیوان، reuse breeding | ۰۰۶ | VERIFIED | `tests/db/finder-downstream.test.ts` · `tests/db/dates.test.ts` |
| A11 | moderation، حریم خصوصی، اعلان، analytics، چرخه عمر | ۰۰۷ | VERIFIED | `tests/db/finder-operations.test.ts` · `tests/browser/finder-operations.test.ts` |
| A12 | CI، تمرین ارتقا، RTL/دسترس‌پذیری، تحویل | ۰۰۸ | VERIFIED | `.github/workflows/ci.yml` · `npm run db:upgrade-check` · `tests/browser/finder-evidence.test.ts` · `tests/config/phase-4-invariants.test.ts` · این سند |
| A13 | درگاه، پیامک، نقشه، متن و تأیید حقوقی، سیاست نگهداری، پایش | — | NOT_CONFIGURED | بخش ۶ `release-readiness-phase-4.md` |

## سناریوهای انتها به انتها (PROMPT-008)

| سناریو | شاهد |
|---|---|
| مشترک، پروفایلش را به کاربر رایگان نشان می‌دهد | `tests/db/finder-discovery.test.ts`، «the query shows each viewer exactly what the public page would, across the whole access matrix» · `tests/browser/finder-discovery.test.ts` (بازدیدکننده پروفایل مشترکان را می‌بیند) |
| مشترک، حیوان رایگانِ واردشده به استخر را می‌بیند | همان تست ماتریس دسترسی، با `free_pool_visibility` باز و بسته · `tests/domain/finder-foundations.test.ts` (ماتریس دیده‌شدن) |
| جفت رایگان با رایگان رد می‌شود | `tests/db/finder-requests.test.ts`، «sending is closed by its switch and refused for every missing condition» (رایگان با رایگان: NOT_FOUND) · `tests/domain/finder-foundations.test.ts` (یک طرف باید اشتراک داشته باشد) |
| ظرفیت قابل گذر نیست | `tests/db/finder-foundations.test.ts`، «two activations at the edge of the capacity end with one success and one refusal» |
| درخواست، سپس چت، سپس قرارداد نسخه‌دار با OTP دوطرفه | `tests/browser/finder-requests.test.ts` · `tests/db/finder-requests.test.ts` (نسخه، hash، replay، کد کهنه) |
| مسیر رسمی و شخصی | `tests/db/finder-downstream.test.ts` · `tests/browser/finder-downstream.test.ts` |
| تاریخ‌های متعارض | `tests/db/finder-downstream.test.ts` (جفت CONFLICTED/PROPOSED، اصلاح هم‌زمان) · `tests/browser/permit.test.ts` |
| تأیید دوطرفه آخرین جفت‌گیری هر دو حیوان را جابه‌جا می‌کند | `tests/db/finder-downstream.test.ts` (هر دو حیوان در یک تراکنش) · `tests/db/finder-profile.test.ts` |
| انقضا قرارداد فعال را دست نمی‌زند | `tests/db/finder-acceptance.test.ts` · `tests/domain/finder-requests.test.ts` |
| پذیرش یا تأیید هم‌زمان فقط یک برنده دارد | `tests/db/finder-requests.test.ts`، «two acceptances racing for one animal leave exactly one contract» · `tests/db/finder-downstream.test.ts` (handoff هم‌زمان) · `tests/db/finder-operations.test.ts` (برداشتن و تصمیم هم‌زمان گزارش) |
| کلیدهای قطع و وصل | `tests/db/finder-foundations.test.ts` · `tests/db/finder-requests.test.ts` · `tests/db/finder-discovery.test.ts` · `tests/browser/finder-discovery.test.ts` |
| گزارش، block، فایل خصوصی، دسترسی مدیر | `tests/db/finder-operations.test.ts` · `tests/browser/finder-operations.test.ts` · `tests/browser/finder-foundations.test.ts` (توقف operator در پیکربندی) |

## شواهد محدود (گواهی نیست)

- **RTL، ۳۶۰ پیکسل، ساختار صفحه‌کلید، نام کنترل‌ها، افشای سازگاری، خوانایی PDF و عملکرد جست‌وجو:** `tests/browser/finder-evidence.test.ts`. زمان‌ها و اندازه PDF در خروجی اجرا چاپ و در گزارش PROMPT-008 ثبت شده‌اند.
- این‌ها شاهدند که چیزی آسیب‌شناختی نیست. ممیزی کامل دسترس‌پذیری با کاربر صفحه‌خوان، تأیید حقوقی و آزمون بار انجام نشده است.
