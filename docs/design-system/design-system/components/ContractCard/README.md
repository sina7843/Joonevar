# ContractCard

The mating-finder contract between the male's and the female's owners, with each party's confirmation status and a one-time-code confirmation for the viewer.

Use on `/account/mating-finder/requests/[id]` and as a card in that request's thread once the request reaches `CONTRACT_DRAFTING`. P2. Not for the mating permit itself (DocumentCard / A4DocumentTemplate) or for marketplace offers (OfferCard).

## Anatomy

Card → head: `handshake` icon + «قرارداد جفت‌گیری رعد و لونا», sub-line «سهم توله، محل صاحب ماده» + StatusBadge → two party tiles (role «صاحب نر» / «صاحب ماده (شما)», name, animal + `PET-` id, confirmation line with `check` or `clock`) → key terms (KeyValueList: توافق مالی، محل جفت‌گیری) → confirm box (OtpField: «تأیید با کد یک‌بارمصرف», SMS sentence with the mobile in `<bdi>`, 6 boxes, resend countdown, primary «تأیید قرارداد») → ActionOwner + link «متن کامل قرارداد».

## CSS API

| Class | Use |
|---|---|
| `.hz-contract` · `__head` · `__title` · `__sub` | Card (16px, 20px ≥1024) |
| `__parties` | 1 column <768, 2 columns ≥768 |
| `.hz-party` · `__role` · `__name` · `__animal` · `__state` | Party tile; `--you` = `bg-subtle`; `--confirmed` = state line in `status-success-text` |
| `__confirm` · `__confirm-title` | OTP block (reuses `.hz-otp`, `.hz-otp-field__resend`) |

## Tokens

`bg-surface` · `border-default` · `border-subtle` · `bg-subtle` (you) · `text-primary` · `text-secondary` · `icon-strong` / `icon-default` · `status-success-text` (confirmed) · `status-info-*` / `status-success-*` badges · OtpField, KeyValueList, ActionOwner tokens.

## Variants & sizes

| Contract state | Badge (dictionary key) | ActionOwner |
|---|---|---|
| Drafting, you have not confirmed | `CONTRACT_DRAFTING` «ورود به قرارداد» | «شما» + confirm box |
| You confirmed, other party pending | `AWAITING_COUNTERPARTY` «در انتظار تأیید طرف مقابل» | «صاحب نر» / «صاحب ماده» |
| Both confirmed | `CONFIRMED` «وجود توافق تأیید شد» | permit line `MP-…` when issued |
| Rejected / cancelled | `REJECTED` «ردشده» / `CANCELLED` «لغوشده» | — |

Per-party confirmation is a fact line, not a status badge: «تأیید کرد، ۹ مهر ۱۴۰۵» or «هنوز تأیید نکرده».

## States

Default · focus-visible on OTP boxes and links · code typing · code error (OtpField error text) · verifying (boxes disabled, spinner) · code expired («اعتبار این کد تمام شده است. کد تازه بگیرید.») · resend countdown / resend button · confirmed · **long Persian text**: party names wrap inside the tile (edge case: a 3-line centre name), terms wrap in KeyValueList.

## Mobile ↔ desktop

<768: parties stacked, confirm box full width, OtpField 328px fits 360px screens. ≥768: parties side by side. ≥1024: the card sits in the side column of the request page (P6) or in the thread.

## RTL & LTR

Male owner tile at the start, female at the end (order fixed by role, not by viewer). OTP boxes LTR; mobile number and IDs in `<bdi dir="ltr">`. `handshake`, `check`, `clock` are not mirrored.

## Accessibility

`<article aria-labelledby>` on the title. Party tiles are plain text; «(شما)» marks the viewer. OTP follows OtpField (group label, per-box labels, `role="alert"` errors, countdown polite and throttled). After confirming, focus moves to the party state line and the new badge is announced.

## Data

`finder.json › contract.status` (`DRAFTING` → `CONTRACT_DRAFTING`), `request.financialFa` («سهم توله»), `placeFa` («محل صاحب ماده»), parties from the request (owner names, animals `name` + `petId`), per-party `confirmedAt`, the viewer's mobile for the SMS, contract template version from `/admin/mating-finder`, permit `permitNo` once issued.

## Code mapping

★ New `ContractCard`: `status`, `terms: { financial, place }`, `parties: { role: 'SIRE_OWNER' | 'DAM_OWNER', name, animalName, petId, confirmedAt, isViewer }[]`, `otp` (OtpField props: `onComplete`, `error`, `busy`, `resendAt`, `onResend`, `phone`), `permitNo`, `contractHref`.

## Do / Don't

- Do show both parties' state at all times, so it is obvious who is holding the contract.
- Do link the full contract text before the code field.
- Don't confirm on button press alone — the one-time code is the signature.
- Don't use the success colour for the whole card; only the confirmed lines and final badge.
