import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { ContentPanelList } from '../../src/content/panel.tsx';

export const dynamic = 'force-dynamic';

type Search = Promise<{ status?: string | string[]; kind?: string | string[]; page?: string | string[] }>;

/** Author environment — P2-D11 (PROMPT-004). */
export default async function AuthorHomePage({ searchParams }: { searchParams: Search }) {
  const guard = await guardRoute('/author');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  return <ContentPanelList actor={guard.actor} panel="author" search={await searchParams} />;
}
