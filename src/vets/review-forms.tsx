'use client';

import { useActionState } from 'react';
import { Button } from '../ui/button.tsx';
import { TextField } from '../ui/field.tsx';
import { Result } from './directory-forms.tsx';
import { REVIEW_CHECK_RESULTS, REVIEW_CHECK_RESULT_FA, type ReviewCheckResult, type VetCaseType } from './professional-profile-model.ts';
import { claimCaseAction, recordChecksAction, releaseCaseAction, type ReviewState } from './review-actions.ts';

const EMPTY: ReviewState = {};

export interface ReviewPanelState {
  readonly caseId: string;
  readonly caseType: VetCaseType;
  readonly version: number;
  readonly submissionVersion: number;
  readonly claimedByMe: boolean;
  readonly claimedByOther: boolean;
  readonly claimerNameFa: string | null;
  readonly canClaim: boolean;
  readonly canRelease: boolean;
  readonly canRecordChecks: boolean;
  readonly checks: readonly { code: string; labelFa: string; result: ReviewCheckResult | null; noteFa: string | null }[];
}

/**
 * Claim, release and the structured checks of one case (Phase 2.5 PROMPT-007).
 * The server decides every permission again; these controls only hide what the
 * reviewer cannot do right now.
 */
export function ReviewPanel({ review, isSuperadmin }: { review: ReviewPanelState; isSuperadmin: boolean }) {
  const [claimState, claim, claiming] = useActionState(claimCaseAction, EMPTY);
  const [releaseState, release, releasing] = useActionState(releaseCaseAction, EMPTY);
  const [checkState, record, recording] = useActionState(recordChecksAction, EMPTY);
  const hidden = (
    <>
      <input type="hidden" name="caseId" value={review.caseId} />
      <input type="hidden" name="expectedVersion" value={review.version} />
    </>
  );

  return (
    <div className="space-y-lg" data-testid="review-panel">
      <p className="text-body-sm" data-testid="review-claim-state" role="status">
        {review.claimedByMe
          ? 'این پرونده در دست شماست؛ تا تصمیم یا رها کردن، دیگران روی آن اقدام نمی‌کنند.'
          : review.claimedByOther
            ? 'در دست ' + (review.claimerNameFa ?? 'بررسی‌کننده دیگر') + '.'
            : 'هیچ بررسی‌کننده‌ای این پرونده را برنداشته است.'}
      </p>

      {review.canClaim ? (
        <form action={claim}>
          {hidden}
          <Button type="submit" disabled={claiming} data-testid="review-claim">
            {claiming ? 'در حال برداشتن…' : 'برداشتن پرونده برای بررسی'}
          </Button>
          <Result state={claimState} testId="review-claim-result" />
        </form>
      ) : null}

      {review.canRecordChecks ? (
        // Keyed by the recorded results: after a save the form remounts with what was actually stored.
        <form action={record} className="space-y-md" data-testid="review-checks-form" key={review.checks.map((c) => c.result ?? '-').join()}>
          {hidden}
          <input type="hidden" name="caseType" value={review.caseType} />
          <p className="text-caption text-text-secondary">{'بررسی‌ها برای نسخه ' + review.submissionVersion.toLocaleString('fa-IR') + ' ثبت می‌شوند. برای موردی که درست نیست توضیح لازم است.'}</p>
          {review.checks.map((check) => (
            <fieldset key={check.code} className="space-y-xs rounded-md border border-border-subtle p-md" data-testid={'review-check-' + check.code}>
              <legend className="px-2xs text-label-md">{check.labelFa}</legend>
              <div className="flex flex-wrap gap-md">
                {REVIEW_CHECK_RESULTS.map((result) => (
                  <label key={result} className="flex items-center gap-xs text-body-sm">
                    <input
                      type="radio"
                      name={'check_' + check.code}
                      value={result}
                      defaultChecked={check.result === result}
                      className="size-[var(--size-selection-md)]"
                      data-testid={'review-check-' + check.code + '-' + result}
                    />
                    {REVIEW_CHECK_RESULT_FA[result]}
                  </label>
                ))}
              </div>
              <TextField label="توضیح" name={'note_' + check.code} defaultValue={check.noteFa ?? ''} maxLength={500} data-testid={'review-check-note-' + check.code} />
            </fieldset>
          ))}
          <Button type="submit" tone="secondary" disabled={recording} data-testid="review-record-checks">
            {recording ? 'در حال ثبت…' : 'ثبت بررسی‌ها'}
          </Button>
          <Result state={checkState} testId="review-checks-result" />
        </form>
      ) : review.checks.some((check) => check.result !== null) ? (
        <ul className="space-y-2xs text-body-sm" data-testid="review-checks-summary">
          {review.checks.map((check) => (
            <li key={check.code}>{check.labelFa + ': ' + (check.result ? REVIEW_CHECK_RESULT_FA[check.result] : 'ثبت‌نشده') + (check.noteFa ? ' — ' + check.noteFa : '')}</li>
          ))}
        </ul>
      ) : null}

      {review.canRelease ? (
        <form action={release} className="space-y-sm">
          {hidden}
          {review.claimedByMe ? null : <TextField label="دلیل رها کردن پرونده بررسی‌کننده دیگر" name="reasonFa" required={isSuperadmin} maxLength={500} />}
          <Button type="submit" tone="secondary" disabled={releasing} data-testid="review-release">
            {releasing ? 'در حال رها کردن…' : 'رها کردن و بازگرداندن به صف'}
          </Button>
          <Result state={releaseState} testId="review-release-result" />
        </form>
      ) : null}
    </div>
  );
}

/**
 * An inline preview of a private document. Nothing loads until the reviewer opens
 * it, so the audited view records an actual look. The file route answers with a
 * sandboxing policy and refuses framing by any other site.
 */
export function DocumentPreview({ fileId, labelFa, testId }: { fileId: string; labelFa: string; testId: string }) {
  return (
    <details className="rounded-md border border-border-subtle p-sm" data-testid={testId}>
      <summary className="cursor-pointer text-label-md">{'پیش‌نمایش ' + labelFa}</summary>
      <iframe
        src={'/api/files/' + fileId}
        title={'پیش‌نمایش ' + labelFa}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="mt-sm h-[28rem] w-full rounded-sm bg-surface-subtle"
      />
    </details>
  );
}
