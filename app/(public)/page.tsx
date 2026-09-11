import type { Metadata } from 'next';
import { ButtonLink } from '../../src/ui/button.tsx';
import { Icon } from '../../src/ui/icon.tsx';
import type { IconName } from '../../src/ui/icon-paths.ts';
import { JsonLdScript } from '../../src/seo/json-ld.tsx';
import { buildMetadata } from '../../src/seo/metadata.ts';
import { organizationLd, websiteLd } from '../../src/seo/structured-data.ts';
import { site, viewer } from '../../src/public/request.ts';

const TITLE = 'همزیست — ثبت و پیگیری رسمی سگ‌ها';
const DESCRIPTION =
  'ثبت هویت، میکروچیپ و برگه ثبتی، شجره‌نامه، کنل و مجوز جفت‌گیری سگ‌ها در یک سامانه فارسی، با تأیید دامپزشک معتمد و انجمن.';

export function generateMetadata(): Metadata {
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/' }, site());
}

/*
 * Home — Requirements-Phase-2 §5, the part that exists today (DEC-0149).
 *
 * The services are the Phase 1 services a person can actually start, described
 * the way the dashboard describes them. The rest of §5 — vet and centre search,
 * featured breeds, articles, associations and real statistics — arrives with
 * the prompts that build that data (003–013); an empty block or a made-up number
 * in its place would claim something the site cannot do yet.
 */
const SERVICES: ReadonlyArray<{ icon: IconName; title: string; body: string }> = [
  { icon: 'dog', title: 'ثبت حیوان', body: 'پرونده حیوان به نام مالکی ساخته می‌شود که هویتش تأیید شده است.' },
  {
    icon: 'stamp',
    title: 'برگه ثبتی و میکروچیپ',
    body: 'میکروچیپ و نمونه‌گیری نزد دامپزشک معتمد و صدور برگه ثبتی هر حیوان — یک مسیر.',
  },
  { icon: 'certificate', title: 'شجره‌نامه', body: 'با نمونه همان حیوان و برگه ثبتی صادرشده.' },
  {
    icon: 'shieldCheck',
    title: 'کنل و مجوز جفت‌گیری',
    body: 'ثبت کنل برای پرورش‌دهنده و مجوز جفت‌گیری برای دو حیوان شجره‌دار.',
  },
];

const STEPS: ReadonlyArray<{ title: string; body: string }> = [
  { title: 'ورود با شماره موبایل', body: 'با کد یک‌بارمصرف وارد می‌شوید؛ حساب تازه همان‌جا ساخته می‌شود.' },
  { title: 'تکمیل و احراز هویت', body: 'اطلاعات هویتی و تصویر کارت ملی را برای بررسی می‌فرستید.' },
  { title: 'ثبت حیوان و درخواست خدمت', body: 'از پنل خود حیوان را ثبت می‌کنید و هر خدمت را قدم‌به‌قدم پیگیری می‌کنید.' },
];

export default async function HomePage() {
  const actor = await viewer();
  const { origin } = site();
  const cta =
    actor === null ? { href: '/login', label: 'ورود / ثبت‌نام' } : { href: '/dashboard', label: 'رفتن به پنل من' };

  return (
    <div className="space-y-xl">
      <JsonLdScript data={organizationLd(origin)} />
      <JsonLdScript data={websiteLd(origin)} />

      <section aria-labelledby="home-title" className="rounded-lg bg-bg-brand-subtle px-lg py-xl md:px-xl">
        <h1 id="home-title" className="text-h3 text-text-primary md:text-h1">
          ثبت رسمی و پیگیری سگ‌ها، در یک‌جا
        </h1>
        <p className="mt-md max-w-2xl text-body-md text-text-secondary">
          هویت حیوان، برگه ثبتی، شجره‌نامه و مسیر جفت‌گیری را با تأیید دامپزشک معتمد و انجمن ثبت و دنبال کنید.
        </p>
        <div className="mt-xl flex flex-wrap gap-sm">
          <ButtonLink href={cta.href}>{cta.label}</ButtonLink>
          <ButtonLink tone="secondary" href="/about">
            درباره همزیست
          </ButtonLink>
        </div>
      </section>

      <section aria-labelledby="services-title">
        <h2 id="services-title" className="text-h4">
          آنچه امروز در همزیست انجام می‌شود
        </h2>
        <ul className="mt-lg grid gap-md sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((service) => (
            <li key={service.title} className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
              <span className="flex size-[40px] items-center justify-center rounded-md bg-bg-brand-subtle text-text-brand">
                <Icon name={service.icon} size="md" />
              </span>
              <h3 className="mt-md text-label-lg">{service.title}</h3>
              <p className="mt-xs text-body-sm text-text-secondary">{service.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="steps-title">
        <h2 id="steps-title" className="text-h4">
          روش کار
        </h2>
        <ol className="mt-lg grid gap-md md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg">
              <span className="flex size-[32px] shrink-0 items-center justify-center rounded-full bg-action-primary-default text-label-md text-action-primary-on">
                {(index + 1).toLocaleString('fa-IR')}
              </span>
              <div>
                <h3 className="text-label-lg">{step.title}</h3>
                <p className="mt-xs text-body-sm text-text-secondary">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
