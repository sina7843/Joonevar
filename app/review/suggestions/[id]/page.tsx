import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { CaseAge, CaseHistory, Desk, DeskHead, DeskVersionNote, Panel, deskPosition } from '../../../../src/ui/desk.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { keyStatus } from '../../../../src/ui/queue.tsx';
import { ActionOwner } from '../../../../src/ui/status.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { suggestionForReview, suggestionQueue } from '../../../../src/suggestions/service.ts';
import { SUGGESTION_KIND_FA, type SuggestionKind } from '../../../../src/suggestions/model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { SuggestionDecisionForm } from '../../../../src/suggestions/forms.tsx';
import { caseHistory } from '../../case-history.ts';

export const dynamic = 'force-dynamic';

const HISTORY_FA: Record<string, string> = {
  DIRECTORY_SUGGESTION_SUBMITTED: 'ثبت پیشنهاد',
  DIRECTORY_SUGGESTION_RESUBMITTED: 'ارسال اصلاحات',
  DIRECTORY_SUGGESTION_WITHDRAWN: 'انصراف پیشنهاددهنده',
  DIRECTORY_SUGGESTION_DECIDED: 'تصمیم بررسی',
};

/** The recorded outcome, in the words the decision itself reported. */
const OUTCOME_FA: Record<string, string> = {
  APPROVED: 'پیشنهاد تأیید شد و رکورد بدون مالک منتشر شد.',
  REJECTED: 'پیشنهاد رد شد.',
  NEEDS_CORRECTION: 'درخواست اصلاح ثبت شد.',
};

/** One suggestion and the records that already look like it — §10, §22 (PROMPT-009). */
export default async function ReviewSuggestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/review/suggestions/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const data = await suggestionForReview(db(), guard.actor, id);
  if (data === null) notFound();
  const { suggestion, similar } = data;

  const open = suggestion.status === 'SUBMITTED';
  // ponytail: position within the first 100 open cases (the queue's page ceiling).
  const [queue, history] = await Promise.all([
    open ? suggestionQueue(db(), guard.actor, { view: 'OPEN', page: 1, pageSize: 100 }) : null,
    caseHistory('DIRECTORY_SUGGESTION', suggestion.id, HISTORY_FA),
  ]);
  const position = queue ? deskPosition(queue.items.map((item) => item.id), suggestion.id, (other) => '/review/suggestions/' + other) : null;
  return (
    <OpsShell actor={guard.actor} title="بررسی پیشنهاد" pathname="/review/suggestions" nav={REVIEW_NAV} headingInPage>
      <DeskHead level={1}
        title={SUGGESTION_KIND_FA[suggestion.kind as SuggestionKind] + ' · ' + suggestion.displayNameFa}
        status={{
          ...keyStatus(suggestion.status),
          testId: 'suggestion-review-status',
        }}
        meta={[
          'ثبت: ' + formatInstantFa(suggestion.createdAt),
          open ? <CaseAge since={suggestion.createdAt} /> : null,
          'نسخه ' + suggestion.version.toLocaleString('fa-IR'),
        ]}
        position={position}
      >
        {open ? <ActionOwner owner="SYSTEM" label="اپراتور بررسی" you /> : null}
        <p className="flex flex-wrap gap-lg">
          <Link href="/review/suggestions" className="hz-link hz-link--standalone">
            بازگشت به پیشنهادها
          </Link>
          {data.createdSlug ? (
            <Link
              href={(suggestion.kind === 'VET' ? '/veterinarians/' : '/centers/') + data.createdSlug}
              className="hz-link hz-link--standalone"
              data-testid="suggestion-created-record"
            >
              رکورد منتشرشده از این پیشنهاد
            </Link>
          ) : null}
        </p>
      </DeskHead>

      <Desk
        decisionTitle={open ? 'تصمیم' : 'نتیجه'}
        decision={
          open ? (
            <>
              <SuggestionDecisionForm suggestionId={suggestion.id} version={suggestion.version} />
              <DeskVersionNote version={suggestion.version} />
            </>
          ) : (
            <div data-testid="suggestion-decision-result">
              <Alert tone={suggestion.status === 'REJECTED' ? 'warning' : 'info'} title={OUTCOME_FA[suggestion.status] ?? 'این پیشنهاد در انتظار بررسی نیست.'}>
                {suggestion.reviewNoteFa ?? undefined}
              </Alert>
            </div>
          )
        }
      >
        {similar.length > 0 ? (
          <div data-testid="suggestion-duplicates">
            <Alert tone="warning" title="رکورد مشابه با همین نام">
              <ul className="list-disc space-y-2xs ps-lg">
                {similar.map((row) => (
                  <li key={row.kind + row.nameFa + (row.slug ?? '')}>
                    {row.nameFa +
                      ' · ' +
                      SUGGESTION_KIND_FA[row.kind] +
                      ' · ' +
                      (row.owned ? 'دارای مالک' : 'بدون مالک') +
                      (row.published ? '' : ' · منتشرنشده')}
                  </li>
                ))}
              </ul>
            </Alert>
          </div>
        ) : null}

        <Panel title="اطلاعات پیشنهادشده">
          <KeyValueList
            rows={[
              { key: 'شهر', value: [data.provinceNameFa, data.cityNameFa].filter(Boolean).join(' · ') || null },
              { key: 'تماس یا نشانی عمومی', value: suggestion.contactFa },
              { key: 'منبع اطلاعات', value: suggestion.sourceFa },
              { key: 'ثبت', value: formatInstantFa(suggestion.createdAt) },
            ].filter((row) => row.value)}
          />
          {suggestion.noteFa ? <p className="whitespace-pre-line text-body-sm">{suggestion.noteFa}</p> : null}
          {suggestion.reviewNoteFa ? (
            <p className="text-caption text-text-secondary" data-testid="suggestion-last-note">
              {'آخرین تصمیم: ' + suggestion.reviewNoteFa + (suggestion.reviewedAt ? ' · ' + formatInstantFa(suggestion.reviewedAt) : '')}
            </p>
          ) : null}
        </Panel>

        <Panel title="سابقه پرونده">
          <CaseHistory entries={history} />
        </Panel>
      </Desk>
    </OpsShell>
  );
}
