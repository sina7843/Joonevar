import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { Timeline, type TimelineItem } from '../../src/ui/timeline.tsx';
import { db } from '../../src/db/client.ts';
import { listForActor } from '../../src/notifications/service.ts';
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

  const page = await listForActor(db(), actor, { page: 1, pageSize: 20 });

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
    href: notification.resume.originRoute,
    ctaLabel: 'ادامه',
  }));

  return (
    <PublicShell actor={actor} title="اعلان‌ها" pathname="/notifications" unreadCount={items.filter((i) => i.status.label === 'خوانده‌نشده').length}>
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
