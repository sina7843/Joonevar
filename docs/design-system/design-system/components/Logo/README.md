# Logo

The fixed Hamzist mark: the approved horizontal Persian lockup and the symbol, placed at one of four sizes and never altered.

Use the lockup once per shell (site header, app top bar or sidebar, footer, sign-in card). Use the symbol alone only where the lockup cannot fit: the collapsed OpsShell sidebar, the favicon, and the missing-image placeholder (RecordImage, 40% opacity). Do not use the logo as a heading, a decoration or a watermark.

## Anatomy

1. **Wordmark** «همزیست» — one joined word, no space and no ZWNJ, set in IRANSansX Black (900), colour `logo-ink`.
2. **Symbol** — `logo-mark` fill with `logo-cutout` shapes (144 × 162 upright).
3. The lockup is a single supplied image (`hamzist-lockup-fa-horizontal.svg`, 415.92 × 92); the two parts are never re-composed in markup.

## CSS API

| Class | Image height | Where |
|---|---|---|
| `.hz-logo` | 36 | SiteShell header, desktop (≥1024) |
| `.hz-logo--mobile` | 30 | Mobile and tablet headers / top bars |
| `.hz-logo--ops` | 26 | OpsShell sidebar |
| `.hz-logo--symbol` | 32 | Symbol alone: collapsed sidebar (72), favicon source |

```html
<a class="hz-logo" href="/" aria-label="همزیست — صفحه اصلی">
  <img src="/brand/logo/lockup-horizontal-fa-light.svg" alt="همزیست">
</a>
<span class="hz-logo hz-logo--symbol"><img src="/brand/logo/symbol.svg" alt="همزیست"></span>
```

Width is always `auto`; only the height is set.

## Tokens

`logo-ink` (wordmark), `logo-mark` (symbol), `logo-cutout` (symbol shapes) — baked into the asset, listed so dark mode can swap the asset, not recolour it. Approved grounds: `bg-page`, `bg-surface`, `bg-chrome`, `bg-brand-subtle`. Placeholder use: `bg-media-empty` + 40% opacity (RecordImage).

## Variants & sizes

- **Horizontal Persian lockup** — the only lockup in Stage 3.
- **Symbol** — alone, upright.
- **Produced in Stage 4 (`brand.md`), not here:** the vertical (stacked) lockup, the English lockups, and the version for a brand-coloured surface, plus safe area, minimum sizes, mono/dark versions and app icons. Until then, no other arrangement is valid.

## States

Static. As a home link: default; hover (pointer only) — no change to the mark, cursor only; focus-visible — `focus-ring` 2px + 2px offset around the link; no active, disabled, loading or error states. Empty/failed image: the `alt` «همزیست» shows as text in `text-primary` — never a broken-image box. Long text does not apply (the wordmark is fixed).

## Mobile ↔ desktop

<768: `--mobile` (30) in the 64px header / 56px top bar. 768–1023: `--mobile` in the header; OpsShell rail (72) shows `--symbol`. ≥1024: `.hz-logo` (36) in the site header, `--ops` (26) in the OpsShell sidebar. The link area around it stays ≥44px tall on touch.

## RTL & LTR

The lockup sits at the **start** of the header (inline-start: right in RTL). The asset itself is never mirrored. When LTR arrives, the English lockup from Stage 4 replaces it; the slot and classes stay.

## Accessibility

- As a home link: `aria-label="همزیست — صفحه اصلی"` on the `<a>`, `alt="همزیست"` on the image.
- Not a link (sign-in card, footer repeat): `alt="همزیست"`.
- As the placeholder inside RecordImage: `alt=""` (decorative), the Persian alt text «تصویر ثبت نشده» carries the meaning.
- One logo per landmark; no `role="img"` wrapper needed.

## Data

No data. The `src` is fixed per variant; `alt` is the brand name. Never fetched per tenant, club or clinic — partner logos are RecordImage, not Logo.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/logo.tsx`: `Logo({ variant: 'lockup' | 'symbol' = 'lockup', height = 28 })`. Keep; pass the system heights (36 desktop header, 30 mobile, 26 ops) and point it at the new SVG files in `public/brand/logo/`.


`src/ui/logo.tsx` — `Logo`. Keep its current props. Proposed: `variant: 'lockup' | 'symbol'` (default `lockup`), `size: 'header' | 'mobile' | 'ops'` (maps to `.hz-logo`, `--mobile`, `--ops`), `href?: string` (renders the `<a>` with the Persian label). Stage 4 adds `orientation: 'horizontal' | 'vertical'` and `lang: 'fa' | 'en'` without renaming these.

## Do / Don't

- Do use the supplied file at one of the four heights; Don't scale by width or set both width and height.
- Don't redraw, recolour, stretch, rotate, outline, add a shadow, or place it on a busy photo.
- Don't swap symbol and wordmark positions or re-typeset «همزیست» in live text as a logo.
- Don't write «هم زیست» or «هم‌زیست» anywhere — the name is one joined word.
- Do keep it on light grounds only until the brand-surface version ships in Stage 4.
