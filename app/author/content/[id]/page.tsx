import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { ContentEditorView } from '../../../../src/content/panel.tsx';

export const dynamic = 'force-dynamic';

export default async function AuthorEditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/author/content/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  return <ContentEditorView actor={guard.actor} panel="author" contentId={id} />;
}
