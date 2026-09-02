import { notFound } from 'next/navigation';
import { env } from '../../../src/config/env.ts';
import { devOverrideAllowed } from '../../../src/authz/session.ts';
import { PatternGallery } from './gallery.tsx';

export const dynamic = 'force-dynamic';

/**
 * Pattern review page.
 *
 * Every state on this page is synthetic and labelled as such. It exists so the
 * shared states — form errors, focus behaviour, long Persian text, identifiers,
 * corrections, waiting and overlays — can be rendered and reviewed in a real
 * browser before any flow depends on them.
 *
 * It is not part of the product surface: outside development with local
 * integrations it does not exist at all.
 */
export default function DevPatternsPage() {
  if (!devOverrideAllowed(env())) notFound();
  return <PatternGallery />;
}
