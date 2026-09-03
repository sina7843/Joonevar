import { ICON_PATHS, type IconName } from './icon-paths.ts';

/**
 * The design system's icon component — DS node 48:472, Phosphor 2.1.1.
 *
 * Two rules come straight from the library and are enforced here rather than
 * left to each screen: the base size is 24px and taken from the size tokens, and
 * outline is the resting weight while filled means active or selected. A screen
 * that wants a different weight has to say which state it is drawing.
 *
 * An icon is decoration unless it is told otherwise: without a `label` it is
 * hidden from assistive technology, because the text beside it already carries
 * the meaning. With a `label` it becomes an image with a name, for the places
 * where the icon is the only thing there.
 */
export type IconSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_VAR: Record<IconSize, string> = {
  xs: 'var(--size-icon-xs)',
  sm: 'var(--size-icon-sm)',
  md: 'var(--size-icon-md)',
  lg: 'var(--size-icon-lg)',
};

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
  /** `fill` is reserved for the active or selected state (DS 48:472). */
  weight?: 'regular' | 'fill';
  label?: string;
  className?: string;
  /**
   * Flip a glyph that points somewhere. The library draws direction for a
   * left-to-right reader, so an arrow that means "out" points right there and
   * points *into* the page here. Only pass this for glyphs whose meaning is
   * their direction; a bell has no handedness.
   */
  mirror?: boolean;
}) {
  const side = SIZE_VAR[size];
  return (
    <svg
      viewBox="0 0 256 256"
      width={side}
      height={side}
      fill="currentColor"
      className={className}
      style={{ flexShrink: 0, transform: mirror ? 'scaleX(-1)' : undefined }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={ICON_PATHS[name][weight]} />
    </svg>
  );
}
