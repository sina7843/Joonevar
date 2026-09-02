# نقشه مسیر/صفحه ← بخش سند، تصمیم و معیار پذیرش

منبع صفحه: `PROTO` = طراحی مصوب پروتوتایپ با node مشخص · `CODE` = صفحه عملیاتی که طبق D06 در کد و با DS ساخته می‌شود (بازطراحی Figma لازم نیست).

مسیرهای رسمی (`/registration`, `/pedigree`, `/mating/permit`, `/puppy-card`) و مسیر شخصی (`/declaration`) **هرگز ادغام نمی‌شوند**؛ شناسه، وضعیت و Route قابل تفکیک دارند (§۱۶، §۲۰، A-015).

## ۱. Context عمومی کاربر

| مسیر | منبع | node پروتوتایپ | بخش | D | معیار |
|---|---|---|---|---|---|
| `/login`, `/login/otp` | PROTO | `7:27` AUTH-001/002 | s06 | — | A-025 |
| `/onboarding/terms` | PROTO | AUTH-003 | s06 | — | — |
| `/account/complete` | PROTO | AUTH-004 | s06 | — | A-001 |
| `/account/profile` | PROTO | AUTH-005, 005B, `408:10172` | s06 | — | A-001 |
| `/account/profile/mobile` | CODE | — | s06 | — | A-025 |
| `/account/kyc` | PROTO | `70:360` AUTH-006/006B/007/008 | s06 | — | A-001 |
| `/dashboard` | PROTO | `109:360` OWN-001 (۵ حالت), OWN-002 | s08 | D10 | A-003, A-025 |
| `/membership` | PROTO | `334:7741` MEM-001..004, `334:8109` | s07, s22 | D04 | A-002 |
| `/animals` | CODE | — | s10 | — | — |
| `/animals/new` (۶ مرحله) | PROTO | `156:397` PET-003..PET-008, `414:*` نژاد | s09 | — | A-001, A-012 |
| `/animals/[id]` + Timeline | PROTO | `180:397` PET-009-O/-P, `428:12222` | s10 | — | A-025 |
| `/animals/[id]/foreign-pedigree` | PROTO | PET-004 + صف انجمن | s09 | D14 | A-027 |
| `/vets?context=MICROCHIP\|DNA\|PREGNANCY` | PROTO | `349:8324` VFD-001..005 ×۳ | s11 | D02, D03 | A-004 — پیاده‌شده در PROMPT-007 |
| `/vets/location/[id]` | PROTO | VFD-003, `446:12562` LOC-001, `464:12706` MAP-001 | s11 | D02 | A-004 — پیاده‌شده در PROMPT-007؛ نقشه NOT_CONFIGURED است و متن آن صریح است |
| `/requests/new` + `/requests/new/review` | PROTO | `166:397` MIC-001 (۷ ترکیب), MIC-003 | s11, s13 | D03, D09 | A-005 — پیاده‌شده در PROMPT-007؛ انتخاب تا تأیید در URL می‌ماند (DEC-0045) |
| `/requests/[id]` (کد + مهلت) | PROTO | MIC-005 QR/Expired, MIC-006, MIC-008 | s11 | D15 | A-005, A-028, A-029 — پیاده‌شده در PROMPT-007؛ تصویر QR هنوز تولید نمی‌شود (DEC-0048) |
| `/registration`, `/registration/new`, `/registration/[id]` و `/documents/[id]` | PROTO | MIC-007, PET-010 | s13, s22 | D16 | A-013 — پیاده‌شده در PROMPT-009؛ نسخه چاپی رسمی NOT_CONFIGURED است |
| `/pedigree` و `/pedigree/receipts/[id]` | PROTO | `229:4552` DNA-001, DNA-005, DNA-006 + Receipt | s14, s22 | D07 | A-009, A-010 — پیاده‌شده در PROMPT-010 |
| `/pedigree/[animalId]`، `/pedigree/issue`، `/pedigree/batch/[id]` و `/documents/pedigree/[id]` | PROTO | DNA-010/011, PET-011/012/013 | s14 | — | A-011, A-012 — پیاده‌شده در PROMPT-010 و PROMPT-011 |
| `/pedigree/appeals/[id]` و `/genetics/appeals` | CODE | ورودی از همان نتیجه | s14 | D19 | A-033 — پیاده‌شده در PROMPT-011 |
| `/documents/[id]/postal-request` | CODE | — | s14 | D17 | A-031 |
| `/breeder/activate` | PROTO | `240:6033` BRD-001..008 | s15 | — | — — پیاده‌شده در PROMPT-012؛ نقش با تأیید کنل فعال می‌شود |
| `/kennels` و `/kennels/[id]` | PROTO | BRD-003B/C/D, BRD-008 | s15 | D16 | A-014 — پیاده‌شده در PROMPT-012؛ ورود از Context عمومی (DEC-0080) |
| `/mating/permits/new` | PROTO | `242:6517` MAT-002..006, MAT-005B | s16, s22 | D12 | A-015 |
| `/mating/permits/[id]` | PROTO | MAT-007..010, MAT-010B | s16 | D12, D13 | A-015, A-023 |
| `/mating/permits/[id]/dates` | PROTO | MAT-010B + §۱۷ | s17 | — | A-016, A-017 |
| `/mating/permits/[id]/pregnancy` | PROTO | MAT-011, MAT-011B | s18 | D08, D12 | A-018, A-019, A-020 |
| `/mating/permits/[id]/birth` | PROTO | `245:7069` MAT-012..016 | s19 | D18 | A-021, A-032 |
| `/litters/[id]/allocation` | PROTO | MAT-018/019 | s19 | — | A-022 |
| `/puppy-cards/checkout` | PROTO | MAT-017, MAT-017B | s19, s22 | D16 | A-013, A-022 |
| `/declaration/new`, `/declaration/[id]` | PROTO | `242:6517` مسیر شخصی | s20 | — | A-015 |
| `/notifications` | CODE | — | s08 | — | A-025 |

## ۲. Context دامپزشک معتمد

| مسیر | منبع | node | بخش | D | معیار |
|---|---|---|---|---|---|
| `/vet` (صف تخصیص‌یافته) | PROTO | `173:397` VET-001 | s21 | D05 | A-024 — پیاده‌شده در PROMPT-007 |
| `/vet/check-in` (اسکن + ورود دستی، یک کد) | PROTO | VET-002 Scan/Invalid | s11 | D03 | A-005, A-006 — پیاده‌شده در PROMPT-007 |
| `/vet/requests/[id]` (پرونده مراجعه و تغییر نوع خدمت) | PROTO | VET-004/005/006 | s11 | D09 | A-006 — پیاده‌شده در PROMPT-007 |
| `/vet/requests/[id]` — بخش میکروچیپ | PROTO | VET-007 (Scan/Checking/Unique/Status/Install), VET-008 Duplicate block | s12 | — | A-007, A-008 — پیاده‌شده در PROMPT-008 |
| `/vet/requests/[id]` — بخش نمونه | PROTO | `233:5666` VET-012/013/014 | s12 | — | A-007 — پیاده‌شده در PROMPT-008 |
| `/vet/requests/[id]` — مرور نهایی (امضای فیزیکی = اطلاع‌رسانی) | PROTO | VET-009, VET-009B | s12 | D13 | A-023 — پیاده‌شده در PROMPT-008 |
| `/vet/samples` (Custody و Shipment) و `/genetics/samples` (دستور ارسال) | PROTO | VET-010/011/015, DNA-009 | s12, s14 | D07 | A-009, A-010 — Custody، دستور ارسال، Shipment و Resampling در PROMPT-008؛ دریافت و پردازش در PROMPT-010 |
| `/vet/pregnancy/[requestId]` | CODE | ورودی از Finder Pregnancy | s18 | D08 | A-019, A-020 |

## ۳. Shellهای عملیاتی مستقل (D06 / D11 — همه CODE)

| مسیر | حوزه | بخش | D | معیار |
|---|---|---|---|---|
| `/assoc` | صف‌های انجمن | s21 | D11 | A-003 |
| `/assoc/members` | عضویت و شماره عضویت — **بدون Gate فعال‌سازی** | s07, s21 | D04 | A-002 |
| `/assoc/kennels` و `/assoc/kennels/[id]` | بررسی کنل | s15 | — | A-014 — پیاده‌شده در PROMPT-012 |
| `/assoc/permits` | بررسی و صدور مجوز | s16 | — | A-015 |
| `/assoc/foreign-pedigree` | بررسی مدرک خارجی | s09 | D14 | A-027 |
| `/assoc/issuers` | فهرست صادرکنندگان موردتأیید (در شروع خالی) | s21 | D14, D16 | A-027 |
| `/genetics` | داشبورد مرکز | s21 | D07 | — |
| `/genetics/receipts` | فیش‌های منتظر بررسی | s14 | D07 | A-010 |
| `/genetics/samples` | منتظر رسیدن / دریافت‌شده / نامعتبر / در پردازش | s14, s21 | D07 | A-009 |
| `/genetics/results` | نتایج، انتظار والدین، نتیجه نهایی | s14 | — | A-011, A-012 |
| `/genetics/appeals` | اعتراض‌ها و نسخه اصلاحی | s14 | D19 | A-033 |
| `/admin` | محیط سوپرادمین | s21 | D11 | A-003 |
| `/admin/settings/deadlines` | مهلت مراجعه (مقدار اولیه ۲۱ روز) | s21 | D15 | A-028 |
| `/admin/vets` | داده دامپزشکان از قبل تأییدشده و مراکز آن‌ها؛ فرم درخواست معتمدشدن نیست (DEC-0042) | s11, s21 | D01, D02 | A-004 |
| `/admin/settings/fees` | تعرفه‌ها؛ «تعیین‌نشده» می‌ماند اگر داده نیست | s21, s22 | D16 | A-030 |
| `/admin/settings/genetics-centre` | مشخصات و حساب همان مرکز ثابت | s21 | D07, D16 | — |
| `/admin/settings/reference-data` | نژادها و فهرست‌های مرجع | s21 | D16 | — |
| `/admin/settings/history` | تاریخچه تغییر تنظیمات با Actor و مقدار قبلی | s21, s23 | D16 | A-030 |
| `/admin/audit` | مرور Audit در حد مجوز | s23 | — | A-026 |

## ۴. صفحاتی که ساخته نمی‌شوند

`/vets/apply` (Onboarding عمومی دامپزشک — D01) · هر صفحه انتخاب ساعت/نوبت/تقویم ظرفیت (D03) · انتخاب مرکز ژنتیک (D07) · صفحه تمدید عضویت (D04) · Gate امضای دیجیتال (D13) · مدیریت حمل و رهگیری پستی (D17) · Feed جفت‌یابی · ذخیره متن قرارداد (§۲۰).

فریم‌های `[RETIRED]` پروتوتایپ نیز پیاده‌سازی نمی‌شوند: `PET-002/Default`, `MIC-002`, `MIC-003B`(هر دو), `MIC-004`(۴ حالت), `DNA-002`, `DNA-004`, `BRD-003/Upload error`, `AUTH-005/Identity conflict`.

## ۵. پوشش ۲۹ بخش

| بخش | مسیر/سازوکار پوشش‌دهنده |
|---|---|
| s01 رفرنس‌ها | `docs/discovery/reference-access.md` |
| s02 دامنه | بخش ۴ همین سند + بخش ۶ `implementation-plan.md` |
| s03 تصمیم‌ها | ستون D همین جدول‌ها + `IMPLEMENTATION_DECISIONS.md` |
| s04 نقش‌ها | `permissions.md` §۱–۲؛ Role Switcher در `/dashboard` |
| s05 Eligibility | `data-contracts.md` §۴؛ سرویس `domain/eligibility` |
| s06 حساب/OTP/KYC | `/login*`, `/account/*` |
| s07 عضویت | `/membership`, `/assoc/members` |
| s08 داشبورد/اعلان/Resume | `/dashboard`, `/notifications`, `resume_context` |
| s09 ثبت حیوان و نسب | `/animals/new`, `/animals/[id]/foreign-pedigree` |
| s10 پروفایل و Timeline | `/animals/[id]` |
| s11 Finder و Referral | `/vets/finder`, `/requests/*`, `/vet/checkin` |
| s12 میکروچیپ و نمونه | `/vet/cases/[id]/*`, `/vet/samples` |
| s13 برگه ثبتی | `/registration/batch` |
| s14 مرکز ژنتیک و شجره‌نامه | `/pedigree/*`, `/genetics/*` |
| s15 پرورش‌دهنده و کنل | `/breeder/activate`, `/kennels/*` |
| s16 مجوز جفت‌گیری | `/mating/permits/*`, `/assoc/permits` |
| s17 تاریخ و Cooldown | `/mating/permits/[id]/dates` |
| s18 بارداری و تأیید اختیاری | `/mating/permits/[id]/pregnancy`, `/vet/pregnancy/[id]` |
| s19 توله، Allocation، Puppy Card | `/…/birth`, `/litters/[id]/allocation`, `/puppy-cards/checkout` |
| s20 توافق شخصی | `/declaration/*` |
| s21 پنل‌ها | بخش ۲ و ۳ همین سند |
| s22 پرداخت‌ها | `PaymentBatch/Item` + هر Checkout؛ `/admin/settings/fees` |
| s23 قرارداد داده | `data-contracts.md` |
| s24 UI و DS | لایه `src/ui`؛ PROMPT-003؛ قرارداد RTL از ERRATA v2.0 |
| s25 تکمیل‌های مجاز | `DECISIONS.md` (فقط GAP_COMPLETION) |
| s26 حالت‌ها و خطا | هر مسیر ۸ حالت پایه: Loading, Empty, Populated, NetworkError, Locked+دلیل, WaitingOther, NeedsCorrection, Success |
| s27 نگاشت رفرنس | ستون node همین جدول‌ها |
| s28 پذیرش | ستون معیار همین جدول‌ها + `ACCEPTANCE_MATRIX.md` |
| s29 مرز و فاز بعد | بخش ۴ همین سند + `integration-readiness.md` |

## ۶. پوشش ۱۹ تصمیم

| D | جای اعمال | جای بررسی |
|---|---|---|
| D01 | نبود `/vets/apply` | بخش ۴ |
| D02 | فیلتر `is_complete` در Finder | `/vets/finder` |
| D03 | نبود Time Slot؛ `group_id` فقط نمایشی | `/requests/new` |
| D04 | `Membership` بدون `expires_at`؛ فعال‌سازی با verify | `/membership` |
| D05 | بررسی عضویت در پذیرش کار جدید | `permissions.md` §۳ |
| D06 | همه ردیف‌های `CODE` | بخش ۳ |
| D07 | یک `genetics_centre` ثابت از تنظیمات | `/pedigree/request` |
| D08 | `vet_id` اجباری روی درخواست تأیید | `/vet/pregnancy/[id]` |
| D09 | فیلد زمان = زمان انجام رویداد | `/vet/cases/*` |
| D10 | Role Switcher پویا از `AccountRole` فعال | `/dashboard` |
| D11 | Shellهای `/assoc`, `/genetics`, `/admin` | بخش ۳ |
| D12 | بارداری بدون اثر بر مجوز صادرشده | `/…/pregnancy` |
| D13 | نبود Gate امضا در صدور | `/vet/cases/[id]/review` |
| D14 | صف انجمن + `/assoc/issuers` | بخش ۳ |
| D15 | `expires_at` از تنظیم فعال، snapshot | `/admin/settings/deadlines` |
| D16 | همه مبالغ از `ProductSetting` | `/admin/settings/fees` |
| D17 | فقط `PostalRequest` با `status=REQUESTED` | `/documents/[id]/postal-request` |
| D18 | اصلاح نسخه‌دار تعداد و رویداد مرگ | `/…/birth` |
| D19 | `ParentageAppeal` به همان مرکز | `/pedigree/[id]/appeal`, `/genetics/appeals` |
