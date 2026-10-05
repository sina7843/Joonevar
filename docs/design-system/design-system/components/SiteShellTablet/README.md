# SiteShellTablet

SiteShell rendered at 768px: 64px header with logo, search and menu, a single content column with 32px margins, and the footer in three columns.

Same markup and classes as **SiteShell** — this folder exists only so the 768–1023 media queries fire in the catalogue. Read `SiteShell/README.md` for anatomy, CSS API, states, accessibility and code mapping.

## What changes at 768–1023

- Header: the grouped nav and the login button are hidden; the menu IconButton opens the full menu in a Drawer (see GroupedNav, mobile part).
- Container margin 32; content grid 8 columns, gutter 20 (article cards span 4 → two per row).
- Footer: brand block on its own row, then the six groups as headings + always-visible links in three columns; the bottom row gets a `border-default` rule.
- Headings use the mobile sizes (h1 24/38), body uses the desktop size.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** Same component as `SiteShell` (`src/public/site-shell.tsx`); only the breakpoint layout differs.

