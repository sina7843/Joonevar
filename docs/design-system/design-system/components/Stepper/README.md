# Stepper

★ New. A step indicator for multi-step forms that save every step — horizontal, vertical, or a compact «مرحله ۳ از ۶» progress bar on mobile.

Built for `/animals/new` (6 steps, resumes at `draftStep`), and reused by `/requests/new`, `/mating/permits/new`, `/registration/new`, KYC, kennel and listing forms (pattern P7). Today the 6-step form has **no step indicator at all**. Don't use it for tabs (non-linear sections) or for a status history (`Timeline`).

## Anatomy

1. Ordered list `<ol>` of steps
2. Dot: number (upcoming/current) or `check` (done)
3. Connector line between dots (brand colour once the earlier step is done)
4. Label; optional sub-line with the saved summary («گربه · پرشین (اگزوتیک موکوتاه)»)
5. Compact form: «مرحله ۳ از ۶» + current step name + track/fill + «بعدی: …»

Steps for `/animals/new` (proposed names — the pack gives the count and fields, not the labels; confirm against `app/animals/new`):
**۱ گونه و نژاد · ۲ نام و جنس · ۳ تولد و رنگ · ۴ میکروچیپ · ۵ تصویر · ۶ بازبینی و ارسال** — derived from the animal fields in *07-content-model* (name, species/breed, sex, birth date, colour, photo, microchip).

## CSS API

| Class | Role |
|---|---|
| `.hz-stepper` | horizontal list (equal columns) |
| `.hz-stepper--vertical` | vertical list (side column) |
| `.hz-step` · `--done` · `--current` | step and its state |
| `.hz-step__dot` · `__label` · `__sub` | parts |
| `.hz-step__link` ★ | *css-additions/Stepper.css* — done steps link back |
| `.hz-progress` · `__label` · `__track` · `__fill` · `__next` ★ | compact mobile form |

```html
<nav aria-label="مرحله‌های ثبت حیوان"><ol class="hz-stepper">
  <li class="hz-step hz-step--done"><span class="hz-step__dot"><svg …check…></svg></span><a class="hz-step__link" href="?step=1">گونه و نژاد<span class="hz-visually-hidden"> (انجام‌شده)</span></a></li>
  <li class="hz-step hz-step--current" aria-current="step"><span class="hz-step__dot">۳</span><span>تولد و رنگ</span></li>
  <li class="hz-step"><span class="hz-step__dot">۴</span><span>میکروچیپ</span></li>
</ol></nav>
```

## Tokens

`border-control` / `border-default` (upcoming dot, line), `action-primary` + `text-on-action` (done dot), `border-brand` (done line, progress fill), `bg-brand-subtle` (current halo), `text-brand`, `text-secondary`, `bg-disabled` (track), `radius-full`.

## Variants & sizes

- **Horizontal** — tablet and desktop, above the form; 6 steps fit from 640px.
- **Vertical** — desktop side column (≥1024) with saved summaries under done steps; pairs with the form summary.
- **Compact** — mobile (<768): «مرحله ۳ از ۶» + step name + bar + «بعدی: میکروچیپ». Fill = current ÷ total.

## States

- Step: **done** (link back, check) · **current** (`aria-current="step"`, halo, Bold) · **upcoming** (not a link).
- Link hover (pointer): `text-brand` + underline; focus-visible: `focus-ring` (shown statically on «نام و جنس»).
- **Resume:** when `draftStep` > 1 the page opens on that step; show a neutral `Alert` once («پیش‌نویس … ذخیره شده است»).
- **Edge — first step, no name:** «ثبت حیوان · بدون نام» + «مرحله ۱ از ۶».
- **Long text:** long breed/name sub-lines wrap under the label in vertical; horizontal labels wrap to two lines, centred.
- Loading/disabled: the whole stepper is static while a step saves; the save button carries the loading state.

## Mobile ↔ desktop

<768: compact only, form below, sticky `ActionRow` («ذخیره و ادامه» primary at start, «مرحله قبل» secondary). 768–1023: horizontal above the form. ≥1024: horizontal or vertical beside the form with the summary column. Done-step links are ≥44px tall on coarse pointers through their row.

## RTL & LTR

Step 1 sits at the inline start (right in RTL); connectors use `inset-inline-*`, so they flow right-to-left now and left-to-right in LTR with no change. Fill grows from inline start. `check` is never mirrored; «مرحله قبل/بعد» buttons use `arrow-left`/`arrow-right` + `hz-icon--mirror`.

## Accessibility

- `<nav aria-label>` + `<ol>`; current step `aria-current="step"`; done steps have visually-hidden «(انجام‌شده)».
- Compact bar: `role="progressbar"` with `aria-valuemin=1`, `aria-valuemax=6`, `aria-valuenow`, `aria-valuetext="مرحله ۳ از ۶: تولد و رنگ"`.
- Moving between steps moves focus to the step heading in the form, not to the stepper.

## Data

`draftStep`, `draftStepsTotal` (6) from the animal draft (`animals.json`); step names from the form definition; sub-lines from saved fields (`speciesFa · breedFa`, `name · sexFa`). Missing name → «بدون نام».

## Code mapping

★ New — proposed `src/ui/stepper.tsx`: `Stepper({ steps: {key, label, summary?}[], current: number, orientation?: 'horizontal'|'vertical', compact?: boolean, hrefFor?: (i) => string })`. Steps after `current` are never links (the flow order stays as in code).

## Do / Don't

- Do let users jump back to any saved step; never forward past the current one.
- Do keep the step count and order exactly as the code's flow — design only changes the presentation.
- Don't use the stepper as navigation for non-linear sections.
- Don't show both the horizontal stepper and the compact bar at the same width.
