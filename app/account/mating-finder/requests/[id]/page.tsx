import Link from 'next/link';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../../src/ui/status.tsx';
import { AppError } from '../../../../../src/domain/errors.ts';
import { db } from '../../../../../src/db/client.ts';
import { formatInstantFa } from '../../../../../src/content/model.ts';
import { formatCivilDateFa } from '../../../../../src/domain/calendar.ts';
import { requestDetail } from '../../../../../src/finder/requests.ts';
import { messagesOf } from '../../../../../src/finder/conversation.ts';
import { contractView } from '../../../../../src/finder/contracts.ts';
import { downstreamView } from '../../../../../src/finder/downstream.ts';
import { myFeedback } from '../../../../../src/finder/operations.ts';
import { BlockPersonForm, FeedbackForm, FinderReportForm } from '../../../../../src/finder/ops-forms.tsx';
import {
  CHAT_STATUSES,
  commandProblem,
  CONFIRMATION_NAME_FA,
  FINANCIAL_FA,
  NO_PAYMENT_THROUGH_HAMZIST_FA,
  NOT_A_LEGAL_SIGNATURE_FA,
  OFFICIAL_CONSEQUENCES_FA,
  PATH_IS_FINAL_FA,
  PERSONAL_CONSEQUENCES_FA,
  PLACE_FA,
  REQUEST_STATUS_FA,
  ROUTE_FA,
  type RequestStatus,
} from '../../../../../src/finder/request-model.ts';
import {
  CancelContractForm,
  CommandForm,
  ConfirmContractForm,
  EditContractForm,
  HandoffForm,
  MessageForm,
  ProposeTermsForm,
} from '../../../../../src/finder/request-forms.tsx';
import { ActionOwner } from '../../../../../src/ui/status.tsx';
import { PageHeader, SectionHeader } from '../../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../../src/ui/page-crumbs.tsx';
import { KeyValueList } from '../../../../../src/ui/key-value.tsx';
import { CaseHistory } from '../../../../../src/ui/desk.tsx';
import { Icon } from '../../../../../src/ui/icon.tsx';

export const dynamic = 'force-dynamic';

/** Request statuses that differ from a status-dictionary key; the rest are keys as-is. */
const REQUEST_KEY: Partial<Record<RequestStatus, string>> = { PRELIMINARILY_ACCEPTED: 'ACCEPTED', CONTRACT_CONFIRMED: 'CONFIRMED' };

function RequestStatusBadge({ status, size }: { status: RequestStatus; size?: 'sm' | 'md' }) {
  if (status === 'MATING_COMPLETED' || status === 'MATING_NOT_COMPLETED') {
    // GAPS #4: no dictionary key for MATING_COMPLETED / MATING_NOT_COMPLETED
    return <StatusBadge tone="info" size={size}>{REQUEST_STATUS_FA[status]}</StatusBadge>;
  }
  return <StatusBadge status={REQUEST_KEY[status] ?? status} size={size} />;
}

/**
 * One mating request — PHASE-4 PROMPT-005: its terms, history, conversation,
 * contract and the commands open to this party right now. The server decides
 * every one of them; the page only offers what the server would accept.
 */
export default async function FinderRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await guardRoute('/account/mating-finder/requests');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { id } = await params;
  let detail;
  try {
    detail = await requestDetail(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }
  const { request, party, events, contact } = detail;
  const status = request.status as RequestStatus;
  const [chat, contract, downstream, feedback] = await Promise.all([
    messagesOf(db(), guard.actor, id),
    contractView(db(), guard.actor, id),
    downstreamView(db(), guard.actor, id),
    myFeedback(db(), guard.actor, id),
  ]);
  const can = (c: Parameters<typeof commandProblem>[0]) => commandProblem(c, status, party) === null;
  const snap = request.snapshot as { sender: { nameFa: string | null }; receiver: { nameFa: string }; evaluation: { score: number; warnings: string[]; unknowns: string[] } };
  const defaults = {
    route: request.route,
    windowFrom: request.windowFrom,
    windowTo: request.windowTo,
    cityFa: request.cityFa,
    placeCategory: request.placeCategory,
    financialCategory: request.financialCategory,
    specialConditionsFa: request.specialConditionsFa ?? '',
  };
  const fa = (n: number) => n.toLocaleString('fa-IR');
  const title = (snap.sender.nameFa ?? 'بدون نام') + ' ← ' + snap.receiver.nameFa;
  // Only the first answer has a single owner in the command table; later steps are open to either side.
  const owner = status === 'WAITING_REVIEW' && !request.pausedAt ? (can('ACCEPT') ? ('USER' as const) : ('COUNTERPARTY' as const)) : null;

  return (
    <PublicShell
      actor={guard.actor}
      title={title}
      pathname="/account/mating-finder"
      header={
        <div>
          <PageCrumbs
            items={[
              { name: 'جفت‌یابی', href: '/account/mating-finder' },
              { name: 'درخواست‌ها', href: '/account/mating-finder/requests' },
              { name: title },
            ]}
          />
          <PageHeader
            title={title}
            back={{ href: '/account/mating-finder/requests' }}
            aside={
              <span data-testid="finder-request-status">
                <RequestStatusBadge status={status} />
              </span>
            }
            meta={[ROUTE_FA[request.route], 'اعتبار تا ' + formatInstantFa(request.expiresAt)]}
          />
        </div>
      }
    >
      {request.pausedAt ? (
        <Alert tone="warning" title="این درخواست متوقف است">
          یکی از دو حیوان در تنظیم قرارداد با درخواست دیگری است. اگر آن لغو شود، این درخواست ادامه می‌یابد.
        </Alert>
      ) : null}
      <div className="grid items-start gap-xl lg:grid-cols-12">
      <div className="min-w-0 space-y-xl lg:col-span-8">
        <Card>
          <SectionHeader title="شرایط درخواست" size="sm" />
          {request.closedReasonFa ? (
            <div className="mb-md">
              <Alert tone="info" title="دلیل بسته‌شدن">
                <span data-testid="finder-request-reason">{'دلیل: ' + request.closedReasonFa}</span>
              </Alert>
            </div>
          ) : null}
          <KeyValueList
            twoCol
            rows={[
              { key: 'مسیر', value: ROUTE_FA[request.route] },
              { key: 'بازه', value: formatCivilDateFa(request.windowFrom) + ' تا ' + formatCivilDateFa(request.windowTo) },
              { key: 'محل', value: request.cityFa + ' — ' + PLACE_FA[request.placeCategory] },
              { key: 'توافق مالی', value: FINANCIAL_FA[request.financialCategory] },
              { key: 'اعتبار تا', value: formatInstantFa(request.expiresAt) },
              { key: 'امتیاز سازگاری هنگام ارسال', value: fa(snap.evaluation.score) + ' از ۱۰۰' },
              ...(request.specialConditionsFa ? [{ key: 'شرایط ویژه', value: request.specialConditionsFa }] : []),
            ]}
          />
          {request.messageFa ? <p className="hz-body-sm mt-md whitespace-pre-line">{request.messageFa}</p> : null}
          {snap.evaluation.warnings.length > 0 ? (
            <div className="hz-fit">
              <p className="hz-fit__title">هشدارهای سازگاری</p>
              <ul className="hz-fit__list" aria-label="هشدارهای سازگاری">
                {snap.evaluation.warnings.map((w) => (
                  <li key={w} className="hz-fit__item">
                    <Icon name="warning" size="xs" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="hz-caption mt-md">{NO_PAYMENT_THROUGH_HAMZIST_FA}</p>
        </Card>

        {contract ? (
          <Card>
            <SectionHeader title="قرارداد" size="sm" />
            <p className="hz-caption">{CONFIRMATION_NAME_FA + '. ' + NOT_A_LEGAL_SIGNATURE_FA}</p>
            <div className="mt-sm flex flex-wrap items-center gap-sm">
              <span data-testid="finder-contract-state">
                <StatusBadge status={contract.contract.status === 'DRAFTING' ? 'DRAFT' : contract.contract.status} />
              </span>
              <span className="text-caption">{'نسخه ' + fa(contract.current.number) + ' · تأیید شما: ' + (contract.approvedByMe ? 'بله' : 'نه') + ' · تأیید طرف مقابل: ' + (contract.approvedByOther ? 'بله' : 'نه')}</span>
            </div>
            <p className="mt-xs text-caption">
              <bdi dir="ltr" className="hz-id break-all" data-testid="finder-contract-hash">{contract.current.contentHash}</bdi>
            </p>
            <ol className="mt-md list-inside list-decimal space-y-xs text-body-sm" data-testid="finder-contract-clauses">
              {contract.content.clauses.map((c) => (
                <li key={c.key}>
                  <strong>{c.titleFa}</strong>
                  {c.required ? ' (اجباری)' : ''}: {c.bodyFa}
                  {c.fillFa ? ' — ' + c.fillFa : ''}
                </li>
              ))}
            </ol>
            {contract.content.financialDetailsFa ? <p className="mt-sm text-body-sm">{'جزئیات مالی: ' + contract.content.financialDetailsFa}</p> : null}
            {contract.contract.status === 'DRAFTING' ? (
              <>
                <details className="mt-md">
                  <summary className="cursor-pointer text-label-sm text-text-brand">ویرایش (نسخه تازه می‌سازد)</summary>
                  <EditContractForm
                    requestId={id}
                    contractId={contract.contract.id}
                    number={contract.current.number}
                    financialDetailsFa={contract.content.financialDetailsFa}
                    optional={contract.optionalClauses.map((o) => {
                      const chosen = contract.content.clauses.find((c) => c.key === o.key);
                      return { key: o.key, titleFa: o.titleFa, bodyFa: o.bodyFa, chosen: Boolean(chosen), fillFa: chosen?.fillFa ?? null };
                    })}
                  />
                </details>
                {!contract.approvedByMe ? (
                  <ConfirmContractForm requestId={id} contractId={contract.contract.id} number={contract.current.number} contentHash={contract.current.contentHash} />
                ) : null}
              </>
            ) : null}
            {contract.contract.status === 'CONFIRMED' ? (
              <p className="mt-md">
                <a href={'/api/finder/contracts/' + contract.contract.id + '/pdf'} className="text-label-sm text-text-brand underline underline-offset-4" data-testid="finder-contract-pdf">
                  دریافت PDF نسخه تأییدشده
                </a>
              </p>
            ) : null}
            {contract.contract.status !== 'CANCELLED' ? (
              <CancelContractForm requestId={id} contractId={contract.contract.id} confirmed={contract.contract.status === 'CONFIRMED'} />
            ) : (
              <p className="mt-sm text-body-sm">{'لغو ' + (contract.contract.cancelKind === 'BILATERAL' ? 'دوطرفه' : 'یک‌طرفه') + ': ' + (contract.contract.cancelReasonFa ?? '')}</p>
            )}
          </Card>
        ) : null}

        {downstream ? (
          <Card>
            <div data-testid="finder-downstream">
              <SectionHeader title={'مسیر پس از قرارداد: ' + ROUTE_FA[downstream.route]} size="sm" />
              {downstream.link === null ? (
                <>
                  <ul className="mt-sm list-inside list-disc space-y-xs text-body-sm" data-testid="finder-consequences">
                    {(downstream.route === 'OFFICIAL' ? OFFICIAL_CONSEQUENCES_FA : PERSONAL_CONSEQUENCES_FA).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="mt-sm text-caption text-text-secondary">{PATH_IS_FINAL_FA}</p>
                  {downstream.contract.status !== 'CONFIRMED' || status !== 'CONTRACT_CONFIRMED' ? null : downstream.problems.length > 0 ? (
                    <Alert tone="warning" title="فعلاً نمی‌توان ادامه داد">
                      <span data-testid="finder-handoff-problems">{downstream.problems.join(' ')}</span>
                    </Alert>
                  ) : (
                    <div className="mt-md">
                      <HandoffForm
                        requestId={id}
                        contractId={downstream.contract.id}
                        label={downstream.route === 'OFFICIAL' ? 'بازکردن پرونده مجوز رسمی' : 'بازکردن پرونده جفت‌گیری شخصی'}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-sm space-y-xs text-body-sm">
                  {downstream.permit ? (
                    <p data-testid="finder-downstream-status">
                      {'پرونده مجوز رسمی' + (downstream.permit.permitNo ? ' ' + downstream.permit.permitNo : '') + ': ' + downstream.permit.statusFa + ' · '}
                      <Link href={'/mating/permits/' + downstream.permit.id} className="text-text-brand underline underline-offset-4" data-testid="finder-downstream-open">
                        رفتن به پرونده مجوز
                      </Link>
                    </p>
                  ) : null}
                  {downstream.permit?.status === 'ISSUED' ? (
                    <p className="flex flex-wrap gap-md">
                      <Link href={'/mating/permits/' + downstream.permit.id + '/dates'} className="text-text-brand underline underline-offset-4">تاریخ جفت‌گیری</Link>
                      <Link href={'/mating/permits/' + downstream.permit.id + '/pregnancy'} className="text-text-brand underline underline-offset-4">آبستنی</Link>
                      <Link href={'/mating/permits/' + downstream.permit.id + '/birth'} className="text-text-brand underline underline-offset-4">تولد و تقسیم</Link>
                    </p>
                  ) : downstream.permit ? (
                    <p className="text-caption text-text-secondary">تاریخ جفت‌گیری، آبستنی و تولد پس از صدور مجوز در همان پرونده باز می‌شود.</p>
                  ) : null}
                  {downstream.personal ? (
                    <p data-testid="finder-downstream-status">
                      {'پرونده جفت‌گیری شخصی: ' + (downstream.personal.status === 'ACTIVE' ? 'فعال' : 'لغوشده') + ' · '}
                      <Link href={'/account/mating-finder/personal/' + downstream.personal.id} className="text-text-brand underline underline-offset-4" data-testid="finder-downstream-open">
                        تاریخ جفت‌گیری و سابقه
                      </Link>
                    </p>
                  ) : null}
                  {downstream.link.detachedAt ? (
                    <p className="text-caption text-text-secondary">{'با لغو قرارداد، این مسیر از قرارداد جدا شد: ' + (downstream.link.detachedReasonFa ?? '')}</p>
                  ) : null}
                </div>
              )}
              <ul className="mt-md space-y-xs text-caption text-text-secondary" data-testid="finder-cooldown">
                {downstream.cooldown.map((c) => (
                  <li key={c.animalId}>{(c.sex === 'MALE' ? 'نر' : 'ماده') + ' «' + c.nameFa + '»: ' + c.cooldown.fa}</li>
                ))}
              </ul>
            </div>
          </Card>
        ) : null}

        {['CONTRACT_CONFIRMED', 'MATING_COMPLETED', 'MATING_NOT_COMPLETED'].includes(status) ? (
          <Card>
            <SectionHeader title="اطلاعات تماس" size="sm" />
            <p className="mt-xs text-caption text-text-secondary">شماره تماس و نشانی فقط وقتی نمایش داده می‌شود که هر دو طرف موافقت کنند.</p>
            {contact ? (
              <p className="mt-sm text-body-sm" data-testid="finder-contact">
                <bdi className="hz-ltr">{contact.mobile}</bdi>
                {contact.addressFa ? ' · ' + contact.addressFa : ''}
              </p>
            ) : (
              <p className="mt-sm text-body-sm" data-testid="finder-contact-hidden">پنهان</p>
            )}
            <div className="mt-sm flex flex-wrap gap-sm">
              <CommandForm action="consent-yes" requestId={id} version={request.version} label="موافقم اطلاعات تماسم نمایش داده شود" testId="finder-consent-yes" />
              <CommandForm action="consent-no" requestId={id} version={request.version} label="پس‌گرفتن موافقت" tone="ghost" testId="finder-consent-no" />
            </div>
          </Card>
        ) : null}

        {chat.conversation ? (
          <Card>
            <SectionHeader title="گفت‌وگو" size="sm" />
            <p className="hz-caption">تا پیش از قرارداد و موافقت دو طرف، شماره تماس و نشانی در پیام‌ها پنهان می‌شود.</p>
            <ul className="hz-thread mt-md" data-testid="finder-messages">
              {chat.messages.map((m) => (
                <li key={m.id} className={m.senderAccountId === guard.actor.accountId ? 'hz-msg hz-msg--mine' : 'hz-msg'}>
                  <div className="hz-msg__bubble">
                    <p className="hz-msg__text">{m.hiddenAt ? 'این پیام پنهان شد.' : (m.bodyFa ?? '')}</p>
                    {m.fileId ? (
                      <a href={'/api/finder/messages/' + m.id + '/file'} className="hz-link inline-flex items-center gap-xs text-caption">
                        <Icon name="paperclip" size="xs" />
                        پیوست
                      </a>
                    ) : null}
                    <span className="hz-msg__meta">{formatInstantFa(m.createdAt)}</span>
                  </div>
                  {m.senderAccountId !== guard.actor.accountId && !m.hiddenAt ? <FinderReportForm target="MESSAGE" id={m.id} testId={'finder-report-message-' + m.id} /> : null}
                </li>
              ))}
            </ul>
            {CHAT_STATUSES.includes(status) ? <MessageForm requestId={id} /> : null}
            {!chat.iBlocked ? (
              <div className="mt-sm">
                <CommandForm action="block" requestId={id} version={request.version} label="بستن پیام‌های طرف مقابل" tone="ghost" testId="finder-block" />
              </div>
            ) : (
              <p className="mt-sm text-caption">پیام‌های طرف مقابل را بسته‌اید.</p>
            )}
          </Card>
        ) : null}

        {['MATING_COMPLETED', 'MATING_NOT_COMPLETED'].includes(status) ? (
          <Card>
            <SectionHeader title="بازخورد محرمانه" size="sm" />
            <p className="mt-xs text-caption text-text-secondary">
              فقط مدیریت همزیست این بازخورد را می‌بیند؛ به طرف مقابل نشان داده نمی‌شود و امتیاز عمومی نمی‌سازد.
            </p>
            {feedback ? (
              <p className="mt-sm text-body-sm" data-testid="finder-feedback-done">بازخورد شما ثبت شده است.</p>
            ) : (
              <FeedbackForm requestId={id} />
            )}
          </Card>
        ) : null}

        <Card>
          <SectionHeader title="گزارش و مسدودکردن" size="sm" />
          <p className="mt-xs text-caption text-text-secondary">
            گزارش را مدیریت بررسی می‌کند و مدرک شما خصوصی می‌ماند. با مسدودکردن، درخواست‌های باز میان شما بسته می‌شود و
            دیگر پروفایل‌ها و پیام‌های یکدیگر را نمی‌بینید؛ به طرف مقابل گفته نمی‌شود چه کسی مسدود کرده است.
          </p>
          <details className="mt-sm">
            <summary className="cursor-pointer text-label-sm">گزارش این درخواست</summary>
            <FinderReportForm target="REQUEST" id={id} testId="finder-report-request" />
          </details>
          <details className="mt-sm">
            <summary className="cursor-pointer text-label-sm">گزارش کاربر مقابل</summary>
            <FinderReportForm target="ACCOUNT" id={id} testId="finder-report-account" />
          </details>
          <div className="mt-md">
            <BlockPersonForm requestId={id} />
          </div>
        </Card>

        <Card>
          <SectionHeader title="تاریخچه پرونده" size="sm" />
          <div data-testid="finder-request-history">
            <CaseHistory
              entries={events.map((e, index) => ({
                id: e.id,
                title: REQUEST_STATUS_FA[e.toStatus as RequestStatus],
                whenFa: formatInstantFa(e.createdAt),
                body: e.reasonFa ?? undefined,
                current: index === events.length - 1,
              }))}
            />
          </div>
        </Card>
      </div>

      <aside className="min-w-0 space-y-xl lg:sticky lg:top-[calc(var(--header-app)+16px)] lg:col-span-4" aria-label="وضعیت و اقدام">
        <Card>
          <SectionHeader title="وضعیت و اقدام" size="sm" />
          <div className="space-y-md">
            <KeyValueList
              rows={[
                { key: 'وضعیت', value: <RequestStatusBadge status={status} size="sm" /> },
                { key: 'اعتبار تا', value: formatInstantFa(request.expiresAt) },
              ]}
            />
            {owner ? <ActionOwner owner={owner} stack /> : null}
            <div className="space-y-md">
            {can('ACCEPT') ? <CommandForm action="respond-accept" requestId={id} version={request.version} label="پذیرش اولیه" tone="primary" testId="finder-accept" /> : null}
            {can('REJECT') ? <CommandForm action="respond-reject" requestId={id} version={request.version} label="رد درخواست" reason testId="finder-reject" /> : null}
            {can('ACCEPT_TERMS') && request.termsProposedByAccountId !== guard.actor.accountId ? (
              <CommandForm action="accept-terms" requestId={id} version={request.version} label="پذیرش شرایط پیشنهادی" testId="finder-accept-terms" />
            ) : null}
            {can('START_CONTRACT') ? <CommandForm action="start-contract" requestId={id} version={request.version} label="تنظیم قرارداد" tone="primary" testId="finder-start-contract" /> : null}
            {can('PROPOSE_TERMS') ? (
              <details>
                <summary className="cursor-pointer text-label-sm text-text-brand">پیشنهاد شرایط تازه</summary>
                <ProposeTermsForm requestId={id} version={request.version} defaults={defaults} />
              </details>
            ) : null}
            {can('CANCEL') && status !== 'CONTRACT_DRAFTING' ? <CommandForm action="cancel" requestId={id} version={request.version} label="لغو درخواست" reason tone="ghost" testId="finder-cancel" /> : null}
            {can('MARK_NOT_COMPLETED') ? <CommandForm action="not-completed" requestId={id} version={request.version} label="جفت‌گیری انجام نشد" reason tone="ghost" testId="finder-not-completed" /> : null}
          </div>
          </div>
        </Card>
      </aside>
      </div>
    </PublicShell>
  );
}
