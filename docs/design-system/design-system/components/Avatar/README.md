# Avatar

A round picture of a person, store or practice. It shows an image, a person's initials, or, when neither applies, the Hamzist symbol on sand (the RecordImage empty state).

Use it next to a name: the sidebar user box, the top bar account button, conversation rows, review authors, operator assignees, vet / store / centre headers. Don't use it for animals in records (AnimalCard uses RecordImage thumbs) or as a decorative illustration.

## Anatomy

1. **Frame** `.hz-avatar`: a circle (`radius-full`) that clips its content.
2. **Content**, one of:
   - **image** `<img>` with `object-fit: cover` (logos: `contain` inside `--logo`)
   - **initials** in `text-brand` ExtraBold on `bg-brand-subtle`
   - **symbol** (`--empty`) at 40% opacity on `bg-media-empty`
3. Optional **Person row** `.hz-person`: avatar + `__name` (Bold, ellipsis) + `__sub` (role, city, date, mobile).

## CSS API

`tools/css-additions/Avatar.css`: `.hz-avatar`, `--xs --sm --lg --xl` (default md), `--empty`, `--logo`, `.hz-avatar.hz-skeleton`; `.hz-person`, `__text`, `__name`, `__sub`. Bundle `.hz-avatar-initials` (40) and `.hz-media--avatar` (56) stay as aliases used by P0 shells and VetCard. New markup uses `.hz-avatar`.

```html
<span class="hz-avatar" role="img" aria-label="حمید نوروزی">ح ن</span>
<span class="hz-avatar hz-avatar--lg"><img src="…" alt="تصویر پروفایل رضا کریمی"></span>
<span class="hz-avatar hz-avatar--lg hz-avatar--logo hz-avatar--empty"><img src="/symbol.svg" alt=""></span>
<div class="hz-person"><span class="hz-avatar hz-avatar--sm" role="img" aria-label="سارا ا.">س</span>
  <span class="hz-person__text"><span class="hz-person__name">سارا ا.</span><span class="hz-person__sub">۳ مهر ۱۴۰۵</span></span></div>
```

## Tokens

`bg-brand-subtle` + `text-brand` (initials) · `bg-media-empty` (symbol) · `bg-surface` + `border-default` (logo ring) · `bg-disabled` (skeleton) · `text-primary` / `text-secondary` (person row) · `focus-ring` (when the avatar is a button) · `radius-full`.

## Variants & sizes

| Size | px | Initials | Where |
|---|---|---|---|
| `xs` | 24 | 10 | table cell (assignee), inline mention |
| `sm` | 32 | 12 | top bar account, review author |
| md (default) | 40 | 15 | sidebar user, conversation list, AccountMenu head |
| `lg` | 56 | 19 | VetCard, store header, centre in lists |
| `xl` | 80 | 26 | account / vet / store profile header |

Kinds: **person** (image → initials → symbol), **directory profile** (vet, store, centre: image or logo → symbol, never initials, matching VetCard P0), **logo** (`--logo`: contained, never cropped, white with a hairline).

## States

- **default**: image or initials.
- **image loading**: the frame shows its fallback (initials or symbol) until the image decodes, so there is no empty circle.
- **image error**: falls back to initials or symbol silently, never a broken-image icon.
- **loading** (data not yet known): `.hz-avatar.hz-skeleton` circle.
- **empty**: no image and no name (a new user known only by mobile) shows the symbol.
- **focus-visible**: only when wrapped in a button or link (account menu). The ring follows the circle.
- **hover**: none on the avatar itself. The surrounding control handles it.
- **disabled**: n/a. A deactivated account keeps its avatar, and its status is shown as text.
- **long Persian text**: the avatar never shrinks (`flex-shrink: 0`). The name beside it ends with «…» on one line, and the full name is in `title` and the accessible text («مرکز جامع درمانی، جراحی و تصویربرداری حیوانات خانگی و پرندگان زینتی دکتر صالحی»).

## Initials rule

The first letter of `firstName` + the first letter of `lastName`, separated by a no-break space (U+00A0) so the two Persian letters don't read as a word («سارا احمدی» → «س ا»). With only one name, use one letter. With an abbreviated name («سارا ا.»), use one letter. Latin names use uppercase letters. Never derive initials from a mobile number or from «دکتر».

## Mobile ↔ desktop

The size is chosen by context, not by breakpoint. A tappable avatar (account button) sits inside a 44px target even at `sm`/32 (`.hz-topbar__account` is 44 high).

## RTL & LTR

The avatar is at the start of a person row and the text after it. Initials are written in the name's own script, with no mirroring. A mobile number in the secondary line is `<bdi class="hz-id" dir="ltr">`.

## Accessibility

- An image avatar uses `alt` from data (`avatar.altFa`: «تصویر پروفایل سارا احمدی»). Inside a person row that already shows the name, use `alt=""` to avoid repeating it.
- An initials avatar on its own: `role="img"` + `aria-label` with the full name. Inside a person row: `aria-hidden="true"`.
- The symbol fallback is always `alt=""`.
- Colour is never the only identity, because the name is always nearby.

## Data

`people[].avatar` (`slot`, `altFa`), `firstName`, `lastName`, `displayName`. Vets: `image` (portrait placeholder slot). Sellers: `logo` (1:1). Centres: `image` (16:9, so a cropped circle is a poor fit; prefer a logo field). Missing image means a fallback, never a stock photo.

## Code mapping

★ New `src/ui/avatar.tsx`: `Avatar({ src?, alt?, name?, kind?: 'person' | 'profile' | 'logo', size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl', decorative?: boolean })` + `Person({ avatar, name, sub? })`. The shell's `.hz-avatar-initials` and VetCard's `.hz-media--avatar` migrate to it.

## Do / Don't

- Do let the avatar sit beside the name. It identifies, the name names.
- Do use the symbol fallback for vets and centres. Initials of «دکتر نسرین فرهادی» are noise.
- Don't crop logos into the circle (`--logo` contains them).
- Don't put status dots on avatars. Status is a StatusBadge with text.
