# P01 — Editorial home · خانه مجله‌ای

## Purpose

The front door of the public site and of each editorial section. It presents the registry as a trustworthy magazine: one lead story, the editors' picks, what is new, where to go next, and one call to action. Every word, image and number on it is entered by an author, content admin or superadmin, or counted by the system, so the layout has to hold up when a story has no image, a headline is 111 characters long, or a section is empty. The section order on `/` is the one below (approved 11 Mehr 1405, v1.0.3: «تازه‌ها» first, then the Hero in the band); update `app/(public)/page.tsx` to match. The composition and feel come from the reference image.

**Don't use it** for a searchable list of entities (P02), for a single article (P03), or for anything signed in. Dashboards (P04) and OpsShell homes (P09) never take `bg-feature` cards or `bg-band`.

## Anatomy (top to bottom, `/`)

1. **Shell:** `SiteShell` (header with `GroupedNav`, `SiteFooter`). `SyntheticNotice` above the header outside production.
2. **«تازه‌ها» (first, v1.0.3):** directly under the header on a white page (`bg-page`, no band). `SectionHeader` with «همه مطالب مجله ←» + one `ArticleCard --feature` + a list of `ArticleCard --horizontal` (up to four: news, announcements; an announcement without image shows the RecordImage placeholder).
3. **Hero in the band:** the one approved `bg-band` (full-bleed cream, `border-subtle` top and bottom) now carries the `Hero`: `CategoryTag` «سامانه رسمی ثبت حیوان», the admin-written headline «ثبت رسمی و پیگیری سگ‌ها، در یک‌جا» in `display-desktop` / `display-mobile`, summary, «ثبت حیوان» (primary) + «یافتن دامپزشک معتمد» (secondary), the manual image carousel. Desktop: the «استعلام اصالت سند» search card sits under the actions on **`bg-surface` (white)** so it stands out from the cream. Mobile: «استعلام اصالت سند» is a full-width secondary button with the `shield-check` icon. The band's padding is the Hero's own (no extra band padding).
4. **«دنبال چه می‌گردید؟»:** `SectionHeader` + **5** quick-entry `Card --feature --interactive` tiles: دامپزشکان، مراکز دامپزشکی، نژادهای سگ، بازار فروش حیوان، فروشگاه کالا. No search field (search is in the header) and no «استعلام اصالت» tile (it is in the Hero). Desktop: 5 equal columns, title + one-line description, equal heights. Mobile: 2 per row, the fifth tile full width, title only.
5. **«نژادهای سگ»:** `SectionHeader` with «همه نژادها ←» + a row of `BreedCard` tiles.
6. **«انجمن‌ها و کلاب‌ها»:** `SectionHeader` + `ClubCard` row.
7. **«همزیست در یک نگاه»:** a `radius-2xl` stat box of display-only `StatTile`s (count + label, no change line). Every value comes from the server.
8. **«خدمات همزیست»:** `SectionHeader` + `ServiceCard` grid (fees from settings; unset fees read «تعیین‌نشده»).
9. **«روش کار»:** three numbered step cards (`Card --feature`) — ثبت حیوان → تأیید دامپزشک معتمد → صدور سند.
10. **`CtaBand`:** «هویت حیوانت را ثبت کن» with «ثبت حیوان» (primary, start) and «استعلام اصالت سند» (secondary, end).

Section landings (`/articles`, `/news`, `/announcements`, `/associations/[slug]`) keep rows 1, 2 and 10. They replace the rest with a `FilterBar` of category chips over an `ArticleCard` grid and `Pagination`, which is the bottom half of P02.

## Layout

| | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Grid | 4 col, gutter 16, margin 16 | 8 col, gutter 20, margin 32 | 12 col in `container-site` 1280, margin 40 (80 at `bp-wide`) |
| Hero (in the band) | text, actions, «استعلام اصالت سند» button, then the image | same, mobile type sizes | text 6/12 (actions + white verify card) beside the image 6/12 |
| Card grids | 1 column (breeds 2 small tiles) | 2 columns | 3 or 4 columns (breeds 4, news 3, clubs 3, services 3) |
| «تازه‌ها» (first) | feature card, then horizontal list; `space-24` from the header | same, 2-col list | feature 7/12 + list 5/12; `space-48` from the header |
| Quick entry | 2 per row, 5th full width | 3 per row | 5 equal columns |
| Between sections | `space-48` | `space-64` | `space-64` |
| Title → content | `space-24` | `space-24` | `space-24` |
| Card gap / padding | `space-20` / `space-16` | `space-20` / `space-24` | `space-20` / `space-24` |
| Navigation | `GroupedNav` in a `Drawer` | `Drawer` | grouped header panels |
| Sticky | header only (`header-site` 64) | header only | header only (`header-site` 80) |

Nothing else sticks on this pattern. The CTA is in the content flow, never a sticky bar. There are no filters on `/`. Landings put category chips in a `FilterBar` bar at every width.

## States

- **Loading:** `PageStates` Skeleton in the final shape. Hero: 16:9 media, a tag pill, two headline bars, two text lines. FeaturedList: three horizontal rows. Grids: tile skeletons at the real column count. Sections load independently, so one slow section never blanks the page.
- **Empty section:** the section is hidden with its header. «منتخب همزیست» with 0–1 items is hidden. No published lead story means the row shows FeaturedList only. Never «مطلبی نیست» on the home page.
- **Error / network:** a failed section collapses to `PageStates` NetworkErrorState `--compact` inside its own slot with «تلاش دوباره». If the whole page fails, the full NetworkErrorState sits under the header.
- **Locked / permission:** none. The page is public. A signed-in visitor sees «پنل من» in the header instead of «ورود / ثبت‌نام».
- **Hard cases:** a missing image uses the `RecordImage` placeholder and keeps the frame (announcements have none). Headlines clamp at 3 lines in Hero and 2 in cards with «…», and the full title goes in `title`. A one-story carousel hides its controls. Long breed names such as «سگ گله آناتولی (کانگال)» wrap to two lines on the tile. An unset service fee reads «تعیین‌نشده» via `UnsetValue`. Large counts («۱۲٬۴۵۰ عضو») must fit without breaking. The Hero copy says «سگ‌ها», but the species are data, so tiles and copy must also work for cats.

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
- **Do** use `bg-band` once (behind the Hero) and `Card --feature` only on landings; «تازه‌ها» stays white.
- **Do** design every image slot with the missing-image placeholder at the same ratio.
- **Don't** add a primary for any action other than «ثبت حیوان» (the header login excepted), or a sticky CTA.
- **Don't** autoplay the Hero, or overlay headline text on a user photo.
- **Don't** hard-code numbers, fees or the word «سگ» in layout. They are admin data.
