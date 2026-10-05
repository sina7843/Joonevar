# RadioCard

A radio choice drawn as a bordered card, with an optional leading icon and a price at the end — for choosing a service, a plan or a shipping method.

Use it when each option needs a name, one line of explanation and usually a price («صدور شجره‌نامه — ۴۰۰٬۰۰۰ تومان», «ارسال توسط فروشگاه — ۸۵٬۰۰۰ تومان»). For short options without explanation use Radio; for an on/off setting use Switch; for picking several use Checkbox. A choice whose fee is not set is shown locked with «تعیین‌نشده» — never as ۰ تومان.

## Anatomy

1. Fieldset legend (the question) + required mark.
2. Card `.hz-option.hz-option--card`: radio (20px) · optional icon tile (40px) · text (label 700, description) · price at the end.
3. Locked card: dashed border, `bg-subtle`, disabled radio, «تعیین‌نشده» with a lock icon, description = why + what unlocks it.
4. Group error under the cards.

## CSS API

| Class | Use |
|---|---|
| `.hz-option` | Radio card (bundle; checked = `border-brand` + `bg-brand-subtle`) |
| `.hz-option--card` | Grid layout with icon + price areas (css-addition `RadioCard.css`) |
| `.hz-option__icon` | 40px icon tile; brand-coloured when checked |
| `.hz-option__text` · `__label` · `__desc` | Text column (Radio additions) |
| `.hz-option__price` · `--unset` · `__price-note` | Price; unset in `text-secondary` |
| `.hz-option__lock` | Lock icon + «تعیین‌نشده» |
| `.hz-choice-group--stack` | Single-column list, 8px gap (priced options) |
| `.hz-choice-group--cards` | Two columns from 768 (short, unpriced or short-priced options) |

```html
<fieldset class="hz-fieldset">
  <legend class="hz-field__label">روش ارسال<span class="hz-field__req" aria-hidden="true">*</span></legend>
  <div class="hz-choice-group hz-choice-group--stack">
    <label class="hz-option hz-option--card">
      <input type="radio" name="ship" checked aria-describedby="ship-1-d">
      <span class="hz-option__icon">…truck…</span>
      <span class="hz-option__text"><span class="hz-option__label">ارسال توسط فروشگاه</span>
        <span class="hz-option__desc" id="ship-1-d">از کرج؛ رایگان برای خرید بالای ۱٬۵۰۰٬۰۰۰ تومان از این فروشگاه</span></span>
      <span class="hz-option__price">۸۵٬۰۰۰ تومان</span>
    </label>
  </div>
</fieldset>
```

## Tokens

`bg-surface` · `border-default` (rest) · hover `border-control` · checked `border-brand` + `bg-brand-subtle` + `action-primary` dot · icon tile `bg-subtle` / `icon-strong`, checked `text-brand` · locked `bg-subtle`, dashed `border-default`, `status-neutral-text` · error `status-error-border` · focus `focus-ring` · `radius-lg`.

## Variants & sizes

With icon + price (services, shipping) · price only · icon only · text only · list (`--stack`) or two-column grid (`--cards`). One size; card padding 14px.

## States

Default · hover (pointer: border darkens) · checked · focus-visible (ring around the card via `:has(input:focus-visible)`) · disabled/locked with reason («هزینه این خدمت هنوز تعیین نشده است. پس از آنکه انجمن تعرفه را تعیین کند، این گزینه فعال می‌شود.») · error on the group («روش ارسال این بسته را انتخاب کنید.») · loading: prices come with the page; while a quote is fetched show the card with a Skeleton pill in the price slot · **long Persian label** wraps, price stays aligned to the first line.

## Mobile ↔ desktop

<768: price moves under the description (grid area «price» below «text») so labels keep their width; cards stack full width. ≥768: price in its own end column; `--cards` groups go two-up. Whole card is the touch target (≥ 64px tall).

## RTL & LTR

Radio and icon at inline-start, price at inline-end — they swap in LTR. Icons (truck, storefront, file-text) are non-directional. Prices use Persian digits with «٬».

## Accessibility

Native radios in a `fieldset` + `legend`; arrow keys move between cards. The description is linked with `aria-describedby`; the price is part of the label text so it is read with the name. Locked options are `disabled` and keep their reason visible (not only a tooltip). Group errors: `aria-describedby` on the fieldset, `aria-invalid` on the radios.

## Data

Services and fees from settings (`fees.json`: `fee.pedigree_toman` ۴۰۰٬۰۰۰, `fee.mating_permit_toman` ۳۰۰٬۰۰۰, `fee.kennel_registration_toman` ۱۵۰٬۰۰۰ …; 26 fees ship `null` → locked «تعیین‌نشده»). Shipping from the seller (`shippingFee`, `freeShippingThreshold`). The submitted value is the option key; the price shown is display only — the server re-prices.

## Code mapping

★ Proposed `RadioCard` / `RadioCardGroup` in `src/ui/radio-card.tsx`: group `legend`, `name`, `value`, `onChange`, `required`, `error`, `layout: 'stack' | 'grid'`; card `value`, `label`, `description?`, `icon?`, `priceToman?: bigint | null` (null → «تعیین‌نشده» + locked), `priceLabel?` (e.g. «رایگان»), `disabled?`, `disabledReason?`.

## Do / Don't

- Do lock an option whose fee is `null`, and say who sets it.
- Do keep prices in the same position on every card of a group.
- Don't show «۰ تومان» for unset or free; free is «رایگان» only when the data says the price is zero.
- Don't put more than one line of description; details belong on the service page.
- Don't use RadioCard for yes/no.
