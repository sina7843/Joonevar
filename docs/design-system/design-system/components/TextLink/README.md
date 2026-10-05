# TextLink ★

An orange Bold link, either inline in running text (underlined) or standalone with a directional arrow («مشاهده همه ←»).

Use inline links inside sentences (help text, alerts, article body) and the standalone form for low-emphasis navigation: the SectionHeader end link, «بازگشت به پرونده», «استعلام اصالت سند» in a card footer. For a main navigation step use ButtonLink; for an action use Button.

## Anatomy

1. Label — `text-brand`, Bold.
2. Underline — always on inline; on standalone only on hover.
3. Arrow (standalone, optional) — `xs` 16, `arrow-right` mirrored at the end (forward) or `arrow-left` mirrored at the start (back); `arrow-square-out` mirrored at the end for external.

## CSS API

| Class | Effect |
|---|---|
| `.hz-link` | `text-brand`, 700, underline, offset 3px |
| `.hz-link--standalone` | inline-flex, gap 6, min-height 44, 14/22, no underline; underline on hover |

```html
<p>مراحل را در <a class="hz-link" href="/guides/registration-sheet">راهنمای برگه ثبتی</a> بخوانید.</p>
<a class="hz-link hz-link--standalone" href="/articles">
  مشاهده همه<span class="hz-visually-hidden"> مطالب مجله</span>
  <svg class="hz-icon hz-icon--xs hz-icon--mirror" viewBox="0 0 256 256" aria-hidden="true">…arrow-right…</svg>
</a>
```

## Tokens

`text-brand` (≥5.89:1 on page, surface, chrome, subtle and brand-subtle grounds) · `focus-ring` · `icon-xs`.

## Variants & sizes

Inline (inherits the surrounding font size) · standalone forward («مشاهده همه»، «مشاهده صف») · standalone back («بازگشت به پرونده») · external («استعلام اصالت سند» opening the verification page in a new tab).

## States

default · hover (pointer only: standalone gains underline; inline already underlined) · focus-visible (`focus-ring` 2px + 2px offset) · active — browser default · visited — same colour (records are revisited constantly; purple would read as an error) · disabled — not a link state: render plain text in `text-secondary` and say why · long Persian text — inline links wrap with the sentence and keep the underline on every line; standalone labels stay short (2–3 words).

## Mobile ↔ desktop

Standalone links are 44px tall at every breakpoint, so they are valid touch targets. Inline links inside body text are exempt from the 44px rule (WCAG 2.5.8 inline exception) but must not sit closer than 8px to another link on their own line.

## RTL & LTR

Forward = `arrow-right` + `hz-icon--mirror` at inline-end (← in RTL). Back = `arrow-left` + mirror at inline-start (→ in RTL). External = `arrow-square-out` + mirror. A Latin code inside a link label goes in `<bdi dir="ltr">`.

## Accessibility

- Links navigate; never attach an action handler to a TextLink.
- The name must stand alone in a links list: add the context in `.hz-visually-hidden` («مشاهده همه اطلاعیه‌ها»).
- External links announce «(در زبانه تازه)» and use `rel="noopener"`.
- Colour is not the only cue: inline links are underlined; standalone links sit in a predictable slot with an arrow.

## Data

`href` from the route of the target (section list, record, article slug). Label is copy, except article or record titles used as inline links, which come from data and may be long.

## Code mapping

New component `TextLink` (★; the code uses raw `<a>`/`Link` today). Proposed props: `href: string`, `variant?: 'inline' | 'standalone'`, `arrow?: 'forward' | 'back' | 'external'`, `srContext?: string` (visually hidden suffix), `external?: boolean`.

## Do / Don't

- Do use «مشاهده همه ←» at the end of a SectionHeader; Don't use a Button there.
- Do keep inline links underlined; Don't rely on orange alone.
- Don't write «اینجا کلیک کنید»; link the meaningful words.
- Don't use the orange of `logo-mark`/`accent-bar` for link text — only `text-brand`.
