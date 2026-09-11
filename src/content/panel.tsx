import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '../db/client.ts';
import type { Actor } from '../authz/actor.ts';
import { OpsShell, AUTHOR_NAV, CONTENT_NAV } from '../ui/shell.tsx';
import { Card } from '../ui/card.tsx';
import { Alert } from '../ui/alert.tsx';
import { StatusBadge, type StatusTone } from '../ui/status.tsx';
import { EmptyState } from '../ui/states.tsx';
import { ButtonLink } from '../ui/button.tsx';
import { contentForEditing, contentForPanel } from './service.ts';
import { restrictionMessage } from '../moderation/restrictions.ts';
import {
  CONTENT_KINDS,
  CONTENT_STATUSES,
  KIND_FA,
  KIND_PATH,
  MOVE_FA,
  PANEL_BASE,
  PUBLIC_STATE_FA,
  STATUS_FA,
  creatableKinds,
  editorPathFor,
  formatInstantFa,
  formatSources,
  isContentKind,
  isContentStatus,
  reasonRequired,
  type ContentPanel,
  type ContentStatus,
  type PublicState,
} from './model.ts';
import { ContentFieldsForm, ContentImageForm, ContentStatusForm, CreateContentForm, RestoreRevisionButton } from './editor.tsx';

const TITLE: Record<ContentPanel, string> = { author: 'محیط نویسنده', content: 'ادمین محتوا' };
const NAV = { author: AUTHOR_NAV, content: CONTENT_NAV } as const;

const STATE_TONE: Record<PublicState, StatusTone> = {
  VISIBLE: 'success',
  SCHEDULED: 'info',
  ARCHIVED: 'neutral',
  NOT_PUBLIC: 'neutral',
};

const STATUS_TONE: Record<ContentStatus, StatusTone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  HIDDEN: 'warning',
  ARCHIVED: 'neutral',
  DELETED: 'error',
};

type Search = { status?: string | string[]; kind?: string | string[]; page?: string | string[] };
const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';
const fa = (value: number): string => value.toLocaleString('fa-IR');

/** The list of content in one environment: an author's own, or everything for the content admin. */
export async function ContentPanelList({ actor, panel, search }: { actor: Actor; panel: ContentPanel; search: Search }) {
  const status = isContentStatus(one(search.status)) ? (one(search.status) as ContentStatus) : null;
  const kind = isContentKind(one(search.kind)) ? one(search.kind) : null;
  const pageNumber = Number(one(search.page));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1;
  const result = await contentForPanel(db(), actor, { status, kind: kind as never, page });
  const base = PANEL_BASE[panel];
  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (kind) params.set('kind', kind);
    if (target > 1) params.set('page', String(target));
    const encoded = params.toString();
    return base + (encoded ? '?' + encoded : '');
  };

  return (
    <OpsShell actor={actor} title={TITLE[panel]} pathname={base} nav={NAV[panel]}>
      <div className="space-y-lg">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-md">
            <div>
              <h1 className="text-h4">{panel === 'author' ? 'نوشته‌های من' : 'همه محتوا'}</h1>
              <p className="text-body-sm text-text-secondary">
                {panel === 'author'
                  ? 'آموزش و خبری که نوشته‌اید، با وضعیت انتشار هرکدام.'
                  : 'همه آموزش‌ها، خبرها و اطلاعیه‌ها، از هر نویسنده.'}
              </p>
            </div>
            <ButtonLink href={base + '/new'} data-testid="new-content-link">
              نوشته تازه
            </ButtonLink>
          </div>
          <form method="get" action={base} className="mt-lg flex flex-wrap items-end gap-md" data-testid="panel-filter">
            <label className="space-y-xs text-label-md">
              <span className="block">وضعیت</span>
              <select name="status" defaultValue={status ?? ''} className="min-h-[var(--size-control-md)] rounded-md border border-border-subtle bg-bg-surface px-md text-body-sm">
                <option value="">همه</option>
                {CONTENT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_FA[value]}
                  </option>
                ))}
              </select>
            </label>
            {panel === 'content' ? (
              <label className="space-y-xs text-label-md">
                <span className="block">نوع</span>
                <select name="kind" defaultValue={kind ?? ''} className="min-h-[var(--size-control-md)] rounded-md border border-border-subtle bg-bg-surface px-md text-body-sm">
                  <option value="">همه</option>
                  {CONTENT_KINDS.filter((value) => value !== 'CLUB_POST').map((value) => (
                    <option key={value} value={value}>
                      {KIND_FA[value]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <ButtonLink tone="ghost" href={base}>
              همه
            </ButtonLink>
            <button type="submit" className="min-h-[var(--size-control-md)] rounded-md border border-border-brand px-lg text-label-md text-text-brand">
              فیلتر
            </button>
          </form>
        </Card>

        {result.items.length === 0 ? (
          <EmptyState
            title={status || kind ? 'محتوایی با این فیلتر نیست' : 'هنوز محتوایی نیست'}
            description={status || kind ? 'فیلتر را بردارید.' : 'با «نوشته تازه» اولین پیش‌نویس را بسازید.'}
          />
        ) : (
          <ul className="space-y-sm" data-testid="panel-content-list">
            {result.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={editorPathFor(panel, item.id)}
                  className="block rounded-lg border border-border-subtle bg-bg-surface p-lg hover:border-border-brand"
                  data-testid={'panel-item-' + item.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-caption text-text-secondary">{KIND_FA[item.kind]}</p>
                      <p className="text-label-lg text-text-primary">{item.titleFa}</p>
                    </div>
                    <div className="flex flex-wrap gap-xs">
                      <StatusBadge tone={STATUS_TONE[item.status]}>{STATUS_FA[item.status]}</StatusBadge>
                      <StatusBadge tone={STATE_TONE[item.publicState]}>
                        <span data-testid={'panel-item-state-' + item.id}>{PUBLIC_STATE_FA[item.publicState]}</span>
                      </StatusBadge>
                    </div>
                  </div>
                  <p className="mt-sm text-caption text-text-secondary">
                    {'آخرین تغییر: ' + formatInstantFa(item.updatedAt) + ' · نسخه ' + fa(item.revisionNumber)}
                    {item.publicState === 'SCHEDULED' && item.publishAt ? ' · انتشار: ' + formatInstantFa(item.publishAt) : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {result.totalPages > 1 ? (
          <nav aria-label="صفحه‌بندی" className="flex items-center justify-between gap-md">
            {result.page > 1 ? <ButtonLink tone="secondary" href={hrefFor(result.page - 1)}>صفحه قبل</ButtonLink> : <span />}
            <span className="text-body-sm text-text-secondary">{'صفحه ' + fa(result.page) + ' از ' + fa(result.totalPages)}</span>
            {result.page < result.totalPages ? <ButtonLink tone="secondary" href={hrefFor(result.page + 1)}>صفحه بعد</ButtonLink> : <span />}
          </nav>
        ) : null}
      </div>
    </OpsShell>
  );
}

export function NewContentView({ actor, panel }: { actor: Actor; panel: ContentPanel }) {
  const role = actor.context === 'CONTENT_ADMIN' ? 'CONTENT_ADMIN' : 'AUTHOR';
  return (
    <OpsShell actor={actor} title={TITLE[panel]} pathname={PANEL_BASE[panel] + '/new'} nav={NAV[panel]}>
      <CreateContentForm panel={panel} kinds={creatableKinds(role).map((value) => ({ value, label: KIND_FA[value] }))} />
    </OpsShell>
  );
}

export async function ContentEditorView({ actor, panel, contentId }: { actor: Actor; panel: ContentPanel; contentId: string }) {
  const data = await contentForEditing(db(), actor, contentId);
  if (data === null) notFound();
  const { row, role, isOwner } = data;
  const publicPath = KIND_PATH[row.kind];

  const item = {
    id: row.id,
    kind: row.kind,
    version: row.version,
    slug: row.slug,
    titleFa: row.titleFa,
    summaryFa: row.summaryFa,
    bodyFa: row.bodyFa,
    sourcesText: formatSources(row.sources),
    tagsText: row.tags.join('، '),
    categoryId: row.categoryId,
    speciesCode: row.speciesCode,
    breedId: row.breedId,
    imageFileId: row.imageFileId,
    imageAltFa: row.imageAltFa,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    reviewedOn: row.reviewedOn,
  };

  return (
    <OpsShell actor={actor} title={TITLE[panel]} pathname={PANEL_BASE[panel]} nav={NAV[panel]}>
      <div className="space-y-lg">
        <Link href={PANEL_BASE[panel]} className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به فهرست
        </Link>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div className="min-w-0">
              <p className="text-caption text-text-secondary">{KIND_FA[row.kind]}</p>
              <h1 className="text-h4">{row.titleFa}</h1>
            </div>
            <div className="flex flex-wrap gap-xs">
              <StatusBadge tone={STATUS_TONE[row.status]}>
                <span data-testid="content-status">{STATUS_FA[row.status]}</span>
              </StatusBadge>
              <StatusBadge tone={STATE_TONE[data.publicState]}>
                <span data-testid="content-public-state">{PUBLIC_STATE_FA[data.publicState]}</span>
              </StatusBadge>
            </div>
          </div>
          <p className="mt-md text-caption text-text-secondary">
            {'نسخه ' + fa(row.revisionNumber) + ' · امضای عمومی: ' + data.byline}
            {row.publishAt ? ' · زمان انتشار: ' + formatInstantFa(row.publishAt) : ''}
          </p>
          {publicPath && (data.publicState === 'VISIBLE' || data.publicState === 'ARCHIVED') ? (
            <p className="mt-sm">
              <Link href={publicPath + '/' + row.slug} className="text-label-md text-text-brand underline underline-offset-4" data-testid="content-public-link">
                مشاهده در سایت
              </Link>
            </p>
          ) : null}
        </Card>

        {row.moderationNote && (row.status === 'HIDDEN' || row.status === 'DELETED') ? (
          <Alert tone="warning" title={row.status === 'HIDDEN' ? 'ادمین محتوا این محتوا را پنهان کرده است' : 'این محتوا حذف شده است'}>
            <span data-testid="content-moderation-note">{row.moderationNote}</span>
          </Alert>
        ) : null}

        {row.correctionNote ? (
          <Alert tone="info" title="ادمین محتوا اصلاح این نوشته را خواسته است">
            <span data-testid="content-correction-note">{row.correctionNote}</span>
            <span className="mt-xs block text-caption">با ذخیره نسخه اصلاح‌شده، درخواست بسته می‌شود.</span>
          </Alert>
        ) : null}

        {data.restriction ? (
          <Alert tone="warning" title={panel === 'author' ? 'انتشار برای حساب شما محدود است' : 'این نویسنده محدودیت انتشار دارد'}>
            <span data-testid="content-restriction">{restrictionMessage(data.restriction)}</span>
          </Alert>
        ) : null}

        <ContentFieldsForm
          panel={panel}
          item={item}
          canEdit={data.canEdit}
          categories={data.categories.map((category) => ({
            value: category.id,
            label: category.nameFa + (category.isActive ? '' : ' (کنارگذاشته)'),
          }))}
          breeds={data.breeds.map((breed) => ({ value: breed.id, label: breed.nameFa + ' — ' + breed.nameEn }))}
          species={data.species.map((row) => ({ value: row.code, label: row.nameFa }))}
        />

        {data.canEdit ? <ContentImageForm panel={panel} item={item} /> : null}

        {data.moves.length > 0 ? (
          <ContentStatusForm
            panel={panel}
            item={item}
            moves={data.moves.map((to) => ({
              value: to,
              label: MOVE_FA[to],
              needsReason: reasonRequired(role, row.status, to, isOwner),
            }))}
          />
        ) : null}

        <Card>
          <h2 className="text-label-lg">نسخه‌ها</h2>
          <ul className="mt-lg space-y-sm" data-testid="content-revisions">
            {data.revisions.map((revision) => (
              <li key={revision.number} className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-border-subtle p-md">
                <div>
                  <p className="text-label-md">{'نسخه ' + fa(revision.number)}</p>
                  <p className="text-caption text-text-secondary">
                    {formatInstantFa(revision.createdAt)}
                    {revision.note ? ' · ' + revision.note : ''}
                  </p>
                </div>
                {data.canEdit && revision.number !== row.revisionNumber ? (
                  <RestoreRevisionButton panel={panel} item={item} revisionNumber={revision.number} />
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </OpsShell>
  );
}
