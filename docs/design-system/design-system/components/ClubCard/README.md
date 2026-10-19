# ClubCard

An association (انجمن) or club (کلاب) in the directory — logo, name, kind, scope, member count and, when there is one, the next event.

Use in `/associations`, `/clubs`, the home section «انجمن‌ها و کلاب‌ها», and (with the status badge) in the club manager's and operators' lists. Not for a kennel (seller/breeder) and not for a club post (ArticleCard).

## Anatomy

1. Logo — RecordImage `--avatar` 56px, round; missing → symbol empty state.
2. Name — `displayNameFa`, Bold 16/26, wraps.
3. Meta — «کلاب، کشوری، ۲۹۴ عضو» (`kindFa`، scope label، `membersCount` + «عضو»).
4. Status badge (manager/operator views only, when not `ACTIVE`) — `PENDING_VERIFICATION` «در انتظار بررسی» (info), `SUSPENDED` «تعلیق‌شده» (error).
5. Next event (optional) — `bg-subtle` box: `calendar-blank` + title (Bold) + date/time + place.

## CSS API

New in `css-additions/ClubCard.css`:
- `.hz-entity`, `__body`, `__name`, `__meta`, `__line` — record head with a start-side image; **shared** by ClubCard, SellerCard, MatingProfileCard (and `__line` by CenterCard).
- `.hz-community`, `__event`, `__event-text`, `__event-title`, `__event-when`.

Composes `.hz-card.hz-card--interactive`, `.hz-media--avatar`, `.hz-badge--sm`.

```html
<a class="hz-card hz-card--interactive hz-community" href="/clubs/community-3">
  <div class="hz-entity">
    <div class="hz-media hz-media--avatar">…</div>
    <div class="hz-entity__body">
      <h3 class="hz-entity__name">کلاب ژرمن شپرد ایران</h3>
      <span class="hz-entity__meta">کلاب، کشوری، ۲۹۴ عضو</span>
    </div>
  </div>
  <div class="hz-community__event"><svg …calendar-blank…></svg>
    <span class="hz-community__event-text"><span class="hz-visually-hidden">رویداد پیش‌رو: </span>
      <span class="hz-community__event-title">گردهمایی ماهانه اعضا</span>
      <span class="hz-community__event-when">۱ آبان ۱۴۰۵، ۱۶:۰۰</span>
      <span class="hz-community__event-when">تهران، بوستان آب و آتش</span></span></div>
</a>
```

## Tokens

`bg-surface`, `border-default`, `border-control` (hover), `bg-subtle` (event box), `bg-media-empty`, `text-primary`, `text-secondary`, `icon-default`, `status-info-*`, `status-error-*`, `radius-xl`, `radius-md`, `radius-full`, `focus-ring`.

## Variants & sizes

- **Kind:** `ASSOCIATION` «انجمن» · `CLUB` «کلاب» — same card, kind is text.
- **Scope:** `NATIONAL` «کشوری» · `PROVINCIAL` «استانی» (code labels).
- **With / without upcoming event.** Only the next event is shown; past events never.
- **Public** (no badge — only `ACTIVE` communities are listed) / **manager & operator** (badge when not active).

### `--cover` (home, v1.0.4)

`a.hz-card.hz-card--flush.hz-card--interactive.hz-club-cover` > `.hz-media--16x9` (the community's cover photo) + `.hz-card__section.hz-club-cover__body` (name `hz-entity__name`, kind · scope · members `hz-entity__meta`, optional `hz-community__event`). Used on `/` in a `.hz-row` of four. No cover photo → the RecordImage placeholder at 16:9.

## States

- **Default** · **hover** (pointer): lift + `border-control`.
- **Focus-visible:** ring around the card.
- **Loading:** round skeleton + two lines.
- **Empty list:** `EmptyState` «انجمن یا کلابی با این فیلتر پیدا نشد».
- **Missing data:** no logo → empty state; `membersCount` missing → omit the count (never «۰ عضو» unless the count is truly 0).
- **Long Persian text:** «انجمن دوستداران حیوانات خانگی اصفهان» wraps to two lines; the badge sits on its own line under the meta.

## Mobile ↔ desktop

<768 one column (home page: horizontal scroller of cards at 280px). 768–1023 two columns. ≥1024 three columns. Whole card is the target.

## RTL & LTR

Logo at the start. Member count and dates in Persian digits; numeric meta items are separated with «،» (a «·» between Persian digits reads as «۰»). `calendar-blank` is not mirrored.

## Accessibility

- One link per card; the event box is part of the link text, prefixed by a visually hidden «رویداد پیش‌رو:».
- Name is an `<h3>` inside the link. Badge meaning is in its text.
- Logo `alt=""` (the name is announced).

## Data

`directory.json → communities[]`: `displayNameFa`, `kind`/`kindFa`, `scope`, `lifecycle`, `membersCount` (already Persian text), `events[] {titleFa, at.displayFa, placeFa}`, `image`. Scope labels from code: `status-labels-extracted.json → NATIONAL`, `PROVINCIAL`.

## Code mapping

★ New — proposed `CommunityCard` in `src/ui/card.tsx`: `name`, `kind: 'ASSOCIATION' | 'CLUB'`, `scope: 'NATIONAL' | 'PROVINCIAL'`, `membersCount: number`, `nextEvent?: {title, at, place}`, `lifecycle?` (pass only in manager/operator views), `image?`, `href`.

## Do / Don't

- Do show only the next event, with date and place.
- Do keep «انجمن» and «کلاب» in one component; the kind is data.
- Don't show «فعال» on public cards — every public card is active.
- **Decided (11 Mehr 1405):** `NATIONAL` = «کشوری», the code's own label (the mockup's «سراسری» is retired).
