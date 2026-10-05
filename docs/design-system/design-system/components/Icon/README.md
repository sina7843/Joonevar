# Icon

Inline Phosphor 2.1.1 glyph in four sizes, `regular` by default and `fill` only for the active state, mirrored by `dir` when it points somewhere.

Use an icon to support a label (button, nav item, field, meta line) or as the whole content of an `IconButton`. Do not use icons as decoration in body text, do not draw your own, and never use emoji. An icon that carries meaning without a visible label needs a Persian accessible name on its control.

## Anatomy

1. `<svg>` with `viewBox="0 0 256 256"`, filled with `currentColor` (colour comes from the parent text colour).
2. The official Phosphor path data (`@phosphor-icons/core@2.1.1`, `assets/regular/<name>.svg` or `assets/fill/<name>-fill.svg`), copied by script, never typed by hand.
3. Optional `hz-icon--mirror` on directional glyphs.

## CSS API

| Class | Effect |
|---|---|
| `.hz-icon` | 20px default, `fill: currentColor`, no shrink, middle-aligned |
| `.hz-icon--xs` · `--sm` · `--md` · `--lg` | 16 · 20 · 24 · 32 px |
| `.hz-icon--mirror` | `scaleX(-1)` under `[dir="rtl"]` |

```html
<svg class="hz-icon hz-icon--sm" viewBox="0 0 256 256" aria-hidden="true"><path d="…"/></svg>
<!-- «مشاهده همه» arrow: the LTR glyph + mirror, renders ← in RTL -->
<svg class="hz-icon hz-icon--xs hz-icon--mirror" viewBox="0 0 256 256" aria-hidden="true"><path d="…arrow-right…"/></svg>
```

## Tokens

`icon-strong` (in icon buttons, next to `text-primary`) · `icon-default` (next to `text-secondary`, at rest in nav and fields) · `status-{neutral|info|success|warning|error}-text` (status icons) · `text-brand` (inside links, active tab) · `logo-mark` (only the shield in «استعلام اصالت») · size tokens `icon-xs` 16, `icon-sm` 20, `icon-md` 24, `icon-lg` 32.

## Variants & sizes

| Size | px | Use |
|---|---|---|
| `xs` | 16 | captions, badges, table cells, nav carets, the «مشاهده همه» arrow, icons in `sm` buttons |
| `sm` | 20 | inside buttons (md/lg) and fields |
| `md` | 24 | icon buttons, tab bar, sidebar |
| `lg` | 32 | empty states, feature tiles |

Weights: `regular` everywhere; `fill` only for the active item (current tab in the tab bar, selected sidebar item). Never mix weights in one group otherwise.

Core set (see `04-iconography.md`): house · list · magnifying-glass · bell · user · plus · x · check · caret-down · caret-left · caret-right · arrow-left · arrow-right · clock · calendar-blank · lock-simple · shield-check · warning · info · file-text · paw-print · magnifying-glass-plus · arrow-clockwise · corners-out · sidebar-simple · pencil-simple · copy · download-simple · upload-simple · funnel-simple · sort-ascending · dots-three · qr-code · map-pin · phone · storefront · chat-circle · paper-plane-right · star. The code ships 25 today; extend from Phosphor only, by exact name.

## States

Icons have no states of their own; they follow their control: default → `icon-default`/`icon-strong`; hover/pressed → the control's fill changes, not the icon; focus-visible → ring on the control; active → `fill` weight + `text-brand`; disabled → `text-disabled` via the control. Loading replaces the start icon with `.hz-spinner` (see Button). Long Persian text never wraps under an icon: the icon stays on the first line (`flex-shrink: 0`).

## Mobile ↔ desktop

Same glyphs and sizes at every breakpoint. On touch the *control* grows to ≥44px; the glyph does not (tab bar and icon buttons use `md` 24).

## RTL & LTR

Directional glyphs are stored as the LTR glyph and carry `hz-icon--mirror`; never hand-pick the opposite glyph in RTL markup.

| Meaning | Glyph (LTR) | In RTL |
|---|---|---|
| Back / return | `arrow-left` | → |
| Forward, «مشاهده همه», next step | `arrow-right` | ← |
| Previous / next page | `caret-left` / `caret-right` | › / ‹ |
| Send, external link, undo/redo, sidebar toggle, sign out | `paper-plane-right`, `arrow-square-out`, `arrow-u-up-*`, `sidebar-simple`, `sign-out` | mirrored |

Never mirrored: search, bell, check, x, clock, calendar, house, user, lock, shield-check, warning, info, paw-print, plus, copy, download, upload, qr-code, phone, map-pin, star.

Known bundle limit: the rule is `[dir="rtl"] .hz-icon--mirror`, so an icon inside a nested `dir="ltr"` island of an RTL page is still mirrored. Until it moves to `:dir(rtl)`, do not put directional icons inside LTR islands.

## Accessibility

- Decorative next to a visible label: `aria-hidden="true"` and no `<title>`.
- Icon-only control: the name goes on the control (`aria-label="بستن"`), the svg stays `aria-hidden`.
- An icon that carries meaning (status) must reach 3:1 against its ground; use `status-*-text`, never the decorative `status-*-border`.
- `focusable="false"` is not needed for inline svg in current browsers; never put `tabindex` on an icon.

## Data

Icons are chosen by the component, not by data, except: status icon from the status dictionary tone (`07-status.md`), and nav icons from the role's menu config. A missing icon name falls back to nothing (the label stays), never to a placeholder glyph.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/icon.tsx`: `Icon({ name: IconName, size = 'md', weight = 'regular', label?, className?, mirror = false })`. Names are camelCase keys of `src/ui/icon-paths.ts` (25 glyphs today, Phosphor paths). Keep the default size `md`. Add the approved set's other glyphs to `icon-paths.ts` under the camelCase of the Phosphor name (`funnel-simple` → `funnelSimple`).


`src/ui/icon.tsx` — `Icon`. Keep the current name prop and the 25 shipped glyphs. Proposed props (manifest): `size: 'xs' | 'sm' | 'md' | 'lg'` (default `sm`), `weight: 'regular' | 'fill'` (default `regular`), `mirror?: boolean` — set automatically for the directional names listed above so callers cannot forget it. Path data is generated from `@phosphor-icons/core@2.1.1` at build time.

## Do / Don't

- Do use `arrow-right` + mirror for «مشاهده همه»; Don't use `arrow-left` to «look right» in RTL.
- Do keep `fill` for the single active item; Don't use `fill` for emphasis.
- Do take colour from the parent (`currentColor`); Don't hard-code a colour on the svg.
- Don't mirror a clock, a check mark, search or the bell.
- Don't use an icon without a label unless it is in an `IconButton` with an `aria-label`.
