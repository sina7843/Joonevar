import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { PageHeader } from '../../src/ui/section-header.tsx';
import { db } from '../../src/db/client.ts';
import { listForActor, unreadCount } from '../../src/notifications/service.ts';
import { formatCivilDateFa, todayCivil } from '../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/**
 * Notifications (§8) — P05 plain list of DS NotificationItem rows.
 *
 * Real rows from the database for this account only. Each entry opens through
 * the server (`/notifications/[id]`), so it is marked read and the reader lands
 * on the stored resume route of the same case; the target page re-authorizes.
 */
export default async function NotificationsPage() {
  const guard = await guardRoute('/notifications');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const [page, unread] = await Promise.all([
    listForActor(db(), actor, { page: 1, pageSize: 20 }),
    unreadCount(db(), actor),
  ]);

  const dateFa = (at: Date) =>
    formatCivilDateFa(
      [
        at.getUTCFullYear(),
        String(at.getUTCMonth() + 1).padStart(2, '0'),
        String(at.getUTCDate()).padStart(2, '0'),
      ].join('-'),
    );

  return (
    <PublicShell
      actor={actor}
      title="اعلان‌ها"
      pathname="/notifications"
      unreadCount={unread}
      header={
        <PageHeader
          title="اعلان‌ها"
          meta={unread > 0 ? [unread.toLocaleString('fa-IR') + ' خوانده‌نشده'] : undefined}
        />
      }
    >
      {page.items.length === 0 ? (
        <EmptyState
          title={'اعلانی ندارید (تا ' + formatCivilDateFa(todayCivil()) + ')'}
          description="اعلان‌های مربوط به درخواست‌ها، بررسی‌ها و اسناد شما در این بخش نمایش داده می‌شوند و به همان پرونده برمی‌گردند."
          icon="bell"
        />
      ) : (
        <div className="hz-card hz-card--flush">
          <ul className="hz-notifications">
            {page.items.map((notification) => {
              const isUnread = notification.readAt === null;
              return (
                <li key={notification.id}>
                  <Link
                    href={'/notifications/' + notification.id}
                    className={isUnread ? 'hz-notification hz-notification--unread' : 'hz-notification'}
                  >
                    <span className="hz-notification__dot" aria-hidden="true" />
                    <span className="hz-notification__body">
                      <span className="hz-notification__title">
                        <span className="hz-visually-hidden">{isUnread ? 'خوانده‌نشده: ' : 'خوانده‌شده: '}</span>
                        {notification.titleFa}
                      </span>
                      <span className="hz-notification__text">{notification.bodyFa}</span>
                      <time className="hz-notification__time" dateTime={notification.createdAt.toISOString()}>
                        {dateFa(notification.createdAt)}
                      </time>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </PublicShell>
  );
}
