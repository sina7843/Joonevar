'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '../../src/ui/button.tsx';
import { Icon } from '../../src/ui/icon.tsx';
import { Drawer } from '../../src/ui/overlay.tsx';

/**
 * P09 › a queue row only opens the case: «باز کردن پرونده» opens the DS Drawer
 * (full screen below 768) holding the desk — record head, evidence and the
 * module's own decision form, rendered on the server and passed in unchanged.
 */
export function CaseDrawer({ title, testId, children }: { title: string; testId?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex justify-end">
        <Button type="button" tone="secondary" size="sm" onClick={() => setOpen(true)} data-testid={testId}>
          باز کردن پرونده
          <Icon name="arrowRight" size="xs" mirror />
        </Button>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title={title}>
        <div className="space-y-lg">{children}</div>
      </Drawer>
    </>
  );
}
