# QueueTile

A tile on an operations environment's home page that shows one queue: its name, how many cases are open and how old the oldest one is. It turns to the alert variant when the oldest case is past the review deadline.

Use a row of tiles at the top of every ops home (`/assoc`, `/genetics`, `/review`, `/market`, `/content`). Each tile links to its CaseQueue. Don't use it for general KPIs (revenue, sign-ups). Those are StatTiles, which can have trends. A QueueTile only answers «چه چیزی منتظر من است و از کی؟»

## Anatomy

1. **Head**: queue name (`__name`, Bold 14) + a mirrored `arrow-right` affordance at the end.
2. **Count** (`__count`, 32/44 Bold, tabular): open cases where the next action is with this environment.
3. **Oldest** (`__oldest`): «قدیمی‌ترین: ۱۲ روز» using `.hz-age` (plain / `--late` / `--overdue`). It can be replaced by a plain sentence when nothing is ours: «همه در انتظار طرف مقابل», «صف خالی است».
4. **Flag** (alert only, `__flag`): `warning` icon + «از مهلت بررسی گذشته».

## CSS API

Bundle: `.hz-queue-tile` `__name` `__count` `__oldest` `--alert`, `.hz-age` `--late` `--overdue`.
Additions (`tools/css-additions/QueueTile.css`): `.hz-queue-tiles` (row: 2 columns <768, 4 columns ≥768), `.hz-queue-tile__head`, `.hz-queue-tile__flag`, `.hz-queue-tile--empty`. Compose `.hz-card--interactive` for the hover lift.

```html
<div class="hz-queue-tiles">
  <a class="hz-queue-tile hz-queue-tile--alert hz-card--interactive" href="/assoc/kyc">
    <span class="hz-queue-tile__head"><span class="hz-queue-tile__name">احراز هویت</span>…arrow-right mirrored</span>
    <span class="hz-queue-tile__count hz-num">۴<span class="hz-visually-hidden"> پرونده</span></span>
    <span class="hz-queue-tile__oldest">قدیمی‌ترین: <span class="hz-age hz-age--overdue">…clock ۱۲ روز</span></span>
    <span class="hz-queue-tile__flag">…warning از مهلت بررسی گذشته</span>
  </a> …
</div>
```

## Tokens

`bg-surface` `border-default` `status-warning-border` (alert border) `status-warning-text` (flag, late age) `status-error-text` (overdue age) `text-primary` `text-secondary` (oldest, empty count) `icon-default` (arrow) `border-control` (hover border via `.hz-card--interactive`) `focus-ring` `radius-xl`.

## Variants & sizes

- **Default**: count + oldest age (plain or `--late`).
- **Alert** (`--alert`): the oldest case is past the deadline. The border turns warning, the age is `--overdue` and the flag line is added. Use it at most where it is true. A home full of alert tiles means the deadlines in settings are wrong.
- **Empty** (`--empty`): count «۰» in `text-secondary` + «صف خالی است». It stays in the row so the layout doesn't jump.
- **Nothing for us**: the count is shown and the oldest line becomes «همه در انتظار طرف مقابل» / «در انتظار متقاضی».
- One size. The row has 4 tiles; if there are more queues, wrap to a second row (never a carousel).

## States

- **Hover** (pointer): lift −2px + `border-control` (from `.hz-card--interactive`).
- **Focus-visible**: a ring on the whole tile (it is one link).
- **Loading**: skeleton lines inside the same tile frame, `aria-busy="true"`.
- **Error**: the count becomes «—» + «بارگذاری نشد», and the tile still links to the queue.
- **Long Persian text**: the name wraps to two lines (preview: «میز بررسی دامپزشکان» at 176px). The count and age never truncate.

## Mobile ↔ desktop

- **<768**: 2 × 2 grid with a 12px gap. Each tile is a 44px+ touch target (the whole tile).
- **768–1023**: 4 in a row (collapsed OpsShell sidebar).
- **≥1024**: 4 in a row at the top of `.hz-main__inner`, followed by the combined CaseQueue «صف‌ها».

## RTL & LTR

The name sits at the start and the arrow at the end. The arrow is `arrow-right` + `.hz-icon--mirror` (points ← in RTL). `clock` and `warning` are not mirrored. All digits are Persian.

## Accessibility

The tile is one `<a>`. Its accessible name reads «احراز هویت ۴ پرونده قدیمی‌ترین: ۱۲ روز از مهلت بررسی گذشته» (the unit is visually hidden). Colour is never the only signal: the alert adds the flag text. The arrow is `aria-hidden`.

## Data

| Field | Source |
|---|---|
| name | queue label from the environment nav (`src/ui/shell.tsx`) |
| count | open cases with `actionOwner` = this environment (preview: احراز هویت ۴ · عضویت ۶ · دامپزشکان ۵ · مجوز جفت‌گیری ۲, from the approved mockup nav) |
| oldest | `max(now − submittedAt)` over those cases, in whole days |
| alert | oldest ≥ the overdue deadline from the «مهلت‌ها» settings group (the threshold is configuration, not hard-coded) |

## Code mapping

New ★ `src/ops/queue-tile.tsx`: `QueueTile({ href, label, count, oldestDays, lateAfterDays, overdueAfterDays, note, loading, error })` and `QueueTiles({ children })`. It supersedes the queue counts in OpsShell nav badges for the home page. The nav keeps `.hz-count`.

## Do / Don't

- Do link each tile to its queue, sorted oldest first.
- Do count only cases waiting on this environment.
- Don't use orange fills or a primary button inside a tile. The alert is a warning border + text.
- Don't invent trend arrows. Trends belong to StatTile.
