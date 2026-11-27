'use client';

import { useActionState, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './icon.tsx';
import { Alert } from './alert.tsx';
import { Button } from './button.tsx';
import { BottomSheet, Modal } from './overlay.tsx';

/**
 * DS *DecisionDesk* outcome cards (`.hz-option` radios with a one-line
 * consequence) and *ReasonField* (audience line, draft chips, textarea,
 * counter). Field names and test ids are passed in, so each module keeps its
 * own server action contract.
 */
export interface DecisionChoice<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly desc?: string;
  readonly testId?: string;
}

export function DecisionOptions<V extends string>({
  name = 'decision',
  choices,
  value,
  onChange,
  disabled,
  legend = 'نتیجه بررسی',
}: {
  name?: string;
  choices: readonly DecisionChoice<V>[];
  value: V | null;
  onChange: (value: V) => void;
  disabled?: boolean;
  legend?: string;
}) {
  return (
    <fieldset className="hz-desk__options" disabled={disabled}>
      <legend className="hz-visually-hidden">{legend}</legend>
      {choices.map((choice) => (
        <label key={choice.value} className="hz-option">
          <input
            type="radio"
            name={name}
            value={choice.value}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
            data-testid={choice.testId}
          />
          <span className="hz-radio__text">
            <b className="hz-radio__label">{choice.label}</b>
            {choice.desc ? <span className="hz-radio__desc">{choice.desc}</span> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function ReasonField({
  name,
  label = 'دلیل',
  required = false,
  testId,
  drafts = [],
  audience = 'به کاربر نمایش داده می‌شود',
  maxLength = 500,
  defaultValue = '',
  hint,
  error,
  disabled = false,
  rows = 4,
}: {
  name: string;
  label?: string;
  required?: boolean;
  testId?: string;
  drafts?: readonly string[];
  /** null hides the audience line (internal-only reasons). */
  audience?: string | null;
  maxLength?: number;
  defaultValue?: string;
  hint?: string;
  /** Shown under the field with `aria-invalid` (DS ReasonField › Error). */
  error?: string | null;
  disabled?: boolean;
  rows?: number;
}) {
  const id = useId();
  const [text, setText] = useState(defaultValue);
  const near = text.length >= maxLength * 0.9;
  // A chip fills an empty field, or adds its sentence after what is already written; it never erases.
  const addDraft = (draft: string) =>
    setText((current) => (current.trim() === '' ? draft : (current.trimEnd() + ' ' + draft).slice(0, maxLength)));
  const describedBy = [audience ? id + '-aud' : null, hint ? id + '-hint' : null, error ? id + '-err' : null, id + '-count']
    .filter(Boolean)
    .join(' ');
  return (
    <div className="hz-reason">
      <div className={error ? 'hz-field hz-field--error' : 'hz-field'}>
        <div className="hz-field__label-row">
          <label className="hz-field__label" htmlFor={id}>
            {label}
            {required ? (
              <span className="hz-field__req" aria-hidden="true">
                *
              </span>
            ) : (
              <span className="hz-field__opt">(اختیاری)</span>
            )}
          </label>
          {audience ? (
            <span className="hz-reason__audience hz-reason__audience--public" id={id + '-aud'}>
              <Icon name="eye" size="xs" />
              {audience}
            </span>
          ) : null}
        </div>
        {drafts.length > 0 ? (
          <div className="hz-filterbar" role="group" aria-label="دلیل‌های آماده">
            {drafts.map((draft) => (
              <button
                key={draft}
                type="button"
                className="hz-chip"
                aria-pressed={text.includes(draft)}
                disabled={disabled}
                onClick={() => addDraft(draft)}
              >
                {draft}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          id={id}
          name={name}
          className="hz-textarea"
          rows={rows}
          required={required}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          maxLength={maxLength}
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          aria-describedby={describedBy}
          data-testid={testId}
        />
        {error ? (
          <p className="hz-field__error" id={id + '-err'}>
            <Icon name="warningCircle" size="xs" />
            {error}
          </p>
        ) : null}
        <div className="hz-field__foot">
          <span className="hz-field__hint" id={hint ? id + '-hint' : undefined}>
            {hint ?? ''}
          </span>
          {/* Announced only near the limit, not on every key. */}
          <span
            className={near ? 'hz-field__counter hz-field__counter--near' : 'hz-field__counter'}
            id={id + '-count'}
            aria-live={near ? 'polite' : 'off'}
          >
            {text.length.toLocaleString('fa-IR') + ' از ' + maxLength.toLocaleString('fa-IR') + ' نویسه'}
          </span>
        </div>
      </div>
    </div>
  );
}

export interface DecisionFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'success' | 'error';
  /** The record changed after the page was opened (DS DecisionDesk › Stale); see `staleOf`. */
  readonly stale?: boolean;
}

/** DS DecisionDesk › Stale: warning, nothing was saved; reloading keeps the typed reason. */
export function StaleAlert() {
  const router = useRouter();
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <Alert
      tone="warning"
      title="تصمیم ثبت نشد"
      action={
        <button ref={ref} type="button" className="hz-btn hz-btn--secondary hz-btn--sm" onClick={() => router.refresh()} data-testid="stale-reload">
          <Icon name="arrowClockwise" size="xs" />
          بارگذاری دوباره
        </button>
      }
    >
      این پرونده پس از باز کردن شما تغییر کرده است. صفحه را دوباره بار کنید و سپس تصمیم بگیرید.
    </Alert>
  );
}

const WIDE = '(min-width: 1024px)';
/** Desktop (≥1024) or not; the server renders the desktop panel. */
function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(WIDE);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

const isRejection = (value: string): boolean => /REJECT|DECLINE|REMOVE|DELETE/.test(value);

/**
 * The whole decision panel of a desk: outcome cards → reason (required for any
 * outcome listed in `reasonFor`) → one primary whose label follows the choice.
 * No outcome is preselected (P10 › Default). The module's own server action,
 * hidden fields and test ids are passed in unchanged.
 *
 * Below 1024 the same form is the DS mobile bar (`.hz-desk__bar`, one button per
 * outcome): choosing one opens a bottom sheet (<768) or a modal (768–1023) with
 * the reason and the submit; focus returns to the bar on close.
 */
export function DecisionForm<V extends string>({
  action,
  hidden,
  choices,
  reasonName,
  reasonTestId,
  reasonFor,
  reasonLabel,
  drafts,
  submitTestId,
  formTestId,
  audience,
  name = 'decision',
  children,
}: {
  /** The module's server action; its state shape is a superset of DecisionFormState. */
  action: (state: never, form: FormData) => Promise<DecisionFormState>;
  hidden: Record<string, string | number>;
  choices: readonly DecisionChoice<V>[];
  reasonName: string;
  reasonTestId?: string;
  /** Outcomes that require a reason; others send no reason field. */
  reasonFor: readonly V[];
  reasonLabel?: (value: V) => string;
  drafts?: readonly string[];
  submitTestId?: string;
  formTestId?: string;
  audience?: string | null;
  name?: string;
  /** Extra fields shown under the reason (per module). */
  children?: (value: V | null) => ReactNode;
}) {
  const [state, submit, pending] = useActionState(
    action as unknown as (state: DecisionFormState, form: FormData) => Promise<DecisionFormState>,
    {} as DecisionFormState,
  );
  const [value, setValue] = useState<V | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const wide = useWide();
  const needsReason = value !== null && reasonFor.includes(value);
  const chosen = choices.find((choice) => choice.value === value);
  const rejecting = value !== null && isRejection(value);

  const reason = needsReason ? (
    <ReasonField
      key={value}
      name={reasonName}
      label={reasonLabel ? reasonLabel(value) : 'دلیل'}
      required
      testId={reasonTestId}
      drafts={drafts}
      audience={audience}
      disabled={pending}
    />
  ) : null;
  const primary = (
    <Button
      type="submit"
      size="lg"
      block
      wrap
      tone={!wide && rejecting ? 'destructive' : 'primary'}
      disabled={pending || value === null}
      loading={pending}
      loadingLabel="در حال ثبت…"
      data-testid={submitTestId}
    >
      {chosen ? 'ثبت تصمیم: ' + chosen.label : 'یک تصمیم انتخاب کنید'}
    </Button>
  );
  const notice = state.stale ? (
    <StaleAlert />
  ) : state.message ? (
    <Alert tone={state.ok || state.tone === 'success' ? 'success' : 'error'} title={state.message} />
  ) : null;

  if (!wide) {
    const Overlay = window.matchMedia('(min-width: 768px)').matches ? Modal : BottomSheet;
    return (
      <form action={submit} className="flex flex-col gap-lg" data-testid={formTestId}>
        {Object.entries(hidden).map(([key, val]) => (
          <input key={key} type="hidden" name={key} value={val} />
        ))}
        {sheetOpen ? null : notice}
        {value !== null ? <input type="hidden" name={name} value={value} /> : null}
        <div className="hz-desk__bar max-md:fixed max-md:inset-x-0 max-md:[inset-block-end:0]" role="region" aria-label="تصمیم">
          <div className="hz-desk__bar-actions" style={{ gridTemplateColumns: 'repeat(' + choices.length + ', minmax(0, 1fr))' }}>
            {choices.map((choice, index) => (
              <Button
                key={choice.value}
                type="button"
                size="lg"
                wrap
                tone={isRejection(choice.value) ? 'destructive-outline' : index === 0 ? 'primary' : 'secondary'}
                disabled={pending}
                onClick={() => {
                  setValue(choice.value);
                  setSheetOpen(true);
                }}
                data-testid={choice.testId ? choice.testId + '-bar' : undefined}
              >
                {choice.label}
              </Button>
            ))}
          </div>
        </div>
        <Overlay open={sheetOpen && chosen !== undefined} onClose={() => setSheetOpen(false)} title={chosen ? chosen.label : 'تصمیم'}>
          <div className="flex flex-col gap-lg">
            {notice}
            {chosen?.desc ? <p className="hz-body-sm text-text-secondary">{chosen.desc}</p> : null}
            {reason}
            {children ? children(value) : null}
            {primary}
          </div>
        </Overlay>
      </form>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-lg" data-testid={formTestId}>
      {Object.entries(hidden).map(([key, val]) => (
        <input key={key} type="hidden" name={key} value={val} />
      ))}
      {notice}
      <DecisionOptions name={name} choices={choices} value={value} onChange={setValue} disabled={pending} />
      {reason}
      {children ? children(value) : null}
      {primary}
    </form>
  );
}
