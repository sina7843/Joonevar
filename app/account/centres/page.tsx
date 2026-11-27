import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { PageHeader } from '../../../src/ui/section-header.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { manageableCentres } from '../../../src/centres/service.ts';

export const dynamic = 'force-dynamic';

/** The centres this account manages — Requirements-Phase-2 §9, P2-D07 (PROMPT-008). P05 list. */
export default async function AccountCentresPage() {
  const guard = await guardRoute('/account/centres');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const centres = await manageableCentres(db(), guard.actor);

  return (
    <PublicShell
      actor={guard.actor}
      title="مراکز من"
      pathname="/account/centres"
      header={
        <PageHeader
          title="مراکز من"
          back={{ href: '/dashboard' }}
          meta={[
            ...(centres.length > 0 ? [centres.length.toLocaleString('fa-IR') + ' مرکز'] : []),
            'مدیریت یک مرکز پس از واگذاری یا تأیید Claim به حساب شما سپرده می‌شود. مجوز مرکز را بررسی همزیست ثبت می‌کند، نه مدیر مرکز.',
          ]}
          actions={
            <ButtonLink tone="secondary" href="/account/centres/claims" iconStart="clipboardText">
              درخواست‌های مدیریت مرکز
            </ButtonLink>
          }
        />
      }
    >
      {centres.length === 0 ? (
        <EmptyState
          icon="buildings"
          title="هنوز مرکزی به شما سپرده نشده است"
          description="اگر مدیر یک مرکز هستید، از مسیر Claim مرکز اقدام کنید."
          action={
            <ButtonLink tone="secondary" href="/centers">
              دیدن مراکز در فهرست عمومی
            </ButtonLink>
          }
        />
      ) : (
        <ul className="hz-cardlist" data-testid="my-centres">
          {centres.map((row) => (
            <li key={row.centre.id} className="hz-cardlist__item">
              <div className="hz-cardlist__row">
                <Link
                  href={'/account/centres/' + row.centre.id}
                  className="hz-cardlist__title min-w-0 hover:underline"
                  data-testid={'my-centre-' + row.centre.id}
                >
                  {row.centre.displayNameFa}
                </Link>
                <StatusBadge status={row.centre.publicStatus} />
              </div>
              <div className="hz-cardlist__row">
                <span className="hz-cardlist__meta">{[row.typeNameFa, row.cityNameFa].filter(Boolean).join(' · ') || 'تعیین‌نشده'}</span>
                <ButtonLink tone="secondary" size="sm" href={'/account/centres/' + row.centre.id}>
                  مدیریت مرکز
                  <span className="hz-visually-hidden"> {row.centre.displayNameFa}</span>
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}
