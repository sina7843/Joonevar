# PublicShellTablet

PublicShell at 768px (shown as a 768×1024 viewport): the phone layout widened — 56px top bar with logo and bell, two-column card grid, and the 4-tab bar pinned to the bottom.

Same markup as **PublicShell**; this folder exists so the 768–1023 media queries fire. Full spec in `PublicShell/README.md`.

## What changes at 768–1023

- No sidebar (`hz-sidebar--app` is hidden until 1024); the tab bar stays — PublicShell has no tablet side rail.
- Dashboard cards sit in two columns; alerts span the full width.
- The preview shows the work area with 16px margins because `.hz-main__inner` has no 768 rule yet; the layout spec is **32px** at this width (see `shells.md`) — a bundle fix is pending.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** Same component as `PublicShell` (`src/ui/shell.tsx`); only the breakpoint layout differs.

