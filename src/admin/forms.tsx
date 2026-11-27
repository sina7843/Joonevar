'use client';

import { useActionState, useRef, useState } from 'react';
import { Button } from '../ui/button.tsx';
import { SelectField, TextField } from '../ui/field.tsx';
import { Result, submitWith } from '../vets/directory-forms.tsx';
import { MERGE_KINDS, MERGE_KIND_FA, type MergeKind } from './merge-model.ts';
import { mergeRecordAction, type MergeFormState } from './actions.ts';

const EMPTY: MergeFormState = {};

export interface MergeOption {
  readonly id: string;
  readonly nameFa: string;
  readonly version: number;
  readonly slug: string | null;
}

/**
 * Mark a duplicate — §21 (PROMPT-016).
 *
 * The expected version travels with the chosen duplicate, so a record edited by
 * someone else between opening this page and submitting it is refused instead
 * of silently merged.
 */
export function MergeForm({ kind, options }: { kind: MergeKind; options: readonly MergeOption[] }) {
  const [state, submit, pending] = useActionState(mergeRecordAction, EMPTY);
  // DS SensitiveConfirm (CMPB-078): a merge redirects the duplicate's public
  // address for good, so it is confirmed in place, naming both records, first.
  const [confirming, setConfirming] = useState<{ duplicate: string; primary: string } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const nameOf = (value: string) => options.find((option) => value.startsWith(option.id))?.nameFa ?? '—';

  /*
   * The duplicate's expected version travels inside its own option value rather
   * than through React state: the form then carries everything the server needs
   * the moment a choice is made, and there is no state to be half-applied.
   */
  return (
    <form ref={form} onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="merge-form">
      <input type="hidden" name="kind" value={kind} />
      <Result state={state} testId="merge-result" />

      <SelectField
        label="رکورد تکراری"
        name="duplicate"
        required
        options={options.map((option) => ({ value: option.id + ':' + option.version, label: option.nameFa }))}
        data-testid="merge-duplicate"
      />
      <SelectField
        label="رکورد اصلی"
        name="primaryId"
        required
        options={options.map((option) => ({ value: option.id, label: option.nameFa }))}
        data-testid="merge-primary"
      />
      <TextField
        label="دلیل ادغام"
        name="reason"
        required
        maxLength={500}
        hint="در تاریخچه می‌ماند و بعداً قابل بازبینی است."
        data-testid="merge-reason"
      />
      {confirming ? (
        <div className="hz-alert hz-alert--warning" role="alertdialog" aria-labelledby="merge-confirm-title" data-testid="merge-confirmation">
          <div className="hz-alert__body">
            <span className="hz-alert__title" id="merge-confirm-title">
              {'«' + confirming.duplicate + '» تکراری «' + confirming.primary + '» ثبت شود؟'}
            </span>
            <span>نشانی عمومی رکورد تکراری از این پس به رکورد اصلی می‌رود و این کار در تاریخچه با دلیل می‌ماند.</span>
            <div className="hz-alert__actions">
              <Button type="submit" tone="destructive" size="sm" disabled={pending} data-testid="merge-confirm">
                {pending ? 'در حال ثبت…' : 'تأیید ادغام'}
              </Button>
              <Button type="button" tone="secondary" size="sm" disabled={pending} onClick={() => setConfirming(null)}>
                انصراف
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            const element = form.current;
            if (!element || !element.reportValidity()) return;
            const data = new FormData(element);
            setConfirming({ duplicate: nameOf(String(data.get('duplicate') ?? '')), primary: nameOf(String(data.get('primaryId') ?? '')) });
          }}
          data-testid="merge-submit"
        >
          ثبت به‌عنوان تکراری
        </Button>
      )}
    </form>
  );
}

/** Switching the directory is a plain link, so the address says what is on screen. */
export function MergeKindTabs({ current }: { current: MergeKind }) {
  return (
    <nav aria-label="نوع رکورد" className="flex flex-wrap gap-xs" data-testid="merge-kinds">
      {MERGE_KINDS.map((kind) => (
        <a
          key={kind}
          href={'/admin/merge?kind=' + kind}
          aria-current={kind === current ? 'page' : undefined}
          className={[
            'inline-flex min-h-[var(--size-control-sm)] items-center rounded-md border px-md text-label-sm',
            kind === current ? 'border-border-brand text-text-brand' : 'border-border-subtle text-text-secondary',
          ].join(' ')}
          data-testid={'merge-kind-' + kind}
        >
          {MERGE_KIND_FA[kind]}
        </a>
      ))}
    </nav>
  );
}
