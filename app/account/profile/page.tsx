import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { eq } from 'drizzle-orm';
import { accounts } from '../../../src/db/schema/core.ts';
import { findProfile, findResidence } from '../../../src/identity/account.ts';
import { findCase } from '../../../src/identity/kyc.ts';
import { mapApiKey } from '../../../src/adapters/integration-settings.ts';
import { IdentityForm, ResidenceForm } from '../profile-forms.tsx';
import { signOutAction } from '../../login/actions.ts';
import { Button } from '../../../src/ui/button.tsx';

export const dynamic = 'force-dynamic';

/**
 * Profile editing (§6.4).
 *
 * Account, KYC and membership stay visibly separate here: the KYC badge reports
 * the review state and never implies membership or a role.
 */
export default async function ProfilePage() {
  const guard = await guardRoute('/account/profile');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const profile = await findProfile(db(), actor.accountId);
  const residence = await findResidence(db(), actor.accountId);
  // The map is shown only when a key is really configured; an empty address is
  // never a blocker either way (§6.2).
  const { apiKey: mapKey } = await mapApiKey(db());
  const mapKeyConfigured = mapKey !== null;
  const kyc = await findCase(db(), actor.accountId);
  const [account] = await db().select({ mobile: accounts.mobile }).from(accounts).where(eq(accounts.id, actor.accountId));

  const kycApproved = kyc?.status === 'APPROVED';

  return (
    <PublicShell actor={actor} title="پروفایل" pathname="/account/profile">
      <div className="space-y-xl">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div>
              <h2 className="text-label-lg">شماره موبایل حساب</h2>
              <p className="mt-sm">
                <bdi className="hz-ltr font-mono" data-testid="account-mobile">{account?.mobile}</bdi>
              </p>
            </div>
            <StatusBadge tone={kycApproved ? 'success' : kyc ? 'info' : 'neutral'}>
              {kycApproved ? 'احراز هویت تأییدشده' : kyc ? 'احراز هویت در جریان' : 'احراز هویت انجام نشده'}
            </StatusBadge>
          </div>
          <p className="mt-md text-caption text-text-secondary">
            <Link href="/account/profile/mobile" className="text-text-brand underline underline-offset-4">
              تغییر شماره موبایل
            </Link>
          </p>
        </Card>

        <section className="space-y-md">
          <h2 className="text-h4">اطلاعات هویتی</h2>
          <Card>
            <IdentityForm
              values={{
                firstName: profile?.firstName ?? '',
                lastName: profile?.lastName ?? '',
                nationalId: profile?.nationalId ?? '',
                birthDate: profile?.birthDate ?? '',
                displayName: profile?.displayName ?? '',
                displayNameVisible: profile?.displayNameVisible ?? false,
              }}
              nationalIdLocked={kycApproved}
              mode="edit"
            />
          </Card>
        </section>

        <section className="space-y-md">
          <h2 className="text-h4">سکونت</h2>
          <Card>
            <ResidenceForm
              mapAvailable={mapKeyConfigured}
              values={{
                province: residence?.province ?? '',
                city: residence?.city ?? '',
                address: residence?.address ?? '',
                postalCode: residence?.postalCode ?? '',
              }}
            />
          </Card>
        </section>
        <section className="space-y-md">
          <h2 className="text-h4">نشست</h2>
          <Card>
            <form action={signOutAction}>
              <Button tone="secondary" type="submit" block data-testid="sign-out">
                خروج از حساب
              </Button>
            </form>
          </Card>
        </section>
      </div>
    </PublicShell>
  );
}
