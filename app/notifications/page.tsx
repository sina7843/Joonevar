import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { Timeline, type TimelineItem } from '../../src/ui/timeline.tsx';
import { db } from '../../src/db/client.ts';
import { listForActor, unreadCount } from '../../src/notifications/service.ts';
import { formatCivilDateFa, todayCivil } from '../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/**
 * Notifications (§8).
 *
 * Real rows from the database for this account only. Each entry links to the
 * stored resume route, so opening it returns to the same case and step rather
 * than to a general list; the target page re-authorizes on the server.
 */
export default async function NotificationsPage() {
  const guard = await guardRoute('/notifications');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const [page, unread] = await Promise.all([listForActor(db(), actor, { page: 1, pageSize: 20 }), unreadCount(db(), actor)]);

  const items: readonly TimelineItem[] = page.items.map((notification) => ({
    id: notification.id,
    title: notification.titleFa,
    whenFa: formatCivilDateFa(
      [
        notification.createdAt.getUTCFullYear(),
        String(notification.createdAt.getUTCMonth() + 1).padStart(2, '0'),
        String(notification.createdAt.getUTCDate()).padStart(2, '0'),
      ].join('-'),
    ),
    status: notification.readAt === null ? { tone: 'info' as const, label: 'خوانده‌نشده' } : { tone: 'neutral' as const, label: 'خوانده‌شده' },
    owner: 'USER' as const,
    summary: notification.bodyFa,
    // Opening goes through the server so the notification is marked read and the
    // unread count actually falls; it redirects on to the case itself.
    href: '/notifications/' + notification.id,
    ctaLabel: 'ادامه',
  }));

  return (
    <PublicShell actor={actor} title="اعلان‌ها" pathname="/notifications" unreadCount={unread}>
      {items.length === 0 ? (
        <EmptyState
          title={'اعلانی ندارید (تا ' + formatCivilDateFa(todayCivil()) + ')'}
          description="اعلان‌های مربوط به درخواست‌ها، بررسی‌ها و اسناد شما در این بخش نمایش داده می‌شوند و به همان پرونده برمی‌گردند."
        />
      ) : (
        <Timeline items={items} />
      )}
    </PublicShell>
  );
}
