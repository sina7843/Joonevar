# P10 — Decision desk · میز تصمیم

## Purpose

Where an operator looks at one case's evidence and history and records one of three outcomes: **تأیید · نیازمند اصلاح · رد**. Correction and rejection require a reason. Every decision is versioned: it is sent with the version the operator opened (`expectedVersion`), and the server refuses it if the case changed in the meantime. One `DecisionDesk` replaces 21 separate decision forms in 8 modules (KYC, trusted vet, vet licences, centres, claims, communities, genetics appeals and receipts, content reports, foreign pedigree, kennels, permits). It holds private documents (national cards, licences, payment slips) that are viewable here and nowhere else, and never downloadable.

**Don't use it** for irreversible admin actions without a review outcome (revoke a pedigree or permit, merge records). Those use `SensitiveConfirm` / `MergeTool`. Don't use it for a user's view of their own case (P06), or for configuration edits with a reason (P11).

## Anatomy (top to bottom; desktop: two columns)

1. **Shell:** `OpsShell`. The top bar carries `Breadcrumbs` «صف‌ها / احراز هویت / علی رضایی».
2. **Record head** (`Card`):
   - «پرونده ۲ از ۴» with previous / next case
   - `h1` «احراز هویت · علی رضایی» + `StatusBadge`
   - meta: `Identifier` case code, national ID, mobile; last submission; age «۱۲ روز در صف»; «نسخه ۳»
   - `ActionOwner` «اقدام بعدی با: انجمن» + «مسئول: حمید نوروزی»
3. **Evidence column (start):**
   - «مدارک»: `DocumentPreview` frames with zoom / rotate 90° / fullscreen and the standing note «مدرک خصوصی — فقط در میز تصمیم، بدون دانلود»
   - «اطلاعات اعلام‌شده»: `KeyValueList --2col`; missing optional fields read «— اختیاری؛ وارد نشده»
   - «سابقه پرونده»: `Timeline` audit variant, newest first, one entry per version, with each earlier reason
   - module extras: `ReportCard` head for content reports, `PedigreeTree` for foreign pedigree, `PlaceMap` for centres
4. **Decision column (end, `aside`):**
   - an optional stale `Alert`
   - «تصمیم»: three `RadioCard`-style options, each with a one-line consequence
   - «دلیل»: `ReasonField` with draft chips, a textarea, the counter «۹۱ از ۵۰۰ نویسه», and an optional internal note the user never sees
   - primary «ثبت تصمیم: نیازمند اصلاح» (the label follows the choice)
   - «تصمیم روی نسخه ۳ پرونده ثبت می‌شود و در سابقه می‌ماند.»

## Layout

| | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Structure | full page, one column: head → **documents first** → declared data → history | one column, same order | grid `1fr + 380px` in `container-app`: evidence at the start, decision column at the end |
| Decision | sticky bar `.hz-desk__bar` at the bottom (تأیید · اصلاح · رد, `bg-chrome`, `shadow-sticky`). اصلاح or رد opens a `BottomSheet` with `ReasonField` + submit | same sticky bar. اصلاح or رد opens a `Modal` | fixed panel, sticky at `header-app` + `space-16` |
| Documents | full width, tools in a 44px row under each image | full width | in the evidence column; fullscreen is a `Modal` |
| Navigation | nav `Drawer`; «بازگشت» to the queue | 72 rail | 248 sidebar |
| Spacing | sections `space-16`, padding `space-16` | same | sections `space-16`, panels `space-16`–`space-20`, column gap `space-24` |

Queues without a `[id]` route (several `/market/*` queues) open the same desk in a wide `Drawer` from the end on desktop and as a full page on mobile.

## States

- **Default:** no option chosen; the submit is disabled with «یک تصمیم انتخاب کنید».
- **Option chosen:** the card is `bg-brand-subtle` + `border-brand`. The reason becomes required for اصلاح and رد and optional for تأیید.
- **Loading:** a Skeleton head (title + meta bars), document frames at 4:3 in `bg-disabled`, `keyValue` bars, three Timeline items. The decision panel renders disabled until the case version is known.
- **Submitting:** the primary shows `aria-busy` + spinner and the options lock.
- **Validation:** an empty reason gets `aria-invalid` + «برای رد، دلیل را بنویسید یا یکی از دلیل‌های آماده را انتخاب کنید.»
- **Stale (version conflict):** a `role="alert"` warning at the top of the panel: «تصمیم ثبت نشد — این پرونده پس از باز کردن شما تغییر کرده است. صفحه را دوباره بار کنید و سپس تصمیم بگیرید.» + «بارگذاری دوباره». The typed reason is kept as a draft. The tone is warning (nothing was saved); the product owner is to confirm.
- **Error / network:** if loading fails, NetworkErrorState in the work area. If the submit fails, an `Alert` in the panel; the choice and reason are kept.
- **Locked / permission:** without the role, `AccessDenied` (role). A case assigned to someone else is read-only, with «این پرونده به {name} تخصیص داده شده است» and «برداشتن پرونده» if the policy allows. A closed case shows its final outcome with no panel.
- **Empty evidence:** a section with no data collapses to one «—» line. «هیچ مدرکی بارگذاری نشده» is itself a reason to request a correction.
- **Hard cases:** a long applicant name wraps in the `h1` and never truncates. A three-sentence reason grows the textarea up to the 500 cap. A rotated or unreadable scan is fixed with the tools. A missing scan uses the `RecordImage` placeholder labelled «تصویر در دسترس نیست». An overdue case shows the age `--overdue` in the head.

## Content & data rules

- Keep the three labels exactly: تأیید · نیازمند اصلاح · رد. **One approved exception (11 Mehr 1405): content reports** decide about published content, not an applicant's case, so K16 uses its own three outcomes «نگه داشتن · پنهان کردن · برداشتن» (keep · hide · remove). No other module renames them.
- Each decision sends `{ outcome, reasonFa, expectedVersion }`. The reason is shown to the user verbatim. The internal note is never shown to them.
- Draft reasons are configured per queue (KYC: «تصویر خوانا نیست · تاریخ تولد مطابقت ندارد · مدرک ناقص است»).
- National IDs, codes and mobiles are Latin `Identifier`s. Dates are Jalali with the time.
- Action order: one primary (the chosen outcome). On mobile «رد» is a destructive-outline button and the sheet's رد submit is destructive.

## Accessibility & keyboard

- Landmarks: `main` → evidence `section`s, then `aside` «تصمیم» (`aria-labelledby`). Focus order: head → documents → declared data → history → decision.
- The decision is a `fieldset` with the hidden legend «نتیجه بررسی». Arrow keys move between options.
- The document toolbar is `role="toolbar"` with Persian `aria-label`s. Each scan has `alt` naming the side and the person.
- The stale alert is `role="alert"` and moves focus to «بارگذاری دوباره». The mobile sheet is `role="dialog" aria-modal="true"`, traps focus and returns it to the bar button.
- Suggested shortcuts on desktop (fine pointer only, listed in a «میان‌برها» tooltip): previous / next case. Outcomes are never one-key, to prevent accidental decisions.

## Pages that use it (about 30)

`/assoc/kyc/[id]` · `/assoc/vet-trusted/[id]` · `/assoc/vet-doctors/[id]` · `/assoc/vet-licences/[id]` · `/assoc/vet-students/[id]` · `/assoc/clubs/[id]` · `/assoc/kennels/[id]` · `/assoc/permits/[id]` · `/assoc/foreign-pedigree/[id]` · `/review/vets/[id]` · `/review/centres/[id]` · `/review/centres/claims/[id]` · `/review/communities/[id]` · `/review/suggestions/[id]` · `/genetics/appeals/[id]` · `/genetics/receipts/[id]` · `/content/reports/[contentId]` · `/content/[id]` (publish, hide) · in-Drawer desks from `/market/listings`, `/market/disputes`, `/market/refunds`, `/market/sellers`, `/market/catalog`, `/market/finder/reports` and others

**Key screens:** **K3** میز تصمیم KYC (`/assoc/kyc/[id]`, including the stale-version state) · **K16** گزارش تخلف محتوا (`/content/reports/[contentId]`, outcomes «نگه داشتن · پنهان کردن · برداشتن»).

## Do / Don't

- **Do** show documents before the decision on mobile, and keep the decision panel fixed on desktop.
- **Do** send the version with every decision and keep the draft reason after a conflict.
- **Do** say the consequence under each outcome.
- **Don't** accept رد or اصلاح without a reason.
- **Don't** offer a download or a public link for private documents.
- **Don't** overwrite a newer version silently, or decide from the queue table.
