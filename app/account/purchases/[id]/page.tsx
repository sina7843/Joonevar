import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { AppError } from '../../../../src/domain/errors.ts';
import { inquiryThread } from '../../../../src/marketplace/inquiries.ts';
import {
  CONTACT_BLOCKED_FA,
  INQUIRY_STATUS_FA,
  OFFER_STATUS_FA,
  canRespondToOffer,
  type InquiryStatus,
  type OfferParty,
  type OfferStatus,
} from '../../../../src/marketplace/inquiry-model.ts';
import { DELIVERY_METHOD_FA, type DeliveryMethod } from '../../../../src/marketplace/listing-model.ts';
import {
  AcceptInquiryForm,
  BlockThreadForm,
  CloseInquiryForm,
  HandoverAnswerForm,
  HandoverForm,
  MessageForm,
  OfferAnswerForm,
  OfferForm,
  PayDepositForm,
  ReportMessageForm,
} from '../forms.tsx';

export const dynamic = 'force-dynamic';

const dateTimeFa = (value: Date | null) =>
  value === null
    ? '—'
    : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

const moneyFa = (value: bigint | null) => (value === null ? '—' : value.toLocaleString('fa-IR'));

/**
 * One deal thread — PROMPT-005.
 *
 * Both sides read the same page from their own side of it. What changes is not
 * the layout but what the server put in the view: the counterpart's telephone
 * number is in it only after a verified deposit, so no screen and no URL can
 * produce it earlier.
 */
export default async function InquiryThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await guardRoute('/account/purchases');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { id } = await params;

  let thread;
  try {
    thread = await inquiryThread(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError) return <RecordNotFound error={error} />;
    throw error;
  }

  const { inquiry, role, liveOffer, liveHandover } = thread;
  const status = inquiry.status as InquiryStatus;
  const party = role === 'MODERATOR' ? null : (role as OfferParty);
  const priceLocked = inquiry.finalPriceLockedAt !== null;
  const awaitingDeposit = status === 'ACCEPTED';
  const reportable = thread.messages.filter((message) => !message.mine && message.kind !== 'OFFER');

  return (
    <PublicShell actor={guard.actor} title="گفت‌وگوی خرید" pathname="/account/purchases">
      <div className="space-y-lg p-lg">
        <p className="text-caption">
          <Link href="/account/purchases" className="text-text-brand" data-testid="back-to-purchases">
            بازگشت به درخواست‌های خرید
          </Link>
        </p>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-sm">
            <h2 className="text-label-lg">{thread.listingTitleFa}</h2>
            <StatusBadge tone={status === 'CONVERTED' ? 'success' : 'neutral'}>
              <span data-testid="inquiry-status">{INQUIRY_STATUS_FA[status]}</span>
            </StatusBadge>
          </div>
          <dl className="mt-lg grid gap-sm text-body-sm md:grid-cols-2" data-testid="inquiry-facts">
            <div>
              <dt className="text-caption text-text-secondary">قیمت نهایی</dt>
              <dd data-testid="final-price">{moneyFa(inquiry.finalPriceToman)} تومان</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">بیعانه (برابر کارمزد)</dt>
              <dd data-testid="deposit-amount">{moneyFa(inquiry.depositAmountToman)} تومان</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">مهلت پرداخت بیعانه</dt>
              <dd data-testid="payment-deadline">{dateTimeFa(inquiry.paymentDeadlineAt)}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">نسخه سیاست لغو و استرداد</dt>
              <dd>
                <bdi className="hz-ltr">{inquiry.cancellationPolicyVersion ?? '—'}</bdi>
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">اطلاعات تماس طرف مقابل</dt>
              <dd data-testid="counterpart-contact">
                {thread.counterpartMobile === null ? (
                  'پس از تأیید بیعانه نمایش داده می‌شود'
                ) : (
                  <bdi className="hz-ltr font-mono">{thread.counterpartMobile}</bdi>
                )}
              </dd>
            </div>
          </dl>
          {inquiry.closedReasonFa ? (
            <p className="mt-sm text-caption text-text-secondary" data-testid="inquiry-closed-reason">
              {inquiry.closedReasonFa}
            </p>
          ) : null}
        </Card>

        {thread.blockedByFa ? (
          <div data-testid="thread-blocked">
            <Alert tone="warning" title="این گفت‌وگو بسته شده است">
              {thread.blockedByFa} آنچه گفته شده حذف نمی‌شود و برای بررسی گزارش‌ها در دسترس ناظر است.
            </Alert>
          </div>
        ) : null}

        {/* The price ladder. Immutable rows: a counteroffer supersedes, never edits. */}
        <Card>
          <h2 className="text-label-lg">قیمت</h2>
          {priceLocked ? (
            <p className="mt-sm text-body-sm" data-testid="price-locked">
              قیمت نهایی قفل شده است و تغییر نمی‌کند: {moneyFa(inquiry.finalPriceToman)} تومان.
            </p>
          ) : (
            <>
              {liveOffer ? (
                <p className="mt-sm text-body-sm" data-testid="live-offer">
                  {OFFER_STATUS_FA[liveOffer.status as OfferStatus]}: {moneyFa(liveOffer.amountToman)} تومان (
                  {liveOffer.party === 'BUYER' ? 'خریدار' : 'فروشنده'})
                </p>
              ) : (
                <p className="mt-sm text-caption text-text-secondary">هنوز پیشنهادی ثبت نشده است.</p>
              )}
              {thread.writable && party !== null ? (
                <div className="mt-lg space-y-lg">
                  {liveOffer !== null && canRespondToOffer(liveOffer.party as OfferParty, party) ? (
                    <OfferAnswerForm inquiryId={inquiry.id} offerId={liveOffer.id} />
                  ) : null}
                  <OfferForm inquiryId={inquiry.id} />
                </div>
              ) : null}
            </>
          )}
        </Card>

        {/* Acceptance, the deposit, and the two ordinary ways this ends. */}
        {party !== null ? (
          <Card>
            <h2 className="text-label-lg">وضعیت معامله</h2>
            {status !== 'OPEN' && status !== 'ACCEPTED' ? (
              <p className="mt-sm text-body-sm" data-testid="deal-state-note">
                {status === 'CONVERTED'
                  ? 'بیعانه تأیید شده و این حیوان رزرو است؛ تسویه باقی مبلغ بیرون از همزیست انجام می‌شود.'
                  : 'این درخواست بسته شده است و اقدام تازه‌ای روی آن باقی نمانده.'}
              </p>
            ) : null}
            <div className="mt-lg space-y-lg">
              {role === 'SELLER' && status === 'OPEN' && priceLocked ? (
                <AcceptInquiryForm
                  inquiryId={inquiry.id}
                  listingId={inquiry.listingId}
                  version={inquiry.version}
                />
              ) : null}
              {role === 'SELLER' && status === 'OPEN' && !priceLocked ? (
                <Alert tone="info" title="تا قفل‌شدن قیمت نهایی، پذیرش باز نمی‌شود">
                  ابتدا یکی از پیشنهادهای قیمت پذیرفته شود؛ کارمزد و بیعانه از همان قیمت محاسبه می‌شود.
                </Alert>
              ) : null}
              {role === 'BUYER' && awaitingDeposit ? (
                <PayDepositForm
                  inquiryId={inquiry.id}
                  amountFa={moneyFa(inquiry.depositAmountToman)}
                />
              ) : null}
              {role === 'SELLER' && (status === 'OPEN' || status === 'ACCEPTED') ? (
                <CloseInquiryForm
                  inquiryId={inquiry.id}
                  listingId={inquiry.listingId}
                  version={inquiry.version}
                  to="DECLINED"
                  label="رد این درخواست"
                />
              ) : null}
              {role === 'BUYER' && (status === 'OPEN' || status === 'ACCEPTED') ? (
                <CloseInquiryForm
                  inquiryId={inquiry.id}
                  listingId={inquiry.listingId}
                  version={inquiry.version}
                  to="WITHDRAWN"
                  label="پس‌گرفتن درخواست"
                />
              ) : null}
            </div>
          </Card>
        ) : null}

        {/* The transcript. Append-only; a redaction is recorded beside the text. */}
        <Card>
          <h2 className="text-label-lg">گفت‌وگو</h2>
          <p className="mt-2xs text-caption text-text-secondary">{CONTACT_BLOCKED_FA}</p>
          <ul className="mt-lg space-y-md" data-testid="thread-messages">
            {thread.messages.map((message) => (
              <li key={message.id} className="rounded-md border border-border-subtle p-md" data-testid={'message-' + message.id}>
                <p className="text-caption text-text-secondary">
                  {message.mine ? 'شما' : 'طرف مقابل'}
                  <span className="mx-sm text-text-disabled">|</span>
                  {dateTimeFa(message.createdAt)}
                </p>
                {message.hiddenReasonFa ? (
                  <p className="mt-2xs text-body-sm text-text-secondary" data-testid="message-hidden">
                    این پیام با تصمیم ناظر نمایش داده نمی‌شود: {message.hiddenReasonFa}
                  </p>
                ) : (
                  <>
                    {message.bodyFa ? <p className="mt-2xs text-body-sm">{message.bodyFa}</p> : null}
                    {message.offerAmountToman !== null ? (
                      <p className="mt-2xs text-body-sm" data-testid="message-offer">
                        پیشنهاد قیمت: {moneyFa(message.offerAmountToman)} تومان
                      </p>
                    ) : null}
                    {message.fileId ? (
                      <p className="mt-2xs text-caption">
                        <Link href={'/api/files/' + message.fileId} className="text-text-brand">
                          مشاهده پیوست
                        </Link>
                      </p>
                    ) : null}
                    {message.redactedNoteFa ? (
                      <p className="mt-2xs text-caption text-text-secondary" data-testid="message-redacted">
                        {message.redactedNoteFa}
                      </p>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
          {thread.writable ? (
            <div className="mt-lg">
              <MessageForm inquiryId={inquiry.id} />
            </div>
          ) : null}
        </Card>

        {/* Where and when the animal changes hands. */}
        {party !== null ? (
          <Card>
            <h2 className="text-label-lg">زمان و محل تحویل</h2>
            {liveHandover ? (
              <p className="mt-sm text-body-sm" data-testid="live-handover">
                {DELIVERY_METHOD_FA[liveHandover.method as DeliveryMethod]}
                <span className="mx-sm text-text-disabled">|</span>
                {dateTimeFa(liveHandover.proposedAt)}
                {liveHandover.placeFa ? ' — ' + liveHandover.placeFa : ''}
              </p>
            ) : (
              <p className="mt-sm text-caption text-text-secondary">هنوز زمانی پیشنهاد نشده است.</p>
            )}
            <div className="mt-lg space-y-lg">
              {liveHandover && liveHandover.proposedByAccountId !== guard.actor.accountId ? (
                <HandoverAnswerForm inquiryId={inquiry.id} proposalId={liveHandover.id} />
              ) : null}
              {thread.writable || status === 'CONVERTED' ? <HandoverForm inquiryId={inquiry.id} /> : null}
            </div>
          </Card>
        ) : null}

        {/* Reporting and blocking: both keep the transcript intact. */}
        {party !== null ? (
          <Card>
            <h2 className="text-label-lg">گزارش و بستن گفت‌وگو</h2>
            <div className="mt-lg space-y-lg">
              <ReportMessageForm
                inquiryId={inquiry.id}
                messages={reportable.map((message) => ({
                  id: message.id,
                  label: dateTimeFa(message.createdAt) + ' — ' + (message.bodyFa ?? 'پیوست'),
                }))}
              />
              {thread.blockedByFa === null ? <BlockThreadForm inquiryId={inquiry.id} /> : null}
            </div>
          </Card>
        ) : null}
      </div>
    </PublicShell>
  );
}
