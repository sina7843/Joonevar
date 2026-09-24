import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { StatusBadge, type StatusTone } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { directoryReferenceData, ownVetDirectory } from '../../../src/vets/directory.ts';
import { myVetApplications } from '../../../src/vets/onboarding.ts';
import { professionalDashboard } from '../../../src/vets/professional-profile.ts';
import { myStudentCase, type CaseHistoryEvent } from '../../../src/vets/student-application.ts';
import { myDoctorCase } from '../../../src/vets/doctor-application.ts';
import { myLicenceCase, vetServiceCatalogue } from '../../../src/vets/licence-application.ts';
import { licenceStanding } from '../../../src/vets/licence-period.ts';
import { LICENCE_STANDING_FA } from '../../../src/vets/licence-period-model.ts';
import { PayLicencePeriodForm } from '../../../src/vets/licence-period-forms.tsx';
import { myTrustedCase, trustedEligibility, vetEquipmentCatalogue } from '../../../src/vets/trusted-application.ts';
import { TrustedApplicationForm } from '../../../src/vets/trusted-forms.tsx';
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
import { DOCUMENT_KIND_FA as PROFESSIONAL_DOCUMENT_FA, type ProfessionalDocumentKind } from '../../../src/vets/professional-profile-model.ts';
import type { VetCaseStatus } from '../../../src/vets/professional-model.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { VetDirectoryEditor } from '../../../src/vets/directory-editor.tsx';
import { AppealApplicationForm, ResubmitApplicationForm, WithdrawApplicationForm } from '../../../src/vets/onboarding-forms.tsx';
import { StudentApplicationForm } from '../../../src/vets/student-forms.tsx';
import { DoctorApplicationForm } from '../../../src/vets/doctor-forms.tsx';
import { LicenceApplicationForm } from '../../../src/vets/licence-forms.tsx';

export const dynamic = 'force-dynamic';

const TONE: Record<VetApplicationStatus, StatusTone> = {
  SUBMITTED: 'info',
  NEEDS_CORRECTION: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  WITHDRAWN: 'neutral',
};

const CASE_TONE: Partial<Record<VetCaseStatus, StatusTone>> = {
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  NEEDS_CORRECTION: 'warning',
  VERIFIED_STUDENT: 'success',
  VERIFIED_NO_LICENSE: 'success',
  LICENSE_APPROVED_AWAITING_PAYMENT: 'info',
  REJECTED: 'error',
};

const OPEN: readonly VetCaseStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION'];
const LICENCE_HELD: readonly VetCaseStatus[] = ['LICENSE_APPROVED_AWAITING_PAYMENT', 'ACTIVE_LICENSED_VET', 'EXPIRED', 'SUSPENDED'];
const SCOPE_FA: Record<string, string> = { GENERAL: 'عمومی', SPECIALIST: 'متخصص' };

function CaseHistory({ events, testId }: { events: readonly CaseHistoryEvent[]; testId: string }) {
  return (
    <ol className="mt-md space-y-2xs text-caption text-text-secondary" data-testid={testId}>
      {events.map((event, index) => (
        <li key={index}>
          {formatInstantFa(new Date(event.at)) + ' · ' + (event.toStatusFa ?? event.action)}
          {event.submissionVersion && event.toStatus === 'SUBMITTED' ? ' (نسخه ' + event.submissionVersion.toLocaleString('fa-IR') + ')' : ''}
          {event.reasonFa ? ' — ' + event.reasonFa : ''}
        </li>
      ))}
    </ol>
  );
}

/**
 * A veterinarian's or veterinary student's own page — Requirements-Phase-2 §8
 * (PROMPT-007) and Phase 2.5 PROMPT-004, 005 and 006.
 *
 * The account stays an ordinary account. Without a professional path it offers
 * three: a veterinary student, a doctor without a practice licence, and a doctor
 * with one; a doctor whose council code is verified may add the licence later.
 * All are verified by hand by the association admin. None grants the trusted
 * veterinarian role (DEC-0145), and an approved licence waits for payment before
 * the licensed tag exists.
 */
export default async function VetProfileAccountPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const guard = await guardRoute('/account/vet-profile');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;
  const { path } = await searchParams;
  const [own, applications, reference, invitations, professional, studentCase, doctorCase, licenceCase, services] = await Promise.all([
    ownVetDirectory(db(), actor),
    myVetApplications(db(), actor),
    directoryReferenceData(db()),
    myCentreInvitations(db(), actor),
    professionalDashboard(db(), actor),
    myStudentCase(db(), actor),
    myDoctorCase(db(), actor),
    myLicenceCase(db(), actor),
    vetServiceCatalogue(db()),
  ]);
  // Reading the licence also applies whatever time has done to it: the renewal
  // reminder while a period is live, and the downgrade once it is over (PROMPT-008).
  const licence = await licenceStanding(db(), actor.accountId);
  // The trusted request is shown only to an active licensed veterinarian, and the
  // unmet conditions are named one by one rather than as a single refusal (§7).
  const [trusted, trustedCase, equipmentCatalogue] = await Promise.all([
    trustedEligibility(db(), actor.accountId),
    myTrustedCase(db(), actor),
    vetEquipmentCatalogue(db()),
  ]);
  const latest = applications[0] ?? null;
  const open = applications.find((application) => isOpenApplication(application.status)) ?? null;
  const provinceOf = (cityId: string | null) => reference.cities.find((city) => city.id === cityId)?.provinceCode ?? null;
  const studentOpen = studentCase !== null && OPEN.includes(studentCase.status);
  const doctorOpen = doctorCase !== null && OPEN.includes(doctorCase.status);
  const licenceOpen = licenceCase !== null && OPEN.includes(licenceCase.status);
  const licenceHeld = licenceCase !== null && LICENCE_HELD.includes(licenceCase.status);
  const verifiedStudent = studentCase?.status === 'VERIFIED_STUDENT';
  const anyOpen = Boolean(open) || studentOpen || doctorOpen || licenceOpen;
  const canChoosePath = !own && !anyOpen && !verifiedStudent && professional.profile === null;
  const profile = professional.profile;
  const canAddLicence = profile !== null && profile.applicantType === 'DOCTOR' && profile.councilVerified && !anyOpen && !licenceHeld;
  const serviceOptions = services.map((service) => ({ code: service.code, nameFa: service.nameFa }));

  return (
    <PublicShell actor={actor} title="پروفایل دامپزشکی" pathname="/account/vet-profile">
      <div className="space-y-lg">
        {trusted.isActiveLicensedVet || trustedCase ? (
          <Card>
            <h2 className="text-label-lg">دامپزشک معتمد</h2>
            <p className="mt-xs text-caption text-text-secondary">
              معتمد شدن دو شرط دارد: دوره فعال پروانه فعالیت و عضویت معتبر انجمن. برای دستگاه میکروچیپ‌ریدر مدرکی لازم نیست و همه‌جا «تجهیزات اعلام‌شده» نوشته می‌شود.
            </p>

            {trustedCase ? (
              <div className="mt-md space-y-sm">
                <p className="text-body-sm">
                  {'وضعیت درخواست: '}
                  <span data-testid="trusted-case-status">{trustedCase.statusFa}</span>
                </p>
                {trustedCase.reviewNoteFa && trustedCase.status !== 'SUBMITTED' ? (
                  <div data-testid="trusted-review-note">
                    <Alert tone={trustedCase.status === 'NEEDS_CORRECTION' || trustedCase.status === 'REJECTED' ? 'warning' : 'success'} title="نتیجه بررسی انجمن">
                      {trustedCase.reviewNoteFa}
                    </Alert>
                  </div>
                ) : null}
                {trustedCase.status === 'TRUSTED_APPROVED_AWAITING_PAYMENT' ? (
                  <div data-testid="trusted-awaiting-payment">
                    <Alert tone="info" title="درخواست معتمد تأیید شد؛ در انتظار پرداخت دوره">
                      Tag «دامپزشک معتمد» فقط پس از پرداخت موفق و تأییدشده دوره معتمد فعال می‌شود.
                    </Alert>
                  </div>
                ) : null}
              </div>
            ) : null}

            {trusted.unmet.length > 0 ? (
              <ul className="mt-md space-y-2xs text-body-sm" data-testid="trusted-unmet">
                {trusted.unmet.map((requirement: (typeof trusted.unmet)[number]) => (
                  <li key={requirement.code}>
                    {requirement.reasonFa}
                    {requirement.href ? (
                      <>
                        {' '}
                        <Link href={requirement.href} className="text-text-brand underline underline-offset-4" data-testid={'trusted-link-' + requirement.code}>
                          رفتن به همان صفحه
                        </Link>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {trusted.allowed && trusted.terms.configured ? (
              <div className="mt-lg">
                <TrustedApplicationForm
                  mode="NEW"
                  termsFa={trusted.terms.textFa!}
                  termsVersion={trusted.terms.termsVersion!}
                  declarationVersion={trusted.terms.declarationVersion!}
                  equipment={equipmentCatalogue.filter((item: (typeof equipmentCatalogue)[number]) => item.code !== 'MICROCHIP_READER')}
                />
              </div>
            ) : null}

            {trustedCase && trustedCase.status === 'NEEDS_CORRECTION' && trusted.terms.configured ? (
              <div className="mt-lg">
                <TrustedApplicationForm
                  mode="REVISION"
                  caseId={trustedCase.id}
                  version={trustedCase.version}
                  termsFa={trusted.terms.textFa!}
                  termsVersion={trusted.terms.termsVersion!}
                  declarationVersion={trusted.terms.declarationVersion!}
                  equipment={equipmentCatalogue.filter((item: (typeof equipmentCatalogue)[number]) => item.code !== 'MICROCHIP_READER')}
                />
              </div>
            ) : null}
          </Card>
        ) : null}

        {professional.currentTag || professional.cases.length > 0 ? (
          <Card>
            <h2 className="text-label-lg">هویت حرفه‌ای</h2>
            {professional.currentTag ? (
              <p className="mt-xs text-body" data-testid="vet-current-tag">
                {professional.currentTag.labelFa}
                <span className="text-caption text-text-secondary">{' · از ' + formatInstantFa(new Date(professional.currentTag.since))}</span>
              </p>
            ) : (
              <p className="mt-xs text-body-sm text-text-secondary">هنوز Tag حرفه‌ای ندارید.</p>
            )}
            {professional.cases.length > 0 ? (
              <ul className="mt-md space-y-2xs text-body-sm" data-testid="vet-professional-cases">
                {professional.cases.map((item) => (
                  <li key={item.id}>{item.caseTypeFa + ': ' + item.statusFa}</li>
                ))}
              </ul>
            ) : null}
          </Card>
        ) : null}

        {studentCase ? (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div>
                <p className="text-caption text-text-secondary">پرونده دانشجوی دامپزشکی</p>
                <h2 className="text-label-lg">{studentCase.fields?.displayNameFa ?? '—'}</h2>
              </div>
              <span data-testid="student-case-status">
                <StatusBadge tone={CASE_TONE[studentCase.status] ?? 'neutral'}>{studentCase.statusFa}</StatusBadge>
              </span>
            </div>
            {studentCase.fields ? (
              <p className="mt-xs text-caption text-text-secondary">
                {studentCase.fields.universityFa + ' · شماره دانشجویی '}
                <span dir="ltr">{studentCase.fields.studentNumber}</span>
              </p>
            ) : null}
            {studentCase.reviewNoteFa && studentCase.status !== 'SUBMITTED' ? (
              <div className="mt-md" data-testid="student-review-note">
                <Alert tone={studentCase.status === 'VERIFIED_STUDENT' ? 'success' : 'warning'} title="نتیجه بررسی انجمن">
                  {studentCase.reviewNoteFa}
                </Alert>
              </div>
            ) : studentCase.status === 'SUBMITTED' ? (
              <p className="mt-md text-body-sm">در انتظار بررسی ادمین انجمن. نتیجه در اعلان‌های شما هم می‌آید.</p>
            ) : null}
            <CaseHistory events={studentCase.history} testId="student-history" />
          </Card>
        ) : null}

        {studentCase?.status === 'NEEDS_CORRECTION' ? (
          <StudentApplicationForm defaults={studentCase.fields ?? {}} correction={{ caseId: studentCase.id, version: studentCase.version }} />
        ) : null}

        {doctorCase ? (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div>
                <p className="text-caption text-text-secondary">{doctorCase.claimProfileId ? 'Claim پروفایل بدون مالک' : 'درخواست دکتر دامپزشک'}</p>
                <h2 className="text-label-lg">{doctorCase.fields?.displayNameFa ?? '—'}</h2>
              </div>
              <span data-testid="doctor-case-status">
                <StatusBadge tone={CASE_TONE[doctorCase.status] ?? 'neutral'}>{doctorCase.statusFa}</StatusBadge>
              </span>
            </div>
            {doctorCase.fields ? (
              <p className="mt-xs text-caption text-text-secondary">
                {(SCOPE_FA[doctorCase.fields.practiceScope] ?? '') + ' · کد نظام '}
                <span dir="ltr">{doctorCase.fields.councilCode}</span>
              </p>
            ) : null}
            {doctorCase.reviewNoteFa && doctorCase.status !== 'SUBMITTED' ? (
              <div className="mt-md" data-testid="doctor-review-note">
                <Alert tone={doctorCase.status === 'VERIFIED_NO_LICENSE' ? 'success' : 'warning'} title="نتیجه بررسی انجمن">
                  {doctorCase.reviewNoteFa}
                </Alert>
              </div>
            ) : doctorCase.status === 'SUBMITTED' ? (
              <p className="mt-md text-body-sm">در انتظار بررسی ادمین انجمن. نتیجه در اعلان‌های شما هم می‌آید.</p>
            ) : null}
            {doctorCase.documents.length > 0 ? (
              <ul className="mt-md space-y-2xs text-body-sm">
                {doctorCase.documents.map((document) => (
                  <li key={document.id}>
                    <a href={'/api/files/' + document.fileId} target="_blank" rel="noopener noreferrer" className="text-text-brand underline underline-offset-4">
                      {PROFESSIONAL_DOCUMENT_FA[document.kind as ProfessionalDocumentKind] + ' — نسخه ' + document.submissionVersion.toLocaleString('fa-IR')}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <CaseHistory events={doctorCase.history} testId="doctor-history" />
          </Card>
        ) : null}

        {doctorCase?.status === 'NEEDS_CORRECTION' && doctorCase.fields ? (
          <DoctorApplicationForm
            defaults={{ ...doctorCase.fields, provinceCode: provinceOf(doctorCase.fields.cityId) }}
            provinces={reference.provinces}
            cities={reference.cities}
            correction={{ caseId: doctorCase.id, version: doctorCase.version }}
          />
        ) : null}

        {licenceCase ? (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div>
                <p className="text-caption text-text-secondary">پرونده پروانه فعالیت</p>
                <h2 className="text-label-lg">
                  {'کد پروانه '}
                  <span dir="ltr">{licenceCase.fields?.licenceCode ?? '—'}</span>
                </h2>
              </div>
              <span data-testid="licence-case-status">
                <StatusBadge tone={CASE_TONE[licenceCase.status] ?? 'neutral'}>{licenceCase.statusFa}</StatusBadge>
              </span>
            </div>
            {licenceCase.fields ? (
              <p className="mt-xs text-caption text-text-secondary">
                {(SCOPE_FA[licenceCase.fields.practiceScope] ?? '') + ' · تاریخ پروانه ' + formatCivilDateFa(licenceCase.fields.licenceDate) + ' · نسخه ' + licenceCase.submissionVersion.toLocaleString('fa-IR')}
              </p>
            ) : null}
            {licenceCase.status === 'LICENSE_APPROVED_AWAITING_PAYMENT' ? (
              <div className="mt-md" data-testid="licence-awaiting-payment">
                <Alert tone="info" title="مدارک پروانه تأیید شد؛ در انتظار پرداخت">
                  Tag «دارای پروانه فعالیت» فقط پس از پرداخت موفق و تأییدشده دوره فعالیت فعال می‌شود. انتظار پرداخت مهلت ندارد.
                </Alert>
              </div>
            ) : null}
            {licence.canPay ? (
              <div className="mt-md space-y-sm" data-testid="licence-period">
                <p className="text-body-sm">
                  {'وضعیت دوره فعالیت: '}
                  <span data-testid="licence-period-standing">{LICENCE_STANDING_FA[licence.standing]}</span>
                  {licence.endsAt ? ' · پایان دوره ' + formatInstantFa(new Date(licence.endsAt)) : ''}
                  {licence.daysLeft !== null && licence.standing === 'ACTIVE' ? ' · ' + licence.daysLeft.toLocaleString('fa-IR') + ' روز مانده' : ''}
                </p>
                {licence.standing === 'GRACE' ? (
                  <Alert tone="warning" title="دوره فعالیت شما تمام شده و در مهلت ارفاقی است">
                    تا پایان مهلت ارفاقی Tag دارای پروانه باقی است. با تمدید، دوره تازه از پایان دوره قبلی شروع می‌شود و روزی از بین نمی‌رود.
                  </Alert>
                ) : null}
                {licence.standing === 'EXPIRED' ? (
                  <Alert tone="warning" title="دوره فعالیت پروانه به پایان رسیده است">
                    Tag شما «بدون پروانه فعالیت» است. کد نظام تأییدشده و مدارک پروانه سر جای خود می‌مانند و با پرداخت تأییدشده دوباره فعال می‌شوید.
                  </Alert>
                ) : null}
                <PayLicencePeriodForm kind={licence.kind} pendingBatchId={licence.pendingBatchId} />
              </div>
            ) : null}
            {licenceCase.reviewNoteFa && licenceCase.status !== 'SUBMITTED' ? (
              <div className="mt-md" data-testid="licence-review-note">
                <Alert tone={licenceCase.status === 'NEEDS_CORRECTION' || licenceCase.status === 'REJECTED' ? 'warning' : 'success'} title="نتیجه بررسی انجمن">
                  {licenceCase.reviewNoteFa}
                </Alert>
              </div>
            ) : null}
            {licenceCase.documents.length > 0 ? (
              <ul className="mt-md space-y-2xs text-body-sm">
                {licenceCase.documents.map((document) => (
                  <li key={document.id}>
                    <a href={'/api/files/' + document.fileId} target="_blank" rel="noopener noreferrer" className="text-text-brand underline underline-offset-4">
                      {PROFESSIONAL_DOCUMENT_FA[document.kind as ProfessionalDocumentKind] + (document.titleFa ? ' «' + document.titleFa + '»' : '') + ' — نسخه ' + document.submissionVersion.toLocaleString('fa-IR')}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <CaseHistory events={licenceCase.history} testId="licence-history" />
          </Card>
        ) : null}

        {licenceOpen && licenceCase?.fields && licenceCase.status !== 'UNDER_REVIEW' ? (
          <LicenceApplicationForm
            mode={licenceCase.fields.newDoctor ? 'NEW_DOCTOR' : 'VERIFIED_DOCTOR'}
            defaults={licenceCase.fields}
            services={serviceOptions}
            provinces={reference.provinces}
            cities={reference.cities}
            revision={{ caseId: licenceCase.id, version: licenceCase.version }}
          />
        ) : null}

        {canAddLicence ? (
          <LicenceApplicationForm
            mode="VERIFIED_DOCTOR"
            defaults={{ councilCode: profile.councilCode, practiceScope: profile.practiceScope === 'NOT_DECLARED' ? null : profile.practiceScope, phone: profile.phone }}
            services={serviceOptions}
            provinces={reference.provinces}
            cities={reference.cities}
          />
        ) : null}

        {own ? (
          <VetDirectoryEditor data={own} surface="owner" />
        ) : !verifiedStudent ? (
          <Card>
            <h1 className="text-h4">مسیر دامپزشکی در همزیست</h1>
            <p className="mt-xs text-body-sm text-text-secondary">
              حساب کاربری عادی شما همان می‌ماند و این مسیر اختیاری است. دانشجوی دامپزشکی با شماره دانشجویی و دانشگاه، دکتر دامپزشک با کد نظام و
              کارت نظام، و دکتر دارای پروانه با کد، تاریخ و فایل پروانه نیز اقدام می‌کند. اگر پروفایلی «بدون مالک» از شما منتشر شده است، از صفحه
              همان پروفایل درخواست Claim بدهید.
            </p>
          </Card>
        ) : null}

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
            <p className="mt-xs text-caption text-text-secondary">{'کد نظام ' + latest.councilCode + ' · ارسال: ' + formatInstantFa(latest.submittedAt)}</p>
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
              <ResubmitApplicationForm application={{ ...latest, provinceCode: provinceOf(latest.cityId) }} provinces={reference.provinces} cities={reference.cities} />
            ) : null}
            {canAppeal(latest) ? <AppealApplicationForm applicationId={latest.id} version={latest.version} /> : null}
            {isOpenApplication(latest.status) ? <WithdrawApplicationForm applicationId={latest.id} version={latest.version} /> : null}
          </Card>
        ) : null}

        {canChoosePath ? (
          <Card>
            <h2 className="text-label-lg">کدام مسیر؟</h2>
            <div className="mt-md flex flex-wrap gap-md" data-testid="vet-path-choice">
              {(
                [
                  ['student', 'دانشجوی دامپزشکی'],
                  ['doctor', 'دکتر دامپزشک'],
                  ['licensed', 'دکتر دامپزشک دارای پروانه'],
                ] as const
              ).map(([value, label]) => (
                <Link
                  key={value}
                  href={'/account/vet-profile?path=' + value}
                  aria-current={path === value ? 'page' : undefined}
                  className={path === value ? 'text-label-md text-text-brand underline underline-offset-4' : 'text-label-md text-text-secondary'}
                  data-testid={'path-' + value}
                >
                  {label}
                </Link>
              ))}
            </div>
          </Card>
        ) : null}

        {canChoosePath && path === 'student' ? (
          <StudentApplicationForm defaults={studentCase?.status === 'REJECTED' ? (studentCase.fields ?? {}) : {}} />
        ) : null}
        {canChoosePath && path === 'doctor' ? (
          <DoctorApplicationForm
            defaults={doctorCase?.status === 'REJECTED' && doctorCase.fields ? { ...doctorCase.fields, provinceCode: provinceOf(doctorCase.fields.cityId) } : {}}
            provinces={reference.provinces}
            cities={reference.cities}
          />
        ) : null}
        {canChoosePath && path === 'licensed' ? (
          <LicenceApplicationForm mode="NEW_DOCTOR" defaults={{}} services={serviceOptions} provinces={reference.provinces} cities={reference.cities} />
        ) : null}
        {canChoosePath && path !== 'student' && path !== 'doctor' && path !== 'licensed' ? (
          <p className="text-body-sm text-text-secondary">
            برای ادامه یکی از مسیرهای بالا را انتخاب کنید، یا <ButtonLink href="/dashboard">به داشبورد برگردید</ButtonLink>؛ حساب شما بدون این انتخاب
            هم کامل است.
          </p>
        ) : null}
      </div>
    </PublicShell>
  );
}
