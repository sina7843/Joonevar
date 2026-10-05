# TextStyles

The Hamzist type scale, display to caption including h2, as responsive `.hz-*` classes over the `type` tokens in one family, IRANSansX.

Use these classes (or the matching token values in code) for every piece of interface text; hierarchy comes from size and weight, because `text-primary` and `text-secondary` are only 1.81:1 apart. Long-form article text has its own styles (article-title, article-body…) inside RichText — do not use them in interface chrome.

## Anatomy

One family (`--font-sans`: IRANSansX, Tahoma, system-ui), weights 400 / 600 / 700 / 800 in UI, 900 only in the wordmark. Each style = font-size / line-height · weight, with a mobile and a desktop value for headings.

## CSS API

| Class | Desktop ≥1024 | Mobile & tablet | Use |
|---|---|---|---|
| `.hz-display` | 44 / 64 · 700 | 28 / 44 | Home hero only, one per page |
| `.hz-h1` | 32 / 48 · 700 | 24 / 38 | Page title, record header |
| `.hz-h2` | 24 / 38 · 700 | 20 / 32 | Section title (SectionHeader) |
| `.hz-h3` | 20 / 32 · 700 | 18 / 30 | Panel title |
| `.hz-h4` | 16 / 26 · 700 | 16 / 26 | Card and list-item title |
| `.hz-body-lg` | 18 / 32 · 400, `text-secondary` | same in CSS | Lead paragraph |
| `.hz-body` | 16 / 28 · 400 | same in CSS | Default body |
| `.hz-body-sm` | 14 / 24 · 400 | 14 / 24 | OpsShell body, tables, helper text |
| `.hz-caption` | 12 / 20 · 400, `text-secondary` | 12 / 20 | Meta, timestamps, counters |
| `.hz-overline` | 12 / 20 · 700, `text-brand` | 12 / 20 | Category and small kicker |
| `.hz-numeric` | 36 / 52 · 700 | 26 / 40 | Stat tiles, queue counts |
| `.hz-id` | 13 / 20 · 600, LTR isolate | same | Identifiers, microchip, mobile |

`label` (15/24 · 700) and `label-sm` (13/20 · 600) have no standalone class: they live inside `.hz-btn` / `.hz-btn--sm`, nav items and field labels.

```html
<h1 class="hz-h1">پرونده حیوان</h1>
<p class="hz-body-lg">از ثبت حیوان تا صدور سند رسمی، همه در همزیست.</p>
<span class="hz-caption">۶ دقیقه مطالعه · ۶ مهر ۱۴۰۵</span>
```

Classes reset `margin` on headings only; spacing between blocks comes from the layout (`space-*`), never from the text style.

## Tokens

`tokens.json → type.groups`: «Display & headings — desktop (≥1024)», «Display & headings — mobile (<768)», «Interface text» (body-lg, body, body-sm, label, label-sm, caption, overline, numeric), plus the long-form group. Colours: `text-primary` (default), `text-secondary` (body-lg, caption, meta), `text-brand` (overline, links), `text-disabled` (disabled controls only).

## Variants & sizes

Shell density: SiteShell and PublicShell use body 16/28; OpsShell is one step denser — page title `h3`, panel title `h4`, body `body-sm`. Tablet (768–1023) uses the mobile heading sizes and desktop body sizes. Known gap: the doc lists body 15/26 and body-lg 16/28 on mobile, but `.hz-body` / `.hz-body-lg` do not step down yet.

## States

Text has no interactive states. Rules for content states: empty value → «—» or a helper sentence in `text-secondary`, never blank; unset money → «تعیین‌نشده»; long Persian text → headings wrap to at most two lines, card titles clamp at two lines with an ellipsis and show in full on the detail page (sample: «تمدید مهلت ثبت‌نام آزمون اصالت نسب برای پرورش‌دهندگان عضو انجمن تا پایان آبان‌ماه ۱۴۰۵ و تغییر نحوه ارسال نمونه»). Disabled text uses `text-disabled` and never carries information.

## Mobile ↔ desktop

Headings, display and numeric switch at 1024. All widths must survive text 30% longer (future English/German). 200% zoom must not cause horizontal scroll — never fix a heading's height.

## RTL & LTR

`text-align: start` everywhere; never `right`. Latin identifiers in `<bdi class="hz-id" dir="ltr">`. No letter-spacing on Persian, no italics (Persian has none); emphasis is weight. Numbers: Persian digits with `٬` for text, money, dates and counts; Persian digits are proportional, so numeric table columns align to the end.

## Accessibility

- Use real heading elements in order (`h1` once per page); the class sets the look, the element sets the outline — `<h2 class="hz-h3">` is fine in OpsShell.
- Line heights ≥1.4 on headings and ≥1.6 on body keep Persian dots and ascenders clear; do not tighten them.
- Contrast: `text-primary` ≥10.39:1, `text-secondary` ≥5.84:1, `text-brand` ≥5.89:1 on every light ground.

## Data

Text styles take any string; they never truncate silently except the documented two-line card-title clamp. Dates are formatted Jalali (`fa-IR-u-ca-persian`, `Asia/Tehran`); money with `toLocaleString('fa-IR')` + « تومان».

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** Code `@theme` (`app/globals.css`) has `text-caption`, `text-label-sm/md/lg`, `text-body-sm/md`, `text-h4`, `text-h3`, `text-h1`, `text-display`; there is **no `h2`** — add it from *Typography*.


Token-level: the classes map one-to-one to Tailwind/theme entries generated from `tokens.json` (`text-display`, `text-h1`… with responsive variants). No React component is proposed; headings stay plain elements with a class.

## Do / Don't

- Do build hierarchy with size and weight; Don't use colour alone to separate levels.
- Do use Bold 700 for all headings; Don't use Black/ExtraBlack in UI (wordmark only) or ExtraBold outside article titles.
- Don't use the FaNum build of IRANSansX — it turns Latin identifiers into Persian digits.
- Don't letter-space Persian or set it in italics.
- Don't invent sample numbers; take counts, prices and dates from data.
