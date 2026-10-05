import Link from 'next/link';
import { Icon } from './icon.tsx';
import { JsonLdScript } from '../seo/json-ld.tsx';
import { breadcrumbLd, type Crumb } from '../seo/structured-data.ts';

/**
 * Breadcrumb trail and its BreadcrumbList, from one list of crumbs — DS
 * *Breadcrumbs*: the full trail from 768px, a «بازگشت» link to the parent
 * below it. The visible trail and the structured data are rendered together so
 * they can never disagree.
 */
export function Breadcrumbs({ items, origin }: { items: readonly Crumb[]; origin: string }) {
  const parent = items.length > 1 ? items[items.length - 2] : undefined;
  return (
    <>
      <nav aria-label="مسیر صفحه" data-testid="breadcrumbs">
        <ol className="hz-breadcrumbs hz-show-md">
          {items.map((item, index) => {
            const last = index === items.length - 1;
            return [
              index > 0 ? (
                <li key={item.path + '-sep'} className="hz-breadcrumbs__sep" aria-hidden="true">
                  /
                </li>
              ) : null,
              <li key={item.path}>
                {last ? <span aria-current="page">{item.name}</span> : <Link href={item.path}>{item.name}</Link>}
              </li>,
            ];
          })}
        </ol>
        {parent ? (
          <Link className="hz-breadcrumbs-back hz-hide-md" href={parent.path} aria-label={'بازگشت به ' + parent.name}>
            <Icon name="arrowLeft" size="sm" mirror />
            بازگشت
          </Link>
        ) : null}
      </nav>
      <JsonLdScript data={breadcrumbLd(items, origin)} />
    </>
  );
}
