# P01 — Editorial home · خانه مجله‌ای

## Purpose

The front door of the public site and of each editorial section. It presents the registry as a trustworthy magazine: one lead story, the editors' picks, what is new, where to go next, and one call to action. Every word, image and number on it is entered by an author, content admin or superadmin, or counted by the system, so the layout has to hold up when a story has no image, a headline is 111 characters long, or a section is empty. The section order and frames on `/` are the ones below (approved 22 Mehr 1405, v1.0.4); update `app/(public)/page.tsx` to match. The composition and feel come from the reference image.

**Don't use it** for a searchable list of entities (P02), for a single article (P03), or for anything signed in. Dashboards (P04) and OpsShell homes (P09) never take `bg-feature` cards or `bg-band`.

## Anatomy (top to bottom, `/`)

Approved 22 Mehr 1405 (v1.0.4). The page is a column of **section frames** (`.hz-frame`) inside `container-site`, `space-32` apart (`space-16` on phones), alternating white / cream; the Hero frame is peach. There is no full-bleed band on `/` any more.

1. **Shell:** `SiteShell` (header with `GroupedNav`, `SiteFooter`). `SyntheticNotice` above the header outside production.
2. **«تازه‌ها»** — white frame. `SectionHeader` «همه مطالب مجله ←» + one `ArticleCard --feature` + up to four `ArticleCard --horizontal` (news, announcements; an announcement without image shows the RecordImage placeholder).
3. **Hero** — peach frame (`.hz-hero.hz-frame.hz-frame--peach`): `CategoryTag` «سامانه رسمی ثبت حیوان», the admin-written headline «ثبت رسمی و پیگیری سگ‌ها، در یک‌جا» in `display`, summary, «ثبت حیوان» (primary) + «یافتن دامپزشک معتمد» (secondary), the manual image carousel. Desktop: the «استعلام اصالت سند» search card on `bg-surface` under the actions. Phones: «استعلام اصالت سند» is a full-width secondary button.
4. **«دنبال چه می‌گردید؟»** — cream frame. 5 quick-entry `Card --feature --interactive` tiles (white inside the cream frame): دامپزشکان، مراکز دامپزشکی، نژادهای سگ، بازار فروش حیوان، فروشگاه کالا. Desktop 5 columns with a one-line description; phones 2 per row, title only.
5. **«نژادهای سگ»** — white frame. **Featured breed** (`.hz-breed-feature`): overline «نژاد این ماه», breed name + Latin name, `historyFa`, the five `BreedCard` trait meters (`.hz-traits`), «شناسنامه نژاد …» (secondary), beside a 16:10 photo. Then a `.hz-row` of five `BreedCard` tiles. The featured breed is chosen by the content admin (fallback: the first breed by `sortOrder` that has traits and a photo).
6. **«بازار همزیست»** — cream frame. `.hz-subhead` «آگهی‌های حیوان» + a `.hz-row` of four `ListingCard`s (published and reserved only); `.hz-subhead` «از فروشگاه» + a `.hz-row` of four `ProductCard`s. Link «همه آگهی‌ها و کالاها ←».
7. **«دامپزشکان و مراکز معتمد»** — white frame. `.hz-subhead` «دامپزشکان معتمد» + four `VetCard`s (trusted first); `.hz-subhead` «مراکز دامپزشکی» + three `CenterCard`s with a valid licence (expired licences never appear in public results).
8. **«انجمن‌ها و کلاب‌ها»** — cream frame. A `.hz-row` of four `ClubCard --cover` cards (16:9 cover photo, name, kind · scope · members, next event when there is one).
9. **«همزیست در یک نگاه»** — `.hz-glance`: four display-only counts (icon + label, server values, never invented) above the three steps of «روش کار» (each with a square photo): ثبت حیوان → مراجعه به دامپزشک معتمد → دریافت سند رسمی. There is no separate «روش کار» section.
10. **«خدمات همزیست»** — cream frame. `ServiceCard` grid (white cards: title + arrow + one-line description) with the link «مشاهده همه ←» to `/services`. **No fee on any public page** (product decision DEC-0186, confirmed 26 Mehr 1405): no price footer, no «تعیین‌نشده», no fee note. Fees appear only in the payment flow.
11. **`CtaBand --media`:** photo + «هویت حیوانت را ثبت کن», «ثبت حیوان» (primary) and «استعلام اصالت سند» (secondary). Peach.

### CSS for this pattern (in `components/bundle.css`, block «Home compositions»)

| Class | Use |
|---|---|
| `.hz-frame` · `--cream` · `--peach` | Rounded section frame: `border-default`, `radius-xl` (phones) / `radius-2xl` (≥1024), padding 20/16 → 32 → 40. `--cream` = `bg-feature` (cards inside turn `bg-surface`), `--peach` = `bg-brand-subtle`. On the Hero: `.hz-hero.hz-frame` (padding 24/16 → 40 → 56/64). |
| `.hz-home-stack` | The column of frames: gap 16 → 32, padding 16/48 → 32/96. |
| `.hz-subhead` | Icon + label sub-heading inside a frame. |
| `.hz-row` (`--cols`, `--cols-md`, `--row-item`) · `--stack` | Card row: swipe row on phones (item width `--row-item`), grid from 768 (`--cols-md`) and 1024 (`--cols`). `--stack` = one column on phones (vets). |
| `.hz-breed-feature` · `__media` · `__info` · `__title` | Featured breed (photo 7/12 + profile 5/12 on desktop; stacked on phones). |
| `.hz-club-cover` · `__body` | `ClubCard --cover`. |
| `.hz-glance` · `__stats` · `__stat` · `__value` · `__label` · `__steps` · `__step` · `__step-media` · `__step-text` · `__step-num` | «همزیست در یک نگاه» with the steps. |
| `.hz-cta--media` · `.hz-cta__media` · `.hz-cta__content` | `CtaBand --media` (photo first on phones; photo 5/12 at the end on desktop). |

Section landings (`/articles`, `/news`, `/announcements`, `/associations/[slug]`) keep rows 1, 2 and 11. They replace the rest with a `FilterBar` of category chips over an `ArticleCard` grid and `Pagination`, which is the bottom half of P02.

## Layout

| | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Grid | 4 col, gutter 16, margin 16 | 8 col, gutter 20, margin 32 | 12 col in `container-site` 1280, margin 40 (80 at `bp-wide`) |
| Frames | `radius-xl`, padding 20/16, 16 apart | padding 32 | `radius-2xl`, padding 40, 32 apart |
| Hero | text, actions, «استعلام اصالت سند» button, then the image | same, mobile type sizes | text 6/12 (actions + white verify card) beside the image 6/12 |
| «تازه‌ها» | feature card, then horizontal list | same | feature 7/12 + list 5/12 |
| Quick entry | 2 per row, title only | 3 per row | 5 equal columns with description |
| Featured breed | photo, then profile and meters | same | photo 7/12 + profile 5/12 |
| Card rows (breeds, listings, products, centres, clubs) | swipe row inside the frame padding (cards never touch the frame edge), next card peeking | 2–3 columns | breeds 5 · listings 4 · products 4 · centres 3 · clubs 4 |
| Vets | one column | 2 columns | 4 columns |
| «همزیست در یک نگاه» | counts 2×2, steps stacked | same | counts 4 across, steps 3 across |
| CtaBand | photo on top, then text and full-width buttons | same | text 7/12 + photo 5/12 at the end |
| Title → content | `space-16` | `space-24` | `space-24` |
| Navigation | `GroupedNav` in a `Drawer` | `Drawer` | grouped header panels |
| Sticky | header only (`header-site` 64) | header only | header only (`header-site` 80) |

Nothing else sticks on this pattern. The CTA is in the content flow, never a sticky bar. There are no filters on `/`. Landings put category chips in a `FilterBar` bar at every width.

## States

- **Loading:** `PageStates` Skeleton in the final shape, inside each frame. Hero: 16:9 media, a tag pill, two headline bars, two text lines. «تازه‌ها»: one feature card + three horizontal rows. Rows: tile skeletons at the real column count. Grids: tile skeletons at the real column count. Sections load independently, so one slow section never blanks the page.
- **Empty section:** the section and its frame are hidden. A sub-group with no items (e.g. no products yet) hides with its sub-heading. «منتخب همزیست» with 0–1 items is hidden. No published lead story means the row shows FeaturedList only. Never «مطلبی نیست» on the home page.
- **Error / network:** a failed section collapses to `PageStates` NetworkErrorState `--compact` inside its own slot with «تلاش دوباره». If the whole page fails, the full NetworkErrorState sits under the header.
- **Locked / permission:** none. The page is public. A signed-in visitor sees «پنل من» in the header instead of «ورود / ثبت‌نام».
- **Hard cases:** a missing image uses the `RecordImage` placeholder and keeps the frame (announcements have none). Headlines clamp at 3 lines in Hero and 2 in cards with «…», and the full title goes in `title`. A one-story carousel hides its controls. Long breed names such as «سگ گله آناتولی (کانگال)» wrap to two lines on the tile. Large counts («۱۲٬۴۵۰ عضو») must fit without breaking. The Hero copy says «سگ‌ها», but the species are data, so tiles and copy must also work for cats.

## Content & data rules

- All dates are Jalali in Persian digits («۶ مهر ۱۴۰۵»). Meta lines separate items with «،» or spacing, never «·» next to digits.
- Stats are never invented. If a count fails, hide that tile rather than showing «۰».
- Category tags come from `kindFa` / `categoryFa`. Only the tag pill may sit on a photo, never other text.
- Action order is primary at the start, secondary at the end. The only primary action on `/` is «ثبت حیوان» (in the Hero and again in the CtaBand at the end of the page). The header's «ورود / ثبت‌نام» is site chrome and does not count toward the one-primary rule.
- Orange is emphasis only: accent bars, «مشاهده همه ←», the single primary.

## Accessibility & keyboard

- Focus order: `hz-skip-link` → logo → nav groups → «استعلام اصالت» → search → login → `main` («تازه‌ها» items → Hero actions → verify field → carousel prev / dots / next → each section in order) → footer.
- Landmarks: `header`, `nav` (labelled «ناوبری اصلی»), `main#main`, one `section` per row labelled by its `SectionHeader` heading (`h2`), `footer`.
- The carousel is manual only (no autoplay). Slides use `aria-roledescription="اسلاید"` and the active dot has `aria-current="true"`. Arrows are 44px, so the dots are never the only control.
- Each card is one link with one accessible name. The image `alt` comes from `imageAltFa`. The stat box is a `dl`.
- `prefers-reduced-motion` turns off the carousel slide and card lift.

## Pages that use it (about 8)

`/` · `/articles` · `/news` · `/announcements` · `/guides` · `/associations/[slug]` · `/services` · `/clubs/[slug]` (club landing: club header + posts)

**Key screen:** **K1** خانه (`/`), at 390 and 1440, filled and hard states.

## Do / Don't

- **Do** keep the section order from the code and let each section disappear cleanly when it has no data.
- **Do** put every home section in a frame (white / cream alternating, Hero peach); never a full-bleed band on `/`.
- **Do** design every image slot with the missing-image placeholder at the same ratio.
- **Don't** add a primary for any action other than «ثبت حیوان» (the header login excepted), or a sticky CTA.
- **Don't** autoplay the Hero, or overlay headline text on a user photo.
- **Don't** hard-code numbers, fees or the word «سگ» in layout. They are admin data.
