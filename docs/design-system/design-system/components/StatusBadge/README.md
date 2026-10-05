# StatusBadge

A pill that shows one status from the status dictionary as colour + Persian label + dot, where the tone says who must act.

Use it on every record, request, payment, listing and queue row that has a status. Never type a label by hand: the badge takes a status **key** (`UNDER_REVIEW`) and looks up `labelFa` and `tone` in `status-dictionary.json` / *Status dictionary*. Today 435 label keys live in at least 39 files with inconsistent wording ("در حال بررسی مرکز ژنتیک", "در حال بررسی انجمن"…); this component is where that ends. Who acts next is **not** the badge's job — pair it with `ActionOwner`.

## Anatomy

1. Pill container (`radius-full`, 1px outline)
2. Dot, 8px, `status-{tone}-border` — always present by default
3. Label, 12/20 weight 600, `status-{tone}-text`
4. Optional leading icon (16px) in place of the dot, for record headers only

## CSS API

| Class | Role |
|---|---|
| `.hz-badge` | pill, 24px high |
| `.hz-badge--sm` | 20px high, for tables, card lists, timelines |
| `.hz-badge--neutral` · `--info` · `--warning` · `--success` · `--error` | tone (from the family, never chosen per screen) |
| `.hz-badge__dot` | the dot |

```html
<span class="hz-badge hz-badge--info"><span class="hz-badge__dot" aria-hidden="true"></span>در حال بررسی</span>
<span class="hz-badge hz-badge--success hz-badge--sm"><svg class="hz-icon hz-icon--xs" …></svg>صادر شد</span>
```

## Tokens

`status-neutral-bg/text/border`, `status-info-*`, `status-warning-*`, `status-success-*`, `status-error-*`, `radius-full`. Contrast of every text/bg pair is computed in *Color*.

## Variants & sizes

- **Tone = family.** `draft` → neutral · `waiting` → info · `action` → warning · `done` → success · `blocked` → error · `closed` → neutral. The tone answers "whose move is it", not "is this good".
- **7 approved tone changes** (10 Mehr 1405): `PENDING_VERIFICATION` → info, `AWAITING_PAYMENT` → warning, `READY` → success, `SUPERSEDED`/`SOLD`/`RESERVED`/`HIDDEN` → neutral.
- **Sizes:** 24 (default, cards and record headers) · 20 (`--sm`, dense ops tables, card lists, timeline rows).
- **Dot (default) or icon:** icon (`check`, `warning`, `x-circle`) only in a record header where the badge is the page's main signal. Never icon-only.
- `REGISTERED` has **no badge** — the record shows its id (`PET-…`) instead.

## States

Static, non-interactive — no hover, focus or disabled. If a badge must open a filter, wrap it in a `Chip`, not a clickable badge.
- **Unknown key** (data drift): render neutral with the raw key in `<bdi>` and log it; never guess a tone.
- **Loading:** `Skeleton` pill (`.hz-skeleton--pill`).
- **Long Persian text:** `COMPLETED` «تحویل انجام و مالکیت منتقل شد» stays on one line (`white-space: nowrap`); the **container row wraps** instead, so the badge drops below the title in narrow cards.

## Mobile ↔ desktop

Same badge at every width. <768: in card lists, the badge sits under or beside the title, row wraps. 768–1023 and ≥1024: in tables use `--sm` in its own column. Not a touch target, so no 44px rule.

## RTL & LTR

Dot is at the inline start (right in RTL) through flex order — no physical margins. Labels are Persian; never put an id in a badge. In LTR the same markup puts the dot on the left.

## Accessibility

- Text carries the meaning; colour and dot are redundant (WCAG 1.4.1). Dot is `aria-hidden`.
- In tables the column header («وضعیت») gives context; elsewhere no extra role is needed.
- When a status changes live (payment return page), announce it in a `role="status"` region near the badge, not on the badge.

## Data

- Input: `status` key from the record (`request.status`, `payment.status`, `listing.status`…).
- Lookup: `status-dictionary.json` → `labelFa`, `tone`, `family`. One dictionary module in code (proposed `src/domain/status.ts`) generated from that file.
- Retire every variant listed under "Variants in code today" in *Status dictionary* (e.g. «ارسال‌شده برای بررسی» → «در انتظار بررسی»).

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/status.tsx`: `StatusBadge({ tone = 'neutral', children })` — callers choose tone and label; there is no central dictionary (labels live per module, e.g. `STATUS_FA` in `src/breeds/model.ts`, `src/content/model.ts`, `VERIFICATION_STATE_FA`). Add `src/ui/status-dictionary.ts` generated from *Status dictionary* and an optional `status` key prop; keep `tone` + children during the migration.


`src/ui/status.tsx` — `StatusBadge`. Keep the existing tone prop as the internal value; the public API becomes **`status` (key)** with `size?: 'md' | 'sm'` and `icon?: boolean`. Deprecate passing a free `label`/`tone` pair; allow it only behind an `unsafeLabel` escape hatch for operator-entered text, flagged in review.

## Do / Don't

- Do feed the badge a key; do pair it with `ActionOwner` on every case.
- Do keep one tone per family everywhere — a payment `FAILED` is error in the user app and in the finance queue.
- Don't encode the actor in the label («در حال بررسی مرکز ژنتیک»); use «در حال بررسی» + «اقدام بعدی با: مرکز ژنتیک».
- Don't use orange (brand) for a status, and don't use a badge as a button.
- Don't place `·` directly between Persian digits next to a badge — at 12px it reads as «۰».
