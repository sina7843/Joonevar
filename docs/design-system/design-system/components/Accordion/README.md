# Accordion

A stack of rows that each open to show their content in place. It is used for FAQs, sub-orders inside an order, and settings groups on mobile.

It replaces the raw `<details>` in 6 files. Use it when the reader needs one or two items out of many (FAQ) or a summary first and details on demand (an order's sub-orders). Don't hide content people need on every visit behind it (an animal's identity, a request's next action), and don't use it as page navigation (Tabs) or for the site footer (SiteFooter keeps `.hz-accordion-row`).

## Anatomy

1. **Item** `.hz-accordion__item`: a `<details>` or a `<div>`, with a hairline below.
2. **Trigger** `.hz-accordion__trigger`: a `<summary>`, or a `<button aria-expanded>` inside a heading (`.hz-accordion__heading`, h2–h4 to fit the outline). It holds:
   - **Title** `__title` (Bold 16, wraps)
   - optional **meta** `__meta` (StatusBadge, count, amount)
   - **caret** `__icon` (`caret-down`, turns 180° when open; `lock-simple` when locked)
3. **Panel** `.hz-accordion__panel`: free content (text, KeyValueList, Timeline), 18px bottom padding.

## CSS API

`tools/css-additions/Accordion.css`: `.hz-accordion`, `--boxed`, `--sm`, `__item`, `__heading`, `__trigger`, `__title`, `__meta`, `__icon`, `__panel`.

```html
<!-- server-rendered, no JS (FAQ) -->
<div class="hz-accordion hz-accordion--boxed">
  <details class="hz-accordion__item" open>
    <summary class="hz-accordion__trigger"><span class="hz-accordion__title">برای ثبت حیوان عضویت انجمن لازم است؟</span>…caret-down.hz-accordion__icon</summary>
    <div class="hz-accordion__panel"><p>خیر. …</p></div>
  </details>
</div>
<!-- controlled (single-open, order details) -->
<div class="hz-accordion__item">
  <h3 class="hz-accordion__heading"><button class="hz-accordion__trigger" type="button" aria-expanded="false" aria-controls="so-2">
    <span class="hz-accordion__title">فروشگاه نمونه همزیست</span><span class="hz-accordion__meta">…StatusBadge ۱ کالا</span>…caret</button></h3>
  <div class="hz-accordion__panel" role="region" id="so-2" hidden>…</div>
</div>
```

## Tokens

`border-default` (item rule, boxed frame) · `border-subtle` (rules inside boxed) · `bg-surface` (boxed) · `text-primary` (title, panel) · `text-secondary` (meta) · `icon-default` (caret) · `border-control` (hover underline) · `text-disabled` · `focus-ring` · `radius-xl` (boxed) · `radius-sm` (focus ring) · `duration-fast` + `ease-standard` (caret turn only; no height animation).

## Variants & sizes

- **Plain**: rows separated by `border-default`, no frame. Use inside a card or a page column.
- **Boxed** (`--boxed`): one white bordered panel with `border-subtle` rules and 16/24px inline padding. Use for FAQ pages and order details.
- **sm** (`--sm`): 44px rows, 14px. Use for OpsShell and for settings groups on mobile (P11: «گروه‌ها آکاردئونی»).
- **With meta**: a status, count or amount at the end of the trigger. The title is never truncated for it.
- **Single-open vs multi-open**: FAQ is multi-open (`<details>`). Order details may be single-open (controlled), and the first sub-order that needs action opens by default.

## States

- **default** (closed): caret down.
- **hover** (pointer only): the title gets a `border-control` underline. No background change.
- **focus-visible**: a ring on the trigger (inset in boxed).
- **open**: `[open]` / `aria-expanded="true"`, caret turns. Content appears without a height animation (`prefers-reduced-motion` safe by default).
- **disabled / locked**: `aria-disabled="true"`, `text-disabled`, `lock-simple` instead of the caret, with the reason via `aria-describedby` («جفت‌یابی» settings for a role without that capability).
- **loading**: the panel shows Skeleton lines with `aria-busy` on the trigger. The trigger is already rendered from the data we have (name, status, total).
- **error**: the panel holds an InlineMessage (error) + «تلاش دوباره». The item stays open.
- **empty**: a panel with nothing to show is not an item. Remove it, don't show an empty drawer.
- **long Persian text**: the title wraps. The caret and meta stay top-aligned to the first line (preview: the 2-line announcement title at the 720px reading width).

## Mobile ↔ desktop

The same component at every width. The row is ≥56px (44px for `--sm`), and the whole row is the target. At <768 boxed panels keep 16px padding. At ≥1024 they get 24px. FAQ sits at `container-reading` (720) width on SiteShell.

## RTL & LTR

The title is at the start, meta and caret at the end. `caret-down` is not mirrored (vertical). Text and meta align with logical properties. Latin identifiers in titles go in `<bdi>` («سفارش 854Q6KUX»).

## Accessibility

- `<details>/<summary>` gives the expanded state and keyboard for free. Use it when the content is static.
- Controlled form: a heading wraps a `<button aria-expanded aria-controls>`, and the panel is `role="region"` + `aria-labelledby` (only when there are ≤6 items, so regions don't flood landmarks).
- Enter and Space toggle. Tab moves between triggers. There are no arrow-key bindings, because this is not a tablist.
- The meta inside the trigger is part of its name («پت‌شاپ آریا ارسال‌شده ۲ کالا»), so keep it short.

## Data

- FAQ: question/answer pairs come from admin-managed content. The preview uses real product facts (the pedigree fee «۴۰۰٬۰۰۰ تومان», referral validity «۲۱ روز»).
- Order: one item per `subOrders[]` (`sellerFa`, `status`, `items`). The panel shows the seller's `shippingFee` and `freeShippingThreshold`. The last item is the payment summary (`total`).
- Settings: one item per `SettingGroup`, with the key count and the «تعیین‌نشده» count from settings (fees: ۳۳ keys, ۲۶ unset).

## Code mapping

★ New `src/ui/accordion.tsx`: `Accordion({ variant?: 'plain' | 'boxed', size?: 'md' | 'sm', type?: 'multiple' | 'single', headingLevel?: 2 | 3 | 4 })` + `AccordionItem({ id, title, meta?, defaultOpen?, disabled?: { reason } })`. `type="multiple"` with no client state renders `<details>`. It replaces the 6 raw `<details>` (verify file list in repo).

## Do / Don't

- Do write FAQ titles as the user's question, with a question mark.
- Do put the status in the trigger meta so a closed order is still readable.
- Don't nest accordions.
- Don't hide the next action (ActionOwner, primary button) inside a closed item.
