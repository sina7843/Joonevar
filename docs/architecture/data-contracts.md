# قرارداد داده و مدل دامنه — Phase 1

مبنا: Requirements §۲۳ و §۲۶. این سند مدل اجرایی است؛ نام جدول‌ها در PROMPT-002 نهایی و migration می‌شود.

## ۱. شناسه‌ها — هرگز یکی نمی‌شوند

| شناسه | صاحب | زمان ایجاد | یکتایی | نکته |
|---|---|---|---|---|
| `account_id` | Account | ثبت‌نام | داخلی (uuid) | هرگز به کاربر نمایش داده نمی‌شود |
| `animal_id` | Animal | ایجاد Draft حیوان | داخلی (uuid) | شناسه پرونده |
| `pet_id` | Animal | فقط هنگام صدور برگه ثبتی | سراسری، انسانی‌خوان | **برابر `animal_id` نیست**؛ پیش از صدور `NULL` |
| `microchip_number` | Microchip | خواندن/کاشت فیزیکی | **سراسری در طول عمر** | یک حیوان = حداکثر یک چیپ، برای همیشه |
| `referral_code` | Referral | هنگام ساخت Vet Visit Request، **پیش از نمونه‌گیری** | یکتا، یک‌بارمصرف | QR و ورود دستی = دو نمایش از همین کد |
| `sample_tracking_code` | Sample | **پس از انجام واقعی نمونه‌گیری** | یکتا | Shipment رویداد روی همین کد است، نه کد جدید |
| `pedigree_code` | Pedigree | صدور شجره‌نامه | یکتا | مبنای Resolve حیوان و والدین در G1+ و مجوز |
| `mating_case_id` | MatingCase | ایجاد پرونده جفت‌گیری | داخلی | |
| `birth_id` | BirthEvent | ثبت زایمان | داخلی | **با `litter_id` ادغام نمی‌شود** |
| `litter_id` | Litter | ثبت زایمان | داخلی | گروه توله‌های همان تولد |
| `puppy_card_no` | PuppyCard | صدور کارت | یکتا | با برگه ثبتی و شجره‌نامه یکی نیست |
| `membership_no` | Membership | ممکن است `PENDING` بماند | یکتا در صورت صدور | نبود شماره، خدمات فعال را مسدود نمی‌کند |

**قاعده نمایش:** شناسه‌ها و اعداد در متن فارسی با جداسازی LTR (`dir="ltr"` / `U+2068…U+2069`) نمایش داده می‌شوند تا خوانا بمانند (§۲۴.۳).

## ۲. موجودیت‌ها و فیلدهای لازم فلو

### Identity
- **Account** — `mobile` (تأییدشده، یکتا)، `status`، `display_name?`، `display_name_visible`، `created_at`.
- **Profile** — `first_name`, `last_name`, `national_id` (۱۰ رقم، **یکتا**، پس از تأیید فقط‌خواندنی)، `birth_date`.
- **Residence** — `province`, `city`, `address`, `postal_code?` (در صورت ورود باید معتبر باشد)، `geo_point?`. **گروه اختیاری**؛ خالی‌بودن آن تکمیل حساب، KYC و ثبت حیوان را قفل نمی‌کند.
- **KycCase** — `status ∈ {DRAFT, READY, UNDER_REVIEW, APPROVED, NEEDS_CORRECTION, REJECTED}`، `reason?`، فایل‌های خصوصی. در NEEDS_CORRECTION داده و فایل معتبر قبلی حفظ می‌شود.
- **AccountRole** — `(account_id, role, status, activated_at)`؛ نقش‌ها: `BREEDER`, `TRUSTED_VET`. نقش عملیاتی (`ASSOCIATION_OPERATOR`, `GENETICS_OPERATOR`, `SUPERADMIN`) در همین جدول است ولی **در Role Switcher عمومی ظاهر نمی‌شود** (D10/D11).
- **Session** — توکن، انقضا، `revoked_at`.
- **OtpChallenge** — `purpose ∈ {LOGIN, MOBILE_CHANGE}`، `hash`، `expires_at`، `attempts`، `locked_until`. مقادیر از Product Settings.

### Membership
- **Membership** — `account_id`، `status ∈ {NONE, PAYMENT_PENDING, ACTIVE, INACTIVE}`، `activated_at`، `membership_no?`، `payment_id`.
- **بدون** `expires_at`، بدون job تمدید، بدون یادآور دوره‌ای (D04).
- `INACTIVE` فقط پذیرش کار جدید دامپزشک را متوقف می‌کند (D05)؛ کارهای فعال قبلی ادامه می‌یابند.

### Animals & lineage
- **Animal** — `owner_account_id`، اطلاعات پایه مصوب پروتوتایپ، `sex`, `breed_id`, `generation` (**محاسبه‌شده، فقط‌خواندنی**)، `sire_animal_id?`, `dam_animal_id?`، `origin ∈ {G0, INTERNAL_G1PLUS, FOREIGN_PEDIGREE}`، `status`، `pet_id?`.
- قاعده نسل: `generation(child) = 1 + min(generation(sire), generation(dam))` فقط با Resolve معتبر **هر دو** والد. فقدان واقعی یک والد → `G0` + CTA ثبت والد. خطای فنی Lookup → `LOOKUP_ERROR`، حفظ Draft و نسل فعلی، **تبدیل خودکار به G0 ممنوع**.
- **ForeignPedigreeCase** — دو فایل مستقل (روی برگه، پشت برگه)، `issuer_id?` (از فهرست مرجع انجمن)، `status ∈ {DRAFT, UNDER_REVIEW, APPROVED, NEEDS_CORRECTION, REJECTED}`. صف: **انجمن** (D14). بدون SLA وعده‌داده‌شده.
- **PedigreeIssuerRef** — داده مدیریتی انجمن؛ در شروع خالی.

### Vet operations
- **Vet** — `account_id`, `license_no` (کد نظام دامپزشکی، تأیید مستقل), `approval_status`.
- **VetLocation** — `permit` مستقل، `facilities` (Reader، کاشت، نمونه‌گیری، نگهداری نمونه)، `is_complete`. **Location ناقص وارد Finder نمی‌شود** (D02)؛ هیچ مسیر جزئی جایگزین ساخته نمی‌شود.
- **VetVisitRequest** — **یک رکورد مستقل به ازای هر حیوان**: `animal_id`, `service_type ∈ {IMPLANT, VERIFICATION, DNA_RESAMPLE, PREGNANCY_VERIFY}`, `vet_id`, `location_id`, `status`, `group_id?` (فقط گروه‌بندی نمایشی — **رزرو نیست**), `resume_context`.
- **Referral** — `request_id`, `code`, `expires_at` (**snapshot از تنظیم فعال هنگام صدور**), `status ∈ {ACTIVE, CONSUMED, EXPIRED, CANCELLED, SUPERSEDED}`.

### Microchip & samples
- **Microchip** — `number` **UNIQUE سراسری**، `animal_id` **UNIQUE** (یک چیپ در طول عمر هر حیوان)، `bound_at`, `bound_by_vet_id`, `method ∈ {READER_BT, READER_WIRED, BARCODE, MANUAL}`.
- **MicrochipConflict** — نوع تعارض، هر دو طرف پیوند، زمان. **تعارض مسیر میان‌بر بازنویسی نمی‌سازد**؛ نه انتقال، نه چیپ دوم، نه حذف سابقه.
- **Sample** — `tracking_code`, `animal_id`, `request_id`, `collected_at`, `custodian_vet_id`, `status ∈ {IN_CUSTODY, SHIP_ORDERED, SHIPPED, RECEIVED, INVALID, PROCESSING, RESULT_READY}`. **بدون انقضای خودکار**؛ تصمیم قابلیت استفاده با مرکز ژنتیک است.
- **SampleEvent** — زنجیره Custody شامل `SHIPMENT`. نمونه نامعتبر → Resampling در **همان Request**، کد جدید فقط پس از نمونه‌گیری مجدد، نمونه و کد قبلی در Audit.

### Documents & money
- **Document** — `type ∈ {REGISTRATION_SHEET, PEDIGREE, PUPPY_CARD}`, `animal_id | puppy_id`, `issuance_state`, `payment_item_id`.
- **PaymentBatch** — `service`, `account_id`, `status`, `gateway_ref?`.
- **PaymentItem** — `batch_id`, `target_ref`, `amount_toman` (**snapshot، غیرقابل بازنویسی با تعرفه جدید**), `status`. وضعیت هر قلم و `issuance_state` هر حیوان **جدا نمایش داده می‌شوند**؛ نقص یک قلم صدور اقلام واجد شرایط را متوقف نمی‌کند.
- **PaymentCallback** — UNIQUE `(provider, external_ref)`؛ تضمین idempotency.
- **GeneticsReceipt** — فیش پرداخت مستقیم به مرکز، متصل به `sample_tracking_code`های انتخاب‌شده، `status ∈ {UPLOADED, UNDER_REVIEW, APPROVED, NEEDS_CORRECTION}`.

### Genetics
- **ParentageResult** — `animal_id`, `version`, `status ∈ {PENDING_PARENTS, READY, SUPERSEDED}`, `issued_by_centre`. برای G1+ نتیجه کامل و قابل Resolve **هر دو والد** لازم است؛ نتیجه ناقص هرگز به‌عنوان نهایی ثبت نمی‌شود.
- **پرداخت صدور، شرط پردازش یا نمایش نتیجه نیست** (§۱۴.۲). فقط سند در «در انتظار پرداخت صدور» می‌ماند.
- **ParentageAppeal** — `result_id`, `animal_id`, `text`, `status`, `centre_response?`, `corrected_result_id?` (D19). نتیجه قبلی و ارتباط آن با اعتراض حفظ می‌شود.

### Breeding
- **Kennel** — `account_id`, `name`, `location` (**اجباری برای Submit**), `breeds[]` (**حداقل یک**), `status`. حذف آخرین نژاد مجاز نیست. تغییر نژاد Review یا پرداخت جدید نمی‌سازد ولی Before/After در Audit ثبت می‌شود.
- **MatingPermit / MatingCase** — دو حیوان، دو طرف، `allocation_rule ∈ {FIXED, PERCENT, MIXED}`, پرداخت، `status`. صدور مجوز **پیش از** بارداری و زایمان است.
- **MatingDateDeclaration** — `case_id`, `date`, `declared_by`, `version`, `counterparty_response ∈ {PENDING, CONFIRMED, CONFLICT}`. اصلاح = **نسخه جدید که دوباره برای تأیید ارسال می‌شود**. `CONFIRMED` قبلی حذف نمی‌شود؛ جدیدترین تاریخ دوطرفه CONFIRMED مبنای Cooldown است.
- **PregnancyDeclaration** (کاربر، `UNVERIFIED`) و **VetVerification** (دامپزشک، `VERIFIED_BY_VET`) — **دو رکورد کاملاً مستقل**؛ هیچ‌کدام دیگری را حذف یا بازنویسی نمی‌کند.
- **BirthEvent** — `live_count`, `dead_count` (دو عدد صحیح مستقل ≥ ۰)، نسخه‌دار.
- **Puppy** — فقط برای توله **زنده** در اعلام اولیه ساخته می‌شود. مرگ بعدی = رویداد جدید؛ پروفایل تاریخی حذف نمی‌شود (D18).
- **Allocation** — `puppy_id`, `proposed_owner`, `version`, `approval_a`, `approval_b`. `FINAL` فقط با تأیید **هر دو طرف روی همان نسخه**. تا آن زمان `PENDING_BOTH_OWNERS` و Puppy Card قفل است؛ پرداخت این Gate را دور نمی‌زند.

### Personal declaration
- **PersonalMatingDeclaration** — دو `animal_id` **موجود در دیتابیس** (حیوان دستی پذیرفته نمی‌شود)، موبایل طرف مقابل، `status ∈ {PENDING_COUNTERPARTY_CONFIRMATION, CONFIRMED, REJECTED}`. **بدون پرداخت.** متن/فایل/تصویر/امضای قرارداد ذخیره نمی‌شود. هیچ lineage، مالکیت توله یا Puppy Card از این مسیر ساخته نمی‌شود.

### Shared
- **ProductSetting** — `key`, `scope`, `value`, `valid_from`, `version`, `updated_by`. مقدار فعال با scope حل می‌شود؛ تاریخچه حفظ می‌شود. اشیای ایجادشده مقدار را **snapshot** می‌کنند.
- **AuditEvent** — `actor`, `at`, `target_ref`, `action`, `before`, `after | version`.
- **Notification** — `recipient`, `entity_ref`, `request_ref`, `step`, `origin_route`; هنگام باز شدن **دوباره سمت سرور مجوزسنجی می‌شود**.
- **PostalRequest** — `document_ref`, گیرنده، نشانی، `status = REQUESTED`. **فقط ثبت درخواست** (D17)؛ تأیید ثبت ≠ ارسال واقعی.

## ۳. گذارهای وضعیت درخواست مراجعه

```
DRAFT → ACTIVE ──(اسکن/ورود کد معتبر)──→ CHECKED_IN → IN_PROGRESS → COMPLETED
  │                                            │
  │                                            └─(تعارض نوع خدمت)→ SUPERSEDED  ⟶ Request جدید ACTIVE
  ├─(انقضای مهلت)────→ EXPIRED  ⟶ امکان درخواست کد جدید با ارزیابی مجدد صلاحیت
  └─(لغو کاربر)──────→ CANCELLED
```

شروط پذیرش کد در Check-in، همه در **یک تراکنش**: کد به همین `animal_id` تعلق دارد ∧ Request فعال است ∧ `vet_id` و `location_id` منطبق‌اند ∧ `now() < expires_at` ∧ `consumed_at IS NULL`. هر شکست، پیام خطای مستقل خودش را دارد و **هرگز به پذیرش حیوان دیگر منتهی نمی‌شود**.

`SUPERSEDED` فقط درخواست **همان حیوان** را جایگزین می‌کند؛ درخواست سایر حیوان‌های گروه دست‌نخورده می‌مانند.

## ۴. جدول Eligibility (پیاده‌سازی §۵ + ماتریس Flow `2:6`)

هر قفل **سه جزء اجباری** برمی‌گرداند: `reason`, `nextPrerequisite`, `cta`.

| سرویس | پیش از KYC | پس از KYC، بدون عضویت | عضو فعال بدون برگه ثبتی | ≥ یک برگه ثبتی | ≥ یک شجره‌نامه |
|---|---|---|---|---|---|
| ثبت حیوان | CTA به احراز هویت | فعال | فعال | فعال | فعال |
| عضویت انجمن | CTA به احراز هویت | فعال | **وضعیت** (بدون تمدید) | وضعیت | وضعیت |
| Role Switcher | فعال — Contextهای ازپیش‌فعال | فعال | فعال | فعال | فعال |
| درخواست دامپزشک معتمد | قفل | قفل: عضویت لازم | فعال | فعال | فعال |
| برگه ثبتی | قفل | قفل: عضویت لازم | فعال | فعال برای حیوان‌های دیگر | فعال |
| شجره‌نامه | قفل | قفل | قفل: برگه ثبتی لازم | فعال | فعال |
| ثبت کنل | قفل | قفل | قفل: برگه ثبتی لازم | فعال | فعال |
| مجوز جفت‌گیری | قفل | قفل | قفل | قفل: شجره‌نامه لازم | فعال |
| توافق شخصی | CTA به احراز هویت | قفل: عضویت فعال لازم | فعال | فعال | فعال |
| Puppy Card | قفل تا KYC | قفل تا مجوز + ثبت توله | همان شرط | همان شرط | فعال فقط برای توله واجد شرایط |
| قرارداد همزیست | غیرفعال — به‌زودی | غیرفعال | غیرفعال | غیرفعال | غیرفعال |

Eligibility پس از هر تغییر وضعیت **بازمحاسبه** می‌شود. پایان یک صفحه یا کلیک «ادامه» اثبات صدور سند نیست. Cooldown هرگز به شرط مسدودکننده این جدول تبدیل نمی‌شود.

## ۵. قرارداد Batch و اقلام

```
PaymentBatch(status)              ← وضعیت مالی گروه
  └─ PaymentItem(amount_toman snapshot, status)   ← مستقل برای هر حیوان/توله
Document(issuance_state)          ← مستقل برای هر حیوان/توله
```

- `batch.status = PAID` **به معنی صدور همه اقلام نیست**.
- قلم ناموفق/رد/معطل، وضعیت بقیه را پنهان نمی‌کند و صدور قلم پرداخت‌شده و واجد شرایط را متوقف نمی‌کند.
- حذف حیوان از Batch یا تغییر مبلغ پس از پرداخت، بدون سیاست مصوب، خودسرانه با بازپرداخت/پرداخت اضافه تکمیل نمی‌شود؛ تا آن زمان عملیات در دسترس نیست و دلیل نمایش داده می‌شود.

## ۶. قرارداد تأیید نسخه‌محور

هر تأیید (تاریخ جفت‌گیری، Allocation، اصلاح تعداد توله) **نسخه دقیق و طرف دقیق** را حمل می‌کند:

```
POST approve { targetId, version, actorRef }
→ UPDATE ... SET approval_x = actor WHERE id = targetId AND version = version
→ rowCount = 0  ⇒  VERSION_STALE (نسخه جدیدتر منتشر شده؛ دوباره ببین)
```

تأیید نسخه قدیمی هرگز نسخه جدید را `FINAL`/`CONFIRMED` نمی‌کند. `FINAL` فقط وقتی که **هر دو تأیید روی یک نسخه** ثبت شده باشند.

## ۷. حداقل رویدادهای Audit (§۲۳.۳)

ویرایش حساب · تغییر موبایل · تغییر/تأیید نقش یا دسترسی · تغییر خدمت و SUPERSEDED · اتصال میکروچیپ و Conflict · نمونه‌گیری، Custody، ارسال و دریافت · تغییر وضعیت فیش و پرداخت · صدور سند · تغییر نژاد کنل · Declaration و تأیید تاریخ · هشدار Cooldown و ادامه آگاهانه · اعلام زایمان · نتیجه مستقل دامپزشک و مغایرت · نسخه Allocation و تأییدها · **ویرایش تنظیمات و تعرفه** · **بررسی شجره‌نامه خارجی** · **درخواست و پاسخ اعتراض ژنتیک** · **اصلاح تعداد و ثبت مرگ توله**.

لاگ هرگز شامل کد ملی کامل، فایل KYC، فیش، OTP یا secret نمی‌شود.
