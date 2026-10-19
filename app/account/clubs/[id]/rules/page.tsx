import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card, CardHeader } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../../src/ui/status.tsx';
import { ButtonLink } from '../../../../../src/ui/button.tsx';
import { PageHeader, SectionHeader } from '../../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../../src/ui/page-crumbs.tsx';
import { EmptyState } from '../../../../../src/ui/states.tsx';
import { db } from '../../../../../src/db/client.ts';
import { clubReevaluationHistory, clubRuleWorkbench, previewClubRules } from '../../../../../src/clubs/enrollment.ts';
import { asc } from 'drizzle-orm';
import { referenceBreeds } from '../../../../../src/db/schema/core.ts';
import { RULE_KIND_FA, type ClubRuleKind, type ClubRuleNode } from '../../../../../src/clubs/rules-model.ts';
import { ClubReevaluateForm, ClubRulesForm, ClubRulesPublishForm, type RuleEditorValue } from '../../../../../src/clubs/rules-forms.tsx';
import { formatInstantFa } from '../../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/** Read a stored tree back into the flat fields the editor shows. */
function editorValues(tree: ClubRuleNode | null): RuleEditorValue[] {
  const values: RuleEditorValue[] = [];
  const walk = (node: ClubRuleNode, alternative: boolean): void => {
    if (node.type === 'GROUP') {
      node.children.forEach((child) => walk(child, alternative || node.op === 'ANY'));
      return;
    }
    values.push({
      kind: node.kind,
      chosen: true,
      alternative,
      minCount: typeof node.params?.minCount === 'number' ? node.params.minCount : undefined,
      breedId: typeof node.params?.breedId === 'string' ? node.params.breedId : null,
      vetStatus: typeof node.params?.status === 'string' ? node.params.status : undefined,
    });
  };
  if (tree) walk(tree, false);
  return values;
}

function summaryOf(tree: ClubRuleNode): string {
  const walk = (node: ClubRuleNode): string => {
    if (node.type === 'RULE') return RULE_KIND_FA[node.kind as ClubRuleKind];
    const joined = node.children.map(walk).join(node.op === 'ALL' ? ' + ' : ' یا ');
    return node.children.length > 1 ? '(' + joined + ')' : joined;
  };
  return walk(tree);
}

/** One P11 setting row: Persian name, value at the end, «تعیین‌نشده» when unset. */
function SettingRow({ name, value }: { name: string; value: string | null }) {
  return (
    <div className="hz-setting">
      <div className="hz-setting__label">
        <span className="hz-setting__name">{name}</span>
      </div>
      <div className="hz-setting__end">
        {value === null ? (
          <span className="hz-setting__value hz-setting__value--unset">تعیین‌نشده</span>
        ) : (
          <span className="hz-setting__value">{value}</span>
        )}
      </div>
    </div>
  );
}

/**
 * The club's own rule workbench — Phase 2.5 §9 (PROMPT-013). The draft, what the
 * published rules would do against sample facts, and the audited re-evaluation.
 * P11: the rules are the club's settings — published values as setting rows,
 * one edit area, every change versioned in «تاریخچه نسخه‌ها».
 */
export default async function ClubRulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = '/account/clubs/' + id + '/rules';
  const guard = await guardRoute(path);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let workbench;
  try {
    workbench = await clubRuleWorkbench(db(), guard.actor, id);
  } catch {
    return (
      <PublicShell actor={guard.actor} title="شرایط عضویت کلاب" pathname="/account/clubs">
        <EmptyState
          icon="lockSimple"
          title="این کلاب پیدا نشد یا اجازه نوشتن شرایط آن را ندارید"
          description="شرایط عضویت هر کلاب را فقط مالک یا مدیر همان کلاب می‌نویسد."
          action={
            <ButtonLink tone="secondary" href="/account/clubs">
              کلاب من
            </ButtonLink>
          }
        />
      </PublicShell>
    );
  }

  const [breeds, campaigns] = await Promise.all([
    // The rules name a breed by its id, which is what the facts are counted by.
    db()
      .select({ id: referenceBreeds.id, nameFa: referenceBreeds.nameFa })
      .from(referenceBreeds)
      .orderBy(asc(referenceBreeds.nameFa)),
    clubReevaluationHistory(db(), guard.actor, id),
  ]);
  const editing = workbench.draft ?? workbench.published;
  const preview = editing
    ? await previewClubRules(db(), guard.actor, { clubId: id, ruleVersionId: editing.id })
    : null;
  const title = 'شرایط عضویت ' + workbench.club.displayNameFa;
  const published = workbench.published;

  return (
    <PublicShell
      actor={guard.actor}
      title={title}
      pathname="/account/clubs"
      header={
        <div>
          <PageCrumbs
            items={[
              { href: '/dashboard', name: 'خانه' },
              { href: '/account/clubs', name: 'کلاب من' },
              { href: '/account/clubs/' + id, name: workbench.club.displayNameFa },
              { name: 'شرایط عضویت' },
            ]}
          />
          <PageHeader
            title={title}
            back={{ href: '/account/clubs/' + id, label: workbench.club.displayNameFa }}
            aside={
              published ? (
                <StatusBadge tone="success">{'نسخه ' + fa(published.versionNumber) + ' در اجرا'}</StatusBadge>
              ) : (
                <StatusBadge tone="warning">هنوز منتشر نشده</StatusBadge>
              )
            }
            meta={['شرط‌ها داده‌اند، نه کد: فقط از فهرست مجاز انتخاب می‌شوند و روی واقعیت‌های ثبت‌شده همزیست سنجیده می‌شوند.']}
            actions={
              <ButtonLink tone="secondary" href={'/account/clubs/' + id + '/members'} iconStart="users" data-testid="club-members-link">
                فهرست اعضا و درخواست‌ها
              </ButtonLink>
            }
          />
        </div>
      }
    >
      <Alert tone="info" title="کلاب واقعیت‌ها را می‌پرسد، تغییر نمی‌دهد">
        اعضای کنونی با همان نسخه‌ای که با آن پذیرفته شده‌اند می‌مانند.
      </Alert>

      {published ? (
        <Card>
          <SectionHeader size="sm" title="آنچه اکنون اجرا می‌شود" />
          <p className="mt-sm text-body-sm" data-testid="club-published-summary">
            {summaryOf(published.tree as ClubRuleNode)}
          </p>
          <div className="mt-sm">
            <SettingRow name="حق عضویت" value={published.feeToman ? fa(Number(published.feeToman)) + ' تومان' : null} />
            <SettingRow name="مدت عضویت" value={published.membershipDays ? fa(published.membershipDays) + ' روز' : null} />
            <SettingRow name="نسخه شرایط" value={published.termsVersion ?? null} />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="شرایط عضویت این کلاب" subtitle="پس از ذخیره، پیش‌نویس را ببینید و سپس منتشر کنید." />
        <div className="mt-md">
          <ClubRulesForm
            clubId={id}
            values={editorValues((workbench.draft?.tree ?? workbench.published?.tree ?? null) as ClubRuleNode | null)}
            breeds={breeds.map((row) => ({ value: row.id, label: row.nameFa }))}
            terms={{
              termsFa: editing?.termsFa ?? null,
              termsVersion: editing?.termsVersion ?? null,
              feeToman: editing?.feeToman === null || editing?.feeToman === undefined ? null : String(editing.feeToman),
              membershipDays: editing?.membershipDays === null || editing?.membershipDays === undefined ? null : String(editing.membershipDays),
              noteFa: editing?.noteFa ?? null,
            }}
          />
        </div>
      </Card>

      {preview ? (
        <Card variant="subtle">
          <CardHeader
            title="پیش‌نمایش با نمونه فرضی"
            subtitle="این پیش‌نمایش روی داده‌های ساختگی اجرا می‌شود؛ پرونده هیچ کاربری خوانده نمی‌شود."
          />
          <p className="mt-md text-body-sm" data-testid="club-preview-result">
            {preview.evaluation.met ? 'با این نمونه، متقاضی پذیرفته می‌شود.' : 'با این نمونه، متقاضی پذیرفته نمی‌شود.'}
          </p>
          {preview.evaluation.unmetFa.length > 0 ? (
            <ul className="mt-sm list-disc space-y-2xs ps-md text-body-sm text-text-secondary" data-testid="club-preview-unmet">
              {preview.evaluation.unmetFa.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {workbench.draft ? (
        <Card>
          <CardHeader title="انتشار پیش‌نویس" subtitle="از لحظه انتشار، درخواست‌های تازه با این نسخه سنجیده می‌شوند." />
          <div className="mt-md">
            <ClubRulesPublishForm clubId={id} ruleVersionId={workbench.draft.id} version={workbench.draft.version} />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="بازبینی اعضای کنونی" />
        <div className="mt-md">
          <ClubReevaluateForm clubId={id} activeMembers={workbench.activeMembers} />
        </div>
        {campaigns.length > 0 ? (
          <ul className="mt-lg" data-testid="club-reevaluations">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="hz-setting hz-setting--text">
                <div className="hz-setting__label">
                  <span className="hz-setting__name">{formatInstantFa(campaign.createdAt)}</span>
                  <span className="hz-setting__hint">{fa(campaign.examined) + ' بررسی، ' + fa(campaign.nowIneligible) + ' فاقد شرایط'}</span>
                </div>
                <span className="hz-setting__value">{campaign.reasonFa}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card>
        <SectionHeader size="sm" title="تاریخچه نسخه‌ها" count={workbench.versions.length > 0 ? fa(workbench.versions.length) : undefined} />
        {workbench.versions.length === 0 ? (
          <p className="mt-md text-body-sm text-text-secondary">هنوز نسخه‌ای ذخیره نشده است.</p>
        ) : (
          <ul className="mt-sm" data-testid="club-rule-versions">
            {workbench.versions.map((version) => (
              <li key={version.id} className="hz-setting">
                <div className="hz-setting__label">
                  <span className="hz-setting__name">{'نسخه ' + fa(version.versionNumber)}</span>
                  {version.publishedAt ? <span className="hz-setting__hint">{formatInstantFa(version.publishedAt)}</span> : null}
                </div>
                <div className="hz-setting__end">
                  <StatusBadge size="sm" status={version.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PublicShell>
  );
}
