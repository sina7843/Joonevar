# ماتریس پذیرش فاز ۲.۵

هر ردیف ماتریس پذیرش بسته (A01–A13) با شاهد واقعی. «شاهد» یعنی فرمان اجراشده و تستی که پاس شده — نه توضیح.

پایه: کامیت کاری PROMPT-016 (هش در `PROJECT_STATUS-PHASE-2.5.md`).

| ID | معیار | Prompt | وضعیت | شاهد |
|---|---|---|---|---|
| A01 | تست کامل HEAD و baseline مستند | ۰۰۱ | VERIFIED | `docs/qa/phase-2.5-baseline.md` — وضعیت واقعی HEAD پیش از فاز، با شمارش تست‌ها و یافته‌های باز |
| A02 | Role/Tag/Status جدا و فقط یک Tag | ۰۰۲–۰۰۳ | VERIFIED | `tests/domain/vet-professional.test.ts` · `tests/db/vet-professional-tags.test.ts` (ایندکس یکتای جزئی روی Tag بدون `ended_at`؛ تاریخچه تغییرناپذیر با trigger) |
| A03 | دانشجو با بررسی دستی و بدون دسترسی دکتر | ۰۰۴ | VERIFIED | `tests/db/vet-student.test.ts` · `tests/browser/vet-licence.test.ts` (Tag دانشجو هیچ مسیر کاری دکتر را باز نمی‌کند) |
| A04 | دکتر بدون پروانه با شماره نظام تأییدشده | ۰۰۵ | VERIFIED | `tests/db/vet-doctor.test.ts` (Tag «بدون پروانه فعالیت» پس از تأیید کد نظام؛ کار معتمد باز نمی‌شود) |
| A05 | پروانه با کد، تاریخ، فایل و پرداخت دوره‌ای | ۰۰۶–۰۰۸ | VERIFIED | `tests/db/vet-licence.test.ts` · `tests/db/vet-licence-period.test.ts` · `tests/browser/vet-licence.test.ts` (تأیید تنها پرداخت را باز می‌کند؛ Tag فقط با پرداخت تأییدشده ساخته می‌شود) |
| A06 | صف و audit ادمین انجمن | ۰۰۷ | VERIFIED | `tests/db/vet-review.test.ts` · `tests/browser/vet-review.test.ts` (برداشتن/رها کردن با نسخه؛ تصمیم پرونده‌ای که دیگری برداشته رد می‌شود؛ مشاهده مدرک audit می‌شود) |
| A07 | عضویت انجمن زمان‌دار و قابل تمدید | ۰۰۹ | VERIFIED | `tests/db/membership-period.test.ts` · `tests/browser/membership.test.ts` (تمدید روی پایان دوره زنده؛ عضویت‌های مادام‌العمر پیشین دست‌نخورده) |
| A08 | معتمد فقط با eligibility کامل و پرداخت | ۰۱۰–۰۱۱ | VERIFIED | `tests/db/vet-trusted.test.ts` · `tests/db/vet-trusted-period.test.ts` (پیش‌نیاز در دو لحظه بررسی می‌شود؛ پرداختِ پیش‌نیازِ ازدست‌رفته چیزی نمی‌دهد و audit می‌شود) |
| A09 | کلاب مستقل، مالکیت و RBAC scoped | ۰۱۲ | VERIFIED | `tests/domain/club-model.test.ts` · `tests/db/clubs.test.ts` · `tests/browser/clubs.test.ts` (نقش یک کلاب در کلاب دیگر هیچ است؛ یک درخواست باز مالکیت؛ کلاب تأییدنشده صفحه عمومی ندارد) |
| A10 | شروط عضویت کلاب داده‌محور و نسخه‌دار | ۰۱۳ | VERIFIED | `tests/domain/club-rules.test.ts` · `tests/db/club-enrollment.test.ts` · `tests/browser/club-rules.test.ts` (فهرست مجاز، بدون اجرای کد؛ نسخه پذیرش هر عضو حفظ می‌شود؛ بازبینی صریح و ممیزی‌شده) |
| A11 | محتوای عمومی و صفحات جدید | ۰۱۴ | VERIFIED | `tests/domain/content-taxonomy.test.ts` · `tests/db/content-taxonomy.test.ts` · `tests/browser/public-pages.test.ts` (taxonomy seed‌شده، KC/AKC منبع‌دار و بدون القای وابستگی، هیچ تعرفه‌ای در صفحه بازاریابی) |
| A12 | اعلان پایدار و قابل retry | ۰۱۵ | VERIFIED | `tests/db/notification-outbox.test.ts` (صف در تراکنش دامنه، backoff، SUPPRESSED، ارسال یک‌بار با سه کارگر هم‌زمان، redaction) |
| A13 | CI، امنیت و تحویل قابل بازتولید | ۰۱۶ | VERIFIED | `.github/workflows/ci.yml` · `docs/security/phase-2.5-threat-review.md` · `tools/upgrade-check.mjs` (۱۸/۱۸) · `tests/browser/a11y-performance.test.ts` · `docs/ops/recovery-and-rollback.md` |

## آنچه «تأییدشده» نیست و ادعا هم نشده

- **یکپارچه‌سازی تولیدی:** درگاه پرداخت، ارائه‌دهنده پیامک، ذخیره‌سازی خصوصی ابری و کلید نقشه هیچ‌کدام پیکربندی نشده‌اند. سبز بودن CI شاهد کارکردن آن‌ها نیست و نمی‌تواند باشد؛ CI عمداً با محیط محلی اجرا می‌شود.
- **داده عملیاتی:** تعرفه دوره پروانه و معتمد، متن تعهدنامه، شرایط و مقررات انجمن و مشخصات تماس ثبت نشده‌اند. تا ثبت، مسیرهای وابسته **بسته**اند، نه باز با مقدار صفر.
- **تمرین ارتقا روی داده تولیدی:** `tools/upgrade-check.mjs` روی داده نماینده اجرا شده است، نه روی کپی تولیدی؛ داده تولیدی در این محیط وجود ندارد.
- **اسکن بدافزار فایل:** وجود ندارد.
