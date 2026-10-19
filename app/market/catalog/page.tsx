import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, QueueMeta } from '../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { KeyValueList } from '../../../src/ui/key-value.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { allCategories, mergeTargets, productDetail, productReviewQueue } from '../../../src/commerce/catalog.ts';
import { ProductDecisionForm, ProductMergeForm } from '../../../src/marketplace/settlement-forms.tsx';

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
 * DS P09: there is no `[id]` route, so each case card carries its own desk
 * (publish / send back, merge) under the facts.
 */
export default async function CatalogReviewPage() {
  const guard = await guardRoute('/market/catalog');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

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
  const details = await Promise.all(queue.map((entry) => productDetail(db(), entry.id)));

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
        <CaseList label="کالاهای در انتظار بررسی" testId="catalog-queue">
          {queue.map((entry, index) => {
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
                <div className="space-y-md">
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
                      {
                        key: 'تصویرها',
                        value:
                          detail.media.length === 0 ? (
                            'ندارد'
                          ) : (
                            <span className="flex flex-wrap gap-sm">
                              {detail.media.map((image) => (
                                <Link key={image.id} href={'/api/files/' + image.fileId} className="hz-link">
                                  {image.altFa}
                                </Link>
                              ))}
                            </span>
                          ),
                      },
                    ]}
                  />
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
                </div>
              </CaseItem>
            );
          })}
        </CaseList>
      )}
    </OpsShell>
  );
}
