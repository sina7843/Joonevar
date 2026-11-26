'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A heading that takes focus when the page opens — the result of an action the
 * person just completed elsewhere (payment return, KUSR-052), so a screen
 * reader starts at the outcome instead of the top of the page.
 */
export function FocusHeading({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h2 ref={ref} id={id} className={className} tabIndex={-1} style={{ outline: 'none' }}>
      {children}
    </h2>
  );
}
