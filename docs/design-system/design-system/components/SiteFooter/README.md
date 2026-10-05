# SiteFooter

The canonical public-site footer: a brand column with contact details and the trust badge, and six link groups that list all 16 sections plus the 4 pages that are not in the header — multi-column on desktop, accordion rows on phones.

Use it at the end of every SiteShell page (this folder is the single source; SiteShell embeds it). Never in PublicShell or OpsShell — app shells end with their content (and the tab bar on phones).

## Anatomy

1. **Brand column** — logo (`hz-logo--responsive`), one-line description, contact list (phone in `bdi`, support hours, link to the contact form), trust badge (88px RecordImage frame linking to the issuer) + one-line note.
2. **Six groups** (same grouping as GroupedNav):
   مجله: آموزش‌ها · اخبار · اطلاعیه‌ها — راهنمای دامپزشکی: دامپزشکان · مراکز دامپزشکی · نژادهای سگ — انجمن‌ها: انجمن‌ها و کلاب‌ها · کلاب‌ها · شرایط عضویت انجمن† · مقررات انجمن† — بازار: بازار فروش حیوان · فروشگاه کالا — خدمات: خدمات · راهنمای سامانه · استعلام اصالت · تست اصالت نسب† · وضعیت‌ها و مراحل† — همزیست: خانه · درباره همزیست · تماس با ما. († = off-nav page; 16 sections + 4.)
3. **Bottom row** — «© ۱۴۰۵ همزیست» · «همه حقوق این سامانه محفوظ است.» above a `border-default` rule (≥768).

## CSS API

Bundle (SiteShell): `.hz-site-footer`, `__grid`, `__brand`, `__tagline`, `__trust`, `__bottom`, `.hz-footer-col`, `__title`, `__links`, `.hz-accordion-row`. css-additions `SiteFooter.css`:

| Class | Role |
|---|---|
| `.hz-site-footer__contact-list`, `__contact-item` | contact rows (icon + text/link), 44px touch rows, 32px with a fine pointer ≥768 |
| `.hz-site-footer__trust-row`, `__trust-note` | badge + explanatory line |
| `.hz-site-footer--stacked` | forces the phone form (brand, then accordion rows) at any width — previews and narrow embeds |

```html
<footer class="hz-site-footer"><div class="hz-container">
  <div class="hz-site-footer__grid">
    <div class="hz-site-footer__brand">… logo · tagline · <ul class="hz-site-footer__contact-list">…</ul> · <div class="hz-site-footer__trust-row">…</div></div>
    <div class="hz-footer-col">
      <h2 class="hz-footer-col__title">خدمات</h2>
      <button type="button" class="hz-accordion-row" aria-expanded="false" aria-controls="ft-4">خدمات …caret-down…</button>
      <ul class="hz-footer-col__links" id="ft-4"><li><a href="/services">خدمات</a></li>…</ul>
    </div> …
  </div>
  <div class="hz-site-footer__bottom"><span>© ۱۴۰۵ همزیست</span><span>همه حقوق این سامانه محفوظ است.</span></div>
</div></footer>
```

## Tokens

`bg-chrome` (footer), `border-default` (top edge, accordion rows, bottom rule), `text-primary` (titles, contact links), `text-secondary` (links, tagline, notes), `text-brand` (hover), `icon-default`, `focus-ring`, `bg-media-empty` (missing badge), `radius-lg`, `container-site`.

## Variants & sizes

One footer for every SiteShell page; no landing-specific variant. `--stacked` only for narrow containers. Padding 56/32 desktop, 28/24 phone. Brand column 280 + six equal columns at ≥1024; brand row + 3 columns at 768–1023.

## States

- Link: default · hover (pointer: `text-brand` + underline) · **focus-visible** ring (preview: «استعلام اصالت») · current page (`aria-current="page"`, `text-primary` 700 — proposal).
- Accordion (<768): collapsed / expanded, caret rotates 180°; several groups may be open at once.
- **Missing trust badge image** — RecordImage empty state «نماد اعتماد»; the link to the issuer stays.
- **Missing contact value** (phone or hours not set) — the row is omitted, never «تعیین‌نشده» in a footer.
- Long text: «راهنمای دامپزشکی» and «شرایط عضویت انجمن» are the longest labels; they wrap inside a column at 1024 rather than truncate.

## Mobile ↔ desktop

| | <768 | 768–1023 | ≥1024 |
|---|---|---|---|
| Brand | full width, then rows | full-width row | 280 column |
| Groups | 6 accordion rows, 52px | 3 columns, headings | 6 columns, headings |
| Link rows | 44px | 32 (fine) / 44 (coarse) | same |
| Bottom | stacked, no rule | rule + row | rule + row |

## RTL & LTR

Brand column at the start; groups flow towards the end. Carets (`caret-down`) are not mirrored. Phone number is `bdi dir="ltr"`. All spacing logical.

## Accessibility

`<footer>` landmark (contentinfo). ≥768 each group has a real `h2`; <768 the heading is replaced by a `button[aria-expanded][aria-controls]` (only one is in the accessibility tree at a time). Contact list is labelled «تماس با همزیست». The trust badge link has an `aria-label` naming the issuer page. Footer is last in focus order after `main`.

## Data

Labels and routes from `src/public/sections.ts` (16 sections) + the 4 off-nav routes; grouping from the proposed `NAV_GROUPS` (shared with GroupedNav and the header). Contact phone, support hours and the trust-badge image/URL are **not in the sample pack**: proposed settings keys `SUPPORT_PHONE`, `SUPPORT_HOURS_FA`, `TRUST_BADGE_IMAGE`, `TRUST_BADGE_URL`. The preview phone uses the reserved `0999` prefix.

## Code mapping

★ New — proposed `SiteFooter` in `src/public/site-footer.tsx`, rendered by `SiteShell`. Props: `groups: NavGroup[]` (from `NAV_GROUPS`), `currentPath?`, `contact?: { phone?, hoursFa?, contactHref }`, `trustBadge?: { imageUrl, href, altFa }`. Defaults read from settings.

## Do / Don't

- Do list every section and off-nav page here — the footer is the site map.
- Do keep the footer cream with a single top rule; no second background band.
- Don't put a newsletter form, social feed or primary button in the footer.
- Don't invent a contact value when a setting is empty — omit the row.
