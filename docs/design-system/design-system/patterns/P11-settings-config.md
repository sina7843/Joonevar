# P11 — Settings and configuration · تنظیمات و پیکربندی

## Purpose

Where admins set the values the rest of the product runs on: 146 system settings in 14 groups (fees, deadlines, SMS, help text, integrations, marketplace, mating finder…), market commission, plans, active species and promotions, breed profiles, content roles and categories. Users also edit their own profile here. The values are read by every other pattern: a fee left `null` closes a payment path in P04, P07 and P08, and a deadline drives ages in P09. So the pattern is about **finding the right key fast, seeing what is unset, and changing one value safely**, versioned and with a mandatory reason that is recorded in `/admin/audit`.

**Don't use it** for records with a lifecycle and a review (cases, listings → P09/P10), for creating an entity step by step (P07), or for irreversible operations (`SensitiveConfirm`, `MergeTool`).

## Anatomy (top to bottom)

1. **Shell:** `OpsShell` (`PublicShell` for `/account/profile`, `/account/vet-profile`, `/profile`).
2. **`PageHeader`:**
   - `h1` «تنظیمات»
   - meta «۱۴۶ کلید در ۱۴ گروه · هر تغییر نسخه‌دار است و با دلیل در تاریخچه می‌ماند»
   - `TextLink` «تاریخچه تغییرات» → `/admin/audit`
3. **Group navigation:** `SettingsPanel` group nav, 240px. It lists «۱۴ گروه» with one dense item per group, the current group marked `aria-current`, and a warning dot on groups holding an unset value.
4. **Tools:**
   - `SearchField`, which matches the Persian label *and* the Latin key (`fee.pedigree_toman`)
   - the toggle chip «فقط تعیین‌نشده ۲۶»
   - the result count
5. **Group card:** `SectionHeader --sm` + the unit note «مبلغ‌ها به تومان», then one row per key:
   - start: Persian name + Latin key in `bdi`
   - end: the value (money, number + unit, `Switch` state, short text, enum), or `UnsetValue` «تعیین‌نشده» in warning tone
   - a ghost «ویرایش» or «تعیین مقدار»
6. **Edit area** (inline, one row at a time):
   - «مقدار فعلی · نسخه ۲» beside «مقدار تازه» (`MoneyField` / `TextField` with unit / `SelectField` / `Switch` / `TextAreaField`)
   - «دلیل تغییر *» (`ReasonField` without draft chips)
   - «ذخیره به‌عنوان نسخه ۳» (primary, start) · «انصراف»
7. **Entity config pages** (`/admin/breeds/[id]`, `/admin/roles`, `/market/commission`):
   - the same row model in `Tabs` sections
   - `ImageUploader` for the one image, with the crop preview in all frames and mandatory `imageAltFa`
   - `DataTable` for rule lists (commission tiers)

## Layout

| | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Group nav | none. Groups become `Accordion` rows with the unset dot; search on top | group `SelectField` above the list | 240px nav at the start, sticky at `header-app` + `space-16` |
| List | one column of rows; name above value | rows full width | group card in the remaining `container-app` width |
| Editing | **separate page** (`/market/settings/[key]` exists; `/admin/settings/[key]` is proposed) with a sticky «ذخیره» `ActionRow` | inline in the row | inline in the row; long text in a `Drawer` from the end |
| Primary action | sticky at the bottom of the edit page | in the edit area | in the edit area (there is no page-level primary) |
| Overlays | `BottomSheet` for enum choices | `Modal` | `Drawer` / popover |
| Density | 44px targets, padding `space-16` | dense rows | dense rows (`control-sm` 36 on fine pointers), panel padding `space-16`–`space-20`, sections `space-16` |

## States

- **Loading:** a Skeleton nav (item bars) + a group card with name/value row bars. The unset count chip shows no number until it is known.
- **Empty search:** «تنظیمی با «پیامک تولد» پیدا نشد» + «با کلید لاتین هم جستجو کنید.»
- **Unset value:** «تعیین‌نشده» (warning text), the action «تعیین مقدار», and the hint «تا تعیین مقدار، پرداخت این خدمت بسته است.» Unset values sort last in cross-group results.
- **Editing:** one row expands with a «پیش‌نویس» neutral badge until saved. Opening another row asks to discard the draft first.
- **Validation:** the reason is required. An empty money value means «تعیین‌نشده», never ۰. Out-of-range numbers name the allowed range.
- **Saving:** the primary shows `aria-busy`. Saved shows a `Toast` «نسخه ۳ ذخیره شد» and the row returns to read-only.
- **Conflict:** the key moved past the opened version, so a warning `Alert` shows «این تنظیم پس از باز کردن شما تغییر کرده است…» with the new value. The draft is kept.
- **Error / network:** NetworkErrorState in the group card with «تلاش دوباره». The nav stays.
- **Locked / permission:** `AccessDenied` (role) for non-superadmins on `/admin/*`. Market settings follow the capability matrix, and keys a role may read but not edit show the value with no «ویرایش» and a `Tooltip` naming the role that can.
- **Hard cases:** a long help-text value («متن راهنمای ارسال نمونه به مرکز ژنتیک») wraps on its own full-width line (`--text`). Long Latin keys stay on one line inside their column. Big amounts keep their «٬» separators. A breed with no image shows the `RecordImage` placeholder in every frame.

## Content & data rules

- Money is integer تومان, Persian digits. Units are spelled out («روز», «پیامک»). Booleans read «فعال / غیرفعال». Unset is always «تعیین‌نشده».
- Every change records `{ key, value, reasonFa, expectedVersion }`. History lives in `/admin/audit` (`AuditRow`: when, who, before → after, reason).
- The Latin key is shown under every Persian name. Operators search by both.
- Group names come from `SettingGroup` (14 groups; proposed labels to confirm).
- Action order: «ذخیره به‌عنوان نسخه N» (primary, start), «انصراف» (secondary).

## Accessibility & keyboard

- Landmarks: `nav aria-label="گروه‌های تنظیمات"` and `main`. Each group is a `section` labelled by its header.
- Focus order: search → «فقط تعیین‌نشده» → group nav → rows (each «ویرایش» names its setting: «ویرایش هزینه صدور شجره‌نامه») → edit form.
- Opening an edit moves focus to «مقدار تازه». Cancel returns focus to «ویرایش». The edit area is a `form` labelled by the setting name.
- The unset dot has the visually hidden text «دارای مقدار تعیین‌نشده». The filter chip uses `aria-pressed`. The result count is `aria-live="polite"`. The conflict alert is `role="alert"`.
- Esc cancels an inline edit when the draft is unchanged; otherwise it asks first.

## Pages that use it (about 14)

`/admin/settings` (146 keys) · `/market/settings` · `/market/settings/[key]` · `/market/commission` · `/market/plans` · `/market/species` · `/market/promotions` · `/admin/breeds/[id]` · `/admin/roles` · `/admin/mating-finder` · `/content/categories` · `/account/profile` (+ `/account/profile/mobile`) · `/account/vet-profile` · `/account/clubs/[id]/rules`

**Key screen:** **K15** تنظیمات (`/admin/settings`).

## Do / Don't

- **Do** group the 146 keys and surface unset values with the «فقط تعیین‌نشده» filter.
- **Do** require a reason for every change and say where it is recorded.
- **Do** keep the editing row in place on desktop, so the operator never loses context.
- **Don't** flatten the groups back into one list.
- **Don't** show «۰ تومان» or «رایگان» for an unset value.
- **Don't** edit several rows at once, or save without a version check.
