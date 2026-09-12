import { Alert } from '../ui/alert.tsx';
import { StatusBadge } from '../ui/status.tsx';
import { formatCivilDateFa } from '../domain/calendar.ts';
import { VERIFICATION_STATE_FA } from './model.ts';
import type { VerificationAnswer } from './service.ts';

/**
 * What a stranger is shown for one verification — §17 (PROMPT-014).
 *
 * Type, public code, issue date, state and a few facts about the animal. No
 * owner, no contact, no identifier of a person, no file.
 */
export function VerificationResult({ answer }: { answer: VerificationAnswer }) {
  if (answer.state === 'RATE_LIMITED') {
    return (
      <div data-testid="verify-rate-limited">
        <Alert tone="warning" title="تعداد استعلام‌های شما بیش از حد مجاز شده است">
          کمی بعد دوباره تلاش کنید. این محدودیت برای جلوگیری از حدس‌زدن کد اسناد است.
        </Alert>
      </div>
    );
  }

  if (answer.state === 'NOT_FOUND') {
    return (
      <div data-testid="verify-not-found">
        <Alert tone="error" title="سندی با این کد پیدا نشد">
          کد را همان‌طور که روی سند نوشته شده وارد کنید. اگر سند را با QR باز کرده‌اید، نشانی کامل را وارد کنید.
        </Alert>
      </div>
    );
  }

  const tone = answer.state === 'VALID' ? 'success' : 'warning';
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-lg" data-testid="verify-result">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div className="min-w-0">
          <p className="text-label-lg">{answer.kindFa}</p>
          <p className="mt-2xs text-caption text-text-secondary">
            <bdi className="hz-ltr font-mono" data-testid="verify-code">
              {answer.code}
            </bdi>
          </p>
        </div>
        <span data-testid="verify-state">
          <StatusBadge tone={tone}>{VERIFICATION_STATE_FA[answer.state]}</StatusBadge>
        </span>
      </div>

      <dl className="mt-lg grid gap-sm sm:grid-cols-2">
        <div className="rounded-md border border-border-subtle px-md py-sm">
          <dt className="text-body-sm text-text-secondary">تاریخ صدور</dt>
          <dd className="mt-2xs text-label-md" data-testid="verify-issued-at">
            {answer.issuedAt ? formatCivilDateFa(answer.issuedAt.toISOString().slice(0, 10) as never) : '—'}
          </dd>
        </div>
        {answer.animal?.speciesFa ? (
          <div className="rounded-md border border-border-subtle px-md py-sm">
            <dt className="text-body-sm text-text-secondary">گونه</dt>
            <dd className="mt-2xs text-label-md">{answer.animal.speciesFa}</dd>
          </div>
        ) : null}
        {answer.animal?.breedFa ? (
          <div className="rounded-md border border-border-subtle px-md py-sm">
            <dt className="text-body-sm text-text-secondary">نژاد</dt>
            <dd className="mt-2xs text-label-md">{answer.animal.breedFa}</dd>
          </div>
        ) : null}
        {answer.animal?.sexFa ? (
          <div className="rounded-md border border-border-subtle px-md py-sm">
            <dt className="text-body-sm text-text-secondary">جنسیت</dt>
            <dd className="mt-2xs text-label-md">{answer.animal.sexFa}</dd>
          </div>
        ) : null}
        {answer.animal?.birthYear ? (
          <div className="rounded-md border border-border-subtle px-md py-sm">
            <dt className="text-body-sm text-text-secondary">سال تولد</dt>
            <dd className="mt-2xs text-label-md" dir="ltr">
              {answer.animal.birthYear}
            </dd>
          </div>
        ) : null}
      </dl>

      {answer.noticeFa ? (
        <div className="mt-lg" data-testid="verify-notice">
          <Alert tone="warning" title="این سند جایگزین شده است">
            {answer.noticeFa}
          </Alert>
        </div>
      ) : null}

      <p className="mt-lg text-caption text-text-secondary" data-testid="verify-privacy-note">
        استعلام فقط وجود و وضعیت سند را نشان می‌دهد. نام و تماس مالک، کد ملی، نشانی و فایل سند در این صفحه نمایش داده
        نمی‌شود.
      </p>
    </div>
  );
}
