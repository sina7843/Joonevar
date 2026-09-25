import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { allCategories, mergeTargets, productDetail, productReviewQueue } from '../../../src/commerce/catalog.ts';
import { PRODUCT_STATUS_FA, type ProductStatus } from '../../../src/commerce/catalog-model.ts';
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
      <div className="space-y-lg">
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
          <ul className="space-y-lg" data-testid="catalog-queue">
            {queue.map((entry, index) => {
              const detail = details[index]!;
              return (
                <li key={entry.id}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-sm">
                      <StatusBadge tone="neutral">
                        <span data-testid={'catalog-status-' + entry.id}>
                          {PRODUCT_STATUS_FA[entry.status as ProductStatus] ?? entry.status}
                        </span>
                      </StatusBadge>
                      <span className="text-label-lg">{entry.nameFa}</span>
                      <span className="text-caption text-text-secondary">{entry.brandFa ?? 'بدون برند'}</span>
                      <span className="text-caption text-text-secondary">{entry.categoryNameFa}</span>
                      <span className="text-caption text-text-secondary">{entry.sellerNameFa ?? 'کاتالوگ مشترک'}</span>
                      <span className="text-caption text-text-secondary">{when(entry.createdAt)}</span>
                    </div>

                    <dl className="mt-lg grid gap-sm text-body-sm md:grid-cols-2">
                      <div>
                        <dt className="text-caption text-text-secondary">بارکد</dt>
                        <dd>
                          <bdi className="hz-ltr font-mono">{entry.barcode ?? '—'}</bdi>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-text-secondary">تنوع‌ها</dt>
                        <dd data-testid={'catalog-variants-' + entry.id}>
                          {detail.variants.length === 0
                            ? 'تک‌نوع'
                            : detail.variants.map((variant) => variant.labelFa).join('، ')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-text-secondary">مناسب برای</dt>
                        <dd>{detail.speciesCodes.join('، ') || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-caption text-text-secondary">تصویرها</dt>
                        <dd>
                          {detail.media.length === 0
                            ? 'ندارد'
                            : detail.media.map((image) => (
                                <Link
                                  key={image.id}
                                  href={'/api/files/' + image.fileId}
                                  className="ms-sm text-text-brand"
                                >
                                  {image.altFa}
                                </Link>
                              ))}
                        </dd>
                      </div>
                    </dl>

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
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
