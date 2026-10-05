# DecisionDesk

The single operator decision surface. It shows the documents and the case history beside one fixed decision panel with three outcomes (تأیید · نیازمند اصلاح · رد). Every decision is versioned.

It replaces **21 separate forms** (`Decide*Form`, `*DecisionForm`) in 8 modules. That covers about 30 P10 pages: `/assoc/kyc/[id]`, `/assoc/vet-trusted/[id]`, `/review/centres/[id]`, `/genetics/appeals/[id]`, `/content/reports/[contentId]`, and others. Don't use it for irreversible admin actions without a decision (revoke, delete). Those use the sensitive-confirm dialog.

## Anatomy

1. **Record head** (card): breadcrumbs + «پرونده ۲ از ۴» prev/next, H1 «احراز هویت · علی رضایی» + StatusBadge, a meta line (کد پرونده, کد ملی, موبایل, last submission, age «۱۲ روز در صف», «نسخه ۳»), and ActionOwner («اقدام بعدی با: انجمن» + «مسئول: …»).
2. **Evidence column**: «مدارک» (`.hz-doc` frames with the zoom / rotate 90° / fullscreen toolbar and the `.hz-doc__private` note «مدرک خصوصی — فقط در میز تصمیم، بدون دانلود»), «اطلاعات اعلام‌شده» (KeyValueList, 2 columns), «سابقه پرونده» (Timeline, newest first, one entry per version).
3. **Decision panel** (`.hz-desk__decision`, sticky on desktop):
   - an optional stale Alert;
   - «تصمیم»: three `.hz-option` radio cards, each with a one-line consequence;
   - «دلیل» (required for اصلاح and رد): draft-reason chips + textarea + counter «۹۱ از ۵۰۰ نویسه»;
   - primary «ثبت تصمیم: نیازمند اصلاح» (the label follows the choice), then «تصمیم روی نسخه ۳ پرونده ثبت می‌شود و در سابقه می‌ماند.»
4. **Mobile**: the same sections stacked. The `.hz-desk__bar` (تأیید · اصلاح · رد) sticks to the bottom. Choosing اصلاح or رد opens a BottomSheet with the reason field.

## CSS API

Bundle: `.hz-desk` `__decision` `.hz-doc` `__tools` `__private` `.hz-option` `.hz-alert--warning` `.hz-kv--2col` `.hz-timeline` `.hz-field` `.hz-chip` `.hz-textarea` `.hz-sheet` `.hz-scrim`.
Additions (`tools/css-additions/DecisionDesk.css`): `.hz-desk__head` `__title` `__nav` `__meta` `__docs` `__options` `__note` `__bar` `__bar-actions`, `.hz-doc-figure` `__caption`, `.hz-doc img` (contain-fit).

```html
<div class="hz-desk">
  <div>…مدارک · اطلاعات اعلام‌شده · سابقه پرونده…</div>
  <aside class="hz-card hz-desk__decision" aria-labelledby="decide-h">
    <fieldset class="hz-desk__options"><legend class="hz-visually-hidden">نتیجه بررسی</legend>
      <label class="hz-option"><input type="radio" name="decision" value="approve">
        <span class="hz-radio__text"><b>تأیید</b><span class="hz-radio__desc">…</span></span></label> …
    </fieldset>
    <div class="hz-field">…chips + textarea required…</div>
    <button class="hz-btn hz-btn--primary hz-btn--lg hz-btn--block">ثبت تصمیم: نیازمند اصلاح</button>
  </aside>
</div>
```

## Tokens

`bg-surface` `bg-disabled` (document frame) `bg-subtle` `bg-chrome` (mobile bar) `border-default` `border-brand` + `bg-brand-subtle` (chosen option, pressed chip) `action-primary` `action-destructive` `status-warning-*` (stale alert) `status-error-text` (reason error, «رد» outline) `status-success-text` (national-ID check line) `shadow-sticky` `radius-xl` `radius-lg` `radius-sm` `focus-ring`.

## Variants & sizes

- **Decision set**: the default is the three-way set «تأیید · نیازمند اصلاح · رد». The one approved exception (11 Mehr 1405) is content reports, which use «نگه داشتن · پنهان کردن · برداشتن» because they decide about published content, not an applicant's case. No other module renames them.
- **Evidence**: documents (1–n), declared data, history. Sections with no data collapse to a one-line «—».
- **Danger**: on mobile «رد» is `--destructive-outline`, and the sheet's submit for رد is `--destructive`. On desktop one primary carries the chosen outcome.

## States

- **Default**: no option chosen and submit disabled («یک تصمیم انتخاب کنید»).
- **Option chosen**: the card turns brand-subtle. The reason becomes required for اصلاح and رد and optional for تأیید.
- **Draft chip**: inserts its sentence into an empty textarea. The operator edits from there.
- **Error**: an empty reason gives `aria-invalid` + «برای رد، دلیل را بنویسید یا یکی از دلیل‌های آماده را انتخاب کنید.»
- **Submitting**: the primary shows `aria-busy` + spinner and the options lock.
- **Stale (version conflict)**: the server rejects the decision because it was made on version 3 and the case is now on version 4. A `role="alert"` warning appears at the top of the panel: «تصمیم ثبت نشد — این پرونده پس از باز کردن شما تغییر کرده است. صفحه را دوباره بار کنید و سپس تصمیم بگیرید.» + «بارگذاری دوباره». Reloading keeps the typed reason as a draft. The tone is **warning** (the operator must act; nothing was saved). The approved mockup used error. Product owner to confirm.
- **Hover** (pointer): doc tools and icon buttons tint `action-secondary-hover`. Option cards only change the cursor.
- **Focus-visible**: a ring on the option card (`:has(input:focus-visible)`), the chips and the tools.
- **Long Persian text**: the reason textarea grows and the counter caps at 500. Long applicant names wrap in the H1, never truncate.

## Mobile ↔ desktop

- **<1024**: one column with documents first. Each doc has its tools in a row below it, 44px. The `.hz-desk__bar` is sticky at the bottom (render it with `.hz-hide-lg`). اصلاح and رد open a BottomSheet (<768) or a Modal (768–1023) with the reason field and the submit.
- **≥1024**: `.hz-desk` grid `1fr + 380px`. The decision panel is sticky at `inset-block-start: 80px`, below the ops topbar.

## RTL & LTR

The evidence column comes first (start) and the decision column sits at the end. IDs are `<bdi class="hz-id" dir="ltr">`. Prev/next case uses `caret-left`/`caret-right` mirrored, and mobile back uses `arrow-left` mirrored. `magnifying-glass-plus`, `arrow-clockwise` (rotate stays clockwise in both directions), `corners-out`, `lock-simple`, `check`, `x` and `warning` are not mirrored.

## Accessibility

- The decision is a `<fieldset>` with a hidden legend «نتیجه بررسی». Radios get native arrow-key navigation.
- The reason has `required` and `aria-describedby` (counter, error). The error is linked and announced.
- The stale alert is `role="alert"`, and focus moves to «بارگذاری دوباره».
- The doc toolbar is `role="toolbar"` with Persian `aria-label`s. Each document image has `alt` naming the side and the person.
- The mobile sheet is `role="dialog" aria-modal="true"`. It traps focus and returns it to the bar button.
- Focus order: head → documents → data → history → decision.

## Data

- **Case**: `id`, `version` (integer, sent back with the decision as `expectedVersion`), `status`, `actionOwner`, `assignee`, `submittedAt`.
- **Documents**: `files[]` (`kind`, `uploadedAt`, `size`), served from a private, no-download route.
- **Declared fields**: per module (KYC: نام، کد ملی، تاریخ تولد، موبایل، شهر، نشانی). Missing optional fields show «— اختیاری؛ وارد نشده».
- **History**: `decisions[]` (`version`, `outcome`, `reasonFa`, `actor`, `at`).
- **Draft reasons**: per-queue configuration, e.g. KYC «تصویر خوانا نیست · تاریخ تولد مطابقت ندارد · مدرک ناقص است». The رد drafts in the preview are illustrative.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** Today each module has its own decision form: `ReviewForm` (`app/assoc/kyc/review-form.tsx`), `KennelReviewForm`, `PermitReviewForm`, `ForeignReviewForm`, `Decide*CaseForm` in `src/vets/`, the genetics forms in `app/genetics/forms.tsx`, `DecisionForm` (`src/moderation/forms.tsx`)… All post `expectedVersion`. DecisionDesk is ★ new and hosts these forms' fields.


New ★ `src/ops/decision-desk.tsx`: `DecisionDesk({ caseId, version, header, evidence, history, outcomes = ['APPROVE','NEEDS_CORRECTION','REJECT'], reasonRequiredFor = ['NEEDS_CORRECTION','REJECT'], draftReasons, onDecide({ outcome, reasonFa, expectedVersion }), conflict })`. Keep the existing `ReviewPanel` and `DocumentPreview` (`src/vets/review-forms.tsx`) as the evidence column and add zoom/rotate. Each of the 21 `Decide*Form` / `*DecisionForm` becomes a config object (outcome copy + draft reasons + server action).

## Do / Don't

- Do keep the three labels exactly تأیید · نیازمند اصلاح · رد and say the consequence under each.
- Do send the version with every decision. Never overwrite a newer version silently.
- Do keep private documents in the desk with no download link.
- Don't show the decision panel before the documents on mobile.
- Don't accept «رد» or «نیازمند اصلاح» without a reason.
