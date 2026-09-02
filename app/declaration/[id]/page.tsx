import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../src/ui/access-denied.tsx';
import { AppError } from '../../../src/domain/errors.ts';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import {
  declarationView,
  DECLARATION_STATUS_FA,
  NOTE_KIND_FA,
  NO_OFFICIAL_EFFECT_NOTE_FA,
  SCOPE_NOTE_FA,
} from '../../../src/mating/declaration.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { CancelDeclarationForm, PersonalNoteForm, RespondDeclarationForm } from '../forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * One personal declaration — §20, §17.3.
 *
 * The page shows only what this service is allowed to hold: which two records
 * and which two people, and the state of the other person's answer. There is no
 * agreement text, no file, no signature and no share anywhere on it, and no
 * payment step exists on this route.
 */
export default async function DeclarationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/declaration/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let view;
  try {
    view = await declarationView(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  const { declaration } = view;
  const isInitiator = declaration.initiatorAccountId === guard.actor.accountId;
  const awaitingMe =
    declaration.status === 'PENDING_COUNTERPARTY_CONFIRMATION' &&
    declaration.counterpartyAccountId === guard.actor.accountId;
  const notesOpen = declaration.status === 'PENDING_COUNTERPARTY_CONFIRMATION' || declaration.status === 'CONFIRMED';

  return (
    <PublicShell actor={guard.actor} title="اعلام توافق شخصی" pathname={'/declaration/' + id}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">اعلام وجود توافق شخصی</h2>
              <p className="mt-2xs text-caption text-text-secondary" data-testid="declaration-route-note">
                این مسیر شخصی است و با «مجوز رسمی جفت‌گیری» یکی نیست؛ شناسه، وضعیت و Route جداگانه دارد.
              </p>
            </div>
            <StatusBadge
              tone={
                declaration.status === 'CONFIRMED'
                  ? 'success'
                  : declaration.status === 'REJECTED' || declaration.status === 'CANCELLED'
                    ? 'warning'
                    : 'info'
              }
            >
              <span data-testid="declaration-status">{DECLARATION_STATUS_FA[declaration.status]}</span>
            </StatusBadge>
          </div>

          <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="declaration-detail">
            <dt className="text-text-secondary">حیوان آغازکننده</dt>
            <dd data-testid="declaration-own-animal-name">{view.initiatorAnimalName ?? 'بدون نام'}</dd>
            <dt className="text-text-secondary">حیوان طرف مقابل</dt>
            <dd data-testid="declaration-other-animal-name">{view.counterpartyAnimalName ?? 'بدون نام'}</dd>
            <dt className="text-text-secondary">آغازکننده</dt>
            <dd>{view.initiatorName}</dd>
            <dt className="text-text-secondary">طرف مقابل</dt>
            <dd>{view.counterpartyName}</dd>
            <dt className="text-text-secondary">شماره دعوت‌شده</dt>
            <dd dir="ltr" className="text-left font-mono" data-testid="declaration-mobile-tail">
              {view.invitedMobileTail}
            </dd>
          </dl>

          {declaration.reasonFa ? (
            <p className="mt-lg text-body-sm" data-testid="declaration-reason">
              {declaration.reasonFa}
            </p>
          ) : null}

          <p className="mt-lg text-caption text-text-secondary" data-testid="declaration-scope">
            {SCOPE_NOTE_FA}
          </p>
          <p className="mt-sm text-caption text-text-secondary" data-testid="declaration-limits">
            {NO_OFFICIAL_EFFECT_NOTE_FA}
          </p>
        </Card>

        {awaitingMe ? (
          <Card>
            <h2 className="text-label-lg">پاسخ شما</h2>
            <p className="mt-md text-caption text-text-secondary">
              فقط «وجود» توافق را تأیید یا رد می‌کنید؛ متن یا مفاد توافق در هم‌زیست ثبت نمی‌شود و کد
              یک‌بارمصرف جدیدی برای امضا ساخته نمی‌شود.
            </p>
            <RespondDeclarationForm declarationId={declaration.id} />
          </Card>
        ) : null}

        {isInitiator && declaration.status === 'PENDING_COUNTERPARTY_CONFIRMATION' ? (
          <Card>
            <Alert tone="info" title="در انتظار پاسخ طرف مقابل">
              <span data-testid="declaration-pending-note">
                تا پاسخ طرف مقابل، وضعیت این اعلام «در انتظار تأیید طرف مقابل» می‌ماند.
              </span>
            </Alert>
            <CancelDeclarationForm declarationId={declaration.id} />
          </Card>
        ) : null}

        {notesOpen ? <PersonalNoteForm declarationId={declaration.id} /> : null}

        {view.notes.length > 0 ? (
          <Card>
            <h2 className="text-label-lg">یادداشت‌های شخصی (UNVERIFIED)</h2>
            <ul className="mt-lg space-y-md" data-testid="personal-notes">
              {view.notes.map((note) => (
                <li key={note.id} className="rounded-lg border border-border-subtle p-lg">
                  <p className="text-label-md">
                    {NOTE_KIND_FA[note.kind] ?? note.kind}
                    {note.noteDate ? ' · ' + formatCivilDateFa(note.noteDate) : ''}
                  </p>
                  {note.noteFa ? <p className="mt-sm text-body-sm">{note.noteFa}</p> : null}
                  <p className="mt-2xs text-caption text-text-secondary">UNVERIFIED</p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <p className="text-body-sm">
            <Link
              href="/mating/permits/new"
              className="text-text-brand underline underline-offset-4"
              data-testid="official-route-link"
            >
              مسیر رسمی: درخواست مجوز جفت‌گیری
            </Link>
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}
