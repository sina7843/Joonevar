import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { CaseHistory, Desk, DeskHead, DeskVersionNote, Panel } from '../../../../src/ui/desk.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { communityEditor } from '../../../../src/communities/service.ts';
import { changeCommunityStatusAction } from '../../../../src/communities/actions.ts';
import { CommunityEditor } from '../../../../src/communities/editor.tsx';
import { COMMUNITY_KIND_FA, COMMUNITY_SCOPE_FA, type CommunityKind, type CommunityScope } from '../../../../src/communities/model.ts';
import { PublicationDecision } from '../../publication-decision.tsx';
import { caseHistory } from '../../case-history.ts';

export const dynamic = 'force-dynamic';

const HISTORY_FA: Record<string, string> = {
  COMMUNITY_CREATED: 'ثبت پرونده',
  COMMUNITY_PROFILE_UPDATED: 'ویرایش اطلاعات',
  COMMUNITY_REGISTRATION_RECORDED: 'ثبت مجوز',
  COMMUNITY_OWNER_ASSIGNED: 'واگذاری مدیریت',
  COMMUNITY_STATUS_CHANGED: 'تغییر وضعیت انتشار',
};

/**
 * One association or club in the review environment — DS DecisionDesk (P10):
 * the record and its registration as evidence, publish / hide as the decision
 * (PROMPT-010). Content stays with its managers.
 */
export default async function ReviewCommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/review/communities/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await communityEditor(db(), guard.actor, id);
  if (data === null) notFound();
  const { community } = data.facts;
  const history = await caseHistory('COMMUNITY', community.id, HISTORY_FA);

  return (
    <OpsShell actor={guard.actor} title="انجمن و کلاب" pathname="/review/communities" nav={REVIEW_NAV}>
      <DeskHead
        title={community.displayNameFa}
        status={{ key: community.publicStatus, testId: 'community-public-status' }}
        meta={[
          COMMUNITY_KIND_FA[community.kind as CommunityKind],
          'حوزه ' + COMMUNITY_SCOPE_FA[community.scope as CommunityScope],
          community.ownerAccountId ? 'دارای مدیر' : 'بدون مالک',
          'نسخه ' + community.version.toLocaleString('fa-IR'),
        ]}
      >
        <Link href="/review/communities" className="hz-link hz-link--standalone">
          بازگشت به انجمن‌ها و کلاب‌ها
        </Link>
      </DeskHead>
      <Desk
        decisionTitle="انتشار"
        decision={
          <>
            {data.blockers.length > 0 && community.publicStatus !== 'PUBLISHED' ? (
              <div data-testid="community-blockers">
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
              action={changeCommunityStatusAction}
              hidden={{ communityId: community.id, expectedVersion: community.version }}
              publicStatus={community.publicStatus}
              prefix="community"
            />
            <DeskVersionNote version={community.version} />
          </>
        }
      >
        <CommunityEditor data={data} surface="review" headless statusForm={false} />
        <Panel title="سابقه پرونده">
          <CaseHistory entries={history} />
        </Panel>
      </Desk>
    </OpsShell>
  );
}
