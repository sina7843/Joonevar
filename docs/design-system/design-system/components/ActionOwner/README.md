# ActionOwner

A one-line strip «اقدام بعدی با: …» that says whose move it is on a case, with an optional deadline or note.

Use it on every case that is not finished: request cards, record headers (P6), payment summaries, decision desks (operator view: «اقدام بعدی با: انجمن»). It sits under or beside the `StatusBadge`; the badge says *what state*, the owner says *who*. Do not use it on closed or completed records (families `done`, `closed`) — there is no next move.

## Anatomy

1. Container — `bg-subtle` strip, `radius-md`, 8×12 padding
2. Lead text «اقدام بعدی با:» (14/22)
3. Owner name `__who`, Bold
4. Optional extra `__extra` at the inline end — deadline, amount, last update, or a short instruction (13px, `text-secondary`)

## CSS API

| Class | Role |
|---|---|
| `.hz-owner` | strip (flex, space-between) |
| `.hz-owner--you` | the user must act: `status-warning-bg` strip, owner in `status-warning-text` |
| `.hz-owner__who` | owner name |
| `.hz-owner__extra` | deadline / amount / note |
| `.hz-owner--stack` ★ | *css-additions/ActionOwner.css* — extra on its own line; for narrow cards or sentence-length extras |

```html
<div class="hz-owner hz-owner--you">
  <span>اقدام بعدی با: <b class="hz-owner__who">شما</b></span>
  <span class="hz-owner__extra">مهلت: ۲۸ مهر ۱۴۰۵</span>
</div>
```

## Tokens

`bg-subtle`, `status-warning-bg`, `status-warning-text`, `text-primary`, `text-secondary`, `radius-md`; overdue extra reuses `.hz-age--overdue` (`status-error-text`).

## Variants & sizes

Six owner types (key from `request.actionOwner`):

| Key | Shown as | Modifier |
|---|---|---|
| `USER` | «شما» (the signed-in user; code label «کاربر») | `--you` |
| `VET` | «دامپزشک معتمد» | — |
| `ASSOCIATION` | «انجمن» | — |
| `GENETICS_CENTRE` | «مرکز ژنتیک» | — |
| `COUNTERPARTY` | «طرف مقابل» | — |
| `SYSTEM` | «همزیست» (payment return, scheduled jobs; the code's label) | — |

Extras: deadline «مهلت: ۲۸ مهر ۱۴۰۵» · amount «۴۰۰٬۰۰۰ تومان» · last update «به‌روزرسانی: ۳ مهر ۱۴۰۵» · note. In an operator's view the operator's own role is «شما» too.

## States

- **Default** (someone else) · **you** (`--you`) — the only emphasised version, so users can scan for their own moves.
- **Overdue:** extra becomes `<span class="hz-age hz-age--overdue">` with a clock icon: «مهلت: ۵ مهر ۱۴۰۵، ۵ روز گذشته».
- **No extra:** strip with only the owner.
- **Long text:** a sentence-length extra («تصویر پروانه کسب خوانا نیست؛ نسخه واضح‌تری بارگذاری کنید.») uses `--stack`; otherwise the lead never wraps.
- Not interactive: no hover/focus/disabled. The action itself is a `Button` next to it.

## Mobile ↔ desktop

<768: full width in the card; use `--stack` when the extra is longer than a date. 768–1023: inline. ≥1024: in the record header meta row or the side column of P6. Not a touch target.

## RTL & LTR

Lead and owner at inline start, extra at inline end (left in RTL) via flex — no physical properties. Dates in Persian digits; avoid `·` between Persian digits (it reads as «۰») — use «،».

## Accessibility

- Plain text; screen readers read «اقدام بعدی با: شما، مهلت: ۲۸ مهر ۱۴۰۵». The yellow strip is never the only cue — the word «شما» is.
- Keep it in DOM order after the status badge so the pair reads together.

## Data

- `actionOwner` (enum above) → label map in the UI; `actionOwnerFa` from data when present.
- Extra from `deadline.longFa`, `amount.displayFa`, `updatedAt.longFa`, or `correctionFa`.
- Missing owner on an open case is a data error: render nothing and log; never invent an owner.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/status.tsx`: `ActionOwner({ owner: ActionOwnerKind })` with `USER` «شما» · `VET` «دامپزشک معتمد» · `ASSOCIATION` «انجمن» · `GENETICS_CENTRE` «مرکز ژنتیک» · `COUNTERPARTY` «طرف مقابل» · `SYSTEM` «همزیست». Matches; add `isViewer?` and `extra?`.


`src/ui/status.tsx` — `ActionOwner`. Proposed props: `owner: 'USER' | 'VET' | 'ASSOCIATION' | 'GENETICS_CENTRE' | 'COUNTERPARTY' | 'SYSTEM'`, `isViewer?: boolean` (forces «شما»), `extra?: ReactNode`, `overdue?: boolean`, `stack?: boolean`.

## Do / Don't

- Do show it on every open case — the brief's rule is that it is always clear whose move it is.
- Do keep the status label clean: «در حال بررسی» + «اقدام بعدی با: مرکز ژنتیک».
- Don't colour non-user owners; only `--you` gets the warning tint.
- Don't put the action button inside the strip; place it in the card's action row.
