import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, DocFrame, QueueMeta } from '../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { KeyValueList } from '../../../src/ui/key-value.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { sellerDetail, sellerReviewQueue } from '../../../src/commerce/sellers.ts';
import {
  IBAN_NOTE_FA,
  SELLER_KIND_FA,
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
      <QueueMeta
        total={queue.length}
        noun="پرونده در صف"
        oldestDays={queue.length > 0 ? Math.max(...queue.map((entry) => ageInDays(entry.submittedAt) ?? 0)) : null}
      />
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
        <CaseList label="پرونده‌های فروشنده" testId="seller-queue">
          {queue.map((entry, index) => {
            const detail = details[index]!;
            const status = entry.status as SellerStatus;
            return (
              <CaseItem
                key={entry.id}
                testId={'seller-row-' + entry.id}
                type={SELLER_KIND_FA[entry.kind as SellerKind]}
                name={entry.displayNameFa}
                sub={(entry.legalNameFa ?? '—') + ' · ارسال: ' + when(entry.submittedAt)}
                ageDays={ageInDays(entry.submittedAt)}
                status={{ ...keyStatus(status), testId: 'seller-status-' + entry.id }}
                owner="SYSTEM"
                ownerLabel="بررسی فروشندگان"
                ownerIsUs
              >
                <div className="space-y-md">
                  <KeyValueList
                    twoCol
                    rows={[
                      {
                        key: 'شناسه ملی',
                        value: detail.seller.nationalIdentifier ? (
                          <bdi className="hz-id" dir="ltr">
                            {detail.seller.nationalIdentifier}
                          </bdi>
                        ) : null,
                      },
                      {
                        key: 'حساب تسویه',
                        testId: 'seller-iban-' + entry.id,
                        value: (
                          <>
                            <bdi className="hz-id" dir="ltr">
                              {detail.maskedIban ?? '—'}
                            </bdi>
                            {entry.ibanVerifiedAt ? ' — تأییدشده' : ' — تأیید نشده'}
                          </>
                        ),
                      },
                      { key: 'مجوز اعلام‌شده', value: detail.seller.licenceKindFa ?? 'اعلام نشده' },
                      { key: 'نشانی', value: detail.placeFa },
                    ]}
                  />

                  <div className="space-y-sm">
                    {detail.documents.length > 0 ? (
                      <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3" data-testid={'seller-docs-' + entry.id}>
                        {detail.documents.map((document) => (
                          <DocFrame
                            key={document.id}
                            href={'/api/files/' + document.fileId}
                            label={document.kind}
                            linkLabel={'مشاهده ' + document.kind}
                            meta={document.noteFa ?? undefined}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-caption text-text-secondary">مدرکی بارگذاری نشده است.</p>
                    )}
                  </div>

                  <VerifyIbanForm sellerId={entry.id} />
                  <SellerDecisionForm sellerId={entry.id} version={entry.version} />
                </div>
              </CaseItem>
            );
          })}
        </CaseList>
      )}
    </OpsShell>
  );
}
