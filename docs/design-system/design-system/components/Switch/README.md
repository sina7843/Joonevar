# Switch

An on/off control for a boolean setting that takes effect immediately, such as «نمایش شماره تماس در آگهی».

Use it in settings and profile pages where the change applies at once and is easy to reverse (visibility of phone number or council code, a club's permission to publish). Use a Checkbox inside forms that are submitted together, for consents, or when the choice is part of a bigger decision. Never use a Switch for a destructive or paid action.

## Anatomy

1. Setting row `.hz-switch-row`: label (600) + description (what changes, who sees it) at the start.
2. `.hz-switch` at the end: 44 × 24 track, 20px thumb. Off = thumb at inline-start on a sand track; on = thumb at inline-end on `action-primary`.
3. Optional status line under the description: «در حال ذخیره…» (spinner) or error.

## CSS API

| Class | Use |
|---|---|
| `.hz-switch` | `<button role="switch" aria-checked>`; `::after` extends the hit area to 64 × 44 |
| `.hz-switch[aria-busy="true"]` | Saving — dimmed, not clickable |
| `.hz-switch-row` | Label/description at start, switch at end; rows separated by `border-subtle` |
| `.hz-switch-row__text` · `__label` · `__desc` · `__status` | Text parts |

```html
<div class="hz-switch-row">
  <span class="hz-switch-row__text">
    <label class="hz-switch-row__label" for="phone" id="phone-l">نمایش شماره تماس در آگهی</label>
    <span class="hz-switch-row__desc" id="phone-d">خریداران شماره <bdi class="hz-id" dir="ltr">09990000002</bdi> را در صفحه آگهی می‌بینند.</span>
  </span>
  <button class="hz-switch" id="phone" type="button" role="switch" aria-checked="true"
          aria-labelledby="phone-l" aria-describedby="phone-d"></button>
</div>
```

## Tokens

Track off `border-control`, hover `icon-default` · on `action-primary`, hover `action-primary-hover` · thumb `bg-surface` · disabled off `bg-disabled` + inset `border-default`, disabled on `text-disabled` · focus `focus-ring` · row divider `border-subtle` · `radius-full`. No shadows on the thumb (lines, not shadows).

## Variants & sizes

One size (44 × 24). Standalone (in a table cell or card header, with `aria-label`) or in a `.hz-switch-row`.

## States

Off · on · hover (pointer only) · focus-visible (2px ring around the track) · **saving** (`aria-busy`, status «در حال ذخیره…») · **error**: the switch flips back and the row says «ذخیره نشد و کلید به حالت قبل برگشت. اتصال را بررسی کنید و دوباره امتحان کنید.» · **disabled/locked** with what · why · what unlocks it («این نشان فقط برای دامپزشکان معتمد است. پس از آنکه انجمن درخواست شما را تأیید کند، فعال می‌شود.») · **long Persian label** wraps; the switch stays top-aligned with the first line.

## Mobile ↔ desktop

Same row at every width; the whole label is clickable (`<label for>` points at the button). Hit area ≥ 44px tall on all pointers. In OpsShell settings tables the switch can sit in the value column of `.hz-setting` (SettingsPanel).

## RTL & LTR

«On» moves the thumb toward inline-end (left in RTL, right in LTR) through `inset-inline-start`, so no mirroring is needed. Phone numbers and codes in descriptions are isolated `<bdi class="hz-id" dir="ltr">`.

## Accessibility

`<button type="button" role="switch" aria-checked="true|false">` · name from the visible label (`aria-labelledby`), consequence from the description (`aria-describedby`) · Space and Enter toggle · status and errors in a polite live region (`role="status"`) · never convey state by colour alone: thumb position + `aria-checked`. Do not add «روشن/خاموش» text inside the track.

## Data

Booleans on the record, e.g. `showCouncilCode` (vet profile), listing «show phone» flag, community `canPublishPosts`, admin boolean settings (`/admin/settings`, versioned and audited). Optimistic update: flip at once, send, revert and show the error on failure.

## Code mapping

★ Proposed `Switch` in `src/ui/switch.tsx`: `checked`, `onCheckedChange(checked) => Promise<void>` (the component shows saving and reverts on rejection), `label`, `description?`, `disabled?`, `disabledReason?`, `id?`. A `SwitchRow` wrapper renders the row layout; a bare `Switch` needs `aria-label`.

## Do / Don't

- Do describe the consequence, not the control: «خریداران شماره … را می‌بینند».
- Do revert on failure; never leave the switch showing a state that was not saved.
- Don't put a Switch inside a form with a «ذخیره» button — use a Checkbox there.
- Don't use a Switch for consent, payment or anything irreversible.
