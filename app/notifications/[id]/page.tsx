import { notFound, redirect } from 'next/navigation';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { db } from '../../../src/db/client.ts';
import { openNotification } from '../../../src/notifications/service.ts';
import { AppError } from '../../../src/domain/errors.ts';

export const dynamic = 'force-dynamic';

/**
 * Opening one notification — Phase 2.5 §9 (PROMPT-015).
 *
 * The notifications list used to link straight at the case, so nothing was ever
 * marked read and the unread count never went down. Opening now goes through
 * here: the server checks the recipient, records that it was read, and sends the
 * reader on to the case itself, which runs its own authorization when it loads.
 *
 * Somebody else's notification is not found rather than refused: the address
 * cannot be used to learn that a notification exists.
 */
export default async function OpenNotificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/notifications/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let notification;
  try {
    notification = await openNotification(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN')) notFound();
    throw error;
  }
  redirect(notification.resume.originRoute);
}
