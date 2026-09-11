import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { NewContentView } from '../../../src/content/panel.tsx';

export const dynamic = 'force-dynamic';

export default async function ContentAdminNewPage() {
  const guard = await guardRoute('/content/new');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  return <NewContentView actor={guard.actor} panel="content" />;
}
