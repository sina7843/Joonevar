# MergeTool

Merges two duplicate records of one kind (vets, centres, associations and clubs): the operator chooses which record is kept, picks each conflicting field side by side, checks the result preview, then confirms an irreversible merge.

Use it on the superadmin/review merge page (code: `MergeKindTabs`), usually opened from a duplicate suggestion or an unowned profile. Don't use it to edit a single record (use the record form) or to resolve ownership disputes (use the «Claim مراکز» desk first).

## Anatomy

1. **Page head**: «ادغام رکورد تکراری» + one-line explanation.
2. **Kind tabs**: Tabs (`.hz-tabs--sm`) with counts «دامپزشکان ۴»، «مراکز دامپزشکی ۲»، «انجمن و کلاب‌ها ۰».
3. **Records**: two cards — «رکورد اصلی — می‌ماند» (brand border, check-circle) and «رکورد تکراری — حذف می‌شود» (dashed, subtle). Ghost «جابه‌جایی اصلی و تکراری» swaps them.
4. **Field rows**: label column + two radio cards (`.hz-option`) per conflicting field. Identical fields collapse into «یکسان در هر دو: اصفهان». Locked fields (owner account) say «همیشه از رکورد اصلی». Empty values read «— وارد نشده».
5. **Result** (sticky column ≥1024): «نتیجه ادغام» KeyValueList of the chosen values, unresolved fields as «انتخاب نشده» in error colour, what moves with the merge («۲ دامپزشک وابسته و نشانی صفحه…»), primary «ادغام دو رکورد» and a status line «۱ فیلد انتخاب نشده است.». The primary opens SensitiveConfirm (type-to-confirm).

## CSS API

Bundle: `.hz-tabs` `--sm` `__tab` + `.hz-count` (Tabs), `.hz-option`, `.hz-option__text`, `.hz-card`, `.hz-kv`, `.hz-field__error`, `.hz-badge--sm`, `.hz-btn--primary` `--lg` `--block`, `.hz-desk__note`, `.hz-desk__bar` (mobile), `.hz-section-header--sm`, `.hz-alert`, `.hz-state--compact`.
Additions (`tools/css-additions/MergeTool.css`): `.hz-merge` (grid `1fr + 340px` ≥1024) `__main` `__records` `__record` (`--kept`/`--discarded`) `__role` `__name` `__meta` `__fields` `__row` (`--head`, `--error`) `__field` `__field-note` `__src` `__value` (`--empty`) `__same` `__result` `__pending`, and `.hz-merge--stacked` (forces the mobile form).

```html
<div class="hz-merge">
  <div class="hz-card hz-merge__main">
    <div class="hz-merge__records">…kept…discarded…</div>
    <div class="hz-merge__fields">
      <div class="hz-merge__row" role="radiogroup" aria-labelledby="f-type">
        <span class="hz-merge__field" id="f-type">نوع مرکز</span>
        <label class="hz-option"><input type="radio" name="f-type"><span class="hz-option__text"><span class="hz-merge__src">اصلی</span><span class="hz-merge__value">بیمارستان دامپزشکی</span></span></label>
        <label class="hz-option">…درمانگاه دامپزشکی…</label>
      </div>
    </div>
  </div>
  <aside class="hz-card hz-merge__result">…</aside>
</div>
```

## Tokens

`bg-surface` `bg-subtle` (discarded record, same-value strip) `border-default` `border-subtle` `border-brand` + `bg-brand-subtle` (kept record, chosen value, current tab) `text-brand` `text-secondary` `status-error-border` + `status-error-text` (unresolved) `status-success-*` (done) `status-warning-*` (blocked merge) `radius-lg` `radius-xl`.

## Variants & sizes

- **Kind**: vets (نام نمایشی، کد نظام، شهر، مرکز، تخصص), centres (نام، نوع، شهر، نشانی، تلفن، پروانه), associations/clubs (نام، نوع، دامنه، شهر). Field lists come from the kind config.
- **Field row**: choosable · identical · locked · both empty («در هیچ‌کدام ثبت نشده»).
- Values can be text, `<bdi>` identifiers/phones, or StatusBadges (licence «منقضی»).

## States

- **Default**: the kept record's values are preselected; fields where only the duplicate has a value preselect the duplicate; true conflicts start unselected.
- **Unresolved**: on submit, rows without a choice get `--error` + «برای «نوع مرکز» یکی از دو مقدار را انتخاب کنید.»; the result shows «انتخاب نشده»; the primary stays disabled with the count.
- **Hover / focus-visible**: as `.hz-option` (focus ring on the card).
- **Merging**: primary «در حال ادغام» + spinner; choices locked.
- **Done**: success Alert «دو رکورد ادغام شد» + «مشاهده رکورد اصلی» / «تکراری بعدی»; one AuditRow «ادغام» is written.
- **Blocked**: warning Alert when both records have a verified owner — resolve the claim first.
- **Empty**: «رکورد تکراری‌ای در «انجمن و کلاب‌ها» نیست» + how duplicates are found.
- **Long Persian text**: three-line centre names wrap inside the records, options and result; nothing truncates.

## Mobile ↔ desktop

- **≥1024**: comparison + sticky result column.
- **768–1023**: three-column rows (field · اصلی · تکراری), result card below.
- **<768**: `.hz-merge--stacked`: records stacked, each field = label then two option cards labelled «اصلی» / «تکراری»; the primary sits in the sticky bottom bar (`.hz-desk__bar`) with the unresolved count.

## RTL & LTR

The kept record is at the start (right in RTL) and its column comes first. «جابه‌جایی» uses `arrows-left-right` (symmetric, not mirrored). Phones and codes are `<bdi dir="ltr">`; Persian codes like «د-۴۸۲۱۷» stay RTL.

## Accessibility

- Kind tabs are `role="tab"` with `aria-selected` and roving `tabindex` (arrow keys); the comparison is the `tabpanel`.
- Each field row is `role="radiogroup"` labelled by the field name; unresolved rows get `aria-invalid` + `aria-describedby` to the error.
- The result's status line is `role="status"`.
- Focus order: tabs → records → swap → fields → result → merge.

## Data

Pair: `keptId`, `duplicateId`, `kind`, `fields[]` (`key`, `labelFa`, `kept`, `duplicate`, `locked?`), `relations` (counts that move: vets, reviews, redirects). Sends `{ kind, keptId, duplicateId, choices: { [key]: 'KEPT'|'DUPLICATE' }, reasonFa, expectedVersions }`. The duplicate is deleted and its public URL redirects to the kept record.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/admin/forms.tsx`: `MergeKindTabs({ current: MergeKind })` and `MergeForm`. Keep; MergeTool wraps them.


Existing `MergeKindTabs` — keep its props as in code. ★ New `src/admin/merge-tool.tsx`: `MergeTool({ kind, pair, fieldsConfig, onSwap, onMerge, busy, result })`. The final confirm is SensitiveConfirm with `confirmText` = the duplicate's name or id.

## Do / Don't

- Do say which record stays and which is deleted, on the records themselves.
- Do preselect only obvious choices and make real conflicts explicit.
- Do show the result before the merge, and confirm with SensitiveConfirm.
- Don't merge two records that both have a verified owner.
- Don't let the duplicate's owner or account data override the kept record silently.
