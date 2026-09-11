import type { ReactNode } from 'react';
import { SiteShell } from '../../src/public/site-shell.tsx';

/*
 * Rendered per request: canonical URLs come from the runtime SITE_URL rather
 * than whatever the build machine had, and the header knows who is signed in
 * (DEC-0150). Static caching of public pages is a PROMPT-018 concern.
 */
export const dynamic = 'force-dynamic';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
