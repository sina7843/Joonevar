import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { reportableContent } from '../../../../src/moderation/service.ts';
import { KIND_FA, KIND_PATH } from '../../../../src/content/model.ts';
import { ReportForm } from '../../../../src/moderation/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Reporting one item — Requirements-Phase-2 §13 (PROMPT-005). Any signed-in
 * account may report content the public can see; an anonymous visitor is sent
 * to sign in with this address carried along.
 */
export default async function ReportContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = '/report/content/' + encodeURIComponent(id);
  const guard = await guardRoute(path);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const item = await reportableContent(db(), id);
  if (item === null) notFound();
  const publicHref = (KIND_PATH[item.kind] ?? '') + '/' + item.slug;

  return (
    <PublicShell actor={guard.actor} title="گزارش مطلب" pathname={path}>
      <div className="space-y-lg">
        <Card>
          <p className="text-caption text-text-secondary">{KIND_FA[item.kind]}</p>
          <h1 className="text-h4">
            <Link href={publicHref} className="hover:text-text-brand">
              {item.titleFa}
            </Link>
          </h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            گزارش شما به ادمین محتوا می‌رسد و با دلیل بررسی می‌شود. هر حساب برای هر مطلب تا بسته شدن بررسی، یک گزارش باز
            دارد.
          </p>
        </Card>
        {item.authorAccountId === guard.actor.accountId ? (
          <Alert tone="info" title="این مطلب نوشته خود شماست">
            آن را از محیط نویسنده اصلاح کنید؛ گزارش برای مطلب خودتان ثبت نمی‌شود.
          </Alert>
        ) : (
          <Card>
            <ReportForm contentId={item.id} backHref={publicHref} />
          </Card>
        )}
      </div>
    </PublicShell>
  );
}
