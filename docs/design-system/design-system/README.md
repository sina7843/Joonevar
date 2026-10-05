Hamzist (همزیست) is the official registry for dogs and cats: identity, registration sheet, pedigree, mating permit, and the public magazine, directory, market and shop around them. The interface must feel **formal and trustworthy, a little editorial**: an official record that is still warm and readable. Everything in this system serves Persian, right-to-left, light theme today, and is built so English/LTR and a dark theme can arrive later without a redesign.

## Non-negotiables

1. **Code is the first source.** Features, page structure, roles, data and copy come from the `App` repo. Where this system and the code disagree on content, the code wins.
2. **Fixed:** the logo, the **27-colour palette** (see *Color*), and the typeface **IRANSansX**. A new colour needs the product owner's approval and is listed separately.
3. **Semantic tokens only.** A component spec or preview names `bg-surface`, `text-brand`, `action-primary`… never a hex and never a primitive (`orange-600`). This is what makes dark mode a values change.
4. **Logical direction only.** Spacing and alignment are *start/end* (`padding-inline-start`, `ms-*`, `text-start`), never left/right. Directional icons are mirrored by `dir` (see *Iconography*).
5. **Contrast is computed:** text ≥ 4.5:1, UI marks ≥ 3:1. Every pair is in the *Color* table.
6. **The three oranges:** `orange-500` never text; `orange-600` only under white text in the primary button; `orange-700` for every orange text.
7. **Numbers:** Persian digits for text, money, dates and counts; Latin only for identifiers and codes, isolated in `<bdi dir="ltr">`. Money always in **تومان**, never Rial; a value not set is **«تعیین‌نشده»**, never ۰. Dates always Jalali. See *Content*.
8. **Every value comes from data.** No name, price, count or status is assumed fixed; long text, empty values and missing images are designed for every component.
9. **Accessible by default:** touch targets ≥ 44px on mobile, hover only on pointer devices, a visible focus ring everywhere (`focus-ring`, 2px + 2px offset; on text fields the field's own border turns orange at 2px instead), `prefers-reduced-motion` turns motion off.
10. **Admins and operators are first-class.** 37% of pages are OpsShell. Dense tables, queues and decision desks are designed with the same care as the magazine.

## Visual direction — A «دفتر رسمی», approved

An official register: content sits in **white bordered boxes** with Bold headings; soft corners keep it from feeling stiff.

- **Ground:** `bg-page` (white) everywhere. **Chrome** — header, footer, sidebars, top bars, tab bar, sticky bars — is `bg-chrome` (cream `#FFFCF8`) with a `border-default` edge. Cards, panels and secondary buttons are **white** (`bg-surface`, `action-secondary`) with a 1px outline. **Landing pages only** (SiteShell home and section landings) warm up with cream feature cards (`bg-feature`) and one full-width cream band (`bg-band`, approved for «تازه‌ها»); dashboards, records and ops screens never do.
- **Structure with lines, not shadows.** `border-default` (#DED5CA) outlines every card, panel and table. Shadows exist only for layers floating above the page (`shadow-overlay-*`).
- **Corners (approved: B's radii on A):** `radius-md` 12 for controls, `radius-xl` 20 for cards and panels, `radius-full` for tags, badges and avatars, `radius-2xl` 28 for the CTA box.
- **Headings Bold 700**, generous line height; secondary text in `text-secondary`.
- **Signature — the section header:** a 4px `accent-bar` at the start, a Bold title, and «مشاهده همه ←» in `text-brand` at the end. Used in all three shells (smaller in OpsShell).
- **Orange is emphasis, not area:** at most one primary button per view; the accent bar; focus; links.
- **Density by shell:** SiteShell editorial (body 16/28, 64px between sections); PublicShell comfortable (16/28, 24px gaps); OpsShell dense (14/24 body, 36–40px table rows, 16px gaps).
- **The test:** a screenshot of the KYC queue next to the home page must obviously be the same product — same type, same white-and-cream, same border, same accent bar, same status badges, same corners.

## Content fundamentals

- **Voice:** precise, frank, unceremonious. When something does not work, say exactly why. Do not soften operator messages. Example from the code: «احراز هویت شما تأیید شده است. برای ثبت حیوان، عضویت انجمن لازم نیست و نشانی سکونت هم اجباری نیست.»
- **Second person plural** («شما»), no exclamation marks, no emoji.
- **Locked service = three parts:** what is locked · why · what unlocks it. («ثبت کنل» · «فقط حساب پرورش‌دهنده می‌تواند کنل ثبت کند.» · «فعال‌سازی حساب پرورش‌دهنده»)
- **«اقدام بعدی با: …»** on every case — it is always clear whose move it is.
- **Action order:** start = primary, end = secondary.
- Real Persian sample text from `sample-content/` in every preview — never lorem ipsum.

## Using this system

- Read *Color* before choosing any colour; *Typography* before setting text; *Layout* for grid, breakpoints, spacing, radius and elevation; *Iconography*, *Imagery*, *Motion*, *Content* and the *Status dictionary* before building anything that shows them.
- Fonts: the 11 IRANSansX woff2 files in `fonts/` (licensed for claude.ai use, 10 Mehr 1405). Stack `"IRANSansX", Tahoma, system-ui, sans-serif`. Never use the FaNum build — it turns Latin identifiers into Persian digits.
- Logo: `assets/Logos/` — the horizontal Persian lockup (wordmark set in IRANSansX Black, approved at checkpoint 1) and the symbol. Never redraw, recolour, stretch or shadow them.
- Components are CSS-first: load `tokens` (CSS variables), then `components/bundle.css`; markup and classes for each component are in `components/<Name>/README.md` and its preview. `components/bundle.js` assigns `window.Hamzist` — formatting helpers for the content rules (`toman`, `jalali`, `faDigits`, `normalize`, `mobile`, `nationalId`, `idHtml`; typed in `components/index.d.ts`).
- Build screens from *Shells* (the three shells at every breakpoint) and the twelve *Patterns* (P01–P12); the 18 key screens on the «همزیست — صفحه‌های کلیدی و برند» canvas show them applied. *Brand* covers lockups, the app icon and favicons; *Acceptance* records checklist 09 and the open decisions.
- Photos: `assets/Imagery/` (one approved style, Persian alt text for each); never ship an image slot empty — use the RecordImage missing-image state.
