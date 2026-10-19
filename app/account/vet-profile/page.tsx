import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
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
import { trustedStanding } from '../../../src/vets/trusted-period.ts';
import { PayTrustedPeriodForm } from '../../../src/vets/trusted-period-forms.tsx';
import { myCentreInvitations } from '../../../src/centres/service.ts';
import { CentreInvitationForm } from '../../../src/centres/forms.tsx';
import {
  APPLICATION_KIND_FA,
  DOCUMENT_KIND_FA,
  canAppeal,
  isOpenApplication,
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

import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { CaseHistory as Timeline, whenFa } from '../../../src/ui/desk.tsx';
import { ActionOwner } from '../../../src/ui/status.tsx';
import { Icon } from '../../../src/ui/icon.tsx';

export const dynamic = 'force-dynamic';

/** Case statuses that differ from a status-dictionary key; the rest are keys as-is. */
const CASE_KEY: Partial<Record<VetCaseStatus, string>> = {
  VERIFIED_STUDENT: 'VERIFIED',
  VERIFIED_NO_LICENSE: 'VERIFIED',
  LICENSE_APPROVED_AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  ACTIVE_LICENSED_VET: 'ACTIVE',
  TRUSTED_APPROVED_AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  ACTIVE_TRUSTED_VET: 'ACTIVE',
};
const caseKey = (status: VetCaseStatus): string => CASE_KEY[status] ?? status;

const OPEN: readonly VetCaseStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION'];
const LICENCE_HELD: readonly VetCaseStatus[] = ['LICENSE_APPROVED_AWAITING_PAYMENT', 'ACTIVE_LICENSED_VET', 'EXPIRED', 'SUSPENDED'];
const SCOPE_FA: Record<string, string> = { GENERAL: 'عمومی', SPECIALIST: 'متخصص' };

function CaseHistory({ events, testId }: { events: readonly CaseHistoryEvent[]; testId: string }) {
  return (
    <div className="border-t border-border-subtle pt-md" data-testid={testId}>
      <Timeline
        entries={events.map((event, index) => ({
          id: String(index),
          title:
            (event.toStatusFa ?? event.action) +
            (event.submissionVersion && event.toStatus === 'SUBMITTED' ? ' (نسخه ' + event.submissionVersion.toLocaleString('fa-IR') + ')' : ''),
          whenFa: whenFa(new Date(event.at)),
          body: event.reasonFa ?? undefined,
          current: index === events.length - 1,
        }))}
      />
    </div>
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
  // Reading the trusted standing also applies whatever time has done to it: the
  // renewal reminder while it is live, and the withdrawal once it is over (§7).
  const trustedPeriod = await trustedStanding(db(), actor.accountId);
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
    <PublicShell
      actor={actor}
      title="پروفایل دامپزشکی"
      pathname="/account/vet-profile"
      header={
        <PageHeader
          title="پروفایل دامپزشکی"
          back={{ href: '/dashboard' }}
          meta={[professional.currentTag ? professional.currentTag.labelFa : 'مسیر حرفه‌ای اختیاری']}
        />
      }
    >
      <div className="space-y-xl">
        {trusted.isActiveLicensedVet || trustedCase ? (
          <Card className="space-y-md">
            <SectionHeader title="دامپزشک معتمد" size="sm" />
            <p className="hz-caption">
              معتمد شدن دو شرط دارد: دوره فعال پروانه فعالیت و عضویت معتبر انجمن. برای دستگاه میکروچیپ‌ریدر مدرکی لازم نیست و همه‌جا «تجهیزات اعلام‌شده» نوشته می‌شود.
            </p>

            {trustedCase ? (
              <div className="space-y-sm">
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
                      Tag «دامپزشک معتمد» فقط پس از پرداخت موفق و تأییدشده دوره معتمد فعال می‌شود. انتظار پرداخت مهلت ندارد.
                    </Alert>
                  </div>
                ) : null}

                {trustedPeriod.endsAt ? (
                  <p className="text-body-sm">
                    {'وضعیت دوره معتمد: '}
                    <span data-testid="trusted-period-standing">{trustedPeriod.isTrustedNow ? (trustedPeriod.inGrace ? 'در مهلت ارفاقی' : 'فعال') : 'فعال نیست'}</span>
                    {' · پایان دوره ' + formatInstantFa(new Date(trustedPeriod.endsAt))}
                    {trustedPeriod.daysLeft !== null && trustedPeriod.isTrustedNow ? ' · ' + trustedPeriod.daysLeft.toLocaleString('fa-IR') + ' روز مانده' : ''}
                  </p>
                ) : null}

                {trustedCase.status === 'EXPIRED' ? (
                  <div data-testid="trusted-expired">
                    <Alert tone="warning" title="دوره دامپزشک معتمد شما به پایان رسیده است">
                      دسترسی معتمد برداشته شد و Tag شما به وضعیت پروانه برگشت. کارهای انجام‌شده شما دست‌نخورده می‌مانند و با تمدید دوباره فعال می‌شوید.
                    </Alert>
                  </div>
                ) : null}
                {trustedCase.status === 'SUSPENDED' ? (
                  <div data-testid="trusted-suspended">
                    <Alert tone="error" title="دسترسی معتمد شما معلق است">
                      {trustedCase.reviewNoteFa ?? 'برای پیگیری با انجمن تماس بگیرید.'}
                    </Alert>
                  </div>
                ) : null}

                {trustedPeriod.blockedReasonFa && trustedCase.status !== 'SUSPENDED' ? (
                  <p className="text-body-sm text-text-secondary" data-testid="trusted-period-blocked">
                    {trustedPeriod.blockedReasonFa}
                  </p>
                ) : null}

                {trustedPeriod.canPay ? (
                  <div>
                    <PayTrustedPeriodForm kind={trustedPeriod.kind} pendingBatchId={trustedPeriod.pendingBatchId} />
                  </div>
                ) : null}
              </div>
            ) : null}

            {trusted.unmet.length > 0 ? (
              <ul className="space-y-xs" data-testid="trusted-unmet">
                {trusted.unmet.map((requirement: (typeof trusted.unmet)[number]) => (
                  <li key={requirement.code} className="hz-inline-msg hz-inline-msg--warning">
                    <Icon name="warning" size="xs" />
                    {requirement.reasonFa}
                    {requirement.href ? (
                      <>
                        {' '}
                        <Link href={requirement.href} className="hz-link" data-testid={'trusted-link-' + requirement.code}>
                          رفتن به همان صفحه
                        </Link>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {trusted.allowed && trusted.terms.configured ? (
              <div>
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
              <div>
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
          <Card className="space-y-md">
            <SectionHeader title="هویت حرفه‌ای" size="sm" />
            {professional.currentTag ? (
              <p className="text-body-lg" data-testid="vet-current-tag">
                {professional.currentTag.labelFa}
                <span className="hz-caption">{' · از ' + formatInstantFa(new Date(professional.currentTag.since))}</span>
              </p>
            ) : (
              <p className="text-body-sm text-text-secondary">هنوز Tag حرفه‌ای ندارید.</p>
            )}
            {professional.cases.length > 0 ? (
              <ul className="space-y-2xs text-body-sm" data-testid="vet-professional-cases">
                {professional.cases.map((item) => (
                  <li key={item.id}>{item.caseTypeFa + ': ' + item.statusFa}</li>
                ))}
              </ul>
            ) : null}
          </Card>
        ) : null}

        {studentCase ? (
          <Card className="space-y-md">
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div>
                <p className="hz-caption">پرونده دانشجوی دامپزشکی</p>
                <SectionHeader title={studentCase.fields?.displayNameFa ?? '—'} size="sm" />
              </div>
              <span data-testid="student-case-status">
                <StatusBadge status={caseKey(studentCase.status)} />
              </span>
            </div>
            {studentCase.fields ? (
              <p className="hz-caption">
                {studentCase.fields.universityFa + ' · شماره دانشجویی '}
                <bdi dir="ltr">{studentCase.fields.studentNumber}</bdi>
              </p>
            ) : null}
            {studentCase.reviewNoteFa && studentCase.status !== 'SUBMITTED' ? (
              <div data-testid="student-review-note">
                <Alert tone={studentCase.status === 'VERIFIED_STUDENT' ? 'success' : 'warning'} title="نتیجه بررسی انجمن">
                  {studentCase.reviewNoteFa}
                </Alert>
              </div>
            ) : studentCase.status === 'SUBMITTED' ? (
              <p className="text-body-sm">در انتظار بررسی ادمین انجمن. نتیجه در اعلان‌های شما هم می‌آید.</p>
            ) : null}
            {studentCase.status === 'NEEDS_CORRECTION' ? <ActionOwner owner="USER" /> : OPEN.includes(studentCase.status) ? <ActionOwner owner="ASSOCIATION" /> : null}
            <CaseHistory events={studentCase.history} testId="student-history" />
          </Card>
        ) : null}

        {studentCase?.status === 'NEEDS_CORRECTION' ? (
          <StudentApplicationForm defaults={studentCase.fields ?? {}} correction={{ caseId: studentCase.id, version: studentCase.version }} />
        ) : null}

        {doctorCase ? (
          <Card className="space-y-md">
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div>
                <p className="hz-caption">{doctorCase.claimProfileId ? 'Claim پروفایل بدون مالک' : 'درخواست دکتر دامپزشک'}</p>
                <SectionHeader title={doctorCase.fields?.displayNameFa ?? '—'} size="sm" />
              </div>
              <span data-testid="doctor-case-status">
                <StatusBadge status={caseKey(doctorCase.status)} />
              </span>
            </div>
            {doctorCase.fields ? (
              <p className="hz-caption">
                {(SCOPE_FA[doctorCase.fields.practiceScope] ?? '') + ' · کد نظام '}
                <bdi dir="ltr">{doctorCase.fields.councilCode}</bdi>
              </p>
            ) : null}
            {doctorCase.reviewNoteFa && doctorCase.status !== 'SUBMITTED' ? (
              <div data-testid="doctor-review-note">
                <Alert tone={doctorCase.status === 'VERIFIED_NO_LICENSE' ? 'success' : 'warning'} title="نتیجه بررسی انجمن">
                  {doctorCase.reviewNoteFa}
                </Alert>
              </div>
            ) : doctorCase.status === 'SUBMITTED' ? (
              <p className="text-body-sm">در انتظار بررسی ادمین انجمن. نتیجه در اعلان‌های شما هم می‌آید.</p>
            ) : null}
            {doctorCase.status === 'NEEDS_CORRECTION' ? <ActionOwner owner="USER" /> : OPEN.includes(doctorCase.status) ? <ActionOwner owner="ASSOCIATION" /> : null}
            {doctorCase.documents.length > 0 ? (
              <ul className="space-y-xs">
                {doctorCase.documents.map((document) => (
                  <li key={document.id}>
                    <a href={'/api/files/' + document.fileId} target="_blank" rel="noopener noreferrer" className="hz-link inline-flex items-center gap-xs hz-body-sm">
                      <Icon name="paperclip" size="xs" />
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
          <Card className="space-y-md">
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div>
                <p className="hz-caption">پرونده پروانه فعالیت</p>
                <SectionHeader
                  size="sm"
                  title={
                    <>
                      {'کد پروانه '}
                      <bdi dir="ltr">{licenceCase.fields?.licenceCode ?? '—'}</bdi>
                    </>
                  }
                />
              </div>
              <span data-testid="licence-case-status">
                <StatusBadge status={caseKey(licenceCase.status)} />
              </span>
            </div>
            {licenceCase.fields ? (
              <p className="hz-caption">
                {(SCOPE_FA[licenceCase.fields.practiceScope] ?? '') + ' · تاریخ پروانه ' + formatCivilDateFa(licenceCase.fields.licenceDate) + ' · نسخه ' + licenceCase.submissionVersion.toLocaleString('fa-IR')}
              </p>
            ) : null}
            {licenceCase.status === 'NEEDS_CORRECTION' || licenceCase.status === 'LICENSE_APPROVED_AWAITING_PAYMENT' ? (
              <ActionOwner owner="USER" />
            ) : OPEN.includes(licenceCase.status) ? (
              <ActionOwner owner="ASSOCIATION" />
            ) : null}
            {licenceCase.status === 'LICENSE_APPROVED_AWAITING_PAYMENT' ? (
              <div data-testid="licence-awaiting-payment">
                <Alert tone="info" title="مدارک پروانه تأیید شد؛ در انتظار پرداخت">
                  Tag «دارای پروانه فعالیت» فقط پس از پرداخت موفق و تأییدشده دوره فعالیت فعال می‌شود. انتظار پرداخت مهلت ندارد.
                </Alert>
              </div>
            ) : null}
            {licence.canPay ? (
              <div className="space-y-sm" data-testid="licence-period">
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
              <div data-testid="licence-review-note">
                <Alert tone={licenceCase.status === 'NEEDS_CORRECTION' || licenceCase.status === 'REJECTED' ? 'warning' : 'success'} title="نتیجه بررسی انجمن">
                  {licenceCase.reviewNoteFa}
                </Alert>
              </div>
            ) : null}
            {licenceCase.documents.length > 0 ? (
              <ul className="space-y-xs">
                {licenceCase.documents.map((document) => (
                  <li key={document.id}>
                    <a href={'/api/files/' + document.fileId} target="_blank" rel="noopener noreferrer" className="hz-link inline-flex items-center gap-xs hz-body-sm">
                      <Icon name="paperclip" size="xs" />
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
          <Card className="space-y-md">
            <SectionHeader title="مسیر دامپزشکی در همزیست" size="sm" />
            <p className="text-body-sm text-text-secondary">
              حساب کاربری عادی شما همان می‌ماند و این مسیر اختیاری است. دانشجوی دامپزشکی با شماره دانشجویی و دانشگاه، دکتر دامپزشک با کد نظام و
              کارت نظام، و دکتر دارای پروانه با کد، تاریخ و فایل پروانه نیز اقدام می‌کند. اگر پروفایلی «بدون مالک» از شما منتشر شده است، از صفحه
              همان پروفایل درخواست Claim بدهید.
            </p>
          </Card>
        ) : null}

        {invitations.length > 0 ? (
          <Card className="space-y-md">
            <SectionHeader title="دعوت‌های مراکز" size="sm" />
            <p className="text-body-sm text-text-secondary">
              مرکزی شما را به تیم حرفه‌ای خود دعوت کرده است. نام شما فقط پس از پذیرش در صفحه آن مرکز نمایش داده می‌شود.
            </p>
            <div className="space-y-md" data-testid="centre-invitations">
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
          <Card className="space-y-md">
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div>
                <p className="hz-caption">{APPLICATION_KIND_FA[latest.kind]}</p>
                <SectionHeader title={latest.displayNameFa} size="sm" />
              </div>
              <span data-testid="vet-application-status">
                <StatusBadge status={latest.status} />
              </span>
            </div>
            <p className="hz-caption">{'کد نظام ' + latest.councilCode + ' · ارسال: ' + formatInstantFa(latest.submittedAt)}</p>
            {latest.reviewNoteFa && latest.status !== 'SUBMITTED' ? (
              <div data-testid="vet-application-note">
                <Alert tone={latest.status === 'APPROVED' ? 'success' : 'warning'} title="نتیجه بررسی">
                  {latest.reviewNoteFa}
                </Alert>
              </div>
            ) : latest.status === 'SUBMITTED' ? (
              <p className="text-body-sm">در انتظار بررسی اپراتور همزیست. نتیجه در اعلان‌های شما هم می‌آید.</p>
            ) : null}
            {latest.documents.length > 0 ? (
              <ul className="space-y-xs">
                {latest.documents.map((document) => (
                  <li key={document.fileId}>
                    <a href={'/api/files/' + document.fileId} target="_blank" rel="noopener noreferrer" className="hz-link inline-flex items-center gap-xs hz-body-sm">
                      <Icon name="paperclip" size="xs" />
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
          <Card className="space-y-md">
            <SectionHeader title="کدام مسیر؟" size="sm" />
            <div className="grid gap-sm md:grid-cols-3" data-testid="vet-path-choice">
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
                  className={'hz-option text-text-primary no-underline' + (path === value ? ' border-border-brand bg-bg-brand-subtle' : '')}
                  data-testid={'path-' + value}
                >
                  <Icon name={path === value ? 'checkCircle' : value === 'student' ? 'student' : 'stethoscope'} size="sm" className="text-text-brand" />
                  <span className="text-label-md">{label}</span>
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
          <p className="hz-body-sm text-text-secondary">
            برای ادامه یکی از مسیرهای بالا را انتخاب کنید، یا{' '}
            <Link href="/dashboard" className="hz-link">
              به داشبورد برگردید
            </Link>
            ؛ حساب شما بدون این انتخاب هم کامل است.
          </p>
        ) : null}
      </div>
    </PublicShell>
  );
}
