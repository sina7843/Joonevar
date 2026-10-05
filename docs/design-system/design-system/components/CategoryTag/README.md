# CategoryTag

A small pill that names the kind of a piece of content — «خبر · آموزش · اطلاعیه» — on top of its image or inline beside its title; a neutral variant names topics.

Use it in the magazine (hero, featured, cards, lists), on club posts and on the content admin list. It is not a status (use StatusBadge — tags have no tone and never say who must act), not a filter (use Chip) and not a count.

## Anatomy

1. Pill `.hz-tag` — 24px high, 10px inline padding, `radius-full`, 12/20 Bold.
2. Label — the kind in one word (`kindFa`) or a topic.
3. Placement modifier: on media (absolute, top-start corner of a `.hz-media`) or inline (before the title, or in the kicker line with date/read time).

## CSS API

| Class | Purpose |
|---|---|
| `.hz-tag` | Default: `bg-brand-subtle` ground, `text-brand` text — the content kind |
| `.hz-tag--on-media` | Absolute at 12px from the top and the start inside `.hz-media` |
| `.hz-tag--neutral` | `bg-subtle` + `text-secondary` — topics and article tags («میکروچیپ», «ثبت حیوان») |
| `.hz-tag--inline` ★ | Inside a heading, before the title text; aligned to the first line |
| `.hz-tag-list` ★ | Wrapping list of neutral tags |
| `a.hz-tag` ★ | Linked tag: no underline, underline on hover (pointer only) |

★ in `tools/css-additions/CategoryTag.css`.

```html
<div class="hz-media hz-media--16x9"><img src="…" alt="…"><span class="hz-tag hz-tag--on-media">خبر</span></div>
<h3 class="hz-h4"><span class="hz-tag hz-tag--inline">اطلاعیه</span>تمدید مهلت ثبت کنل تا پایان آبان</h3>
<ul class="hz-tag-list"><li><a class="hz-tag hz-tag--neutral" href="/magazine?tag=microchip">میکروچیپ</a></li></ul>
```

## Tokens

`bg-brand-subtle` + `text-brand` (default) · `bg-subtle` + `text-secondary` (neutral) · `radius-full` · `focus-ring`.

## Variants & sizes

- **Kind** (default, brand): exactly the four kinds from `content.json` — «آموزش» (ARTICLE), «خبر» (NEWS), «اطلاعیه» (ANNOUNCEMENT), «نوشته کلاب» (CLUB_POST). One kind tag per item.
- **Topic** (neutral): the item's `categoryFa` and `tags[]`; any number, in a `hz-tag-list`.
- **On media** / **inline** / **kicker line** (tag + date + read time, above the title in lists without images).
- One size (24px). It is not a touch target unless linked; a linked tag in a list gets its 44px target from the row (on coarse pointers keep ≥8px between linked tags).

## States

- **default** · **hover (pointer only)** — underline when linked · **focus-visible** — `focus-ring` 2px + 2px offset · **active** — none.
- **disabled / loading / error** — not applicable; while the card loads the tag is part of the media skeleton.
- **empty** — no kind → no tag (never an empty pill); no topics → no list.
- **long Persian text** — the tag never wraps or shrinks (`nowrap`); a long title continues after it and wraps under it (edge case: the 110-character announcement title).

## Mobile ↔ desktop

Identical at every width. On media the 12px offset stays; on very small media (≤120px wide horizontal cards) move the tag to the kicker line instead of the image.

## RTL & LTR

On-media position is `inset-inline-start`, so the tag sits top-right in RTL and top-left in LTR. Inline tag comes first in reading order with `margin-inline-end`.

## Accessibility

- On media the tag is real text, not part of the image; it is read before the title, which is the intended order («خبر — برگزاری نخستین نمایشگاه…»).
- Inside a heading it becomes part of the heading name; if that is noisy for a long list, put it in the kicker line instead.
- Contrast: `text-brand` on `bg-brand-subtle` and `text-secondary` on `bg-subtle` both meet 4.5:1; on a photo the solid pill guarantees it (no text directly on photos).
- A linked tag says where it goes by its text; no icon-only tags.

## Data

`content.json`: `kind` → `kindFa` (kind tag), `categoryFa` and `tags[]` (topic tags), `image` (null → RecordImage empty state with the tag still on it), `publishAt.longFa` and `readTimeFa` for the kicker line.

## Code mapping

★ New. Proposed `src/ui/category-tag.tsx`: `CategoryTag` — `label`, `tone: 'brand' | 'neutral'`, `placement: 'media' | 'inline' | 'default'`, `href?`. Kind labels come from one map keyed by `content_item.kind`, never typed per page.

## Do / Don't

- Do use one kind tag per item and keep it on the image when there is an image.
- Do use neutral for topics so the kind stays the only orange-ish label.
- Don't use a tag to show status, price or count.
- Don't set tags on dark scrims or directly on photos without their pill.
