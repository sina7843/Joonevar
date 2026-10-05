# LockedServiceCard

A dashed, muted card for a service the user cannot use yet, always in three parts: what is locked · why · what unlocks it.

Use it in the dashboard «سرویس‌ها» section, on service landing pages and in `/account/*` wherever a service exists but a role, a prerequisite record or a configured fee is missing. Don't use it for permission errors on a page the user should not know exists (use `AccessDenied`, which never reveals the record), or for a service that is temporarily down (Alert).

## Anatomy

1. Title row: `lock-simple` icon + service name (what)
2. Reason sentence, the missing condition in **Bold** (why)
3. Unlock: a secondary `ButtonLink` to the flow that removes the lock, **or** a sentence when nothing the user can do unlocks it (what unlocks it)
4. Optional fee line (from fees) — «تعرفه: ۱۲۰٬۰۰۰ تومان برای هر توله», or «تعیین‌نشده»

## CSS API

| Class | Role |
|---|---|
| `.hz-locked` | card: `bg-subtle`, 1px **dashed** `border-default`, `radius-xl` |
| `.hz-locked__title` | icon + name, `status-neutral-text` |
| `.hz-locked__why` | reason; `<b>` lifts the missing condition to `text-primary` |
| `.hz-locked__unlock` | aligns the unlock button to the start |

```html
<article class="hz-locked" aria-labelledby="lk-kennel">
  <h3 class="hz-locked__title" id="lk-kennel"><svg class="hz-icon hz-icon--sm" …lock-simple…></svg>ثبت کنل</h3>
  <p class="hz-locked__why">فقط حساب <b>پرورش‌دهنده</b> می‌تواند کنل ثبت کند.</p>
  <a href="/breeder/activate" class="hz-btn hz-btn--secondary hz-btn--sm hz-locked__unlock">فعال‌سازی حساب پرورش‌دهنده</a>
</article>
```

## Tokens

`bg-subtle`, `border-default`, `status-neutral-text`, `text-secondary`, `text-primary`, `radius-xl`; unlock uses `action-secondary` / `border-control`.

## Variants & sizes

Three lock reasons, same component:
- **Role** — «ثبت کنل» · «فقط حساب پرورش‌دهنده می‌تواند کنل ثبت کند.» · «فعال‌سازی حساب پرورش‌دهنده».
- **Prerequisite record** — «کارت توله» · «کارت توله فقط برای زایمان ثبت‌شده صادر می‌شود.» · «ثبت زایمان»; or KYC needing correction → «اصلاح احراز هویت».
- **Fee not configured** — «آگهی ویژه در بازار» · «تعرفه این خدمت تعیین‌نشده است و پرداختش باز نیست.» · «پس از اعلام تعرفه فعال می‌شود.» (no button: the payment path stays closed; 26 fees ship `null`).
One size; fills its grid cell like `ServiceCard`.

## States

- **Default**; the card itself is not interactive — only the unlock link is (hover `action-secondary-hover`, focus-visible `focus-ring`).
- **No unlock action:** sentence in `text-secondary` instead of a button.
- **Long text:** the KYC-correction reason (three lines) wraps; the button stays below.
- **Loading:** `Skeleton` card of the same height; **error:** the services section shows `NetworkErrorState`.

## Mobile ↔ desktop

<768: one column, full width, unlock button may be `--block` on coarse pointers (44px). 768–1023: two columns. ≥1024: three columns next to open `ServiceCard`s. Locked cards sort **after** open services.

## RTL & LTR

Icon at inline start; unlock aligned to start (`align-self: flex-start`). `lock-simple` is never mirrored. No physical properties.

## Accessibility

- `<article aria-labelledby>` with a real heading level matching the section.
- Don't use `aria-disabled` on the card — it is information, not a disabled control. Never render a disabled «ثبت کنل» button instead.
- Unlock link text must make sense alone («فعال‌سازی حساب پرورش‌دهنده», not «اینجا»).

## Data

- Service list and lock rule from the code's service registry (roles: `roles.json`; fees: `fees.json` keys such as `fee.puppy_card_toman`, `fee.kennel_registration_toman`).
- `why` text from the code's lock reason; `unlock` = route + label (`/breeder/activate`).
- Fee `null` → «تعیین‌نشده», never «۰ تومان», and no payment action.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/ui/card.tsx`: `LockedServiceCard({ serviceLabel, lock: LockDetail, icon? })` with `LockDetail = { reason, nextPrerequisite, cta: { label, href } }` (`src/domain/errors.ts`) — already what · why · what unlocks it. Keep; map title = `serviceLabel`, reason = `lock.reason`, unlock = `lock.cta`; add `fee?`.


`src/ui/card.tsx` — `LockedServiceCard`. Proposed/kept props: `title`, `reason` (ReactNode, allows `<b>`), `unlockHref?`, `unlockLabel?`, `unlockNote?` (when no action), `fee?: number | null`.

## Do / Don't

- Do always give all three parts; a lock without a reason is a bug.
- Do say exactly what is missing — role, record or fee — in one sentence.
- Don't offer «صدور شجره‌نامه» for an animal that already has a pedigree or an open pedigree request; that is not a lock, it is done — show the document or the request instead (see *P06*).
- Don't hide locked services; showing them is how users learn what the breeder account offers.
- Don't use orange or a primary button on a locked card; the page's primary action lives elsewhere.
