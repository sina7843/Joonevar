# PublicShellMobile

PublicShell at 390px (shown as a 390×844 viewport that scrolls): 56px top bar with logo and bell, one column of cards, and the sticky 4-tab bar; below it, the trusted-vet tab bar variant.

Same markup as **PublicShell**; this folder exists so the <768 media queries fire. Full spec in `PublicShell/README.md`.

## What changes below 768

- Top bar 56px: logo at the start, bell (unread dot) at the end; search moves into the pages that need it.
- Tab bar 68px, sticky to the bottom over scrolling content: خانه (current, `house-fill`) · درخواست‌ها · اعلان‌ها (badge «۲») · پروفایل.
- Trusted vet: صف من (current, badge «۳») · پذیرش · نمونه‌ها · پروفایل — used at the clinic desk, so labels stay visible and targets stay 68px tall.
- A page's primary action becomes a sticky ActionRow directly above the tab bar; alerts put their link under the text.

## Code mapping

**Verified in the App code (commit `74fbfb7`, 11 Mehr 1405):** Same component as `PublicShell` (`src/ui/shell.tsx`); only the breakpoint layout differs.

