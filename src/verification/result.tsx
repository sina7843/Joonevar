import { Alert } from '../ui/alert.tsx';
import { StatusBadge } from '../ui/status.tsx';
import { Icon } from '../ui/icon.tsx';
import { KeyValueList } from '../ui/key-value.tsx';
import { formatCivilDateFa } from '../domain/calendar.ts';
import type { VerificationAnswer } from './service.ts';

/** The footer every outcome carries: what this answer never shows. */
function PrivateFoot() {
  return (
    <div className="hz-verify__foot">
      <span className="inline-flex items-center gap-xs" data-testid="verify-privacy-note">
        <Icon name="lockSimple" size="xs" />
        استعلام فقط وجود و وضعیت سند را نشان می‌دهد. نام و تماس مالک، کد ملی، نشانی و فایل سند در این صفحه نمایش داده نمی‌شود.
      </span>
    </div>
  );
}

/**
 * What a stranger is shown for one verification — §17 (PROMPT-014), drawn as DS
 * *VerificationResult* (`.hz-verify`).
 *
 * Type, public code, issue date, state and a few facts about the animal. No
 * owner, no contact, no identifier of a person, no file.
 */
export function VerificationResult({ answer }: { answer: VerificationAnswer }) {
  if (answer.state === 'RATE_LIMITED') {
    return (
      <section className="hz-verify" aria-labelledby="verify-title" data-testid="verify-rate-limited">
        <div className="hz-verify__head" role="status">
          <span className="hz-verify__icon">
            <Icon name="clock" size="md" />
          </span>
          <div className="hz-verify__text">
            <h2 className="hz-verify__title" id="verify-title">
              تعداد استعلام‌های شما بیش از حد مجاز شده است
            </h2>
            <p className="hz-verify__summary">کمی بعد دوباره تلاش کنید. این محدودیت برای جلوگیری از حدس‌زدن کد اسناد است.</p>
          </div>
        </div>
      </section>
    );
  }

  if (answer.state === 'NOT_FOUND') {
    return (
      <section className="hz-verify hz-verify--not-found" aria-labelledby="verify-title" data-testid="verify-not-found">
        <div className="hz-verify__head" role="status">
          <span className="hz-verify__icon">
            <Icon name="magnifyingGlass" size="md" />
          </span>
          <div className="hz-verify__text">
            <h2 className="hz-verify__title" id="verify-title">
              سندی با این کد پیدا نشد
            </h2>
            <p className="hz-verify__summary">
              کد را همان‌طور که روی سند نوشته شده وارد کنید. اگر سند را با QR باز کرده‌اید، نشانی کامل را وارد کنید.
            </p>
          </div>
        </div>
        <PrivateFoot />
      </section>
    );
  }

  const valid = answer.state === 'VALID';
  return (
    <section
      className={valid ? 'hz-verify hz-verify--valid' : 'hz-verify hz-verify--superseded'}
      aria-labelledby="verify-title"
      data-testid="verify-result"
    >
      <div className="hz-verify__head" role="status">
        <span className="hz-verify__icon">
          <Icon name={valid ? 'sealCheck' : 'arrowClockwise'} size="md" />
        </span>
        <div className="hz-verify__text">
          <span data-testid="verify-state">
            <StatusBadge status={valid ? 'VALID' : 'SUPERSEDED'} />
          </span>
          <h2 className="hz-verify__title" id="verify-title">
            {answer.kindFa}
          </h2>
          <p className="hz-verify__summary">
            <bdi dir="ltr" className="hz-id" data-testid="verify-code">
              {answer.code}
            </bdi>
          </p>
        </div>
      </div>

      <div className="hz-verify__body">
        <KeyValueList
          rows={[
            {
              key: 'تاریخ صدور',
              value: answer.issuedAt ? formatCivilDateFa(answer.issuedAt.toISOString().slice(0, 10) as never) : null,
              testId: 'verify-issued-at',
            },
            ...(answer.animal?.speciesFa ? [{ key: 'گونه', value: answer.animal.speciesFa }] : []),
            ...(answer.animal?.breedFa ? [{ key: 'نژاد', value: answer.animal.breedFa }] : []),
            ...(answer.animal?.sexFa ? [{ key: 'جنسیت', value: answer.animal.sexFa }] : []),
            ...(answer.animal?.birthYear ? [{ key: 'سال تولد', value: <bdi dir="ltr">{answer.animal.birthYear}</bdi> }] : []),
          ]}
        />
      </div>

      {answer.noticeFa ? (
        <div className="px-lg pb-lg" data-testid="verify-notice">
          <Alert tone="warning" title="این سند جایگزین شده است">
            {answer.noticeFa}
          </Alert>
        </div>
      ) : null}

      <PrivateFoot />
    </section>
  );
}
