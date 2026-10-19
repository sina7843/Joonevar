# Brand — برند

The Hamzist mark is **fixed**: the symbol's shape and its two colours (`logo-mark` orange, `logo-cutout` cream) and the wordmark «همزیست» set in IRANSansX Black are never redrawn. What this section defines is the **system around the mark**: lockups, clear space, minimum sizes, grounds, one-ink versions, placement in each shell, the app icon, the favicon and the share image. Every file is an SVG built from the approved geometry (symbol paths copied verbatim from `hamzist-symbol.svg`; Persian wordmark copied verbatim from the approved horizontal lockup; English wordmark shaped with HarfBuzz from IRANSansX Black and converted to outlines). PNGs are rendered from those SVGs. Presentation boards: `B01-logo-system`, `B02-app-icon`.

## The logo system

| Part | What it is | Frame (units) |
|---|---|---|
| **Symbol** | Upright rectangle with a top tab, orange, two cream cut-outs (circle and wedge). Never square-cropped, never mirrored. | 144 × 162 |
| **Wordmark (fa)** | «همزیست» — one joined word, no space, no ZWNJ — IRANSansX Black, outlined. | — |
| **Wordmark (en)** | «Hamzist» — IRANSansX Black Latin glyphs, outlined, **same font size as the Persian wordmark** in every lockup so both languages carry the same weight. | — |

### Lockups and when to use each

| Lockup | Files | Frame | Use |
|---|---|---|---|
| **Horizontal, Persian** — the default | `lockup-horizontal-fa-{light,dark,mono-ink,mono-orange,mono-white}.svg` | 415.92 × 92 | Every shell header, top bar and sidebar, footer, A4 document head. When in doubt, this one. |
| **Stacked, Persian** | `lockup-stacked-fa-{light,dark,mono-ink}.svg` | 369.04 × 288.98 | Square or narrow centred spaces only: sign-in / sign-up card head, printed certificate cover, about page masthead. Never in chrome bars. |
| **Horizontal, English** | `lockup-horizontal-en-{light,dark,mono-ink}.svg` | 408.82 × 92 | Only when the interface or document is English / LTR (future), and in English-language exports. Never inside a Persian page. |
| **Stacked, English** | `lockup-stacked-en-{light,dark}.svg` | 360.31 × 272.02 | English equivalent of the stacked Persian lockup. |
| **Symbol alone** | `symbol.svg` | 144 × 162 | Only where a lockup cannot fit: OpsShell rail / collapsed sidebar, missing-image placeholder (40% opacity), app icon, favicon, social avatar. |

Construction (all lockups): the symbol takes the full height of the horizontal lockups; the gap between symbol and wordmark is **2.5X** in the horizontal lockups and **1.5X** between symbol and wordmark in the stacked lockups; in stacked lockups the symbol is centred over the wordmark. ViewBoxes are tight to the artwork (the symbol's own 162-unit frame defines the height), so clear space is **not** baked into the files — the layout supplies it.

### LTR order — decision

**In the English lockup the symbol sits at the start (left) and the wordmark at the end.** This mirrors the Persian lockup, where the symbol is at the start of the reading direction (right). The rule is "symbol first in reading order" in both languages. The symbol itself is **never mirrored** — the tab stays at the top right in both. In an LTR layout the lockup still sits at `inline-start` of the header (left); the `.hz-logo` slot and classes do not change, only the file does.

## Clear space

**1X = the radius of the circle cut-out inside the symbol** (24 units in the 144 × 162 symbol, i.e. 14.8% of the symbol's height). Keep at least 1X empty on every side of any lockup or the symbol — no text, edge, rule or other mark inside it.

| Asset | X in file units | X at common sizes |
|---|---|---|
| Symbol (162 tall) | 24 | 32px tall → 4.7px · 24px → 3.6px |
| Horizontal lockups (92 tall) | 13.63 | 36px tall → 5.3px · 30px → 4.4px · 26px → 3.9px |
| Stacked lockups | 24 | 100px tall (fa) → 8.3px |

Shell chrome always gives more than 1X (the 80px site header leaves 22px above and below a 36px lockup). The rule matters on print, partner material and share images.

## Minimum sizes

Sizes are given by **height**, because code sets only the height (`.hz-logo img { height }`, width `auto`) and the Persian and English lockups differ in width.

| Asset | Minimum (digital) | Recommended | Print minimum |
|---|---|---|---|
| Symbol (full colour) | **24px** tall | **32px** | 6.5 mm tall |
| Horizontal lockup, fa / en | **26px** tall (fa ≈ 118px wide) | **30px** (mobile header) · **36px** (desktop header) | 7 mm tall |
| Stacked lockup, fa / en | **75px** tall (fa ≈ 96px wide) | **100px** tall (fa ≈ 128px wide) | 20 mm tall |

Below 24px the symbol is replaced by the **favicon drawings** (pixel-fitted, see *Favicon*); the lockups have no version below their minimum — use the symbol instead.

**Changes from v1.0 (with reason):** v1.0 gave the horizontal minimum as 120px *wide* (recommended 160). The approved lockup is wider than v1's (415.92 × 92 against 334 × 72), so 120px wide would now be 26.5px tall, and the English lockup would get a different minimum. The minimum is therefore stated as **26px tall** — the same intent as v1 (120px wide at v1's proportions is 25.9px tall), equal for both languages, and the size OpsShell's sidebar already uses. The recommended size is the mobile header height (**30px**, 136px wide); the desktop header (36px, 163px wide) matches v1's 160. Symbol 24/32 and stacked 96/128px wide are **confirmed** (75/100px tall in the new stacked frame).

## Grounds

| Ground | Version | Note |
|---|---|---|
| `bg-chrome` (cream canvas) | light | Header, sidebars, top bars, footer — the usual place |
| `bg-page` / `bg-surface` (white) | light | Sign-in card, documents, partner material |
| `bg-brand-subtle` | light | CTA box, share image ground |
| Dark (ink ground — future dark theme, dark print) | dark | Wordmark turns `logo-cutout` cream; the symbol keeps its own colours |
| Photo | light or dark **on a solid plate only** | `bg-chrome` or `bg-surface` plate with at least 1X padding around the lockup, on a calm part of the photo. Never directly on a photo |
| Orange | — | No lockup on an orange ground in the product. Orange as an area belongs only to app icon option B |

Every pairing keeps the brand's one-ink rule: **mark against ground ≥ 3:1**. The orange mark measures 3.29:1 on white, 3.22:1 on `bg-chrome`, 3.08:1 on `bg-brand-subtle` and 3.43:1 on the ink ground. It does **not** reach 3:1 on `logo-cutout` cream (2.95:1), so that cream is never used as a ground for the orange mark — it stays inside the symbol.

## One-ink (mono) versions

One symbol = one ink. The cut-outs become real holes (the ground shows through), never a second colour.

| File | Ink | Use |
|---|---|---|
| `lockup-horizontal-fa-mono-ink`, `lockup-stacked-fa-mono-ink`, `lockup-horizontal-en-mono-ink` | `logo-ink` | One-colour print (black-and-white printers, fax, photocopies), rubber stamp and embossed seal, the A4 document watermark |
| `lockup-horizontal-fa-mono-orange` | `logo-mark` | One-colour orange print on white or cream stock (tape, stickers, merchandise) |
| `lockup-horizontal-fa-mono-white` | white | Dark print, engraving / laser marking, a dark solid plate on photography |

**Document watermark** (printed and exported documents only, never in the UI): the mono-ink symbol, centred on the sheet, 50% of the sheet width, 6% opacity, behind the content. Body text over it keeps its full contrast.

## Usage per shell

| Place | Asset | Height | Class / note |
|---|---|---|---|
| SiteShell header ≥ 1024 (bar 80) | horizontal fa, light | 36 | `.hz-logo` |
| SiteShell header < 1024 (bar 64) | horizontal fa, light | 30 | `.hz-logo--mobile` / `--responsive` |
| SiteFooter brand column | horizontal fa, light | 30 / 36 | `.hz-logo--responsive` |
| PublicShell sidebar ≥ 1024 (264) | horizontal fa, light | 36 | `.hz-logo` |
| PublicShell top bar < 1024 (bar 56) | horizontal fa, light | 30 | `.hz-logo--mobile` |
| OpsShell sidebar open (248) and mobile Drawer | horizontal fa, light | 26 | `.hz-logo--ops` — the system minimum |
| OpsShell rail / collapsed sidebar (72) | symbol | 32 | `.hz-logo--symbol`; the environment name becomes the link's `aria-label` |
| A4 print document head | horizontal fa, light (mono-ink for one-colour printing) | 40 (≈ 10.6 mm) | `.hz-a4__brand` |
| Sign-in / sign-up card | stacked fa, light | 100 | centred above the form title |

One lockup per landmark. The logo is a home link only in chrome (`aria-label="همزیست — صفحه اصلی"`).

## Don'ts

- **Stretch or squash** — never set both width and height; height only.
- **Rotate or tilt** — the symbol is always upright.
- **Recolour** — no colour outside the files above; never swap the orange and ink, never tint the cut-outs.
- **Shadow, glow, outline or gradient** — the mark is flat.
- **Busy photo** — never directly on an image; use a solid plate.
- **Swap the order** — the symbol is first in reading order in both languages; never a Persian lockup with the symbol on the left, never an English one with the symbol on the right; never mirror the symbol.
- **Re-typeset the wordmark** — never live text as a logo, never «هم زیست» or «هم‌زیست», never another weight or font.
- **Below the minimum** — use the symbol (or the favicon drawing below 24px) instead.

## App icon (PWA)

The symbol is an upright rectangle with a tab; every icon centres it on the **centre of its smallest enclosing circle** and scales it so that circle is 85% of the maskable safe zone (the central 80% circle). The whole symbol therefore survives the iOS squircle, Android circle and squircle masks, and the same composition serves every file (the symbol is 60% of the tile height). Files per option (stable names): `icon-1024.png`, `apple-touch-icon-180.png` (opaque, square corners — iOS rounds them), `pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`, plus the source `icon.svg`.

| Option | Ground / symbol | Mark vs ground | Character |
|---|---|---|---|
| **A — chosen** | orange symbol with cream cut-outs on cream canvas (`cream-50`) | 3.22:1 | The logo exactly as approved, on the app's own chrome cream; calm, official, continuous with today's icon |
| B | cream canvas symbol (cut-outs knocked out) on orange | 3.22:1 | Loudest on a home screen; the one-ink reversed symbol |
| C | orange symbol with cream cut-outs on ink | 3.43:1 | Exact logo colours, strongest edge; reads as a dark-mode icon |

**Ground of A:** `cream-50`, not `logo-cutout` cream. The orange mark is 3.22:1 on `cream-50` but only 2.95:1 on `logo-cutout`, below the brand's 3:1 rule; `cream-50` is also the app's chrome and the manifest `background_color`, so the install splash shows the symbol floating on the same cream the app opens on. Option B uses `cream-50` for the symbol for the same reason (`logo-cutout` on orange is 2.95:1).

**Approved (11 Mehr 1405):** the changes from v1.0 on this page — the `cream-50` ground, the minimum size by height (26px), the full-colour favicon at every size and the English name «Hamzist». **App icon: option A chosen** by the product owner (the three options stay side by side on the key-screens canvas, page «برند و آیکون اپ», board «B02 · آیکون اپ و favicon»).

**Why A:** it is the only light option that shows the mark in its approved colours (B reverses them, C puts a light-themed product behind a dark tile); it matches the app chrome and the splash; and it keeps continuity for people who already added today's cream icon. B and C are kept in the files for reference only.

## Favicon

`favicon.svg` (32-unit grid), `favicon-16.png`, `favicon-32.png`, `favicon-48.png`, `favicon.ico` (16 + 32 + 48 in one file). **Transparent ground, full-colour symbol, one drawing per size, pixel-fitted:** the body is snapped to whole pixels (14 / 28 / 42px wide, 1 / 2 / 3px side margin, base on the last pixel row). Shared by all app-icon options.

**Change from v1.0:** v1 asked for a simplified one-ink symbol under 24px. Checked at 800%: the silhouette alone loses the identity (an orange blob), the circle-only version loses the wedge that makes the "face", and the one-ink knock-out shows the tab strip's colour through the holes on dark browsers. The pixel-fitted full-colour symbol keeps both cut-outs legible at 16px (a 5px circle and a 2px wedge) on light and dark tab strips, so the simplification is **pixel-fitting, not removing parts** — which also keeps the logo's shape untouched.

## Manifest colours

Config values (the only place hex appears in this section):

| Option | `theme_color` | `background_color` |
|---|---|---|
| A (chosen) | `#FFFCF8` | `#FFFCF8` |
| B | `#FFFCF8` | `#FFFCF8` |
| C | `#FFFCF8` | `#FFFCF8` |

`theme_color` follows the chrome (`bg-chrome`), not the icon: the status bar flows into the cream top bar whatever icon is chosen. `background_color` is the canvas cream so the splash matches the first paint. When the dark theme ships, add `<meta name="theme-color" media="(prefers-color-scheme: dark)">` with the dark chrome value.

```json
{
  "name": "همزیست", "short_name": "همزیست", "lang": "fa", "dir": "rtl",
  "start_url": "/", "display": "standalone",
  "theme_color": "#FFFCF8", "background_color": "#FFFCF8",
  "icons": [
    { "src": "/brand/app-icon/pwa-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/brand/app-icon/pwa-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/brand/app-icon/pwa-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## Files — stable names

Copy `design-system/assets/brand/` to `App/public/brand/` keeping these paths (for the app icon, copy option **A**'s five PNGs from `app-icon/A/` into `app-icon/`):

```
brand/logo/       symbol.svg
                  lockup-horizontal-fa-{light,dark,mono-ink,mono-orange,mono-white}.svg
                  lockup-stacked-fa-{light,dark,mono-ink}.svg
                  lockup-horizontal-en-{light,dark,mono-ink}.svg
                  lockup-stacked-en-{light,dark}.svg
brand/app-icon/   icon-1024.png · apple-touch-icon-180.png · pwa-192.png · pwa-512.png · pwa-maskable-512.png
brand/favicon/    favicon.svg · favicon-16.png · favicon-32.png · favicon-48.png · favicon.ico
brand/social/     og-1200x630.png
```

| Today in `App/public/brand/` | Replace with |
|---|---|
| `logo-fa-horizontal.png` | `logo/lockup-horizontal-fa-light.svg` |
| `logo-symbol.png` | `logo/symbol.svg` |
| `app-icon-ios.png` | `app-icon/apple-touch-icon-180.png` (+ `icon-1024.png` as the master) |
| `app-icon-social.png` | `social/og-1200x630.png` (share) · `app-icon/pwa-512.png` (avatar) |
| `favicon-16/32/48.png` | `favicon/favicon-16/32/48.png` + `favicon.svg` + `favicon.ico` |

`app/layout.tsx` (Next.js metadata):

```ts
export const metadata = {
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/brand/favicon/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/favicon/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/brand/favicon/favicon.ico',
    apple: [{ url: '/brand/app-icon/apple-touch-icon-180.png', sizes: '180x180' }],
  },
  openGraph: { images: [{ url: '/brand/social/og-1200x630.png', width: 1200, height: 630, alt: 'همزیست' }] },
};
export const viewport = { themeColor: '#FFFCF8' };
```

Also copy `favicon.ico` to the site root (`/favicon.ico`), which browsers request on their own.

## Share image

`social/og-1200x630.png`: `bg-brand-subtle` ground, a 12px `accent-bar` strip on the top edge (the A4 document's signature), the horizontal Persian lockup 128px tall, centred, and «سامانه رسمی ثبت سگ و گربه» below it in IRANSansX Bold, `text-secondary`. Everything sits in the central 630 × 630 square so square crops (messengers) keep the whole lockup.
