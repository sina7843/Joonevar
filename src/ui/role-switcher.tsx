import type { ActorContextName } from '../authz/actor.ts';

/**
 * Role switcher — D10.
 *
 * The rail renders exactly the contexts the account actually holds; there are
 * no fixed slots and no inactive placeholder. Operational shells never appear
 * here (D11), because switchableContexts() only ever returns public contexts.
 *
 * Switching posts to the server, which re-checks the role before it changes
 * anything. Hiding a chip is presentation; the server is the gate.
 */
const LABEL: Record<ActorContextName, string> = {
  USER: 'کاربر',
  BREEDER: 'پرورش‌دهنده',
  TRUSTED_VET: 'دامپزشک معتمد',
  ASSOCIATION_OPERATOR: 'اپراتور انجمن',
  GENETICS_OPERATOR: 'اپراتور مرکز ژنتیک',
  SUPERADMIN: 'سوپرادمین',
  AUTHOR: 'نویسنده',
  CONTENT_ADMIN: 'ادمین محتوا',
  REVIEW_OPERATOR: 'اپراتور بررسی',
};

export function RoleSwitcher({
  contexts,
  active,
  returnTo,
}: {
  contexts: readonly ActorContextName[];
  active: ActorContextName;
  returnTo: string;
}) {
  // A single context is not a choice; showing a one-item switcher would imply
  // roles the account does not have.
  if (contexts.length < 2) return null;

  return (
    <nav aria-label="تغییر نقش" className="hz-rail flex gap-sm" data-testid="role-switcher">
      {contexts.map((context) => {
        const isActive = context === active;
        return (
          <form key={context} action="/api/context" method="post" className="shrink-0">
            <input type="hidden" name="context" value={context} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              aria-current={isActive ? 'true' : undefined}
              data-context={context}
              className={[
                'rounded-full border px-lg py-sm text-label-md whitespace-nowrap',
                'min-h-[var(--size-control-sm)]',
                isActive
                  ? 'border-border-brand bg-bg-surface text-text-brand'
                  : 'border-border-subtle bg-bg-subtle text-text-secondary',
              ].join(' ')}
            >
              {LABEL[context]}
            </button>
          </form>
        );
      })}
    </nav>
  );
}

export const CONTEXT_LABEL_FA = LABEL;
