import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, CONTENT_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { allCategories } from '../../../src/content/service.ts';
import { KIND_FA, creatableKinds } from '../../../src/content/model.ts';
import { CategoryStateForm, CreateCategoryForm } from '../../../src/content/editor.tsx';

export const dynamic = 'force-dynamic';

/** Categories per content type (§12). Retiring one keeps it on the content that already uses it. */
export default async function ContentCategoriesPage() {
  const guard = await guardRoute('/content/categories');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const categories = await allCategories(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="ادمین محتوا" pathname="/content/categories" nav={CONTENT_NAV}>
      <div className="space-y-lg">
        <CreateCategoryForm kinds={creatableKinds('CONTENT_ADMIN').map((value) => ({ value, label: KIND_FA[value] }))} />
        <Card>
          <h2 className="text-label-lg">دسته‌ها</h2>
          {categories.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="هنوز دسته‌ای نیست" description="دسته‌ها اختیاری‌اند؛ برای مرتب‌کردن آموزش‌ها و خبرها بسازید." />
            </div>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="category-list">
              {categories.map((category) => (
                <li key={category.id} className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-border-subtle p-md">
                  <div>
                    <p className="text-label-md">{category.nameFa}</p>
                    <p className="text-caption text-text-secondary">
                      {KIND_FA[category.kind] + ' · '}
                      <bdi>{category.slug}</bdi>
                    </p>
                  </div>
                  <div className="flex items-center gap-sm">
                    <StatusBadge tone={category.isActive ? 'success' : 'neutral'}>{category.isActive ? 'فعال' : 'کنارگذاشته'}</StatusBadge>
                    <CategoryStateForm categoryId={category.id} active={category.isActive} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </OpsShell>
  );
}
