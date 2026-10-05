import Link from 'next/link';
import { RecordImage } from '../ui/record-image.tsx';
import { SectionHeader } from '../ui/section-header.tsx';
import { Icon } from '../ui/icon.tsx';
import type { RelatedItem } from './related.ts';

/**
 * The column beside a page — DS *RelatedColumn* (`.hz-related`): one white card
 * per group, a small SectionHeader and compact ArticleCards (tag or kicker,
 * two-line title, the RecordImage thumbnail — its placeholder when the record
 * has no image), and «همه … ←» at the foot when the group has a list.
 *
 * A group with nothing in it is not rendered, and a column with no groups is not
 * rendered at all, so a page on a site that is still filling up stays narrow
 * instead of showing empty boxes.
 */
export function RelatedColumn({
  groups,
}: {
  groups: readonly {
    readonly titleFa: string;
    readonly items: readonly RelatedItem[];
    /** The note is a category (content kind): drawn as a CategoryTag. Otherwise a quiet line. */
    readonly noteAsTag?: boolean;
    readonly link?: { readonly href: string; readonly label: string };
  }[];
}) {
  const shown = groups.filter((group) => group.items.length > 0);
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-col gap-xl" data-testid="related-column">
      {shown.map((group, index) => (
        <aside key={group.titleFa} className="hz-card hz-related" aria-labelledby={'related-' + index}>
          <SectionHeader size="sm" id={'related-' + index} title={group.titleFa} />
          <ul className="hz-related__list">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hz-article hz-article--compact flex-row items-start gap-md" title={item.titleFa}>
                  <span className="hz-article__body min-w-0 flex-1">
                    {item.noteFa ? (
                      group.noteAsTag ? (
                        <span className="hz-tag">{item.noteFa}</span>
                      ) : (
                        <span className="hz-article__kicker">{item.noteFa}</span>
                      )
                    ) : null}
                    <span className="hz-article__title text-label-lg">{item.titleFa}</span>
                  </span>
                  <RecordImage variant="thumb-lg" fileId={item.imageFileId} altFa={item.imageAltFa} />
                </Link>
              </li>
            ))}
          </ul>
          {group.link ? (
            <div className="hz-related__foot">
              <Link className="hz-link hz-link--standalone" href={group.link.href}>
                {group.link.label}
                <Icon name="arrowRight" size="xs" mirror />
              </Link>
            </div>
          ) : null}
        </aside>
      ))}
    </div>
  );
}
