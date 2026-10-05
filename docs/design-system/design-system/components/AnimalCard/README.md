# AnimalCard

One animal record at a glance — image, name, species · breed, `petId` (or «—») and status — as a list row or a grid tile.

Use the **row** (`.hz-animal`) in «حیوانات من» lists, dashboards and pickers inside a white card; use the **tile** (`.hz-animal-tile`) in dashboard grids where the image helps recognition. Not for public breed or marketplace content (use the breed card or `ListingCard`), and not for a full record header.

## Anatomy

1. RecordImage — `thumb-lg` 64×64 in the row, 4:3 in the tile; missing photo → brand-symbol empty state.
2. Name — Bold 16/26, one line with «…»; `null` → «بدون نام» in `text-secondary`.
3. Meta — `speciesFa · breedFa · sexFa`; for a draft, the progress «مرحله ۳ از ۶» replaces sex.
4. Identifier — «شناسه:» + `PET-…` in `<bdi class="hz-id" dir="ltr">`; no `petId` yet → «شناسه: —».
5. Status — `StatusBadge` only when there is something to say (draft, closed or blocked). `REGISTERED` shows **no badge**: the `PET-` id is the proof.
6. Row only: forward chevron (`caret-right` + `hz-icon--mirror`) at the end.

## CSS API

| Class | Role |
|---|---|
| `.hz-animal` | Row (an `<a>`); stacked rows get a `border-subtle` hairline |
| `.hz-animal__body` · `__name` · `__meta` · `__end` | Text column, name, meta lines, end column (badge) |
| `.hz-animal-tile` · `.hz-animal-tile__body` | Tile with full-bleed 4:3 image |
| `.hz-muted` on `__name` | Unnamed animal |

```html
<a class="hz-animal" href="/animals/animal-5">
  <div class="hz-media hz-media--thumb-lg"><div class="hz-media__empty"><img src="…symbol" alt=""></div></div>
  <div class="hz-animal__body">
    <span class="hz-animal__name">مکس</span>
    <span class="hz-animal__meta">سگ · هاسکی سیبری · مرحله ۳ از ۶</span>
    <span class="hz-animal__meta">شناسه: —</span>
  </div>
  <div class="hz-animal__end"><span class="hz-badge hz-badge--neutral"><span class="hz-badge__dot"></span>پیش‌نویس</span></div>
  <svg class="hz-icon hz-icon--sm hz-icon--mirror" …caret-right…></svg>
</a>
```
In a tile, wrap the badge in a `<span>` so it keeps its own width inside the flex column.

## Tokens

`bg-surface`, `border-default` (tile, host card), `border-subtle` (row hairline), `text-primary`, `text-secondary`, `bg-media-empty`, `radius-xl` (tile), `radius-lg` (thumb-lg), `status-neutral-*` (draft), `focus-ring`.

## Variants & sizes

- **Row** — 64px thumb, 14px vertical padding, chevron. Lists of 1–n inside one `.hz-card`.
- **Tile** — 4:3 image, body 12/14px padding; 2 columns on mobile, 3–4 on desktop.
- Status by family: `DRAFT` «پیش‌نویس» (neutral), `DECEASED` «فوت» (neutral), `SUSPENDED` «تعلیق‌شده» (error). Labels only from the status dictionary.

## States

- **Default** · **hover** (pointer only): proposed `border-control` outline on the tile and `bg-subtle` on the row — not yet in bundle.css.
- **Focus-visible:** 2px `focus-ring`, 2px offset, on the whole link.
- **Active/pressed:** same as hover. **Disabled:** n/a (a record is always openable).
- **Loading:** `hz-skeleton` thumb + two text lines in the same frame.
- **Empty list:** `EmptyState` with «ثبت حیوان» — not an empty card.
- **Missing data:** no name → «بدون نام»; no breed → segment omitted; no `petId` → «—»; no photo → symbol empty state (alt text «تصویر ثبت نشده» in the tile).
- **Long Persian text:** «شاهزاده کوچولوی باغ ارم شیراز» stays one line with «…» and the full name in `title`; breed «پرشین (اگزوتیک موکوتاه)» wraps.

## Mobile ↔ desktop

- <768: rows full width in a card; tiles 2-up. The whole row is the target (≥ 64px tall).
- 768–1023: same rows; tiles 3-up.
- ≥1024: dashboard puts animals beside requests (two-column grid); tiles 4-up.

## RTL & LTR

Image at the start, chevron at the end; the chevron is the LTR `caret-right` mirrored by `dir`. `PET-` ids and microchips are always `<bdi dir="ltr">`. Meta order is logical, so LTR needs no change.

## Accessibility

- The card is one `<a>`; its accessible name is the visible text (name, meta, id). Thumbnail `alt=""` (decorative — the name is in the link).
- Badge text carries the status; colour is never alone.
- Lists: wrap rows in `<ul>`/`<li>` or a `role="list"` card so screen readers count them.

## Data

`animals.json` / `src/db/schema`: `name`, `speciesFa`, `breedFa`, `sexFa`, `petId`, `status`, `draftStep`/`draftStepsTotal`, `photo` (+ `altFa` for a real image). Fallbacks from `edge-cases.json`: `nameFallbackFa` «بدون نام», `petIdFallbackFa` «—». Cat breeds are entered by a superadmin, so breed can be `null` or long.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/card.tsx`: `AnimalCard({ name, speciesBreed, petId: string | null, status: { tone, label }, href })`. Keep; add `image?` and `layout?`; `status` will accept a dictionary key (see StatusBadge).


`src/ui/card.tsx` → `AnimalCard` (manifest F, P0). Keep its current props as they are in code ; it must receive the fields above. Proposed addition: `layout: 'row' | 'tile'` (default `row`). The badge comes from the status-dictionary helper (`StatusBadge` by key), never a literal label.

## Do / Don't

- Do show the `PET-` id as the registered proof; don't add a «ثبت‌شده» badge on top of it.
- Do keep the draft progress in the meta line; don't invent a percentage.
- Don't show a cat or dog stock photo for a missing image — use the symbol empty state.
- Don't put action buttons inside the row; the whole row opens the record.
