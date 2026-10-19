# BreedCard

A dog breed as a tile (Persian and English name, FCI group, size) and as the «مشخصات نژاد» profile panel whose traits are shown as three-step meters that always carry their text level.

Use the tile in `/breeds`, the home section «نژادهای سگ» and breed pickers with images; use the profile panel on `/breeds/[slug]` and in the superadmin preview of `/admin/breeds/[id]`. Not for a registered animal (`AnimalCard`) and not for the breed history text (page body, `ContentDetail`).

## Anatomy

**Tile**
1. Image — breed `image`, 4:3, full-bleed top; missing → RecordImage empty state «تصویر ثبت نشده».
2. Persian name — `nameFa`, Bold 16/26, up to 2 lines.
3. English name — `nameEn`, 13/20 `text-secondary`, Latin in `<bdi dir="ltr">`, one line with ellipsis.
4. Meta — «گروه ۱، بزرگ» (FCI group number، `sizeFa`); unknown group «گروه —».

**Profile panel** (inside `.hz-card`, two columns ≥768)
1. «شناسنامه نژاد» — `KeyValueList`: نام انگلیسی · گروه FCI (number — group name) · اندازه · پوشش (طول مو) · خاستگاه · نام‌های دیگر.
2. «ویژگی‌ها» — five rows: name (13 secondary) at the start; at the end a 3-step meter + the level as text «کم / متوسط / زیاد».

## CSS API

Tile composes `.hz-animal-tile` + `.hz-animal-tile__body` + `.hz-card--interactive` (hover) + `.hz-media--4x3`. New in `css-additions/BreedCard.css`: `.hz-breed__name`, `.hz-breed__en`, `.hz-breed__meta`, `.hz-breed-profile`, `.hz-breed-profile__title`, `.hz-traits`, `.hz-trait` (`--unset`), `.hz-trait__name`, `.hz-trait__value`, `.hz-trait__label`, `.hz-meter3`, `.hz-meter3__step` (`--on`).

```html
<a class="hz-animal-tile hz-card--interactive" href="/breeds/german-shepherd">
  <div class="hz-media hz-media--4x3"><img src="…" alt=""></div>
  <div class="hz-animal-tile__body">
    <span class="hz-breed__name">ژرمن شپرد</span>
    <bdi class="hz-breed__en" dir="ltr">German Shepherd</bdi>
    <span class="hz-breed__meta">گروه ۱، بزرگ</span>
  </div>
</a>

<dl class="hz-traits">
  <div class="hz-trait"><dt class="hz-trait__name">انرژی</dt>
    <dd class="hz-trait__value"><span class="hz-meter3" aria-hidden="true"><span class="hz-meter3__step hz-meter3__step--on"></span><span class="hz-meter3__step hz-meter3__step--on"></span><span class="hz-meter3__step hz-meter3__step--on"></span></span><span class="hz-trait__label">زیاد</span></dd></div>
</dl>
```

## Tokens

`bg-surface`, `border-default`, `border-control` (hover; hollow meter step), `border-brand` (filled step), `border-subtle` (row dividers), `bg-media-empty`, `text-primary`, `text-secondary`, `radius-xl`, `radius-full`, `focus-ring`.

## Variants & sizes

- **Tile** with image / without image (empty state). One size; the grid sets the width.
- **Profile panel** — full; partial (missing facts show «—», missing traits show an empty meter and «—»).
- **Meter levels:** `LOW` 1 step «کم» · `MODERATE` 2 «متوسط» · `HIGH` 3 «زیاد» (labels: `taxonomy.json → breedLevelsFa`).

## States

- **Default** · **hover** (pointer): tile lifts, outline `border-control`. Meters are not interactive.
- **Focus-visible:** ring around the tile (one link per tile).
- **Loading:** 4:3 skeleton + two text lines per tile.
- **Empty list:** `EmptyState` «نژادی با این فیلتر پیدا نشد» + «حذف فیلترها».
- **Missing data:** no image → empty state; no group → «گروه —»; trait `null` → `--unset` row (hollow steps, «—»); all traits missing → keep the five rows so the page shape is stable.
- **Long Persian text:** «سگ گله آناتولی (کانگال)» wraps to two lines; «Anatolian Shepherd Dog (Kangal)» ellipsizes in the tile (full on the profile). FCI group names wrap inside the key-value row.

## Mobile ↔ desktop

Tiles: <768 two columns (or a horizontal scroller on the home page), 768–1023 three, ≥1024 five on the home page / four beside the filter column. Profile panel: one column <768 (facts, then traits), two columns ≥768. Rows are ≥ 44px tall.

## RTL & LTR

Meters fill from the inline start (right in RTL, left in LTR) — they are flex children, no mirroring needed. The English name is isolated with `<bdi dir="ltr">` and aligned to the start of the Persian column (`align-self: flex-start`). Numbers in Persian digits; separate numeric meta items with «،», not «·».

### Featured breed on the home page (v1.0.4)

`.hz-breed-feature` > `figure.hz-breed-feature__media` (breed photo, 16:10) + `.hz-breed-feature__info`: overline «نژاد این ماه», `h3.hz-breed-feature__title` (Persian name + `<bdi class="hz-breed__en" dir="ltr">`), `historyFa`, the five trait meters (`dl.hz-traits`, same markup as the breed profile), «شناسنامه نژاد …» (secondary). Desktop photo 7/12 + profile 5/12; phones stacked. Only a breed with a photo, `historyFa` and all five traits can be featured.

## Accessibility

- The meter is `aria-hidden`; the level is real text in the same `<dd>`, so it reads «انرژی، زیاد». It is never colour only: filled vs hollow steps differ in fill and the count of filled steps, and the text level is always present.
- Hollow steps keep a `border-control` outline (3.43:1); filled steps `border-brand` (3.29:1).
- The tile image is decorative (`alt=""`) because the link names the breed; the profile hero uses `image.altFa` «سگ نژاد ژرمن شپرد».

## Data

`taxonomy.json → breeds[]`: `nameFa`, `nameEn`, `fciGroup` (+ `breedGroups[].nameFa`), `size`/`sizeFa`, `coat`, `energy`, `trainability`, `careNeed`, `withChildren`, `withOtherAnimals`, `originCountry`, `altNames`, `image` (`altFa`). Code enum labels: `SHORT` «کوتاه», `MEDIUM` «متوسط», `LONG` «بلند». Only two seeded breeds (ژرمن شپرد, سگ سرابی) have traits; the rest show the partial state. Edge: `edge-cases.json → breeds[0]` (long name, no image). The only approved sample photo stands in for the German Shepherd image.

## Code mapping

★ New — proposed `BreedCard` in `src/ui/card.tsx`: `nameFa`, `nameEn`, `fciGroup: number | null`, `sizeFa`, `image?`, `href`. Proposed `BreedProfile` (`src/breeds/profile.tsx`): `breed` (row above), `groupNameFa`, `traits: Record<'energy' | 'trainability' | 'careNeed' | 'withChildren' | 'withOtherAnimals', 'LOW' | 'MODERATE' | 'HIGH' | null>`. Proposed `TraitMeter` (`level`, `label`).

## Do / Don't

- Do show the text level next to every meter.
- Do keep the five trait rows even when values are missing.
- Don't colour levels red/green — a «کم» is not bad; one fill colour, three steps.
- Don't invent an English name or group for an admin-added breed; show «—».
- **Decided (11 Mehr 1405):** the manifest says «۷ ویژگی سه‌سطحی». In the data only five are three-level (`LOW/MODERATE/HIGH`); `size` has five values and `coat` is a length (`SHORT/MEDIUM/LONG`). Approved: size and coat are shown as facts, the five as meters.
