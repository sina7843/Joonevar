# IconButton ★

A square button that holds only an icon and always carries a Persian accessible name.

Use it for compact, well-known actions: open the menu (`list`), close (`x`), copy an identifier (`copy`), notifications (`bell`), search, more actions (`dots-three`), carousel previous/next. If the action is not obvious from the glyph alone, use a Button with a label instead.

## Anatomy

1. Container — square, `radius-md`, transparent (or white + `border-control` in outline).
2. Icon — `md` 24 in md/lg, `sm` 20 in sm, colour `icon-strong`.
3. Notification dot (optional) — 10px `logo-mark` circle with a 2px `bg-chrome` ring, at block-start / inline-end.

## CSS API

| Class | Effect |
|---|---|
| `.hz-icon-btn` | 44 × 44 (`control-md`), transparent |
| `.hz-icon-btn--sm` · `--lg` | 36 · 48 |
| `.hz-icon-btn--outline` | `action-secondary` fill + `border-control` |
| `.hz-icon-btn__dot` | Notification dot (`aria-hidden`) |
| `:disabled` | `text-disabled` icon |

```html
<button class="hz-icon-btn" type="button" aria-label="اعلان‌ها، ۲ اعلان خوانده‌نشده">
  <svg class="hz-icon hz-icon--md" viewBox="0 0 256 256" aria-hidden="true">…bell…</svg>
  <span class="hz-icon-btn__dot" aria-hidden="true"></span>
</button>
```

## Tokens

`icon-strong` · `action-secondary` · `action-secondary-hover` · `border-control` · `logo-mark` (dot) · `bg-chrome` (dot ring) · `text-disabled` · `focus-ring` · `radius-md` · `control-sm|md|lg`.

## Variants & sizes

sm 36 (OpsShell desktop toolbars and table rows only) · md 44 (default, touch minimum) · lg 48 (mobile top bar if needed, carousel). Plain vs outline (outline when it sits on content, e.g. next to an identifier or on a card; plain in chrome bars). With/without notification dot.

## States

default · hover (pointer only: `action-secondary-hover` fill) · focus-visible (`focus-ring` 2px + 2px offset) · pressed (as hover; toggles expose `aria-pressed` or `aria-expanded`) · disabled (`disabled`, icon `text-disabled`) · loading — swap the icon for `.hz-spinner` and set `aria-busy` (e.g. copy in progress) · success feedback for copy — a polite live region «کپی شد», icon may switch to `check` for 2s · long Persian text — n/a visually; the `aria-label` may be long and that is fine.

## Mobile ↔ desktop

<768 and on any coarse pointer: never below 44 × 44 — use md or lg; `sm` is for desktop OpsShell (fine pointer) only. Known gap: bundle.css has no coarse-pointer guard for `.hz-icon-btn--sm` (Identifier has one); until added, do not render `sm` in shells that can be touched. ≥1024: md in chrome, sm allowed in dense ops tables.

## RTL & LTR

Dot sits at inline-end (top-left in RTL). Directional glyphs (carousel next/prev, back, sidebar toggle) use the LTR glyph + `hz-icon--mirror`; `x`, `bell`, `copy`, `list` never mirror.

## Accessibility

- `aria-label` in Persian is mandatory: «منو»، «بستن»، «کپی شناسه»، «جستجو»، «کنش‌های بیشتر».
- Put state in the name, not only in the dot: «اعلان‌ها، ۲ اعلان خوانده‌نشده».
- Menu trigger: `aria-expanded` + `aria-controls`; toggles: `aria-pressed`.
- Show a tooltip with the same label on hover/focus for pointer users (optional, never the only label).
- Icon svg is `aria-hidden`.

## Data

Unread count from notifications (`read: false` for the account) feeds the dot and the label; zero → no dot and label «اعلان‌ها». Copy value comes from the identifier (`HZ-…`, `PET-…`), copied as Latin.

## Code mapping

New component `IconButton` (★). Proposed props: `icon: IconName`, `label: string` (required, becomes `aria-label`), `size?: 'sm' | 'md' | 'lg'`, `variant?: 'plain' | 'outline'`, `dot?: boolean`, `type?: 'button' | 'submit'`, `disabled?`, `loading?`, plus pass-through `aria-expanded` / `aria-pressed`.

## Do / Don't

- Do always give a Persian `aria-label`; Don't rely on `title` or the glyph.
- Do use `md` (44) on anything touchable; Don't put `sm` in the mobile top bar.
- Don't use an IconButton for the main action of a screen.
- Don't colour the icon orange for emphasis; the dot is the only orange.
