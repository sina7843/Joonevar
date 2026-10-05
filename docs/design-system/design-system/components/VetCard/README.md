# VetCard

A veterinarian in the public directory — avatar, name, «معتمد» badge, specialty, city and clinic, and the Medical Council code when the vet chose to show it.

Use in `/veterinarians` results, «دامپزشک معتمد نزدیک شما» blocks and the vet picker in the registration flow. Not for the vet's own profile page (record header + `KeyValueList`) and not for centres (CentreCard, P1).

## Anatomy

1. Avatar — RecordImage `--avatar` 56px, round; missing photo → symbol empty state.
2. Name — Bold 16/26, `displayNameFa`; wraps.
3. «معتمد» badge — beside the name, `success` badge with `shield-check` (xs) instead of the dot; only when `trusted`.
4. Specialty — `headlineFa` (+ experience if shown).
5. Location — `map-pin` + city، clinic name (clinic omitted when `null`).
6. Council code — «کد نظام:» + `<bdi class="hz-id" dir="ltr">59249</bdi>`, only when `showCouncilCode`.

## CSS API

Bundle: `.hz-vet`, `.hz-vet__body`, `.hz-vet__name` (flex-wrap row for name + badge), `.hz-vet__meta`, inside `.hz-card.hz-card--interactive`; `.hz-media--avatar`; `.hz-meta__item` for icon + text.

```html
<a class="hz-card hz-card--interactive" href="/veterinarians/vet-1">
  <div class="hz-vet">
    <div class="hz-media hz-media--avatar"><div class="hz-media__empty"><img src="…symbol" alt=""></div></div>
    <div class="hz-vet__body">
      <span class="hz-vet__name">دکتر مریم صادقی<span class="hz-badge hz-badge--success"><svg …shield-check…></svg>معتمد</span></span>
      <span class="hz-vet__meta">متخصص داخلی حیوانات کوچک</span>
      <span class="hz-vet__meta hz-meta__item"><svg …map-pin…></svg>تهران، کلینیک دامپزشکی آوا</span>
      <span class="hz-vet__meta">کد نظام: <bdi class="hz-id" dir="ltr">59249</bdi></span>
    </div>
  </div>
</a>
```

## Tokens

`bg-surface`, `border-default`, `border-control` (hover), `bg-media-empty`, `text-primary`, `text-secondary`, `icon-default`, `status-success-bg/-text/-border` (badge), `radius-xl`, `radius-full`, `focus-ring`.

## Variants & sizes

- **Trusted** (`trusted: true`) — with «معتمد» badge.
- **Not trusted** — no badge, nothing else changes (no «غیرمعتمد» label).
- **Code hidden** (`showCouncilCode: false`) — the code row is omitted; never a placeholder.
- One size; grid of 1 / 2 / 3 columns.

## States

- **Default** · **hover** (pointer): lift + `border-control` (`--interactive`).
- **Focus-visible:** ring around the card. **Disabled:** n/a.
- **Loading:** round skeleton + three text lines. **Empty results:** `EmptyState` with the active filters and «حذف فیلترها».
- **Missing data:** no photo → empty state; no specialty → «تخصص: —»; no clinic → city only.
- **Long Persian text:** «متخصص اورژانس و مراقبت‌های ویژه، ۹ سال تجربه» wraps; the badge moves to the next line rather than squeezing the name.

## Mobile ↔ desktop

<768 one column; 768–1023 two; ≥1024 three in the directory, two beside a filter column. Card ≥ 88px tall — the whole card is the target.

## RTL & LTR

Avatar at the start. The council code is Latin digits in `<bdi dir="ltr">` (some codes contain Persian letters, e.g. «د-۴۸۲۱۷» — keep it isolated as entered). `map-pin` and `shield-check` are never mirrored.

## Accessibility

- One link per card; the accessible name reads name, «معتمد», specialty, city.
- The badge's meaning is in its text; the shield is `aria-hidden`.
- Avatar `alt=""` inside the link (the name is already announced); a real photo on the profile page uses `altFa` «تصویر دکتر …».

## Data

`directory.json → vets[]`: `displayNameFa`, `headlineFa`, `specialties`, `city`, `trusted`, `councilCode`, `showCouncilCode`, `clinicNameFa` (nullable), `experienceFa`, `image`. Edge: `edge-cases.json → directory.vet` (not trusted, code hidden, no image).

## Code mapping

★ New — proposed `VetCard` in `src/ui/card.tsx` with props `name`, `headline`, `city`, `clinicName?`, `trusted`, `councilCode?` (pass only when `showCouncilCode`), `image?`, `href`.

## Do / Don't

- Do show the council code only with the vet's consent flag.
- **Decided (11 Mehr 1405):** «معتمد» is the dictionary's trust mark `TRUSTED` (success tone + shield), not a status.
- Don't use a stock portrait or another person's photo as a placeholder.
- Don't add «تماس» or «نوبت» buttons on the card; actions live on the profile page.
