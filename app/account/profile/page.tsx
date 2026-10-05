import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { db } from '../../../src/db/client.ts';
import { eq } from 'drizzle-orm';
import { accounts } from '../../../src/db/schema/core.ts';
import { findProfile, findResidence } from '../../../src/identity/account.ts';
import { findCase } from '../../../src/identity/kyc.ts';
import { mapApiKey } from '../../../src/adapters/integration-settings.ts';
import { IdentityForm, ResidenceForm } from '../profile-forms.tsx';
import { signOutAction } from '../../../src/identity/sign-out-action.ts';
import { Button } from '../../../src/ui/button.tsx';

export const dynamic = 'force-dynamic';

/**
 * Profile editing (§6.4) — P11 settings in PublicShell: account rows (mobile,
 * KYC) with their one action each, then the identity and residence groups.
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
    <PublicShell
      actor={actor}
      title="پروفایل"
      pathname="/account/profile"
      header={
        <PageHeader
          title="پروفایل"
          back={{ href: '/dashboard' }}
          meta={['حساب، احراز هویت و عضویت سه چیز جدا هستند؛ هر تغییر همین‌جا ذخیره می‌شود.']}
        />
      }
    >
      <Card>
        <SectionHeader size="sm" title="حساب" />
        <div className="mt-sm">
          <div className="hz-setting max-md:grid-cols-1">
            <div className="hz-setting__label">
              <span className="hz-setting__name">شماره موبایل حساب</span>
              <span className="hz-setting__hint">کد ورود به همین شماره فرستاده می‌شود.</span>
            </div>
            <div className="hz-setting__end flex-wrap max-md:justify-start">
              <bdi className="hz-setting__value" dir="ltr" data-testid="account-mobile">
                {account?.mobile}
              </bdi>
              <Link href="/account/profile/mobile" className="hz-btn hz-btn--ghost hz-btn--sm">
                <Icon name="pencilSimple" size="xs" />
                تغییر شماره موبایل
              </Link>
            </div>
          </div>
          <div className="hz-setting max-md:grid-cols-1">
            <div className="hz-setting__label">
              <span className="hz-setting__name">احراز هویت</span>
              <span className="hz-setting__hint">احراز هویت با عضویت انجمن یکی نیست و هیچ‌کدام دیگری را فعال نمی‌کند.</span>
            </div>
            <div className="hz-setting__end flex-wrap max-md:justify-start">
              <StatusBadge tone={kycApproved ? 'success' : kyc ? 'info' : 'neutral'}>
                {kycApproved ? 'احراز هویت تأییدشده' : kyc ? 'احراز هویت در جریان' : 'احراز هویت انجام نشده'}
              </StatusBadge>
              {kycApproved ? null : (
                <Link href="/account/kyc" className="hz-btn hz-btn--ghost hz-btn--sm">
                  {kyc ? 'پیگیری' : 'شروع'}
                  <span className="hz-visually-hidden"> احراز هویت</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader size="sm" title="اطلاعات هویتی" />
        <div className="mt-lg">
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
        </div>
      </Card>

      <Card>
        <SectionHeader size="sm" title="سکونت" />
        <div className="mt-lg">
          <ResidenceForm
            mapAvailable={mapKeyConfigured}
            values={{
              province: residence?.province ?? '',
              city: residence?.city ?? '',
              address: residence?.address ?? '',
              postalCode: residence?.postalCode ?? '',
            }}
          />
        </div>
      </Card>

      <Card>
        <SectionHeader size="sm" title="نشست" />
        <form action={signOutAction} className="mt-md">
          <Button tone="destructive-outline" type="submit" iconStart="signOut" mirrorIcon data-testid="sign-out">
            خروج از حساب
          </Button>
        </form>
      </Card>
    </PublicShell>
  );
}
