import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge, type StatusTone } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { directoryReferenceData, ownVetDirectory } from '../../../src/vets/directory.ts';
import { myVetApplications } from '../../../src/vets/onboarding.ts';
import { myCentreInvitations } from '../../../src/centres/service.ts';
import { CentreInvitationForm } from '../../../src/centres/forms.tsx';
import {
  APPLICATION_KIND_FA,
  APPLICATION_STATUS_FA,
  DOCUMENT_KIND_FA,
  canAppeal,
  isOpenApplication,
  type VetApplicationStatus,
} from '../../../src/vets/onboarding-model.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { VetDirectoryEditor } from '../../../src/vets/directory-editor.tsx';
import {
  AppealApplicationForm,
  ResubmitApplicationForm,
  VetApplicationForm,
  WithdrawApplicationForm,
} from '../../../src/vets/onboarding-forms.tsx';

export const dynamic = 'force-dynamic';

const TONE: Record<VetApplicationStatus, StatusTone> = {
  SUBMITTED: 'info',
  NEEDS_CORRECTION: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  WITHDRAWN: 'neutral',
};

/**
 * A veterinarian's own directory page — Requirements-Phase-2 §8, P2-D07, P2-D09 (PROMPT-007).
 *
 * Without a profile: request one, follow the review, answer a correction,
 * appeal a rejection or withdraw. With one: manage it. Neither grants the
 * trusted veterinarian role of Phase 1 (DEC-0145).
 */
export default async function VetProfileAccountPage() {
  const guard = await guardRoute('/account/vet-profile');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;
  const [own, applications, reference, invitations] = await Promise.all([
    ownVetDirectory(db(), actor),
    myVetApplications(db(), actor),
    directoryReferenceData(db()),
    myCentreInvitations(db(), actor),
  ]);
  const latest = applications[0] ?? null;
  const open = applications.find((application) => isOpenApplication(application.status)) ?? null;
  const provinceOf = (cityId: string | null) => reference.cities.find((city) => city.id === cityId)?.provinceCode ?? null;

  return (
    <PublicShell actor={actor} title="پروفایل دامپزشکی" pathname="/account/vet-profile">
      <div className="space-y-lg">
        {own ? (
          <VetDirectoryEditor data={own} surface="owner" />
        ) : (
          <Card>
            <h1 className="text-h4">پروفایل دامپزشکی در همزیست</h1>
            <p className="mt-xs text-body-sm text-text-secondary">
              دامپزشکان با کد نظام و مدارک، پروفایل دایرکتوری خود را درخواست می‌کنند. اگر پروفایلی «بدون مالک» از شما منتشر شده است، از
              صفحه همان پروفایل درخواست Claim بدهید تا پروفایل تکراری ساخته نشود.
            </p>
          </Card>
        )}

        {invitations.length > 0 ? (
          <Card>
            <h2 className="text-label-lg">دعوت‌های مراکز</h2>
            <p className="mt-xs text-body-sm text-text-secondary">
              مرکزی شما را به تیم حرفه‌ای خود دعوت کرده است. نام شما فقط پس از پذیرش در صفحه آن مرکز نمایش داده می‌شود.
            </p>
            <div className="mt-lg space-y-md" data-testid="centre-invitations">
              {invitations.map((invitation) => (
                <CentreInvitationForm
                  key={invitation.id}
                  invitation={{
                    id: invitation.id,
                    version: invitation.version,
                    centreNameFa: invitation.centreNameFa,
                    roleFa: invitation.roleFa,
                  }}
                />
              ))}
            </div>
          </Card>
        ) : null}

        {latest && (!own || isOpenApplication(latest.status)) ? (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div>
                <p className="text-caption text-text-secondary">{APPLICATION_KIND_FA[latest.kind]}</p>
                <h2 className="text-label-lg">{latest.displayNameFa}</h2>
              </div>
              <span data-testid="vet-application-status">
                <StatusBadge tone={TONE[latest.status]}>{APPLICATION_STATUS_FA[latest.status]}</StatusBadge>
              </span>
            </div>
            <p className="mt-xs text-caption text-text-secondary">
              {'کد نظام ' + latest.councilCode + ' · ارسال: ' + formatInstantFa(latest.submittedAt)}
            </p>
            {latest.reviewNoteFa && latest.status !== 'SUBMITTED' ? (
              <div className="mt-md" data-testid="vet-application-note">
                <Alert tone={latest.status === 'APPROVED' ? 'success' : 'warning'} title="نتیجه بررسی">
                  {latest.reviewNoteFa}
                </Alert>
              </div>
            ) : latest.status === 'SUBMITTED' ? (
              <p className="mt-md text-body-sm">در انتظار بررسی اپراتور همزیست. نتیجه در اعلان‌های شما هم می‌آید.</p>
            ) : null}
            {latest.documents.length > 0 ? (
              <ul className="mt-md space-y-2xs text-body-sm">
                {latest.documents.map((document) => (
                  <li key={document.fileId}>
                    <a href={'/api/files/' + document.fileId} target="_blank" rel="noopener noreferrer" className="text-text-brand underline underline-offset-4">
                      {DOCUMENT_KIND_FA[document.kind]}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            {latest.status === 'NEEDS_CORRECTION' ? (
              <ResubmitApplicationForm
                application={{ ...latest, provinceCode: provinceOf(latest.cityId) }}
                provinces={reference.provinces}
                cities={reference.cities}
              />
            ) : null}
            {canAppeal(latest) ? <AppealApplicationForm applicationId={latest.id} version={latest.version} /> : null}
            {isOpenApplication(latest.status) ? <WithdrawApplicationForm applicationId={latest.id} version={latest.version} /> : null}
          </Card>
        ) : null}

        {!own && !open ? (
          <VetApplicationForm kind="PROFILE" defaults={{}} provinces={reference.provinces} cities={reference.cities} />
        ) : null}
      </div>
    </PublicShell>
  );
}
