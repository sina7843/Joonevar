'use client';

import Link from 'next/link';
import { startTransition, useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from './alert.tsx';
import { Button } from './button.tsx';
import { Icon } from './icon.tsx';
import { ReasonField } from './decision.tsx';
import { Switch } from './switch.tsx';

export interface SettingRowState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly savedVersion?: number;
  readonly stale?: boolean;
  readonly current?: { readonly display: string; readonly version: number };
}

export interface SettingRowData {
  readonly key: string;
  readonly labelFa: string;
  readonly kind: string;
  readonly configured: boolean;
  /** The value as the operator types it ('' when unset). */
  readonly raw: string;
  /** The value as the panel shows it («۴۰۰٬۰۰۰ تومان», «فعال», «تعیین‌نشده»). */
  readonly display: string;
  readonly version: number;
  /** Shown above the name in cross-group results (search, «فقط تعیین‌نشده»). */
  readonly groupFa?: string;
}

/** Test ids per surface; the admin and market panels kept their own names. */
export interface SettingRowIds {
  readonly row?: string;
  readonly value: string;
  readonly reason: string;
  readonly save: string;
  readonly edit: string;
  readonly form: string;
  readonly display?: string;
  readonly reload?: string;
}

const OPEN_EVENT = 'hz-setting-open';
const fa = (value: number) => value.toLocaleString('fa-IR');

/**
 * DS *SettingsPanel* row (P11 / K15): read-only with «ویرایش» / «تعیین مقدار»;
 * one row at a time opens its edit area in place, with «پیش‌نویس», the current
 * value and version beside «مقدار تازه», a required «دلیل تغییر», «ذخیره
 * به‌عنوان نسخه N» and «انصراف». Below 768 the button is a link to the key's
 * own edit page (`mobileHref`).
 *
 * A rejected save keeps the draft (the form is submitted by hand, so React does
 * not reset it); a version conflict shows what is saved now and «بارگذاری
 * دوباره»; a saved change closes the row and says «نسخه N ذخیره شد».
 */
export function SettingRow({
  setting,
  writable,
  action,
  ids,
  mobileHref,
  hints,
  startOpen = false,
}: {
  setting: SettingRowData;
  writable: boolean;
  action: (state: SettingRowState, form: FormData) => Promise<SettingRowState>;
  ids: SettingRowIds;
  mobileHref?: string;
  /** Lines under the key: notes, source, history link. */
  hints?: ReactNode;
  /** The key's own edit page renders the row already open. */
  startOpen?: boolean;
}) {
  const [state, submit, pending] = useActionState(action, {} as SettingRowState);
  const [editing, setEditing] = useState(startOpen);
  const [clear, setClear] = useState(false);
  const id = useId();
  const router = useRouter();
  const editButton = useRef<HTMLButtonElement>(null);
  const valueInput = useRef<HTMLElement>(null);
  const lastSaved = useRef<number | undefined>(undefined);

  // One row at a time: opening this row closes any other.
  useEffect(() => {
    const onOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== setting.key) setEditing(false);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [setting.key]);

  // A saved version closes the row (P11 › Saved) and returns focus to its button.
  useEffect(() => {
    if (state.ok && state.savedVersion !== lastSaved.current) {
      lastSaved.current = state.savedVersion;
      if (!startOpen) {
        setEditing(false);
        requestAnimationFrame(() => editButton.current?.focus());
      }
    }
  }, [state, startOpen]);

  useEffect(() => {
    if (editing && !startOpen) valueInput.current?.focus();
  }, [editing, startOpen]);

  const open = () => {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: setting.key }));
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setClear(false);
    requestAnimationFrame(() => editButton.current?.focus());
  };

  const unit = setting.kind === 'MONEY_TOMAN' ? 'تومان' : undefined;
  const numeric = setting.kind === 'MONEY_TOMAN' || setting.kind === 'INT';
  const long = setting.kind === 'TEXT' || setting.kind === 'JSON';
  const actionLabel = setting.configured ? 'ویرایش' : 'تعیین مقدار';

  const control =
    setting.kind === 'BOOL' ? (
      <div className="flex flex-wrap items-center gap-md">
        {clear ? <input type="hidden" name="value" value="" /> : null}
        <span className="inline-flex items-center gap-sm">
          <Switch name={clear ? undefined : 'value'} defaultChecked={setting.raw === 'true'} labelledBy={id + '-new'} disabled={clear} testId={ids.value} />
          <span className="text-body-sm">فعال</span>
        </span>
        <label className="hz-check">
          <input type="checkbox" checked={clear} onChange={(event) => setClear(event.target.checked)} />
          <span>تعیین‌نشده بماند</span>
        </label>
      </div>
    ) : long ? (
      <textarea
        ref={valueInput as React.RefObject<HTMLTextAreaElement>}
        id={id + '-value'}
        name="value"
        defaultValue={setting.raw}
        rows={setting.kind === 'JSON' ? 6 : 4}
        dir={setting.kind === 'JSON' ? 'ltr' : undefined}
        aria-describedby={id + '-hint'}
        className="hz-textarea"
        data-testid={ids.value}
      />
    ) : (
      <span className={unit ? 'hz-input-wrap hz-input-wrap--suffix' : undefined}>
        <input
          ref={valueInput as React.RefObject<HTMLInputElement>}
          id={id + '-value'}
          name="value"
          dir={numeric || setting.kind === 'STRING' ? 'ltr' : undefined}
          inputMode={numeric ? 'numeric' : undefined}
          defaultValue={setting.raw}
          aria-describedby={id + '-hint'}
          className={'hz-input' + (numeric ? ' hz-input--ltr' : '')}
          data-testid={ids.value}
        />
        {unit ? <span className="hz-input-wrap__suffix">{unit}</span> : null}
      </span>
    );

  return (
    <div
      className={['hz-setting', long && !editing ? 'hz-setting--text' : '', editing ? 'hz-setting--editing' : ''].join(' ').trim()}
      data-testid={ids.row}
    >
      {setting.groupFa ? <span className="hz-setting__group">{setting.groupFa}</span> : null}
      <div className="hz-setting__label">
        <span className="hz-setting__name" id={id + '-name'}>
          {setting.labelFa}
        </span>
        <bdi className="hz-setting__key" dir="ltr">
          {setting.key}
        </bdi>
        {hints}
        {!setting.configured ? <span className="hz-setting__hint">تا تعیین مقدار، مسیر وابسته به این کلید بسته می‌ماند.</span> : null}
      </div>
      <div className="hz-setting__end">
        {editing ? (
          <span className="hz-badge hz-badge--neutral hz-badge--sm">
            <span className="hz-badge__dot" />
            پیش‌نویس
          </span>
        ) : (
          <>
            <span className={setting.configured ? 'hz-setting__value' : 'hz-setting__value hz-setting__value--unset'} data-testid={ids.display}>
              {setting.display}
            </span>
            {writable ? (
              <>
                <button
                  ref={editButton}
                  type="button"
                  className={'hz-btn hz-btn--ghost hz-btn--sm' + (mobileHref ? ' max-md:hidden' : '')}
                  aria-label={actionLabel + ' ' + setting.labelFa}
                  onClick={open}
                  data-testid={ids.edit}
                >
                  <Icon name="pencilSimple" size="xs" />
                  {actionLabel}
                </button>
                {mobileHref ? (
                  <Link href={mobileHref} className="hz-btn hz-btn--ghost hz-btn--sm md:hidden" aria-label={actionLabel + ' ' + setting.labelFa} data-testid={ids.edit + '-page'}>
                    <Icon name="pencilSimple" size="xs" />
                    {actionLabel}
                  </Link>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>

      {!editing && state.ok && state.savedVersion !== undefined ? (
        <p className="col-span-full text-caption text-status-success-text" role="status">
          {'نسخه ' + fa(state.savedVersion) + ' ذخیره شد. ' + (state.message ?? '')}
        </p>
      ) : null}

      {editing ? (
        <form
          className="hz-setting__edit"
          aria-labelledby={id + '-name'}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(() => submit(data));
          }}
          data-testid={ids.form}
        >
          <input type="hidden" name="key" value={setting.key} />
          <input type="hidden" name="version" value={setting.version} />
          {state.stale && state.current ? (
            <Alert
              tone="warning"
              title="این تنظیم پس از باز کردن شما تغییر کرده است"
              action={
                <button type="button" className="hz-btn hz-btn--secondary hz-btn--sm" onClick={() => router.refresh()} data-testid={ids.reload}>
                  <Icon name="arrowClockwise" size="xs" />
                  بارگذاری دوباره
                </button>
              }
            >
              {'مقدار فعلی: ' + state.current.display + '، نسخه ' + fa(state.current.version) + '. چیزی ذخیره نشد و پیش‌نویس شما نگه داشته شد.'}
            </Alert>
          ) : state.ok && startOpen && state.savedVersion !== undefined ? (
            <Alert tone="success" title={'نسخه ' + fa(state.savedVersion) + ' ذخیره شد'}>
              {state.message}
            </Alert>
          ) : state.message && !state.ok ? (
            <Alert tone="error" title={state.message} />
          ) : null}
          <div className="hz-setting__edit-fields">
            <div className="hz-field">
              <span className="hz-field__label">{'مقدار فعلی، نسخه ' + fa(setting.version)}</span>
              <span className={setting.configured ? 'hz-setting__value text-start leading-[48px]' : 'hz-setting__value hz-setting__value--unset text-start leading-[48px]'}>
                {setting.display}
              </span>
            </div>
            <div className="hz-field">
              <label className="hz-field__label" htmlFor={id + '-value'} id={id + '-new'}>
                مقدار تازه
              </label>
              {control}
              <span className="hz-field__hint" id={id + '-hint'}>
                {setting.kind === 'BOOL' ? '«تعیین‌نشده» مثل بسته رفتار می‌شود.' : 'خالی یعنی «تعیین‌نشده»، نه صفر.'}
              </span>
            </div>
          </div>
          {/* A new saved version starts the next change with an empty reason; a rejected save keeps it. */}
          <ReasonField
            key={state.savedVersion ?? 0}
            name="reason"
            label="دلیل تغییر"
            required
            rows={2}
            audience="در تاریخچه با نام شما ثبت می‌شود"
            testId={ids.reason}
          />
          <div className={startOpen ? 'hz-action-row hz-action-row--sticky' : 'hz-action-row'}>
            <Button size="sm" type="submit" disabled={pending} loading={pending} loadingLabel="در حال ذخیره…" data-testid={ids.save}>
              {'ذخیره به‌عنوان نسخه ' + fa(setting.version + 1)}
            </Button>
            {startOpen ? null : (
              <Button size="sm" tone="secondary" type="button" onClick={cancel}>
                انصراف
              </Button>
            )}
            <span className="hz-setting__hint">اگر کسی پیش از شما این کلید را تغییر دهد، ذخیره رد می‌شود و نسخه تازه را می‌بینید.</span>
          </div>
        </form>
      ) : null}
    </div>
  );
}
