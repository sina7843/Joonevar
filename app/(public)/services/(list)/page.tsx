import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { serviceViews } from '../../../../src/services/service.ts';
import { servicePath } from '../../../../src/services/catalogue.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';
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
      <div className="space-y-md">
        <Breadcrumbs items={CRUMBS} origin={origin} />
        <PageHeader
          title={TITLE}
          meta={[
            'هر خدمت را با پیش‌نیازها، مراحل، مدارک و هزینه ثبت‌شده‌اش بخوانید. همزیست نوبت نمی‌دهد و زمان انجام هیچ خدمتی را تضمین نمی‌کند.',
          ]}
        />
      </div>

      <ul className="grid gap-s20 md:grid-cols-2 lg:grid-cols-3" data-testid="service-list">
        {views.map(({ service }) => (
          <li key={service.slug}>
            <Link
              href={servicePath(service.slug)}
              className="hz-card hz-card--interactive hz-service-card h-full"
              data-testid={'service-card-' + service.slug}
            >
              {/* No tariff on the public list (DEC-0186): the fee appears where the payment happens. */}
              <div className="hz-service">
                <h2 className="hz-service__title">
                  <Icon name="clipboardText" size="sm" className="text-text-brand" />
                  {service.titleFa}
                  <Icon name="arrowRight" size="sm" mirror />
                </h2>
                <p className="hz-service__desc">{service.summaryFa}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
