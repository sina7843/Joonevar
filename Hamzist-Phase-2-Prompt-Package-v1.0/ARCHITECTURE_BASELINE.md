# خط مبنای معماری فاز دوم

- پروژه موجود Next.js 15، React 19، PostgreSQL و Drizzle ORM است.
- App Router و RTL فارسی موجود حفظ می‌شوند.
- مدل‌های عمومی به Account، Vet، Location، Breed، Document، Payment، Settings و Audit فاز یک متصل می‌شوند.
- ماژول‌های جدید: Public Profile، Organization/Center، Association، Club، CMS، Report/Moderation، Claim، Advertising و Search.
- وضعیت اعتبار و تبلیغات در ستون یا جدول مشترک ادغام نشوند.
- فایل باینری در Object Storage و Metadata در دیتابیس ذخیره شود؛ سیاست نهایی Adapter موجود را رعایت کند.
- تغییرات Schema فقط با Migration و تست انجام شوند.
