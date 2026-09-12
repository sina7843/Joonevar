import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { serviceViews } from '../../../../src/services/service.ts';
import { servicePath } from '../../../../src/services/catalogue.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';

export const dynamic = 'force-dynamic';

const TITLE = 'خدمات همزیست';
const DESCRIPTION =
  'برگه ثبتی، شجره‌نامه، عضویت انجمن، ثبت کنل، مجوز جفت‌گیری، کارت توله و مراجعه به دامپزشک معتمد: هر خدمت با پیش‌نیاز، مراحل، مدارک و هزینه ثبت‌شده.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: TITLE, path: '/services' },
];

export function generateMetadata(): Metadata {
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/services' }, site());
}

/** The services of §18, each described from managed data (PROMPT-013). */
export default async function ServicesPage() {
  const views = await serviceViews(db());
  const { origin } = site();

  return (
    <div className="space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="max-w-2xl text-body-md text-text-secondary">
          هر خدمت را با پیش‌نیازها، مراحل، مدارک و هزینه ثبت‌شده‌اش بخوانید. همزیست نوبت نمی‌دهد و زمان انجام هیچ خدمتی را
          تضمین نمی‌کند.
        </p>
      </header>

      <ul className="grid gap-md sm:grid-cols-2" data-testid="service-list">
        {views.map(({ service, fee, feeFa }) => (
          <li key={service.slug}>
            <Link
              href={servicePath(service.slug)}
              className="flex h-full items-start gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg transition-colors hover:border-border-brand"
              data-testid={'service-card-' + service.slug}
            >
              <span className="flex size-[40px] shrink-0 items-center justify-center rounded-md bg-bg-brand-subtle text-text-brand">
                <Icon name="clipboardText" size="md" />
              </span>
              <span className="min-w-0 space-y-xs">
                <span className="block text-label-lg text-text-primary">{service.titleFa}</span>
                <span className="block text-body-sm text-text-secondary">{service.summaryFa}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
