# ButtonLink

A link (`<a href>`) that looks like a Button, for navigation that needs button weight.

Use it when the main next step is *going somewhere*: «پیگیری درخواست» on a receipt, «استعلام اصالت سند» on the home hero, «باز کردن پرونده» in a queue row. If the click performs an action on this page (submit, pay, delete), use Button. For low-emphasis navigation in text or section headers use TextLink.

## Anatomy

Same as Button: container, optional start icon, label. External links add `arrow-square-out` (mirrored) at the **end** and a hidden «(در زبانه تازه باز می‌شود)».

## CSS API

Exactly the Button classes on `<a>`: `.hz-btn` + tone (`--primary`, `--secondary`, `--ghost`, `--destructive-outline`) + size (`--sm`, `--lg`) + `--block` / `--wrap`. `text-decoration: none` is in the base class.

```html
<a class="hz-btn hz-btn--primary" href="/requests/HZ-32AHW6V6PC">پیگیری درخواست</a>
<a class="hz-btn hz-btn--secondary" href="/verify">
  <svg class="hz-icon hz-icon--sm" viewBox="0 0 256 256" aria-hidden="true">…shield-check…</svg>استعلام اصالت سند
</a>
<a class="hz-btn hz-btn--secondary" role="link" aria-disabled="true">دریافت شجره‌نامه</a>
```

## Tokens

Same as Button: `action-*`, `text-on-action`, `text-brand`, `border-control`, `bg-disabled`, `text-disabled`, `focus-ring`, `radius-md`, `control-*`.

## Variants & sizes

primary · secondary · ghost (destructive tones are rare for links — a destructive step is an action, so it is a Button). Sizes sm / md / lg; block on mobile.

## States

default · hover (pointer only, as Button) · focus-visible ring · active (as hover) · disabled — a link has no `disabled`; remove `href`, add `role="link"` and `aria-disabled="true"` (styled by the bundle) and say why nearby («سند هنوز صادر نشده») · loading — not applicable (navigation shows the next page's skeleton) · long Persian text — as Button (`--wrap` in narrow block).

## Mobile ↔ desktop

<768: the main ButtonLink becomes `lg` + `block`; ≥768 inline `md`. `sm` only in OpsShell desktop rows.

## RTL & LTR

Start icon at inline-start; external-link icon at inline-end and mirrored. Codes in `href` stay Latin; codes shown in the label go in `<bdi dir="ltr">`.

## Accessibility

- It is a link: Enter activates it (Space does not); screen readers announce «پیوند».
- Do not add `role="button"` to make it look like an action.
- External: `target="_blank" rel="noopener"` plus the hidden «در زبانه تازه» text.
- Name must make sense out of context: «پیگیری درخواست», not «اینجا».

## Data

`href` from the route of the target record (request code, petId, slug). When the target does not exist yet (document not issued, case locked), render the disabled form instead of a dead link.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/button.tsx`: `ButtonLink({ tone, block, href, className, ...anchor props })` — mirrors Button. Confirmed.


`src/ui/button.tsx` — `ButtonLink` (same file). Propose the same `size`, `iconStart` and `wrap` props, plus `external?: boolean` (adds icon, `target`, `rel`, hidden text).

## Do / Don't

- Do use ButtonLink for «پیگیری درخواست» and «استعلام اصالت سند»; Don't use it for «پرداخت».
- Don't put two primary ButtonLinks side by side; the second is secondary.
- Don't leave `href="#"` for unavailable targets; use the disabled form with a reason.
