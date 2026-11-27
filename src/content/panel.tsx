import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '../db/client.ts';
import type { Actor } from '../authz/actor.ts';
import { OpsShell, AUTHOR_NAV, CONTENT_NAV } from '../ui/shell.tsx';
import { Icon } from '../ui/icon.tsx';
import { DeskHead, Panel } from '../ui/desk.tsx';
import { Pagination } from '../ui/pagination.tsx';
import { SelectField } from '../ui/field.tsx';
import { ActionRow, Button } from '../ui/button.tsx';
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

/** Shell titles follow the nav labels, so the h1 names the page (one h1, rendered by the shell). */
const TITLE: Record<ContentPanel, string> = { author: 'نوشته‌های من', content: 'همه محتوا' };
const NEW_TITLE: Record<ContentPanel, string> = { author: 'نوشته تازه', content: 'محتوای تازه' };
const NAV = { author: AUTHOR_NAV, content: CONTENT_NAV } as const;

// GAPS #4: no dictionary key for the public-visibility axis VISIBLE / ARCHIVED («نشانی باز است») / NOT_PUBLIC;
// SCHEDULED is a dictionary key. The content status itself is always a key.
const STATE_TONE: Record<Exclude<PublicState, 'SCHEDULED'>, StatusTone> = {
  VISIBLE: 'success',
  ARCHIVED: 'neutral',
  NOT_PUBLIC: 'neutral',
};

function PublicStateBadge({ state, testId }: { state: PublicState; testId: string }) {
  if (state === 'SCHEDULED') {
    return (
      <span data-testid={testId}>
        <StatusBadge status="SCHEDULED" size="sm" />
      </span>
    );
  }
  return (
    <StatusBadge tone={STATE_TONE[state]} size="sm">
      <span data-testid={testId}>{PUBLIC_STATE_FA[state]}</span>
    </StatusBadge>
  );
}

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
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="hz-page-header__meta">
          <span className="hz-page-header__meta-item">
            {panel === 'author'
              ? 'آموزش و خبری که نوشته‌اید، با وضعیت انتشار هرکدام.'
              : 'همه آموزش‌ها، خبرها و اطلاعیه‌ها، از هر نویسنده.'}
          </span>
        </p>
        <ButtonLink href={base + '/new'} tone="secondary" size="sm" iconStart="plus" data-testid="new-content-link">
          نوشته تازه
        </ButtonLink>
      </div>

      <form method="get" action={base} className="hz-card hz-card--compact flex flex-wrap items-end gap-md" data-testid="panel-filter" role="search">
        <div className="min-w-0 flex-1 basis-48">
          <SelectField
            label="وضعیت"
            name="status"
            defaultValue={status ?? ''}
            placeholder="همه"
            options={CONTENT_STATUSES.map((value) => ({ value, label: STATUS_FA[value] }))}
          />
        </div>
        {panel === 'content' ? (
          <div className="min-w-0 flex-1 basis-48">
            <SelectField
              label="نوع"
              name="kind"
              defaultValue={kind ?? ''}
              placeholder="همه"
              options={CONTENT_KINDS.filter((value) => value !== 'CLUB_POST').map((value) => ({ value, label: KIND_FA[value] }))}
            />
          </div>
        ) : null}
        <ActionRow
          primary={
            <Button type="submit" tone="secondary">
              فیلتر
            </Button>
          }
          secondary={
            status || kind ? (
              <ButtonLink tone="ghost" href={base}>
                همه
              </ButtonLink>
            ) : null
          }
        />
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          title={status || kind ? 'محتوایی با این فیلتر نیست' : 'هنوز محتوایی نیست'}
          description={status || kind ? 'فیلتر را بردارید.' : 'با «نوشته تازه» اولین پیش‌نویس را بسازید.'}
          action={
            status || kind ? (
              <ButtonLink tone="secondary" size="sm" href={base}>
                پاک کردن فیلترها
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <div data-testid="panel-content-list">
          <div className="hz-table-wrap">
            <table className="hz-table hz-table--dense hz-table--stack">
              <caption className="hz-visually-hidden">{TITLE[panel]}</caption>
              <thead>
                <tr>
                  <th scope="col">عنوان</th>
                  <th scope="col">نوع</th>
                  <th scope="col">وضعیت</th>
                  <th scope="col">نمایش عمومی</th>
                  <th scope="col">
                    <span className="hz-visually-hidden">باز کردن</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.id}>
                    <td className="hz-table__lead">
                      <div className="hz-case">
                        <Link className="hz-case__name" href={editorPathFor(panel, item.id)} data-testid={'panel-item-' + item.id}>
                          {item.titleFa}
                        </Link>
                        <span className="hz-case__sub">
                          {'آخرین تغییر: ' + formatInstantFa(item.updatedAt) + ' · نسخه ' + fa(item.revisionNumber)}
                          {item.publicState === 'SCHEDULED' && item.publishAt ? ' · انتشار: ' + formatInstantFa(item.publishAt) : ''}
                        </span>
                      </div>
                    </td>
                    <td data-label="نوع">{KIND_FA[item.kind]}</td>
                    <td data-label="وضعیت">
                      <StatusBadge status={item.status} size="sm" />
                    </td>
                    <td data-label="نمایش عمومی">
                      <PublicStateBadge state={item.publicState} testId={'panel-item-state-' + item.id} />
                    </td>
                    <td className="hz-table__open">
                      <Link className="hz-icon-btn hz-icon-btn--sm" href={editorPathFor(panel, item.id)} aria-hidden="true" tabIndex={-1}>
                        <Icon name="caretRight" size="sm" mirror />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages} hrefFor={hrefFor} />
    </OpsShell>
  );
}

export function NewContentView({ actor, panel }: { actor: Actor; panel: ContentPanel }) {
  const role = actor.context === 'CONTENT_ADMIN' ? 'CONTENT_ADMIN' : 'AUTHOR';
  return (
    <OpsShell actor={actor} title={NEW_TITLE[panel]} pathname={PANEL_BASE[panel] + '/new'} nav={NAV[panel]}>
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
    <OpsShell actor={actor} title={row.titleFa} pathname={PANEL_BASE[panel]} nav={NAV[panel]}>
      <Link href={PANEL_BASE[panel]} className="hz-link hz-link--standalone hz-hide-md">
        بازگشت به فهرست
      </Link>

      <DeskHead
        title={KIND_FA[row.kind]}
        status={{ key: row.status, testId: 'content-status' }}
        meta={[
          'نسخه ' + fa(row.revisionNumber),
          'امضای عمومی: ' + data.byline,
          row.publishAt ? 'زمان انتشار: ' + formatInstantFa(row.publishAt) : null,
          <PublicStateBadge key="public" state={data.publicState} testId="content-public-state" />,
        ]}
      >
        {publicPath && (data.publicState === 'VISIBLE' || data.publicState === 'ARCHIVED') ? (
          <p>
            <Link href={publicPath + '/' + row.slug} className="hz-link hz-link--standalone" data-testid="content-public-link">
              مشاهده در سایت
            </Link>
          </p>
        ) : null}
      </DeskHead>

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

      <div className="hz-desk">
        <div className="min-w-0 space-y-lg">
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
        </div>

        <div className="min-w-0 space-y-lg">
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

          <Panel title="نسخه‌ها" count={fa(data.revisions.length)}>
            <ul className="divide-y divide-border-subtle" data-testid="content-revisions">
              {data.revisions.map((revision) => (
                <li key={revision.number} className="flex flex-wrap items-center justify-between gap-sm py-sm first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-label-sm">
                      {'نسخه ' + fa(revision.number)}
                      {revision.number === row.revisionNumber ? <span className="text-caption font-normal text-text-secondary"> · فعلی</span> : null}
                    </p>
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
          </Panel>
        </div>
      </div>
    </OpsShell>
  );
}
