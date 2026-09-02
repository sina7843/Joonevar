import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge, type StatusTone } from '../../../src/ui/status.tsx';
import { NeedsCorrectionState, WaitingState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { findProfile } from '../../../src/identity/account.ts';
import { findCase, KYC_STATUS_FA, type KycStatus } from '../../../src/identity/kyc.ts';
import { KycDocumentForm, KycSubmitForm } from './kyc-forms.tsx';

export const dynamic = 'force-dynamic';

const BADGE_TONE: Record<KycStatus, StatusTone> = {
  DRAFT: 'neutral',
  READY: 'info',
  UNDER_REVIEW: 'info',
  APPROVED: 'success',
  NEEDS_CORRECTION: 'warning',
  REJECTED: 'error',
};

/**
 * KYC (§6.3).
 *
 * The valid data and the previously uploaded file survive a correction, so the
 * applicant edits the same case instead of starting again. Approval unlocks
 * animal registration and nothing else — membership is a separate concept (§4).
 */
export default async function KycPage() {
  const guard = await guardRoute('/account/kyc');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const profile = await findProfile(db(), actor.accountId);
  const kyc = await findCase(db(), actor.accountId);
  const status: KycStatus = kyc?.status ?? 'DRAFT';
  const editable = status === 'DRAFT' || status === 'NEEDS_CORRECTION';
  const hasDocument = Boolean(kyc?.documentFileId);

  return (
    <PublicShell actor={actor} title="احراز هویت" pathname="/account/kyc">
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div>
              <h2 className="text-label-lg">وضعیت پرونده</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                احراز هویت با عضویت انجمن یکی نیست و هیچ‌کدام دیگری را فعال نمی‌کند.
              </p>
            </div>
            <StatusBadge tone={BADGE_TONE[status]}>{KYC_STATUS_FA[status]}</StatusBadge>
          </div>
        </Card>

        {profile === null ? (
          <Alert
            tone="warning"
            title="ابتدا اطلاعات هویتی خود را تکمیل کنید"
            action={
              <Link href="/account/profile" className="text-label-md text-text-brand underline underline-offset-4">
                تکمیل اطلاعات هویتی
              </Link>
            }
          >
            نام، نام خانوادگی، کد ملی و تاریخ تولد پیش از ارسال پرونده لازم است.
          </Alert>
        ) : null}

        {status === 'UNDER_REVIEW' ? (
          <WaitingState
            title="پرونده شما در حال بررسی است"
            owner="ASSOCIATION"
            detail="زمان ثابتی برای پایان بررسی وعده داده نمی‌شود. نتیجه در همین صفحه و در اعلان‌ها اعلام می‌شود."
          />
        ) : null}

        {status === 'NEEDS_CORRECTION' && kyc?.reasonFa ? (
          <NeedsCorrectionState reason={kyc.reasonFa} correctionHref="/account/kyc" />
        ) : null}

        {status === 'REJECTED' && kyc?.reasonFa ? (
          <Alert tone="error" title="پرونده رد شد">
            {kyc.reasonFa}
          </Alert>
        ) : null}

        {status === 'APPROVED' ? (
          <Alert tone="success" title="احراز هویت شما تأیید شده است">
            اکنون می‌توانید حیوان خود را ثبت کنید. برای این کار عضویت لازم نیست.
          </Alert>
        ) : null}

        {editable ? (
          <>
            <Card>
              <h2 className="text-label-lg">مدرک هویتی</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                {hasDocument
                  ? 'تصویر بارگذاری‌شده شما حفظ شده است؛ در صورت نیاز می‌توانید آن را جایگزین کنید.'
                  : 'فقط تصویر یا فایل کارت ملی پذیرفته می‌شود.'}
              </p>
              <div className="mt-lg">
                <KycDocumentForm hasDocument={hasDocument} />
              </div>
            </Card>
            <Card>
              <KycSubmitForm disabled={profile === null || !hasDocument} />
              {profile === null || !hasDocument ? (
                <p className="mt-sm text-caption text-text-secondary">
                  برای ارسال، تکمیل اطلاعات هویتی و بارگذاری تصویر کارت ملی لازم است.
                </p>
              ) : null}
            </Card>
          </>
        ) : null}
      </div>
    </PublicShell>
  );
}
