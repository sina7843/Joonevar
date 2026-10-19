import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { Stepper } from '../../../src/ui/stepper.tsx';
import { KeyValueList } from '../../../src/ui/key-value.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { ActionOwner, StatusBadge } from '../../../src/ui/status.tsx';
import { NeedsCorrectionState, WaitingState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { findProfile, findResidence } from '../../../src/identity/account.ts';
import { findCase, type KycStatus } from '../../../src/identity/kyc.ts';
import { KycDocumentForm, KycSubmitForm } from './kyc-forms.tsx';
import { IdentityForm, ResidenceForm } from '../profile-forms.tsx';
import { mapApiKey } from '../../../src/adapters/integration-settings.ts';

export const dynamic = 'force-dynamic';

/** KYC's READY is the dictionary's READY_TO_SUBMIT (dictionary READY is a payout state). */
const kycKey = (status: KycStatus): string => (status === 'READY' ? 'READY_TO_SUBMIT' : status);

const STEPS = [{ label: 'اطلاعات هویتی' }, { label: 'نشانی' }, { label: 'مدرک هویتی' }, { label: 'ارسال' }] as const;

/**
 * KYC (§6.3) — P07: the case is assembled on one page in four saved parts
 * (each form saves on the server), with the summary column at the end.
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
  const residence = await findResidence(db(), actor.accountId);
  const { apiKey: mapKey } = await mapApiKey(db());
  const mapKeyConfigured = mapKey !== null;

  // The step the applicant is on, from what is saved: the address is optional,
  // so it never holds the case back.
  const current = !editable ? 4 : profile === null ? 1 : !hasDocument ? 3 : 4;
  const ready = profile !== null && hasDocument;

  return (
    <PublicShell
      actor={actor}
      title="احراز هویت"
      pathname="/account/kyc"
      header={
        <PageHeader
          title="احراز هویت"
          back={{ href: '/dashboard' }}
          aside={<StatusBadge status={kycKey(status)} />}
          meta={['احراز هویت با عضویت انجمن یکی نیست و هیچ‌کدام دیگری را فعال نمی‌کند.']}
        />
      }
    >
      {editable ? (
        <Card variant="compact">
          <Stepper steps={STEPS} current={current} label="مراحل احراز هویت" />
        </Card>
      ) : null}

      <div className="grid items-start gap-xl lg:grid-cols-12">
        <div className="space-y-xl lg:col-span-7">
          {status === 'NEEDS_CORRECTION' && kyc?.reasonFa ? (
            <NeedsCorrectionState reason={kyc.reasonFa} correctionHref="/account/kyc" />
          ) : null}

          {status === 'UNDER_REVIEW' ? (
            <WaitingState
              title="پرونده شما در حال بررسی است"
              owner="ASSOCIATION"
              detail="زمان ثابتی برای پایان بررسی وعده داده نمی‌شود. نتیجه در همین صفحه و در اعلان‌ها اعلام می‌شود."
            />
          ) : null}

          {status === 'REJECTED' && kyc?.reasonFa ? (
            <Alert tone="error" title="پرونده رد شد">
              {kyc.reasonFa}
            </Alert>
          ) : null}

          {status === 'APPROVED' ? (
            <Alert
              tone="success"
              title="احراز هویت شما تأیید شده است"
              action={
                <ButtonLink href="/animals/new" iconStart="plus">
                  ثبت حیوان
                </ButtonLink>
              }
            >
              اکنون می‌توانید حیوان خود را ثبت کنید. برای این کار عضویت لازم نیست.
            </Alert>
          ) : null}

          {/*
            * §6.3: the case is assembled here rather than sending the applicant to
            * another screen and back. Identity is required, the residence is not —
            * §6.2 is explicit that an empty address never blocks the account, the
            * KYC or registering an animal — and the identity card is required
            * before the case can be submitted at all.
            */}
          {editable ? (
            <Card>
              <p className="hz-overline">مرحله ۱ از ۴</p>
              <h2 className="hz-h3">اطلاعات هویتی</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                نام، نام خانوادگی، کد ملی و تاریخ تولد لازم است. نام نمایشی همان چیزی است که در صورت روشن‌بودن
                نمایش، دیگران می‌بینند.
              </p>
              {profile === null ? (
                <div className="mt-md">
                  <Alert tone="warning" title="اطلاعات هویتی هنوز ذخیره نشده است">
                    تا ذخیره‌شدن نام، نام خانوادگی، کد ملی و تاریخ تولد، پرونده قابل ارسال نیست.
                  </Alert>
                </div>
              ) : null}
              <div className="mt-lg">
                <IdentityForm
                  values={{
                    firstName: profile?.firstName ?? '',
                    lastName: profile?.lastName ?? '',
                    nationalId: profile?.nationalId ?? '',
                    birthDate: profile?.birthDate ?? '',
                    displayName: profile?.displayName ?? '',
                    displayNameVisible: profile?.displayNameVisible ?? false,
                  }}
                  nationalIdLocked={false}
                  mode="edit"
                  primary={current === 1}
                />
              </div>
            </Card>
          ) : null}

          {editable ? (
            <Card>
              <p className="hz-overline">مرحله ۲ از ۴</p>
              <h2 className="hz-h3">نشانی (اختیاری)</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                خالی‌گذاشتن نشانی و کدپستی، ارسال پرونده را متوقف نمی‌کند (§۶.۲).
              </p>
              <div className="mt-lg">
                <ResidenceForm
                  values={{
                    province: residence?.province ?? '',
                    city: residence?.city ?? '',
                    address: residence?.address ?? '',
                    postalCode: residence?.postalCode ?? '',
                  }}
                  mapAvailable={mapKeyConfigured}
                />
              </div>
            </Card>
          ) : null}

          {editable ? (
            <>
              <Card>
                <p className="hz-overline">مرحله ۳ از ۴</p>
                <h2 className="hz-h3">مدرک هویتی</h2>
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
                <p className="hz-overline">مرحله ۴ از ۴</p>
                <h2 className="hz-h3 mb-md">ارسال برای بررسی</h2>
                <KycSubmitForm disabled={!ready} />
                {!ready ? (
                  <p className="mt-sm text-caption text-text-secondary">
                    برای ارسال، تکمیل اطلاعات هویتی و بارگذاری تصویر کارت ملی لازم است.
                  </p>
                ) : null}
              </Card>
            </>
          ) : null}
        </div>

        <aside aria-label="خلاصه پرونده" className="space-y-lg lg:col-span-5">
          <Card variant="compact">
            <SectionHeader size="sm" title="خلاصه پرونده" />
            <div className="mt-sm space-y-md">
              <KeyValueList
                rows={[
                  { key: 'وضعیت', value: <StatusBadge status={kycKey(status)} /> },
                  { key: 'نام', value: profile ? profile.firstName + ' ' + profile.lastName : null, empty: '— هنوز ذخیره نشده' },
                  {
                    key: 'کد ملی',
                    value: profile?.nationalId ? <bdi dir="ltr">{profile.nationalId}</bdi> : null,
                    empty: '— هنوز ذخیره نشده',
                  },
                  { key: 'نشانی', value: residence?.city ? [residence.province, residence.city].filter(Boolean).join('، ') : null, empty: 'اختیاری؛ واردنشده' },
                  { key: 'تصویر کارت ملی', value: hasDocument ? 'بارگذاری‌شده' : null, empty: '— هنوز بارگذاری نشده' },
                ]}
              />
              {editable ? (
                <ActionOwner owner="USER" />
              ) : status === 'UNDER_REVIEW' || status === 'READY' ? (
                <ActionOwner owner="ASSOCIATION" />
              ) : null}
            </div>
          </Card>
        </aside>
      </div>
    </PublicShell>
  );
}
