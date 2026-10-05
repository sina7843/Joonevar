# SellerCard

A shop seller — logo, name, kind, city, shipping fee and free-shipping threshold — with its status only in seller and market-admin views.

Use in the product page offer box («فروشنده»), the cart sub-order header and the market admin's seller list. Not for animal-listing sellers (owner/kennel, shown inside `ListingCard` meta) and not for a club or centre.

## Anatomy

1. Logo — RecordImage `--thumb-lg` 64px, `radius-lg`; missing → symbol empty state.
2. Name — `displayNameFa`, Bold 16/26, a link to the seller's shop page.
3. Meta — «پت‌شاپ، کرج» (kind label، city).
4. Status badge (seller/admin views, when not `ACTIVE`) — e.g. `UNDER_REVIEW` «در حال بررسی» (info), `SUSPENDED` «تعلیق‌شده» (error).
5. Shipping — divider, then `truck` «هزینه ارسال: ۸۵٬۰۰۰ تومان» and `check` «ارسال رایگان برای خرید از ۱٬۵۰۰٬۰۰۰ تومان». Fee `null` → «تعیین‌نشده» (`UnsetValue`) + why the purchase path is closed.

## CSS API

New in `css-additions/SellerCard.css`: `.hz-seller`, `__shipping`, `__fee`. Composes `.hz-card`, `.hz-entity*` and `.hz-entity__line` (ClubCard), `.hz-media--thumb-lg`, `.hz-badge--sm`, `.hz-unset`.

```html
<article class="hz-card hz-seller">
  <div class="hz-entity">
    <div class="hz-media hz-media--thumb-lg">…</div>
    <div class="hz-entity__body">
      <h3 class="hz-entity__name"><a href="/shop/sellers/aria">پت‌شاپ آریا</a></h3>
      <span class="hz-entity__meta">پت‌شاپ، کرج</span>
    </div>
  </div>
  <div class="hz-seller__shipping">
    <span class="hz-entity__line"><svg …truck…></svg><span>هزینه ارسال: <b class="hz-seller__fee">۸۵٬۰۰۰ تومان</b></span></span>
    <span class="hz-entity__line"><svg …check…></svg><span>ارسال رایگان برای خرید از ۱٬۵۰۰٬۰۰۰ تومان</span></span>
  </div>
</article>
```

## Tokens

`bg-surface`, `border-default`, `border-subtle`, `bg-media-empty`, `text-primary`, `text-secondary`, `text-brand` (name link hover), `icon-default`, `status-info-*`, `status-error-*`, `radius-xl`, `radius-lg`, `focus-ring`.

## Variants & sizes

- **Kind:** `PET_SHOP` «پت‌شاپ» · `VERIFIED_BUSINESS` «کسب‌وکار تأییدشده» (code labels).
- **Public** (no badge) / **seller & admin** (badge when not active).
- **Shipping set** / **fee unset** («تعیین‌نشده»; checkout from this seller stays closed) / **no free-shipping threshold** (second line omitted).
- One size; in the cart header it sits full width.

## States

- **Default** — the card is not a link; the name is. **Hover** (pointer): name underline.
- **Focus-visible:** ring on the name link (preview: first card).
- **Loading:** thumb skeleton + two lines.
- **Disabled:** n/a.
- **Long Persian text:** names wrap; the badge drops under the meta.

## Mobile ↔ desktop

<768 full width under the product's price block. 768–1023 inside the product side column. ≥1024 in the sticky side column of the product page (P3 pattern) and as the sub-order header in the cart. On touch screens (<768) wrap the whole card in the link (`a.hz-card.hz-card--interactive.hz-seller`, name as plain text) so the target is the card, not a 26px line.

## RTL & LTR

Logo at the start. Money in Persian digits with «٬» and always «تومان». `truck` and `check` are not mirrored.

## Accessibility

- `<article>` with the name as `<h3>` link; the logo is decorative (`alt=""`) — the seller page uses `logo.altFa`.
- Status text in the badge; shipping lines are plain text (icons `aria-hidden`).

## Data

`shop.json → sellers[]`: `displayNameFa`, `kind`, `status`, `city`, `shippingFee.toman/displayFa`, `freeShippingThreshold.toman/displayFa`, `logo` (`altFa`). Kind labels: `status-labels-extracted.json → PET_SHOP`, `VERIFIED_BUSINESS`. The «تعیین‌نشده» card in the preview is constructed (fee set to `null`).

## Code mapping

★ New (P2) — proposed `SellerCard` in `src/ui/card.tsx`: `name`, `kind: 'PET_SHOP' | 'VERIFIED_BUSINESS'`, `city`, `shippingFeeToman: bigint | null`, `freeShippingThresholdToman?: bigint`, `status?` (pass only in seller/admin views), `logo?`, `href`.

## Do / Don't

- Do show the shipping fee before the cart — it is the main difference between sellers of the same product.
- Do write «ارسال رایگان برای خرید از …» with the real threshold; omit the line when there is none.
- Don't show «فعال» on public cards; don't show ratings for sellers (no seller rating in the data).
