import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { ContentPanelList } from '../../src/content/panel.tsx';

export const dynamic = 'force-dynamic';

type Search = Promise<{ status?: string | string[]; kind?: string | string[]; page?: string | string[] }>;

/** Content admin environment — Requirements-Phase-2 §3, §12 (PROMPT-004). */
export default async function ContentAdminHomePage({ searchParams }: { searchParams: Search }) {
  const guard = await guardRoute('/content');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  return <ContentPanelList actor={guard.actor} panel="content" search={await searchParams} />;
}
