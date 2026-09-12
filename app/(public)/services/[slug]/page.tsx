import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { serviceView } from '../../../../src/services/service.ts';
import { servicePath } from '../../../../src/services/catalogue.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { faqLd } from '../../../../src/seo/structured-data.ts';
import { JsonLdScript } from '../../../../src/seo/json-ld.tsx';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

const load = cache((slug: string) => serviceView(db(), slug));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const view = await load((await params).slug);
  if (view === null) return {};
  return buildMetadata(
    { title: view.service.titleFa, description: view.service.summaryFa, path: servicePath(view.service.slug) },
    site(),
  );
}

/**
 * One service — Requirements-Phase-2 §18 (PROMPT-013).
 *
 * Definition, audience, prerequisites, steps, documents, the fee as it is
 * really recorded, questions and one call to action that goes to the Phase 1
 * route which performs the service. No appointment, no promised time and no
 * invented figure.
 */
export default async function ServicePage({ params }: Params) {
  const view = await load((await params).slug);
  if (view === null) notFound();

  const { service, fee, feeFa, noticeFa } = view;
  const { origin } = site();
  const path = servicePath(service.slug);

  return (
    <article className="mx-auto max-w-3xl space-y-xl" data-testid="service-page">
      <Breadcrumbs
        items={[
          { name: 'خانه', path: '/' },
          { name: 'خدمات همزیست', path: '/services' },
          { name: service.titleFa, path },
        ]}
        origin={origin}
      />
      {service.faq.length > 0 ? (
        <JsonLdScript
          data={faqLd({ path, questions: service.faq.map((entry) => ({ question: entry.question, answer: entry.answer })) }, origin)}
        />
      ) : null}

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{service.titleFa}</h1>
        <p className="text-body-md text-text-secondary">{service.summaryFa}</p>
      </header>

      <section aria-labelledby="service-definition-title">
        <h2 id="service-definition-title" className="text-h4">
          این خدمت چیست
        </h2>
        <p className="mt-md text-body-md">{service.definitionFa}</p>
        <p className="mt-md text-body-sm text-text-secondary">
          <span className="text-label-md text-text-primary">{'مخاطب: '}</span>
          {service.audienceFa}
        </p>
      </section>

      {/*
        No figure is printed on a public service page (DEC-0186). The fee still
        lives in managed settings and is shown where the payment actually
        happens; a marketing page is not where a tariff is announced.
      */}
      <section aria-labelledby="service-notice-title">
        <h2 id="service-notice-title" className="sr-only">
          توضیح هزینه
        </h2>
        {noticeFa ? (
          <p className="mt-sm text-body-sm text-text-secondary" data-testid="service-notice">
            {noticeFa}
          </p>
        ) : null}
        <p className="mt-sm text-caption text-text-secondary">
          هزینه‌ها از تنظیمات مدیریت‌شده خوانده می‌شوند و در زمان پرداخت روی همان پرونده قفل می‌شوند.
        </p>
      </section>

      <section aria-labelledby="service-prerequisites-title">
        <h2 id="service-prerequisites-title" className="text-h4">
          پیش‌نیازها
        </h2>
        <ul className="mt-md list-disc space-y-xs pr-lg text-body-md" data-testid="service-prerequisites">
          {service.prerequisitesFa.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="service-steps-title">
        <h2 id="service-steps-title" className="text-h4">
          مراحل
        </h2>
        <ol className="mt-md space-y-sm" data-testid="service-steps">
          {service.stepsFa.map((step, index) => (
            <li key={step} className="flex gap-md rounded-lg border border-border-subtle bg-bg-surface p-md">
              <span className="flex size-[28px] shrink-0 items-center justify-center rounded-full bg-action-primary-default text-label-md text-action-primary-on">
                {(index + 1).toLocaleString('fa-IR')}
              </span>
              <span className="text-body-md">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-sm text-caption text-text-secondary" data-testid="service-no-time">
          همزیست نوبت نمی‌دهد و زمان قطعی برای هیچ مرحله‌ای اعلام نمی‌کند.
        </p>
      </section>

      <section aria-labelledby="service-documents-title">
        <h2 id="service-documents-title" className="text-h4">
          مدارک
        </h2>
        <ul className="mt-md list-disc space-y-xs pr-lg text-body-md" data-testid="service-documents">
          {service.documentsFa.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {service.faq.length > 0 ? (
        <section aria-labelledby="service-faq-title">
          <h2 id="service-faq-title" className="text-h4">
            پرسش‌های پرتکرار
          </h2>
          <dl className="mt-md space-y-md" data-testid="service-faq">
            {service.faq.map((entry) => (
              <div key={entry.question} className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
                <dt className="text-label-lg">{entry.question}</dt>
                <dd className="mt-xs text-body-md text-text-secondary">{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section aria-labelledby="service-cta-title" className="rounded-lg bg-bg-brand-subtle p-lg">
        <h2 id="service-cta-title" className="text-h4">
          شروع این خدمت
        </h2>
        <p className="mt-xs text-body-sm text-text-secondary">
          این خدمت در پنل شما انجام می‌شود. اگر وارد نشده باشید، ابتدا وارد می‌شوید و بعد به همین مرحله برمی‌گردید.
        </p>
        <div className="mt-lg">
          <ButtonLink href={service.cta.href} data-testid="service-cta">
            {service.cta.label}
          </ButtonLink>
        </div>
      </section>
    </article>
  );
}
