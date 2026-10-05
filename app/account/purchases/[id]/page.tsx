import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../src/ui/page-crumbs.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { ActionOwner, StatusBadge, type ActionOwnerKind } from '../../../../src/ui/status.tsx';
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
import { cancellationOfDeal } from '../../../../src/marketplace/cancellations.ts';
import { refundOfDeal } from '../../../../src/marketplace/refunds.ts';
import { disputeOfDeal } from '../../../../src/marketplace/disputes.ts';
import { handoverLocations, handoverView, offeredDeliveryMethods } from '../../../../src/marketplace/handover.ts';
import { HANDOVER_STATUS_FA, type HandoverStatus } from '../../../../src/marketplace/handover-model.ts';
import {
  CANCELLATION_OUTCOME_FA,
  CANCELLATION_REASON_FA,
  DISPUTE_DECISION_FA,
  DISPUTE_SCOPE_FA,
  DISPUTE_STATUS_FA,
  REFUND_STATUS_FA,
  type CancellationOutcome,
  type CancellationReason,
  type DisputeDecision,
  type DisputeScope,
} from '../../../../src/marketplace/cancellation-model.ts';
import {
  AcceptInquiryForm,
  ConfirmHandoverForm,
  EndHandoverForm,
  EnterHandoverCodeForm,
  IssueHandoverCodeForm,
  ScheduleHandoverForm,
  CancelDealForm,
  DisputeEvidenceForm,
  OpenDisputeForm,
  WithdrawDisputeForm,
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

const dayFa = (value: Date) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(value);
const timeFa = (value: Date) => new Intl.DateTimeFormat('fa-IR', { timeStyle: 'short' }).format(value);

const moneyFa = (value: bigint | null) => (value === null ? '—' : value.toLocaleString('fa-IR'));
/** A money line: «تعیین‌نشده» when the server has no number yet, never «۰». */
const tomanFa = (value: bigint | null) => (value === null ? 'تعیین‌نشده' : value.toLocaleString('fa-IR') + ' تومان');

/**
 * One deal thread — PROMPT-005. K17 (P12 conversation): the advert strip, the
 * thread with its composer in the main column, and the deal itself — status,
 * the one next move, price, handover, cancellation and arbitration — in the
 * side column (P06 status card). Below 1024 the status card comes first, then
 * the thread, then the rest of the deal.
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
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();

  let thread;
  try {
    thread = await inquiryThread(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError) return <RecordNotFound error={error} />;
    throw error;
  }

  const { inquiry, role, liveOffer, liveHandover } = thread;
  // What happened after the deposit, if anything did (PROMPT-006).
  const [cancellation, refund, dispute, handover, offeredMethods] = await Promise.all([
    cancellationOfDeal(db(), inquiry.id),
    refundOfDeal(db(), inquiry.id),
    disputeOfDeal(db(), inquiry.id),
    handoverView(db(), inquiry),
    offeredDeliveryMethods(db(), inquiry.listingId),
  ]);
  // Only fetched when a place actually has to be chosen.
  const vetLocationOptions = offeredMethods.includes('VET_CLINIC') ? await handoverLocations(db()) : [];
  const statementPreview = handover?.statementPreviewFa ?? '';
  const handoverStatus = (handover?.handover.status ?? null) as HandoverStatus | null;
  const status = inquiry.status as InquiryStatus;
  const party = role === 'MODERATOR' ? null : (role as OfferParty);
  const priceLocked = inquiry.finalPriceLockedAt !== null;
  const awaitingDeposit = status === 'ACCEPTED';
  const reportable = thread.messages.filter((message) => !message.mine && message.kind !== 'OFFER');
  const roleFa = role === 'BUYER' ? 'شما خریدار هستید' : role === 'SELLER' ? 'شما فروشنده هستید' : 'نمای ناظر';

  // Whose move the deal is, read only from the server's status (no new rule).
  const owner: ActionOwnerKind | null =
    party === null
      ? null
      : status === 'OPEN'
        ? role === 'SELLER' && priceLocked
          ? 'USER'
          : liveOffer !== null && canRespondToOffer(liveOffer.party as OfferParty, party)
            ? 'USER'
            : 'COUNTERPARTY'
        : status === 'ACCEPTED'
          ? role === 'BUYER'
            ? 'USER'
            : 'COUNTERPARTY'
          : null;

  // Day separators for the transcript (Jalali), oldest first as the server sends them.
  let lastDay = '';

  return (
    <PublicShell
      actor={guard.actor}
      title="گفت‌وگوی خرید"
      pathname="/account/purchases"
      header={
        <div>
          <PageCrumbs items={[{ href: '/dashboard', name: 'خانه' }, { href: '/account/purchases', name: 'درخواست‌های خرید' }, { name: thread.listingTitleFa }]} />
          <PageHeader
            title="گفت‌وگوی خرید"
            back={{ href: '/account/purchases', label: 'درخواست‌های خرید' }}
            meta={[thread.listingTitleFa, roleFa]}
            actions={
              <Link href="/account/purchases" className="hz-link hz-link--standalone hz-show-md" data-testid="back-to-purchases">
                بازگشت به درخواست‌های خرید
                <Icon name="arrowRight" size="xs" mirror />
              </Link>
            }
          />
        </div>
      }
    >
      <div className="grid items-start gap-xl lg:grid-cols-12 lg:grid-rows-[auto_1fr]">
        {/* Status card: first on phones, top of the side column on desktop. */}
        <aside aria-label="وضعیت و اقدام" className="min-w-0 space-y-lg lg:col-span-4 lg:col-start-9 lg:row-start-1">
          <Card variant="compact">
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <SectionHeader size="sm" title={thread.listingTitleFa} />
              <StatusBadge tone={status === 'CONVERTED' ? 'success' : 'neutral'}>
                <span data-testid="inquiry-status">{INQUIRY_STATUS_FA[status]}</span>
              </StatusBadge>
            </div>
            <div className="mt-sm" data-testid="inquiry-facts">
              <KeyValueList
                rows={[
                  { key: 'قیمت نهایی', value: tomanFa(inquiry.finalPriceToman), testId: 'final-price' },
                  { key: 'بیعانه (برابر کارمزد)', value: tomanFa(inquiry.depositAmountToman), testId: 'deposit-amount' },
                  { key: 'مهلت پرداخت بیعانه', value: dateTimeFa(inquiry.paymentDeadlineAt), testId: 'payment-deadline' },
                  {
                    key: 'نسخه سیاست لغو و استرداد',
                    value: inquiry.cancellationPolicyVersion ? <bdi dir="ltr">{inquiry.cancellationPolicyVersion}</bdi> : null,
                  },
                  {
                    key: 'اطلاعات تماس طرف مقابل',
                    value:
                      thread.counterpartMobile === null ? (
                        'پس از تأیید بیعانه نمایش داده می‌شود'
                      ) : (
                        <bdi className="hz-id" dir="ltr">
                          {thread.counterpartMobile}
                        </bdi>
                      ),
                    testId: 'counterpart-contact',
                  },
                ]}
              />
            </div>
            {inquiry.closedReasonFa ? (
              <p className="mt-sm text-caption text-text-secondary" data-testid="inquiry-closed-reason">
                {inquiry.closedReasonFa}
              </p>
            ) : null}

            {/* Acceptance, the deposit, and the two ordinary ways this ends. */}
            {party !== null ? (
              <div className="mt-md space-y-md">
                {owner ? (
                  <ActionOwner
                    owner={owner}
                    extra={awaitingDeposit && inquiry.paymentDeadlineAt ? 'مهلت: ' + dateTimeFa(inquiry.paymentDeadlineAt) : undefined}
                  />
                ) : null}
                {status !== 'OPEN' && status !== 'ACCEPTED' ? (
                  <p className="text-body-sm" data-testid="deal-state-note">
                    {status === 'CONVERTED'
                      ? 'بیعانه تأیید شده و این حیوان رزرو است؛ تسویه باقی مبلغ بیرون از همزیست انجام می‌شود.'
                      : status === 'COMPLETED'
                        ? 'تحویل ثبت و مالکیت منتقل شد. صورت‌جلسه در همین صفحه و انتقال در پرونده حیوان باقی می‌ماند.'
                        : 'این درخواست بسته شده است و اقدام تازه‌ای روی آن باقی نمانده.'}
                  </p>
                ) : null}
                {role === 'SELLER' && status === 'OPEN' && priceLocked ? (
                  <AcceptInquiryForm inquiryId={inquiry.id} listingId={inquiry.listingId} version={inquiry.version} />
                ) : null}
                {role === 'SELLER' && status === 'OPEN' && !priceLocked ? (
                  <Alert tone="info" title="تا قفل‌شدن قیمت نهایی، پذیرش باز نمی‌شود">
                    ابتدا یکی از پیشنهادهای قیمت پذیرفته شود؛ کارمزد و بیعانه از همان قیمت محاسبه می‌شود.
                  </Alert>
                ) : null}
                {role === 'BUYER' && awaitingDeposit ? (
                  <PayDepositForm inquiryId={inquiry.id} amountFa={moneyFa(inquiry.depositAmountToman)} />
                ) : null}
                {role === 'SELLER' && (status === 'OPEN' || status === 'ACCEPTED') ? (
                  <CloseInquiryForm inquiryId={inquiry.id} listingId={inquiry.listingId} version={inquiry.version} to="DECLINED" label="رد این درخواست" />
                ) : null}
                {role === 'BUYER' && (status === 'OPEN' || status === 'ACCEPTED') ? (
                  <CloseInquiryForm inquiryId={inquiry.id} listingId={inquiry.listingId} version={inquiry.version} to="WITHDRAWN" label="پس‌گرفتن درخواست" />
                ) : null}
              </div>
            ) : null}
          </Card>
        </aside>

        {/* The transcript. Append-only; a redaction is recorded beside the text. */}
        <section
          aria-labelledby="thread-title"
          className="hz-card hz-card--flush min-w-0 overflow-hidden lg:col-span-8 lg:col-start-1 lg:row-span-2 lg:row-start-1"
        >
          <div className="flex flex-wrap items-center justify-between gap-sm border-b border-border-default bg-bg-subtle p-lg">
            <div className="min-w-0">
              <h2 id="thread-title" className="hz-card__title">
                گفت‌وگو
              </h2>
              <p className="text-caption text-text-secondary">{(role === 'BUYER' ? 'با فروشنده' : 'با خریدار') + ' · درباره ' + thread.listingTitleFa}</p>
            </div>
            {owner ? <ActionOwner owner={owner} /> : null}
          </div>

          {thread.blockedByFa ? (
            <div className="px-lg pt-lg" data-testid="thread-blocked">
              <Alert tone="warning" title="این گفت‌وگو بسته شده است">
                {thread.blockedByFa} آنچه گفته شده حذف نمی‌شود و برای بررسی گزارش‌ها در دسترس ناظر است.
              </Alert>
            </div>
          ) : null}

          <div className="hz-thread p-lg">
            <div className="hz-msg hz-msg--system">
              <span className="hz-msg__system">
                <Icon name="info" size="xs" />
                {CONTACT_BLOCKED_FA}
              </span>
            </div>
            <ul className="hz-thread" data-testid="thread-messages">
              {thread.messages.length === 0 ? (
                <li className="hz-msg hz-msg--system">
                  <span className="hz-msg__system">هنوز پیامی نیست. اولین پیام را بنویسید.</span>
                </li>
              ) : null}
              {thread.messages.map((message) => {
                const day = dayFa(message.createdAt);
                const newDay = day !== lastDay;
                lastDay = day;
                return [
                  newDay ? (
                    <li key={message.id + '-day'} className="hz-thread__day" aria-hidden="true">
                      {day}
                    </li>
                  ) : null,
                  <li key={message.id} className={message.mine ? 'hz-msg hz-msg--mine' : 'hz-msg'} data-testid={'message-' + message.id}>
                    <span className="hz-msg__sender">{message.mine ? 'شما' : 'طرف مقابل'}</span>
                    {message.hiddenReasonFa ? (
                      <div className="hz-msg__bubble">
                        <p className="hz-msg__text text-text-secondary" data-testid="message-hidden">
                          این پیام با تصمیم ناظر نمایش داده نمی‌شود: {message.hiddenReasonFa}
                        </p>
                      </div>
                    ) : message.offerAmountToman !== null ? (
                      <div className="hz-offer hz-msg__card">
                        <div className="hz-offer__head">
                          <Icon name="tag" size="sm" />
                          <span className="hz-offer__label">پیشنهاد قیمت</span>
                        </div>
                        <p className="hz-offer__amount" data-testid="message-offer">
                          پیشنهاد قیمت: {moneyFa(message.offerAmountToman)} تومان
                        </p>
                        {message.bodyFa ? <p className="hz-msg__text">{message.bodyFa}</p> : null}
                        <div className="hz-msg__meta">
                          <time dateTime={message.createdAt.toISOString()}>{timeFa(message.createdAt)}</time>
                        </div>
                      </div>
                    ) : (
                      <div className="hz-msg__bubble">
                        {message.bodyFa ? <p className="hz-msg__text">{message.bodyFa}</p> : null}
                        {message.fileId ? (
                          <Link href={'/api/files/' + message.fileId} className="hz-link inline-flex items-center gap-xs">
                            <Icon name="paperclip" size="sm" />
                            مشاهده پیوست
                          </Link>
                        ) : null}
                        {message.redactedNoteFa ? (
                          <p className="text-caption text-text-secondary" data-testid="message-redacted">
                            {message.redactedNoteFa}
                          </p>
                        ) : null}
                        <div className="hz-msg__meta">
                          <time dateTime={message.createdAt.toISOString()}>{timeFa(message.createdAt)}</time>
                        </div>
                      </div>
                    )}
                  </li>,
                ];
              })}
            </ul>
          </div>

          {thread.writable ? (
            <MessageForm inquiryId={inquiry.id} />
          ) : (
            <div className="hz-composer">
              <p className="hz-composer__closed">
                <Icon name="lockSimple" size="sm" />
                <span>
                  <b>این گفت‌وگو برای پیام تازه بسته است.</b> آنچه گفته شده در همین صفحه می‌ماند.
                </span>
              </p>
            </div>
          )}
        </section>

        <div className="min-w-0 space-y-lg lg:col-span-4 lg:col-start-9 lg:row-start-2">
          {/* The price ladder. Immutable rows: a counteroffer supersedes, never edits. */}
          <Card variant="compact">
            <SectionHeader size="sm" title="قیمت" />
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

          {/* Where and when the animal changes hands — the chat-level proposal of
              PROMPT-005, for coordinating before the deposit. Once the deal is
              reserved the handover panel owns this, so the two forms never
              disagree about which arrangement is real. */}
          {party !== null && inquiry.status !== 'CONVERTED' && inquiry.status !== 'COMPLETED' ? (
            <Card variant="compact">
              <SectionHeader size="sm" title="زمان و محل تحویل" />
              {liveHandover ? (
                <p className="mt-sm text-body-sm" data-testid="live-handover">
                  {DELIVERY_METHOD_FA[liveHandover.method as DeliveryMethod]}
                  {' · '}
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

          {/* The meeting itself: a method the seller offered, a one-time code the
              buyer holds, and the buyer's own confirmation (PROMPT-007). */}
          {party !== null && (inquiry.status === 'CONVERTED' || inquiry.status === 'COMPLETED') ? (
            <Card variant="compact">
              <SectionHeader size="sm" title="تحویل حیوان و انتقال مالکیت" />
              {handover === null ? (
                <>
                  <p className="mt-sm text-caption text-text-secondary">
                    ابتدا یکی از روش‌های تحویلی که فروشنده در آگهی اعلام کرده انتخاب می‌شود. مالکیت فقط با کد
                    یک‌بارمصرف خریدار و تأیید خودش منتقل می‌شود.
                  </p>
                  <div className="mt-lg">
                    <ScheduleHandoverForm inquiryId={inquiry.id} methods={offeredMethods} locations={vetLocationOptions} />
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-sm text-body-sm" data-testid="handover-state">
                    {HANDOVER_STATUS_FA[handoverStatus!] ?? handoverStatus}
                    {handover.handover.scheduledAt ? ' — ' + dateTimeFa(handover.handover.scheduledAt) : ''}
                    {handover.locationNameFa ? ' — ' + handover.locationNameFa : ''}
                  </p>
                  {handover.handover.endedReasonFa ? (
                    <p className="mt-2xs text-caption text-text-secondary" data-testid="handover-ended-reason">
                      {handover.handover.endedReasonFa}
                    </p>
                  ) : null}
                  {handover.blockers.length > 0 && handoverStatus !== 'COMPLETED' ? (
                    <ul className="mt-sm list-disc space-y-2xs ps-md text-caption text-text-secondary" data-testid="handover-blockers">
                      {handover.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  ) : null}

                  {handoverStatus === 'COMPLETED' ? (
                    <pre
                      className="hz-rail mt-lg whitespace-pre-wrap rounded-lg border border-border-default bg-bg-subtle p-md text-body-sm"
                      data-testid="handover-statement-final"
                    >
                      {handover.handover.statementFa}
                    </pre>
                  ) : (
                    <div className="mt-lg space-y-lg">
                      {role === 'BUYER' && (handoverStatus === 'SCHEDULED' || handoverStatus === 'CODE_ISSUED' || handoverStatus === 'EXPIRED') ? (
                        <IssueHandoverCodeForm inquiryId={inquiry.id} />
                      ) : null}
                      {role === 'SELLER' && handoverStatus === 'CODE_ISSUED' ? <EnterHandoverCodeForm inquiryId={inquiry.id} /> : null}
                      {role === 'BUYER' && handoverStatus === 'SELLER_ENTERED' ? (
                        <ConfirmHandoverForm inquiryId={inquiry.id} version={handover.handover.version} statementFa={statementPreview} />
                      ) : null}
                      {handoverStatus === 'CODE_ISSUED' || handoverStatus === 'SELLER_ENTERED' ? (
                        <EndHandoverForm inquiryId={inquiry.id} to="REFUSED" label="ثبت اینکه تحویل انجام نشد" />
                      ) : null}
                      {handoverStatus === 'SCHEDULED' || handoverStatus === 'CODE_ISSUED' ? (
                        <EndHandoverForm inquiryId={inquiry.id} to="CANCELLED" label="لغو این قرار تحویل" />
                      ) : null}
                      {(handoverStatus === 'REFUSED' || handoverStatus === 'EXPIRED') && party !== null ? (
                        <ScheduleHandoverForm inquiryId={inquiry.id} methods={offeredMethods} locations={vetLocationOptions} />
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </Card>
          ) : null}

          {/* After the deposit: cancelling, what it cost, and the money coming back. */}
          {party !== null && (inquiry.status === 'CONVERTED' || cancellation !== null) ? (
            <Card variant="compact">
              <SectionHeader size="sm" title="لغو معامله و استرداد بیعانه" />
              {cancellation === null ? (
                <>
                  <p className="mt-sm text-caption text-text-secondary">
                    نتیجه لغو از سیاست نسخه‌دار همین معامله خوانده می‌شود، نه از تنظیمات امروز. دلیل‌هایی که
                    ادعا درباره حیوان، آگهی یا جلسه تحویل‌اند، پرونده اختلاف باز می‌کنند و داور تصمیم می‌گیرد.
                  </p>
                  <div className="mt-lg">
                    <CancelDealForm inquiryId={inquiry.id} party={party} />
                  </div>
                </>
              ) : (
                <div className="mt-sm" data-testid="cancellation-facts">
                  <KeyValueList
                    rows={[
                      {
                        key: 'دلیل',
                        value: CANCELLATION_REASON_FA[cancellation.reason as CancellationReason] ?? cancellation.reason,
                        testId: 'cancellation-reason',
                      },
                      {
                        key: 'نتیجه',
                        value: CANCELLATION_OUTCOME_FA[cancellation.outcome as CancellationOutcome] ?? cancellation.outcome,
                        testId: 'cancellation-outcome',
                      },
                      { key: 'جریمه کسرشده', value: tomanFa(cancellation.penaltyAmountToman), testId: 'cancellation-penalty' },
                      { key: 'مبلغ قابل استرداد', value: tomanFa(cancellation.refundAmountToman), testId: 'cancellation-refund' },
                      { key: 'نسخه سیاست اعمال‌شده', value: cancellation.policyVersion ? <bdi dir="ltr">{cancellation.policyVersion}</bdi> : null },
                      {
                        key: 'وضعیت استرداد',
                        value:
                          refund === null
                            ? 'استردادی برای این معامله ثبت نشده است'
                            : (REFUND_STATUS_FA[refund.status] ?? refund.status) + ' — ' + moneyFa(refund.amountToman) + ' تومان',
                        testId: 'refund-status',
                      },
                    ]}
                  />
                </div>
              )}
            </Card>
          ) : null}

          {/* The three things Hamzist will arbitrate, and the one it will not.
              Still reachable after a cancellation: somebody who disagrees with
              what the policy took, or with a refund that never arrived, has the
              same three subjects to bring — and no fourth one. */}
          {party !== null && (inquiry.status === 'CONVERTED' || cancellation !== null || dispute !== null) ? (
            <Card variant="compact">
              <SectionHeader size="sm" title="داوری" />
              {dispute === null ? (
                <div className="mt-lg">
                  <OpenDisputeForm inquiryId={inquiry.id} />
                </div>
              ) : (
                <>
                  <p className="mt-sm text-body-sm" data-testid="dispute-state">
                    {DISPUTE_SCOPE_FA[dispute.scope as DisputeScope] ?? dispute.scope}
                    {' · '}
                    {DISPUTE_STATUS_FA[dispute.status] ?? dispute.status}
                  </p>
                  {dispute.decision ? (
                    <p className="mt-sm text-body-sm" data-testid="dispute-decision">
                      {DISPUTE_DECISION_FA[dispute.decision as DisputeDecision] ?? dispute.decision}
                      {dispute.decisionReasonFa ? ' — ' + dispute.decisionReasonFa : ''}
                    </p>
                  ) : null}
                  {dispute.status === 'OPEN' || dispute.status === 'UNDER_REVIEW' ? (
                    <div className="mt-lg space-y-lg">
                      <ActionOwner owner="SYSTEM" />
                      <DisputeEvidenceForm inquiryId={inquiry.id} disputeId={dispute.id} />
                      {dispute.openedByAccountId === guard.actor.accountId ? (
                        <WithdrawDisputeForm inquiryId={inquiry.id} disputeId={dispute.id} />
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </Card>
          ) : null}

          {/* Reporting and blocking: both keep the transcript intact. */}
          {party !== null ? (
            <Card variant="compact">
              <SectionHeader size="sm" title="گزارش و بستن گفت‌وگو" />
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
      </div>
    </PublicShell>
  );
}
