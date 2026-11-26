import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, DeskHead, DeskVersionNote, DocFrame, Panel, QueueMeta } from '../../../src/ui/desk.tsx';
import { CaseDrawer } from '../../../src/ui/desk-drawer.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { KeyValueList } from '../../../src/ui/key-value.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { allCategories, mergeTargets, productDetail, productReviewQueue } from '../../../src/commerce/catalog.ts';
import { ProductDecisionForm, ProductMergeForm } from '../../../src/marketplace/settlement-forms.tsx';
import { QueueFrame } from '../../../src/ui/queue-head.tsx';
import { readQueueQuery, sliceQueue } from '../../../src/domain/queue-query.ts';

export const dynamic = 'force-dynamic';

const when = (value: Date) =>
  new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

/**
 * The catalogue queue — PROMPT-009.
 *
 * Seller-proposed products waiting to be published, merged into a shared base,
 * or sent back with a reason. The blocked categories are printed here too, so
 * the reviewer reads the same sentence a seller would if they tried.
 *
 * DS P09/P10: there is no `[id]` route, so each row opens its desk (facts,
 * images, publish / send back, merge) in a wide Drawer.
 */
export default async function CatalogReviewPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const guard = await guardRoute('/market/catalog');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const query = readQueueQuery(await searchParams);

  let queue;
  let targets;
  try {
    [queue, targets] = await Promise.all([
      productReviewQueue(db(), guard.actor),
      mergeTargets(db(), guard.actor),
    ]);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }

  const categories = await allCategories(db());
  const blocked = categories.filter((category) => category.salePolicy !== 'ALLOWED');
  const page = sliceQueue(queue, query, {
    text: (entry) => [entry.nameFa, entry.brandFa, entry.barcode, entry.categoryNameFa, entry.sellerNameFa].filter(Boolean).join(' '),
    at: (entry) => entry.createdAt,
    name: (entry) => entry.nameFa,
  });
  const details = await Promise.all(page.items.map((entry) => productDetail(db(), entry.id)));

  return (
    <OpsShell actor={guard.actor} title="بررسی کاتالوگ کالا" nav={marketNav(guard.actor)} pathname="/market/catalog">
      <QueueMeta
        total={queue.length}
        noun="کالا در صف بررسی"
        oldestDays={queue.length > 0 ? Math.max(...queue.map((entry) => ageInDays(entry.createdAt) ?? 0)) : null}
      />
      {blocked.length > 0 ? (
        <Alert tone="info" title="دسته‌های بدون فروش عمومی در این فاز">
          <span data-testid="catalog-blocked-note">
            {blocked.map((category) => category.nameFa).join('، ')} — {blocked[0]!.policyNoteFa}
          </span>
        </Alert>
      ) : null}

      {queue.length === 0 ? (
        <div data-testid="catalog-queue-empty">
          <EmptyState
            title="کالایی در انتظار بررسی نیست"
            description="هر کالایی که فروشنده‌ای برای بررسی بفرستد، اینجا می‌آید."
          />
        </div>
      ) : (
        <QueueFrame
          path="/market/catalog"
          params={{ q: query.q || undefined, sort: query.sort === 'oldest' ? undefined : query.sort }}
          query={query}
          page={page}
          all={page.all}
          noun="کالا"
          searchLabel="جست‌وجوی نام یا کد"
          testId="catalog-queue-frame"
        >
          {page.items.length === 0 ? (
            <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را کوتاه‌تر کنید یا پاک کنید." />
          ) : (
            <CaseList label="کالاهای در انتظار بررسی" testId="catalog-queue">
              {page.items.map((entry, index) => {
                const detail = details[index]!;
                return (
                  <CaseItem
                    key={entry.id}
                    type="کالای پیشنهادی"
                    name={entry.nameFa}
                    sub={[entry.brandFa ?? 'بدون برند', entry.categoryNameFa, entry.sellerNameFa ?? 'کاتالوگ مشترک', when(entry.createdAt)].join(' · ')}
                    ageDays={ageInDays(entry.createdAt)}
                    // PENDING_REVIEW here is the catalogue reviewer's queue, not the association's (dictionary PENDING_REVIEW).
                    status={{ ...keyStatus(entry.status === 'PENDING_REVIEW' ? 'SUBMITTED' : entry.status), testId: 'catalog-status-' + entry.id }}
                    owner="SYSTEM"
                    ownerLabel="بررسی کاتالوگ"
                    ownerIsUs
                  >
                    <CaseDrawer title="پرونده کالای پیشنهادی" testId={'open-product-' + entry.id}>
                      <DeskHead
                        title={entry.nameFa}
                        status={keyStatus(entry.status === 'PENDING_REVIEW' ? 'SUBMITTED' : entry.status)}
                        meta={[entry.brandFa ?? 'بدون برند', entry.categoryNameFa, entry.sellerNameFa ?? 'کاتالوگ مشترک', when(entry.createdAt)]}
                      />
                      <Panel title="مشخصات کالا">
                        <KeyValueList
                          twoCol
                          rows={[
                            {
                              key: 'بارکد',
                              value: entry.barcode ? (
                                <bdi className="hz-id" dir="ltr">
                                  {entry.barcode}
                                </bdi>
                              ) : null,
                            },
                            {
                              key: 'تنوع‌ها',
                              value: detail.variants.length === 0 ? 'تک‌نوع' : detail.variants.map((variant) => variant.labelFa).join('، '),
                              testId: 'catalog-variants-' + entry.id,
                            },
                            { key: 'مناسب برای', value: detail.speciesCodes.join('، ') || null },
                          ]}
                        />
                      </Panel>
                      <Panel title="تصویرها" count={detail.media.length.toLocaleString('fa-IR')}>
                        {detail.media.length === 0 ? (
                          <p className="text-body-sm text-text-secondary">تصویری بارگذاری نشده است.</p>
                        ) : (
                          <div className="hz-desk__docs">
                            {detail.media.map((image) => (
                              <DocFrame key={image.id} href={'/api/files/' + image.fileId} label={image.altFa} />
                            ))}
                          </div>
                        )}
                      </Panel>
                      <Panel title="تصمیم">
                        <ProductDecisionForm productId={entry.id} version={entry.version} />
                        <ProductMergeForm
                          productId={entry.id}
                          version={entry.version}
                          targets={targets
                            .filter((target) => target.id !== entry.id)
                            .map((target) => ({
                              value: target.id,
                              label: target.nameFa + (target.barcode ? ' — ' + target.barcode : ''),
                            }))}
                        />
                        <DeskVersionNote version={entry.version} />
                      </Panel>
                    </CaseDrawer>
                  </CaseItem>
                );
              })}
            </CaseList>
          )}
        </QueueFrame>
      )}
    </OpsShell>
  );
}
