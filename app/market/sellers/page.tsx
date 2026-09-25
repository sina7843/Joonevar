import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { sellerDetail, sellerReviewQueue } from '../../../src/commerce/sellers.ts';
import {
  IBAN_NOTE_FA,
  SELLER_KIND_FA,
  SELLER_STATUS_FA,
  type SellerKind,
  type SellerStatus,
} from '../../../src/commerce/seller-model.ts';
import {
  SellerDecisionForm,
  SellerStandingForm,
  VerifyIbanForm,
} from '../../../src/marketplace/settlement-forms.tsx';

export const dynamic = 'force-dynamic';

const when = (value: Date | null) =>
  value === null ? '—' : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

/**
 * Seller applications — PROMPT-008.
 *
 * The reviewer reads the business papers from here, and every one of those
 * reads is recorded: they are somebody's licence, identity and bank documents,
 * not pictures of products. Approving does not open a store; a plan period
 * does, and that needs a payment this server verified.
 */
export default async function SellerReviewPage() {
  const guard = await guardRoute('/market/sellers');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let queue;
  try {
    queue = await sellerReviewQueue(db(), guard.actor);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }

  const details = await Promise.all(queue.map((entry) => sellerDetail(db(), guard.actor, entry.id)));

  return (
    <OpsShell actor={guard.actor} title="پرونده‌های فروشنده کالا" nav={marketNav(guard.actor)} pathname="/market/sellers">
      <div className="space-y-lg">
        <Alert tone="info" title="مدارک کسب‌وکار خصوصی‌اند و هر بازکردنشان ثبت می‌شود">
          <span data-testid="seller-review-note">
            {IBAN_NOTE_FA} تأیید پرونده به‌تنهایی فروشگاه را فعال نمی‌کند؛ فعال‌شدن نتیجه آغاز دوره پلن
            است و دوره پلن فقط با پرداخت تأییدشده روی سرور آغاز می‌شود.
          </span>
        </Alert>

        {queue.length === 0 ? (
          <div data-testid="seller-queue-empty">
            <EmptyState
              title="پرونده‌ای در انتظار بررسی نیست"
              description="هر پرونده فروشندگی که ارسال شود، اینجا برای بررسی می‌آید."
            />
          </div>
        ) : (
          <ul className="space-y-lg" data-testid="seller-queue">
            {queue.map((entry, index) => {
              const detail = details[index]!;
              const status = entry.status as SellerStatus;
              return (
                <li key={entry.id} data-testid={'seller-row-' + entry.id}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-sm">
                      <StatusBadge tone={status === 'APPROVED' ? 'success' : 'neutral'}>
                        <span data-testid={'seller-status-' + entry.id}>{SELLER_STATUS_FA[status]}</span>
                      </StatusBadge>
                      <span className="text-label-lg">{entry.displayNameFa}</span>
                      <span className="text-caption text-text-secondary">
                        {SELLER_KIND_FA[entry.kind as SellerKind]}
                      </span>
                      <span className="text-caption text-text-secondary">{entry.legalNameFa ?? '—'}</span>
                      <span className="text-caption text-text-secondary">ارسال: {when(entry.submittedAt)}</span>
                    </div>

                    <dl className="mt-lg grid gap-sm text-body-sm md:grid-cols-2">
                      <div>
                        <dt className="text-caption text-text-secondary">شناسه ملی</dt>
                        <dd>
                          <bdi className="hz-ltr font-mono">{detail.seller.nationalIdentifier ?? '—'}</bdi>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-text-secondary">حساب تسویه</dt>
                        <dd data-testid={'seller-iban-' + entry.id}>
                          <bdi className="hz-ltr font-mono">{detail.maskedIban ?? '—'}</bdi>
                          {entry.ibanVerifiedAt ? ' — تأییدشده' : ' — تأیید نشده'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-text-secondary">مجوز اعلام‌شده</dt>
                        <dd>{detail.seller.licenceKindFa ?? 'اعلام نشده'}</dd>
                      </div>
                      <div>
                        <dt className="text-caption text-text-secondary">نشانی</dt>
                        <dd>{detail.placeFa ?? '—'}</dd>
                      </div>
                    </dl>

                    {detail.documents.length > 0 ? (
                      <ul className="mt-lg space-y-2xs text-caption" data-testid={'seller-docs-' + entry.id}>
                        {detail.documents.map((document) => (
                          <li key={document.id}>
                            <Link href={'/api/files/' + document.fileId} className="text-text-brand">
                              {document.kind}
                            </Link>
                            {document.noteFa ? ' — ' + document.noteFa : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-lg text-caption text-text-secondary">مدرکی بارگذاری نشده است.</p>
                    )}

                    <VerifyIbanForm sellerId={entry.id} />
                    <SellerDecisionForm sellerId={entry.id} version={entry.version} />
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
