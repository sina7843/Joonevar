# Toast

A short, temporary confirmation (or recoverable error) that floats above the page — bottom on phones, bottom-start on desktop — with an optional «بازگرداندن» or «تلاش دوباره».

Use it for the result of an action the user just took that does not change the page much: copy («شناسه کپی شد»), save a setting, send a message or request, delete with undo. Don't use it for anything the user must read later or act on to continue (use `Alert`), for form validation (field errors / `InlineMessage`), or for payment results (server-confirmed result page).

## Anatomy

1. Region — fixed container, `z-toast`, holds up to 3 toasts, newest nearest the screen edge.
2. Toast — white `bg-surface`, 1px `border-default` (`status-error-border` for error), `radius-lg`, `shadow-overlay-sm`, min 52px.
3. Status icon — 20px `check-circle` (success) / `warning-circle` (error), tone text colour.
4. Text — 14/22 `text-primary`, one sentence.
5. Actions — optional ghost `sm` button («بازگرداندن» / «تلاش دوباره») + close `x` (36px, 44px on touch).

## CSS API

| Class | Role |
|---|---|
| `.hz-toast-region` | Fixed region. <768: `inset-inline: 16px`, bottom 16 + safe area · ≥768: bottom-start, 360px |
| `.hz-toast-region--above-bar` | Lifts it above the PublicShell tab bar (<1024). Pages with StickyActionBar set `--hz-toast-offset` to the bar height |
| `.hz-toast` + `--success` · `--error` · `--info` | Toast and tone |
| `.hz-toast__text` · `__actions` | Text and action group |

```html
<div class="hz-toast-region hz-toast-region--above-bar" role="region" aria-label="پیام‌های کوتاه">
  <div class="hz-toast hz-toast--success" role="status">
    <svg class="hz-icon hz-icon--sm" …check-circle…></svg>
    <p class="hz-toast__text">آگهی «توله ژرمن شپرد» حذف شد.</p>
    <div class="hz-toast__actions"><button class="hz-btn hz-btn--ghost hz-btn--sm">بازگرداندن</button><button class="hz-icon-btn" aria-label="بستن">…x…</button></div>
  </div>
</div>
```

## Tokens

`bg-surface` · `border-default` · `status-error-border` · `status-success-text` · `status-error-text` · `status-info-text` · `text-primary` · `radius-lg` · `shadow-overlay-sm` · `z-toast` · `duration-base` + `ease-enter` (enter), `duration-fast` + `ease-exit` (exit) · `tabbar`.

## Variants & sizes

| Variant | Example | Auto-dismiss |
|---|---|---|
| Success, short | «شناسه کپی شد.» (no close button) | 4 s |
| Success | «تنظیم «هزینه صدور شجره‌نامه» ذخیره شد.» · «درخواست ارسال شد.» | 5 s |
| Success + undo | «آگهی «توله ژرمن شپرد» حذف شد.» + «بازگرداندن» | 8 s — the undo window; the delete is committed when the toast closes (status `DELETED` «حذف (قابل بازگردانی)» stays restorable from the list afterwards) |
| Error | «پیام ارسال نشد. اتصال اینترنت را بررسی کنید.» + «تلاش دوباره» | Never — stays until retried or closed |

Auto-dismiss rules: the timer **pauses** while the pointer is over the region or focus is inside it and restarts in full after; one extra second per 10 words over 12; never dismissed while focus is inside. Max 3 visible — a 4th removes the oldest success (never an error). Identical repeat (copy twice) replaces, not stacks. One size.

## States

Enter (slide 8px + fade, `duration-base`) · exit (fade, `duration-fast`) · hover/focus (pause) · focus-visible on actions (shown statically) · action loading: «تلاش دوباره» gets `aria-busy` + spinner, toast stays · long Persian text: wraps, actions stay beside the first line · reduced motion: no slide or fade. No disabled or empty state — no toast without text.

## Mobile ↔ desktop

- **<768:** bottom, full width minus 16px gutters, above the tab bar (`--above-bar`) or StickyActionBar (`--hz-toast-offset`), plus safe area. Close button 44px.
- **768–1023:** bottom-start, 360px, still above the tab bar.
- **≥1024:** bottom-start (bottom-right in RTL, beside the sidebar), 24px from the edges.

## RTL & LTR

Bottom-**start** = right in RTL, left in LTR (logical `inset-inline`). Icon at start, actions at end. Status icons not mirrored; if an undo icon is ever added it is `arrow-u-up-left` + `hz-icon--mirror`.

## Accessibility

- The region exists in the DOM from page load (empty), so additions are announced. Success/info toasts carry `role="status"` (polite); error toasts `role="alert"`.
- Focus is **not** moved to a toast. The undo is also reachable another way (the item stays restorable in its list), satisfying WCAG 2.2.1 timing; hover/focus pause the timer.
- Close button: `aria-label="بستن"`; Escape closes the toast that contains focus.
- Text is the whole message; never rely on the icon colour.

## Data

Copy names the object from data in «…»: listing `animalName`, setting `labelFa`, animal name (fallback «بدون نام»). Persian digits; no exclamation marks.

## Code mapping

★ New — today one `aria-live` in `/mating-finder` only. Proposed `src/ui/toast.tsx`: `<ToastRegion aboveBar? />` once per shell, and `toast({ tone: 'success' | 'error' | 'info', message, action?: { label, onClick }, duration? })` returning an id; `duration` defaults from the table above (`Infinity` for error).

## Do / Don't

- Do confirm with the object's name: «تنظیم «…» ذخیره شد.»
- Do keep error toasts on screen until handled.
- Don't put the only copy of important information in a toast (payment results, case decisions).
- Don't show a toast and an Alert for the same event.
- Don't let toasts cover the sticky action bar or the tab bar.
