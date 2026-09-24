'use client';

import { useActionState } from 'react';
import { Card } from '../../../src/ui/card.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { SelectField, TextAreaField, TextField } from '../../../src/ui/field.tsx';
import { setContentRoleAction, setMarketplaceRoleAction, type RoleFormState } from './actions.ts';
import { MARKETPLACE_ROLES, MARKETPLACE_ROLE_FA } from '../../../src/marketplace/roles.ts';

const EMPTY: RoleFormState = {};

export function ContentRoleForm() {
  const [state, submit, pending] = useActionState(setContentRoleAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">فعال‌سازی یا تعلیق نقش محتوا</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        نویسنده و ادمین محتوا نقش‌های مستقل‌اند و از هیچ نقش دیگری به ارث نمی‌رسند. صاحب شماره باید یک‌بار وارد همزیست شده باشد.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="content-role-form">
        {state.message ? (
          <div data-testid="content-role-result">
            <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
          </div>
        ) : null}
        <TextField label="شماره موبایل" name="mobile" ltr required inputMode="numeric" data-testid="role-mobile" />
        <div className="grid gap-lg md:grid-cols-2">
          <SelectField
            label="نقش"
            name="role"
            required
            options={[
              { value: 'AUTHOR', label: 'نویسنده' },
              { value: 'CONTENT_ADMIN', label: 'ادمین محتوا' },
              { value: 'REVIEW_OPERATOR', label: 'اپراتور بررسی' },
            ]}
            data-testid="role-name"
          />
          <SelectField
            label="اقدام"
            name="action"
            required
            options={[
              { value: 'GRANT', label: 'فعال‌سازی' },
              { value: 'SUSPEND', label: 'تعلیق' },
            ]}
            data-testid="role-action"
          />
        </div>
        <TextAreaField label="دلیل" name="reason" rows={2} required data-testid="role-reason" />
        <Button type="submit" disabled={pending} data-testid="save-content-role">
          {pending ? 'در حال ثبت…' : 'ثبت'}
        </Button>
      </form>
    </Card>
  );
}

/** Marketplace operational roles — Phase 3, PROMPT-002 (DEC-0204). */
export function MarketplaceRoleForm() {
  const [state, submit, pending] = useActionState(setMarketplaceRoleAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">فعال‌سازی یا تعلیق نقش بازار</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        شش نقش عملیاتی بازار و فروشگاه مستقل‌اند و از هیچ نقش دیگری به ارث نمی‌رسند. هر نقش فقط محیط
        <bdi className="hz-ltr font-mono"> /market </bdi>
        را باز می‌کند؛ اختیار هر کار جداگانه سنجیده می‌شود.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="marketplace-role-form">
        {state.message ? (
          <div data-testid="marketplace-role-result">
            <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
          </div>
        ) : null}
        <TextField
          label="شماره موبایل"
          name="mobile"
          ltr
          required
          inputMode="numeric"
          data-testid="market-role-mobile"
        />
        <div className="grid gap-lg md:grid-cols-2">
          <SelectField
            label="نقش"
            name="role"
            required
            options={MARKETPLACE_ROLES.map((role) => ({ value: role, label: MARKETPLACE_ROLE_FA[role] }))}
            data-testid="market-role-name"
          />
          <SelectField
            label="اقدام"
            name="action"
            required
            options={[
              { value: 'GRANT', label: 'فعال‌سازی' },
              { value: 'SUSPEND', label: 'تعلیق' },
            ]}
            data-testid="market-role-action"
          />
        </div>
        <TextAreaField label="دلیل" name="reason" rows={2} required data-testid="market-role-reason" />
        <Button type="submit" disabled={pending} data-testid="save-marketplace-role">
          {pending ? 'در حال ثبت…' : 'ثبت'}
        </Button>
      </form>
    </Card>
  );
}
