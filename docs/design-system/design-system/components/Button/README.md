# Button

A `<button>` that performs an action, in five tones and three sizes, with an optional start icon and a loading state.

Use Button for actions on the current page: submit, pay, approve, reject, upload again. To go to another page use ButtonLink (same look on `<a>`) or a TextLink. At most **one primary** per view; place groups of buttons in an ActionRow (start = primary).

## Anatomy

1. Container — `radius-md` 12, 1px border (transparent except secondary/destructive-outline), height from `control-*`.
2. Start icon (optional) — `icon-sm` 20 (`xs` 16 in `sm`), gap 8 (6 in `sm`).
3. Label — `label` 15/24 · 700 (`label-sm` 13/20 in `sm`), one line by default.
4. Spinner (loading) — replaces the start icon; label changes to the in-progress verb.

## CSS API

| Class / attribute | Effect |
|---|---|
| `.hz-btn` | Base, md 44 |
| `.hz-btn--primary` · `--secondary` · `--ghost` · `--destructive` · `--destructive-outline` | Tone |
| `.hz-btn--sm` · `--lg` | 36 · 48 |
| `.hz-btn--block` | Full width (`display:flex; width:100%`) |
| `.hz-btn--wrap` | **New** (css-additions/Button.css): label may wrap, height grows from the size minimum — for data-driven labels in block buttons |
| `:disabled`, `[aria-disabled="true"]` | `bg-disabled` / `text-disabled`, `not-allowed` |
| `[aria-busy="true"]` + `.hz-spinner` | Loading, pointer events off |

```html
<button class="hz-btn hz-btn--primary hz-btn--lg" type="button">
  <svg class="hz-icon hz-icon--sm" viewBox="0 0 256 256" aria-hidden="true">…plus…</svg>ثبت حیوان
</button>
<button class="hz-btn hz-btn--primary" type="submit" aria-busy="true">
  <span class="hz-spinner" aria-hidden="true"></span>در حال ارسال…
</button>
```

## Tokens

`action-primary` / `action-primary-hover` / `text-on-action` · `action-secondary` / `action-secondary-hover` / `border-control` / `text-primary` · `text-brand` (ghost) · `action-destructive` · `status-error-text` / `status-error-bg` (destructive-outline, destructive hover halo) · `bg-disabled` / `text-disabled` · `focus-ring` · `radius-md` · `control-sm|md|lg` · `duration-fast` / `ease-standard`.

## Variants & sizes

| Tone | Use | Example |
|---|---|---|
| primary | the one main action of the view | «ثبت حیوان»، «پرداخت ۴۰۰٬۰۰۰ تومان» |
| secondary | every other action; white with `border-control` | «انصراف»، «بارگذاری دوباره» |
| ghost | low-emphasis action in dense places | «ویرایش پیش‌نویس» |
| destructive ★ | confirmed, irreversible step (inside the confirm dialog) | «رد پرونده» |
| destructive-outline ★ | the risky action offered next to others | «تعلیق فروشنده»، «حذف آگهی» |

Sizes: `sm` 36 — OpsShell desktop only (tables, toolbars); `md` 44 — default and touch minimum; `lg` 48 — primary actions, search, mobile block buttons.

## States

default · hover (pointer only: primary → `action-primary-hover`, secondary/ghost → `action-secondary-hover`, destructive → 3px `status-error-bg` halo, destructive-outline → `status-error-bg`) · focus-visible (`focus-ring` 2px + 2px offset) · active/pressed (same as hover) · disabled (`disabled` attribute; explain why next to it — e.g. a fee that is «تعیین‌نشده» keeps «پرداخت» disabled) · loading (`aria-busy="true"`, spinner, label «در حال ارسال…»; keep the tone colour; block double submit) · error — buttons do not turn red; the form or Alert shows the error and the button returns to default · long Persian text — one line where there is room; in a narrow block button use `hz-btn--wrap` (sample: «ثبت درخواست صدور شجره‌نامه برای شاهزاده کوچولوی باغ ارم شیراز»).

## Mobile ↔ desktop

<768: primary actions become `lg` + `block`, usually inside a sticky ActionRow; nothing below 44px. 768–1023: inline, `md`. ≥1024: inline, `md`; `sm` only in OpsShell tables and toolbars (pointer devices).

## RTL & LTR

Icon at inline-start via flex order (no margins). Directional start icons (e.g. back) use the LTR glyph + `hz-icon--mirror`. Money and counts inside labels use Persian digits; a Latin code inside a label goes in `<bdi dir="ltr">`.

## Accessibility

- Always set `type` (`button` | `submit`); default in code is `button`.
- Disabled: use the `disabled` attribute and give the reason in visible text linked by `aria-describedby`; for a control that must stay focusable use `aria-disabled="true"` and block the handler.
- Loading: `aria-busy="true"` on the button and a polite live region announcing «در حال ارسال…»; restore focus to the button after completion.
- Icon-only buttons are IconButton, not Button.
- Destructive actions open a confirm dialog naming the object («رد پرونده HZ-…؟») with the destructive button inside.

## Data

Labels are verbs from copy, optionally with data: amount («پرداخت ۴۰۰٬۰۰۰ تومان» from the fee table; when the fee is `null` the button is disabled and the amount shows «تعیین‌نشده»), animal name in long labels. Never show «۰ تومان».

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/button.tsx`: `Button({ tone: 'primary' | 'secondary' | 'ghost' = 'primary', block = false, type = 'button', disabled, className, ...native button props })`. Confirmed; add the `destructive` tones and `size`.


`src/ui/button.tsx` — `Button`. **Keep** `tone`, `block`, `type`, `disabled` exactly. `tone` gains `'destructive'` and `'destructive-outline'`. **Propose** `size?: 'sm' | 'md' | 'lg'` (default `md`), `iconStart?: IconName`, `loading?: boolean` (sets `aria-busy`, swaps icon for spinner, takes `loadingLabel` default «در حال ارسال…»), `wrap?: boolean`.

## Do / Don't

- Do keep one primary per view; Don't make two equal primaries. Exception: the SiteShell header's «ورود / ثبت‌نام» is chrome and is not counted.
- Do write the label as a verb, with the amount when paying; Don't use «تأیید» alone when «تأیید پرونده» is clearer.
- Do disable with a visible reason; Don't silently hide a blocked action.
- Don't use red (destructive) for «انصراف» — cancel is secondary.
- Don't use a Button to navigate; use ButtonLink.
