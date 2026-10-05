# ActionRow

A row of 2–3 Buttons/ButtonLinks with the primary at the start and secondaries after it; on phones it can stick to the bottom of the screen.

Use it at the end of forms, wizard steps, confirm dialogs, the decision desk and payment summaries. Do not use it for toolbars of icon buttons, for filters, or for a single button (a lone button needs no row).

## Anatomy

1. Container — flex, wrap, gap 12.
2. Primary action — first child (inline-start).
3. Secondary actions — after it; a destructive-outline action, if any, last.
4. Sticky variant — `bg-chrome` bar with a `border-default` top edge and `shadow-sticky`, padding 12 / 16.

## CSS API

| Class | Effect |
|---|---|
| `.hz-action-row` | Flex row, wrap, gap 12 |
| `.hz-action-row--sticky` | <768: `position: sticky; inset-block-end: 0`, `z-sticky`, chrome background, buttons share the width equally (`flex: 1 1 0`). ≥768: becomes a normal in-content row (no background, border, shadow or padding) |

```html
<div class="hz-action-row hz-action-row--sticky">
  <button class="hz-btn hz-btn--primary hz-btn--lg" type="submit">ادامه</button>
  <button class="hz-btn hz-btn--secondary hz-btn--lg" type="button">مرحله قبل</button>
</div>
```

The sticky row must be the last child of the scrolling container (page or sheet) so it sticks to its bottom.

## Tokens

`bg-chrome` · `border-default` · `shadow-sticky` · `z-sticky` · `space-8` / `space-12` / `space-16`; buttons bring their own tokens.

## Variants & sizes

- **2 actions** — «ارسال درخواست» + «ذخیره پیش‌نویس».
- **3 actions** — decision desk: «تأیید پرونده» (primary) + «درخواست اصلاح» (secondary) + «رد پرونده» (destructive-outline, last).
- **Sticky (mobile)** — wizard steps («ادامه» / «مرحله قبل»), payment («پرداخت ۴۰۰٬۰۰۰ تومان»). Use `lg` buttons inside.

## States

The row has no state; each button keeps its own (loading on the submitted one, the others disabled while it runs). Empty: never render an empty row. Error: the row stays; the error appears above it (Alert / field errors), never inside it. Long Persian text: buttons wrap to the next line in order; in the sticky bar equal-width buttons with long labels use `hz-btn--wrap`, or reduce to the primary + an IconButton/overflow menu.

## Mobile ↔ desktop

<768: sticky variant pins to the bottom of the viewport/sheet over scrolling content, buttons full-width-shared; the page needs bottom padding equal to the bar so the last field is not hidden. 768–1023 and ≥1024: in content, after the last field, buttons at their natural width. In OpsShell desktop the decision desk keeps the row in the sticky side column instead. All buttons ≥44px on touch.

## RTL & LTR

Order is logical: primary first = inline-start (right in RTL, left in LTR). Never reorder with `flex-direction: row-reverse` or physical floats.

## Accessibility

- DOM order = visual order = focus order: primary first.
- Wrap in a `<form>` where it submits; only one `type="submit"`.
- The sticky bar must not cover the focused field: scroll focused inputs into view above it (`scroll-padding-block-end` on the page).
- In dialogs, initial focus goes to the safest action (the secondary) for destructive confirmations.

## Data

Labels may carry data: the fee from the fee table («پرداخت ۴۰۰٬۰۰۰ تومان»); when the fee is unset the primary is disabled and the reason sits above the row. Which actions appear depends on role and case status (e.g. «درخواست اصلاح» only while the case is reviewable).

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/button.tsx`: `ActionRow({ primary: ReactNode, secondary?: ReactNode })` — two slots, not children. Keep; add `sticky?`.


`src/ui/button.tsx` — `ActionRow` (same file). Keep current children-based API. Follow ERRATA v2.0: start = primary. Propose `sticky?: boolean` (adds `hz-action-row--sticky`, mobile-only by CSS).

## Do / Don't

- Do put the primary first; Don't put «انصراف» before the main action.
- Do keep 2–3 actions; Don't add a fourth — move it into a «کنش‌های بیشتر» menu.
- Do use the sticky variant for long forms and payment on phones; Don't make it sticky on desktop.
- Don't stack two sticky bars (tab bar + action row): hide the tab bar on wizard and payment screens.
