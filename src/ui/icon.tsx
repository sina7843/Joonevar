import { ICON_PATHS, type IconName } from './icon-paths.ts';

/**
 * Icon — DS *Icon* / *Iconography*: Phosphor 2.1.1 on a 256 viewBox, rendered
 * as `.hz-icon` (xs 16 · sm 20 · md 24 · lg 32). Outline at rest; `fill` only
 * for the active or selected state.
 *
 * Decoration unless told otherwise: without a `label` it is hidden from
 * assistive technology, because the text beside it carries the meaning.
 *
 * `mirror` is for glyphs whose meaning is a direction (back, forward, «مشاهده
 * همه», sign out): the LTR glyph is stored and `.hz-icon--mirror` flips it
 * under `dir="rtl"`, so the same markup works when LTR arrives.
 */
export type IconSize = 'xs' | 'sm' | 'md' | 'lg';

export function Icon({
  name,
  size = 'md',
  weight = 'regular',
  label,
  className,
  mirror = false,
}: {
  name: IconName;
  size?: IconSize;
  /** `fill` is reserved for the active or selected state. */
  weight?: 'regular' | 'fill';
  label?: string;
  className?: string;
  mirror?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 256 256"
      className={['hz-icon', 'hz-icon--' + size, mirror ? 'hz-icon--mirror' : '', className ?? ''].join(' ').trim()}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={ICON_PATHS[name][weight]} />
    </svg>
  );
}
