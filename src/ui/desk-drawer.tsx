'use client';

import { useState, type ReactNode } from 'react';
import { Button } from './button.tsx';
import { Drawer } from './overlay.tsx';

/**
 * The in-Drawer desk of a queue without a `[id]` route (P09 › Opening a case,
 * P10 › «Queues without a `[id]` route … open the same desk in a wide `Drawer`
 * from the end»). The row carries only «باز کردن پرونده»; the desk (head,
 * evidence, decision) is the server-rendered `children`, mounted only while
 * open — so private documents load only when the case is opened.
 *
 * Wide from 768 (720px); full screen below 768 (`hz-drawer--full-mobile`).
 * The drawer stays in the row's DOM (no portal), so a decided case that
 * leaves the queue takes its desk with it.
 */
export function CaseDrawer({
  title,
  testId,
  label = 'باز کردن پرونده',
  children,
}: {
  title: string;
  testId?: string;
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        tone="secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        {label}
      </Button>
      {/* ponytail: width widened by a wrapper selector; move to a Drawer `wide` prop if a second caller needs it. */}
      <div className="md:[&_.hz-drawer]:w-[min(720px,100%)]">
        <Drawer open={open} onClose={() => setOpen(false)} title={title}>
          {children}
        </Drawer>
      </div>
    </>
  );
}
