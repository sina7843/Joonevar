# SyntheticNotice

A thin neutral strip above the shell header that tells testers the environment runs on synthetic data — rendered only outside production.

Use it in development and staging builds of all three shells (SiteShell, PublicShell, OpsShell) and on `/dev/*` pages. Never in production: the server decides from the environment, not CSS. Don't use it for real product announcements (Alert or the magazine's «اطلاعیه») or for per-record test flags.

## Anatomy

1. Strip — `status-neutral-bg`, 1px **dashed** `border-control` bottom edge (dashed = "not real", distinct from every product border), padding 6/16.
2. Icon — `flask` 16px, `status-neutral-text`.
3. Text — 12/20: Bold «محیط آزمایشی» — then the rule testers need: mobiles start `0999`, national ids from `9000000000` (Latin, in `<bdi>`).

## CSS API

| Class | Role |
|---|---|
| `.hz-synthetic` | The strip (centred row, wraps) |

```html
<div class="hz-synthetic" role="note" aria-label="محیط آزمایشی">
  <svg class="hz-icon" …flask…></svg>
  <span><b>محیط آزمایشی</b> — همه داده‌ها ساختگی است. شماره‌های موبایل با <bdi class="hz-id" dir="ltr">0999</bdi> و کدهای ملی از <bdi class="hz-id" dir="ltr">9000000000</bdi> شروع می‌شوند.</span>
</div>
```

## Tokens

`status-neutral-bg` · `status-neutral-text` (8.40:1) · `border-control` (dashed edge) · `space-6/8/16`.

## Variants & sizes

One variant, one size. Neutral tone on purpose: warning/orange would compete with real case statuses and the one primary button. In OpsShell the sidebar's `hz-sidebar__env` label still names the environment; this strip adds the data rule.

## States

Static. Not dismissible (screenshots for review must always show it) and not sticky — it scrolls away with the page so it never steals vertical space on phones. Long Persian text: wraps to two lines at 360px; icon aligned to the first line.

## Mobile ↔ desktop

Same markup at all widths; full width above the header/top bar. <768 two lines; ≥768 one line.

## RTL & LTR

Icon at start. Latin samples (`0999`, `9000000000`) in `<bdi dir="ltr">`. `flask` is not directional.

## Accessibility

- `role="note"` + `aria-label`; placed after the skip link and before the header, so it is read once at the top and skipped by «پرش به محتوا».
- Not a live region; not `role="alert"`.
- Contrast 8.4:1; the dashed edge is decorative.

## Data

`process.env` environment name (e.g. `development`, `staging`) decides rendering; samples come from `_meta.json` (`synthetic: true`, `0999` phones, national ids ≥ `9000000000`). No user data.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** Lives in `src/ui/states.tsx` (not `access-denied.tsx`): `SyntheticNotice({ children })`. Keep.


`src/ui/access-denied.tsx` — `SyntheticNotice` (same file as AccessDenied, per the manifest). Keep current props; proposed: `environment?: string` and rendering guarded by `isProduction === false` on the server.

## Do / Don't

- Do render it on every page of non-production builds, above the header.
- Do keep the wording factual and short.
- Don't hide it with CSS in production — don't ship it at all.
- Don't use orange, warning yellow or an exclamation mark.
