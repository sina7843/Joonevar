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
  ReportMessageForm,
} from '../../../../../src/finder/request-forms.tsx';

export const dynamic = 'force-dynamic';

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
  const [chat, contract, downstream] = await Promise.all([
    messagesOf(db(), guard.actor, id),
    contractView(db(), guard.actor, id),
    downstreamView(db(), guard.actor, id),
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

  return (
    <PublicShell actor={guard.actor} title="درخواست جفت‌گیری" pathname="/account/mating-finder">
      <div className="space-y-lg">
        <Card>
          <p className="text-caption">
            <Link href="/account/mating-finder/requests" className="text-text-brand underline underline-offset-4">
              درخواست‌های جفت‌گیری
            </Link>
          </p>
          <div className="mt-xs flex flex-wrap items-center justify-between gap-sm">
            <h1 className="text-h4">{(snap.sender.nameFa ?? 'بدون نام') + ' ← ' + snap.receiver.nameFa}</h1>
            <span data-testid="finder-request-status">
              <StatusBadge tone={status === 'CONTRACT_CONFIRMED' ? 'success' : 'info'}>{REQUEST_STATUS_FA[status]}</StatusBadge>
            </span>
          </div>
          {request.pausedAt ? (
            <div className="mt-sm">
              <Alert tone="warning" title="این درخواست متوقف است">
                یکی از دو حیوان در تنظیم قرارداد با درخواست دیگری است. اگر آن لغو شود، این درخواست ادامه می‌یابد.
              </Alert>
            </div>
          ) : null}
          {request.closedReasonFa ? <p className="mt-sm text-body-sm" data-testid="finder-request-reason">{'دلیل: ' + request.closedReasonFa}</p> : null}
          <dl className="mt-md grid gap-sm text-body-sm sm:grid-cols-2">
            <div><dt className="text-caption text-text-secondary">مسیر</dt><dd>{ROUTE_FA[request.route]}</dd></div>
            <div><dt className="text-caption text-text-secondary">بازه</dt><dd>{formatCivilDateFa(request.windowFrom) + ' تا ' + formatCivilDateFa(request.windowTo)}</dd></div>
            <div><dt className="text-caption text-text-secondary">محل</dt><dd>{request.cityFa + ' — ' + PLACE_FA[request.placeCategory]}</dd></div>
            <div><dt className="text-caption text-text-secondary">توافق مالی</dt><dd>{FINANCIAL_FA[request.financialCategory]}</dd></div>
            <div><dt className="text-caption text-text-secondary">اعتبار تا</dt><dd>{formatInstantFa(request.expiresAt)}</dd></div>
            <div><dt className="text-caption text-text-secondary">امتیاز سازگاری هنگام ارسال</dt><dd>{fa(snap.evaluation.score) + ' از ۱۰۰'}</dd></div>
          </dl>
          {request.messageFa ? <p className="mt-sm whitespace-pre-line text-body-sm">{request.messageFa}</p> : null}
          {request.specialConditionsFa ? <p className="mt-xs text-body-sm">{'شرایط ویژه: ' + request.specialConditionsFa}</p> : null}
          {snap.evaluation.warnings.length > 0 ? (
            <ul className="mt-sm list-inside list-disc text-caption">{snap.evaluation.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          ) : null}
          <p className="mt-sm text-caption text-text-secondary">{NO_PAYMENT_THROUGH_HAMZIST_FA}</p>
        </Card>

        <Card>
          <h2 className="text-label-lg">اقدام‌ها</h2>
          <div className="mt-md space-y-md">
            {can('ACCEPT') ? <CommandForm action="respond-accept" requestId={id} version={request.version} label="پذیرش اولیه" tone="primary" testId="finder-accept" /> : null}
            {can('REJECT') ? <CommandForm action="respond-reject" requestId={id} version={request.version} label="رد درخواست" reason testId="finder-reject" /> : null}
            {can('ACCEPT_TERMS') && request.termsProposedByAccountId !== guard.actor.accountId ? (
              <CommandForm action="accept-terms" requestId={id} version={request.version} label="پذیرش شرایط پیشنهادی" testId="finder-accept-terms" />
            ) : null}
            {can('START_CONTRACT') ? <CommandForm action="start-contract" requestId={id} version={request.version} label="تنظیم قرارداد" tone="primary" testId="finder-start-contract" /> : null}
            {can('PROPOSE_TERMS') ? (
              <details>
                <summary className="cursor-pointer text-label-md text-text-brand">پیشنهاد شرایط تازه</summary>
                <ProposeTermsForm requestId={id} version={request.version} defaults={defaults} />
              </details>
            ) : null}
            {can('CANCEL') && status !== 'CONTRACT_DRAFTING' ? <CommandForm action="cancel" requestId={id} version={request.version} label="لغو درخواست" reason tone="ghost" testId="finder-cancel" /> : null}
            {can('MARK_NOT_COMPLETED') ? <CommandForm action="not-completed" requestId={id} version={request.version} label="جفت‌گیری انجام نشد" reason tone="ghost" testId="finder-not-completed" /> : null}
          </div>
        </Card>

        {contract ? (
          <Card>
            <h2 className="text-label-lg">قرارداد</h2>
            <p className="mt-xs text-caption text-text-secondary">{CONFIRMATION_NAME_FA + '. ' + NOT_A_LEGAL_SIGNATURE_FA}</p>
            <div className="mt-sm flex flex-wrap items-center gap-sm">
              <span data-testid="finder-contract-state">
                <StatusBadge tone={contract.contract.status === 'CONFIRMED' ? 'success' : contract.contract.status === 'CANCELLED' ? 'neutral' : 'info'}>
                  {contract.contract.status === 'CONFIRMED' ? 'تأییدشده' : contract.contract.status === 'CANCELLED' ? 'لغوشده' : 'پیش‌نویس'}
                </StatusBadge>
              </span>
              <span className="text-caption">{'نسخه ' + fa(contract.current.number) + ' · تأیید شما: ' + (contract.approvedByMe ? 'بله' : 'نه') + ' · تأیید طرف مقابل: ' + (contract.approvedByOther ? 'بله' : 'نه')}</span>
            </div>
            <p className="mt-xs text-caption">
              <bdi className="hz-ltr font-mono" data-testid="finder-contract-hash">{contract.current.contentHash}</bdi>
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
                  <summary className="cursor-pointer text-label-md text-text-brand">ویرایش (نسخه تازه می‌سازد)</summary>
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
                <a href={'/api/finder/contracts/' + contract.contract.id + '/pdf'} className="text-label-md text-text-brand underline underline-offset-4" data-testid="finder-contract-pdf">
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
              <h2 className="text-label-lg">مسیر پس از قرارداد: {ROUTE_FA[downstream.route]}</h2>
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
            <h2 className="text-label-lg">اطلاعات تماس</h2>
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
            <h2 className="text-label-lg">گفت‌وگو</h2>
            <p className="mt-xs text-caption text-text-secondary">تا پیش از قرارداد و موافقت دو طرف، شماره تماس و نشانی در پیام‌ها پنهان می‌شود.</p>
            <ul className="mt-md space-y-sm" data-testid="finder-messages">
              {chat.messages.map((m) => (
                <li key={m.id} className={'rounded-md border border-border-subtle p-sm ' + (m.senderAccountId === guard.actor.accountId ? 'ms-lg' : 'me-lg')}>
                  <p className="whitespace-pre-line text-body-sm">{m.hiddenAt ? 'این پیام پنهان شد.' : (m.bodyFa ?? '')}</p>
                  {m.fileId ? (
                    <a href={'/api/finder/messages/' + m.id + '/file'} className="text-caption text-text-brand underline underline-offset-4">
                      پیوست
                    </a>
                  ) : null}
                  <p className="text-caption text-text-secondary">{formatInstantFa(m.createdAt)}</p>
                  {m.senderAccountId !== guard.actor.accountId && !m.hiddenAt ? <ReportMessageForm messageId={m.id} /> : null}
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

        <Card>
          <h2 className="text-label-lg">تاریخچه</h2>
          <ol className="mt-sm space-y-xs text-caption" data-testid="finder-request-history">
            {events.map((e) => (
              <li key={e.id}>{formatInstantFa(e.createdAt) + ' — ' + REQUEST_STATUS_FA[e.toStatus as RequestStatus] + (e.reasonFa ? ' — ' + e.reasonFa : '')}</li>
            ))}
          </ol>
        </Card>
      </div>
    </PublicShell>
  );
}
