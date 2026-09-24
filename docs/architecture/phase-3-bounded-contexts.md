# فاز ۳ — مرزهای دامنه، بازاستفاده و برنامه اجرا

این سند خروجی معماری PHASE-3 PROMPT-001 است. کار آن سه چیز است: تعریف دو bounded context تازه و مرز قطعی بینشان، فهرست کردن آنچه از فازهای ۱ تا ۲.۵ **بازاستفاده** می‌شود به‌جای اینکه دوباره ساخته شود، و برنامه migration/API/تست که Promptهای ۰۰۲ تا ۰۱۴ روی آن اجرا می‌شوند.

مبنای واقعی: HEAD مخزن `32a55e92c811989ec6bf3ddfb7bad54f0ca94177` — همان HEAD بررسی‌شده بسته فاز ۳. delta بین بسته و مخزن صفر است؛ هیچ commit خارج از بسته پس از تحویل فاز ۲.۵ نیامده. اعداد دروازه‌ها در [phase-3-baseline.md](../qa/phase-3-baseline.md).

---

## ۱. چرا دو context و نه یکی

فاز ۳ دو محصول اضافه می‌کند که سطحشان شبیه هم است (آگهی، جست‌وجو، پرداخت، گفت‌وگو، اختلاف) ولی **ثابت‌های دامنه‌شان یکی نیست**:

| پرسش | ANIMAL_MARKETPLACE | COMMERCE |
|---|---|---|
| موضوع معامله چیست؟ | یک موجودیت یکتا و شناسنامه‌دار که از قبل در همزیست ثبت شده است | یک SKU با موجودی شمارشی |
| چند تا می‌شود فروخت؟ | دقیقاً یک بار؛ فروش دوم فقط پس از انتقال مالکیت معنا دارد | هر بار به اندازه موجودی |
| همزیست چقدر پول می‌گیرد؟ | فقط بیعانه، که **دقیقاً برابر کارمزد** است؛ باقی قیمت بیرون از همزیست | کل مبلغ سفارش، و بعد تسویه با فروشنده |
| نتیجه نهایی چیست؟ | تغییر مالک یک رکورد حیوان و افزوده شدن یک دوره به تاریخچه مالکیت | تحویل کالا و تسویه پول |
| اگر معامله شکست بخورد؟ | حیوان به وضعیت قبلی برمی‌گردد و بیعانه طبق سیاست نسخه‌دار برمی‌گردد | زیرسفارش لغو یا مرجوع می‌شود و ledger تعدیل می‌خورد |

یکی کردن این دو یعنی یک جدول «سفارش» که نیمی از ستون‌هایش همیشه NULL است و یک `order_item` که گاهی موجودی دارد و گاهی مالکیت منتقل می‌کند. قرارداد اجرا این را صریح ممنوع کرده است («animal sale و merchandise commerce جدول/فرایند مشترک جعلی نداشته باشند»).

### مرز قطعی

- **آگهی حیوان SKU نیست.** هیچ آگهی حیوانی در جدول‌های `product`/`offer`/`sku`/`inventory` ظاهر نمی‌شود، سبد خرید نمی‌پذیردش، و در checkout کالا شرکت نمی‌کند.
- **سفارش کالا مالکیت منتقل نمی‌کند.** هیچ مسیر کدی از context کالا به `animals.owner_account_id` یا به تاریخچه مالکیت نمی‌نویسد. تنها نویسنده مجاز، مسیر انتقال مالکیت PROMPT-007 است.
- دو context هیچ جدول مشترک تازه‌ای نمی‌سازند. اشتراکشان فقط از راه **contextهای مشترک موجود** است (حساب، KYC، پرداخت، فایل، اعلان، audit، تنظیمات) و از راه **رویدادهای یکپارچه‌سازی** بخش ۵.

### دو واقعیت مخزن که برنامه فاز ۳ را شکل می‌دهند

۱. **«میکروچیپ ثبت‌شده» یعنی سطر جدول `microchip`، نه فیلد `animals.declared_microchip_number`.** فیلد دوم عمداً فقط یک خوداظهاری است و در همان schema نوشته شده که «هیچ‌وقت چیپ را به حیوان گره نمی‌زند». شرط انتشار آگهی (PRODUCT_DECISIONS §۳) باید از جدول `microchip` خوانده شود.

۲. **تاریخچه مالکیت حیوان هنوز وجود ندارد.** امروز فقط ستون `animals.owner_account_id` هست و هیچ جدول دوره مالکیت در schema نیست. قول «تاریخچه مالک قبلی حذف نمی‌شود» یعنی PROMPT-007 باید جدول دوره مالکیت را **بسازد** و انتقال را در همان تراکنش در آن ثبت کند؛ این کار از قبل انجام‌شده فرض نمی‌شود.

---

## ۲. ANIMAL_MARKETPLACE

### Aggregateها

| Aggregate | ریشه | درون مرز | ثابت‌هایی که در تراکنش حفظ می‌شوند |
|---|---|---|---|
| **Listing** (آگهی) | `animal_listing` | نسخه‌های ویرایش، رسانه‌ها، روش‌های تحویل اعلام‌شده، وضعیت انتشار | برای هر حیوان حداکثر **یک** آگهی فعال؛ انتشار فقط با میکروچیپ ثبت‌شده و حداقل سه تصویر؛ گونه باید فعال باشد؛ `RESERVED` فقط از راه بیعانه تأییدشده |
| **Inquiry** (درخواست خرید) | `listing_inquiry` | پیشنهادهای قیمت، رشته گفت‌وگو و پیام‌ها، مهلت پرداخت | برای هر آگهی حداکثر **یک** درخواست در وضعیت `ACCEPTED`؛ قیمت نهایی پس از قفل شدن تغییرناپذیر است |
| **Reservation/Deposit** (رزرو و بیعانه) | `listing_reservation` | batch پرداخت بیعانه، snapshot کارمزد، لغو، جریمه | رزرو فقط از `verifyAttempt` سرور ساخته می‌شود؛ برای هر آگهی حداکثر **یک** رزرو فعال (unique partial index) |
| **Dispute** (اختلاف) | `listing_dispute` | شواهد، رأی، اثر مالی | دامنه داوری فقط بیعانه، صحت اطلاعات ثبت‌شده و انجام تحویل |
| **Handover** (تحویل و انتقال) | `listing_handover` | کد یک‌بارمصرف، تأیید دوطرفه، صورت‌جلسه | کد فقط یک بار مصرف می‌شود؛ انتقال مالکیت و بستن آگهی و ثبت تاریخچه در **یک** تراکنش |

### مالکیت داده و پول

- این context مالک وضعیت آگهی، مذاکره، رزرو و اثر بیعانه است.
- **مالک رکورد حیوان نیست.** فقط در لحظه تحویل، از راه یک API مشخص در `src/animals`، مالکیت را عوض می‌کند و تاریخچه مالک قبلی حذف نمی‌شود.
- **مالک پول نیست.** مبلغ از `src/billing/payments.ts` می‌آید؛ این context فقط یک `PaymentService` تازه (`ANIMAL_DEPOSIT`) و یک effect در `src/billing/effects.ts` اضافه می‌کند.
- باقی قیمت هرگز وارد همزیست نمی‌شود و هیچ جدولی آن را به‌عنوان طلب/بدهی ثبت نمی‌کند.

### مرزهای شکست

| شکست | رفتار |
|---|---|
| درگاه در دسترس نیست | آگهی و درخواست دست‌نخورده؛ هیچ رزروی ساخته نمی‌شود |
| دو خریدار هم‌زمان بیعانه می‌دهند | فقط یکی رزرو می‌سازد (unique index)؛ دومی خطای `conflict` می‌گیرد و پولش بازمی‌گردد |
| مهلت پرداخت می‌گذرد | رزرو آزاد و سایر درخواست‌ها دوباره باز می‌شوند؛ نیازمند اجرای زمان‌بند است، نه خواندن صفحه |
| حیوان در فاصله مذاکره مرده یا منتقل شده | eligibility در لحظه پذیرش و در لحظه انتقال دوباره خوانده می‌شود و مسیر بسته می‌شود |
| ارسال اعلان شکست می‌خورد | تراکنش دامنه برنمی‌گردد؛ پیام در outbox می‌ماند و retry می‌شود |

---

## ۳. COMMERCE

### Aggregateها

| Aggregate | ریشه | درون مرز | ثابت‌ها |
|---|---|---|---|
| **Seller** (فروشنده/tenant) | `seller` | مدارک، آدرس، شبا، قرارداد نسخه‌دار، پلن، نقش‌های همین فروشگاه | نقش فروشنده فقط به tenant خودش محدود است؛ خود همزیست یک tenant عادی است |
| **Catalog** | `base_product` و `seller_product` | offerها، variant/SKU، تصاویر، دسته و نوع حیوان | هر SKU قیمت و موجودی مستقل دارد؛ offer بدون محصول پایه معتبر نیست |
| **Inventory** | `sku` + `inventory_ledger` | رزرو موجودی، آزادسازی، کسر | موجودی فقط از راه ledger تغییر می‌کند؛ oversell با شرط نسخه‌ای یا قفل ردیف بسته است |
| **Order** | `order` (سفارش مادر) | `suborder` به ازای هر فروشنده، `order_item`، snapshot ارسال و تخفیف | یک پرداخت، چند زیرسفارش؛ هر زیرسفارش چرخه مستقل دارد |
| **Fulfilment** | `suborder` | shipment، کد رهگیری، تحویل، مرجوعی، شواهد | مهلت پذیرش زیرسفارش، لغو و بازپرداخت خودکار پس از انقضا |
| **Ledger/Settlement** | `ledger_entry`، `settlement_batch` | مبلغ در انتظار/قابل تسویه/بدهی/جریمه/تعدیل، شماره پیگیری بانکی | انتقال آزاد پول بین کاربران وجود ندارد؛ مبلغ مورد اختلاف تسویه نمی‌شود |

### مالکیت داده و پول

- این context **مالک پول سفارش** است: دریافت به نام همزیست، تخصیص در سطح `order_item` و `suborder`، و تسویه دوره‌ای.
- مالک موجودی و قیمت کالاست.
- مالک هیچ رکورد حیوانی نیست و هیچ‌گاه نمی‌شود.

### مرزهای شکست

| شکست | رفتار |
|---|---|
| پرداخت تأیید نشد | رزرو موجودی آزاد می‌شود؛ هیچ زیرسفارشی ساخته نمی‌شود |
| یکی از فروشنده‌ها در لحظه پرداخت موجودی ندارد | checkout پیش از شروع پرداخت رد می‌شود؛ هیچ سفارش ناقصی ساخته نمی‌شود |
| فروشنده زیرسفارش را در مهلت نمی‌پذیرد | همان زیرسفارش لغو و بازپرداخت می‌شود؛ بقیه سفارش دست‌نخورده می‌ماند |
| تسویه بانکی انجام نشد | batch در وضعیت ناتمام می‌ماند و مبلغ `available` نمی‌شود؛ هیچ موفقیت جعلی ثبت نمی‌شود |
| ارائه‌دهنده ارسال پیکربندی نشده | وضعیت `NOT_CONFIGURED` گزارش می‌شود و مسیر بسته می‌ماند |

---

## ۴. آنچه بازاستفاده می‌شود، و نقطه توسعه هرکدام

هیچ‌یک از موارد زیر دوباره ساخته نمی‌شود. ستون سوم تنها تغییری است که فاز ۳ اجازه دارد بدهد.

| قابلیت | ماژول موجود (بررسی‌شده روی HEAD) | نقطه توسعه فاز ۳ |
|---|---|---|
| احراز هویت KYC | `src/identity/kyc.ts` — `findCase`، `canRegisterAnimal`، وضعیت‌های `DRAFT` تا `APPROVED` | فقط **خوانده** می‌شود: شرط «درخواست خرید فقط پس از KYC» و «فروشنده KYCشده» |
| عضویت معتبر انجمن | `src/billing/membership.ts` — `hasValidMembership(db, accountId, now)`، `membershipStanding` | فقط خوانده می‌شود در eligibility ثبت آگهی؛ هیچ نسخه دوم از قاعده عضویت نوشته نمی‌شود |
| حیوان ثبت‌شده، مالکیت، میکروچیپ | `src/animals/service.ts` — `findAnimal`، `requireOwnedAnimal`؛ جدول `microchip` در `src/db/schema/clinical.ts` با دو unique index (یک چیپ برای هر حیوان، یک حیوان برای هر شماره) و بدون مسیر update؛ `src/domain/microchip.ts` — `assertMicrochipNumber`، `normalizeMicrochipNumber` | خوانده می‌شود برای eligibility؛ **یک** تابع تازه انتقال مالکیت در همین ماژول اضافه می‌شود تا نویسنده مالکیت یک‌جا بماند |
| چرخه حیات کنل | `src/kennels/service.ts` — `kennelOfOwner`، `requireOwnKennel`، `KENNEL_STATUS_FA`، `reviewKennel` | فقط خوانده می‌شود: «کنل فعال و تأییدشده» به‌عنوان نوع فروشنده حیوان |
| رسانه خصوصی و سیاست فایل | `src/files/storage.ts` — `putPrivateFile`/`readPrivateFile`/`deletePrivateFile`؛ `src/files/signature.ts` — `PURPOSE_RULES`، `assertAcceptable`؛ `app/api/files/[id]/route.ts` | فقط **purposeهای تازه** به `file_purpose` و `PURPOSE_RULES` و `FILE_REVIEWERS` اضافه می‌شود؛ هیچ مسیر سرو تازه‌ای ساخته نمی‌شود |
| انتشار عمومی تصویر | `src/media/public-image.ts` و `app/media/[id]/route.ts` (تصویر فقط تا وقتی رکوردش دیدنی است) | آگهی حیوان و تصویر کالا از همین قاعده استفاده می‌کنند |
| پرداخت، تأیید سروری و idempotency | `src/billing/payments.ts` — `createBatch` (قیمت از منبع معتبر سرور)، `startAttempt`، `verifyAttempt` (بررسی مبلغ، `payment_callbacks` با unique روی provider+externalRef، `performed:false` برای callback تکراری)، `cancelAttempt` | مقدارهای تازه `PaymentService` و caseهای تازه در `src/billing/effects.ts`. **هیچ مسیر پرداخت دومی ساخته نمی‌شود** |
| قیمت‌گذاری قابل ممیزی | `BatchItemInput` با `settingKey` یا `clubRuleVersionId`؛ `payment_item.price_source` | یک شکل سوم برای کارمزد محاسبه‌شده حیوان (ثابت + درصد قیمت نهایی) که همان‌جا snapshot می‌شود |
| تنظیمات مدیریت‌شده و نسخه‌دار | `src/settings/service.ts` — `readMoney`/`readInt`/`readText`، `snapshotSetting`، `updateSetting`، `unconfiguredKeys`؛ `settingSource` با `OPERATIONAL_DATA` | گروه‌های تازه در `settingGroup` و کلیدهای تازه در `src/settings/keys.ts`، همه **بدون مقدار اولیه** |
| اعلان پایدار | `src/notifications/service.ts` و `outbox.ts` (صف در تراکنش، claim با skip locked، backoff، SUPPRESSED، requeue) و `templates.ts` (`TEMPLATE_VERSION`) | فقط قالب‌های تازه در فهرست نسخه‌دار؛ موتور دست نمی‌خورد |
| نقش‌ها و مجوز سمت سرور | `src/authz/actor.ts` (contexts و roles)، `routes.ts` (جدول مسیر، طولانی‌ترین prefix)، `policy.ts` (گروه تنظیمات و فایل)، `guard.ts` | contextها و roleهای عملیاتی تازه و ردیف‌های تازه جدول مسیر. مجوز رکورد-به-رکورد همچنان در سرویس هر aggregate |
| نقش محدود به tenant | `src/clubs/model.ts` — الگوی `CLUB_ROLES`/`CLUB_CAPABILITIES`/`clubRoleAllows` | **الگو** برای نقش‌های `seller` (OWNER/ADMIN/STAFF) تکرار می‌شود، نه جدول کلاب |
| audit | `src/audit/service.ts` — `recordAudit` با `redact` | فقط رویدادهای تازه؛ همان جدول |
| گزارش و moderation | `src/moderation/service.ts` و `reportTargetKind` | مقادیر تازه `report_target_kind` برای آگهی حیوان، محصول و نقد |
| تبلیغ | `src/advertising/service.ts` — پلن، اشتراک، `promotedTargetIds`، فعال‌سازی از پرداخت | نوع هدف تازه برای آگهی حیوان و کالا؛ برچسب و جدایی از رتبه طبیعی حفظ می‌شود |
| جست‌وجوی عمومی | `src/search/service.ts` — `globalSearch` | بخش‌های تازه به همان پاسخ اضافه می‌شوند؛ جست‌وجوی تخصصی هر بازار صفحه خودش را دارد |
| CI | `.github/workflows/ci.yml` (چهار job، بدون secret، `APP_ENV=development` و `INTEGRATION_MODE=local`) | سوییت‌های تازه به همین jobها اضافه می‌شوند |
| Runner فاز | `tools/runner.mjs` | ورودی `'3'` اضافه شد (DEC-0203) |

---

## ۵. رویدادهای یکپارچه‌سازی

«رویداد» اینجا یعنی یک فراخوانی مشخص و یک‌طرفه بین مرزها، نه یک صف پیام تازه. همه‌شان داخل تراکنش صاحب رویداد اجرا می‌شوند مگر جایی که خلافش نوشته شده.

| رویداد | از | به | اثر |
|---|---|---|---|
| `AnimalDepositVerified` | BILLING | ANIMAL_MARKETPLACE | ساخت رزرو، `RESERVED` شدن آگهی، بستن سایر درخواست‌ها |
| `AnimalHandoverCompleted` | ANIMAL_MARKETPLACE | ANIMALS | انتقال مالکیت و افزودن دوره به تاریخچه مالکیت |
| `AnimalListingPublished` و `AnimalListingClosed` | ANIMAL_MARKETPLACE | SEARCH، ADVERTISING | ورود و خروج از نتایج عمومی |
| `OrderPaymentVerified` | BILLING | COMMERCE | ساخت زیرسفارش‌ها، کسر قطعی موجودی، ثبت `pending` در ledger |
| `SuborderDelivered` به‌علاوه پایان مهلت اعتراض | COMMERCE | LEDGER | `pending` به `available` |
| `SettlementBatchPaid` | LEDGER | COMMERCE | ثبت شماره پیگیری بانکی دستی؛ هیچ موفقیت خودکاری ادعا نمی‌شود |
| اعلان هر دو بازار | هر دو context | NOTIFICATIONS | صف شدن پیام در تراکنش، ارسال بیرون از آن |
| ممیزی هر دو بازار | هر دو context | AUDIT | همان تراکنش |

هیچ رویدادی در جهت عکس تعریف نمی‌شود: COMMERCE هرگز به ANIMAL_MARKETPLACE نمی‌نویسد و برعکس.

---

## ۶. برنامه migration

شماره‌ها پیوسته از `0041` ادامه می‌یابند (آخرین موجود: `0040_notification-outbox.sql`). همه افزودنی‌اند؛ هیچ drop یا rename روی جدول‌های فازهای قبل انجام نمی‌شود، مطابق [recovery-and-rollback.md](../ops/recovery-and-rollback.md).

| فایل | Prompt | محتوا |
|---|---|---|
| `0041_marketplace-foundations` | 002 | گروه‌های تنظیمات تازه، contextها و roleهای عملیاتی تازه، feature flag و kill switch هر جریان، فعال‌سازی گونه |
| `0042_animal-listing` | 003 | `animal_listing`، نسخه ویرایش، رسانه، روش‌های تحویل؛ unique partial index «یک آگهی فعال به ازای هر حیوان» |
| `0043_animal-discovery` | 004 | ایندکس فیلترها، هدف گزارش آگهی، هدف تبلیغ آگهی |
| `0044_animal-inquiry` | 005 | `listing_inquiry`، پیشنهاد قیمت، رشته و پیام گفت‌وگو، مهلت؛ unique partial index «یک درخواست پذیرفته‌شده» |
| `0045_animal-deposit` | 006 | `listing_reservation` با unique partial index، snapshot کارمزد، لغو، `listing_dispute`، جریمه و محدودیت |
| `0046_animal-handover` | 007 | `listing_handover`، کد یک‌بارمصرف، تأیید دوطرفه، صورت‌جلسه، دوره مالکیت |
| `0047_commerce-seller` | 008 | `seller`، نقش‌های فروشگاه، مدرک، قرارداد نسخه‌دار، پلن و تاریخچه، حساب بانکی |
| `0048_commerce-catalog` | 009 | `base_product`، `seller_product`، `offer`، `sku`، `inventory_ledger`، دسته و نوع حیوان |
| `0049_commerce-order` | 010 | `cart`، `order`، `suborder`، `order_item`، پیوند به `payment_batch` |
| `0050_shipping-ledger` | 011 | روش و منطقه ارسال، `shipment`، مرجوعی و شواهد، `ledger_entry`، `settlement_batch` |
| `0051_trust-growth` | 012 | نقد تأییدشده، پرسش عمومی، wishlist، compare، follow، price alert، loyalty، promotion |
| `0052_operations-analytics` | 013 | توان‌های نقش عملیاتی، تجمیع‌های analytics، export، سوابق rate limit و anti-fraud |

قواعد ثابت هر migration: هیچ تعرفه واقعی seed نمی‌شود؛ `setting_source` برای مقدار واقعی `OPERATIONAL_DATA` است تا پیش‌فرض فنی بعداً به‌عنوان سیاست تأییدشده گزارش نشود؛ هر جدول پولی ستون snapshot و نسخه دارد.

## ۷. برنامه API و مسیر

مسیرهای تازه، همه پشت `src/authz/routes.ts`:

| پیشوند | دسترسی | Prompt |
|---|---|---|
| `/animals-market` (فهرست و جزئیات عمومی آگهی) | PUBLIC | 004 |
| `/account/listings` و زیرمسیرهایش | PUBLIC_APP | 003 تا 007 |
| `/account/inquiries` و `/account/reservations` | PUBLIC_APP | 005 و 006 |
| `/shop` (کاتالوگ، محصول، فروشنده) | PUBLIC | 009 |
| `/cart`، `/checkout`، `/account/orders` | PUBLIC_APP | 010 |
| `/seller/...` (داشبورد tenant) | context فروشنده | 008 تا 012 |
| `/admin/marketplace/...`، `/admin/commerce/...`، `/admin/settlement/...` | نقش‌های عملیاتی تازه | 002، 011، 013 |

API عمومی تازه‌ای باز نمی‌شود مگر همان مسیرهای فایل و media موجود. هر عمل نویسنده یک server action است و مجوزش در سرویس همان aggregate بررسی می‌شود، نه در مسیر.

## ۸. برنامه تست

تمرکز روی همان چهار ریسکی که `.claude/rules/quality.md` می‌خواهد — ماندگاری، پرداخت، مجوز، نسخه‌بندی — و نه تکرار پوشش موجود.

| لایه | سوییت‌های تازه (نمونه) | چه چیزی را می‌سنجد |
|---|---|---|
| `tests/domain/` | `animal-listing-model`، `deposit-fee`، `order-allocation`، `seller-capability` | قواعد خالص: انتقال‌های مجاز وضعیت، فرمول کارمزد، تخصیص مبلغ به item، توان هر نقش فروشگاه |
| `tests/db/` | `animal-listing`، `animal-reservation`، `animal-handover`، `commerce-seller`، `commerce-inventory`، `commerce-order`، `commerce-ledger` | هم‌زمانی دو خریدار، عدم oversell، idempotency پرداخت، جدایی tenant، بازخوانی eligibility در تراکنش نهایی |
| `tests/browser/` | `animal-market`، `shop-checkout`، `seller-dashboard` | RTL، دسترس‌پذیری کیبورد، حالت‌های خالی و خطا، نبود نشت داده بین فروشندگان |
| ارتقا | افزودن رکوردهای نماینده فاز ۳ به `tools/upgrade-check.mjs` | اینکه migrationهای فاز ۳ روی دیتابیس دارای داده فازهای قبل چیزی را خراب نمی‌کنند |

آزمون‌های منفی اجباری هر Prompt: دسترسی رد شده، callback تکراری، نسخه کهنه تنظیمات، مهلت گذشته، و مالک اشتباه.

## ۹. نگاشت نیازمندی به Prompt

| نیازمندی | Prompt | context |
|---|---|---|
| R1 معماری و سازگاری | 001 | هر دو |
| R2 فروشنده و eligibility حیوان | 002، 003 | ANIMAL_MARKETPLACE |
| R3 آگهی حیوان | 003، 004 | ANIMAL_MARKETPLACE |
| R4 مذاکره و رزرو | 005 | ANIMAL_MARKETPLACE |
| R5 بیعانه و اختلاف | 006 | ANIMAL_MARKETPLACE و BILLING |
| R6 تحویل و انتقال مالکیت | 007 | ANIMAL_MARKETPLACE و ANIMALS |
| R7 فروشنده کالا | 008 | COMMERCE |
| R8 کاتالوگ و موجودی | 009 | COMMERCE |
| R9 سبد و سفارش | 010 | COMMERCE و BILLING |
| R10 ارسال و مرجوعی | 011 | COMMERCE |
| R11 ledger و تسویه | 011 | COMMERCE |
| R12 کشف، اعتماد و رشد | 004، 012 | هر دو |
| R13 عملیات و امنیت | 002، 013 | هر دو |
| R14 کیفیت و تحویل | 001، 014 | هر دو |

## ۱۰. آنچه این سند تصمیم نمی‌گیرد

مقدارهای واقعی — درصد و ثابت کارمزد، مهلت‌ها، جریمه‌ها، دوره تسویه، سیاست مرجوعی، متن قرارداد فروشنده و فهرست گونه‌های قانونی — داده عملیاتی‌اند. اینجا فقط **کلید و ساختار** تعریف می‌شود؛ مقدار را سوپرادمین وارد می‌کند و تا آن لحظه مسیرِ وابسته بسته و `NOT_CONFIGURED` است.
