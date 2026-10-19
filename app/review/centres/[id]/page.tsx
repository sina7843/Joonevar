import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { CaseHistory, Desk, DeskHead, DeskVersionNote, Panel } from '../../../../src/ui/desk.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { centreEditor } from '../../../../src/centres/service.ts';
import { changeCentreStatusAction } from '../../../../src/centres/actions.ts';
import { CentreEditor } from '../../../../src/centres/editor.tsx';
import { PublicationDecision } from '../../publication-decision.tsx';
import { caseHistory } from '../../case-history.ts';

export const dynamic = 'force-dynamic';

const HISTORY_FA: Record<string, string> = {
  CENTRE_CREATED: 'ثبت مرکز',
  CENTRE_PROFILE_UPDATED: 'ویرایش اطلاعات مرکز',
  CENTRE_LICENCE_RECORDED: 'ثبت مجوز',
  CENTRE_OWNER_ASSIGNED: 'واگذاری مدیریت',
  CENTRE_STATUS_CHANGED: 'تغییر وضعیت انتشار',
  CENTRE_CLAIMED: 'تأیید Claim مرکز',
  CENTRE_PUBLISHED_FROM_SUGGESTION: 'انتشار از پیشنهاد کاربر',
};

/**
 * One centre in the review environment — DS DecisionDesk (P10): the record and
 * its licence as evidence, publish / hide as the decision (PROMPT-008). The
 * centre's content belongs to its manager and is not edited here.
 */
export default async function ReviewCentrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/review/centres/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await centreEditor(db(), guard.actor, id);
  if (data === null) notFound();
  const { centre } = data.facts;
  const history = await caseHistory('CENTRE', centre.id, HISTORY_FA);

  return (
    <OpsShell actor={guard.actor} title="مرکز دامپزشکی" pathname="/review/centres" nav={REVIEW_NAV}>
      <DeskHead
        title={centre.displayNameFa}
        status={{ key: centre.publicStatus, testId: 'centre-public-status' }}
        meta={[data.facts.typeNameFa, centre.ownerAccountId ? 'دارای مدیر' : 'بدون مالک', 'نسخه ' + centre.version.toLocaleString('fa-IR')]}
      >
        <Link href="/review/centres" className="hz-link hz-link--standalone">
          بازگشت به مراکز
        </Link>
      </DeskHead>
      <Desk
        decisionTitle="انتشار"
        decision={
          <>
            {data.blockers.length > 0 && centre.publicStatus !== 'PUBLISHED' ? (
              <div data-testid="centre-blockers">
                <Alert tone="warning" title="پیش از انتشار">
                  <ul className="list-disc space-y-2xs pe-lg">
                    {data.blockers.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Alert>
              </div>
            ) : null}
            <PublicationDecision
              action={changeCentreStatusAction}
              hidden={{ centreId: centre.id, expectedVersion: centre.version }}
              publicStatus={centre.publicStatus}
              prefix="centre"
            />
            <DeskVersionNote version={centre.version} />
          </>
        }
      >
        <CentreEditor data={data} surface="review" headless statusForm={false} />
        <Panel title="سابقه پرونده">
          <CaseHistory entries={history} />
        </Panel>
      </Desk>
    </OpsShell>
  );
}
