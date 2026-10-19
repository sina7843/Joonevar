import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { DeskHead, DocFrame, Panel, PrivateNote } from '../../../../src/ui/desk.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { ageInDays, keyStatus } from '../../../../src/ui/queue.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { suggestionForReview } from '../../../../src/suggestions/service.ts';
import { SUGGESTION_KIND_FA, type SuggestionKind } from '../../../../src/suggestions/model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { SuggestionDecisionForm } from '../../../../src/suggestions/forms.tsx';

export const dynamic = 'force-dynamic';

/** One suggestion and the records that already look like it — §10, §22 (PROMPT-009). */
export default async function ReviewSuggestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/review/suggestions/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const data = await suggestionForReview(db(), guard.actor, id);
  if (data === null) notFound();
  const { suggestion, similar } = data;

  const open = suggestion.status === 'SUBMITTED';
  return (
    <OpsShell actor={guard.actor} title="بررسی پیشنهاد" pathname="/review/suggestions" nav={REVIEW_NAV}>
      <DeskHead
        title={SUGGESTION_KIND_FA[suggestion.kind as SuggestionKind] + ' · ' + suggestion.displayNameFa}
        status={{
          ...keyStatus(suggestion.status),
          testId: 'suggestion-review-status',
        }}
        meta={[
          'ثبت: ' + formatInstantFa(suggestion.createdAt),
          open && ageInDays(suggestion.createdAt) !== null ? (
            <span className="hz-age">{ageInDays(suggestion.createdAt)!.toLocaleString('fa-IR') + ' روز در صف'}</span>
          ) : null,
        ]}
        owner={open ? 'SYSTEM' : null}
        ownerExtra={open ? 'اپراتور بررسی' : undefined}
      >
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

      <div className="hz-desk">
        <div className="min-w-0 space-y-lg">
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
        </div>
        <div className="hz-desk__decision">
          <SuggestionDecisionForm suggestionId={suggestion.id} version={suggestion.version} open={suggestion.status === 'SUBMITTED'} />
        </div>
      </div>
    </OpsShell>
  );
}
