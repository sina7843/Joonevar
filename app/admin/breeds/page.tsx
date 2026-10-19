import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../src/ui/shell.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { Panel } from '../../../src/ui/desk.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { breedRegistry } from '../../../src/operations/service.ts';
import { AddBreedForm, BreedStateForm } from './forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * The breed register — §21.4 (reference lists) — DS P11: an item without a
 * lifecycle, so a plain DataTable (restacked as cards below 768) under the add
 * form.
 *
 * Adding a breed is managed data rather than a deployment. Retiring one keeps
 * every animal already recorded with it exactly as it is; it only stops being
 * offered for new records.
 */
export default async function AdminBreedsPage() {
  const guard = await guardRoute('/admin/breeds');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await breedRegistry(db(), guard.actor);
  const active = rows.filter((row) => row.isActive).length;

  return (
    <OpsShell actor={guard.actor} title="نژادها" pathname="/admin/breeds" nav={ADMIN_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{rows.length.toLocaleString('fa-IR') + ' نژاد در فهرست مرجع'}</span>
        <span className="hz-page-header__meta-item">{active.toLocaleString('fa-IR') + ' فعال در انتخاب‌های فرم'}</span>
      </p>
      <Alert tone="info" title="کنارگذاشتن یک نژاد، پرونده‌های ثبت‌شده را تغییر نمی‌دهد">
        <span data-testid="breeds-note">
          نژاد کنارگذاشته‌شده فقط در انتخاب‌های جدید دیده نمی‌شود؛ حیوان‌هایی که با آن ثبت شده‌اند دست‌نخورده
          می‌مانند و هر تغییر با Actor، زمان و مقدار قبلی ثبت می‌شود.
        </span>
      </Alert>

      <AddBreedForm />

      <Panel title="فهرست مرجع نژادها" count={rows.length.toLocaleString('fa-IR')}>
        {rows.length === 0 ? (
          <EmptyState title="هنوز نژادی ثبت نشده است" description="نخستین نژاد را با فرم بالا به فهرست مرجع اضافه کنید." />
        ) : (
          <div className="hz-table-wrap">
            <table className="hz-table hz-table--dense hz-table--stack">
              <caption className="hz-visually-hidden">فهرست مرجع نژادها</caption>
              <thead>
                <tr>
                  <th scope="col">نژاد</th>
                  <th scope="col">انتخاب در فرم‌ها</th>
                  <th scope="col">صفحه عمومی</th>
                  <th scope="col">کنش</th>
                </tr>
              </thead>
              <tbody data-testid="breed-list">
                {rows.map((row) => (
                  <tr key={row.id} data-testid={'breed-' + row.nameEn}>
                    <td className="hz-table__lead">
                      <div className="hz-case">
                        <Link href={'/admin/breeds/' + row.id} className="hz-case__name" data-testid={'edit-breed-' + row.nameEn}>
                          {row.nameFa}
                          <span className="hz-visually-hidden"> — ویرایش پرونده نژاد</span>
                        </Link>
                        <bdi className="hz-case__sub" dir="ltr">
                          {row.nameEn}
                        </bdi>
                      </div>
                    </td>
                    <td data-label="انتخاب در فرم‌ها">
                      <span data-testid={'breed-state-' + row.nameEn} data-status={row.isActive ? 'ACTIVE' : 'INACTIVE'}>
                        <StatusBadge status={row.isActive ? 'ACTIVE' : 'INACTIVE'} size="sm" />
                      </span>
                    </td>
                    <td data-label="صفحه عمومی">
                      {/* Two independent axes: offered in forms, and whether a public page exists (DEC-0155). */}
                      <span className="flex flex-wrap gap-xs">
                        <span data-testid={'breed-profile-' + row.nameEn} data-status={row.profileStatus}>
                          <StatusBadge status={row.profileStatus} size="sm" />
                        </span>
                        {row.mergedIntoBreedId ? <span className="hz-tag hz-tag--neutral">تکراری</span> : null}
                      </span>
                    </td>
                    <td data-label="کنش">
                      <BreedStateForm breedId={row.id} active={row.isActive} suffix={row.nameEn} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </OpsShell>
  );
}
