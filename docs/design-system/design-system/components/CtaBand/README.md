# CtaBand

The call-to-action box «هویت حیوانت را ثبت کن» — a title, one line of support, and two actions: «ثبت حیوان» (primary, start) and «استعلام اصالت سند» (secondary, end).

Use once on an editorial or landing page in SiteShell (home: last section, as `--media` since v1.0.4). Not inside PublicShell dashboards (they have their own primary action), and never twice on a page.

## Anatomy

1. Box — `bg-brand-subtle` (peach), 1px `border-default`, `radius-2xl` 28.
2. Text — title ExtraBold 18/30 → 20/32; body 14/24 `text-secondary`.
3. Actions — primary `hz-btn--primary --lg` with `plus`; secondary `hz-btn--secondary --lg` with `shield-check`.

## CSS API

Bundle: `.hz-cta`, `.hz-cta__title`, `.hz-cta__body`, `.hz-cta__actions` (column below 1024, row from 1024).
Additions (`css-additions/CtaBand.css`): `.hz-cta__text` (groups title + body so the desktop row has two parts), `.hz-cta--stacked` (forces the stacked mobile form at any viewport: narrow columns, app web views).

```html
<section class="hz-cta" aria-labelledby="cta">
  <div class="hz-cta__text">
    <h2 class="hz-cta__title" id="cta">هویت حیوانت را ثبت کن</h2>
    <p class="hz-cta__body">ثبت در شش مرحله؛ هر مرحله ذخیره می‌شود و بعداً ادامه می‌دهید.</p>
  </div>
  <div class="hz-cta__actions">
    <a class="hz-btn hz-btn--primary hz-btn--lg" href="/animals/new"><svg …plus…></svg>ثبت حیوان</a>
    <a class="hz-btn hz-btn--secondary hz-btn--lg" href="/verify"><svg …shield-check…></svg>استعلام اصالت سند</a>
  </div>
</section>
```

## Tokens

`bg-brand-subtle`, `border-default`, `radius-2xl`, `text-primary`, `text-secondary`, `action-primary`, `action-primary-hover`, `text-on-action`, `action-secondary`, `border-control`, `focus-ring`, `control-lg`.

## Variants & sizes

- **Horizontal** (≥1024) — text at the start, buttons in a row at the end, padding 32/36.
- **Stacked** (<1024, or `--stacked`) — text, then full-width 48px buttons, primary first; padding 22/20.
- Copy is fixed by the brief; the body line is optional.

### `--media` (home, v1.0.4)

`section.hz-cta.hz-cta--media` > `figure.hz-cta__media` (photo) + `div.hz-cta__content` (title, body, actions). Phones: photo 16:9 on top, then the text and full-width buttons. ≥1024: text 7/12 at the start, photo 5/12 at the end, min-height 320. Same tokens as the default band (`bg-brand-subtle`, `border-default`, `radius-2xl`). The photo is decorative content from the home settings (`imageFileId` + `imageAltFa`); without a photo use the default CtaBand.

## States

- Buttons carry all states: hover (pointer) `action-primary-hover` / `action-secondary-hover`; focus-visible ring; pressed = hover; no disabled state (both destinations are always available).
- **Loading/empty/error:** n/a — static content.
- **Long Persian text:** a longer body wraps; on desktop the text column shrinks and the buttons keep their width (`white-space: nowrap`).

## Mobile ↔ desktop

<768 and 768–1023: stacked, buttons 100% wide, 48px tall. ≥1024: one row. Touch targets are 48px everywhere.

## RTL & LTR

Primary at the start, secondary at the end (start = primary rule). `plus` and `shield-check` are never mirrored. In LTR the same markup puts text left and buttons right.

## Accessibility

- `<section>` labelled by its heading; heading level follows the page (`h2`).
- Two links, not buttons — both navigate. Visible text is the accessible name.
- This box holds the page's **one primary button**; the Hero and cards around it use secondary styles.

## Data

Static copy from the approved home mockup; destinations `/animals/new` and `/verify` from the route map.

## Code mapping

★ New — proposed `CtaBand` in `src/public/` with `title`, `body?`, `primary: {label, href, icon}`, `secondary: {label, href, icon}`, `stacked?`. Buttons are `ButtonLink` from `src/ui/button.tsx`.

## Do / Don't

- Do keep the peach `bg-brand-subtle` box — it is the CTA tint, allowed on any SiteShell page.
- Don't swap it for `bg-feature`/`bg-band` cream; those are landing-page-only surfaces (feature cards, one band) and the CTA is not one of them.
- Don't add a third button or a second CtaBand on the page.
- Don't put the primary at the end; order is start = primary, end = secondary.
