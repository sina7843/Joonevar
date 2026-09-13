import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { db } from '../../../../../src/db/client.ts';
import { directoryReferenceData, ownVetDirectory } from '../../../../../src/vets/directory.ts';
import { claimableProfile, myVetApplications } from '../../../../../src/vets/onboarding.ts';
import { isOpenApplication } from '../../../../../src/vets/onboarding-model.ts';
import { openProfessionalCaseOf } from '../../../../../src/vets/doctor-application.ts';
import { DoctorApplicationForm } from '../../../../../src/vets/doctor-forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Claim of an unowned veterinarian profile — Requirements-Phase-2 §8, §10 and
 * Phase 2.5 PROMPT-005. The claim is a doctor application that names this page;
 * the association admin verifies it, and only a page still without an owner can
 * be transferred. A claim transfers the control of future edits, not the
 * ownership of its history.
 */
export default async function ClaimVetProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // The real address, so signing in returns to this claim.
  const guard = await guardRoute('/account/vet-profile/claim/' + encodeURIComponent(slug));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const profile = await claimableProfile(db(), slug);
  if (profile === null) notFound();
  const [own, applications, reference, openCase] = await Promise.all([
    ownVetDirectory(db(), guard.actor),
    myVetApplications(db(), guard.actor),
    directoryReferenceData(db()),
    openProfessionalCaseOf(db(), guard.actor),
  ]);
  const openApplication = applications.find((application) => isOpenApplication(application.status)) ?? null;
  const claimingThis =
    (openCase !== null && openCase.vetProfileId === profile.id) ||
    (openApplication !== null && openApplication.kind === 'CLAIM' && openApplication.vetProfileId === profile.id);

  return (
    <PublicShell actor={guard.actor} title="Claim پروفایل دامپزشک" pathname="/account/vet-profile">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">{profile.displayNameFa}</h1>
          <p className="mt-xs text-body-sm text-text-secondary">{(profile.cityNameFa ? profile.cityNameFa + ' · ' : '') + 'پروفایل بدون مالک'}</p>
          <p className="mt-md text-body-sm">
            با تأیید Claim توسط ادمین انجمن، ویرایش و انتشار این پروفایل به حساب شما سپرده می‌شود و کد نظام آن تأیید می‌شود. تاریخچه ثبت‌شده
            پروفایل همان‌طور می‌ماند.
          </p>
        </Card>

        {own ? (
          <div data-testid="claim-already-owner">
            <Alert tone="warning" title="این حساب همین حالا پروفایل دامپزشک دارد">
              <Link href="/account/vet-profile" className="text-text-brand underline underline-offset-4">
                رفتن به پروفایل خودتان
              </Link>
            </Alert>
          </div>
        ) : openCase || openApplication ? (
          <div data-testid={claimingThis ? 'claim-in-review' : 'claim-other-open'}>
            <Alert tone="info" title={claimingThis ? 'درخواست Claim شما برای این پروفایل در حال بررسی است' : 'درخواست دیگری از شما در حال بررسی است'}>
              <Link href="/account/vet-profile" className="text-text-brand underline underline-offset-4">
                پیگیری درخواست
              </Link>
            </Alert>
          </div>
        ) : (
          <DoctorApplicationForm
            claimSlug={profile.slug!}
            defaults={{ displayNameFa: profile.displayNameFa, councilCode: profile.councilCode }}
            provinces={reference.provinces}
            cities={reference.cities}
          />
        )}
      </div>
    </PublicShell>
  );
}
