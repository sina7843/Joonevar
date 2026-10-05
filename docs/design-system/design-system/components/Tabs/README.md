# Tabs

A row of tabs that switches between sections of one record or settings page, with optional counts and a locked tab that says why. A segmented form switches between views of the same data.

Use Tabs when a record has several sections that are too long to stack on one screen (animal record: مشخصات · اسناد · درخواست‌ها · تاریخچه; seller account; breed admin). Use Segmented for 2–4 views of the same data («فهرست / نقشه») and for the merge tool's record kind (today's `MergeKindTabs`). Don't use Tabs for page navigation between routes in the shell (Sidebar / tab bar), for filters (FilterBar chips) or for steps in a form (Stepper).

## Anatomy

1. **Tablist** `.hz-tabs`: one line under a `border-default` rule. It scrolls horizontally and never wraps.
2. **Tab** `.hz-tabs__tab`: label, optional count (`.hz-count`), optional leading icon (only `lock-simple` for a locked tab).
3. **Selected indicator**: a 3px `border-brand` bar on the tab's bottom edge, with the label in `text-brand` Bold.
4. **Panel** `.hz-tabs__panel`: 16px top padding. Inside a flush Card it is a `.hz-card__section`.
5. **Segmented** `.hz-segmented`: a sand track with white pressed items.

## CSS API

All in `tools/css-additions/Tabs.css`: `.hz-tabs`, `--sm` (OpsShell), `--fit` (equal widths), `--bleed` (runs to the screen edge on mobile), `.hz-tabs__tab`, `.hz-tabs__panel`, `.hz-card--flush > .hz-tabs`; `.hz-segmented`, `--block`, `.hz-segmented__item`. Counts reuse bundle `.hz-count` / `.hz-count--alert`. The shell tab bar `.hz-tabbar/.hz-tab` is a different component.

```html
<div class="hz-tabs" role="tablist" aria-label="بخش‌های پرونده لونا">
  <button class="hz-tabs__tab" type="button" role="tab" id="t-info" aria-selected="true" aria-controls="p-info">مشخصات</button>
  <button class="hz-tabs__tab" type="button" role="tab" aria-selected="false" tabindex="-1">اسناد<span class="hz-count">۲</span></button>
  <button class="hz-tabs__tab" type="button" role="tab" aria-selected="false" tabindex="-1">درخواست‌ها<span class="hz-count hz-count--alert" aria-label="۱ مورد منتظر اقدام شما">۱</span></button>
  <button class="hz-tabs__tab" type="button" role="tab" aria-disabled="true" aria-describedby="litter-why" tabindex="-1">…lock-simple زایمان‌ها</button>
</div>
<div class="hz-tabs__panel" role="tabpanel" id="p-info" aria-labelledby="t-info" tabindex="0">…</div>
```

## Tokens

`border-default` (rule) · `border-brand` (selected bar) · `text-brand` (selected label) · `text-secondary` (idle) · `text-primary` + `bg-subtle` (hover) · `text-disabled` (locked) · `bg-brand-subtle` (count on selected tab) · `action-primary` + `text-on-action` (alert count) · `focus-ring` · `radius-sm` (tab top corners). Segmented: `bg-subtle` track, `border-default`, `bg-surface` pressed item, `radius-md` / `radius-sm` (12 − 3 − 1).

## Variants & sizes

- **Default** 48px tabs, 15px. PublicShell records, SiteShell profiles.
- **sm** 40px (44 on coarse pointers), 14px. OpsShell records and admin pages.
- **fit**: equal widths for 2–3 short labels on mobile (orders: «جاری ۱ · تحویل‌شده · مرجوعی ۱»).
- **Counts**: a plain `.hz-count` is a total. `.hz-count--alert` (orange) is the number waiting on **you**, and only that. A zero count is hidden.
- **Segmented**: 36px items (40 on coarse pointers), `--block` for full width.

## States

- **default**: `text-secondary`, weight 500.
- **hover** (pointer only): `text-primary` on `bg-subtle`.
- **focus-visible**: inset ring (−2px), so a scrolled tablist never clips it.
- **selected**: `aria-selected="true"`, `text-brand` Bold + 3px bar. Exactly one per tablist.
- **disabled / locked**: `aria-disabled="true"` + `lock-simple`. It stays focusable, and `aria-describedby` points to the reason in LockedServiceCard voice: «فقط حساب پرورش‌دهنده زایمان ثبت می‌کند. با «فعال‌سازی حساب پرورش‌دهنده» باز می‌شود.» Never hide a tab the user could unlock.
- **loading**: the count is replaced by a 16px spinner (`aria-busy` on the tab) and the panel shows Skeleton. The tabs stay usable.
- **error**: the panel shows the error state. The tab and count stay («—» never replaces a tab label).
- **empty**: the panel shows a compact EmptyState («هنوز سندی صادر نشده»). The tab stays and its count is hidden.
- **long Persian text**: the tablist scrolls and is never truncated. The record name above it wraps («شاهزاده کوچولوی باغ ارم شیراز»).

## Mobile ↔ desktop

- **<768**: one line, horizontal scroll with `--bleed`, so a cut tab at the screen edge shows there is more. The selected tab is scrolled into view on load. `--fit` for 2–3 short tabs. Tabs are 48px, above the 44px target.
- **768–1023**: same, usually everything fits.
- **≥1024**: tabs sit at the top edge of a flush card or under the PageHeader. In a two-column record (P6) only the main column has tabs, and the status column never moves.

## RTL & LTR

Tabs flow from the start edge. Scroll starts at the start. The selected bar sits under the label in both directions. `lock-simple`, `list` and `map-trifold` are not mirrored. Arrow keys follow visual direction: in RTL ← moves to the next tab.

## Accessibility

- `role="tablist"` with `aria-label`. `role="tab"` buttons with `aria-selected`, `aria-controls` and roving `tabindex`. `role="tabpanel"` with `aria-labelledby` and `tabindex="0"`.
- Keyboard: ←/→ move and activate (automatic activation, because panels are already loaded or cheap). Home/End jump. A locked tab is focusable but does not activate.
- A count's meaning goes in its `aria-label` when it is not a plain total («۱ مورد منتظر اقدام شما»).
- Tabs that change the URL (`?tab=documents`) keep `role="tab"`. The URL is for sharing and reload, not navigation. Use `aria-current="page"` links instead only when each tab is a separate route.

## Data

Tab set per record type comes from the route (animal: مشخصات / اسناد / درخواست‌ها / تاریخچه / زایمان‌ها for breeders). Counts come from the same queries as the panels: documents by `animalId` (لونا: `RS-93KHPW8P` and `PD-475VU8E2` = ۲), requests with `actionOwner = USER` for the alert count. Lock state comes from the role/capability that the services list (LockedServiceCard) uses.

## Code mapping

★ New `src/ui/tabs.tsx`: `Tabs({ label, items: { id; label; count?: number | null; alertCount?: number; locked?: { reason: string }; }[], value, onChange, size?: 'md' | 'sm', fit?: boolean, syncUrl?: string })` + `TabPanel({ id })`. `Segmented({ label, items, value, onChange, block? })`. Today's `MergeKindTabs({ current: MergeKind })` (`src/admin/forms.tsx`, verified) becomes a `Segmented` with `value = current`.

## Do / Don't

- Do keep the tab label short and noun-like («اسناد», not «مشاهده اسناد»).
- Do show a locked tab with its reason instead of hiding it.
- Don't wrap tabs onto two lines or hide them behind «بیشتر».
- Don't use orange counts for totals. Orange means it is waiting on you.
