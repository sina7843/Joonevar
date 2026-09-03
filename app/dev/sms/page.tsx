import { notFound } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { env } from '../../../src/config/env.ts';
import { db } from '../../../src/db/client.ts';
import { devOutboundSms } from '../../../src/db/schema/identity.ts';
import { Card } from '../../../src/ui/card.tsx';
import { Logo } from '../../../src/ui/logo.tsx';
import { Alert } from '../../../src/ui/alert.tsx';

export const dynamic = 'force-dynamic';

/**
 * Development SMS outbox.
 *
 * The mock sender writes every message here instead of reaching a phone, and
 * this page is how a developer reads the one-time code back. The code itself is
 * unchanged: still random, still single-use, still expiring, still counted
 * against the send and attempt limits.
 *
 * Outside development with local integrations this page does not exist, exactly
 * like the development gateway page.
 */
export default async function DevSmsPage() {
  const current = env();
  if (current.APP_ENV === 'production' || current.INTEGRATION_MODE !== 'local') notFound();

  const rows = await db()
    .select()
    .from(devOutboundSms)
    .orderBy(desc(devOutboundSms.createdAt))
    .limit(30);

  return (
    <main className="mx-auto max-w-lg space-y-lg p-lg">
      <div className="flex flex-col items-center gap-md">
        <Logo height={28} />
        <h1 className="text-h4">صندوق پیامک توسعه</h1>
      </div>

      <Alert tone="warning" title="این صفحه فقط در محیط توسعه وجود دارد">
        در حالت شبیه‌سازی، پیامک به شماره واقعی فرستاده نمی‌شود و متن آن اینجا ثبت می‌شود. کد همچنان واقعی،
        یک‌بارمصرف و دارای انقضاست و سقف ارسال و تعداد تلاش سر جای خودش است.
      </Alert>

      {rows.length === 0 ? (
        <Card>
          <p className="text-body-sm text-text-secondary">هنوز پیامکی ثبت نشده است.</p>
        </Card>
      ) : (
        <ul className="space-y-md" data-testid="dev-sms-list">
          {rows.map((row) => (
            <li key={row.id}>
              <Card>
                <div className="flex flex-row items-baseline justify-between gap-md">
                  <bdi className="hz-ltr font-mono text-label-md">{row.toMobile}</bdi>
                  <span className="text-caption text-text-secondary">
                    {row.createdAt.toLocaleString('fa-IR')}
                  </span>
                </div>
                <p className="mt-sm text-body-sm" data-testid="dev-sms-body">
                  {row.body}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
