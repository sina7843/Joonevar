# آیکن — Iconography

**Source: Phosphor Icons 2.1.1** (MIT), the set the code already uses (`src/ui/icon.tsx`). Use the official paths from `@phosphor-icons/core@2.1.1` — never redraw an icon. No emoji anywhere.

| Weight | When |
|---|---|
| `regular` | Default everywhere |
| `fill` | Active state (current tab in the tab bar, selected nav item), plus one fixed exception: the `user` icon on the SiteShell «ورود / ثبت‌نام» / «پنل من» button (v1.0.3) |

| Size token | px | Use |
|---|---|---|
| `icon-xs` | 16 | Captions, badges, table cells, carets in nav |
| `icon-sm` | 20 | Inside buttons and fields |
| `icon-md` | 24 | Icon buttons, tab bar, sidebar |
| `icon-lg` | 32 | Empty states, feature tiles |

Colour: `icon-strong` (ink) in icon buttons and next to `text-primary`; `icon-default` (sand-700) next to secondary text; status icons take `status-{tone}-text`; the shield in «استعلام اصالت» may take `logo-mark`. Icons meet 3:1 when they carry meaning; an icon-only button always has a Persian `aria-label`.

## Directional icons — mirror with `dir`

These are drawn for LTR and **flip automatically** in RTL (`[dir=rtl] .icon-mirror { transform: scaleX(-1) }`), so the same component works when LTR arrives. In today's RTL screens:

| Meaning | Phosphor name (LTR) | Shown in RTL as |
|---|---|---|
| Back / return | `arrow-left` | → (points to the start, right) |
| Forward, «مشاهده همه», next step | `arrow-right` | ← |
| Previous page / previous record | `caret-left` | › |
| Next page / next record | `caret-right` | ‹ |
| Send message | `paper-plane-right` | mirrored |
| External link | `arrow-square-out` | mirrored |
| Undo / redo | `arrow-u-up-left` / `arrow-u-up-right` | mirrored |
| Sidebar toggle | `sidebar-simple` | mirrored |
| List indent, text align | `text-align-*`, `text-indent` | mirrored |
| Sign out | `sign-out` | mirrored |

Implementation note for the build: store the LTR glyph and mirror by `dir`; do not hand-pick the opposite glyph in RTL markup (the checkpoint-1 mockups did this for preview only).

## Never mirrored

Magnifying glass (search), bell, check, x, clock, calendar, house, user, lock, shield-check, warning, info, paw-print, dog, cat, plus, minus, copy, download, upload, image, file, phone, map-pin, credit-card, receipt, QR code, barcode, star. A clock's hands and a check mark read the same in both directions.

## Approved set — 128 icons

This is **every icon the system uses** (all component previews and key screens, checked by script on 11 Mehr 1405). Use only these; adding one is a design-system change (add it here and to the *Icon* sheet). One meaning = one icon: `bell` (not `bell-simple`), `funnel-simple` (not `funnel`), `arrow-clockwise` for reload/retry (not `arrows-clockwise`), `house` for every home (not `house-line`).

| Group | # | Icons (Phosphor names, regular weight) |
|---|---|---|
| Navigation & layout · ناوبری و چیدمان | 20 | `house` · `list` · `sidebar-simple` · `squares-four` · `caret-down` · `caret-left` · `caret-right` · `caret-up-down` · `arrow-left` · `arrow-right` · `arrow-up` · `arrow-down` · `arrow-square-out` · `dots-three` · `dots-three-vertical` · `dots-six-vertical` · `corners-out` · `sign-in` · `sign-out` · `x` |
| Actions · کنش‌ها | 27 | `plus` · `minus` · `pencil-simple` · `note-pencil` · `trash` · `copy` · `download-simple` · `upload-simple` · `printer` · `paperclip` · `paper-plane-right` · `link` · `arrow-clockwise` · `arrow-u-up-left` · `magnifying-glass` · `magnifying-glass-plus` · `magnifying-glass-minus` · `funnel-simple` · `sort-ascending` · `eye` · `eye-slash` · `git-merge` · `arrows-left-right` · `camera` · `crosshair` · `pause` · `key` |
| Status & feedback · وضعیت و بازخورد | 25 | `check` · `checks` · `check-circle` · `check-square` · `info` · `warning` · `warning-circle` · `x-circle` · `prohibit` · `lock-simple` · `shield-check` · `seal-check` · `clock` · `clock-counter-clockwise` · `hourglass-medium` · `calendar-blank` · `bell` · `cloud-check` · `wifi-slash` · `image-broken` · `pause-circle` · `star` · `flag` · `flag-banner` · `arrow-fat-line-up` |
| People & roles · افراد و نقش‌ها | 11 | `user` · `user-plus` · `user-gear` · `user-switch` · `users` · `users-three` · `users-four` · `identification-card` · `identification-badge` · `student` · `handshake` |
| Registry, health & documents · ثبت، سلامت و اسناد | 16 | `paw-print` · `file-text` · `file-pdf` · `files` · `certificate` · `stamp` · `tree-structure` · `qr-code` · `folder-simple` · `clipboard-text` · `dna` · `test-tube` · `flask` · `stethoscope` · `first-aid-kit` · `heart` |
| Commerce & money · فروش و پول | 12 | `storefront` · `shopping-bag` · `shopping-cart` · `package` · `truck` · `tag` · `receipt` · `credit-card` · `bank` · `hand-coins` · `percent` · `ticket` |
| Messages & content · پیام و محتوا | 10 | `chat-circle` · `chat-circle-dots` · `chat-centered-text` · `envelope-simple` · `phone` · `megaphone-simple` · `broadcast` · `image` · `tray` · `lifebuoy` |
| Places, data & settings · مکان، داده و تنظیمات | 7 | `map-pin` · `map-trifold` · `buildings` · `chart-bar` · `gear-six` · `bluetooth-connected` · `scales` |

**Fill weight** is used for the active item in navigation, for these 13: `bell` · `file-text` · `flag` · `gear-six` · `house` · `identification-card` · `megaphone-simple` · `paw-print` · `qr-code` · `squares-four` · `star` · `test-tube` · `tray` — plus one fixed use: `user` (fill) on the SiteShell «ورود / ثبت‌نام» / «پنل من» button (approved 11 Mehr 1405, v1.0.3).

The *Icon* component preview shows the whole set as a sheet with names. Developers use `@phosphor-icons/react` (or the code's `src/ui/icon.tsx`) with these names — no icon files are shipped in the design system.
