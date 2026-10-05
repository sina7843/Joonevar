# OpsShellTablet

OpsShell at 768px: the sidebar collapsed to a 72px icon rail (association operator, 14 items), a 56px top bar with breadcrumbs and the account avatar, and the queue tiles in four columns.

Same markup as **OpsShell** with `hz-sidebar--collapsed` set by default at this width; full spec and the 5–24 item rules in `OpsShell/README.md`.

## What changes at 768–1023

- Rail: symbol logo, icons only (44px targets), current item with fill icon and `bg-brand-subtle`, a `border-subtle` hairline between groups, an `action-primary` dot on items with overdue cases (here «احراز هویت»). Group toggles and env label are hidden; collapsed groups are ignored so every item is reachable.
- Each rail link has `aria-label` (label + count) and a tooltip; «بازکردن منو» opens the full 248 sidebar over the content (scrim, Esc closes).
- Top bar: breadcrumbs «انجمن / صف‌ها», account shows the initial only.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** Same component as `OpsShell` (`src/ui/shell.tsx`); only the breakpoint layout differs.

