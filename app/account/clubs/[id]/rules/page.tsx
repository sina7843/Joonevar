import Link from 'next/link';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card, CardHeader } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../../src/ui/status.tsx';
import { db } from '../../../../../src/db/client.ts';
import { clubReevaluationHistory, clubRuleWorkbench, previewClubRules } from '../../../../../src/clubs/enrollment.ts';
import { asc, eq } from 'drizzle-orm';
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

/**
 * The club's own rule workbench — Phase 2.5 §9 (PROMPT-013). The draft, what the
 * published rules would do against sample facts, and the audited re-evaluation.
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
        <Alert tone="error" title="این کلاب پیدا نشد یا اجازه نوشتن شرایط آن را ندارید">
          شرایط عضویت هر کلاب را فقط مالک یا مدیر همان کلاب می‌نویسد.
        </Alert>
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

  return (
    <PublicShell actor={guard.actor} title={'شرایط عضویت ' + workbench.club.displayNameFa} pathname="/account/clubs">
      <div className="space-y-lg">
        <Card>
          <CardHeader
            title="شرایط عضویت این کلاب"
            subtitle="شرط‌ها داده‌اند، نه کد: فقط از فهرست مجاز انتخاب می‌شوند و روی واقعیت‌های ثبت‌شده همزیست سنجیده می‌شوند."
            badge={workbench.published ? { tone: 'success', label: 'نسخه ' + fa(workbench.published.versionNumber) + ' در اجرا' } : { tone: 'warning', label: 'هنوز منتشر نشده' }}
          />
          <p className="mt-md text-body-sm text-text-secondary">
            کلاب می‌تواند واقعیت‌ها را بپرسد، ولی هیچ‌کدام را تغییر نمی‌دهد. اعضای کنونی با همان نسخه‌ای که با آن پذیرفته شده‌اند می‌مانند.
          </p>
          <Link href={'/account/clubs/' + id + '/members'} className="mt-md inline-block text-body-sm text-text-brand" data-testid="club-members-link">
            فهرست اعضا و درخواست‌ها
          </Link>
        </Card>

        {workbench.published ? (
          <Card>
            <h2 className="text-label-lg">آنچه اکنون اجرا می‌شود</h2>
            <p className="mt-sm text-body-sm" data-testid="club-published-summary">
              {summaryOf(workbench.published.tree as ClubRuleNode)}
            </p>
            <div className="mt-sm flex flex-wrap gap-xs">
              {workbench.published.feeToman ? <StatusBadge tone="info">{'حق عضویت ' + fa(Number(workbench.published.feeToman)) + ' تومان'}</StatusBadge> : null}
              {workbench.published.membershipDays ? <StatusBadge tone="neutral">{'مدت ' + fa(workbench.published.membershipDays) + ' روز'}</StatusBadge> : null}
              {workbench.published.termsVersion ? <StatusBadge tone="neutral">{'نسخه شرایط ' + workbench.published.termsVersion}</StatusBadge> : null}
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="نوشتن شرایط" subtitle="پس از ذخیره، پیش‌نویس را ببینید و سپس منتشر کنید." />
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
          <Card>
            <CardHeader
              title="پیش‌نمایش با نمونه فرضی"
              subtitle="این پیش‌نمایش روی داده‌های ساختگی اجرا می‌شود؛ پرونده هیچ کاربری خوانده نمی‌شود."
            />
            <p className="mt-md text-body-sm" data-testid="club-preview-result">
              {preview.evaluation.met ? 'با این نمونه، متقاضی پذیرفته می‌شود.' : 'با این نمونه، متقاضی پذیرفته نمی‌شود.'}
            </p>
            {preview.evaluation.unmetFa.length > 0 ? (
              <ul className="mt-sm list-disc space-y-2xs pr-md text-body-sm text-text-secondary" data-testid="club-preview-unmet">
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
            <ul className="mt-lg space-y-xs text-caption text-text-secondary" data-testid="club-reevaluations">
              {campaigns.map((campaign) => (
                <li key={campaign.id}>
                  {formatInstantFa(campaign.createdAt) +
                    ' — ' +
                    fa(campaign.examined) +
                    ' بررسی، ' +
                    fa(campaign.nowIneligible) +
                    ' فاقد شرایط · ' +
                    campaign.reasonFa}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-label-lg">تاریخچه نسخه‌ها</h2>
          <ul className="mt-md space-y-xs text-body-sm" data-testid="club-rule-versions">
            {workbench.versions.map((version) => (
              <li key={version.id}>
                {'نسخه ' + fa(version.versionNumber) + ' — ' + (version.status === 'PUBLISHED' ? 'در اجرا' : version.status === 'DRAFT' ? 'پیش‌نویس' : 'بایگانی') +
                  (version.publishedAt ? ' · ' + formatInstantFa(version.publishedAt) : '')}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PublicShell>
  );
}
