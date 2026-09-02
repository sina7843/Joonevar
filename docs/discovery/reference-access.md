# دسترسی به رفرنس‌ها — گزارش بازرسی واقعی PROMPT-001

تاریخ بازرسی: ۲۰۲۶-۰۹-۰۲. ابزار: Figma MCP فقط‌خواندنی (`whoami`, `get_metadata`, `get_variable_defs`, `get_screenshot`, `get_figjam`). هیچ فایل Figma در این نوبت ویرایش نشد.

هویت احرازشده Figma: handle `Mahdi`، ایمیل `20mahdi15@gmail.com`، پلن `Mahdi Mirzaei's team` (tier pro, seat Full). دسترسی به هر سه فایل مرجع برقرار بود.

## ۱. آنچه واقعاً باز و خوانده شد

| مرجع | fileKey / node | ابزار | عمق واقعی خواندن |
|---|---|---|---|
| Flow Map v3.0 | `r0HblzL2bxAcswyGpAfbe2` § `2:3` — ستون وابستگی سرویس‌ها | `get_figjam` | کامل: ۱۴ شکل + ۱۳ connector با متن برچسب‌ها |
| Flow Map v3.0 | `r0HblzL2bxAcswyGpAfbe2` § `2:6` — ماتریس دسترسی | `get_figjam` | کامل: جدول ۱۴×۶ با متن همه سلول‌ها |
| Flow Map v3.0 | `r0HblzL2bxAcswyGpAfbe2` § `90:1568` — Finder و پذیرش مراجعه | `get_figjam` | کامل: دو lane، ۴۸ نود و connectorها |
| Prototype MVP v1.0 | `SPDPe6xmPR4fDGXIT5fvni` — فهرست صفحات فایل | `get_metadata` | کامل: فایل فقط یک صفحه دارد — `224:581 / Hamzist — v3.1` |
| Prototype MVP v1.0 | `SPDPe6xmPR4fDGXIT5fvni` § `224:581` | `get_metadata` | XML کامل (۳۶۹٬۴۴۴ کاراکتر) دریافت شد؛ **تحلیل‌شده تا عمق ۲** (سکشن‌ها و فریم‌های صفحه/حالت). محتوای برگ‌ها (متن‌ها، اندازه‌ها، توکن هر فیلد) در این مرحله تحلیل نشد. |
| Prototype MVP v1.0 | `SPDPe6xmPR4fDGXIT5fvni` § `395:10183` — ERRATA v2.0 | `get_screenshot` | کامل و بصری (۲۱۰۴×۲۳۲) |
| Design System | `2GMJPgnnenGnr1zBN2yH5h` — فهرست صفحات فایل | `get_metadata` | کامل |
| Design System | `2GMJPgnnenGnr1zBN2yH5h` § `48:456` (00 Cover) | `get_metadata` | کامل |
| Design System | `2GMJPgnnenGnr1zBN2yH5h` § `0:1` (02 Brand & Logo) | `get_metadata` | کامل، تا برگ‌ها |
| Design System | `2GMJPgnnenGnr1zBN2yH5h` § `4:4` | `get_variable_defs` | کامل |

## ۲. آنچه در این نوبت خوانده نشد

بخش‌های Flow Map زیر باز نشدند و هیچ ادعایی درباره محتوای فعلی آن‌ها نمی‌شود: `2:2`, `2:4`, `2:5`, `35:459`, `38:581`, `39:663`, `40:807`, `42:908`, `87:1495`, `44:1134`, `64:1392`, `91:1817`, `112:2509`, `113:2664`, `128:2965`. این‌ها در مراحل مربوطه (PROMPT-006 تا PROMPT-017) خوانده و ثبت می‌شوند.

محتوای متنی و بصری تک‌تک صفحات پروتوتایپ (فیلدها، Copy، اندازه‌ها) در این مرحله استخراج نشد. تطبیق بصری هر صفحه به مرحله پیاده‌سازی همان صفحه موکول است و تا آن زمان وضعیت visual = **UNVERIFIED** است.

## ۳. یافته مهم ۱ — Design System عملاً فقط Brand است

فایل `Hamzist Design System — Claude Handoff v1.0` در وضعیت فعلی **فقط دو صفحه** دارد:

- `48:456` — `00 Cover`
- `0:1` — `02 Brand & Logo` (فریم `4:4 / HamZist / Logo Foundations`، ارتفاع ۱۳۳۳۱px)

زیربخش‌های موجود: `00 Header`, `01 Master Symbol`, `02 Persian Lockups`, `03 English Lockups`, `04 Colorways`, `05 App Icon & Favicon`, `06 Clear Space & Minimum Size`, `07 Usage Guidelines`, `08 Mono & Reversal Rules`.

متغیرهای واقعی موجود در فایل (`get_variable_defs` روی `4:4`) — **کل مجموعه توکن منتشرشده همین است**:

```
--color-logo-mark      #e46a1d
--color-logo-wordmark  #fff1d6
--color-logo-panel     #171a17
--color-logo-cutout    #fff1d6
--color-logo-mono      #3a3b36
--color-logo-surface   #fff1d6
--primitive-neutral-olive-900 #3a3b36
```

**نتیجه:** رنگ اصلی برند E46A1D تأیید شد. اما هیچ صفحه کامپوننت، تایپوگرافی، مقیاس فاصله، Radius یا توکن معنایی (`surface`, `text`, `border`, `danger`, …) در این فایل منتشر نشده است. الگوهای فهرست‌شده در Requirements §۲۴.۲ (Role Switcher، Status Badge، Alert، Timeline، Field/Location، Field/Select، Modal/Drawer/Bottom Sheet) به‌عنوان Master قابل بازیابی در این فایل **وجود ندارند**.

لینک مرجع ۴ در `REFERENCES.md` به `node-id=48-472` اشاره می‌کند و آن را «بخش Overlays» توصیف کرده است؛ در ساختار فعلی فایل چنین نودی زیر `48:456` دیده نشد (فرزندان آن `48:490` و `48:505..48:509` هستند). این لینک تاریخی است و مرجع فعال محسوب نمی‌شود.

**اثر اجرایی:** طبق `ARCHITECTURE_BASELINE.md` و D06، لایه توکن و کامپوننت در کد ساخته می‌شود. مقادیر برند از همین متغیرها و مقادیر ثبت‌شده سند (E46A1D، Radius 8/12/16/999) گرفته می‌شود؛ باقی توکن‌ها در کد تعریف و به‌عنوان تصمیم فنی ثبت می‌شوند، نه به‌عنوان «مشاهده‌شده در DS». این بازطراحی برند نیست.

## ۴. یافته مهم ۲ — موجودی واقعی صفحات پروتوتایپ

صفحه `224:581` شامل ۱۵ سکشن F01–F15 با همان node-idهای Requirements §۲۷.۲ است، به‌علاوه سه بخش اضافه که در سند نیامده‌اند:

| بخش | node | وضعیت |
|---|---|---|
| `Deprecated / v1 — retired from active prototype` | `353:8782` | مرجع فعال نیست |
| `ERRATA — v2.0 (supersedes baseline A-08)` | `395:10183` | معتبر — بخش ۵ همین سند |
| `PILOT — Before / After` | `891:13743` | شواهد سه تغییر اعمال‌شده |

شناسه‌های صفحه مصوب که در پیاده‌سازی مبنا قرار می‌گیرند (استخراج‌شده از فریم‌های عمق ۲):

- **F01** `7:27` — AUTH-001/002/003/004/009 با حالات Default, Invalid, Loading, Expired, Locked, Success.
- **F02** `70:360` — AUTH-005, AUTH-005B, AUTH-006, AUTH-006B, AUTH-007 (Under review / Approved / Rejected), AUTH-008 (Needs correction) و `408:10172 / AUTH-005 Duplicate national ID`.
- **F03** `109:360` — OWN-001 (Skeleton/Empty/Populated/Blocked/Network error) و OWN-002 (Default/Empty).
- **F04** `156:397` — PET-002 Not eligible, PET-003, PET-004..PET-008 شش‌مرحله‌ای، PET-009-P، Draft save، و ۱۱ حالت واقعی dropdown نژاد (`414:10472`…`414:12576`) شامل جست‌وجوی انگلیسی «retriever».
- **F05** `166:397` — MIC-001 (۷ ترکیب انتخاب چندحیوانی: ۱، ۲، ۳، ۱و۲، ۱و۳، ۲و۳، ۱و۲و۳)، MIC-003 Service review، MIC-005 Referral QR/Expired، MIC-006 Waiting for vet، MIC-008 Regenerate.
- **F06** `173:397` — VET-001..VET-009B شامل `VET-007 / Checking uniqueness`, `VET-007 / Unique`, `VET-008 / Duplicate block`, `VET-007 / Microchip status`, `VET-007 / Install new chip`.
- **F07** `180:397` — MIC-007 Owner result، PET-009-O (Default / Locked fields / شجره‌نامه صادرشده)، PET-010 (Pedigree payment / Processing / Failed)، PET-011 Under review، PET-012 Pedigree issued، PET-013 prerequisites complete/incomplete.
- **F08** `229:4552` — DNA-001..DNA-011 شامل `DNA-006 / Receipt upload`, `Receipt approved`, `DNA-009 / Resampling required`, و `DNA-003 / Parent context [DEFERRED — G1+]`.
- **F09** `233:5666` — VET-010..VET-015 (DNA referral case, Re-scan microchip, Mismatch, Sample collection, Sample ID and seal, Chain of custody, Sample sent).
- **F10** `236:5552` — GEN-001..GEN-014 شامل Receive sample, Sample validation, Reject invalid, Register lab code, Testing, Preliminary result, Technical approval, Final result, Father/Mother result, Samples list, Results list.
- **F11** `240:6033` — BRD-001..BRD-008 و BRD-003B/C/D (Residential location, Kennel location, Breeding breeds).
- **F12** `242:6517` — MAT-001..MAT-011 و MAT-005B Permit payment، MAT-010B Mating events، MAT-011B Pregnancy verified.
- **F13** `245:7069` — MAT-012..MAT-023 و MAT-017B Sheet payment.
- **F14** `334:7741` — MEM-001 Required، MEM-002 Benefits، MEM-003 Checkout/Processing/Failed، MEM-004 Activated، OWN-001 Membership required.
- **F15** `349:8324` — VFD-001..VFD-005 در سه Context (پسوند `-M` میکروچیپ، `-D` DNA، `-P` بارداری)، به‌علاوه `LOC-001` و `MAP-001`.

### صفحات RETIRED داخل پروتوتایپ

این فریم‌ها صریحاً با پیشوند `[RETIRED]` علامت خورده‌اند و **پیاده‌سازی نمی‌شوند**؛ جهت آن‌ها با D-decisions هم‌راستاست:

`PET-002 / Default` · `MIC-002 / Default` · `MIC-003B / Consent` · `MIC-003B / Free path` · `MIC-004 / Checkout` · `MIC-004 / Processing` · `MIC-004 / Failed` · `MIC-004 / Pending verification` · `DNA-002 / Select test` · `DNA-004 / Suggested vet` · `BRD-003 / Upload error` · `AUTH-005 / Identity conflict`

بازنشستگی `MIC-004 / Checkout` مؤید §۲۲ است: پرداخت مستقل میکروچیپ در همزیست وجود ندارد. بازنشستگی `DNA-004 / Suggested vet` مؤید D07 است: انتخاب دامپزشک در مسیر معمول شجره‌نامه تکرار نمی‌شود.

### مورد BLOCKED واقعی — MAP-001

در F15 دو فریم وجود دارد: `464:12706 / MAP-001 / Select location on map` و `464:12591 / LOC-001 / موقعیت جدید انتخاب شد [BLOCKED — awaiting map asset]`. یعنی مورد MAP-001 که §۲۹.۲ آن را «بدون شاهد بسته‌شدن» توصیف کرده، در خود پروتوتایپ هنوز باز و برچسب‌خورده است. این با ادعای بسته‌شدن جایگزین نمی‌شود؛ در `integration-readiness.md` به‌عنوان وابستگی ارائه‌دهنده نقشه ثبت شده است.

## ۵. ERRATA v2.0 — قرارداد ترتیب دکمه RTL

متن خوانده‌شده از `395:10183` (ترجمه اجرایی):

> یادداشت A-08 در `Hamzist_Prototype_Change_Control_v1.0.md` و مشتق آن از Change Spec v2.0 §۱۸.۲ **باطل** است؛ آن یافته از روی نام لایه‌ها استخراج شده بود نه برچسب‌ها.
>
> ۱) در سه صفحه تأیید — `VET-009 / Sensitive confirm` (`178:914`)، `GEN-009 / Technical approval` (`236:5932`)، `MAT-009 / Same-owner re-auth` (`242:7016`) — مقصدها از ابتدا درست بوده‌اند. مطابق RTL: **جایگاه راست = `Button/Primary`** («تأیید» / «ادامه»)، **جایگاه چپ = `Button/Secondary`** («انصراف» / «بازگشت»).
>
> ۲) مورد `MAT-015 / Litter detail` (`245:7338`) حذف می‌شود: اقدام اصلی «افزودن نوزاد» (`245:7230`) و اقدام فرعی «مشاهده گواهی» (`245:7493`) از ابتدا درست بوده‌اند.

این قرارداد در PROMPT-003 به‌عنوان قاعده چیدمان دکمه‌های همه دیالوگ‌ها و فرم‌ها اعمال می‌شود.

## ۶. تعارض‌های زنده تأییدشده در Flow Map

بررسی مستقیم نودها، تعارض‌هایی که Requirements §۳ نام برده بود را **عیناً تأیید کرد**. اولویت با D-decisions است و Figma تغییر داده نشده:

| نود واقعی | متن زنده Figma | تصمیم حاکم | رفتار پیاده‌سازی |
|---|---|---|---|
| `8:34` | «عضویت **سالانه** انجمن» | D04 | عضویت مادام‌العمر؛ هیچ انقضا/تمدیدی ساخته نمی‌شود |
| `8:97` (connector) | «**تأیید انجمن** — شماره می‌تواند Pending باشد» | D04 | Review انجمن Gate فعال‌سازی نیست؛ فقط «شماره می‌تواند PENDING باشد» معتبر است |
| `2:6` ردیف «عضویت انجمن» | سلول‌های «وضعیت / **تمدید**» | D04 | فقط «وضعیت»؛ CTA تمدید ساخته نمی‌شود |
| `90:1595` | فیلتر شامل «**اولین نوبت**» | D03 | حذف مفهومی؛ فیلترها فقط استان/شهر، محله/فاصله، نوع خدمت و امکانات نمونه‌گیری |
| `90:1599` | مرتب‌سازی «نزدیک‌ترین یا **زودترین نوبت**» | D03 | فقط مرتب‌سازی بر اساس فاصله |
| `90:1655` | «**Appointment** اختیاری — گروه‌بندی چند حیوان در یک زمان و Location» | D03 / D09 | گروه‌بندی نمایشی چند درخواست باقی می‌ماند؛ هیچ زمان رزروشده‌ای ساخته نمی‌شود |
| `90:1659`, `90:1663`, `90:1679` | «ارسال Request و **Appointment**»، «اعلان دامپزشک — **زمان**…»، «مشاهدهٔ **Appointment**» | D03 / D09 | اعلان بدون زمان رزرو؛ «زمان» فقط زمان انجام رویداد است |
| `87:1495` (خوانده‌نشده در این نوبت) | بخش Onboarding دامپزشک | D01 | فاز بعد؛ ساخته نمی‌شود |

نودهای Flow Map که با D-decisions **سازگارند** و به‌عنوان مبنا پذیرفته شدند: زنجیره وابستگی `8:18 → 8:22 → 8:26 → {8:30, 8:34} → 8:42 → {8:50, 8:54} → 8:58 → 8:62 → 8:66 → 8:70`؛ برچسب‌های `حداقل یک برگه ثبتی`، `حداقل یک شجره‌نامه`، `تخصیص FINAL هر دو مالک`، `محاسبه نسل از والدین`؛ و کل ماتریس `2:6` به‌جز سلول‌های تمدید.

## ۷. صحت مسیرهای محلی و هش منبع

```
$ sha256sum Requirements.md reference-inputs/Hamzist_Project_Reference_v1.1.md
cc441a4932b1a7ee2f29ca1ef3d15697752c73e854b4ce975454bd163dd8282d *Requirements.md
cc441a4932b1a7ee2f29ca1ef3d15697752c73e854b4ce975454bd163dd8282d *reference-inputs/Hamzist_Project_Reference_v1.1.md
```

هر دو با `source-manifest.json → product.sha256` یکی هستند. حجم ۱۱۱٬۸۷۶ بایت و ۱۰۵۹ خط مطابق `SOURCE_DISCOVERY.md`. `node tools/validate-core.mjs` (از طریق `runner setup`) نیز مطابقت هش، وجود ۲۹ لنگر بخش، ۱۹ تصمیم، ۳۳ ردیف پذیرش عیناً و حضور همه URLهای سند در `REFERENCES.md` را تأیید کرد.

همه ۳۷ لینک `REFERENCES.md` به سه fileKey بالا اشاره می‌کنند؛ دسترسی به هر سه fileKey تأیید شد. صحت تک‌تک node-idهای خوانده‌نشده ادعا نمی‌شود.

## ۸. وضعیت اعلامی

| بُعد | وضعیت |
|---|---|
| دسترسی رفرنس | AVAILABLE — هر سه فایل با حساب فعلی قابل خواندن |
| تطبیق بصری صفحات | UNVERIFIED — هیچ صفحه‌ای پیکسل‌به‌پیکسل تطبیق داده نشده |
| کامل‌بودن DS | GAP — فقط لایه برند منتشر شده؛ توکن و کامپوننت محصول در کد ساخته می‌شود |
| MAP-001 | OPEN — در پروتوتایپ هنوز `[BLOCKED — awaiting map asset]` |
| INC-01 / INC-02 | NO_EVIDENCE — در این بازرسی چیزی درباره آن‌ها دیده نشد؛ بسته اعلام نمی‌شوند |
