import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { db } from '../../../../src/db/client.ts';
import { clientKeyOf, verifyDocument } from '../../../../src/verification/service.ts';
import { VerificationResult } from '../../../../src/verification/result.tsx';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Button } from '../../../../src/ui/button.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { SearchField } from '../../../../src/ui/search-field.tsx';

export const dynamic = 'force-dynamic';

const TITLE = 'استعلام اصالت اسناد';
const DESCRIPTION =
  'کد یا QR برگه ثبتی، شجره‌نامه و کارت توله را وارد کنید و وضعیت سند را ببینید. اطلاعات مالک نمایش داده نمی‌شود.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: TITLE, path: '/verify' },
];

export function generateMetadata(): Metadata {
  // The answer depends on a code in the query, so the page itself is not indexed.
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/verify', noindex: true }, site());
}

/** Verification — Requirements-Phase-2 §17 (PROMPT-014). */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const raw = (await searchParams).code;
  const code = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  const { origin } = site();
  const answer =
    code.trim() === ''
      ? null
      : await verifyDocument(db(), { code, clientKey: clientKeyOf((await headers()).get('x-forwarded-for')) });

  return (
    <div className="mx-auto max-w-[var(--container-reading)] space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs items={CRUMBS} origin={origin} />
        <PageHeader
          title={TITLE}
          meta={[
            'کد روی سند را بنویسید یا نشانی QR را اینجا بگذارید. استعلام فقط وجود و وضعیت سند را نشان می‌دهد؛ اطلاعات مالک هرگز نمایش داده نمی‌شود.',
          ]}
        />
      </div>

      <form method="get" action="/verify" role="search" className="hz-card flex flex-col gap-sm sm:flex-row" data-testid="verify-form">
        <div className="min-w-0 flex-1">
          <SearchField
            id="verify-code-input"
            name="code"
            label="کد سند"
            defaultValue={code}
            dir="ltr"
            placeholder="RS-XXXXXXXX"
            size="lg"
            data-testid="verify-code-input"
          />
        </div>
        <Button type="submit" size="lg" data-testid="verify-submit">
          استعلام
        </Button>
      </form>

      {answer === null ? (
        <EmptyState
          icon="shieldCheck"
          title="هنوز کدی وارد نشده است"
          description="کد برگه ثبتی با RS، شجره‌نامه با PD، کارت توله با PC و شناسه حیوان با PET آغاز می‌شود."
        />
      ) : (
        <VerificationResult answer={answer} />
      )}
    </div>
  );
}
