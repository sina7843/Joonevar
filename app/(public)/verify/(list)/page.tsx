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
    <div className="mx-auto max-w-3xl space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="text-body-md text-text-secondary">
          کد روی سند را بنویسید یا نشانی QR را اینجا بگذارید. استعلام فقط وجود و وضعیت سند را نشان می‌دهد؛ اطلاعات مالک
          هرگز نمایش داده نمی‌شود.
        </p>
      </header>

      <form method="get" action="/verify" role="search" className="space-y-sm" data-testid="verify-form">
        <label htmlFor="verify-code-input" className="block text-label-md">
          کد سند
        </label>
        <input
          id="verify-code-input"
          name="code"
          type="search"
          defaultValue={code}
          dir="ltr"
          placeholder="RS-XXXXXXXX"
          className="min-h-[var(--size-control-md)] w-full rounded-md border border-border-subtle bg-bg-surface px-md font-mono text-body-sm text-text-primary focus:border-border-brand"
          data-testid="verify-code-input"
        />
        <Button type="submit" data-testid="verify-submit">
          استعلام
        </Button>
      </form>

      {answer === null ? (
        <EmptyState
          title="هنوز کدی وارد نشده است"
          description="کد برگه ثبتی با RS، شجره‌نامه با PD، کارت توله با PC و شناسه حیوان با PET آغاز می‌شود."
        />
      ) : (
        <VerificationResult answer={answer} />
      )}
    </div>
  );
}
