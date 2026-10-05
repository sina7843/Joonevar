# PedigreeTree

A three-generation ancestry tree — the animal, its sire and dam, grandparents and great-grandparents — with designed handling for ancestors that are unknown or come from a foreign pedigree.

Use on the pedigree record page (`/pedigree`) and inside the A4 pedigree document (PD-). P2. Not for litters or descendants (a list on the permit page) or for the request timeline (Timeline).

## Anatomy

Column heads «حیوان · والدین · پدربزرگ و مادربزرگ · نسل سوم» → grid of 4 columns × 8 rows: subject (spans 8 rows, `bg-brand-subtle` + `border-brand`) → sire and dam (4 rows each) → grandparents (2) → great-grandparents (1). Connectors: a 2px `border-default` line back to the child and a bracket toward the two parents. Each node: role («پدر»، «مادرِ مادر»), name (2-line clamp; 1 line in the last column), breed, ID (`PET-` for Hamzist records, the foreign registry number otherwise), optional tag «شجره خارجی».

**Unknown ancestors:** a dashed `border-control` node on `bg-subtle` reading «نامشخص» + the reason («در همزیست ثبت نشده»، «در شجره خارجی نیامده»). When a parent has no recorded ancestry at all (generation `G0`), its whole branch collapses into **one** node «اجداد پدری — نامشخص» spanning the remaining columns, instead of six empty boxes.

## CSS API

| Class | Use |
|---|---|
| `.hz-pedigree` | Wrapper; `--ped-gap` (32px); minimum width 600px + 3 gaps (696px), scrolls horizontally below it |
| `__cols` · `__col` | Column heads |
| `__grid` | 4 × 8 grid, rows ≥60px |
| `.hz-ped` + `--g0` `--g1` `--g2` `--g3` | Slot by generation; start row via `style="--r:5"` |
| `--rest2` · `--rest3` | Collapsed unknown branch (columns 3–4 × 4 rows · column 4 × 2 rows) |
| `--has-parents` · `--collapsed-parents` | Bracket to two parents · single line to a collapsed branch |
| `.hz-ped__node` (`--subject`, `--unknown`) · `__role` · `__name` · `__meta` · `__id` | Node box |

```html
<li class="hz-ped hz-ped--g1 hz-ped--has-parents" style="--r:5">
  <div class="hz-ped__node"><span class="hz-ped__role">مادر <span class="hz-tag hz-tag--neutral">شجره خارجی</span></span>
    <span class="hz-ped__name">تارا</span><span class="hz-ped__meta">ژرمن شپرد</span><bdi class="hz-id hz-ped__id" dir="ltr">PET-6DP9RN3R</bdi></div>
</li>
```

## Tokens

`bg-surface` · `border-default` (nodes, connectors) · `bg-brand-subtle` + `border-brand` (subject on screen; plain `bg-surface` in print) · `bg-subtle` + `border-control` dashed (unknown) · `text-primary` · `text-secondary` · CategoryTag neutral (`bg-subtle`, `text-secondary`) · focus `focus-ring`.

## Variants & sizes

Screen (nodes 14px names) · print (inside A4, same classes; the A4 width of 682px fits the 696px minimum at 0.98 scale or with `--ped-gap: 24px`). Generations fixed at 3 (the document standard); a 2-generation compact variant drops `--g3`.

## States

Known (Hamzist record, links to the animal page when the viewer may see it) · known foreign (name and number LTR, tag «شجره خارجی») · unknown single ancestor · collapsed unknown branch · hover (pointer only, linked nodes: `border-control`) · focus-visible (2px ring) · loading (Skeleton nodes in the same grid) · empty (subject is G0 with no parents: one collapsed node across columns 2–4 «والدین ثبت نشده‌اند») · **long Persian name** wraps to two lines then clamps (full name in `title` and on the animal page).

## Mobile ↔ desktop

≥1024: full tree in the page. 768–1023: full tree, nodes at 150px minimum. <768: the tree keeps its shape and scrolls horizontally inside the card (subject visible first at the start edge); offer «نمایش فهرستی» which renders the same data as a nested list by generation (پدر ← پدرِ پدر …).

## RTL & LTR

Subject at the start (right in RTL), ancestors toward the end; connectors use `inset-inline-*`, so the tree mirrors in LTR. Foreign names and numbers in `<bdi dir="ltr">`.

## Accessibility

`<figure aria-label="شجره سه‌نسلی نیکا">` with an ordered list; each node's role makes the relation explicit («مادرِ مادر»), so the tree reads correctly without the lines. Linked nodes are real links in reading order: subject, sire branch, dam branch. Unknown nodes are text, not disabled controls. The list view is the accessible alternative on mobile.

## Data

Subject from `animals.json`/`documents.json › pedigrees` (`pedigreeCode`, `generationAtIssue`); ancestors from the registry links (sire/dam ids) or the imported foreign pedigree (name, registry number). The sample content has no ancestor records: foreign names and `SZ` numbers in the preview are illustrative; نیکا, آرا, تارا, `PUP-CC744Q7D` and `MP-7RYZNEN3` are real sample values.

## Code mapping

★ New `PedigreeTree`: `subject`, `ancestors: { position: 'S' | 'D' | 'SS' | 'SD' | 'DS' | 'DD' | 'SSS' … , name, breed, id, source: 'HAMZIST' | 'FOREIGN', href? }[]` (missing positions = unknown, collapsed when the whole branch is missing), `generations = 3`, `unknownReason(position)`, `variant: 'screen' | 'print'`.

## Do / Don't

- Do collapse a fully unknown branch into one node with the reason.
- Do mark foreign-pedigree ancestors with the tag and their own number.
- Don't colour sires and dams differently; the role label carries it.
- Don't invent placeholder names for unknown ancestors.
