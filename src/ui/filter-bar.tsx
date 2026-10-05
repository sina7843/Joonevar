import Link from 'next/link';

/**
 * DS *FilterBar* quick chips, as links: the filter state lives in the URL
 * (P02), so a chip is a navigation, not a toggle button. The current chip
 * carries `aria-current` and the pressed look of `.hz-chip[aria-pressed]`.
 * The row scrolls inside itself on phones, never the page.
 */
export function FilterChips({
  label,
  chips,
  testId,
}: {
  label: string;
  chips: ReadonlyArray<{ key: string; href: string; label: string; count?: string; current: boolean }>;
  testId?: string;
}) {
  return (
    <nav aria-label={label} className="hz-filterbar hz-filterbar--scroll pb-2xs" data-testid={testId}>
      <ul className="hz-filterbar__chips">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={chip.href}
              aria-current={chip.current ? 'page' : undefined}
              className="hz-chip no-underline aria-[current=page]:border-border-brand aria-[current=page]:bg-bg-brand-subtle aria-[current=page]:text-text-brand"
            >
              {chip.label}
              {chip.count ? <span className="hz-chip__count">{chip.count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
