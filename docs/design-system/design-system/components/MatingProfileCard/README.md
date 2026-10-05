# MatingProfileCard

An animal offered in the mating finder — photo, name, breed and sex, city, last mating, the owner's availability setting and an explainable compatibility box that always lists its reasons.

Use in `/mating-finder` results and «پیشنهادهای جفت‌یابی» on the breeder dashboard. Not for the owner's own profile settings (`/account/mating-finder`, a form) and not for a mating request thread (Messaging).

## Anatomy

1. Photo — RecordImage `--thumb-lg` 64px, `radius-lg`; missing → symbol.
2. Name — Bold 16/26, a link to the profile (the card itself is not a link: it holds a button).
3. Meta — «سگ سرابی، نر» (`breedFa`، `sexFa`).
4. City — `map-pin` + city.
5. Last mating — `calendar-blank` + «آخرین جفت‌گیری: ۱ خرداد ۱۴۰۵» (date never breaks); none → «—».
6. Availability — icon + dictionary label (finder keys, approved 11 Mehr 1405): `FINDER_READY` `check-circle` (success colour) «آماده دریافت درخواست» · `FINDER_INVITE_ONLY` `lock-simple` «فقط با دعوت» · `FINDER_UNAVAILABLE` `pause-circle` «موقتاً در دسترس نیست».
7. Compatibility (when the viewer chose their own animal) — `bg-subtle` box: score «سازگاری بالا» + reasons with `check` («هم‌نژاد»، «هر دو برگه ثبتی دارند»، «فاصله سنی مناسب»). Without a chosen animal: one hint sentence in the same box.
8. Note (not `FINDER_READY`) — one sentence why no request can be sent.
9. Footer — start: «ارسال درخواست» (secondary sm, only `FINDER_READY`); end: «مشاهده پروفایل».

## CSS API

New in `css-additions/MatingProfileCard.css`: `.hz-mating`, `.hz-availability` (`--open`), `.hz-fit`, `__title`, `__list`, `__item`, `.hz-mating__note`. Composes `.hz-card`, `.hz-entity*` (ClubCard), `.hz-media--thumb-lg`, `.hz-card__footer`, `.hz-btn--secondary.hz-btn--sm`, `.hz-link--standalone`.

```html
<article class="hz-card hz-mating">
  <div class="hz-entity">
    <div class="hz-media hz-media--thumb-lg">…</div>
    <div class="hz-entity__body">
      <h3 class="hz-entity__name"><a href="…">آرا</a></h3>
      <span class="hz-entity__meta">سگ سرابی، نر</span>
      <span class="hz-entity__line"><svg …map-pin…></svg>کرج</span>
      <span class="hz-entity__line"><svg …calendar-blank…></svg><span>آخرین جفت‌گیری: <time datetime="2026-05-22">۱ خرداد ۱۴۰۵</time></span></span>
      <span class="hz-availability hz-availability--open"><svg …check-circle…></svg>آماده دریافت درخواست</span>
    </div>
  </div>
  <div class="hz-fit"><p class="hz-fit__title">سازگاری بالا</p>
    <ul class="hz-fit__list" aria-label="دلایل سازگاری"><li class="hz-fit__item"><svg …check…></svg>هم‌نژاد</li>…</ul></div>
  <div class="hz-card__footer"><button class="hz-btn hz-btn--secondary hz-btn--sm">ارسال درخواست</button><a class="hz-link hz-link--standalone" href="…">مشاهده پروفایل</a></div>
</article>
```

## Tokens

`bg-surface`, `border-default`, `border-subtle`, `bg-subtle` (fit box, note box), `bg-media-empty`, `text-primary`, `text-secondary`, `text-brand`, `icon-default`, `status-success-text` (open icon, reason checks), `border-control`, `radius-xl`, `radius-md`, `radius-lg`, `focus-ring`.

## Variants & sizes

- **Availability:** ready · invite only · temporarily unavailable (see Anatomy 6).
- **Compatibility:** shown with reasons · hint («برای دیدن سازگاری، حیوان خود را در فیلتر «حیوان من» انتخاب کنید.») · omitted for profiles that cannot receive a request.
- One size; 1 / 2 / 3 columns.

## States

- **Default** · **hover** (pointer): button and name link only.
- **Focus-visible:** name link, button, «مشاهده پروفایل» (preview: third card).
- **Loading:** thumb skeleton + three lines + fit-box skeleton. After «ارسال درخواست»: button `aria-busy` «در حال ارسال…», then the card shows the request status (`AWAITING_COUNTERPARTY` «در انتظار تأیید طرف مقابل»).
- **Disabled:** never a disabled button; unavailable profiles drop the button and say why.
- **Empty results:** `EmptyState` «پروفایلی با این فیلتر پیدا نشد» + «حذف فیلترها».
- **Long Persian text:** «شاهزاده کوچولوی باغ ارم شیراز» and «پرشین (اگزوتیک موکوتاه)» wrap; reasons wrap under their check.

## Mobile ↔ desktop

<768 one column; footer button and link stay on one row, button grows to `control-md` (44px) on coarse pointers by using the default size below 768. 768–1023 two columns. ≥1024 three columns beside the filter column.

## RTL & LTR

Photo at the start. Dates Persian digits, never broken across lines (`time` is `nowrap`). `check`, `lock-simple`, `pause-circle`, `calendar-blank`, `map-pin` are not mirrored.

## Accessibility

- `<article>`, name as `<h3>` link. Reasons are a list labelled «دلایل سازگاری»; the score is text, never a colour or a number alone.
- Availability is icon + text; the icon is `aria-hidden`.
- «ارسال درخواست» names the animal for screen readers via `aria-describedby` on the name (implementation).

## Data

`finder.json → profiles[]`: `animalName`, `breedFa`, `sexFa`, `state`/`stateFa`, `city`, `lastMating` (nullable), `compatibility {scoreFa, reasonsFa[]}` (optional). The long-name card is constructed from `edge-cases.json → animals[1]` (city and state set for the demo).

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** `src/finder/profile-card.tsx`: `MatingProfileCardView({ card: ProfileCard, detail? })`; `ProfileCard` (`src/finder/profiles.ts`) carries `nameFa`, `sex`, `breedFa`, `ageFa`, `provinceFa`/`cityFa`, `hasPedigree`, `completeness`, `lastMatingFa`, `cooldown`, `ownerKind`, `kennelNameFa`… Keep; the availability line reads the `FINDER_*` keys.


Existing `MatingProfileCardView` — `src/finder/profile-card.tsx`. Visual mapping: `state` → availability line, `compatibility` → fit box, request action → footer. If the code passes a status label for `state`, replace it with the availability line.

## Do / Don't

- Do always list the reasons next to a compatibility score.
- Do say why a request cannot be sent instead of showing a disabled button.
- Don't show a percentage or stars for compatibility; the code gives a label and reasons.
- **Decided (11 Mehr 1405):** finder availability has its own keys (`FINDER_READY`, `FINDER_INVITE_ONLY`, `FINDER_UNAVAILABLE`); the code's finder `READY` maps to `FINDER_READY`, never to payout `READY` «آماده واریز».
