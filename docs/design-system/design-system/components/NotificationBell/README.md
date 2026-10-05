# NotificationBell

The bell IconButton with an unread count and, from 768px, a 380px panel of the latest notifications with «همه را خوانده‌شده کن» and a link to all notifications.

Use it in the PublicShell top bar (every width) and in the OpsShell top bar when an operator receives notifications. Not in SiteShell. Below 768 the bell is a link to `/notifications` (no panel); in the PublicShell tab bar the count sits on the «اعلان‌ها» tab instead.

## Anatomy

1. **Trigger** — `hz-icon-btn` (44) with `bell` 24 + count badge (`hz-icon-btn__count`: 20px pill, `action-primary`, `text-on-action` 11/16 Bold, 2px `bg-chrome` ring) at the top end corner. No badge at zero or while loading; «۹۹+» above 99.
2. **Panel** (NotificationItem panel) — head: «اعلان‌ها» + ghost sm «همه را خوانده‌شده کن» (`checks`) → list of compact NotificationItems (unread dot `logo-mark`, title Bold when unread, body clamped to 2 lines, time) scrolling at 420 → foot «همه اعلان‌ها ←».

## CSS API

Reuses NotificationItem (`.hz-notification-panel`, `__head`, `__title`, `__list`, `__foot`, `.hz-notifications--compact`, `.hz-notification`, `--unread`, `__dot`, `__body`, `__title`, `__text`, `__time`), PageStates (`.hz-state--compact`). css-additions `NotificationBell.css`:

| Class | Role |
|---|---|
| `.hz-bell` | anchor around the IconButton |
| `.hz-icon-btn__count` | numeric unread badge (replaces the P0 `__dot` on the bell) |
| `.hz-bell > .hz-bell__panel` | positions the panel below the bell, end-aligned, 380 (max viewport − 32) |

```html
<span class="hz-bell">
  <button type="button" class="hz-icon-btn" aria-label="اعلان‌ها، ۲ خوانده‌نشده" aria-expanded="false" aria-controls="nb">…bell…<span class="hz-icon-btn__count" aria-hidden="true">۲</span></button>
  <div class="hz-notification-panel hz-bell__panel" id="nb" role="region" aria-labelledby="nb-t" hidden>
    <div class="hz-notification-panel__head"><h2 class="hz-notification-panel__title" id="nb-t">اعلان‌ها</h2><button type="button" class="hz-btn hz-btn--ghost hz-btn--sm">…checks… همه را خوانده‌شده کن</button></div>
    <ul class="hz-notifications hz-notifications--compact hz-notification-panel__list">…</ul>
    <div class="hz-notification-panel__foot"><a class="hz-link hz-link--standalone" href="/notifications">همه اعلان‌ها …</a></div>
  </div>
</span>
```

## Tokens

`action-primary` + `text-on-action` (count), `bg-chrome` (badge ring), `action-secondary-hover` (open/hover), `logo-mark` (unread dot), `bg-surface`, `border-default`, `border-subtle`, `shadow-overlay-sm`, `z-dropdown`, `radius-xl`, `text-secondary`, `text-brand`, `status-error-*` (error state), `focus-ring`.

## Variants & sizes

- **Panel trigger** (≥768) · **link trigger** (<768, to `/notifications`).
- Badge: «۱»–«۹۹», «۹۹+»; min width 20, grows with digits.
- Panel 380 × up to 420 list height; shows the newest 10, ordered by time (unread rows are not pulled to the top).

## States

Trigger: no unread · count · «۹۹+» · loading (no badge, `aria-busy`) · hover (pointer) · **focus-visible** · open (`aria-expanded`). Panel: default (mixed unread/read) · **empty** («اعلانی ندارید» + what will appear here) · **error** («اعلان‌ها بارگیری نشد» + «تلاش دوباره») · after «همه را خوانده‌شده کن»: dots and badge disappear, the button disables, the label updates. Long Persian body: clamped to 2 lines with «…» (edge case «پرونده شما نیازمند اصلاح است»); the full text is on `/notifications`.

## Mobile ↔ desktop

| | <768 | 768–1023 | ≥1024 |
|---|---|---|---|
| PublicShell top bar | bell link + count | bell + panel | bell + panel (before the primary action) |
| PublicShell tab bar | count on «اعلان‌ها» tab (`hz-tab__badge`) | same | no tab bar |
| OpsShell | in nav Drawer | bell + panel | bell + panel |

Touch target 44 at every width.

## RTL & LTR

Badge at the inline end corner of the icon; the panel aligns to the bell's end edge. `bell` and `checks` never mirror; «همه اعلان‌ها» uses `arrow-right` mirrored. Persian digits in the badge and times.

## Accessibility

Bell: `aria-label` includes the count («اعلان‌ها، ۲ خوانده‌نشده»); the visual badge is `aria-hidden`. Disclosure (`aria-expanded`, `aria-controls`); the panel is a labelled `region`, not a dialog; Esc closes and returns focus. Unread rows carry hidden text «خوانده‌نشده:» (not colour/weight only). The list is `aria-live="polite"` so marking all read is announced once; a new notification updates the bell label, not a live announcement.

## Data

`notifications.json`: `titleFa`, `bodyFa`, `createdAt.displayFa` / `iso`, `read`, `recipientAccountId`. Count = unread for the signed-in account. Preview: سارا احمدی's two unread («برگه ثبتی «رکس» صادر شد», «پرداخت شجره‌نامه در انتظار شماست») plus two read rows, one using the long body from edge-cases.json.

## Code mapping

★ New — proposed `NotificationBell` in `src/ui/notification-bell.tsx`, used by both app shells. Props: `unreadCount: number | null` (null = loading), `items?: Notification[]` (lazy on open), `href: '/notifications'`, `onMarkAllRead(): Promise<void>`, `variant: 'panel' | 'link'` (by breakpoint). Rows render with `NotificationItem compact`.

## Do / Don't

- Do hide the badge at zero — never show «۰».
- Do keep «همه را خوانده‌شده کن» in the panel head, not per row.
- Don't use the bell for system banners or promotions.
- Don't open the panel automatically when a new notification arrives.
