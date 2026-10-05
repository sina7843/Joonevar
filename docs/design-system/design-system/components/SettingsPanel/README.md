# SettingsPanel

The superadmin configuration surface at `/admin/settings`. It turns today's flat list of **146 keys** into **14 groups** with search, an «فقط تعیین‌نشده» filter, and inline editing that is versioned and needs a mandatory reason.

Use it for the P11 pages: `/admin/settings`, `/market/settings/[key]`, `/market/commission`, and the key/value parts of `/admin/breeds/[id]` and `/admin/roles`. Don't use it for records with a lifecycle (cases, listings). Those go through CaseQueue → DecisionDesk.

## Anatomy

1. **Group nav** (`.hz-settings__nav`, 240px): «۱۴ گروه», then one dense item per group. The current group gets `aria-current`. Groups that hold an unset value carry a warning dot (`.hz-settings__flag`).
2. **Page head**: «تنظیمات» + «۱۴۶ کلید در ۱۴ گروه · هر تغییر نسخه‌دار است و با دلیل در تاریخچه می‌ماند» + the link «تاریخچه تغییرات» (`/admin/audit`).
3. **Tools**: search (matches the Persian name *and* the Latin key) and the toggle chip «فقط تعیین‌نشده ۲۶».
4. **Group card**: SectionHeader (sm) + unit note «مبلغ‌ها به تومان», then one `.hz-setting` row per key:
   - start: Persian name, Latin key `<bdi>`;
   - end: value, or «تعیین‌نشده» in warning tone, + «ویرایش» / «تعیین مقدار».
5. **Edit area** (`.hz-setting__edit`, inline): «مقدار فعلی · نسخه ۲» beside «مقدار تازه» (with a unit suffix), «دلیل تغییر *», then «ذخیره به‌عنوان نسخه ۳» · «انصراف» and a conflict hint.

## CSS API

Bundle: `.hz-settings` (grid 240 + 1fr ≥1024) `.hz-setting` `__name` `__key` `__value` `__value--unset` `.hz-side-item--dense` `.hz-chip[aria-pressed]` `.hz-input-wrap--suffix` `.hz-field` `.hz-badge--neutral` (پیش‌نویس).
Additions (`tools/css-additions/SettingsPanel.css`): `.hz-settings__nav` `__nav-title` `__flag` `__main` `__tools`, `.hz-setting__label` `__end` `__group` `__hint` `__edit` `__edit-fields`, modifiers `.hz-setting--text` (long text value on its own line) and `.hz-setting--editing`.

```html
<div class="hz-setting">
  <div class="hz-setting__label"><span class="hz-setting__name">هزینه صدور شجره‌نامه</span>
    <bdi class="hz-setting__key" dir="ltr">fee.pedigree_toman</bdi></div>
  <div class="hz-setting__end"><span class="hz-setting__value">۴۰۰٬۰۰۰ تومان</span>
    <button class="hz-btn hz-btn--ghost hz-btn--sm" aria-label="ویرایش هزینه صدور شجره‌نامه">…ویرایش</button></div>
</div>
```

## Tokens

`bg-surface` `bg-subtle` (edit area) `border-default` `border-subtle` (row rules) `text-primary` `text-secondary` (key, hints) `status-warning-text` (unset value) `status-warning-border` (group flag) `bg-brand-subtle` `text-brand` (current group, ghost edit) `action-primary` `focus-ring` `border-brand` `radius-xl` `radius-lg` `radius-full`.

## Variants & sizes

- **Value types**: money (Persian digits + «تومان»), number + unit (days), boolean (Switch: «فعال»/«غیرفعال»), short text, long text (`--text`, wraps under the name), enum (Select).
- **Value state**: set · **unset** («تعیین‌نشده», warning tone, action «تعیین مقدار», hint «تا تعیین مقدار، پرداخت این خدمت بسته است.»).
- **Scope**: one group (default) · cross-group results (search or the unset filter), where each row shows its group name above the name (`.hz-setting__group`).

## States

- **Default**: read-only rows.
- **Hover** (pointer): ghost button tint.
- **Focus-visible**: a ring on nav items, rows' buttons and inputs. The preview shows it on «مقدار تازه».
- **Editing**: only one row at a time and the row expands in place. It shows a «پیش‌نویس» badge until saved.
- **Validation**: the reason is required. An empty money value means «تعیین‌نشده», never ۰.
- **Saving**: the primary shows `aria-busy`.
- **Conflict**: if the key moved past the opened version, the save is rejected. A warning Alert shows «این تنظیم پس از باز کردن شما تغییر کرده است…» with the new value, and the draft is kept.
- **Saved**: a toast «نسخه ۳ ذخیره شد» and the row returns to read-only.
- **Empty search**: «تنظیمی با «پیامک تولد» پیدا نشد» + a hint to search the Latin key.
- **Long Persian text**: a help-text value («متن راهنمای ارسال نمونه به مرکز ژنتیک», from the edge-case announcement summary) wraps on its own full-width line.

## Mobile ↔ desktop

- **<768**: no side nav. Groups become accordion rows (`.hz-accordion-row`) with the unset dot, and search sits on top. Editing opens a separate page (`/admin/settings/[key]`) with a sticky «ذخیره» bar. Targets are 44px.
- **768–1023**: the group nav becomes a Select above the list, and editing happens inline.
- **≥1024**: 240px nav (sticky at 80px) + list. Editing happens inline, or in a Drawer for long text.

## RTL & LTR

The name sits at the start and the value and action at the end. Latin keys are isolated LTR (`direction: ltr; unicode-bidi: isolate`) but aligned to the start of the column. Money stays RTL with Persian digits. The `clock-counter-clockwise` (history), `pencil-simple` and `magnifying-glass` icons are not mirrored.

## Accessibility

- The nav is `<nav aria-label="گروه‌های تنظیمات">` and the current group has `aria-current="page"`. The flag dot has a visually hidden «دارای مقدار تعیین‌نشده».
- Each edit button names its setting. The edit area is a `<form>` labelled by the setting name, and focus moves to «مقدار تازه» on open and back to «ویرایش» on cancel.
- The reason uses `required` + `aria-describedby`. The conflict alert is `role="alert"`.
- The filter chip is a toggle (`aria-pressed`), and the result count is announced (`aria-live="polite"`).

## Data

- Source: `src/settings/keys.ts`. Per key: `key`, `labelFa`, `group` (`SettingGroup`, present in data but unused in today's UI), `type`, `value`, `version`, `updatedBy`, `updatedAt`. History lives in `/admin/audit`.
- Real values in the preview come from `fees.json` (the six `fee.*` keys and `genetics_centre.test_fee_toman`). `notConfiguredCount` = ۲۶.
- **Illustrative, to confirm**: the 14 group names (from 02/07: تعرفه، مهلت، پیامک، متن راهنما، اتصال‌ها، بازار، جفت‌یابی + proposed مرکز ژنتیک، اعلان‌ها، عضویت و انجمن، پروانه‌ها، تبلیغات، ورود و امنیت، سامانه); the unset key names (`ads.basic_package_toman`, `licence.centre_issue_toman`, `finder.listing_fee_toman`) and `help.genetics_sample_notice`; the version numbers.

## Code mapping

New ★ `src/admin/settings-panel.tsx`: `SettingsPanel({ groups: SettingGroup[], settings, activeGroup, query, unsetOnly, onSave({ key, value, reasonFa, expectedVersion }), editingKey })`. Row ★ `SettingRow({ setting, editing, onEdit, onCancel })`. Value formatting reuses the shared money and «تعیین‌نشده» helpers. Saving is versioned like DecisionDesk (`expectedVersion`).

## Do / Don't

- Do show «تعیین‌نشده» for every null value and keep that payment path closed. Never show ۰ تومان.
- Do show the Latin key under every Persian name. Operators search by both.
- Do require a reason for every change and say where it is recorded.
- Don't edit several rows at once, and don't save without a version check.
- Don't flatten the groups back into one 146-row list.
