# SiteShellMobile

SiteShell rendered at 390px: 64px header (logo · search · menu), «بازگشت» instead of breadcrumbs, one content column, and the footer as accordion rows.

Same markup and classes as **SiteShell** — this folder exists only so the <768 media queries fire. Read `SiteShell/README.md` for the full spec.

## What changes below 768

- Header 64px, margins 16; the menu IconButton (`aria-expanded`, `aria-controls="site-menu"`) opens the full menu Drawer from the end edge (GroupedNav).
- PageHeader shows only «بازگشت» (`arrow-left` + mirror); breadcrumbs are hidden.
- Content grid 4 columns, gutter 16; cards stack.
- Footer: brand block, then six `.hz-accordion-row` buttons (52px, `border-default` underline). The preview shows «مجله» expanded; links inside are 44px tall. Bottom row: © and support hours with «تماس با ما».

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** Same component as `SiteShell` (`src/public/site-shell.tsx`); only the breakpoint layout differs.

