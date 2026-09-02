# وضعیت واقعی پیاده‌سازی

Status: DISCOVERY_COMPLETE — کد محصول هنوز نوشته نشده است.

وضعیت‌ها جدا نگه داشته می‌شوند و به یک checkbox تقلیل پیدا نمی‌کنند:

| بُعد | وضعیت | توضیح |
|---|---|---|
| code implementation | NOT_STARTED | PROMPT-001 مرحله Discovery است؛ ساخت پایه در PROMPT-002 |
| automated checks | PARTIAL | تست‌های بسته اجرا و PASS شدند؛ هیچ تست محصولی هنوز وجود ندارد |
| visual fidelity | UNVERIFIED | ساختار پروتوتایپ و DS واقعاً بازرسی شد؛ هیچ صفحه‌ای تطبیق بصری نشده |
| integration readiness | NOT_CONFIGURED | جزئیات در `docs/discovery/integration-readiness.md` |
| production readiness | NOT_READY | نبود تعرفه واقعی، حساب مرکز ژنتیک، درگاه، SMS و نقشه |

## PROMPT-001 — بررسی کد و رفرنس‌ها و انتخاب معماری

**مرحله جاری:** تکمیل‌شده.

**رفتار تکمیل‌شده:** بازرسی مخزن (خالی از کد محصول، بدون commit)، بازرسی فقط‌خواندنی واقعی Flow Map، پروتوتایپ و Design System، تأیید هش منبع و مسیرهای محلی، انتخاب Stack و ثبت DEC-0001…DEC-0009، نوشتن مدل دامنه، ماتریس مجوز شش‌گانه، جدول Eligibility، قرارداد Batch/نسخه و چک‌لیست مسیر برای ۲۹ بخش، ۱۹ تصمیم و ۳۳ ردیف پذیرش.

**فایل‌ها:** `docs/discovery/reference-access.md`، `docs/discovery/integration-readiness.md`، `docs/architecture/implementation-plan.md`، `docs/architecture/data-contracts.md`، `docs/architecture/permissions.md`، `docs/architecture/route-coverage.md`، `DECISIONS.md`، `REQUIREMENTS_TRACEABILITY.md`، `IMPLEMENTATION_STATUS.md`، `docs/reports/PROMPT-001.json`.

**migration:** ندارد (این مرحله کد ندارد).

**بررسی‌های واقعاً اجراشده:**

| بررسی | دستور | نتیجه |
|---|---|---|
| صحت بسته و هش منبع | `node tools/runner.mjs setup` (شامل `tools/validate-core.mjs`) | PASS — ۲۰ prompt، ۲۹ بخش، ۱۹ تصمیم، ۳۳ ردیف پذیرش، هش منبع سالم |
| هش مستقل منبع | `sha256sum Requirements.md reference-inputs/…` | PASS — هر دو `cc441a49…8282d` |
| تست‌های Runner و Guardrail | `node --test tools/tests/runner.test.mjs .claude/tests/guardrails.test.mjs` | PASS — ۲۳/۲۳ |
| بازرسی رفرنس فقط‌خواندنی | Figma MCP: `whoami`، `get_metadata`، `get_variable_defs`، `get_screenshot`، `get_figjam` | PASS — گزارش دقیق در `reference-access.md` |

**تصمیم‌های جدید:** DEC-0001 تا DEC-0009.

**وابستگی بیرونی:** SMS/OTP، درگاه پرداخت، نقشه، Reader، رندر سند، تعرفه‌های واقعی، حساب مرکز ژنتیک، فهرست صادرکنندگان، فونت IRANSansX — همه در `integration-readiness.md`.

**مانع واقعی:** هیچ مانعی مرحله را مسدود نکرد.

**دستور ادامه:** `node tools/runner.mjs prepare` سپس اجرای PROMPT-002.
