# P07 — Multi-step form · فرم چندمرحله‌ای

## Purpose

A long task broken into short steps, where **every step is saved on the server** before moving on. Examples are registering an animal (6 steps), requesting a service, applying for a mating permit, registration and declaration forms, KYC, kennel and listing forms. People do this on a phone, in a clinic or between other jobs, so they must be able to leave at any step and come back to the same place (`draftStep`). The pattern makes progress, what is already saved and what comes next obvious. It ends with a review step and one clear submit, which often hands over to payment (P08).

**Don't use it** for a single short form that fits on one screen (profile, contact, settings rows; see P11), for operator decisions (P10), or for sections of a record you can visit in any order (`Tabs` in P06). Sign-in (K8: `MobileField` → `OtpField`) is a two-screen flow, not P07.

## Anatomy (top to bottom)

1. **Shell:** `PublicShell`. On mobile the tab bar is hidden while a step is open, so there is only one bottom bar.
2. **`PageHeader`:** «بازگشت» / `Breadcrumbs` and `h1` «ثبت حیوان». For a draft, the title says «ثبت حیوان · بدون نام» until a name is saved.
3. **`Stepper`:**
   - compact on mobile: «مرحله ۲ از ۶» + step name + bar + «بعدی: تولد و رنگ»
   - horizontal on tablet
   - horizontal or vertical on desktop, with done steps linking back
4. **Resume notice:** a neutral `Alert`, shown once, when `draftStep` > 1: «پیش‌نویس ثبت حیوان در مرحله ۳ ذخیره شده است.»
5. **Step form** (`Card`): a step heading (`h2`, which receives focus) and `Field`-wrapped controls.
   - `RadioCard` for species, service or plan, with prices
   - `Combobox` for breed and city; `Radio` for sex
   - `JalaliDateField` (with the approximate variant «حدود»); `TextField`; `TextAreaField`
   - `MobileField`, `NationalIdField`, `MoneyField`, `LocationField`
   - `ImageUploader` (with the crop preview); `FileField` / `MultiFileUploader`
   - `Checkbox` consent on the last step
6. **Summary:** what is saved so far, as a `KeyValueList` plus the fee (`PriceDisplay` or «تعیین‌نشده»). On the last step this becomes the full review, with «ویرایش» links back to each step.
7. **Actions:** `StickyActionBar` (mobile) or an in-content `ActionRow`: «ذخیره و ادامه» (primary, start) · «مرحله قبل» (secondary). The last step's primary is «ارسال درخواست» or «پرداخت ۲۵۰٬۰۰۰ تومان».

## Layout

| | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Structure | one step per screen, compact Stepper, form card, summary collapsed into an `Accordion` «خلاصه» | horizontal Stepper above the form, form in `container-reading` 720 | Stepper (horizontal above, or vertical at the start) + form 7/12 + **summary column 5/12** at the end, inside `container-app` |
| Primary action | `StickyActionBar` (48px buttons, safe-area inset, `shadow-sticky`) with «مرحله ۲ از ۶، نام و جنس» | in-content `ActionRow` after the last field | in-content `ActionRow`; the summary column repeats the fee |
| Sticky | top bar + StickyActionBar; the tab bar is hidden | top bar | top bar; summary column sticky at `header-app` + `space-16` |
| Pickers / help | `Combobox` list and calendar full width; help in `BottomSheet` | popover / `Modal` | popover; long help in a `Drawer` from the end |
| Field rhythm | `space-16` between fields, `space-24` between groups, card padding `space-16` | same, padding `space-24` | same |

## States

- **Loading:** a Skeleton of the step card (label + field bars) and the Stepper at its real step count. Saving a step locks the form and puts the spinner in the primary button only (`aria-busy`). Never a full-page spinner.
- **Empty:** a new draft opens on step 1 with nothing selected. Optional fields are marked «(اختیاری)» and required ones are not starred twice.
- **Validation error:** field errors under each field via `Field`, an error summary `Alert` at the top of the step with links to the fields, and focus on the first invalid field. The bar stays.
- **Network error on save:** `Alert` «ذخیره نشد. اتصال را بررسی کنید و دوباره «ذخیره و ادامه» را بزنید.» Typed values are kept and the step does not advance.
- **Locked / permission:** a form the role cannot start (e.g. `/mating/permits/new` without the breeder role) shows `LockedServiceCard` instead of step 1. An incomplete account shows an `Alert` with «تکمیل حساب». A different account's draft gets the not-found state.
- **Unset fee:** the summary and bar show «تعیین‌نشده», the submit is disabled, and the note says «تا تعیین تعرفه، ارسال این درخواست ممکن نیست.» Never «۰ تومان».
- **Hard cases:** a long breed or name in the vertical Stepper sub-line wraps. A missing photo is allowed when the photo is optional, and the summary shows the `RecordImage` placeholder. An approximate date shows «حدود». A stale draft (changed on another device) shows a warning `Alert` with «بارگذاری دوباره».

## Content & data rules

- Every «ذخیره و ادامه» is a server save. The next visit resumes at `draftStep`. Done steps are links and upcoming ones are not.
- Step labels for `/animals/new` (proposed, confirm in code): گونه و نژاد · نام و جنس · تولد و رنگ · میکروچیپ · تصویر · بازبینی و ارسال.
- Inputs normalise digits (Persian or Latin typed, stored Latin) for `MobileField`, `NationalIdField`, microchip and `MoneyField`. Display stays Persian for numbers and Latin for ids.
- Money is entered in تومان with words under the field. Dates are picked in Jalali only.
- Every uploaded image requires Persian alt text (`imageAltFa`).
- Action order: primary at the start («ذخیره و ادامه»), «مرحله قبل» after it. «انصراف» is a TextLink that keeps the draft.

## Accessibility & keyboard

- The Stepper is `nav` + `ol` with `aria-current="step"`. The compact bar is `role="progressbar"` with `aria-valuetext="مرحله ۲ از ۶: نام و جنس"`.
- Moving to a step puts focus on the step heading, not the Stepper. On error, focus goes to the error summary, whose links jump to the fields.
- Each field has a label, hint and error wired through `Field` (`aria-describedby`, `aria-invalid`). Radio groups are `fieldset` + `legend`.
- The sticky bar never covers the focused field or the on-screen keyboard (`scroll-padding-block-end`).
- Enter in a single-line field submits the step. The Combobox supports type-ahead with «ی/ي» and «ک/ك» treated as equal.

## Pages that use it (about 12)

`/animals/new` (6 steps) · `/animals/[id]/edit` · `/animals/[id]/foreign-pedigree` · `/requests/new` + `/requests/new/review` · `/registration/new` · `/declaration/new` · `/mating/permits/new` (+ `/[id]/dates`, `/pregnancy`, `/birth`) · `/pedigree/issue` · `/litters/[id]/allocation` · `/account/kyc` · `/account/complete` · `/breeder/activate` · claim flows `/account/centres/claim/[slug]`, `/account/vet-profile/claim/[slug]`

**Key screen:** **K10** ثبت حیوان، مرحله ۲ از ۶ (`/animals/new`).

## Do / Don't

- **Do** save every step on the server and resume at the saved step.
- **Do** show the fee and what is already saved beside the form (desktop) or in the «خلاصه» accordion (mobile).
- **Do** end with a review step that links back to each step.
- **Don't** show the tab bar and a sticky action bar at the same time.
- **Don't** let a step advance on a failed save, or clear typed values on error.
- **Don't** offer payment when the fee is unset. Keep the path closed and say why.
