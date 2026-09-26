# فاز ۴ — context جفت‌یابی (MATING_FINDER)، مرزها، بازاستفاده و برنامه اجرا

این سند خروجی معماری PHASE-4 PROMPT-001 است. سه کار دارد: (۱) ثبت اینکه کدام قول فاز ۱ تا ۳ که فاز ۴ به آن تکیه می‌کند **واقعاً در سرویس، مجوز و تست** وجود دارد — نه فقط در نام جدول؛ (۲) تعریف bounded context `MATING_FINDER`، aggregateها، ثابت‌ها و یکپارچه‌سازی‌ها؛ (۳) برنامه migration/API/UI/تست و نگاشت نیازمندی به Prompt که Promptهای ۰۰۲ تا ۰۰۸ روی آن اجرا می‌شوند.

مبنای واقعی: HEAD مخزن `13fd64f95c84e6321b4ba41d93a4c5117cadd608` — همان HEAD بررسی‌شده بسته فاز ۴. delta صفر است. اعداد دروازه‌ها در [phase-4-baseline.md](../qa/phase-4-baseline.md). تصمیم فنی این سند: DEC-0217.

منبع محصول: `Hamzist-Phase-4-Mating-Finder-Prompt-Package/PRODUCT_DECISIONS.md` (از این پس «PD §n») و `REQUIREMENTS.md` (R1–R14). این سند هیچ تصمیم محصولی تازه نمی‌گیرد؛ هر جا منبع ساکت است و پاسخ روی eligibility، حق مشاهده، ظرفیت، پول یا متن حقوقی اثر دارد، `PRODUCT_DECISION_OPEN` ثبت شده است (بخش ۱۳).

---

## ۱. قول‌های فازهای قبل — تأییدشده روی کد

روش: برای هر قول، سرویس، محل enforce مجوز و تست ردیابی شد. «تأیید» یعنی سرویس با مجوز سمت سرور و تست وجود دارد؛ «با هشدار» یعنی هست ولی فاز ۴ نباید چیزی بیش از آنچه نوشته شده فرض کند؛ «وجود ندارد» یعنی فاز ۴ باید بسازد.

| قول | جای واقعی در کد | وضعیت |
|---|---|---|
| حساب و KYC | `src/identity/kyc.ts` — شش وضعیت، `findCase`، `canRegisterAnimal` (`status === 'APPROVED'`)، `reviewKyc` فقط `ASSOCIATION_OPERATOR`؛ یک پرونده برای هر حساب (`kyc_case_account_key`). تست: `tests/db/identity.test.ts` | تأیید — **هشدار:** تابع عمومی `isKycApproved` نیست (چهار caller شرط را inline تکرار می‌کنند) و KYC تأییدشده هیچ مسیر ابطال/انقضا ندارد |
| OTP | `src/identity/otp.ts` — `requestOtp`/`verifyOtp`، hash نمک‌دار، مقایسه constant-time، مصرف یک‌باره با update شرطی، ۱۲۰ ثانیه، ۵ تلاش و قفل ۱۵ دقیقه، سقف ارسال ساعتی. تست: `tests/db/identity.test.ts`، `tests/db/security.test.ts` | با هشدار — `otp_purpose` فقط `LOGIN`، `MOBILE_CHANGE`؛ `verifyOtp` خودش purpose را نمی‌سنجد (caller می‌سنجد)؛ متن پیامک «کد ورود» برای همه purposeها hard-code است؛ سقف ساعتی مشترک بین purposeها |
| حیوان، مالکیت، وضعیت | `src/animals/service.ts` — `requireOwnedAnimal` (NOT_FOUND برای «مال تو نیست» و «نیست»)، `registerAnimal` نام/نژاد/جنس/تولد را الزامی می‌کند؛ `animal_status = DRAFT \| REGISTERED \| ARCHIVED`. تست: `tests/db/animals.test.ts` | با هشدار — **زنده/فوت/مفقود وجود ندارد** (`listing-eligibility.ts` صریحاً: «Death is not a state of the animal record»)؛ هیچ کدی `ARCHIVED` را ست نمی‌کند؛ **فیلد عقیم‌سازی/باروری روی حیوان نیست** |
| انتقال مالکیت و تاریخچه | جدول `animal_ownership_transfer` (`schema/handover.ts`)، `completeHandover` خصوصی از `confirmHandover`/`recordHandoverByAdmin`، بازخوانی eligibility و چیپ داخل تراکنش، `ownershipHistory`. تست: `tests/db/animal-handover.test.ts` | با هشدار — رویداد انتقال است نه دوره؛ فقط `MARKETPLACE_SALE \| ADMIN_CORRECTION`؛ **هیچ event bus یا hook نیست**: context دیگری از انتقال باخبر نمی‌شود مگر هنگام خواندن مالکیت را دوباره بسنجد |
| میکروچیپ رسمی | جدول `microchip` با unique روی `animal_id` و `number`، درج فقط از `bind()` در `src/clinical/microchip.ts` توسط `TRUSTED_VET` در ویزیت باز؛ `chipOfAnimal`. تست: `tests/db/microchip.test.ts` | تأیید — «رسمی» یعنی **وجود سطر `microchip`**؛ `animals.declared_microchip_number` خوداظهاری است و هرگز کافی نیست؛ تابع mask چیپ وجود ندارد (`redact` کلید را کامل حذف می‌کند، `maskTail` فقط برای موبایل استفاده شده) |
| طبقه‌بندی گونه/نژاد | `species`، `reference_breed` (`isActive`، `mergedIntoBreedId`)، `markBreedDuplicate`؛ کلید گونه به‌ازای بازار در `marketplace_species` (`speciesEnabled`) | با هشدار — تابع «هویت نژاد» نیست؛ نژاد ادغام‌شده روی حیوان باقی می‌ماند، پس مقایسه هم‌نژادی باید `mergedIntoBreedId` را resolve کند؛ `marketplace_market` فقط `ANIMAL_SALE \| MERCHANDISE` |
| شجره و lineage | `animals.sireAnimalId`/`damAnimalId` فقط از `applyLineage`؛ `wouldCreateCycle` در `src/domain/lineage.ts` (BFS رو به بالا، سقف عمق ۶۴)؛ `familyOf` فقط والد و فرزند مستقیم. تست: `tests/domain/lineage.test.ts`، `tests/db/animals.test.ts` | با هشدار — **هیچ تابع خویشاوندی، جد مشترک یا هم‌نیایی نیست**؛ حیوان G0 و شجره خارجی هیچ جدی در سامانه ندارد، پس «نبود خویشاوندی» برای آن‌ها قابل اثبات نیست |
| کنل | `src/kennels/service.ts` — شش وضعیت، `reviewKennel` فقط `ASSOCIATION_OPERATOR`. تست: `tests/db/kennel.test.ts` | با هشدار — `kennelOfOwner` هر وضعیت زنده را برمی‌گرداند (caller باید `APPROVED` را بسنجد)؛ **حیوان مالک-کنل ندارد**؛ «کنل» صفت حساب مالک است و فقط از «حساب یک کنل `APPROVED` دارد» تشخیص داده می‌شود |
| عضویت و تأیید پرداخت | `src/billing/payments.ts` — `createBatch` (قیمت سمت سرور با `price_source`)، `startAttempt`، `verifyAttempt` (مبلغ ریالی، unique `payment_callback(provider, external_ref)`، update شرطی `PENDING`، `effects.onPaid` داخل همان تراکنش)؛ `src/billing/membership.ts` دوره‌دار با `periodStart` پشته‌ای. تست: `tests/db/payments.test.ts`، `tests/db/membership-period.test.ts` | تأیید — **هشدار:** `startAttempt` فقط batch `PAID` را رد می‌کند و ممکن است برای batch در انتظار، تلاش دوم ساخته شود (بخش ۱۲)؛ **عدم هم‌پوشانی دوره فقط در کد برنامه** است (هیچ `EXCLUDE`)؛ الگوی «plan نسخه‌دار + ظرفیت» فقط در `src/commerce/plans.ts` هست و خودش نقص دارد (بخش ۱۲) |
| رسانه خصوصی | `src/files/storage.ts` (`putPrivateFile` با sha256 و audit)، `signature.ts` (`PURPOSE_RULES`، mime از بایت، MP4 تا ۲۰MB فقط برای ویدئوی آگهی)، `app/api/files/[id]/route.ts`، `canReadFile` در `src/authz/policy.ts`؛ سرو عمومی از `app/media/[id]/route.ts` با بازسنجی visibility در هر درخواست. تست: `tests/db/files.test.ts`، `tests/db/public-image.test.ts` | با هشدار — **rendition وجود ندارد**: نسخه عمومی همان بایت اصلی است (بدون resize یا حذف EXIF)؛ ویدئو byte-range ندارد؛ purpose تازه یعنی `ALTER TYPE file_purpose` |
| چت/پیام | فقط thread مخصوص آگهی: `listing_inquiry`، `inquiry_message` (append-only، پیوست خصوصی، `applyContactPolicy`، مخفی‌سازی)، `inquiry_block` به‌ازای thread؛ `threadRole`. تست: `tests/db/market-inquiry.test.ts` | **generic نیست** — FKها به آگهی و وضعیت معامله گره خورده‌اند؛ پیام rate-limit ندارد؛ block کاربر-به-کاربر وجود ندارد |
| outbox اعلان | `createNotification` → `enqueueDeliveries` در تراکنش دامنه؛ `deliveryKey` یکتا؛ `runOutbox` با `for update skip locked` و **lease** (رفع race فاز ۳، `b035d35`)؛ backoff؛ `SUPPRESSED`؛ `NOTIFICATION_TEMPLATES`/`IN_APP_ONLY_KINDS`. تست: `tests/db/notification-outbox.test.ts` (سه worker هم‌زمان، یک ارسال) | تأیید — **هشدار:** dedupe به‌ازای notification است نه رویداد دامنه؛ ترجیحات اعلان وجود ندارد؛ `resume.entity.type` union بسته است |
| audit | `recordAudit(tx, actor, event)` با `redact` روی before/after/metadata (نه `reason`)؛ `auditTrail` | تأیید |
| تنظیمات و نسخه‌بندی | `src/settings/service.ts` — `readMoney` (NOT_CONFIGURED، هرگز ۰)، `readInt`، `snapshotSetting`، `updateSetting` با `expectedVersion` و audit؛ چهار `setting_source`؛ تاریخچه از audit (`settingHistory`)؛ کلید قطع `market.flag.*` با «تنظیم‌نشده = بسته» | با هشدار — **scope فقط `GLOBAL`** است (هیچ تنظیم به‌ازای نژاد)؛ هیچ `effective_from`؛ ruleهای نسخه‌دار (`animal_commission_rule`، `club_rule_version`، `seller_plan`) الگوی «انتشار = اثر فوری» دارند |
| نقش و قابلیت | `src/authz/actor.ts` (۱۵ نقش)، `routes.ts` (طولانی‌ترین prefix، مسیر ثبت‌نشده بسته)، الگوی capability فاز ۳ در `src/marketplace/model.ts` (`assertMarketplaceCapability`) | تأیید |
| مجوز رسمی جفت‌گیری | `src/mating/permits.ts` — `startPermit` (KYC + عضویت + شجره، جنس مخالف، مالک متفاوت)، `confirmCounterparty`، `saveAllocationRule`، پرداخت، `submitPermit`، `reviewPermit` فقط `ASSOCIATION_OPERATOR`؛ `permitForParty` فقط دو طرف. تست: `tests/db/permit.test.ts`، `tests/browser/permit.test.ts` | با هشدار — «یک پرونده باز برای هر جفت» check-then-insert است و **unique index ندارد** (race)؛ هم‌نژادی، `REGISTERED` و چیپ را نمی‌سنجد (بخش ۱۲) |
| تاریخ جفت‌گیری append-only | `mating_date_declaration` — `PROPOSED \| CONFIRMED \| SUPERSEDED \| CONFLICTED`، `declareDate`، `confirmDate` (فقط طرف مقابل، نسخه مشخص، guard روی id+version+PROPOSED)، `declareDifferentDate`؛ `latestConfirmedDateOfAnimal`. تست: `tests/db/dates.test.ts` | تأیید — **فقط به permit `ISSUED` گره خورده** (`permitId NOT NULL`)؛ projection ذخیره‌شده نیست؛ race روی `nextVersion` خطای خام DB می‌دهد |
| cooldown | `src/domain/calendar.ts` `cooldownWindow`؛ `cooldown.male_days = 14`، `cooldown.female_months = 6` (`BREEDING_POLICY`)؛ `cooldownAdvisoryForAnimals` همیشه `canContinue: true`. تست: `tests/domain/cooldown.test.ts`، `tests/db/dates.test.ts` | تأیید — فقط هشدار و فقط از تاریخ رسمی `CONFIRMED`؛ گروه `BREEDING_POLICY` برای هیچ نقشی قابل نوشتن نیست |
| آبستنی، زایمان، litter، تخصیص، Puppy Card | `src/mating/{pregnancy,birth,allocation}.ts`؛ همه جدول‌های `schema/breeding.ts` با **`permitId NOT NULL`** و `requireIssuedPermit`. تست: `tests/db/birth.test.ts`، `tests/db/allocation.test.ts` | تأیید برای مسیر رسمی — **به مسیر شخصی وصل‌شدنی نیست** و نباید باشد (`tests/db/allocation.test.ts` همین را می‌سنجد) |
| توافق شخصی (legacy) | `personal_declaration` + `personal_note` (`UNVERIFIED`)؛ `startDeclaration`، `respondToDeclaration` (بدون OTP)؛ هیچ اثری روی lineage/cooldown/timeline ندارد. تست: `tests/db/declaration.test.ts` | تأیید — این همان «legacy شخصی» است که فاز ۴ **هرگز** به تأیید دوطرفه ارتقا نمی‌دهد |
| moderation | گزارش با FK نوع‌دار (`reportTargetKind`)، تصمیم، appeal؛ `reportInquiryMessage` با rate-limit. تست: `tests/db/moderation.test.ts` | با هشدار — **صف با assignment نیست**، جدول شاهد خصوصی عمومی نیست (فقط `dispute_evidence`)، **block کاربر-به-کاربر و تعلیق حساب سرویس ندارند** (`DISABLED` در enum هست ولی هیچ کدی ستش نمی‌کند) |
| rate limit و redaction | `src/security/rate-limit.ts` (`consume`، `assertWithinLimit`، شمارنده بادوام؛ actionها enum بسته)؛ `src/security/redaction.ts` (`redact`، `redactText`، `maskTail`) | تأیید |
| PDF | `src/documents/render.ts` (Playwright/Chromium)؛ مسیر `app/api/documents/[kind]/[id]/pdf` با بررسی مالکیت | با هشدار — PDF از داده زنده روی درخواست رندر می‌شود و **هیچ فایل یا hash ذخیره نمی‌شود**؛ Playwright فقط devDependency است |
| زمان‌بند | — | **وجود ندارد.** `runOutbox` و `releaseExpiredInquiries` فقط از تست صدا زده می‌شوند؛ بقیه مهلت‌ها lazy هنگام خواندن |
| مکان | `residence` حساب (استان/شهر متن آزاد، `geoLat`/`geoLng` اختیاری)، کنل با lat/lng؛ `distanceKm` در `src/domain/referral.ts` | با هشدار — **حیوان مکان ندارد**؛ جدول‌های `province`/`city` مختصات ندارند |

### آنچه فاز ۴ نباید موجود فرض کند

۱. **فوت، مفقودی و archive حیوان رویداد یا وضعیت ندارند.** R13 و PD §۱۱ می‌خواهند این‌ها درخواست‌های باز را ببندند؛ PROMPT-003 باید ثبت اظهاری auditپذیر آن را بسازد (بخش ۹).
۲. **وضعیت باروری روی حیوان نیست.** PD §۳ اظهار مالک را کافی می‌داند؛ PROMPT-003 جدول append-only اظهار می‌سازد و هرگز آن را «تأیید دامپزشکی» نمی‌نامد.
۳. **خویشاوندی محاسبه نمی‌شود.** PROMPT-004 walk جد مشترک را روی `sireAnimalId`/`damAnimalId` می‌سازد؛ نبود داده = «ناشناخته»، نه «امن».
۴. **چت عمومی، block کاربر و تعلیق حساب وجود ندارند.** PROMPT-005 و ۰۰۷ می‌سازند؛ thread آگهی بازاستفاده نمی‌شود (FKهایش به آگهی است)، ولی **سیاست‌ها و توابعش** بازاستفاده می‌شوند.
۵. **تاریخ جفت‌گیری و زنجیره breeding فقط رسمی‌اند.** مسیر شخصی جدول تاریخ خودش را می‌گیرد؛ زنجیره آبستنی/زایمان/Puppy Card به آن وصل نمی‌شود.
۶. **هیچ زمان‌بندی نیست.** هر مهلت فاز ۴ (انقضای درخواست ۷روزه، انقضای اشتراک، انقضای OTP) یا lazy هنگام خواندن enforce می‌شود یا تابع sweep دارد که operator صدا می‌زند؛ «باز کردن صفحه» معیار صحت نیست.
۷. **تنظیمات به‌ازای نژاد وجود ندارد.** ruleهای سن/cooldown/خویشاوندی نژاد جدول نسخه‌دار خودشان را می‌گیرند، نه scope در settings.
۸. **rendition تصویر وجود ندارد.** «فقط rendition مجاز عمومی شود» (PD §۶) یعنی PROMPT-003 باید یا rendition واقعی بسازد یا صریحاً ثبت کند که نسخه عمومی همان فایل تأییدشده است؛ حذف EXIF/مختصات GPS از تصویر عمومی امنیتی است و جزو حداقل است.

---

## ۲. چرا یک context تازه

جفت‌یابی نه آگهی فروش است نه مجوز رسمی:

| پرسش | ANIMAL_MARKETPLACE (فاز ۳) | OFFICIAL_MATING (فاز ۱) | MATING_FINDER (فاز ۴) |
|---|---|---|---|
| موضوع | فروش یک حیوان | صدور مجوز انجمن برای یک جفت مشخص | کشف جفت، درخواست، قرارداد و ثبت رویداد |
| پول همزیست | بیعانه = کارمزد | هزینه مجوز | **فقط اشتراک**؛ مبلغ توافق جفت‌گیری هرگز وارد همزیست نمی‌شود |
| نتیجه | انتقال مالکیت | permit صادرشده و زنجیره breeding | قرارداد تأییدشده و یکی از دو مسیر پایین‌دستی |
| مرجع رسمی | ندارد | انجمن | ندارد؛ مسیر رسمی را **صدا می‌زند**، جایش را نمی‌گیرد |

### مرز قطعی

- **قرارداد فاز ۴ permit نیست و permit صادر نمی‌کند.** مسیر رسمی از `startPermit`/`confirmCounterparty`/پرداخت/بررسی انجمن موجود عبور می‌کند و هیچ‌کدام را دور نمی‌زند.
- **مسیر شخصی هیچ اثر رسمی ندارد:** نه شماره مجوز، نه تأیید انجمن، نه تخصیص رسمی، نه Puppy Card، نه تغییر lineage.
- **`personal_declaration` legacy دست‌نخورده می‌ماند** و هرگز به «دوطرفه تأییدشده» ارتقا نمی‌یابد. رکورد شخصی قراردادمحور فاز ۴ جدول جداست.
- **هیچ جدول پرداخت، escrow، wallet یا refund برای قرارداد جفت‌گیری** ساخته نمی‌شود. تنها `PaymentService` تازه، اشتراک است.
- **آخرین جفت‌گیری فیلد دستی نیست.** projection است و تنها نویسنده‌اش تراکنش تأیید دوطرفه تاریخ (یا تابع rebuild) است.
- **حیوان تکراری، چیپ تکراری، چت عمومی دوم، موتور اعلان دوم، مسیر پرداخت دوم** ساخته نمی‌شود.

---

## ۳. Aggregateهای MATING_FINDER

| Aggregate | ریشه (پیشنهادی) | درون مرز | ثابت‌های تراکنشی | Prompt |
|---|---|---|---|---|
| **FinderPlan** | `finder_plan_version` | نوع (`OWNER` \| `KENNEL`)، مدت (۱/۳/۶/۱۲ ماه)، ظرفیت حیوان فعال، قیمت (nullable)، پنجره فعال‌سازی، سیاست تعلیق، وضعیت `DRAFT \| PUBLISHED \| ARCHIVED` | برای هر (نوع، مدت) حداکثر **یک** نسخه `PUBLISHED` (partial unique)؛ نسخه منتشرشده تغییرناپذیر است؛ قیمت null = خرید بسته با دلیل operator | 002 |
| **FinderSubscription** | `finder_subscription_period` | snapshot کامل نسخه plan، batch پرداخت، شروع/پایان، وضعیت | ساخته‌شدن فقط از effect `verifyAttempt`؛ یک `PENDING_PAYMENT` برای هر حساب (partial unique)؛ دوره‌ها هم‌پوشان نیستند: تمدید روی پایان دوره زنده پشته می‌شود و activation زیر قفل ردیف حساب (`for update`) انجام می‌شود؛ unique روی `payment_batch_id` | 002 |
| **FinderRuleSet** | `finder_breed_rule_version` | (گونه، نژاد nullable = پیش‌فرض گونه، جنس)، حداقل/حداکثر سن، cooldown نر/ماده، حالت cooldown (`WARN \| BLOCK`)، آستانه خویشاوندی، حالت خویشاوندی (`WARN \| BLOCK`)، متن هشدار | یک نسخه `PUBLISHED` برای هر کلید (partial unique)؛ هر درخواست/ارزیابی شناسه نسخه را snapshot می‌کند؛ پیش‌فرض تأییدشده: نر ۱۴ روز، ماده ۶ ماه، `WARN` | 002 |
| **MatingProfile** | `mating_profile` (یکی برای هر حیوان) | availability، مالک در لحظه فعال‌سازی، رسانه‌های انتخابی و اصلی، ترجیحات، اظهار باروری، version | فعال‌سازی فقط با eligibility کامل (بخش ۵)؛ شمارش ظرفیت و فعال‌سازی **در یک تراکنش** زیر قفل ردیف حساب؛ `ownerAccountIdAtActivation ≠ animals.ownerAccountId` یعنی غیرفعال؛ هیچ ستون «آخرین جفت‌گیری» ندارد | 003 |
| **LastMatingProjection** | `animal_last_mating` (یکی برای هر حیوان) | تاریخ، منبع (`OFFICIAL` \| `FINDER_PERSONAL`)، شناسه رویداد منبع، شمارنده‌های عمومی | فقط از داخل تراکنش تأیید دوطرفه تاریخ یا `rebuildLastMating` نوشته می‌شود؛ **هیچ command عمومی** ندارد؛ هر دو حیوان در یک تراکنش؛ rebuild از منابع همان نتیجه را می‌دهد | 003 (read model)، 006 (نویسنده) |
| **MatingRequest** | `mating_request` | دو حیوان/مالک، snapshot نژاد و نسخه rule و نتیجه سازگاری، مسیر مقصود (`OFFICIAL` \| `PERSONAL`)، بازه، شهر/نوع محل، پیام، نوع توافق مالی، شروط، انقضا، تاریخچه وضعیت با دلیل | ده وضعیت PD §۸؛ optimistic version؛ تک‌برنده: ورود به `CONTRACT_DRAFTING` برای هر دو حیوان یک ردیف در `mating_coordination` با **unique partial index روی `animal_id` where active** می‌نویسد — تراکنش دوم خطای unique می‌گیرد و `conflict` برمی‌گردد | 005 |
| **Conversation** | `finder_conversation` + `finder_message` | پیام append-only، پیوست خصوصی، گزارش، پنهان‌سازی | فقط پس از `PRELIMINARILY_ACCEPTED` باز؛ فقط دو طرف (و نقش پشتیبانی با گزارش مشخص) می‌خوانند؛ سیاست تماس `applyContactPolicy`/`redactText` تا قرارداد + رضایت دوطرفه | 005 |
| **MatingContract** | `finder_contract` + `finder_contract_version` + `finder_contract_approval` | template و clauseهای نسخه‌دار، snapshot طرفین/حیوانات/مسیر/بازه/محل، hash محتوا، تأییدهای OTP، PDF snapshot خصوصی، لغو | هر ویرایش نسخه تازه؛ تأیید به **(version، contentHash)** گره خورده و تأیید نسخه قبلی برای نسخه تازه بی‌اثر؛ unique (version، party)؛ قرارداد وقتی `CONFIRMED` است که دو تأیید روی **همان** نسخه باشد؛ PDF فایل خصوصی با sha256 ذخیره‌شده و تغییرناپذیر | 005 |
| **FinderHandoff** | `finder_handoff` | پیوند یکتای قرارداد به `mating_permit` یا `finder_personal_mating` | unique روی `contract_id`؛ ساخت permit idempotent (retry permit یا پرداخت تکراری نمی‌سازد)؛ مسیر و پیوند تغییرناپذیر مگر قرارداد لغو و نسخه تازه تأیید شود | 006 |
| **PersonalMating** | `finder_personal_mating` + `finder_personal_mating_date` | رویداد شخصی قراردادمحور و پروتکل تاریخ همان شکل رسمی | بدون شماره مجوز/انجمن/Puppy Card؛ تاریخ append-only؛ `CONFIRMED` فقط با تأیید همان نسخه توسط طرف مقابل | 006 |

---

## ۴. ماتریس دسترسی و اشتراک (PD §۲ — enforce در query، نه UI)

تعریف: «مالک مشترک» یعنی حسابی که در لحظه ارزیابی یک `finder_subscription_period` با وضعیت `ACTIVE` و `startsAt ≤ now < endsAt` دارد. این پرسش یک تابع سرور است (`hasFinderSubscription(db, accountId, now)`)، نه ستون ذخیره‌شده، تا انقضا بدون زمان‌بند درست باشد.

| بیننده ↓ / پروفایل → | پروفایل فعال مالک **مشترک** | پروفایل فعال مالک **رایگان** |
|---|---|---|
| ناشناس یا کاربر رایگان | می‌بیند | **نمی‌بیند** (نه در فهرست، نه جزئیات؛ پاسخ NOT_FOUND برای ضد-enumeration) |
| کاربر مشترک | می‌بیند | می‌بیند |
| مالک خود حیوان | می‌بیند | می‌بیند |

- **شکل‌گیری درخواست:** هر دو مالک KYC `APPROVED` و **حداقل یکی** مشترک فعال در لحظه ارسال. رایگان→مشترک مجاز؛ رایگان→رایگان رد (و اصلاً قابل مشاهده نیست).
- **ظرفیت:** تعداد پروفایل‌های غیر-`INACTIVE` یک حساب ≤ ظرفیت. ظرفیت رایگان یک کلید تنظیم؛ ظرفیت مشترک از snapshot دوره فعال؛ کنل از plan کنل. تا کلید/plan تنظیم نشده، ظرفیت `NOT_CONFIGURED` = فعال‌سازی بسته (PD §۲: «ظرفیت‌های مورد انتظار فقط پس از فعال‌سازی مدیریت‌شده»).
- **انقضای اشتراک:** درخواست و قرارداد در جریان باطل نمی‌شوند؛ فعال‌سازی تازه و درخواست تازه بسته می‌شوند. پروفایل‌های بیش از ظرفیت رایگان از دید عمومی حذف می‌شوند (visibility در query دوباره محاسبه می‌شود) ولی داده‌شان حذف نمی‌شود — انتخاب اینکه کدام پروفایل در ظرفیت رایگان باقی بماند با مالک است: `PRODUCT_DECISION_OPEN` (بخش ۱۳).
- **رتبه‌بندی:** اشتراک فقط دسترسی است و در امتیاز سازگاری هیچ جمله‌ای ندارد (PD §۷).

---

## ۵. eligibility پروفایل (PD §۳، R4)

یک تابع خالص `profileEligibility(facts)` در `src/domain/` و یک loader سرور که facts را **در همان تراکنش فعال‌سازی** می‌خواند:

| شرط | منبع واقعی |
|---|---|
| مالک فعلی | `animals.ownerAccountId === actor.accountId` (از `requireOwnedAnimal`) |
| KYC مالک | `kyc_case.status === 'APPROVED'` — تابع مشترک `isKycApproved` در `src/identity/kyc.ts` (استخراج شرطی که چهار جا inline است؛ رفتار عوض نمی‌شود) |
| ثبت‌شده و فعال | `animals.status === 'REGISTERED'` و نبود رویداد فوت/مفقودی/archive (بخش ۹) |
| گونه باز | کلید گونه جفت‌یابی (`DOG` در عرضه اولیه) |
| میکروچیپ رسمی | وجود سطر `microchip` برای حیوان — **نه** `declared_microchip_number` |
| نژاد، جنس، تولد | ستون‌های حیوان غیر null |
| غیرعقیم | آخرین اظهار باروری مالک = `NOT_STERILIZED` (append-only، audit) |
| تصاویر پایه | حداقل یک تصویر «تمام‌بدن» و یک «صورت» روی پروفایل |

شجره **شرط نیست**؛ فقط امتیاز کامل‌بودن است. مسیر رسمی در PROMPT-006 شجره را دوباره از قواعد موجود permit می‌سنجد.

---

## ۶. ارزیابی سازگاری (PD §۴ و §۷، R6)

تابع خالص و قطعی `evaluateCompatibility(a, b, ruleSnapshot, now)` در `src/domain/finder-compatibility.ts`:

- **blockerهای ساختاری:** خود-جفت، گونه متفاوت، نژاد متفاوت پس از resolve `mergedIntoBreedId`، جنس یکسان. این‌ها در query کشف هم فیلتر می‌شوند؛ ارزیاب فقط تضمین دوم است.
- **سن:** بیرون از بازه rule → blocker برای درخواست (پروفایل دیده می‌شود، دلیل نمایش داده می‌شود). rule تنظیم‌نشده → بخش ۱۳.
- **خویشاوندی:** walk جد مشترک روی `sireAnimalId`/`damAnimalId` با عمق محدود و مقاوم در برابر حلقه (همان سقف `MAX_ANCESTRY_DEPTH`)؛ خروجی درجه نزدیک‌ترین خویشاوندی (والد/فرزند، خواهر/برادر تنی و ناتنی، درجات دورتر تا آستانه). حیوان بدون جد ثبت‌شده → `UNKNOWN` با توضیح، **هرگز** «بی‌خطر». پیش‌فرض `WARN`؛ `BLOCK` فقط با rule نسخه‌دار نژاد.
- **cooldown:** از projection آخرین جفت‌گیری؛ پیش‌فرض `WARN`؛ `BLOCK` فقط با rule.
- **فاصله:** فقط وقتی هر دو طرف مختصات امن دارند (residence/کنل) با `distanceKm` موجود؛ مختصات دقیق هرگز در خروجی نمی‌آید؛ در غیر این صورت فقط استان/شهر.
- **خروجی:** `{score, positives[], warnings[], unknowns[], blockers[], ruleVersionIds}` به‌علاوه جمله ثابت «این امتیاز تضمین باروری، آبستنی، سلامت یا کیفیت توله نیست». اشتراک در امتیاز نیست.

---

## ۷. آخرین جفت‌گیری — projection مشتق (PD §۵ و §۱۰، R5)

- **منابع معتبر:** (الف) `mating_date_declaration.status = 'CONFIRMED'` مسیر رسمی — همان ردیف‌هایی که امروز `latestConfirmedDateOfAnimal` می‌خواند؛ (ب) `finder_personal_mating_date.status = 'CONFIRMED'` مسیر شخصی قراردادمحور فاز ۴.
- **هرگز منبع نیستند:** `PROPOSED`، `CONFLICTED`، `SUPERSEDED`، نسخه کهنه، `personal_declaration` و `personal_note` legacy (`UNVERIFIED`).
- **جدیدترین برنده است:** `max(matedOn)` روی هر دو منبع برای هر حیوان؛ tie-break قطعی با `confirmedAt` سپس شناسه منبع.
- **نوشتن:** تأیید دوطرفه تاریخ در همان تراکنش، projection **هر دو حیوان** را upsert می‌کند (قفل ردیف projection به ترتیب شناسه برای جلوگیری از deadlock). تأیید در مسیر رسمی امروز این کار را نمی‌کند؛ PROMPT-006 یک فراخوانی به `confirmDate` اضافه می‌کند — تنها تغییر در `src/mating/dates.ts`.
- **rebuild:** `rebuildLastMating(db, animalId?)` همان جدول را از منابع می‌سازد؛ تست برابری rebuild با مسیر افزایشی اجباری است.
- **نمایش:** «۱۲ خرداد ۱۴۰۵ – ۱۰۵ روز قبل» با `src/domain/calendar.ts` موجود؛ نبود سابقه: «سابقه جفت‌گیری تأییدشده ثبت نشده». آمار عمومی: تعداد جفت‌گیری تأییدشده، زایمان و توله ثبت‌شده — **هرگز** نام یا شناسه جفت قبلی.
- **cooldown** از همین projection و rule نسخه‌دار نژاد محاسبه می‌شود؛ `cooldownAdvisoryForAnimals` مسیر رسمی دست‌نخورده می‌ماند و در PROMPT-006 به همین projection منتقل می‌شود تا دو منبع حقیقت نباشد.

---

## ۸. هم‌زمانی تک‌برنده (PD §۸، R7)

| نقطه رقابت | سازوکار |
|---|---|
| دو مالک هم‌زمان دو درخواست متفاوت را برای یک حیوان وارد قرارداد می‌کنند | `mating_coordination(animal_id, request_id, active)` با unique partial index روی `animal_id` where `active`؛ هر ورود دو ردیف (هر دو حیوان) در یک تراکنش؛ خطای unique از `violates()` موجود (`src/db/constraint.ts`) به `conflict` ترجمه می‌شود |
| دو کلیک روی یک command | optimistic `version` روی `mating_request` و `finder_contract` (الگوی موجود `.where(id, version)` + `!row → conflict`) |
| دو تأیید OTP هم‌زمان روی یک نسخه قرارداد | unique `(contract_version_id, party)`؛ تأیید نهایی با update شرطی روی `status = 'AWAITING_CONFIRMATION' AND version = ?` |
| فعال‌سازی هم‌زمان دو پروفایل در مرز ظرفیت | `select ... from account where id = ? for update` (الگوی `src/vets/*-application.ts`) سپس شمارش و درج |
| دو callback پرداخت اشتراک | `verifyAttempt` موجود + unique `payment_batch_id` روی دوره + قفل ردیف حساب در activation |
| لغو معتبر | ردیف `mating_coordination` غیرفعال و availability در همان تراکنش برمی‌گردد؛ درخواست‌های متوقف‌شده خودکار دوباره فعال **نمی‌شوند** بلکه قابل ازسرگیری‌اند |

---

## ۹. یکپارچه‌سازی با contextهای موجود

همه جهت‌دار و از راه تابع صریح؛ event bus ساخته نمی‌شود (وجود ندارد و لازم نیست). هر جا context دیگر باید از تغییری باخبر شود و hook ندارد، **فاز ۴ هنگام خواندن و در تراکنش‌های نویسنده دوباره می‌سنجد** و یک تابع reconciliation برای operator دارد (PROMPT-007).

| context | فاز ۴ چه می‌خواند/صدا می‌زند | نقطه توسعه مجاز |
|---|---|---|
| IDENTITY | `kyc_case`، `residence` (استان/شهر، مختصات اختیاری)، OTP | `isKycApproved` (استخراج)؛ مقدار تازه `otp_purpose = 'FINDER_CONTRACT'`؛ متن پیامک OTP بر اساس purpose (رفع hard-code) و سقف ساعتی جدا برای این purpose |
| ANIMAL | `animals`، `microchip`، `reference_breed`، lineage، `animal_ownership_transfer` | جدول‌های تازه `animal_fertility_declaration` و `animal_life_event` (فوت/مفقودی/یافته‌شدن/archive اظهاری و auditپذیر)؛ **هیچ ستون موجود بازنویسی نمی‌شود** |
| BILLING | `createBatch`، `startAttempt`، `verifyAttempt` | `PaymentService = 'MATING_FINDER_SUBSCRIPTION'` + case در `src/billing/effects.ts` + برچسب در `receipts.ts` |
| MESSAGING | سیاست‌های `applyContactPolicy`، `redactText`، `putPrivateFile`، `assertWithinLimit` | جدول‌های تازه گفت‌وگوی جفت‌یابی؛ `file_purpose = 'FINDER_MESSAGE_ATTACHMENT'`؛ rate-limit action `FINDER_MESSAGE_POST` و `FINDER_REQUEST_CREATE` |
| NOTIFICATIONS | `createNotification` در تراکنش دامنه، `runOutbox` با lease | kindهای `FINDER_*` در `NOTIFICATION_TEMPLATES`؛ نوع‌های تازه `resume.entity` |
| OFFICIAL_MATING | `startPermit`، `confirmCounterparty`، پرداخت و بررسی permit، `mating_date_declaration` | handoff فقط از راه همین توابع؛ **یک** تغییر در `confirmDate` برای به‌روزکردن projection؛ unique partial index «یک permit زنده برای هر جفت» (بخش ۱۲) |
| PERSONAL_MATING (legacy) | `personal_declaration` فقط خواندنی | هیچ؛ جدول شخصی قراردادمحور جداست |
| BREEDING | زنجیره آبستنی/زایمان/litter/Puppy Card | هیچ برای مسیر شخصی؛ در مسیر رسمی بی‌تغییر reuse؛ شمارنده‌های عمومی زایمان/توله از همین جدول‌ها و بدون افشای جفت |
| MODERATION | الگوی گزارش نوع‌دار و appeal | `reportTargetKind` تازه (`MATING_PROFILE`، `FINDER_MESSAGE`، `FINDER_CONTRACT`)؛ جدول block کاربر؛ تعلیق Finder برای حساب |
| SETTINGS / AUTHZ / AUDIT | `readInt`/`snapshotSetting`/`updateSetting`، `recordAudit`، `routes.ts` | گروه تنظیم `MATING_FINDER` و کلیدهای قطع `finder.flag.*` (تنظیم‌نشده = بسته)؛ capabilityهای Finder به الگوی `CAPABILITIES` فاز ۳ |
| MEDIA | `putPrivateFile`، `attachPublicImage`، `app/media/[id]` | purposeهای `MATING_PROFILE_IMAGE`، `MATING_PROFILE_VIDEO`؛ بازسنجی visibility پروفایل در سرو؛ حذف EXIF پیش از عمومی‌کردن |
| DOCUMENTS | `renderDocumentPdf` | PDF قرارداد **یک بار** در لحظه تأیید دوطرفه تولید و به‌صورت فایل خصوصی با sha256 ذخیره می‌شود؛ دانلود از فایل ذخیره‌شده، نه رندر دوباره |

### کلیدهای قطع (R2)

`finder.flag.discovery`، `finder.flag.free_pool_visibility`، `finder.flag.subscription_purchase`، `finder.flag.requests`، `finder.flag.chat`، `finder.flag.contracts`، `finder.flag.official_handoff`، `finder.flag.personal_handoff`، `finder.flag.notifications` — BOOL، `OPERATIONAL_DATA`، **تنظیم‌نشده = بسته** (همان معنای `market.flag.*`). بستن یک کلید مسیر تازه را می‌بندد، ولی خواندن سابقه، قرارداد تأییدشده و دانلود PDF آن را نمی‌بندد.

---

## ۱۰. ثابت‌های فاز ۴

- **I1** هیچ حیوانی بدون اقدام مالک در Finder ظاهر نمی‌شود؛ ارتقا هیچ `mating_profile` نمی‌سازد.
- **I2** هیچ حسابی بدون `verifyAttempt` موفق مشترک نمی‌شود؛ ارتقا هیچ `finder_subscription_period` نمی‌سازد.
- **I3** فقط هم‌نژاد (پس از resolve ادغام) و جنس مخالف؛ هم در query و هم در ارزیاب.
- **I4** visibility مشترک/رایگان در query سرور؛ پاسخ به پروفایل نادیدنی NOT_FOUND است.
- **I5** شکل‌گیری درخواست: KYC هر دو + حداقل یک اشتراک فعال.
- **I6** برای هر حیوان حداکثر یک هماهنگی قرارداد فعال (unique partial index).
- **I7** تأیید قرارداد به (نسخه، hash) گره خورده؛ ویرایش تأیید قبلی را بی‌اثر می‌کند؛ OTP یک‌بارمصرف و purpose-bound.
- **I8** قرارداد جفت‌گیری هیچ ردیف پرداخت ندارد.
- **I9** هر قرارداد حداکثر یک handoff؛ permit تکراری یا پرداخت تکراری از retry ساخته نمی‌شود.
- **I10** آخرین جفت‌گیری فقط از رویداد دوطرفه `CONFIRMED`؛ هیچ endpoint نوشتن مستقیم؛ rebuildپذیر.
- **I11** مسیر شخصی هیچ اثر رسمی (permit، انجمن، Puppy Card، lineage) ندارد.
- **I12** شماره کامل چیپ، آدرس دقیق، تماس، OTP و متن خصوصی در کارت عمومی، export، analytics و log نمی‌آیند.
- **I13** snapshotها (plan، rule، سازگاری، قرارداد) با تغییر تنظیمات بازنویسی نمی‌شوند.
- **I14** انتقال مالکیت پروفایل را فوراً غیرفعال می‌کند؛ فوت/مفقودی/archive درخواست‌های باز را با دلیل می‌بندد؛ قرارداد و سابقه حذف نمی‌شوند.

---

## ۱۱. ارتقای افزودنی

- همه migrationها `0053` به بعد، فقط `CREATE TABLE`، `CREATE INDEX` و `ALTER TYPE ... ADD VALUE`؛ هیچ `DROP`، هیچ `ALTER COLUMN` روی جدول موجود، هیچ backfill که داده دامنه بسازد.
- **هیچ حیوانی خودکار منتشر نمی‌شود:** جدول `mating_profile` خالی شروع می‌شود.
- **هیچ حسابی خودکار مشترک نمی‌شود:** جدول دوره خالی؛ هیچ plan با قیمت seed نمی‌شود.
- **هیچ تاریخ یک‌طرفه legacy تأیید نمی‌شود:** projection با `rebuildLastMating` فقط از ردیف‌های `CONFIRMED` رسمی موجود پر می‌شود — این backfill فقط **خواندن حقیقت موجود** است و تست ارتقا باید ثابت کند `PROPOSED`/`CONFLICTED`/`SUPERSEDED` و `personal_declaration`/`personal_note` در آن اثری ندارند.
- **کلیدهای قطع تنظیم‌نشده‌اند** پس پس از ارتقا همه مسیرهای Finder بسته‌اند تا superadmin صریحاً باز کند.
- `tools/upgrade-check.mjs` امروز در گام فاز ۳ همه migrationهای `> 0040` را اعمال می‌کند؛ با ورود اولین migration فاز ۴ آن گام بی‌مرز می‌شود. PROMPT-002 ثابت `LAST_PHASE_3 = '0052'` را اضافه می‌کند و PROMPT-008 گام فاز ۴ را با رکوردهای نماینده می‌سازد.

---

## ۱۲. نقص‌های موجود که فاز ۴ به آن‌ها برخورد می‌کند

این‌ها drift گزارش نیستند و در این Prompt رفع نشدند (رفعشان رفتار محصول را تغییر می‌دهد و تست خودش را می‌خواهد)؛ هرکدام به Promptی سپرده شد که از آن عبور می‌کند.

| نقص | شاهد | اثر بر فاز ۴ | Prompt |
|---|---|---|---|
| «یک permit باز برای هر جفت» check-then-insert بدون unique index | `src/mating/permits.ts` (کوئری `live` و سپس insert)؛ `schema/mating.ts` فقط index غیریکتا | handoff رسمی هم‌زمان می‌تواند دو permit بسازد | 006 — unique partial index + ترجمه `violates()` |
| `startAttempt` برای batch در انتظار، تلاش دوم می‌سازد | `src/billing/payments.ts` فقط `PAID` را رد می‌کند | دو پرداخت موفق اشتراک برای یک batch → دو اثر اگر effect خودش guard نکند | 002 — effect اشتراک فقط روی دوره `PENDING_PAYMENT` و با update شرطی؛ تست دو callback |
| ظرفیت plan فروشنده پس از انقضا `null` = نامحدود | `src/commerce/plans.ts`، `src/commerce/inventory.ts` | الگوی plan فروشنده **کپی نمی‌شود**؛ ظرفیت Finder پس از انقضا به ظرفیت رایگان سقوط می‌کند | 002 (طراحی)؛ رفع نقص فاز ۳ خارج از دامنه فاز ۴ و در محدودیت‌ها ثبت می‌شود |
| race در `respondToAllocation` | بررسی پاسخ قبلی بیرون از تراکنش | فقط مسیر رسمی؛ فاز ۴ تغییرش نمی‌دهد | ثبت در محدودیت‌ها |
| `nextVersion = max + 1` در تاریخ رسمی → خطای خام DB در race | `src/mating/dates.ts` | handoff رسمی و تأیید تاریخ هم‌زمان | 006 — ترجمه به `conflict` |
| متن پیامک OTP «کد ورود» برای همه purposeها | `src/identity/otp.ts` | OTP قرارداد متن گمراه‌کننده می‌گرفت | 005 |
| KYC تأییدشده ابطال ندارد | `src/identity/kyc.ts` | eligibility «KYC هر دو» فقط تأیید یک‌باره را می‌سنجد | ثبت در محدودیت‌ها |

---

## ۱۳. تصمیم‌های محصولی باز (`PRODUCT_DECISION_OPEN`)

این‌ها حدس زده نمی‌شوند. رفتار فنی پیش‌فرض همیشه «بسته تا تنظیم» است، که ایمن‌ترین حالت ممکن است و هیچ حقی به کسی نمی‌دهد.

| موضوع | چرا باز است | رفتار تا تصمیم |
|---|---|---|
| قیمت planها | PD §۲: hard-code/seed ممنوع | خرید بسته با دلیل operator |
| ظرفیت رایگان/مشترک/کنل | PD §۲: «مورد انتظار» ۱ و ۳، ولی توسط سوپرادمین فعال می‌شود | فعال‌سازی پروفایل بسته تا ظرفیت تنظیم شود |
| بازه سنی هر نژاد و جنس | PD §۴: از rule نسخه‌دار؛ هیچ عددی در منبع نیست | نژاد بدون rule منتشرشده: پروفایل دیده می‌شود ولی **درخواست بسته** با دلیل «قاعده سنی این نژاد تنظیم نشده است» |
| آستانه خویشاوندی و ممنوعیت نژادی | PD §۴: سوپرادمین تعیین می‌کند | فقط `WARN` با درجه تشخیص‌داده‌شده |
| متن حقوقی بندهای قرارداد | PD §۹ و R9؛ تأیید حقوقی لازم | template بدون متن منتشرشده = ساخت قرارداد بسته؛ عنوان تأیید «تأیید دوطرفه با کد یک‌بارمصرف» و **نه** «امضای قانونی» |
| کدام پروفایل‌ها پس از انقضای اشتراک در ظرفیت رایگان می‌مانند | منبع ساکت است | هیچ‌کدام خودکار انتخاب نمی‌شود؛ همه از دید عمومی تا انتخاب مالک خارج‌اند (visibility محاسبه‌ای؛ هیچ حذف داده) |
| سیاست نگهداری داده چت/قرارداد | R8 retention، منبع عدد نمی‌دهد | کلید `OPERATIONAL_DATA` تنظیم‌نشده = هیچ حذف خودکار |

نکته درباره OTP قرارداد: قاعده فاز ۱ «بدون digital signature gate» و توضیح schema (`otp_purpose`: «§20 forbids minting a new OTP to sign an agreement») درباره `personal_declaration` و گردش‌های فاز ۱ است و دست‌نخورده می‌ماند. PD §۹ فاز ۴ صریحاً تأیید OTP دوطرفه را برای **قرارداد جفت‌یابی** می‌خواهد؛ این یک purpose جدا و محدود به همین aggregate است، هیچ گردش فاز ۱ را gate نمی‌کند و نام «امضا» نمی‌گیرد (DEC-0217).

---

## ۱۴. برنامه migration

شماره‌ها پیشنهادی‌اند؛ نام جدول و ستون در Prompt سازنده نهایی می‌شود.

| # | Prompt | محتوا |
|---|---|---|
| 0053 | 002 | enumهای Finder؛ `ALTER TYPE payment_service ADD VALUE 'MATING_FINDER_SUBSCRIPTION'`؛ گروه تنظیم `MATING_FINDER`؛ capabilityها/نقش‌های عملیاتی لازم؛ `finder_plan_version` (partial unique یک PUBLISHED برای هر نوع+مدت)؛ `finder_subscription_period` (partial unique یک PENDING برای هر حساب، unique batch)؛ `finder_breed_rule_version` |
| 0054 | 003 | `animal_fertility_declaration`، `animal_life_event`؛ `mating_profile` (unique `animal_id`)، `mating_profile_media`؛ `animal_last_mating`؛ `ALTER TYPE file_purpose` برای تصویر/ویدئوی پروفایل |
| 0055 | 004 | `finder_favorite` (unique حساب+پروفایل)، `finder_saved_search`، `finder_match_notice` (dedupe: unique جست‌وجو+پروفایل)؛ indexهای کشف (گونه، نژاد، جنس، استان، availability) |
| 0056 | 005 | `mating_request` + `mating_request_event`؛ `mating_coordination` (unique partial روی `animal_id` where active)؛ `finder_conversation`، `finder_message`؛ `finder_contract_template_version`، `finder_contract_clause_version`، `finder_contract`، `finder_contract_version`، `finder_contract_approval` (unique نسخه+طرف)؛ `ALTER TYPE otp_purpose ADD VALUE 'FINDER_CONTRACT'`؛ purpose فایل پیوست و PDF قرارداد؛ actionهای rate-limit |
| 0057 | 006 | `finder_handoff` (unique `contract_id`)؛ `finder_personal_mating`، `finder_personal_mating_date` (unique mating+version)؛ unique partial index «یک permit زنده برای هر sire+dam» روی `mating_permit` — پیش از آن بررسی می‌شود که داده موجود ناقضش نیست و اگر هست migration با پیام صریح متوقف می‌شود، نه اینکه داده را دست بزند |
| 0058 | 007 | `finder_user_block` (unique مسدودکننده+مسدودشده)، `finder_access_suspension`، `finder_feedback` (محرمانه)؛ `reportTargetKind`های تازه با ستون و CHECK و partial unique |

---

## ۱۵. برنامه API و مسیر

همه پشت `src/authz/routes.ts`؛ هر عمل نویسنده server action است و مجوزش در سرویس aggregate سنجیده می‌شود.

| پیشوند | دسترسی | Prompt |
|---|---|---|
| `/mating-finder` (کشف، کارت، جزئیات پروفایل) | PUBLIC، visibility در query | 003، 004 |
| `/account/mating-finder/subscription` | PUBLIC_APP | 002 |
| `/account/mating-finder/profiles` | PUBLIC_APP، مالک | 003 |
| `/account/mating-finder/favorites`، `/saved-searches` | PUBLIC_APP | 004 |
| `/account/mating-finder/requests/...` (درخواست، چت، قرارداد، OTP، دانلود PDF) | PUBLIC_APP، فقط دو طرف | 005 |
| `/account/mating-finder/matings/...` (مسیر، تاریخ، تعارض) | PUBLIC_APP، فقط دو طرف | 006 |
| `/admin/mating-finder/...` (plan، rule، ظرفیت، کلید قطع، صف گزارش، تعلیق، funnel) | نقش‌های عملیاتی با capability | 002، 007 |
| `/api/files/[id]` و `/media/[id]` موجود | همان مسیرها با قاعده‌های purpose تازه | 003، 005 |

**هیچ** endpoint یا action برای نوشتن آخرین جفت‌گیری وجود ندارد؛ تست PROMPT-008 نبودش را در جدول مسیر و در actionها می‌سنجد.

## ۱۶. برنامه UI

فارسی، RTL، responsive تا ۳۶۰px، keyboard-accessible و فقط با کامپوننت‌های Design System موجود (`src/ui`). صفحه‌ها: plan و تاریخچه اشتراک و ظرفیت (۰۰۲)؛ مدیریت پروفایل، کارت و جزئیات با آخرین جفت‌گیری و وضعیت اطلاعات (۰۰۳)؛ جست‌وجو، فیلتر، توضیح سازگاری با جمله عدم‌تضمین، علاقه‌مندی و جست‌وجوی ذخیره‌شده (۰۰۴)؛ درخواست، چت، مذاکره، نسخه‌های قرارداد، OTP و دانلود (۰۰۵)؛ مسیر رسمی/شخصی، timeline تاریخ و تعارض (۰۰۶)؛ میز عملیات، گزارش، block و تعلیق (۰۰۷). حالت‌های خالی، خطا، بسته‌بودن کلید قطع و `NOT_CONFIGURED` هرکدام متن صریح دارند.

## ۱۷. برنامه تست

تمرکز روی چهار ریسک `.claude/rules/quality.md`: ماندگاری، پرداخت، مجوز، نسخه‌بندی.

| لایه | سوییت‌ها (نمونه) | چه چیزی را می‌سنجد |
|---|---|---|
| `tests/domain/` | `finder-access`، `finder-eligibility`، `finder-compatibility`، `finder-last-mating`، `finder-request-model`، `finder-contract-model` | ماتریس دسترسی، شروط eligibility، خویشاوندی با حلقه و ناشناخته، انتخاب جدیدترین رویداد و نادیده‌گرفتن وضعیت‌های نامعتبر، انتقال‌های مجاز وضعیت، hash نسخه |
| `tests/db/` | `finder-subscription`، `finder-profile`، `finder-discovery`، `finder-request`، `finder-contract`، `finder-handoff`، `finder-operations` | callback تکراری/مبلغ نادرست/plan کهنه، دوره بدون هم‌پوشانی، ظرفیت هم‌زمان، IDOR، visibility، دو پذیرش هم‌زمان → یک برنده، OTP replay و نسخه کهنه، نبود ردیف پرداخت قرارداد، handoff تکراری → یک permit، اتمیک‌بودن projection دو حیوان، برابری rebuild |
| `tests/browser/` | `mating-finder`، `mating-request`، `mating-operations` | RTL/۳۶۰px، کیبورد، حالت‌های خالی/خطا، نبود نشت تماس/آدرس/چیپ |
| ارتقا | گام فاز ۴ در `tools/upgrade-check.mjs` | هیچ پروفایل/اشتراک ساخته نمی‌شود؛ هیچ تاریخ یک‌طرفه تأیید نمی‌شود؛ داده فاز ۱–۳ سالم |

منفی‌های اجباری هر Prompt: دسترسی رد، callback تکراری، نسخه کهنه، مهلت گذشته، مالک اشتباه، کلید قطع بسته.

## ۱۸. نگاشت نیازمندی به Prompt

| نیازمندی | Prompt اصلی | پذیرش |
|---|---|---|
| R1 سازگاری و مرزبندی | 001 (این سند)، همه | A01 |
| R2 تنظیمات و قواعد نژاد | 002 | A02 |
| R3 اشتراک | 002 | A03 |
| R4 eligibility و visibility | 003 (enforce در query در 004) | A04 |
| R5 آخرین جفت‌گیری | 003 (read model)، 006 (نویسنده) | A05 |
| R6 کشف و سازگاری | 004 | A06 |
| R7 درخواست و هم‌زمانی | 005 | A07 |
| R8 چت و حریم خصوصی | 005، 007 | A07، A11 |
| R9 قرارداد | 005 | A08 |
| R10 دو مسیر | 006 | A09 |
| R11 تاریخ، cooldown، breeding | 006 | A10 |
| R12 عملیات و moderation | 007 | A11 |
| R13 چرخه عمر | 003 (رویدادها)، 007 (reconciliation) | A11 |
| R14 کیفیت و تحویل | 008 | A12 |

نسخه قابل‌خواندن ماشینی این نگاشت در `REQUIREMENTS_TRACEABILITY.md` (بخش فاز ۴) است.

## ۱۹. آنچه این سند تصمیم نمی‌گیرد

قیمت، ظرفیت، بازه سنی، آستانه خویشاوندی، متن حقوقی، سیاست نگهداری، و اینکه قرارداد «امضای قانونی» است یا نه. هیچ رفتار محصولی فاز ۴ در این Prompt ساخته نشده است.
