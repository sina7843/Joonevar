# OpsShellMobile

OpsShell at 390px (genetics operator, 5 items — the low end): a 56px top bar with page title, environment and menu button; below, the same screen with the navigation Drawer open.

Same markup as **OpsShell**; full spec and the 5–24 item rules in `OpsShell/README.md`.

## What changes below 768

- No sidebar. Top bar: «داشبورد» / «محیط عملیاتی مرکز ژنتیک» at the start, menu IconButton (`aria-expanded`, `aria-controls="ops-drawer"`) at the end.
- Drawer `hz-drawer--nav` slides from the end edge (under the menu button), max 320 so the page stays visible behind the scrim; cream like the sidebar. Head: logo + env label + close. Items 44px. Foot: user box and «خروج» (`sign-out`, mirrored).
- Five items → flat list, no group labels. With 8+ items the same group labels and collapsible groups as desktop appear inside the Drawer.
- Queue tiles in two columns; queues become card lists and the decision desk becomes a full page with a sticky decision bar.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** Same component as `OpsShell` (`src/ui/shell.tsx`); only the breakpoint layout differs.

