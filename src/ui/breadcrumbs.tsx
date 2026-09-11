import Link from 'next/link';
import { Icon } from './icon.tsx';
import { JsonLdScript } from '../seo/json-ld.tsx';
import { breadcrumbLd, type Crumb } from '../seo/structured-data.ts';

/**
 * Breadcrumb trail and its BreadcrumbList, from one list of crumbs.
 *
 * The visible trail and the structured data are rendered together so they can
 * never disagree. The trail reads right to left; the caret points left, toward
 * the next, deeper step, so it needs no mirroring.
 */
export function Breadcrumbs({ items, origin }: { items: readonly Crumb[]; origin: string }) {
  return (
    <>
      <nav aria-label="مسیر صفحه" data-testid="breadcrumbs">
        <ol className="flex flex-wrap items-center gap-xs text-caption text-text-secondary">
          {items.map((item, index) => {
            const last = index === items.length - 1;
            return (
              <li key={item.path} className="flex items-center gap-xs">
                {index > 0 ? <Icon name="caretLeft" size="xs" /> : null}
                {last ? (
                  <span aria-current="page" className="text-text-primary">
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.path} className="hover:text-text-brand">
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLdScript data={breadcrumbLd(items, origin)} />
    </>
  );
}
