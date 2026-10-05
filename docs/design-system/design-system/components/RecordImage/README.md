# RecordImage

The one image a record owns (animal, article, breed, centre, product), cropped into a fixed frame — 16:9, 4:3, 3:2, 1:1, thumbnail or avatar — with a designed placeholder when the image is missing.

Use it for every photo slot in the product. Images are uploaded by users and admins, so the frame, crop and empty state must work for an ordinary phone photo. Do not use it for private documents (national ID, licences) — those use the decision-desk viewer `.hz-doc` — or for the logo.

## Anatomy

1. Frame `.hz-media` + ratio modifier — `overflow: hidden`, `bg-media-empty` behind, `radius-xl` (or the size's radius).
2. `<img>` — `object-fit: cover`, `object-position: 50% 40%`, mandatory Persian `alt` from `imageAltFa`.
3. Empty state `.hz-media__empty` — brand symbol at 40% opacity (36px; 22px in small frames) + `.hz-media__alt` caption (alt text, or «تصویر ثبت نشده»).
4. Optional overlay: a CategoryTag `.hz-tag--on-media` at the top start.

## CSS API

| Class | Ratio / size | Radius | Use |
|---|---|---|---|
| `.hz-media--16x9` | 16:9 | `radius-xl` | Hero, article header, breed header (code `banner`) |
| `.hz-media--4x3` ★ | 4:3 | `radius-xl` | Animal card, listing card |
| `.hz-media--3x2` ★ | 3:2 | `radius-xl` | Article and breed cards |
| `.hz-media--1x1` | 1:1 | `radius-lg` | Shop product |
| `.hz-media--thumb` | 56×56 | `radius-sm` | Lists, tables, notifications (code `thumb`) |
| `.hz-media--thumb-lg` | 64×64 | `radius-lg` | Animal rows on the dashboard |
| `.hz-media--avatar` | 56 circle | `radius-full` | Vets, users, sellers, clubs |
| `.hz-media__empty` / `__alt` | — | — | Missing-image placeholder |
| `.hz-avatar-initials` | 40 circle | `radius-full` | Person without a photo (initial on `bg-brand-subtle`) |

Inside a flush card or a tile the frame's own radius is reset to 0 (`.hz-card--flush > .hz-media`, `.hz-listing .hz-media`).

```html
<div class="hz-media hz-media--4x3"><img src="…" alt="سگ نژاد ژرمن شپرد"></div>
<div class="hz-media hz-media--4x3"><div class="hz-media__empty"><img src="symbol.svg" alt=""><span class="hz-media__alt">سگ رکس</span></div></div>
```

## Tokens

`bg-media-empty` (frame ground) · `text-secondary` (alt caption, 5.23:1 on `bg-media-empty`) · `bg-brand-subtle` + `text-brand` (initials) · `radius-xl` / `radius-lg` / `radius-sm` / `radius-full` · `bg-subtle` (skeleton).

## Variants & sizes

See the table. Width always comes from the layout (grid column, card); the ratio fixes the height. Thumb, thumb-lg and avatar are fixed-size and never shrink (`flex-shrink: 0`).

**Safe area:** the subject must sit inside the **central 60%** of the uploaded image; anything outside may be cut by one of the frames. The sample photo shows why — the dog is half outside the safe area and is cut in 1:1. `object-position: 50% 40%` keeps heads and faces (usually in the upper half) in frame. The upload UI shows a live preview in 16:9, 4:3 and 1:1 and warns when the subject sits outside the centre.

## States

- **loaded** — image only.
- **missing / failed to load** — same design: `hz-media__empty` with the symbol and the alt text («سگ رکس»), or «تصویر ثبت نشده» when there is no alt. In thumbs and avatars only the symbol shows; the alt goes into a visually hidden span. Never a broken-image icon or an empty grey box.
- **loading** — `hz-skeleton--media` in the frame's ratio (4:3 default).
- **hover / focus** — none on the image; the surrounding link (card, tile) carries them.
- **long Persian text** — a long alt caption wraps inside the frame and is clipped by the frame, never overflowing (the full alt stays on the `<img>`).

## Mobile ↔ desktop

Ratios do not change across breakpoints; the frame just gets wider. A card that uses 4:3 on mobile keeps 4:3 on desktop (a different crop would move the subject). Horizontal article rows use a 120px 4:3 frame on every width.

## RTL & LTR

Nothing in an image is mirrored — never flip photos. The on-media tag sits at the start corner (`inset-inline-start`), so it moves to the left in LTR automatically.

## Accessibility

- Every `<img>` has a Persian `alt` describing the subject («سگ نژاد ژرمن شپرد»); decorative symbol in the empty state has `alt=""`.
- When the image is missing, the alt text is still exposed (visible caption, or visually hidden in small frames) so the slot is not silent.
- Avatars with initials use `role="img"` + `aria-label` with the full name.

## Data

Each record has one image: `imageFileId` + mandatory `imageAltFa` (`images.json`, `_meta.json`); listings and products have a gallery whose first image is the cover. `photo: null` (e.g. `edge-cases.json` animals and centres) → empty state with the record's alt or «تصویر ثبت نشده».

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/record-image.tsx`: `RecordImage({ fileId, altFa, priority = false, variant: 'banner' | 'thumb' = 'banner', className })` — the alt prop is `altFa`. Keep; add `ratio` and `size`.


`src/ui/record-image.tsx` — keep `RecordImage` and its `banner` (16:9, 1200×675) and `thumb` (1:1, 56) variants and the `alt` prop. Add ★ `ratio: '16:9' | '4:3' | '3:2' | '1:1'`, `size: 'thumb' | 'thumb-lg' | 'avatar'`, `fallbackAlt`, `focal?: { x; y }` (defaults to 50% 40%; lets an admin correct a badly framed upload later). Keep `banner` as an alias of `ratio="16:9"`.

## Do / Don't

- Do use one ratio per kind of card across the product (animal 4:3, article 3:2 or 16:9 in hero).
- Do keep the alt text even when the image is missing.
- Don't put text on photos — only a CategoryTag on its own solid ground.
- Don't stretch, letterbox or blur-fill; always `cover` with the safe area.
