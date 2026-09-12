import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { db } from '../../../../src/db/client.ts';
import { clientKeyOf, verifyDocument } from '../../../../src/verification/service.ts';
import { VerificationResult } from '../../../../src/verification/result.tsx';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';

export const dynamic = 'force-dynamic';

const TITLE = 'استعلام اصالت اسناد';

export function generateMetadata(): Metadata {
  return buildMetadata(
    { title: TITLE, description: 'نتیجه استعلام یک سند همزیست.', path: '/verify', noindex: true },
    site(),
  );
}

/**
 * The address a document's QR carries — §17 (PROMPT-014).
 *
 * Same answer as the form, so scanning and typing are two renderings of one
 * question rather than two features.
 */
export default async function VerifyByCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { origin } = site();
  const answer = await verifyDocument(db(), {
    code,
    clientKey: clientKeyOf((await headers()).get('x-forwarded-for')),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-xl">
      <Breadcrumbs
        items={[
          { name: 'خانه', path: '/' },
          { name: TITLE, path: '/verify' },
        ]}
        origin={origin}
      />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="text-body-md text-text-secondary">نتیجه استعلام کدی که با QR باز شده است.</p>
      </header>

      <VerificationResult answer={answer} />

      <p className="text-body-sm">
        <Link href="/verify" className="text-text-brand underline underline-offset-4" data-testid="verify-another">
          استعلام کد دیگر
        </Link>
      </p>
    </div>
  );
}
