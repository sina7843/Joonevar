# Timeline

A vertical history of one case: each event with its time, status, actor, a one-line summary and, when someone must act, a CTA — done events, the current step, and the steps still ahead.

Use it on every record page (P6: request, registration, permit, order) under «تاریخچه پرونده», and in the decision desk. Do not use it for a form's progress (Stepper) or for a feed of unrelated items (Notifications).

## Anatomy

1. `<ol class="hz-timeline">`.
2. Item `.hz-timeline__item` — 24px marker column + content; a 2px `border-default` line joins markers.
3. Marker `.hz-timeline__marker` — 12px circle: filled brand (done), ring + halo (current), hollow (upcoming), warning (attention ★).
4. Head `.hz-timeline__head` — title (`__title`, 15/24 Bold) + optional StatusBadge (sm).
5. Meta `.hz-timeline__meta` — `<time>` Jalali date (+ time) · actor «دکتر مریم صادقی (دامپزشک معتمد)».
6. Body `.hz-timeline__body` — one or two sentences.
7. Actions `.hz-timeline__actions` ★ — one CTA (secondary normally, primary only when the user must act now).

Pair it with ActionOwner above the list («اقدام بعدی با: دامپزشک معتمد · مهلت ۲۸ مهر ۱۴۰۵»).

## CSS API

| Class | Purpose |
|---|---|
| `.hz-timeline` / `__item` | List and item |
| `.hz-timeline__item--done` | Filled `border-brand` marker |
| `.hz-timeline__item--current` | Brand ring + `bg-brand-subtle` halo; add `aria-current="step"` |
| `.hz-timeline__item--upcoming` ★ | Hollow marker, title in `text-secondary` 600 |
| `.hz-timeline__item--attention` ★ | Warning marker for an event that needs the user (needs correction) |
| `__marker` / `__content` ★ / `__head` / `__title` / `__meta` / `__body` / `__actions` ★ | Parts |

★ in `tools/css-additions/Timeline.css`.

```html
<ol class="hz-timeline" aria-label="تاریخچه پرونده">
  <li class="hz-timeline__item hz-timeline__item--current" aria-current="step">
    <span class="hz-timeline__marker" aria-hidden="true"></span>
    <div class="hz-timeline__content">
      <div class="hz-timeline__head"><span class="hz-timeline__title">پذیرش در کلینیک</span> <span class="hz-badge hz-badge--sm hz-badge--info">…در حال بررسی</span></div>
      <div class="hz-timeline__meta"><time datetime="2026-09-30T14:30">۸ مهر ۱۴۰۵، ۱۴:۳۰</time> · دکتر مریم صادقی (دامپزشک معتمد)</div>
      <p class="hz-timeline__body">…</p>
    </div>
  </li>
</ol>
```

## Tokens

`border-default` (line) · `border-control` (hollow marker) · `border-brand` (done/current) · `bg-brand-subtle` (current halo) · `status-warning-border` / `status-warning-bg` (attention) · `text-primary` · `text-secondary` (meta, body, upcoming) · `status-*` via StatusBadge.

## Variants & sizes

- **Case history** (default) — oldest at the top, upcoming steps at the bottom, so the eye reads down to "what's next".
- **Audit log** (OpsShell, `/admin` history) — newest at the top, no upcoming items, actor always shown; same classes.
- One size; in OpsShell body text may drop to 13/22 via the shell.

## States

- **done** · **current** · **upcoming** · **attention** — as above; exactly one current item per case.
- **hover / focus-visible** — only on the CTA and links inside (`focus-ring`).
- **disabled** — upcoming items have no CTA; never a disabled button inside the timeline.
- **loading** — 3 skeleton items (marker + two text lines).
- **error** — `hz-state--error` in the card; the case header stays.
- **empty** — «هنوز رویدادی ثبت نشده» with what will appear.
- **long Persian text** — body wraps freely (e.g. the full correction reason from the operator); the badge moves under the title when the head is too narrow (`flex-wrap`).

## Mobile ↔ desktop

Same structure at every width. <768: full-width in the record page, CTA becomes a 44px button (`hz-btn` default size) or stays a link; ≥1024: lives in the main column of the record (two-column P6), ActionOwner sits in the side column.

## RTL & LTR

Marker column at the start (`inset-inline-start` line), content at the end. Times use Persian digits with Jalali dates («۸ مهر ۱۴۰۵، ۱۴:۳۰»); `datetime` attributes keep ISO. Codes in the body are `<bdi class="hz-id" dir="ltr">`.

## Accessibility

- `<ol>` with `aria-label`; markers are `aria-hidden` — the state must also be in text (badge or title), never only in the marker colour.
- `aria-current="step"` on the current item.
- `<time datetime>` on every timestamp.
- New events arriving while the page is open are announced via a polite live region outside the list, not by re-reading it.

## Data

Event = `{ at, titleFa, status?, actorFa, actorRoleFa, summaryFa, cta? }` from the case's history table (request events in `src/db/schema`). The preview uses request `HZ-32AHW6V6PC` «ثبت و احراز حیوان · مکس» (`requests-and-payments.json`): submitted ۷ مهر by علی رضایی, referral code `HZ-SCMXFSFNPW` issued (21 days, `documents.json`), clinic intake by دکتر مریم صادقی, then association review and «پرداخت و صدور برگه ثبتی» ۲۵۰٬۰۰۰ تومان (`fees.json`). Upcoming steps come from the process definition, not from invented dates. The attention example uses the long correction message from `edge-cases.json`.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/timeline.tsx`: `Timeline({ items: TimelineItem[] })`, `TimelineItem = { id, title, whenFa, status: { tone, label }, owner, summary, href, ctaLabel }`. Keep; add `state`.


`src/ui/timeline.tsx` — keep `Timeline` and its item shape (event, time, status, owner, summary, CTA). Proposed props: `items: { id; state: 'done' | 'current' | 'upcoming' | 'attention'; title; at?: Date; status?: StatusKey; actor?: string; summary?: ReactNode; action?: ReactNode }[]`, `order: 'asc' | 'desc'`, `label`.

## Do / Don't

- Do show who did it and when on every done item.
- Do keep exactly one current step and one CTA per item at most.
- Don't invent dates for upcoming steps — use the condition («پس از ثبت نتیجه دامپزشک»).
- Don't colour the whole item by status; the badge and marker carry it.
