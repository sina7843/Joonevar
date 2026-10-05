# StickyActionBar

A cream bar pinned to the bottom of the phone screen that carries the step's or payment's main action, with an optional one-line summary and the iPhone safe-area inset.

Use it on phones for the 6-step `/animals/new` form, other multi-step forms (P7), payment and checkout summaries, and record pages whose main action must stay reachable (P3/P6). For a bar of buttons only, `ActionRow --sticky` is enough; use StickyActionBar when the bar must also say **where you are or what you pay**. Not for desktop, not for filters, never stacked on the tab bar.

## Anatomy

1. Bar — `bg-chrome`, `border-default` top edge, `shadow-sticky`, `z-sticky`; padding 12/16, bottom padding + `env(safe-area-inset-bottom)`.
2. Summary (optional) — context at start (13/20 `text-secondary`, one line, «…») and total at end (16/24 ExtraBold `text-primary`).
3. Actions — primary first and widest (`lg`, 48px); optional secondary («مرحله قبل») at natural width.
4. Note (optional) — 12/20 `text-secondary` reason under the actions when the primary is disabled.

## CSS API

| Class | Role |
|---|---|
| `.hz-sticky-bar` | Bar. <768 `position: sticky; inset-block-end: 0`; ≥768 static, no chrome (in-content block) |
| `__summary` · `__context` · `__total` · `__total--unset` | Summary line |
| `__actions` | Buttons row; buttons share width, a secondary keeps its natural width |
| `__note` | Reason line (`id` referenced by the disabled button's `aria-describedby`) |
| `.hz-has-sticky-bar` | On the scrolling page: `scroll-padding-block-end` so focused fields are not hidden |

```html
<div class="hz-sticky-bar" role="region" aria-label="کنش‌های مرحله">
  <div class="hz-sticky-bar__summary"><span class="hz-sticky-bar__context">مرحله ۴ از ۶، مدارک</span><span>پیش‌نویس ذخیره شد</span></div>
  <div class="hz-sticky-bar__actions">
    <button class="hz-btn hz-btn--primary hz-btn--lg" type="submit">ادامه</button>
    <button class="hz-btn hz-btn--secondary hz-btn--lg" type="button">مرحله قبل</button>
  </div>
</div>
```

The bar is the last child of the scrolling container (page `<main>` or a sheet body) so it sticks to its bottom.

## Tokens

`bg-chrome` · `border-default` · `shadow-sticky` · `z-sticky` · `text-primary` · `text-secondary` · `space-8/12/16` · Button tokens. Safe area: `env(safe-area-inset-bottom)` (needs `viewport-fit=cover` in the app's viewport meta).

## Variants & sizes

- **Wizard step** — summary «مرحله ۴ از ۶، مدارک» + autosave note; «ادامه» + «مرحله قبل» (on step 1 only «ادامه»; on step 6 «ارسال درخواست»).
- **Payment** — summary «صدور شجره‌نامه، لونا» + «۴۰۰٬۰۰۰ تومان»; one button «پرداخت ۴۰۰٬۰۰۰ تومان» with `lock-simple`.
- **Unset fee** — total «تعیین‌نشده» (`__total--unset`), primary disabled, note explains; never «۰ تومان».
- **Actions only** — use `ActionRow --sticky` instead.

One size; buttons are always `lg` inside.

## States

Default · focus-visible (each button's ring, shown statically) · loading: the submitted button gets `aria-busy="true"` + `.hz-spinner` + «در حال انتقال به درگاه», the secondary is disabled meanwhile · disabled: primary `disabled` + visible `__note` (no tooltip) · error: the bar stays; the error is an Alert or field errors above, and focus moves to the first invalid field · empty: never render a bar without an action · long Persian text: the context truncates with «…» on one line, the total never truncates; button labels wrap only with `hz-btn--wrap`.

## Mobile ↔ desktop

- **<768:** sticky at the bottom; the PublicShell tab bar is hidden on wizard and payment screens (never two bars). Page needs `.hz-has-sticky-bar` and bottom space equal to the bar.
- **768–1023 and ≥1024:** the same markup becomes an in-content block after the last field (no background, border, shadow, padding); in P7 desktop the summary also appears in the side summary column, so the in-content summary may be hidden there.
- Touch targets 48px; the bar never covers the on-screen keyboard's focused field (scroll-padding).

## RTL & LTR

Primary first = inline start (right in RTL). Context at start, total at end. Directional icons (e.g. a forward arrow on «ادامه») use the LTR glyph + `hz-icon--mirror`; `lock-simple` is not mirrored.

## Accessibility

- `role="region"` + `aria-label` («کنش‌های مرحله» / «پرداخت») so it is findable; DOM order = visual order.
- The summary is plain text read before the buttons; the total is not `aria-live` (it changes only with the step's data).
- Disabled primary has `aria-describedby` → `__note`. Loading button keeps its accessible name updated («در حال انتقال به درگاه»).
- `scroll-padding-block-end` keeps focused fields above the bar (WCAG 2.4.11 focus not obscured).

## Data

Step index/total from the draft (`draftStep`, `draftStepsTotal` = 6); autosave time from the draft's `updatedAt`. Payment: service label and `amount.displayFa` from the request (`priceToman` → «۴۰۰٬۰۰۰ تومان»); unset fee (`null`) → «تعیین‌نشده» and the path stays closed. Animal name falls back to «بدون نام».

## Code mapping

★ New — today the forms render `ActionRow` at the end of the content. Proposed `StickyActionBar` in `src/ui/button.tsx` beside `ActionRow`: `summary?: ReactNode`, `total?: string | null` (null → «تعیین‌نشده»), `note?: string`, `ariaLabel`, `children` (the buttons). It renders `ActionRow` inside, so `ActionRow sticky` and `StickyActionBar` share one sticky implementation.

## Do / Don't

- Do keep one primary action, first; put «مرحله قبل» second.
- Do show the amount on the button when paying («پرداخت ۴۰۰٬۰۰۰ تومان»).
- Don't show the bar on desktop as a floating bar; it becomes part of the content.
- Don't stack it with the tab bar, a toast region at the same edge (raise toasts above it) or a second sticky bar.
- Don't hide why the button is disabled.
