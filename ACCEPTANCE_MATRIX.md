# معیارهای پذیرش عیناً از بخش ۲۸

هر ردیف باید در اجرا به کد/تست/شاهد واقعی متصل شود. همه در زمان تولید بسته NOT_STARTED هستند. این جدول پوشش برنامه است، نه نتیجه تست محصول.

| ID | معیار اصلی | مراحل اجرا | شاهد اجرا |
|---|---|---|---|
| A-001 | ثبت حیوان پس از KYC بدون عضویت ممکن است؛ نشانی سکونت اجباری نشده است. | PROMPT-004, PROMPT-006, PROMPT-019 | NOT_STARTED |
| A-002 | عضویت F14 پس از پرداخت موفق مادام‌العمر فعال است و سالانه/Review اجباری به آن اضافه نشده است. | PROMPT-005, PROMPT-019 | NOT_STARTED |
| A-003 | Role Switcher فقط Contextهای فعال را نشان می‌دهد؛ پنل‌های عملیاتی مستقل‌اند. | PROMPT-003, PROMPT-018, PROMPT-019 | SHELL-VERIFIED(PROMPT-003) — سوییچر فقط نقش فعال؛ Shell عملیاتی جدا و از سوییچر عمومی غیرقابل‌دسترس. شواهد: تست مرورگر + docs/reports/screenshots/prompt-003/role-switcher.png و denied-wrong-shell.png |
| A-004 | Location ناقص در Finder نیست؛ رزرو نوبت و انتخاب ساعت وجود ندارد. | PROMPT-007, PROMPT-019 | NOT_STARTED |
| A-005 | Referral هر حیوان مستقل و متعلق به دامپزشک/Location همان درخواست است. | PROMPT-007, PROMPT-019 | NOT_STARTED |
| A-006 | تغییر خدمت فقط درخواست همان حیوان را جایگزین می‌کند و سابقه حفظ می‌شود. | PROMPT-007, PROMPT-019 | NOT_STARTED |
| A-007 | کاشت و تأیید هر دو نمونه خون دارند؛ Sample Code بعد از نمونه‌گیری ساخته می‌شود. | PROMPT-008, PROMPT-019 | NOT_STARTED |
| A-008 | چیپ فیزیکی بدون رکورد با کنترل یکتایی و سابقه عمر قابل ثبت است؛ چیپ دوم یا انتقال وجود ندارد. | PROMPT-008, PROMPT-019 | NOT_STARTED |
| A-009 | نمونه قبلی در مسیر شجره‌نامه استفاده می‌شود و مرکز ژنتیک نمونه‌گیری نمی‌کند. | PROMPT-010, PROMPT-019 | NOT_STARTED |
| A-010 | تأیید فیش دستور ارسال را به همان Custodian می‌دهد. | PROMPT-010, PROMPT-019 | NOT_STARTED |
| A-011 | پرداخت صدور مانع پردازش یا نمایش Result نیست؛ صدور سند هر دو شرط را لازم دارد. | PROMPT-010, PROMPT-011, PROMPT-019 | NOT_STARTED |
| A-012 | G1+ بدون Result لازم والدین نتیجه نهایی ناقص نمی‌گیرد؛ نسل دستی قابل انتخاب نیست. | PROMPT-006, PROMPT-010, PROMPT-019 | NOT_STARTED |
| A-013 | وضعیت و صدور حیوان‌های Batch مستقل است. | PROMPT-009, PROMPT-011, PROMPT-016, PROMPT-019 | NOT_STARTED |
| A-014 | کنل Location مستقل و حداقل یک نژاد دارد؛ تغییر نژاد Review/پرداخت اضافه نمی‌سازد. | PROMPT-012, PROMPT-019 | NOT_STARTED |
| A-015 | مجوز رسمی با توافق شخصی جداست و پرداخت یکی وارد مسیر دیگری نمی‌شود. | PROMPT-013, PROMPT-017, PROMPT-019 | NOT_STARTED |
| A-016 | تاریخ اصلاحی رسمی دوباره به تأیید طرف مقابل برمی‌گردد. | PROMPT-014, PROMPT-019 | NOT_STARTED |
| A-017 | Cooldown هشدار است؛ نبود سابقه، تاریخ ساختگی تولید نمی‌کند. | PROMPT-014, PROMPT-019 | NOT_STARTED |
| A-018 | اعلام بارداری/زایمان پس از مجوز است و نبود تأیید دامپزشک مجوز را تغییر نمی‌دهد. | PROMPT-013, PROMPT-015, PROMPT-019 | NOT_STARTED |
| A-019 | درخواست تأیید بارداری صف دامپزشک مشخص دارد؛ کاربر قادر به ثبت نتیجه دامپزشکی نیست. | PROMPT-007, PROMPT-015, PROMPT-019 | NOT_STARTED |
| A-020 | مغایرت، هر دو رکورد را حفظ و اعلان به همان پرونده ایجاد می‌کند. | PROMPT-015, PROMPT-019 | NOT_STARTED |
| A-021 | فقط توله زنده پروفایل می‌گیرد و تعداد رکوردهای اولیه با Live Count برابر است. | PROMPT-015, PROMPT-019 | NOT_STARTED |
| A-022 | Puppy Card بدون Allocation دوطرفه FINAL صادر نمی‌شود؛ برگه ثبتی توله پیش‌نیاز آن نیست. | PROMPT-016, PROMPT-019 | NOT_STARTED |
| A-023 | امضای فیزیکی Gate دیجیتال نساخته است. | PROMPT-008, PROMPT-013, PROMPT-019 | NOT_STARTED |
| A-024 | درخواست فعال دامپزشک با محدودیت پذیرش کار جدید قابل ادامه است. | PROMPT-005, PROMPT-007, PROMPT-018, PROMPT-019 | NOT_STARTED |
| A-025 | خطا، Retry و اعلان‌ها به همان Draft/Request برمی‌گردند. | PROMPT-004, PROMPT-005, PROMPT-007, PROMPT-018, PROMPT-019 | PARTIAL(PROMPT-003) — Resume Context روی اعلان و CTA بازگشت به همان پرونده؛ خطا/Retry هر فلو در همان مرحله بررسی می‌شود |
| A-026 | موارد باز به‌جای نتیجه ساختگی، با وضعیت مشخص باقی می‌مانند. | PROMPT-001, PROMPT-019, PROMPT-020, PROMPT-019 | DISCOVERY — [integration-readiness.md](docs/discovery/integration-readiness.md) §۳ (موارد نامعلوم «تعیین‌نشده» می‌مانند) |
| A-027 | بررسی شجره‌نامه خارجی با انجمن و فهرست صادرکنندگان موردتأیید آن انجام می‌شود؛ SLA ثابت وعده داده نمی‌شود. | PROMPT-006, PROMPT-018, PROMPT-019 | NOT_STARTED |
| A-028 | مهلت اولیه Referral برابر ۲۱ روز و مقدار آن از دیتابیس و قابل تنظیم از پنل مدیریت است. | PROMPT-002, PROMPT-007, PROMPT-018, PROMPT-019 | PARTIAL(PROMPT-002) — مقدار ۲۱ روز در `product_setting` و از پنل قابل تغییر؛ صدور و اعتبارسنجی کد در PROMPT-007 |
| A-029 | کد منقضی امکان درخواست مجدد با ارزیابی صلاحیت و حفظ سابقه دارد. | PROMPT-007, PROMPT-019 | NOT_STARTED |
| A-030 | تعرفه‌ها و پارامترهای مدیریتی هاردکد نیستند و تغییر آن‌ها تاریخچه دارد. | PROMPT-002, PROMPT-005, PROMPT-018, PROMPT-019 | PARTIAL(PROMPT-002) — تعرفه‌ها در DB با نسخه و Audit؛ مقدار نامعلوم NOT_CONFIGURED می‌ماند |
| A-031 | ارسال پستی فقط درخواست را ثبت می‌کند و ثبت درخواست به معنی ارسال واقعی معرفی نمی‌شود. | PROMPT-011, PROMPT-019 | NOT_STARTED |
| A-032 | اصلاح تعداد توله برای کاربر مجاز ممکن است؛ مرگ بعدی، نسخه تولد و پروفایل تاریخی را حذف نمی‌کند. | PROMPT-015, PROMPT-016, PROMPT-019 | NOT_STARTED |
| A-033 | اعتراض Parentage داخل همزیست به همان مرکز ارجاع و با حفظ نتیجه قبلی پیگیری می‌شود. | PROMPT-011, PROMPT-018, PROMPT-019 | NOT_STARTED |
