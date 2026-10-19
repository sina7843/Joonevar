import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, CONTENT_NAV } from '../../../src/ui/shell.tsx';
import { Panel } from '../../../src/ui/desk.tsx';
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
    <OpsShell actor={guard.actor} title="دسته‌ها" pathname="/content/categories" nav={CONTENT_NAV}>
      <div className="grid items-start gap-lg lg:grid-cols-2">
        <Panel title="دسته‌ها" count={categories.length.toLocaleString('fa-IR')}>
          {categories.length === 0 ? (
            <EmptyState title="هنوز دسته‌ای نیست" description="دسته‌ها اختیاری‌اند؛ برای مرتب‌کردن آموزش‌ها و خبرها بسازید." />
          ) : (
            <ul data-testid="category-list">
              {categories.map((category) => (
                <li key={category.id} className="hz-setting">
                  <div className="hz-setting__label">
                    <span className="hz-setting__name">{category.nameFa}</span>
                    <span className="hz-setting__hint">
                      {KIND_FA[category.kind] + ' · '}
                      <bdi className="hz-setting__key" dir="ltr">{category.slug}</bdi>
                    </span>
                  </div>
                  <div className="hz-setting__end">
                    <StatusBadge status={category.isActive ? 'ACTIVE' : 'INACTIVE'} />
                    <CategoryStateForm categoryId={category.id} active={category.isActive} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <CreateCategoryForm kinds={creatableKinds('CONTENT_ADMIN').map((value) => ({ value, label: KIND_FA[value] }))} />
      </div>
    </OpsShell>
  );
}
