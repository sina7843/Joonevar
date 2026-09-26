# ماتریس پذیرش فاز ۳

هر ردیف با شاهد واقعی. «شاهد» یعنی فرمان اجراشده و تستی که پاس شده — نه توضیح. وضعیت `NOT_CONFIGURED` یک نقص نیست: یعنی کد آماده است و داده عملیاتی یا تأیید بیرونی نیست، و بخش ۵ [release-readiness-phase-3.md](../ops/release-readiness-phase-3.md) می‌گوید کدام.

پایه: کامیت کاری PHASE-3 PROMPT-014 (هش در `PROJECT_STATUS-PHASE-3.md`) · وضعیت پیش از فاز: [phase-3-baseline.md](phase-3-baseline.md)

| ID | معیار | Prompt | وضعیت | شاهد |
|---|---|---|---|---|
| B01 | baseline واقعی HEAD و معماری بازار | ۰۰۱ | VERIFIED | `docs/qa/phase-3-baseline.md` · `docs/architecture/` — شمارش تست‌ها و مرزهای bounded context پیش از هر تغییر |
| B02 | قابلیت‌های least-privilege و نقش‌های عملیاتی | ۰۰۲ | VERIFIED | `tests/db/marketplace-foundations.test.ts` — هر اقدام رکوردمحور روی خود رکورد سنجیده می‌شود، نه روی مسیر انتخابی فرم |
| B03 | آگهی حیوان با نسخه، رسانه و هزینه انتشار | ۰۰۳ | VERIFIED | `tests/db/animal-listing.test.ts` · `tests/browser/animal-listing.test.ts` — انتشار بدون حداقل عکس ممکن نیست؛ هزینه از تنظیم می‌آید |
| B04 | قواعد دیده‌شدن، داوری و تبلیغ برچسب‌دار | ۰۰۴ | VERIFIED | `tests/db/moderation.test.ts` · `tests/browser/moderation.test.ts` — چهار علت پنهان‌شدن از بیرون قابل تفکیک نیستند؛ جایگاه تبلیغاتی جدا و برچسب‌دار |
| B05 | کشف، جست‌وجو و صفحه عمومی بازار | ۰۰۵ | VERIFIED | `tests/db/market-discovery.test.ts` · `tests/browser/market-discovery.test.ts` |
| B06 | ودیعه، تسویه معامله و استرداد | ۰۰۶ | VERIFIED | `tests/db/deal-settlement.test.ts` · `tests/browser/animal-settlement.test.ts` — استرداد فقط با پاسخ ارائه‌دهنده؛ replay پول دوباره نمی‌فرستد |
| B07 | تحویل حیوان و انتقال مالکیت | ۰۰۷ | VERIFIED | `tests/db/animal-handover.test.ts` · `tests/browser/animal-handover.test.ts` — کد تحویل با سقف تلاش، قفل و انقضا |
| B08 | پرونده فروشنده، توافق‌نامه و پلن | ۰۰۸ | VERIFIED | `tests/db/commerce-seller.test.ts` · `tests/browser/commerce-seller.test.ts` — فروشگاه بدون توافق‌نامه نسخه‌دار ACTIVE نمی‌شود (چک دیتابیسی) |
| B09 | کاتالوگ ترکیبی، عرضه چند فروشنده و موجودی | ۰۰۹ | VERIFIED | `tests/db/commerce-catalog.test.ts` · `tests/browser/commerce-catalog.test.ts` |
| B10 | سبد پایدار و یک پرداخت برای چند فروشنده | ۰۱۰ | VERIFIED | `tests/db/commerce-orders.test.ts` — دو checkout برای آخرین واحد یک سفارش می‌سازند؛ callback تکراری دوباره نمی‌فروشد؛ سفارش والد جمع زیرسفارش‌هاست |
| B11 | ارسال، مرجوعی، دفتر مالی و تسویه | ۰۱۱ | VERIFIED | `tests/db/commerce-fulfilment.test.ts` · `tests/browser/commerce-fulfilment.test.ts` — مبلغ مورد اختلاف نگه داشته می‌شود؛ دسته تسویه بدون شماره پیگیری بانک PAID نمی‌شود |
| B12 | نظر تأییدشده، تخفیف، وفاداری و پیشنهاد | ۰۱۲ | VERIFIED | `tests/domain/commerce-trust.test.ts` · `tests/db/commerce-trust.test.ts` — نظر فقط پس از معامله/تحویل؛ کد تک‌مصرف با ایندکس یکتا؛ وفاداری بدون مسیر نقدشدن |
| B13 | میزهای عملیاتی، اعلان، تحلیل و سخت‌سازی | ۰۱۳ | VERIFIED | `tests/domain/operations-security.test.ts` · `tests/db/operations-security.test.ts` · `tests/browser/market-operations-phase3.test.ts` — غریبه NOT_FOUND می‌گیرد؛ گروه کوچک‌تر از حد نصاب عددش پنهان می‌شود؛ هیچ نقشی پول را بیرون از قرارداد خودش موفق اعلام نمی‌کند |
| B14 | CI، تمرین ارتقا، بازیابی و تحویل | ۰۱۴ | VERIFIED | `npm run db:upgrade-check` (۵۱/۵۱) · `tests/db/backup-restore.test.ts` (۲/۲) · `tests/browser/phase-3-readiness.test.ts` (۸/۸) · `.github/workflows/ci.yml` |
| B15 | مهاجرت افزودنی و سازگاری نسخه قبل | ۰۱۱–۰۱۴ | VERIFIED | `tests/domain/migrations.test.ts` (هیچ `DROP`/`RENAME`) و `npm run db:upgrade-check` — insertهای نسخه قبلی در برابر طرح پس از `0052` پذیرفته می‌شوند |
| B16 | دسترس‌پذیری، RTL و عملکرد صفحات فاز ۳ | ۰۱۴ | VERIFIED | `tests/browser/phase-3-readiness.test.ts` — یک `main`، یک `h1`، صفر کنترل بی‌نام، بدون پیمایش افقی در ۳۶۰px، همه صفحات زیر ۱۱۰ms |
| B17 | درگاه، پیامک، بانک و ذخیره‌سازی واقعی | — | NOT_CONFIGURED | بخش ۵.۱ `release-readiness-phase-3.md` — آداپتور محلی در production ساخته نمی‌شود، پس CI سبز هرگز شاهد ارائه‌دهنده واقعی نیست |
| B18 | تعرفه، توافق‌نامه و تأیید حقوقی | — | NOT_CONFIGURED | بخش ۵.۲ و ۵.۳ — هیچ نرخی در کد عدد ثابت ندارد و نرخ ثبت‌نشده صفر خوانده نمی‌شود |
| B19 | یکپارچگی حمل‌ونقل | — | NOT_INTEGRATED | بخش ۵.۴ — رهگیری دستی ثبت می‌شود؛ هیچ API باربری صدا نمی‌شود |
| B20 | اسکن بدافزار و آزمون نفوذ | ۰۱۳ | NOT_IMPLEMENTED | `docs/security/phase-3-threat-review.md` §۶ و §۸ — امضای فایل می‌گوید این یک JPEG است، نه اینکه بی‌خطر است |
