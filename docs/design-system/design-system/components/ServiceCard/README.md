# ServiceCard

An open Hamzist service — name, one-line description and its fee from settings — that leads into the service; an unset fee reads «تعیین‌نشده» and a locked service hands over to `LockedServiceCard`.

Use in the dashboard «خدمات» block (PublicShell) and on the home/«خدمات» landing («خدمات همزیست»). Not for paid add-ons inside a flow (show the price on the action button: «پرداخت ۴۰۰٬۰۰۰ تومان»), and not for a service the user cannot use — that is `LockedServiceCard`.

**On public pages (home `/`, `/services`) the card has no footer:** no fee, no unit and no «تعیین‌نشده» (product decision DEC-0186, Acceptance decision 14, 26 Mehr 1405). The fee footer is used only on signed-in pages such as the dashboard; the payment flow shows the amount on its action.

## Anatomy

1. Card — `.hz-card` (white, `border-default`, `radius-xl`); the whole card is the link when the service is open.
2. Title — Bold 16/26 with a forward `arrow-right` (mirrored) at the end.
3. Description — 13/22 `text-secondary`, one or two lines.
4. Footer — hairline, price (Bold 14) at the start, unit («هر حیوان») or note at the end.

## CSS API

Bundle: `.hz-service`, `.hz-service__title`, `.hz-service__desc`, `.hz-service__price`, `.hz-service__price--unset`, inside `.hz-card` (`--interactive` when it is a link) with `.hz-card__footer`.
Addition (`css-additions/ServiceCard.css`): `.hz-service-card` on the card — flex column so the footer sits on the bottom edge when cards share a grid row.

```html
<a class="hz-card hz-card--interactive hz-service-card" href="/registration">
  <div class="hz-service">
    <h3 class="hz-service__title">برگه ثبتی<svg class="hz-icon hz-icon--sm hz-icon--mirror" …arrow-right…></svg></h3>
    <p class="hz-service__desc">سند رسمی ثبت حیوان، پس از تأیید هویت و میکروچیپ توسط دامپزشک معتمد.</p>
  </div>
  <div class="hz-card__footer"><span class="hz-service__price">۲۵۰٬۰۰۰ تومان</span><span class="hz-caption">هر حیوان</span></div>
</a>
```

## Tokens

`bg-surface` (dashboard), `bg-feature` (landing only, via `.hz-card--feature`), `border-default`, `border-subtle` (footer rule), `border-control` (hover), `text-primary`, `text-secondary`, `focus-ring`; locked: `bg-subtle`, `status-neutral-text`.

## Variants & sizes

- **Open with fee** — link card, price from settings.
- **Fee not set** — not a link; price `.hz-service__price--unset` «تعیین‌نشده» + «پرداخت هنوز باز نیست». The payment path stays closed. 26 fees ship `null` (advertising, licences, marketplace, finder); 7 are set.
- **Locked** — render `LockedServiceCard` (what · why · what unlocks it) in the same grid slot: «ثبت کنل» · «فقط حساب پرورش‌دهنده می‌تواند کنل ثبت کند.» · «فعال‌سازی حساب پرورش‌دهنده».
- **Landing** — add `.hz-card--feature` (cream) **only on SiteShell landing pages**; dashboards stay white.

## States

- **Default** · **hover** (pointer only): lift 2px + `border-control` (from `--interactive`).
- **Focus-visible:** ring around the whole card. **Active:** as hover.
- **Disabled:** there is none — an unusable service is either «تعیین‌نشده» or locked, each with its reason.
- **Loading:** skeleton title, two lines and price in the same card.
- **Empty:** the service grid always lists the services from code; no empty state.
- **Long Persian text:** descriptions wrap (no clamp); price never wraps inside itself.

## Mobile ↔ desktop

- <768: one column, full-width cards (whole card ≥ 44px target).
- 768–1023: 2 columns. ≥1024: 3 columns (dashboard and landing).

## RTL & LTR

Price at the start of the footer, unit at the end; the arrow is the LTR `arrow-right` mirrored. Money: Persian digits, `٬` separator, «تومان»; never Rial, never «۰ تومان».

## Accessibility

- Open card: one `<a>`; the title is its heading (`h3` under the section's `h2`), the arrow is `aria-hidden`.
- Unset fee: plain `<div>`, no link role; the text «پرداخت هنوز باز نیست» explains why.
- Locked card: see `LockedServiceCard` — the unlock button is the only interactive element.

## Data

`fees.json → configured[]` (`labelFa`, `toman`, `displayFa`) and `notConfiguredCount`; service names and descriptions from the services page in code. A `null` fee → «تعیین‌نشده». Prices are integer Toman formatted with `toLocaleString('fa-IR')`.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/card.tsx`: `ServiceCard({ label, description, href, icon? })`. There is no fee today; add `fee?: bigint | null` («تعیین‌نشده» when null).


`src/ui/card.tsx` → `ServiceCard` (manifest F, P0). Keep the existing props as in code; it needs title, description, fee (nullable), unit and href. Proposed: render `LockedServiceCard` from `src/ui/card.tsx` when the role check fails instead of a disabled ServiceCard.

## Do / Don't

- Do show «تعیین‌نشده» for a `null` fee and keep that path closed.
- Don't show a disabled-grey ServiceCard without a reason — use `LockedServiceCard`.
- Don't use `bg-feature` cream in PublicShell or OpsShell.
- Don't add a primary button per card; the card is the link.
