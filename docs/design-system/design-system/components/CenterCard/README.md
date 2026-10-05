# CenterCard

A veterinary centre in the public directory — image, type, name, city, opening hours, main services, facilities and the state of its operating licence.

Use in `/centers` results, «مراکز دامپزشکی» blocks, and the centre picker of the sampling flow (genetics centres). Not for a vet (`VetCard`), not for the centre's own profile page (record header + `KeyValueList`), and not for the operator's claim review (CaseQueue).

## Anatomy

1. Image — `image`, 16:9, full-bleed top; missing → RecordImage empty state «تصویر ثبت نشده».
2. Type — `typeFa`, 13/20 SemiBold `text-secondary` («بیمارستان دامپزشکی»).
3. Name — `displayNameFa`, Bold 16/26, up to **3 lines** then `…`.
4. City — `map-pin` + city.
5. Hours — `clock` + one line per `hours[]` row («شنبه تا چهارشنبه ۹ تا ۲۱» / «پنجشنبه ۹ تا ۱۴»); none → «ساعت کار: —».
6. Services — up to 3 neutral `CategoryTag`s + «۲ خدمت دیگر».
7. Facilities — caption «امکانات: پارکینگ، بخش بستری، آمبولانس» (omitted when empty).
8. Licence foot — «پروانه فعالیت» + StatusBadge `--sm`. Public results show only `VALID` «معتبر»; `EXPIRED` «منقضی» (warning) appears only in the centre's own panel and in operator lists, where someone can act on it.

## CSS API

New in `css-additions/CenterCard.css`: `.hz-centre`, `__body`, `__type`, `__name`, `__hours`, `__facilities`, `__foot`. Composes `.hz-card.hz-card--flush.hz-card--interactive`, `.hz-media--16x9`, `.hz-card__section`, `.hz-entity__line` (ClubCard), `.hz-tag-list`, `.hz-tag--neutral`, `.hz-badge--sm`.

```html
<a class="hz-card hz-card--flush hz-card--interactive hz-centre" href="/centers/centre-1">
  <div class="hz-media hz-media--16x9">…</div>
  <div class="hz-card__section hz-centre__body">
    <span class="hz-centre__type">بیمارستان دامپزشکی</span>
    <h3 class="hz-centre__name">بیمارستان دامپزشکی مهرگان</h3>
    <span class="hz-entity__line"><svg …map-pin…></svg>تهران</span>
    <span class="hz-entity__line"><svg …clock…></svg><span class="hz-centre__hours"><span>شنبه تا چهارشنبه ۹ تا ۲۱</span><span>پنجشنبه ۹ تا ۱۴</span></span></span>
    <ul class="hz-tag-list" aria-label="خدمات"><li class="hz-tag hz-tag--neutral">جراحی</li>…</ul>
    <p class="hz-centre__facilities">امکانات: پارکینگ، بخش بستری، آمبولانس</p>
  </div>
  <div class="hz-card__section hz-centre__foot">پروانه فعالیت<span class="hz-badge hz-badge--sm hz-badge--success"><span class="hz-badge__dot"></span>معتبر</span></div>
</a>
```

## Tokens

`bg-surface`, `border-default`, `border-subtle`, `border-control` (hover), `bg-media-empty`, `bg-subtle` (service tags), `text-primary`, `text-secondary`, `icon-default`, `status-success-*`, `status-warning-*`, `radius-xl`, `radius-full`, `focus-ring`.

## Variants & sizes

- **Licence valid** / **licence expired** (the only two values in data). Other licence keys follow the dictionary (e.g. `SUSPENDED` «تعلیق‌شده» error).
- **With / without image.** **Full / sparse data** (no hours, services or facilities).
- One size; cards in a row share the height and the licence foot sits on the bottom edge.

## States

- **Default** · **hover** (pointer): lift + `border-control` outline.
- **Focus-visible:** ring around the card (preview, first card).
- **Loading:** 16:9 skeleton + type, name, two lines and a pill.
- **Empty results:** `EmptyState` with active filters + «حذف فیلترها».
- **Long Persian text:** «مرکز جامع درمانی، جراحی و تصویربرداری حیوانات خانگی و پرندگان زینتی دکتر صالحی» clamps at 3 lines; the full name is on the profile page and in the link's accessible name.
- **Disabled:** n/a.

## Mobile ↔ desktop

<768 one column, card full width (16:9 image ≈ 180px tall). 768–1023 two columns. ≥1024 three columns beside the filter column, four without it. The whole card is one target (≥ 44px by construction).

## RTL & LTR

Text start-aligned; `map-pin` and `clock` are never mirrored. Hours use Persian digits and «تا»; days come from data as written. The licence foot keeps label at the start, badge at the end.

## Accessibility

- One link per card; accessible name = name, type, city, licence state (badge text). Service tags are a list with `aria-label="خدمات"`; the overflow «۲ خدمت دیگر» is text, not a control.
- Image `alt=""` inside the link; the profile page uses `image.altFa` «نمای بیمارستان دامپزشکی مهرگان».
- Licence state is badge text + dot, never colour alone.

## Data

`directory.json → centres[]`: `displayNameFa`, `typeFa` (one of `taxonomy.json → centreTypes`), `city`, `services[]`, `facilities[]`, `licenceStatus`, `hours[] {daysFa, hoursFa}`, `image`. Edge: `edge-cases.json → directory.centre` (three-line name, no image, expired licence — no hours in data, shown as «—»).

## Code mapping

★ New — proposed `CentreCard` in `src/ui/card.tsx`: `name`, `typeFa`, `city`, `hours: {daysFa, hoursFa}[]`, `services: string[]`, `facilities: string[]`, `licenceStatus` (status-dictionary key), `image?`, `href`, `maxServices = 3`. The code spells it «centre» (`/admin/centres`) while the public route is `/centers`; the component keeps `Centre`.

## Do / Don't

- Do keep the licence foot on every card — it is the trust signal of this directory.
- Do show «۲ خدمت دیگر» instead of wrapping six tags.
- Don't put phone or «نوبت» buttons on the card; contact lives on the profile.
- **Decided (11 Mehr 1405):** centres with an expired (or suspended) licence are **removed from public results** and the public centre page shows «پروانه این مرکز معتبر نیست» instead of contact details. The amber «منقضی» card is shown only to the centre itself (with «تمدید پروانه») and to operators.
