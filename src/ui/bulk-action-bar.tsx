'use client';

import { useActionState, useRef, useState, type ReactNode } from 'react';
import { Alert } from './alert.tsx';
import { Button } from './button.tsx';
import { ReasonField } from './decision.tsx';
import { Icon } from './icon.tsx';
import type { IconName } from './icon-paths.ts';
import { Modal } from './overlay.tsx';

export interface BulkResultState {
  readonly message?: string;
  readonly tone?: 'success' | 'warning' | 'error';
  /** One line per case: what happened to it (P09 › bulk results are per case). */
  readonly results?: ReadonlyArray<{ readonly id: string; readonly label: string; readonly ok: boolean; readonly message?: string }>;
}

export interface BulkAction {
  readonly key: string;
  readonly label: string;
  readonly icon?: IconName;
  /** Opens a Modal with a ReasonField before it runs. */
  readonly reason?: { readonly name: string; readonly title: string; readonly drafts?: readonly string[] };
  readonly testId?: string;
}

/**
 * DS *BulkActionBar* around a selectable queue. The table inside renders
 * `<input type="checkbox" name="ids" form={formId}>` per row (DataTable
 * `selectable`, CaseList `selectForm`) and one `data-select-all` header box,
 * outside the form so rows can keep their own forms; this wrapper counts them, keeps `aria-selected` on
 * the rows, and shows the bar only while something is selected. Every action
 * posts the selected ids with `bulkAction=<key>`; the server decides each case
 * on its own and reports per case. Decisions that need documents are never
 * offered here (P09).
 */
export function BulkSelect({
  formId,
  action,
  actions,
  note,
  noun = 'پرونده',
  testId,
  children,
}: {
  /** The form's id; each row checkbox carries `form={formId}`, so rows may hold their own forms. */
  formId: string;
  action: (state: BulkResultState, form: FormData) => Promise<BulkResultState>;
  actions: readonly BulkAction[];
  note?: string;
  noun?: string;
  testId?: string;
  children: ReactNode;
}) {
  const [state, submit, pending] = useActionState(action, {} as BulkResultState);
  const [count, setCount] = useState(0);
  const [asking, setAsking] = useState<BulkAction | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const keyInput = useRef<HTMLInputElement>(null);

  const boxes = () => Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ?? []);
  const sync = () => {
    const all = boxes();
    const checked = all.filter((box) => box.checked).length;
    all.forEach((box) => box.closest('tr, li')?.setAttribute('aria-selected', String(box.checked)));
    const head = root.current?.querySelector<HTMLInputElement>('input[data-select-all]');
    if (head) {
      head.checked = checked > 0 && checked === all.length;
      head.indeterminate = checked > 0 && checked < all.length;
    }
    setCount(checked);
  };
  const onChange = (event: React.ChangeEvent<HTMLDivElement>) => {
    const target = event.target as unknown as HTMLInputElement;
    if (target.matches?.('input[data-select-all]')) boxes().forEach((box) => (box.checked = target.checked));
    if (target.matches?.('input[data-select-all], input[name="ids"]')) sync();
  };
  const clear = () => {
    boxes().forEach((box) => (box.checked = false));
    sync();
  };
  const run = (bulk: BulkAction) => {
    if (keyInput.current) keyInput.current.value = bulk.key;
    if (bulk.reason) setAsking(bulk);
    else form.current?.requestSubmit();
  };

  return (
    <div ref={root} onChange={onChange} className="space-y-md" data-testid={testId}>
      <form ref={form} id={formId} action={submit} className="space-y-md">
      <input ref={keyInput} type="hidden" name="bulkAction" defaultValue="" />
      {state.message ? (
        <Alert tone={state.tone ?? 'success'} title={state.message}>
          {state.results && state.results.length > 0 ? (
            <ul className="mt-xs list-disc ps-lg">
              {state.results.map((result) => (
                <li key={result.id}>{result.label + (result.ok ? '' : ' — ' + (result.message ?? 'انجام نشد'))}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
      <div className="hz-bulkbar hz-bulkbar--sticky" role="region" aria-label="کنش گروهی" hidden={count === 0}>
        <span className="hz-bulkbar__count" aria-live="polite">
          {count.toLocaleString('fa-IR') + ' ' + noun + ' انتخاب شد'}
        </span>
        {note ? <p className="hz-bulkbar__note">{note}</p> : null}
        <div className="hz-bulkbar__actions">
          {actions.map((bulk) => (
            <Button key={bulk.key} type="button" tone="secondary" size="sm" iconStart={bulk.icon} disabled={pending} loading={pending && keyInput.current?.value === bulk.key} onClick={() => run(bulk)} data-testid={bulk.testId}>
              {bulk.label + ' (' + count.toLocaleString('fa-IR') + ')'}
            </Button>
          ))}
          <span className="hz-bulkbar__sep" aria-hidden="true" />
          <button type="button" className="hz-btn hz-btn--ghost hz-btn--sm" onClick={clear}>
            <Icon name="x" size="xs" />
            لغو انتخاب
          </button>
        </div>
      </div>
      <Modal open={asking !== null} onClose={() => setAsking(null)} title={asking?.reason?.title ?? ''}>
        {asking?.reason ? (
          <div className="flex flex-col gap-lg">
            <ReasonField name={asking.reason.name} required drafts={asking.reason.drafts} />
            <Button
              type="button"
              size="lg"
              block
              disabled={pending}
              onClick={() => {
                setAsking(null);
                form.current?.requestSubmit();
              }}
              data-testid={asking.testId ? asking.testId + '-confirm' : undefined}
            >
              {asking.label + ' (' + count.toLocaleString('fa-IR') + ')'}
            </Button>
          </div>
        ) : null}
      </Modal>
      </form>
      {children}
    </div>
  );
}
