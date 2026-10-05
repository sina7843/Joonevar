import Link from 'next/link';

/**
 * The record variant of DS *PageHeader* puts the trail above the title from
 * 768px (`.hz-page-header__crumbs`); below it PageHeader's own «بازگشت» link
 * takes over. Private pages, so no BreadcrumbList structured data (that stays
 * with the public `Breadcrumbs`).
 */
export function PageCrumbs({ items }: { items: ReadonlyArray<{ name: string; href?: string }> }) {
  return (
    <nav aria-label="مسیر صفحه" className="hz-page-header__crumbs">
      <ol className="hz-breadcrumbs">
        {items.map((item, index) => [
          index > 0 ? (
            <li key={index + '-sep'} className="hz-breadcrumbs__sep" aria-hidden="true">
              /
            </li>
          ) : null,
          <li key={index}>
            {item.href ? <Link href={item.href}>{item.name}</Link> : <span aria-current="page">{item.name}</span>}
          </li>,
        ])}
      </ol>
    </nav>
  );
}
