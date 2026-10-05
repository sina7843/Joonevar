# P03 — Public detail · جزئیات عمومی

## Purpose

The public page for one entity: a breed profile, a veterinarian, a centre, an article, news item or announcement, a shop product, an animal listing, a mating profile, or a document verification result. The visitor reads, compares and then takes one step: contact, add to cart, message the seller, or verify a document. Two shapes share one skeleton. **Read** pages (articles) use the 720 reading measure with a related column. **Profile** pages (vet, centre, product, listing) use media and facts with an action column.

**Don't use it** for a record the user owns (P06, which has a status, «اقدام بعدی با» and a timeline), for an editable profile (P11 or the `/account/*` editor), or for printed documents (`A4DocumentTemplate`, K18).

## Anatomy (top to bottom)

1. **Shell:** `SiteShell`.
2. **`PageHeader`, record variant:** `Breadcrumbs` (≥768) or «بازگشت», `h1`, and a `StatusBadge` only where the entity has a public status (a listing that is «رزروشده»). The meta line differs by entity: breed «گروه FCI ۱، بزرگ»; vet city + «معتمد»; article `CategoryTag` + `ReadTime` + date.
3. **Media:**
   - Article: `ContentDetail` lead figure (16:9, caption, credit), omitted when there is no image.
   - Breed, vet, centre: one `RecordImage` (16:9 or 4:3), or `Avatar` for vets.
   - Product, listing: a gallery, 1:1 for products and 4:3 for listings, with thumbnails.
4. **Main column:**
   - Article: `ContentDetail` body (`.hz-prose`), tags and «بازبینی محتوا».
   - Breed: `BreedCard` profile panel with traits as three-step meters with text levels, then `historyFa`.
   - Vet / centre: `KeyValueList` (تخصص، مطب، ساعت کار، خدمات، امکانات، وضعیت پروانه), plus `PlaceMap` with a single pin beside the written address.
   - Product: `VariantPicker`, `StockBadge`, `Rating`, description, reviews.
   - Listing: `KeyValueList` (نژاد، جنس، سن، واکسن، عقیم‌سازی، شهر) and the seller kind.
   - Mating profile: `MatingProfileCard` facts and the compatibility box with its reasons.
   - Verify: `VerificationResult`.
5. **Side column (action):**
   - Product: offer box with `PriceDisplay`, `QuantityStepper`, «افزودن به سبد», and `SellerCard`.
   - Listing: price + «پیام به فروشنده».
   - Vet / centre: contact.
   - Article: `RelatedColumn` «مطالب مرتبط».
6. **Related row:** «آگهی‌های مشابه» / «محصولات مشابه» (`SectionHeader` + `ListingCard` / `ProductCard`), «نژادهای مشابه».
7. **`CtaBand`:** optional, on breed and article pages only, never on transactional pages.

## Layout

| | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Columns | one column: media at the top, then facts, then related | one column, wider facts (`KeyValueList` single column) | two columns in `container-site`: main 8/12 + side 4/12. Articles: 720 reading column + `RelatedColumn` 280–340 |
| Primary action | `StickyActionBar` at the bottom («افزودن به سبد — ۳۸۰٬۰۰۰ تومان», «پیام به فروشنده») | in content, after the offer box | in the side column, sticky at `header-site` + `space-24` |
| Gallery | swipeable, with counter «۲ از ۵», 44px arrows | same + thumbnail strip | main image + thumbnail strip at the start |
| Related | after the main content (articles: 3 items) | after (4 items) | `RelatedColumn` sticky at the end; similar-items row below |
| Overlays | image zoom and variant quick-pick in `BottomSheet` | `Modal` | `Modal` |
| Spacing | sections `space-48`, card padding `space-16` | `space-64`, `space-24` | `space-64`, `space-24` |

## States

- **Loading:** `PageStates` Skeleton in the page shape. Articles get a tag pill, two title lines, a 16:9 block and three text lines. Profiles get media + `KeyValueList` bars + the action card. `aria-busy` is set on `main`.
- **Not found / not published / hidden:** the same «صفحه‌ای با این نشانی پیدا نشد» `PageStates` for a missing, hidden or removed record (never confirm that a hidden record exists). A sold listing stays readable with the closed badge and a disabled action plus the reason.
- **Error / network:** NetworkErrorState in `main` with «تلاش دوباره». If only the related row fails, it is hidden.
- **Locked / permission:** public. Actions that need an account («پیام به فروشنده», «ذخیره») lead to `/login` with `returnTo`. A buyer action on one's own listing is hidden.
- **Hard cases:** no image means an article omits the lead figure while profiles keep the `RecordImage` placeholder. The 111-character title is shown in full on the detail page (clamps only on cards). A missing optional fact shows «—». A price with no amount shows «تعیین‌نشده». An out-of-stock variant stays visible and disabled in `VariantPicker`. An approximate age shows «حدود». A vet with no public council code simply has no row.

## Content & data rules

- Money is always `PriceDisplay` in تومان. Products show the variant's own price. Struck-through old prices show the saving. «تعیین‌نشده» is never ۰.
- Dates are Jalali in Persian digits. `Identifier` (Latin, `bdi dir="ltr"`) is used for document numbers on `/verify/[code]` and for council codes.
- Verification shows only the document's public facts (`VerificationResult`) and never the owner's private data.
- Action order: primary at the start («افزودن به سبد»), secondary after it («مقایسه»، «ذخیره»). There is one primary per view.
- Image alt text comes from `imageAltFa`. Private documents never appear on public pages.

## Accessibility & keyboard

- Landmarks: `main` holds an `article` (read pages) or the profile. The side column is an `aside` labelled by its heading.
- Focus order: back / breadcrumbs → `h1` → gallery → main facts → side action → related → footer. On mobile the sticky bar is last in DOM order before the footer and does not cover the focused field (`scroll-padding-block-end`).
- The gallery is a list of buttons with alt text. The counter is `aria-live="polite"`. Arrows are not the only control (thumbnails, swipe).
- Breed trait meters always carry the text level («زیاد»), never a bar alone.
- `VariantPicker` is a radio group. Stock changes are announced politely.

## Pages that use it (about 14)

`/breeds/[slug]` · `/veterinarians/[slug]` · `/centers/[slug]` · `/articles/[slug]` · `/news/[slug]` · `/announcements/[slug]` · `/associations/[slug]/posts/[postSlug]` · `/services/[slug]` · `/shop/[slug]` · `/animals-market/[id]` · `/mating-finder/[id]` · `/parentage-test` · `/verify` · `/verify/[code]`

**Key screens:** **K4** مقاله (`/articles/[slug]`) · **K6** آگهی حیوان (`/animals-market/[id]`) · **K7** محصول فروشگاه (`/shop/[slug]`).

## Do / Don't

- **Do** keep one primary action, sticky at the bottom on phones and in the side column on desktop.
- **Do** keep a 720 reading measure for long text at every width.
- **Do** keep sold, reserved or out-of-stock items readable with the reason shown.
- **Don't** render an empty lead frame on an article that has no image.
- **Don't** reveal whether a hidden or removed record exists.
- **Don't** put seller phone numbers or private documents on the page unless the seller chose to show them.
