# Hamzist Design System — changelog

## v1.0.3 — 11 Mehr 1405 (3 Oct 2026)

**Package:** added `key-screens/` (images of K1–K19 at 1440 and 390, 3 extra states, 2 brand boards, with an index) and `fonts/` — the full licensed IRANSansX Pro family with `licenses.pdf` and a README (the app still only needs `design-system/fonts/*.woff2`).

Home page and site header, approved by the product owner. No `bundle.css` or token change. Key screens updated: **K1** (390 and 1440), header of **K4–K7**.

1. **Home order (P01):** «تازه‌ها» is now the **first section**, directly under the header, on the white page (no band). The one `bg-band` (cream, `border-subtle` top and bottom) moved **behind the Hero**; the band adds no padding of its own (the Hero's padding is used). On desktop the «استعلام اصالت سند» card inside the Hero uses `bg-surface` (white) instead of `bg-feature`. The next section starts `space-64` (desktop) / `space-48` (phone) below the band.
2. **«دنبال چه می‌گردید؟»:** the search field and the «استعلام اصالت» tile are removed (the header has search; the Hero has the verify form). Five tiles remain — دامپزشکان، مراکز دامپزشکی، نژادهای سگ، بازار فروش حیوان، فروشگاه کالا — 5 equal columns on desktop (title + one-line description, equal heights), 2 per row on phones with the fifth full width.
3. **SiteShell header:** «ورود / ثبت‌نام» (and «پنل من» when signed in) is a **primary** `sm` button with the **filled** `user` icon; the mobile menu's foot button is a primary block button with the same icon. It is site chrome and does not count toward the one-primary-per-view rule; filled `user` here is the one exception to «fill = active state only».
4. **Colour:** the two alpha uses of the ink — overlay shadows 12–24% and `overlay-scrim` 48% — are approved (no new colour; values unchanged). *Color* and *Acceptance* no longer list anything as awaiting approval.

In the app: reorder `app/(public)/page.tsx` to match P01, move the band to the Hero, slim the quick-entry section, and update `src/public/site-shell.tsx` (desktop login button and `MobileMenu` foot). Add `userFill` to `src/ui/icon-paths.ts` (Phosphor `user`, fill weight).

Changed files: `patterns/P01-editorial-home.md`, `components/SiteShell/README.md` + previews of SiteShell, SiteShellTablet, SiteShellMobile, GroupedNav; `components/Button/README.md`, `04-iconography.md`, `shells.md`, `zz-checklist.md`.

## Handoff package — 11 Mehr 1405 (3 Oct 2026)

- Added `CLAUDE-CODE-DESIGN-SYSTEM-RULES.md` (mandatory rules), `START-PROMPT-FOR-CLAUDE-CODE.md`, `demo-content/DEMO-DATA-SPEC.md` and `demo-content/images-manifest.json` (all 78 photos mapped to records).
- Design system content was unchanged from v1.0.2 at that point.

## v1.0.2 — 11 Mehr 1405 (3 Oct 2026)

**Dropdown options list.** `.hz-select` opens its list as a separate rounded panel in the system's menu style instead of the browser's square list glued to the field: 6px below the field, `radius-lg` (16), `border-default`, `shadow-overlay-sm`, 6px inner padding, at least the field's width, max 320px then scroll; 40px rows with `radius-sm`, hover `bg-subtle`, selected `bg-brand-subtle` + `text-brand` Bold + ✓ at the end; the arrow points up while open. Built with `appearance: base-select` inside `@supports` + `@media (pointer: fine)` — Chromium 135+ on desktop gets the panel; phones and other browsers keep the native picker. No JavaScript.
In the app: every dropdown must be the system's SelectField (`.hz-select-wrap` > `select.hz-select`) for this to apply — replace the local `CONTROL` native selects on the public list pages.

Changed files: `design-system/components/bundle.css`, `components/SelectField/README.md`, `zz-checklist.md`.

## v1.0.1 — 11 Mehr 1405 (3 Oct 2026)

Small visual fix; no new components, no token changes. Apply on top of v1.0.

1. **Text-field focus** — `.hz-input`, `.hz-textarea`, `.hz-select`, OTP boxes, `.hz-combobox__control`, `.hz-composer__input`: one orange stroke. The field's own border turns `focus-ring` at 2px (`border-color: var(--focus-ring); box-shadow: inset 0 0 0 1px var(--focus-ring); outline: none`), with the same `radius-md` (12px) corners as at rest — no second ring, no offset, no size change. An invalid field keeps a red 2px border while focused. Buttons, links, checkboxes and cards keep the 2px ring with 2px offset.
   In Tailwind terms for `src/ui/field.tsx`: replace any `focus:ring*` / `focus-visible:outline*` on text controls with `focus-visible:border-[var(--focus-ring)] focus-visible:shadow-[inset_0_0_0_1px_var(--focus-ring)] focus-visible:outline-none`.
2. **LTR value inside an RTL field with an icon, suffix or action button** (codes, mobile numbers, dates): the input's paddings swap so the text never runs under the button — `[dir="rtl"] .hz-input-wrap--action|--icon|--suffix .hz-input--ltr`.

Changed files: `design-system/components/bundle.css`; READMEs and previews of TextField, TextAreaField, SelectField, Combobox, OtpField, MobileField, MoneyField, ReasonField, MessageComposer (+ previews of Field, JalaliDateField, NationalIdField, SearchField, SettingsPanel, DeliveryCodeCard); `01-color.md`, `03-layout.md`, `README.md`, `shells.md`, `zz-checklist.md` (focus rule wording + "Updates after the v1 handoff").

## v1.0 — 11 Mehr 1405

First handoff (see HANDOFF-FOR-CLAUDE-CODE.md).
