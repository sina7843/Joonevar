import { notFound } from 'next/navigation';
import { env } from '../../../src/config/env.ts';

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
  // Outside development with local integrations this page does not exist.
  const current = env();
  if (current.APP_ENV === 'production' || current.INTEGRATION_MODE !== 'local') notFound();
  return <PatternGallery />;
}
