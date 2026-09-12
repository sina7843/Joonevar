import Link from 'next/link';
import { RecordImage } from '../ui/record-image.tsx';
import type { RelatedItem } from './related.ts';

/**
 * The column beside a page: what else is worth opening from here.
 *
 * A group with nothing in it is not rendered, and a column with no groups is not
 * rendered at all, so a page on a site that is still filling up stays narrow
 * instead of showing empty boxes.
 */
export function RelatedColumn({
  groups,
}: {
  groups: readonly { readonly titleFa: string; readonly items: readonly RelatedItem[] }[];
}) {
  const shown = groups.filter((group) => group.items.length > 0);
  if (shown.length === 0) return null;

  return (
    <aside aria-label="پیشنهادهای مرتبط" className="space-y-xl" data-testid="related-column">
      {shown.map((group) => (
        <section key={group.titleFa}>
          <h2 className="text-label-lg text-text-primary">{group.titleFa}</h2>
          <ul className="mt-md space-y-md">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hz-lift flex gap-md rounded-lg border border-border-subtle bg-bg-surface p-sm">
                  <RecordImage variant="thumb" fileId={item.imageFileId} altFa={item.imageAltFa} />
                  <span className="min-w-0">
                    <span className="block text-label-md text-text-primary">{item.titleFa}</span>
                    {item.noteFa ? <span className="mt-2xs block text-caption text-text-secondary">{item.noteFa}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
