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
import type { VetCaseStatus } from '../../../src/vets/professional-model.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { VetDirectoryEditor } from '../../../src/vets/directory-editor.tsx';
import { AppealApplicationForm, ResubmitApplicationForm, WithdrawApplicationForm } from '../../../src/vets/onboarding-forms.tsx';
import { StudentApplicationForm } from '../../../src/vets/student-forms.tsx';
import { DoctorApplicationForm } from '../../../src/vets/doctor-forms.tsx';

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
  REJECTED: 'error',
};

const OPEN: readonly VetCaseStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION'];
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
 * (PROMPT-007) and Phase 2.5 PROMPT-004 and PROMPT-005.
 *
 * The account stays an ordinary account. Without a professional path it offers
 * the choice: a veterinary student or a doctor, both verified by hand by the
 * association admin. Neither grants the trusted veterinarian role (DEC-0145); the
 * doctor path grants the unlicensed tag and directory introduction, nothing more.
 */
export default async function VetProfileAccountPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const guard = await guardRoute('/account/vet-profile');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;
  const { path } = await searchParams;
  const [own, applications, reference, invitations, professional, studentCase, doctorCase] = await Promise.all([
    ownVetDirectory(db(), actor),
    myVetApplications(db(), actor),
    directoryReferenceData(db()),
    myCentreInvitations(db(), actor),
    professionalDashboard(db(), actor),
    myStudentCase(db(), actor),
    myDoctorCase(db(), actor),
  ]);
  const latest = applications[0] ?? null;
  const open = applications.find((application) => isOpenApplication(application.status)) ?? null;
  const provinceOf = (cityId: string | null) => reference.cities.find((city) => city.id === cityId)?.provinceCode ?? null;
  const studentOpen = studentCase !== null && OPEN.includes(studentCase.status);
  const doctorOpen = doctorCase !== null && OPEN.includes(doctorCase.status);
  const verifiedStudent = studentCase?.status === 'VERIFIED_STUDENT';
  const canChoosePath = !own && !open && !studentOpen && !doctorOpen && !verifiedStudent && professional.profile === null;

  return (
    <PublicShell actor={actor} title="پروفایل دامپزشکی" pathname="/account/vet-profile">
      <div className="space-y-lg">
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
                      {DOCUMENT_KIND_FA[document.kind as keyof typeof DOCUMENT_KIND_FA] + ' — نسخه ' + document.submissionVersion.toLocaleString('fa-IR')}
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

        {own ? (
          <VetDirectoryEditor data={own} surface="owner" />
        ) : !verifiedStudent ? (
          <Card>
            <h1 className="text-h4">مسیر دامپزشکی در همزیست</h1>
            <p className="mt-xs text-body-sm text-text-secondary">
              حساب کاربری عادی شما همان می‌ماند و این مسیر اختیاری است. دانشجوی دامپزشکی با شماره دانشجویی و دانشگاه، و دکتر دامپزشک با
              کد نظام، عمومی یا متخصص بودن و کارت نظام اقدام می‌کند. اگر پروفایلی «بدون مالک» از شما منتشر شده است، از صفحه همان پروفایل
              درخواست Claim بدهید.
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
              <Link
                href="/account/vet-profile?path=student"
                aria-current={path === 'student' ? 'page' : undefined}
                className={path === 'student' ? 'text-label-md text-text-brand underline underline-offset-4' : 'text-label-md text-text-secondary'}
                data-testid="path-student"
              >
                دانشجوی دامپزشکی
              </Link>
              <Link
                href="/account/vet-profile?path=doctor"
                aria-current={path === 'doctor' ? 'page' : undefined}
                className={path === 'doctor' ? 'text-label-md text-text-brand underline underline-offset-4' : 'text-label-md text-text-secondary'}
                data-testid="path-doctor"
              >
                دکتر دامپزشک
              </Link>
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
        {canChoosePath && path !== 'student' && path !== 'doctor' ? (
          <p className="text-body-sm text-text-secondary">
            برای ادامه یکی از دو مسیر بالا را انتخاب کنید، یا <ButtonLink href="/dashboard">به داشبورد برگردید</ButtonLink>؛ حساب شما بدون این
            انتخاب هم کامل است.
          </p>
        ) : null}
      </div>
    </PublicShell>
  );
}
