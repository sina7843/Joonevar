/**
 * The public image of a directory record.
 *
 * One component for breeds, centres, veterinarians and communities, because the
 * rules are the same everywhere: the address is always `/media/<file id>`, the
 * alternative text comes from the record and is never invented here, and the
 * space is reserved with an aspect ratio so the text below does not jump when
 * the picture arrives (PROMPT-018).
 *
 * A record without an image renders nothing at all. An empty frame would be a
 * promise the product cannot keep.
 */
export function RecordImage({
  fileId,
  altFa,
  priority = false,
  variant = 'banner',
  className = '',
}: {
  fileId: string | null;
  altFa: string | null;
  /** The one image above the fold on a page loads eagerly; every other waits. */
  priority?: boolean;
  /** `thumb` sits beside a title in a list; `banner` opens a page. */
  variant?: 'banner' | 'thumb';
  className?: string;
}) {
  if (fileId === null) return null;
  const shape =
    variant === 'thumb'
      ? 'size-[56px] shrink-0 rounded-md object-cover'
      : 'aspect-[16/9] w-full rounded-md object-cover';
  // Real dimensions on the element, so the space is reserved before the bytes
  // arrive and the layout never jumps (PROMPT-018).
  const size = variant === 'thumb' ? { width: 56, height: 56 } : { width: 1200, height: 675 };
  return (
    <img
      src={'/media/' + fileId}
      alt={altFa ?? ''}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      width={size.width}
      height={size.height}
      className={shape + ' border border-border-subtle ' + className}
      data-testid="record-image"
    />
  );
}
