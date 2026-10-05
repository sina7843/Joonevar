# PageStates

The five whole-page / whole-section states — LoadingState, EmptyState, NetworkErrorState, NeedsCorrectionState, WaitingState — plus Skeleton ★, each saying what happened and what comes next.

Use a page state when a list, record or section cannot show its normal content. Use Skeleton for first loads of a known layout (card list, key-value record, table); use LoadingState only when the layout is unknown or the wait is a single action (payment return). Use `Alert` instead when content is still shown and only a condition needs reporting.

## Anatomy

1. Icon disc, 64px (`hz-state__icon`), tinted by state
2. Bold title (18/30) — what happened
3. Body (14/24, max 420px) — why and what to do
4. Optional `ActionOwner` strip (correction, waiting)
5. Optional actions — one primary or one secondary

Skeleton: grey blocks in the exact shape of the pattern it replaces (thumb + two lines + badge pill for card lists; key/value bars for `KeyValueList`).

## CSS API

| Class | Role |
|---|---|
| `.hz-state` | centred column, 40/24 padding |
| `.hz-state--error` · `--warning` · `--waiting` | icon disc tint (network error · needs correction · waiting) |
| `.hz-state__icon` · `__title` · `__body` | parts |
| `.hz-state__actions` ★ · `.hz-state--compact` ★ | *css-additions/PageStates.css*: action row; compact in-section state (24/16 padding, 48px disc) |
| `.hz-spinner--lg` ★ | 24px spinner for LoadingState |
| `.hz-skeleton` + `--text` · `--title` · `--media` · `--thumb` ★ · `--pill` ★ | skeleton blocks |

```html
<div class="hz-state hz-state--error" role="alert">
  <div class="hz-state__icon"><svg class="hz-icon hz-icon--lg" …wifi-slash…></svg></div>
  <p class="hz-state__title">اطلاعات دریافت نشد</p>
  <p class="hz-state__body">اتصال به همزیست برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید.</p>
  <div class="hz-state__actions"><button class="hz-btn hz-btn--secondary">تلاش دوباره</button></div>
</div>
```

## Tokens

`bg-subtle` + `icon-default` (loading, empty), `status-error-bg/-text`, `status-warning-bg/-text`, `status-info-bg/-text`, `text-secondary`; skeleton `bg-subtle`, `radius-sm`/`radius-full`, `ease-standard` pulse (off under `prefers-reduced-motion`).

## Variants & sizes

| State | Icon | Example copy (real) | Action |
|---|---|---|---|
| LoadingState | spinner | «در حال بارگذاری» · «فهرست حیوان‌های شما در حال دریافت است.» | — |
| EmptyState | `paw-print` (per entity) | «هنوز حیوانی ثبت نکرده‌اید» | primary «ثبت حیوان» |
| EmptyState (filtered) | `funnel-simple` | «با این فیلترها نتیجه‌ای نیست» | secondary «پاک کردن فیلترها» |
| NetworkErrorState | `wifi-slash` | «اطلاعات دریافت نشد» | secondary «تلاش دوباره» |
| NeedsCorrectionState | `pencil-simple` | «پرونده شما نیازمند اصلاح است» + reason + «اقدام بعدی با: شما» | primary «اصلاح احراز هویت» |
| WaitingState | `hourglass-medium` | «نتیجه تست «تارا» هنوز آماده نیست» + «اقدام بعدی با: مرکز ژنتیک» | — (nothing for the user to do) |

Sizes: default (page, empty list) and `--compact` (a section inside a dashboard card, e.g. «درخواست‌های فعال» empty).

## States

These *are* states. Their buttons follow `Button` states (hover pointer-only, focus-visible ring, loading `aria-busy`). Long text: the correction reason from `edge-cases.json` (three sentences) wraps inside the 420px body width.

## Mobile ↔ desktop

Same content at all widths. <768: state fills the content area under the top bar; a primary action may become the sticky `ActionRow`. ≥1024: centred in the content column; compact states sit inside cards. Buttons are 44px.

## RTL & LTR

Centred, so direction-neutral; action rows use flex with logical gaps. `arrow-clockwise` is not mirrored; a «ادامه ←» action uses `arrow-right` + `hz-icon--mirror`.

## Accessibility

- LoadingState: `role="status"` + `aria-live="polite"`; the region it replaces gets `aria-busy="true"`.
- Skeleton: blocks are `aria-hidden`; the container has `aria-busy="true"` and an `aria-label` («در حال بارگذاری حیوان‌های من»).
- NetworkErrorState: `role="alert"`; «تلاش دوباره» receives focus after a failed retry.
- WaitingState / Empty: plain content (no live role) unless they replace content live.

## Data

- Empty: from an empty array (`animals: []`) — the copy names the entity.
- Correction: `correctionFa` / `reasonFa` from the case; owner from `actionOwner`.
- Waiting: case title + `actionOwner`. Never show «۰ مورد» as an empty state.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/states.tsx`: `LoadingState({ rows = 3, label })`, `EmptyState({ title, description, action? })`, `NetworkErrorState({ retryHref })`, `NeedsCorrectionState({ reason, correctionHref })`, `WaitingState({ title, owner, detail? })`. Keep all five.


`src/ui/states.tsx` — keep `LoadingState`, `EmptyState`, `NetworkErrorState`, `NeedsCorrectionState`, `WaitingState`. Proposed shared props: `title`, `body?`, `icon?`, `action?`, `owner?`, `compact?: boolean`. **New ★:** `Skeleton` with `variant: 'cardList' | 'keyValue' | 'table' | 'media'` and `rows?: number`.

## Do / Don't

- Do tell the user what happens next and who acts.
- Do match the skeleton to the real layout so nothing jumps when data arrives.
- Don't show a spinner and a skeleton together; don't use a skeleton for actions under 300 ms.
- Don't blame the user for network errors; don't put a primary button on WaitingState.
